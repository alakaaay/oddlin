// Stores one email signup in the leads table (through save_lead in Postgres).
// Used by server.js (local) and api/subscribe.js (Vercel).

const { rpc, sessionMeta, funnelRef, SESSION_RE } = require('./supabase');

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

async function saveSubscriber(body) {
  const b = body && typeof body === 'object' ? body : {};
  const email = String(b.email || '').trim().toLowerCase();
  const funnel = funnelRef(b);
  if (email.length > 254 || !EMAIL_RE.test(email)) return { status: 400, body: { ok: false, error: 'invalid_email' } };
  if (!SESSION_RE.test(String(b.session_id))) return { status: 400, body: { ok: false, error: 'invalid_session' } };
  if (!funnel) return { status: 400, body: { ok: false, error: 'invalid_funnel' } };

  await rpc('save_lead', Object.assign({ p_email: email, p_session_id: b.session_id }, funnel, sessionMeta(b.meta)));
  return { status: 200, body: { ok: true } };
}

module.exports = { saveSubscriber };
