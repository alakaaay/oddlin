-- Subscriptions and charges. Beta: no payment provider is connected, so a charge is a record of what the plan would bill,
-- not money taken. Products and prices live in lib/billing.js and are passed in.
-- Renewals have no cron: billing_get bills every period that has passed since the last look (lazy, like trade settlement).
-- Apply: node scripts/db.js db/billing.sql   (after db/auth.sql and db/trades.sql; replaces the coach functions from db/coach.sql)

create table if not exists subscriptions (
  id           bigserial primary key,
  user_id      uuid not null references users (id) on delete cascade,
  product      text not null check (product in ('oddlin_w1', 'oddlin_w4', 'oddlin_w12', 'coach_plus')),
  name         text not null,
  price        numeric(10, 2) not null,           -- recurring price
  period       interval not null,
  status       text not null default 'active' check (status in ('active', 'canceled', 'ended')),
  started_at   timestamptz not null default now(),
  renews_at    timestamptz not null,              -- next charge; for a canceled plan, the end of access
  canceled_at  timestamptz
);
create index if not exists subscriptions_user_idx on subscriptions (user_id);
alter table subscriptions enable row level security;

create table if not exists charges (
  id               bigserial primary key,
  user_id          uuid not null references users (id) on delete cascade,
  subscription_id  bigint references subscriptions (id) on delete set null,
  description      text not null,
  amount           numeric(10, 2) not null,
  kind             text not null check (kind in ('first', 'renewal')),
  created_at       timestamptz not null default now()
);
create index if not exists charges_user_idx on charges (user_id, created_at desc);
alter table charges enable row level security;

create or replace function sub_json(s subscriptions) returns jsonb
language sql immutable as $$
  select jsonb_build_object('id', s.id, 'product', s.product, 'name', s.name, 'price', s.price,
    'period_days', extract(day from s.period)::int, 'period_months', extract(month from s.period)::int,
    'status', s.status, 'started_at', s.started_at, 'renews_at', s.renews_at, 'canceled_at', s.canceled_at)
$$;

-- Starts a subscription with its first charge. One active main plan per user (oddlin_*), one coach_plus.
-- Returns the subscription, or the one already running for that kind of product.
create or replace function sub_start(p_user uuid, p_product text, p_name text, p_price numeric, p_first numeric,
  p_period interval, p_at timestamptz default now()) returns jsonb
language plpgsql set search_path = public as $$
declare v subscriptions;
begin
  select * into v from subscriptions
  where user_id = p_user and status <> 'ended'
    and (product = p_product or (p_product like 'oddlin_%' and product like 'oddlin_%'))
  order by id desc limit 1;
  if found then return sub_json(v); end if;
  insert into subscriptions (user_id, product, name, price, period, started_at, renews_at)
  values (p_user, p_product, p_name, p_price, p_period, p_at, p_at + p_period) returning * into v;
  insert into charges (user_id, subscription_id, description, amount, kind, created_at)
  values (p_user, v.id, p_name || case when p_first < p_price then ' · first payment, 50% off' else '' end, p_first, 'first', p_at);
  return sub_json(v);
end $$;

-- Main plan bought on the quiz paywall or in the app sign-up (by email: the account may not be signed in yet)
create or replace function billing_start_plan(p_email text, p_product text, p_name text, p_price numeric, p_first numeric, p_period interval)
returns jsonb
language plpgsql set search_path = public as $$
declare v_user uuid;
begin
  select id into v_user from users where email = lower(p_email);
  if v_user is null then return null; end if;
  return sub_start(v_user, p_product, p_name, p_price, p_first, p_period);
end $$;

-- Bills every renewal that came due, ends canceled plans whose access ran out. At most 60 renewals per plan per call.
create or replace function billing_sync(p_user uuid) returns void
language plpgsql set search_path = public as $$
declare v subscriptions; n int;
begin
  update subscriptions set status = 'ended' where user_id = p_user and status = 'canceled' and renews_at <= now();
  for v in select * from subscriptions where user_id = p_user and status = 'active' and renews_at <= now() for update loop
    n := 0;
    while v.renews_at <= now() and n < 60 loop
      insert into charges (user_id, subscription_id, description, amount, kind, created_at)
      values (p_user, v.id, v.name || ' · renewal', v.price, 'renewal', v.renews_at);
      v.renews_at := v.renews_at + v.period; n := n + 1;
    end loop;
    update subscriptions set renews_at = v.renews_at where id = v.id;
  end loop;
end $$;

-- Everything for the billing screen: subscriptions (newest first) and the charge history
create or replace function billing_get(p_token_hash text) returns jsonb
language plpgsql set search_path = public as $$
declare v_user uuid := session_user_id(p_token_hash);
begin
  if v_user is null then return null; end if;
  perform billing_sync(v_user);
  return jsonb_build_object(
    'subscriptions', coalesce((select jsonb_agg(sub_json(s) order by (s.status = 'ended'), s.id desc) from subscriptions s where s.user_id = v_user), '[]'::jsonb),
    'charges', coalesce((select jsonb_agg(jsonb_build_object('id', c.id, 'description', c.description, 'amount', c.amount,
                 'kind', c.kind, 'created_at', c.created_at) order by c.created_at desc, c.id desc)
               from (select * from charges where user_id = v_user order by created_at desc, id desc limit 200) c), '[]'::jsonb));
end $$;

-- Coach Plus from the app: starts it, or resumes it if it was canceled and still has access
create or replace function billing_buy(p_token_hash text, p_product text, p_name text, p_price numeric, p_period interval) returns jsonb
language plpgsql set search_path = public as $$
declare v_user uuid := session_user_id(p_token_hash); v subscriptions;
begin
  if v_user is null then return null; end if;
  perform billing_sync(v_user);
  update subscriptions set status = 'active', canceled_at = null
  where user_id = v_user and product = p_product and status = 'canceled' returning * into v;
  if found then return sub_json(v); end if;
  return sub_start(v_user, p_product, p_name, p_price, p_price, p_period);
end $$;

-- Cancel: no more charges, access until renews_at. Resume: undo a cancel before access runs out.
create or replace function billing_cancel(p_token_hash text, p_id bigint) returns jsonb
language plpgsql set search_path = public as $$
declare v_user uuid := session_user_id(p_token_hash); v subscriptions;
begin
  if v_user is null then return null; end if;
  perform billing_sync(v_user);
  update subscriptions set status = 'canceled', canceled_at = now()
  where id = p_id and user_id = v_user and status = 'active' returning * into v;
  return case when found then sub_json(v) else jsonb_build_object('error', 'not_active') end;
end $$;

create or replace function billing_resume(p_token_hash text, p_id bigint) returns jsonb
language plpgsql set search_path = public as $$
declare v_user uuid := session_user_id(p_token_hash); v subscriptions;
begin
  if v_user is null then return null; end if;
  perform billing_sync(v_user);
  update subscriptions set status = 'active', canceled_at = null
  where id = p_id and user_id = v_user and status = 'canceled' returning * into v;
  return case when found then sub_json(v) else jsonb_build_object('error', 'not_canceled') end;
end $$;

-- ── AI Coach limit: base questions a day, plus p_extra while Coach Plus is active or canceled with access left ──
create or replace function coach_plus(p_user uuid) returns boolean
language sql stable set search_path = public as $$
  select exists (select 1 from subscriptions where user_id = p_user and product = 'coach_plus'
                 and status in ('active', 'canceled') and renews_at > now())
$$;

drop function if exists coach_context(text, int);
drop function if exists coach_left(text, int);

create or replace function coach_context(p_token_hash text, p_base int, p_extra int) returns jsonb
language plpgsql set search_path = public as $$
declare v_user uuid := session_user_id(p_token_hash); v_day date := (now() at time zone 'utc')::date; v_n int; v_data jsonb; v_limit int;
begin
  if v_user is null then return null; end if;
  v_limit := p_base + case when coach_plus(v_user) then p_extra else 0 end;
  insert into coach_usage (user_id, day, n) values (v_user, v_day, 0) on conflict (user_id, day) do nothing;
  update coach_usage set n = n + 1 where user_id = v_user and day = v_day and n < v_limit returning n into v_n;
  if v_n is null then return jsonb_build_object('limited', true, 'limit', v_limit, 'plus', coach_plus(v_user)); end if;
  select coalesce(data, '{}'::jsonb) into v_data from user_progress where user_id = v_user;
  v_data := coalesce(v_data, '{}'::jsonb);
  return jsonb_build_object(
    'left', v_limit - v_n, 'limit', v_limit, 'plus', coach_plus(v_user),
    'name', (select coalesce(nullif(name, ''), 'Player') from users where id = v_user),
    'xp', coalesce((v_data->>'xp')::int, 0),
    'done', coalesce(v_data->'done', '[]'::jsonb),
    'streak', coalesce((v_data->>'streak')::int, 0),
    'trades', coalesce((select jsonb_agg(trade_json(t) order by t.opened_at desc)
                        from (select * from trades where user_id = v_user order by opened_at desc limit 30) t), '[]'::jsonb));
end $$;

create or replace function coach_left(p_token_hash text, p_base int, p_extra int) returns jsonb
language sql stable set search_path = public as $$
  select jsonb_build_object('left', greatest(l.lim - coalesce((select n from coach_usage where user_id = s.user_id and day = (now() at time zone 'utc')::date), 0), 0),
                            'limit', l.lim, 'plus', coach_plus(s.user_id))
  from (select session_user_id(p_token_hash) as user_id) s
  cross join lateral (select p_base + case when coach_plus(s.user_id) then p_extra else 0 end as lim) l
  where s.user_id is not null
$$;

revoke execute on function sub_json(subscriptions)                                                   from public, anon, authenticated;
revoke execute on function sub_start(uuid, text, text, numeric, numeric, interval, timestamptz)        from public, anon, authenticated;
revoke execute on function billing_start_plan(text, text, text, numeric, numeric, interval)           from public, anon, authenticated;
revoke execute on function billing_sync(uuid)                                                         from public, anon, authenticated;
revoke execute on function billing_get(text)                                                          from public, anon, authenticated;
revoke execute on function billing_buy(text, text, text, numeric, interval)                           from public, anon, authenticated;
revoke execute on function billing_cancel(text, bigint)                                               from public, anon, authenticated;
revoke execute on function billing_resume(text, bigint)                                               from public, anon, authenticated;
revoke execute on function coach_plus(uuid)                                                           from public, anon, authenticated;
revoke execute on function coach_context(text, int, int)                                              from public, anon, authenticated;
revoke execute on function coach_left(text, int, int)                                                 from public, anon, authenticated;
grant execute on function sub_json(subscriptions), sub_start(uuid, text, text, numeric, numeric, interval, timestamptz),
  billing_start_plan(text, text, text, numeric, numeric, interval), billing_sync(uuid), billing_get(text),
  billing_buy(text, text, text, numeric, interval), billing_cancel(text, bigint), billing_resume(text, bigint),
  coach_plus(uuid), coach_context(text, int, int), coach_left(text, int, int) to service_role;

-- Backfill: accounts created before billing get their plan as a subscription from the day they signed up
-- (first payment assumed at the 50% promo, which the paywall shows first).
select sub_start(u.id, u.plan,
  case u.plan when 'oddlin_w1' then '1-week plan' when 'oddlin_w12' then '12-week plan' else '4-week plan' end,
  case u.plan when 'oddlin_w1' then 13 when 'oddlin_w12' then 69 else 39 end,
  case u.plan when 'oddlin_w1' then 6.50 when 'oddlin_w12' then 34.50 else 19.50 end,
  case u.plan when 'oddlin_w1' then interval '7 days' when 'oddlin_w12' then interval '84 days' else interval '28 days' end,
  u.created_at)
from users u
where u.plan in ('oddlin_w1', 'oddlin_w4', 'oddlin_w12') and u.email not like '%@oddlin.test' and not exists (select 1 from subscriptions s where s.user_id = u.id);

-- Compatibility: the coach before the billing release called coach_context(token, limit). Keeps an older deploy working
-- while the database is ahead of it; safe to drop once every deploy uses (token, base, extra).
create or replace function coach_context(p_token_hash text, p_limit int) returns jsonb
language sql set search_path = public as $$ select coach_context(p_token_hash, p_limit, 10) $$;
revoke execute on function coach_context(text, int) from public, anon, authenticated;
grant  execute on function coach_context(text, int) to service_role;
