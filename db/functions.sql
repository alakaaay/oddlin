-- Write path for the quiz. The server calls these through Supabase REST (/rest/v1/rpc/...) with the secret key.
-- Each call is one transaction: it creates the session on first use, then writes the event or the lead.
-- Run after schema.sql: node scripts/db.js db/functions.sql

-- Logs one event. Resolves the funnel and step from slug, version and step key, so the browser never needs database ids.
create or replace function log_event(
  p_session_id   text,
  p_slug         text,
  p_version      int,
  p_step_key     text,
  p_event_name   text,
  p_answer       text[]  default null,
  p_value        numeric default null,
  p_utm_source   text    default null,
  p_utm_campaign text    default null,
  p_utm_content  text    default null,
  p_device       text    default null
) returns void
language plpgsql
set search_path = public
as $$
declare
  v_funnel bigint;
  v_step   bigint;
begin
  select f.id, s.id into v_funnel, v_step
  from funnels f
  join funnel_steps s on s.funnel_id = f.id
  where f.slug = p_slug and f.version = p_version and s.step_key = p_step_key;
  if v_step is null then
    raise exception 'Unknown step %/v%/%', p_slug, p_version, p_step_key using errcode = '22023';
  end if;

  insert into sessions (id, funnel_id, utm_source, utm_campaign, utm_content, device)
  values (p_session_id, v_funnel, p_utm_source, p_utm_campaign, p_utm_content, p_device)
  on conflict (id) do nothing;

  insert into events (session_id, funnel_id, step_id, event_name, answer, value)
  values (p_session_id, v_funnel, v_step, p_event_name, p_answer, p_value);
end;
$$;

-- Saves an email. Creates the session if no event reached the database before. A repeated email keeps its first session.
create or replace function save_lead(
  p_email        text,
  p_session_id   text,
  p_slug         text,
  p_version      int,
  p_utm_source   text default null,
  p_utm_campaign text default null,
  p_utm_content  text default null,
  p_device       text default null
) returns void
language plpgsql
set search_path = public
as $$
declare
  v_funnel bigint;
begin
  select id into v_funnel from funnels where slug = p_slug and version = p_version;
  if v_funnel is null then
    raise exception 'Unknown funnel %/v%', p_slug, p_version using errcode = '22023';
  end if;

  insert into sessions (id, funnel_id, utm_source, utm_campaign, utm_content, device)
  values (p_session_id, v_funnel, p_utm_source, p_utm_campaign, p_utm_content, p_device)
  on conflict (id) do nothing;

  insert into leads (email, session_id)
  values (lower(trim(p_email)), p_session_id)
  on conflict (email) do nothing;
end;
$$;

-- Supabase exposes public functions to the anon and authenticated roles by default. Only the server may call these.
revoke execute on function log_event(text, text, int, text, text, text[], numeric, text, text, text, text) from public, anon, authenticated;
revoke execute on function save_lead(text, text, text, int, text, text, text, text) from public, anon, authenticated;
grant  execute on function log_event(text, text, int, text, text, text[], numeric, text, text, text, text) to service_role;
grant  execute on function save_lead(text, text, text, int, text, text, text, text) to service_role;

-- Let the REST API see the new functions right away
notify pgrst, 'reload schema';
