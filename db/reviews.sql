-- AI reviews of simulator contracts, cached for one day per market so each market costs one model call a day.
-- Run after trades.sql: node scripts/db.js db/reviews.sql (safe to re-run).

create table if not exists ai_reviews (
  platform    text not null check (platform in ('kalshi', 'polymarket')),
  market_id   text not null,
  day         date not null default current_date,   -- UTC day the review belongs to
  review      jsonb not null,
  model       text not null,
  created_at  timestamptz not null default now(),
  primary key (platform, market_id, day)
);
alter table ai_reviews enable row level security;

-- Today's review of a market for a signed-in player: { review, created_at } or { none: true }; null when signed out.
create or replace function review_get(p_token_hash text, p_platform text, p_market_id text) returns jsonb
language sql stable set search_path = public as $$
  select case when session_user_id(p_token_hash) is null then null else coalesce(
    (select jsonb_build_object('review', r.review, 'created_at', r.created_at) from ai_reviews r
     where r.platform = p_platform and r.market_id = p_market_id and r.day = (now() at time zone 'utc')::date),
    '{"none": true}'::jsonb) end
$$;

-- Stores today's review (first writer wins if two players open the same market at once).
create or replace function review_put(p_platform text, p_market_id text, p_review jsonb, p_model text) returns jsonb
language sql set search_path = public as $$
  insert into ai_reviews (platform, market_id, day, review, model)
  values (p_platform, p_market_id, (now() at time zone 'utc')::date, p_review, p_model)
  on conflict (platform, market_id, day) do update set review = ai_reviews.review
  returning jsonb_build_object('review', review, 'created_at', created_at)
$$;

revoke execute on function review_get(text, text, text)        from public, anon, authenticated;
revoke execute on function review_put(text, text, jsonb, text) from public, anon, authenticated;
grant execute on function review_get(text, text, text), review_put(text, text, jsonb, text) to service_role;
