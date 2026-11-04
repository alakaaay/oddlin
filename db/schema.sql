-- Oddlin funnel analytics schema (Supabase / Postgres).
-- Run once in Supabase → SQL Editor. Safe to re-run: every object is created only if missing.
--
--   funnels        one row per funnel version (john-35plus v2, …)
--   funnel_steps   the screens and questions of one funnel version, with answer options
--   sessions       one row per visit: which funnel version, which ad, which device
--   events         what happened in a session, each tied to a funnel step; answers stored as codes only
--   leads          emails, tied to the session they were left in
--
-- Access: RLS is on and there are no policies, so only the server (secret key) can read or write.

create table if not exists funnels (
  id          bigint generated always as identity primary key,
  slug        text not null,                      -- 'john-35plus'
  version     int  not null,                      -- bump when steps or questions change
  name        text not null,
  created_at  timestamptz not null default now(),
  unique (slug, version)
);

create table if not exists funnel_steps (
  id           bigint generated always as identity primary key,
  funnel_id    bigint not null references funnels (id),
  step_number  int  not null,                     -- 0 = landing
  step_key     text not null,                     -- 'age', 'fears', 'paywall' (the id used in app.js)
  type         text not null,                     -- landing, single, multi, fact, statement, email, loader, plan, scratch, paywall, upsell, done
  question     text,                              -- null for screens without a question
  options      jsonb,                             -- [{"code":"45-54","label":"45 to 54"}, …]
  unique (funnel_id, step_number),
  unique (funnel_id, step_key),
  unique (funnel_id, id)                          -- target for the composite key in events
);

create table if not exists sessions (
  id            text primary key check (id ~ '^s_[A-Za-z0-9-]{8,64}$'),  -- generated in the browser
  funnel_id     bigint not null references funnels (id),
  utm_source    text,
  utm_campaign  text,
  utm_content   text,                             -- which creative
  device        text,                             -- mobile, tablet, desktop
  created_at    timestamptz not null default now(),
  unique (funnel_id, id)                          -- target for the composite key in events
);

-- The composite keys make it impossible to log an event against a step from another funnel
-- than the session's own.
create table if not exists events (
  id           bigint generated always as identity primary key,
  session_id   text   not null,
  funnel_id    bigint not null,
  step_id      bigint not null,
  event_name   text   not null,                   -- ScreenView, QuizAnswer, Lead, InitiateCheckout, Purchase, AddToCart, …
  answer       text[],                            -- option codes only, labels live in funnel_steps.options
  value        numeric(10, 2),                    -- price in USD for commerce events
  created_at   timestamptz not null default now(),
  foreign key (funnel_id, session_id) references sessions (funnel_id, id) on delete cascade,
  foreign key (funnel_id, step_id)    references funnel_steps (funnel_id, id)
);
create index if not exists events_session_idx on events (session_id, created_at);
create index if not exists events_funnel_name_idx on events (funnel_id, event_name, created_at);

create table if not exists leads (
  id          bigint generated always as identity primary key,
  email       text not null unique check (email = lower(email)),
  session_id  text not null references sessions (id) on delete cascade,
  created_at  timestamptz not null default now()
);

alter table funnels      enable row level security;
alter table funnel_steps enable row level security;
alter table sessions     enable row level security;
alter table events       enable row level security;
alter table leads        enable row level security;

-- Furthest step each session reached: the drop-off point.
create or replace view session_progress with (security_invoker = true) as
select s.id as session_id, s.funnel_id, s.created_at, s.utm_campaign, s.utm_content, s.device,
       p.max_step_number, fs.step_key as max_step_key, p.last_event_at, p.is_lead, p.purchased
from sessions s
cross join lateral (
  select max(fs2.step_number)                                as max_step_number,
         max(e.created_at)                                   as last_event_at,
         coalesce(bool_or(e.event_name = 'Lead'), false)     as is_lead,
         coalesce(bool_or(e.event_name = 'Purchase'), false) as purchased
  from events e
  join funnel_steps fs2 on fs2.id = e.step_id
  where e.session_id = s.id
) p
left join funnel_steps fs on fs.funnel_id = s.funnel_id and fs.step_number = p.max_step_number;

-- Answers with their labels, one row per answered step.
create or replace view session_answers with (security_invoker = true) as
select e.session_id, f.slug, f.version, fs.step_number, fs.step_key, fs.question, e.answer,
       (select string_agg(o->>'label', ', ' order by ord)
          from jsonb_array_elements(fs.options) with ordinality as t(o, ord)
         where o->>'code' = any (e.answer)) as answer_label,
       e.created_at
from events e
join funnel_steps fs on fs.id = e.step_id
join funnels f on f.id = e.funnel_id
where e.event_name = 'QuizAnswer';
