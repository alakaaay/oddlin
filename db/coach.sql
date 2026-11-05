-- AI Coach: a daily question limit per player and one call that returns everything the coach may know about the player.
-- Apply: node scripts/db.js db/coach.sql   (after db/auth.sql and db/trades.sql)

create table if not exists coach_usage (
  user_id  uuid not null references users (id) on delete cascade,
  day      date not null,
  n        int  not null default 0,
  primary key (user_id, day)
);
alter table coach_usage enable row level security;

-- Counts one question and returns the player's context for the coach:
--   null                       session not valid
--   {"limited": true}          daily limit reached (nothing counted)
--   {left, name, xp, done, streak, trades}   trades = the latest 30, newest first
create or replace function coach_context(p_token_hash text, p_limit int) returns jsonb
language plpgsql set search_path = public as $$
declare v_user uuid := session_user_id(p_token_hash); v_day date := (now() at time zone 'utc')::date; v_n int; v_data jsonb;
begin
  if v_user is null then return null; end if;
  insert into coach_usage (user_id, day, n) values (v_user, v_day, 0) on conflict (user_id, day) do nothing;
  update coach_usage set n = n + 1 where user_id = v_user and day = v_day and n < p_limit returning n into v_n;
  if v_n is null then return jsonb_build_object('limited', true); end if;
  select coalesce(data, '{}'::jsonb) into v_data from user_progress where user_id = v_user;
  v_data := coalesce(v_data, '{}'::jsonb);
  return jsonb_build_object(
    'left', p_limit - v_n,
    'name', (select coalesce(nullif(name, ''), 'Player') from users where id = v_user),
    'xp', coalesce((v_data->>'xp')::int, 0),
    'done', coalesce(v_data->'done', '[]'::jsonb),
    'streak', coalesce((v_data->>'streak')::int, 0),
    'trades', coalesce((select jsonb_agg(trade_json(t) order by t.opened_at desc)
                        from (select * from trades where user_id = v_user order by opened_at desc limit 30) t), '[]'::jsonb));
end $$;

revoke execute on function coach_context(text, int) from public, anon, authenticated;
grant  execute on function coach_context(text, int) to service_role;
