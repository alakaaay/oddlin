-- App accounts for the MVP (/app). Run after schema.sql and functions.sql: node scripts/db.js db/auth.sql
-- Safe to re-run.
--
--   users         one row per paying customer, created when the quiz paywall is paid
--   auth_codes    the current 6-digit email code of a user (hash only), with expiry and attempt count
--   app_sessions  login sessions of the app (token hash only)
--
-- Flow: pending user → email code → set password → active. Active users log in with email + password.
-- Codes, setup tokens, session tokens and passwords are never stored in plain text: the server hashes them first.
-- Access: RLS on, no policies, so only the server (secret key) can read or write, like the other tables.

create table if not exists users (
  id             uuid primary key default gen_random_uuid(),
  email          text not null unique check (email = lower(email)),
  status         text not null default 'pending' check (status in ('pending', 'active')),  -- pending = never signed in yet
  password_hash  text,                              -- scrypt, set on first sign-in
  plan           text,                              -- plan bought on the quiz paywall
  session_id     text references sessions (id) on delete set null,  -- quiz visit that led to the purchase
  name           text,                              -- onboarding answers
  topics         text[],
  minutes        int,
  level          text,
  onboarded      boolean not null default false,
  failed_logins  int not null default 0,
  locked_until   timestamptz,
  created_at     timestamptz not null default now(),
  activated_at   timestamptz,
  last_login_at  timestamptz
);

create table if not exists auth_codes (
  user_id      uuid primary key references users (id) on delete cascade,
  code_hash    text not null,
  sent_at      timestamptz not null default now(),
  expires_at   timestamptz not null,
  attempts     int not null default 0,
  verified_at  timestamptz,                         -- set when the right code is entered
  setup_hash   text                                 -- one-time token that allows setting the password right after
);

create table if not exists app_sessions (
  token_hash  text primary key,
  user_id     uuid not null references users (id) on delete cascade,
  created_at  timestamptz not null default now(),
  expires_at  timestamptz not null
);
create index if not exists app_sessions_user_idx on app_sessions (user_id);

alter table users        enable row level security;
alter table auth_codes   enable row level security;
alter table app_sessions enable row level security;

-- Public view of a user: never includes the password hash or lockout data.
create or replace function user_json(u users) returns jsonb
language sql immutable as $$
  select jsonb_build_object('id', u.id, 'email', u.email, 'status', u.status, 'plan', u.plan, 'name', u.name,
    'topics', u.topics, 'minutes', u.minutes, 'level', u.level, 'onboarded', u.onboarded, 'created_at', u.created_at)
$$;

-- Paywall paid: create the account. Only for an email that went through the quiz (it has a lead row).
-- The quiz answers (topics, minutes a day, level) are saved right away and count as onboarding, so a user who
-- came from the quiz goes straight to lesson 1 after setting the password. A repeat purchase only refreshes a pending user.
drop function if exists create_app_user(text, text, text);
create or replace function create_app_user(p_email text, p_session_id text, p_plan text default null,
  p_topics text[] default null, p_minutes int default null, p_level text default null)
returns uuid
language plpgsql set search_path = public as $$
declare v_id uuid;
begin
  if not exists (select 1 from leads where email = p_email) then
    raise exception 'No quiz signup for this email' using errcode = '22023';
  end if;
  insert into users (email, plan, session_id, topics, minutes, level, onboarded)
  values (p_email, p_plan, (select id from sessions where id = p_session_id), p_topics, p_minutes, p_level, true)
  on conflict (email) do update set
    plan    = coalesce(excluded.plan, users.plan),
    topics  = case when users.status = 'pending' then coalesce(excluded.topics, users.topics) else users.topics end,
    minutes = case when users.status = 'pending' then coalesce(excluded.minutes, users.minutes) else users.minutes end,
    level   = case when users.status = 'pending' then coalesce(excluded.level, users.level) else users.level end,
    onboarded = true
  returning id into v_id;
  return v_id;
end $$;

-- New user straight from the app (no quiz): mini-funnel answers (name, topics, minutes, level) + plan. Returns the account status:
-- 'active' means the email already has an account (sign in with the password instead).
drop function if exists signup_app_user(text, text, text[], int, text);
create or replace function signup_app_user(p_email text, p_plan text, p_topics text[], p_minutes int, p_level text, p_name text default null)
returns text
language plpgsql set search_path = public as $$
declare v_status text;
begin
  insert into users (email, plan, topics, minutes, level, name, onboarded)
  values (p_email, p_plan, p_topics, p_minutes, p_level, p_name, true)
  on conflict (email) do update set
    name    = case when users.status = 'pending' then coalesce(excluded.name, users.name) else users.name end,
    plan    = case when users.status = 'pending' then coalesce(excluded.plan, users.plan) else users.plan end,
    topics  = case when users.status = 'pending' then coalesce(excluded.topics, users.topics) else users.topics end,
    minutes = case when users.status = 'pending' then coalesce(excluded.minutes, users.minutes) else users.minutes end,
    level   = case when users.status = 'pending' then coalesce(excluded.level, users.level) else users.level end,
    onboarded = true
  returning status into v_status;
  return v_status;
end $$;

-- Everything the server needs to decide the next sign-in step, including the password hash (server only).
create or replace function auth_user(p_email text) returns jsonb
language sql stable set search_path = public as $$
  select user_json(u) || jsonb_build_object('password_hash', u.password_hash, 'locked_until', u.locked_until)
  from users u where u.email = p_email
$$;

-- Stores a new email code. Refuses if the last one was sent less than 60 seconds ago.
create or replace function auth_store_code(p_user_id uuid, p_code_hash text) returns text
language plpgsql set search_path = public as $$
begin
  if exists (select 1 from auth_codes where user_id = p_user_id and sent_at > now() - interval '60 seconds') then
    return 'cooldown';
  end if;
  insert into auth_codes (user_id, code_hash, sent_at, expires_at, attempts, verified_at, setup_hash)
  values (p_user_id, p_code_hash, now(), now() + interval '10 minutes', 0, null, null)
  on conflict (user_id) do update set code_hash = excluded.code_hash, sent_at = excluded.sent_at,
    expires_at = excluded.expires_at, attempts = 0, verified_at = null, setup_hash = null;
  return 'ok';
end $$;

-- Checks a code: 'ok', 'bad', 'expired', 'locked' (5 wrong tries) or 'missing'.
-- On 'ok' it keeps the setup token hash that allows setting the password in the next 15 minutes.
create or replace function auth_verify_code(p_user_id uuid, p_code_hash text, p_setup_hash text) returns text
language plpgsql set search_path = public as $$
declare c auth_codes;
begin
  select * into c from auth_codes where user_id = p_user_id for update;
  if not found then return 'missing'; end if;
  if c.expires_at < now() then return 'expired'; end if;
  if c.attempts >= 5 then return 'locked'; end if;
  if c.code_hash <> p_code_hash then
    update auth_codes set attempts = attempts + 1 where user_id = p_user_id;
    return 'bad';
  end if;
  update auth_codes set verified_at = now(), setup_hash = p_setup_hash where user_id = p_user_id;
  return 'ok';
end $$;

-- Sets the password after a verified code (first sign-in or reset) and activates the account. 'ok' or 'denied'.
create or replace function auth_set_password(p_user_id uuid, p_setup_hash text, p_password_hash text) returns text
language plpgsql set search_path = public as $$
begin
  if not exists (select 1 from auth_codes where user_id = p_user_id and setup_hash = p_setup_hash
                 and verified_at > now() - interval '15 minutes') then
    return 'denied';
  end if;
  update users set password_hash = p_password_hash, status = 'active', activated_at = coalesce(activated_at, now()),
    failed_logins = 0, locked_until = null where id = p_user_id;
  delete from auth_codes where user_id = p_user_id;
  delete from app_sessions where user_id = p_user_id;  -- a new password signs out every other device
  return 'ok';
end $$;

-- Records a password attempt. 5 wrong in a row lock the account for 15 minutes.
create or replace function auth_login_result(p_user_id uuid, p_ok boolean) returns void
language plpgsql set search_path = public as $$
begin
  if p_ok then
    update users set failed_logins = 0, locked_until = null, last_login_at = now() where id = p_user_id;
  else
    update users set failed_logins = failed_logins + 1,
      locked_until = case when failed_logins + 1 >= 5 then now() + interval '15 minutes' else locked_until end
    where id = p_user_id;
    update users set failed_logins = 0 where id = p_user_id and failed_logins >= 5;
  end if;
end $$;

create or replace function session_create(p_user_id uuid, p_token_hash text) returns void
language sql set search_path = public as $$
  insert into app_sessions (token_hash, user_id, expires_at) values (p_token_hash, p_user_id, now() + interval '30 days');
  update users set last_login_at = now() where id = p_user_id;
$$;

create or replace function session_lookup(p_token_hash text) returns jsonb
language sql stable set search_path = public as $$
  select user_json(u) from app_sessions s join users u on u.id = s.user_id
  where s.token_hash = p_token_hash and s.expires_at > now()
$$;

create or replace function session_delete(p_token_hash text) returns void
language sql set search_path = public as $$
  delete from app_sessions where token_hash = p_token_hash;
$$;

-- Saves the onboarding answers of the signed-in user and marks onboarding done.
create or replace function user_save_profile(p_token_hash text, p_name text, p_topics text[], p_minutes int, p_level text)
returns jsonb
language plpgsql set search_path = public as $$
declare v users;
begin
  update users u set name = p_name, topics = p_topics, minutes = p_minutes, level = p_level, onboarded = true
  from app_sessions s
  where s.token_hash = p_token_hash and s.expires_at > now() and u.id = s.user_id
  returning u.* into v;
  if not found then return null; end if;
  return user_json(v);
end $$;

-- Only the server (service_role) may call these. Without this, the public anon key could read password hashes.
revoke execute on function user_json(users)                                   from public, anon, authenticated;
revoke execute on function create_app_user(text, text, text, text[], int, text) from public, anon, authenticated;
revoke execute on function auth_user(text)                                    from public, anon, authenticated;
revoke execute on function signup_app_user(text, text, text[], int, text, text) from public, anon, authenticated;
revoke execute on function auth_store_code(uuid, text)                        from public, anon, authenticated;
revoke execute on function auth_verify_code(uuid, text, text)                 from public, anon, authenticated;
revoke execute on function auth_set_password(uuid, text, text)                from public, anon, authenticated;
revoke execute on function auth_login_result(uuid, boolean)                   from public, anon, authenticated;
revoke execute on function session_create(uuid, text)                         from public, anon, authenticated;
revoke execute on function session_lookup(text)                                 from public, anon, authenticated;
revoke execute on function session_delete(text)                               from public, anon, authenticated;
revoke execute on function user_save_profile(text, text, text[], int, text)   from public, anon, authenticated;
grant  execute on function user_json(users), create_app_user(text, text, text, text[], int, text), signup_app_user(text, text, text[], int, text, text), auth_user(text), auth_store_code(uuid, text),
  auth_verify_code(uuid, text, text), auth_set_password(uuid, text, text), auth_login_result(uuid, boolean),
  session_create(uuid, text), session_lookup(text), session_delete(text), user_save_profile(text, text, text[], int, text)
  to service_role;

-- ── Progress ─────────────────────────────────────────────────────────────
-- Everything the app keeps per user (lessons, quizzes, stars, XP, coins, streak, freezes, badges, chests, gifts,
-- avatar, trades, coach chat…) as one JSON document, plus XP and the public name/avatar copied out for the leaderboard.
create table if not exists user_progress (
  user_id     uuid primary key references users (id) on delete cascade,
  data        jsonb not null default '{}'::jsonb,
  xp          int not null default 0,
  updated_at  timestamptz not null default now()
);
create index if not exists user_progress_xp_idx on user_progress (xp desc);
alter table user_progress enable row level security;

create or replace function progress_get(p_token_hash text) returns jsonb
language sql stable set search_path = public as $$
  select coalesce((select p.data from user_progress p where p.user_id = s.user_id), '{}'::jsonb)
  from app_sessions s where s.token_hash = p_token_hash and s.expires_at > now()
$$;

-- Saves the whole document. Returns false when the session is not valid.
create or replace function progress_save(p_token_hash text, p_data jsonb, p_xp int) returns boolean
language plpgsql set search_path = public as $$
declare v_user uuid;
begin
  select user_id into v_user from app_sessions where token_hash = p_token_hash and expires_at > now();
  if v_user is null then return false; end if;
  insert into user_progress (user_id, data, xp, updated_at) values (v_user, p_data, greatest(p_xp, 0), now())
  on conflict (user_id) do update set data = excluded.data, xp = excluded.xp, updated_at = now();
  if p_data ? 'name' and coalesce(p_data->>'name', '') <> '' and p_data->>'name' <> 'You' then
    update users set name = left(p_data->>'name', 40) where id = v_user;
  end if;
  return true;
end $$;

-- Players in one XP band (the caller's rank): name, XP, avatar, and which row is the caller. Top 30 by XP.
create or replace function leaderboard(p_token_hash text, p_min_xp int, p_max_xp int) returns jsonb
language sql stable set search_path = public as $$
  with me as (select user_id from app_sessions where token_hash = p_token_hash and expires_at > now())
  select coalesce(jsonb_agg(r order by (r->>'xp')::int desc), '[]'::jsonb) from (
    select jsonb_build_object('name', coalesce(nullif(u.name, ''), 'Player'), 'xp', p.xp,
             'avatar', p.data->'avatar', 'me', p.user_id = (select user_id from me)) as r
    from user_progress p join users u on u.id = p.user_id
    where exists (select 1 from me) and p.xp >= p_min_xp and p.xp < p_max_xp
    order by p.xp desc limit 30
  ) t
$$;

revoke execute on function progress_get(text)               from public, anon, authenticated;
revoke execute on function progress_save(text, jsonb, int)  from public, anon, authenticated;
revoke execute on function leaderboard(text, int, int)      from public, anon, authenticated;
grant  execute on function progress_get(text), progress_save(text, jsonb, int), leaderboard(text, int, int) to service_role;
