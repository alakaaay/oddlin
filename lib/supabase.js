// Calls Postgres functions through Supabase REST with the server's secret key. fetch only, no npm.
// Env: NEXT_PUBLIC_SUPABASE_URL (or SUPABASE_URL) and SUPABASE_SECRET_KEY (or the legacy SUPABASE_SERVICE_ROLE_KEY).

function config() {
  const url = (process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || '').replace(/\/$/, '');
  const key = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  return { url, key };
}

async function rpc(fn, args) {
  const { url, key } = config();
  if (!url || !key) throw Object.assign(new Error('Supabase is not configured'), { status: 503 });
  const headers = { apikey: key, 'Content-Type': 'application/json' };
  if (key.startsWith('eyJ')) headers.Authorization = `Bearer ${key}`; // legacy JWT keys also need the bearer header
  const res = await fetch(`${url}/rest/v1/rpc/${fn}`, { method: 'POST', headers, body: JSON.stringify(args) });
  if (!res.ok) {
    const body = await res.text();
    // 22023 = unknown funnel or step (raised by our functions), 23xxx = constraint violations: both are bad input
    const badInput = /"code":"(22023|23\d{3})"/.test(body);
    throw Object.assign(new Error(`${fn} failed: ${res.status} ${body.slice(0, 300)}`), { status: badInput ? 400 : 502 });
  }
  // Functions returning a value come back as JSON; void functions return an empty body
  const text = await res.text();
  return text ? JSON.parse(text) : null;
}

// Visit metadata sent by the browser with every call; stored only when the session row is created
function sessionMeta(meta) {
  const m = meta && typeof meta === 'object' ? meta : {};
  const str = v => (typeof v === 'string' && v.trim() ? v.trim().slice(0, 200) : null);
  return {
    p_utm_source: str(m.utm_source),
    p_utm_campaign: str(m.utm_campaign),
    p_utm_content: str(m.utm_content),
    p_device: ['mobile', 'tablet', 'desktop'].includes(m.device) ? m.device : null
  };
}

const SESSION_RE = /^s_[A-Za-z0-9-]{8,64}$/;
const SLUG_RE = /^[a-z0-9-]{1,40}$/;

function funnelRef(body) {
  const f = body && body.funnel;
  const version = f && Number(f.version);
  if (!f || !SLUG_RE.test(String(f.slug)) || !Number.isInteger(version) || version < 1 || version > 10000) return null;
  return { p_slug: f.slug, p_version: version };
}

module.exports = { rpc, sessionMeta, funnelRef, SESSION_RE };
