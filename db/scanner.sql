-- AI Scanner: a daily edition of up to 10 AI-picked trades per platform, the same for everyone. Users reveal them in rank order:
-- 1 a day free, 5 with Scanner Pro, 10 with Scanner Max (subscriptions scanner_5 / scanner_10).
-- Apply: node scripts/db.js db/scanner.sql   (after db/billing.sql)

alter table subscriptions drop constraint if exists subscriptions_product_check;
alter table subscriptions add constraint subscriptions_product_check
  check (product in ('oddlin_w1', 'oddlin_w4', 'oddlin_w12', 'coach_plus', 'scanner_5', 'scanner_10'));

create table if not exists scanner_signals (
  id          bigserial primary key,
  user_id     uuid not null references users (id) on delete cascade,
  day         date not null default (now() at time zone 'utc')::date,
  platform    text not null check (platform in ('kalshi', 'polymarket')),
  market_id   text not null,
  signal      jsonb not null,              -- title, side, price, ai_yes, edge, headline, reasons, risk, closes …
  created_at  timestamptz not null default now()
);
create index if not exists scanner_signals_user_idx on scanner_signals (user_id, day);
alter table scanner_signals enable row level security;

-- Signals a day for a user: the best active (or canceled, still paid) scanner plan, else the free one
create or replace function scanner_limit(p_user uuid, p_free int) returns int
language sql stable set search_path = public as $$
  select greatest(p_free, coalesce(max(case product when 'scanner_10' then 10 when 'scanner_5' then 5 end), 0))
  from subscriptions where user_id = p_user and product like 'scanner_%' and status in ('active', 'canceled') and renews_at > now()
$$;

-- Today's limit, what's left, the plan, today's signals and the 30-day history (newest first); null if signed out
create or replace function scanner_status(p_token_hash text, p_free int) returns jsonb
language plpgsql stable set search_path = public as $$
declare v_user uuid := session_user_id(p_token_hash); v_day date := (now() at time zone 'utc')::date; v_lim int; v_n int;
begin
  if v_user is null then return null; end if;
  v_lim := scanner_limit(v_user, p_free);
  select count(*) into v_n from scanner_signals where user_id = v_user and day = v_day;
  return jsonb_build_object('limit', v_lim, 'left', greatest(v_lim - v_n, 0),
    'tier', (select product from subscriptions where user_id = v_user and product like 'scanner_%' and status in ('active', 'canceled') and renews_at > now() order by price desc limit 1),
    'today', coalesce((select jsonb_agg(s.signal || jsonb_build_object('id', s.id, 'created_at', s.created_at) order by s.id desc)
                       from scanner_signals s where s.user_id = v_user and s.day = v_day), '[]'::jsonb),
    -- every pick the user opened in the last 30 days, newest first (the list on the scanner screen)
    'history', coalesce((select jsonb_agg(h.signal || jsonb_build_object('id', h.id, 'created_at', h.created_at, 'day', h.day) order by h.day desc, h.id desc)
                         from (select * from scanner_signals where user_id = v_user and day > v_day - 30 order by day desc, id desc limit 100) h), '[]'::jsonb));
end $$;

-- Buying a scanner plan replaces the other scanner plan (upgrade or downgrade): the old one ends now
create or replace function billing_buy(p_token_hash text, p_product text, p_name text, p_price numeric, p_period interval) returns jsonb
language plpgsql set search_path = public as $$
declare v_user uuid := session_user_id(p_token_hash); v subscriptions;
begin
  if v_user is null then return null; end if;
  perform billing_sync(v_user);
  update subscriptions set status = 'active', canceled_at = null
  where user_id = v_user and product = p_product and status = 'canceled' returning * into v;
  if found then return sub_json(v); end if;
  if p_product like 'scanner_%' then
    update subscriptions set status = 'ended', canceled_at = coalesce(canceled_at, now()), renews_at = now()
    where user_id = v_user and product like 'scanner_%' and product <> p_product and status <> 'ended';
  end if;
  return sub_start(v_user, p_product, p_name, p_price, p_price, p_period);
end $$;

revoke execute on function scanner_limit(uuid, int)                         from public, anon, authenticated;
revoke execute on function scanner_status(text, int)                        from public, anon, authenticated;
revoke execute on function billing_buy(text, text, text, numeric, interval) from public, anon, authenticated;
grant execute on function scanner_limit(uuid, int), scanner_status(text, int),
  billing_buy(text, text, text, numeric, interval) to service_role;

-- ── Daily edition: the same ranked picks for everyone (impersonal, published once a day per platform) ──
-- Users reveal picks in rank order; their plan only sets how many of today's picks they can see.
create table if not exists scanner_editions (
  day         date not null default (now() at time zone 'utc')::date,
  platform    text not null check (platform in ('kalshi', 'polymarket')),
  picks       jsonb not null,               -- ranked array, best first, up to 10
  model       text not null,
  created_at  timestamptz not null default now(),
  primary key (day, platform)
);
alter table scanner_editions enable row level security;

alter table scanner_signals add column if not exists rank int;
create unique index if not exists scanner_signals_rank_idx on scanner_signals (user_id, day, platform, rank) where rank is not null;

-- Today's edition for a platform, or null if nobody opened it yet today
create or replace function scanner_edition_get(p_platform text) returns jsonb
language sql stable set search_path = public as $$
  select jsonb_build_object('picks', picks, 'created_at', created_at) from scanner_editions
  where day = (now() at time zone 'utc')::date and platform = p_platform
$$;

-- Publishes today's edition; if another request published it first, that one wins and is returned
create or replace function scanner_edition_put(p_platform text, p_picks jsonb, p_model text) returns jsonb
language plpgsql set search_path = public as $$
begin
  insert into scanner_editions (platform, picks, model) values (p_platform, p_picks, p_model) on conflict (day, platform) do nothing;
  return scanner_edition_get(p_platform);
end $$;

drop function if exists scanner_save(text, int, text, text, jsonb);
-- Reveals pick number p_rank of today's edition to the user, if they have one left today (same pick twice is a no-op)
create or replace function scanner_save(p_token_hash text, p_free int, p_platform text, p_rank int, p_market_id text, p_signal jsonb) returns jsonb
language plpgsql set search_path = public as $$
declare v_user uuid := session_user_id(p_token_hash); v_day date := (now() at time zone 'utc')::date; v_n int; v scanner_signals;
begin
  if v_user is null then return null; end if;
  perform pg_advisory_xact_lock(hashtext('scanner:' || v_user::text));
  select * into v from scanner_signals where user_id = v_user and day = v_day and platform = p_platform and rank = p_rank;
  if found then return v.signal || jsonb_build_object('id', v.id, 'created_at', v.created_at); end if;
  select count(*) into v_n from scanner_signals where user_id = v_user and day = v_day;
  if v_n >= scanner_limit(v_user, p_free) then return jsonb_build_object('limited', true); end if;
  insert into scanner_signals (user_id, platform, market_id, signal, rank) values (v_user, p_platform, p_market_id, p_signal, p_rank) returning * into v;
  return v.signal || jsonb_build_object('id', v.id, 'created_at', v.created_at);
end $$;

revoke execute on function scanner_edition_get(text)                              from public, anon, authenticated;
revoke execute on function scanner_edition_put(text, jsonb, text)                 from public, anon, authenticated;
revoke execute on function scanner_save(text, int, text, int, text, jsonb)        from public, anon, authenticated;
grant execute on function scanner_edition_get(text), scanner_edition_put(text, jsonb, text),
  scanner_save(text, int, text, int, text, jsonb) to service_role;
