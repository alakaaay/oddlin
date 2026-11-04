// Stores one quiz event: validates the browser's payload and calls log_event in Postgres.
// Used by server.js (local) and api/event.js (Vercel).

const { rpc, sessionMeta, funnelRef, SESSION_RE } = require('./supabase');

const EVENT_NAMES = new Set([
  'ScreenView', 'ViewContent', 'QuizAnswer', 'Lead', 'InitiateCheckout', 'Purchase',
  'ScratchReveal', 'PromoExpired', 'BetaReveal'
]);
const STEP_RE = /^[a-z0-9_]{1,40}$/;

const bad = error => ({ status: 400, body: { ok: false, error } });

async function logEvent(body) {
  const b = body && typeof body === 'object' ? body : {};
  const funnel = funnelRef(b);
  if (!SESSION_RE.test(String(b.session_id))) return bad('invalid_session');
  if (!funnel) return bad('invalid_funnel');
  if (!STEP_RE.test(String(b.step_key))) return bad('invalid_step');
  if (!EVENT_NAMES.has(b.event_name)) return bad('invalid_event');

  let answer = null;
  if (b.answer !== undefined && b.answer !== null) {
    if (!Array.isArray(b.answer) || b.answer.length > 20 || !b.answer.every(a => typeof a === 'string' && a.length <= 80)) return bad('invalid_answer');
    answer = b.answer;
  }
  let value = null;
  if (b.value !== undefined && b.value !== null) {
    value = Number(b.value);
    if (!Number.isFinite(value) || value < 0 || value > 100000) return bad('invalid_value');
  }

  await rpc('log_event', Object.assign({
    p_session_id: b.session_id,
    p_step_key: b.step_key,
    p_event_name: b.event_name,
    p_answer: answer,
    p_value: value
  }, funnel, sessionMeta(b.meta)));
  return { status: 200, body: { ok: true } };
}

module.exports = { logEvent };
