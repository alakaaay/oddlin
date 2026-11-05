-- AI Coach: a daily question limit per player and one call that returns everything the coach may know about the player.
-- Apply: node scripts/db.js db/coach.sql, then db/billing.sql

create table if not exists coach_usage (
  user_id  uuid not null references users (id) on delete cascade,
  day      date not null,
  n        int  not null default 0,
  primary key (user_id, day)
);
alter table coach_usage enable row level security;

-- The functions that count and read questions (coach_context, coach_left) live in db/billing.sql,
-- because the daily limit depends on the Coach Plus subscription.
