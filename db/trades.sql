-- Simulator trades on live Kalshi and Polymarket markets, with play money.
-- Run after auth.sql: node scripts/db.js db/trades.sql (safe to re-run).
--
-- The server locks the price from the live market when a trade opens or sells, so the browser can't pick its own price.
-- Coins stay in the player's progress document: the app adds the payout once a closed trade comes back with
-- credited = false, then marks it credited (trade_ack).

create table if not exists trades (
  id           bigint generated always as identity primary key,
  user_id      uuid not null references users (id) on delete cascade,
  platform     text not null check (platform in ('kalshi', 'polymarket')),
  market_id    text not null,                       -- Kalshi market ticker or Polymarket market id
  title        text not null,                       -- question shown to the player
  side         text not null check (side in ('yes', 'no')),
  shares       int  not null check (shares > 0),
  price        numeric(6, 4) not null check (price > 0 and price < 1),   -- paid per contract, in dollars
  est          int check (est between 1 and 99),    -- player's own odds for YES, in percent
  status       text not null default 'open' check (status in ('open', 'sold', 'won', 'lost')),
  exit_price   numeric(6, 4),                       -- sell price, or 1 / 0 at settlement
  outcome      boolean,                             -- true when the event happened (YES won)
  credited     boolean not null default false,      -- payout added to the player's coins
  opened_at    timestamptz not null default now(),
  closed_at    timestamptz
);
create index if not exists trades_user_idx on trades (user_id, opened_at desc);
create index if not exists trades_open_idx on trades (status) where status = 'open';
alter table trades enable row level security;

create or replace function trade_json(t trades) returns jsonb
language sql immutable as $$
  select jsonb_build_object('id', t.id, 'platform', t.platform, 'market_id', t.market_id, 'title', t.title, 'side', t.side,
    'shares', t.shares, 'price', t.price, 'est', t.est, 'status', t.status, 'exit_price', t.exit_price, 'outcome', t.outcome,
    'credited', t.credited, 'opened_at', t.opened_at, 'closed_at', t.closed_at)
$$;

create or replace function session_user_id(p_token_hash text) returns uuid
language sql stable set search_path = public as $$
  select user_id from app_sessions where token_hash = p_token_hash and expires_at > now()
$$;

create or replace function trade_open(p_token_hash text, p_platform text, p_market_id text, p_title text,
  p_side text, p_shares int, p_price numeric, p_est int) returns jsonb
language plpgsql set search_path = public as $$
declare v_user uuid := session_user_id(p_token_hash); v trades;
begin
  if v_user is null then return null; end if;
  insert into trades (user_id, platform, market_id, title, side, shares, price, est)
  values (v_user, p_platform, p_market_id, left(p_title, 300), p_side, p_shares, p_price, p_est)
  returning * into v;
  return trade_json(v);
end $$;

-- null when the session is not valid
create or replace function trade_list(p_token_hash text) returns jsonb
language sql stable set search_path = public as $$
  select case when session_user_id(p_token_hash) is null then null else
    (select coalesce(jsonb_agg(trade_json(t) order by t.opened_at desc), '[]'::jsonb)
     from trades t where t.user_id = session_user_id(p_token_hash)) end
$$;

-- Sells an open trade of the signed-in player at the given live price.
create or replace function trade_sell(p_token_hash text, p_id bigint, p_price numeric) returns jsonb
language plpgsql set search_path = public as $$
declare v trades;
begin
  update trades set status = 'sold', exit_price = p_price, closed_at = now()
  where id = p_id and user_id = session_user_id(p_token_hash) and status = 'open'
  returning * into v;
  if not found then return null; end if;
  return trade_json(v);
end $$;

-- Settles every open trade on a market that has resolved. Called by the server when a player lists their trades.
create or replace function trade_settle(p_platform text, p_market_id text, p_outcome boolean) returns int
language plpgsql set search_path = public as $$
declare n int;
begin
  update trades set
    status = case when (side = 'yes') = p_outcome then 'won' else 'lost' end,
    exit_price = case when (side = 'yes') = p_outcome then 1 else 0 end,
    outcome = p_outcome, closed_at = now()
  where platform = p_platform and market_id = p_market_id and status = 'open';
  get diagnostics n = row_count;
  return n;
end $$;

-- The app added these payouts to the player's coins.
create or replace function trade_ack(p_token_hash text, p_ids bigint[]) returns void
language sql set search_path = public as $$
  update trades set credited = true
  where id = any (p_ids) and user_id = session_user_id(p_token_hash) and status <> 'open';
$$;

-- Demo traders board: every player with at least one trade, ranked by realized P&L (closed trades only, so prices
-- of open trades don't matter). Demo balance = starting cash + realized P&L, computed here rather than trusted from the app.
create or replace function sim_leaderboard(p_token_hash text, p_start numeric) returns jsonb
language sql stable set search_path = public as $$
  with me as (select session_user_id(p_token_hash) as id),
  per as (
    select t.user_id,
      sum(case t.status when 'won' then t.shares - t.shares * t.price
                        when 'lost' then -t.shares * t.price
                        when 'sold' then t.shares * t.exit_price - t.shares * t.price else 0 end) as pnl,
      count(*) as trades, count(*) filter (where t.status = 'open') as open
    from trades t group by t.user_id
  ),
  ranked as (
    select per.*, rank() over (order by per.pnl desc) as pos,
      coalesce(nullif(u.name, ''), 'Player') as name, p.data->'avatar' as avatar
    from per join users u on u.id = per.user_id left join user_progress p on p.user_id = per.user_id
  ),
  row_json as (
    select r.pos, jsonb_build_object('pos', r.pos, 'pid', md5(r.user_id::text), 'name', r.name, 'avatar', r.avatar, 'pnl', round(r.pnl, 2),
      'balance', round(p_start + r.pnl, 2), 'trades', r.trades, 'open', r.open, 'me', r.user_id = (select id from me)) as j,
      r.user_id = (select id from me) as is_me
    from ranked r
  )
  select case when (select id from me) is null then null else jsonb_build_object(
    'rows', coalesce((select jsonb_agg(j order by pos) from (select * from row_json order by pos limit 50) top), '[]'::jsonb),
    'me', (select j from row_json where is_me)) end
$$;

-- One trader's full history for the board (signed-in players only). Traders are addressed by md5 of their id,
-- so the board never exposes account ids.
create or replace function sim_trader(p_token_hash text, p_pid text, p_start numeric) returns jsonb
language sql stable set search_path = public as $$
  with t as (select u.id, coalesce(nullif(u.name, ''), 'Player') as name, p.data->'avatar' as avatar
             from users u left join user_progress p on p.user_id = u.id where md5(u.id::text) = p_pid)
  select case when session_user_id(p_token_hash) is null or not exists (select 1 from t) then null else (
    select jsonb_build_object('name', t.name, 'avatar', t.avatar, 'me', t.id = session_user_id(p_token_hash),
      'pnl', round(coalesce(sum(case x.status when 'won' then x.shares - x.shares * x.price when 'lost' then -x.shares * x.price
                                 when 'sold' then x.shares * x.exit_price - x.shares * x.price else 0 end), 0), 2),
      'balance', round(p_start + coalesce(sum(case x.status when 'won' then x.shares - x.shares * x.price when 'lost' then -x.shares * x.price
                                 when 'sold' then x.shares * x.exit_price - x.shares * x.price else 0 end), 0), 2),
      'trades', coalesce(jsonb_agg(jsonb_build_object('title', x.title, 'platform', x.platform, 'side', x.side, 'shares', x.shares,
                  'price', x.price, 'est', x.est, 'status', x.status, 'exit_price', x.exit_price, 'outcome', x.outcome,
                  'opened_at', x.opened_at, 'closed_at', x.closed_at) order by x.opened_at desc) filter (where x.id is not null), '[]'::jsonb))
    from t left join trades x on x.user_id = t.id group by t.id, t.name, t.avatar) end
$$;

revoke execute on function trade_json(trades)                                          from public, anon, authenticated;
revoke execute on function session_user_id(text)                                       from public, anon, authenticated;
revoke execute on function trade_open(text, text, text, text, text, int, numeric, int) from public, anon, authenticated;
revoke execute on function trade_list(text)                                            from public, anon, authenticated;
revoke execute on function trade_sell(text, bigint, numeric)                           from public, anon, authenticated;
revoke execute on function trade_settle(text, text, boolean)                           from public, anon, authenticated;
revoke execute on function trade_ack(text, bigint[])                                   from public, anon, authenticated;
revoke execute on function sim_leaderboard(text, numeric)                              from public, anon, authenticated;
revoke execute on function sim_trader(text, text, numeric)                             from public, anon, authenticated;
grant execute on function trade_json(trades), session_user_id(text), trade_open(text, text, text, text, text, int, numeric, int),
  trade_list(text), trade_sell(text, bigint, numeric), trade_settle(text, text, boolean),
  trade_ack(text, bigint[]), sim_leaderboard(text, numeric), sim_trader(text, text, numeric) to service_role;

-- Removed: trade_open_markets() fed the daily cron, which is no longer used.
drop function if exists trade_open_markets();
