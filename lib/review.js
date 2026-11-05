// AI review of one simulator contract: what the price means, an AI odds range, reasons for YES and for NO, what to watch.
// POST /api/review { token, platform, market_id, title }. One model call per market per UTC day: the result is cached in
// ai_reviews and every player gets the same review that day. Educational only, never a buy or sell call.

const crypto = require('crypto');
const { rpc } = require('./supabase');
const { getMarket } = require('./markets');
const { geminiJSON } = require('./ai');

const TOKEN_RE = /^[A-Za-z0-9_-]{40,60}$/;
const ID_RE = /^[A-Za-z0-9._-]{1,80}$/;

function sessionHash(token) {
  const s = process.env.AUTH_SECRET || process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!s) throw Object.assign(new Error('AUTH_SECRET is not set'), { status: 503 });
  const key = crypto.createHash('sha256').update('oddlin-auth:' + s).digest();
  return crypto.createHmac('sha256', key).update(['session', token].join(':')).digest('base64url');
}
const ok = body => ({ status: 200, body: Object.assign({ ok: true }, body) });
const fail = (error, status = 400) => ({ status, body: { ok: false, error } });

const SYSTEM = `You write short, plain-English reviews of prediction-market contracts for beginners who practice with demo money.
Rules:
- Educational only. Never tell the reader to buy, sell, or bet. Never promise profit. No "you should".
- Give a balanced view: real reasons the event could happen and real reasons it could not.
- Base the odds range on the facts given and general knowledge. If you lack recent information, say so in the summary, widen the range and set confidence to "low".
- Keep every bullet under 20 words. No jargon; explain any term you must use.
- Today's date is given; reason about timing from it.`;

const SCHEMA = {
  type: 'OBJECT',
  properties: {
    summary: { type: 'STRING', description: 'Two sentences: what the contract asks and what the current price says, in plain English.' },
    ai_low: { type: 'INTEGER', description: 'Low end of your estimated chance that YES happens, 1-99.' },
    ai_high: { type: 'INTEGER', description: 'High end of your estimated chance that YES happens, 1-99.' },
    yes_reasons: { type: 'ARRAY', items: { type: 'STRING' }, description: '2-3 reasons YES could happen.' },
    no_reasons: { type: 'ARRAY', items: { type: 'STRING' }, description: '2-3 reasons YES could fail.' },
    watch: { type: 'ARRAY', items: { type: 'STRING' }, description: '1-3 data releases, dates or events that will move the price.' },
    confidence: { type: 'STRING', enum: ['low', 'medium', 'high'] }
  },
  required: ['summary', 'ai_low', 'ai_high', 'yes_reasons', 'no_reasons', 'watch', 'confidence']
};

const pct = p => (p == null ? 'n/a' : `${Math.round(p * 100)}%`);
const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, Math.round(Number(n) || 0)));

function clean(r) {
  let lo = clamp(r.ai_low, 1, 99), hi = clamp(r.ai_high, 1, 99);
  if (lo > hi) [lo, hi] = [hi, lo];
  const list = (a, n) => (Array.isArray(a) ? a : []).map(x => String(x).trim()).filter(Boolean).slice(0, n).map(x => x.slice(0, 200));
  return { summary: String(r.summary || '').slice(0, 500), ai_low: lo, ai_high: hi, yes_reasons: list(r.yes_reasons, 3),
    no_reasons: list(r.no_reasons, 3), watch: list(r.watch, 3), confidence: ['low', 'medium', 'high'].includes(r.confidence) ? r.confidence : 'low' };
}

async function review(body) {
  const b = body && typeof body === 'object' ? body : {};
  if (!TOKEN_RE.test(String(b.token))) return fail('signed_out', 401);
  const platform = b.platform === 'kalshi' ? 'kalshi' : b.platform === 'polymarket' ? 'polymarket' : null;
  const id = String(b.market_id || '');
  if (!platform || !ID_RE.test(id)) return fail('bad_market');
  const hash = sessionHash(b.token);
  const cached = await rpc('review_get', { p_token_hash: hash, p_platform: platform, p_market_id: id });
  if (cached == null) return fail('signed_out', 401);
  if (!cached.none) return ok(Object.assign({ cached: true }, cached));

  const m = await getMarket(platform, id);
  const title = String(b.title || m.title || '').slice(0, 300);
  const today = new Date().toISOString().slice(0, 10);
  const prompt = [
    `Today: ${today}`,
    `Platform: ${platform === 'kalshi' ? 'Kalshi' : 'Polymarket'}`,
    `Contract: ${title}`,
    m.title && m.title !== title ? `Market question: ${m.title}` : '',
    `Price to buy YES: ${pct(m.yes)} · price to buy NO: ${pct(m.no)} · spread: ${m.yes != null && m.yesBid ? Math.round((m.yes - m.yesBid) * 100) + ' cents' : 'n/a'}`,
    m.change1d != null ? `Price change: 1 day ${Math.round(m.change1d * 100)} pts, 1 week ${m.change1w != null ? Math.round(m.change1w * 100) + ' pts' : 'n/a'}` : '',
    m.last != null && m.previous != null ? `Last trade ${pct(m.last)}, previous day ${pct(m.previous)}` : '',
    `24h volume: ${Math.round(m.volume24 || 0)}`,
    m.closes ? `Closes: ${m.closes.slice(0, 10)}` : '',
    m.rules ? `Resolution rules: ${m.rules}` : ''
  ].filter(Boolean).join('\n');
  const { json, model } = await geminiJSON({ system: SYSTEM, prompt, schema: SCHEMA });
  const saved = await rpc('review_put', { p_platform: platform, p_market_id: id, p_review: clean(json), p_model: model });
  return ok(Object.assign({ cached: false }, saved));
}

module.exports = { review };
