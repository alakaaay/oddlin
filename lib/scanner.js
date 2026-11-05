// AI Scanner: a daily edition of up to 10 live markets where the AI's odds beat the price, ranked, explained simply.
// The edition is the same for everyone (impersonal, published once a day per platform, no user data in the prompt):
// the first request of the UTC day publishes it (no cron) and everyone after reads the stored one (scanner_editions).
// Players reveal picks in rank order; their plan only sets how many: 1 a day free, 5 with Scanner Pro, 10 with Scanner Max.
// POST /api/scanner { token, action: 'status' }            → { limit, left, tier, today: [signal] }
// POST /api/scanner { token, action: 'scan', platform }    → { signal, left }   the next pick of today's edition
// Demo money only: picks are AI estimates for practice, not financial advice.

const crypto = require('crypto');
const { rpc } = require('./supabase');
const { listMarkets, getMarket } = require('./markets');
const { geminiJSON, geminiResearch } = require('./ai');

const FREE = 1;
const TOKEN_RE = /^[A-Za-z0-9_-]{40,60}$/;
function sessionHash(token) {
  const s = process.env.AUTH_SECRET || process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!s) throw Object.assign(new Error('AUTH_SECRET is not set'), { status: 503 });
  const key = crypto.createHash('sha256').update('oddlin-auth:' + s).digest();
  return crypto.createHmac('sha256', key).update(['session', token].join(':')).digest('base64url');
}
const ok = body => ({ status: 200, body: Object.assign({ ok: true }, body) });
const fail = (error, status = 400) => ({ status, body: { ok: false, error } });

const EDITION = 10; // picks per edition
const SYSTEM = `You are the Oddlin AI Scanner. You publish one daily list of picks for all players, who practice prediction markets with demo money.
From the numbered list of live markets, choose exactly ${EDITION + 2} different markets where your own estimate of the chance differs most from the price, so one side looks cheap.
Rank them: biggest gap and clearest reasoning first. Your estimate for the chosen side must be higher than its price.
- Use the NEWS NOTES (fresh, from a web search today) together with the market list. Trust the notes over your own memory.
- Skip markets you have no solid information about.
- Use today's date to judge how much time is left.
- At most one pick per event or topic, so the list covers different stories.
- For each, choose the side (yes or no) that looks cheap by your estimate.
- Write for a beginner aged 35+: very short, plain words, no jargon, no "you should", no promises.
- headline: up to 10 words, what the trade is about.
- reasons: exactly 3, each up to 14 words, why the price may be too low for that side.
- risk: one line up to 16 words, what could go wrong.
- If unsure about a pick, set its confidence to "low".`;

const RESEARCH = `You research prediction markets. For the numbered markets, use Google Search to find the latest facts that decide each one
(polls, official data and schedules, recent statements, what already happened). Cover the 15 markets where news matters most.
For each: one line "[number] facts as of today", up to 35 words, plain facts with dates, no opinions. Skip markets with nothing new.`;

const SCHEMA = {
  type: 'OBJECT',
  properties: {
    picks: {
      type: 'ARRAY', minItems: EDITION + 2, maxItems: EDITION + 2, // 2 spare: picks the live price turns against are dropped
      items: {
        type: 'OBJECT',
        properties: {
          pick: { type: 'INTEGER', description: 'Number of the market from the list.' },
          side: { type: 'STRING', enum: ['yes', 'no'] },
          ai_yes: { type: 'INTEGER', description: 'Your estimated chance that YES happens, 1-99.' },
          headline: { type: 'STRING' },
          reasons: { type: 'ARRAY', items: { type: 'STRING' } },
          risk: { type: 'STRING' },
          confidence: { type: 'STRING', enum: ['low', 'medium', 'high'] }
        },
        required: ['pick', 'side', 'ai_yes', 'headline', 'reasons', 'risk', 'confidence']
      }
    }
  },
  required: ['picks']
};

// Up to 30 liquid markets, the hottest across categories, priced 8–92¢
async function candidates(platform) {
  const { events } = await listMarkets({ platform, cat: 'hot' });
  const seen = new Set(), out = [];
  for (const e of events) {
    for (const m of e.markets.slice(0, 4)) {
      if (seen.has(m.id) || m.yes < 0.08 || m.yes > 0.92) continue;
      seen.add(m.id);
      out.push({ e, m });
    }
  }
  return out.sort((a, b) => b.m.volume - a.m.volume).slice(0, 30);
}

const clip = (t, n) => String(t || '').trim().slice(0, n);
const r4 = n => Math.round(n * 10000) / 10000;

// Builds and publishes today's edition for a platform: one model call, prices refreshed from the live market
async function publish(platform) {
  const list = await candidates(platform);
  if (!list.length) return null;
  const today = new Date().toISOString().slice(0, 10);
  const lines = list.map(({ e, m }, i) => `[${i}] ${e.title}${m.label && m.label !== 'Yes' && m.label !== e.title ? ` · ${m.label}` : ''} | YES ${Math.round(m.yes * 100)}¢, NO ${Math.round(m.no * 100)}¢ | ${e.closes ? 'closes ' + e.closes.slice(0, 10) : 'no close date'}`);
  // Step 1: web research with Google Search (plain text). Step 2: structured picks from the list plus those notes.
  let notes = '';
  try {
    const r = await geminiResearch({ system: RESEARCH, prompt: `Today: ${today}\nMarkets:\n${lines.join('\n')}` });
    notes = r.text.slice(0, 12000);
  } catch (e) { console.error(`scanner research: ${e.message}`); } // without notes the picks still work, just less fresh
  const { json, model } = await geminiJSON({ system: SYSTEM, prompt: `Today: ${today}\nPlatform: ${platform}\nMarkets:\n${lines.join('\n')}\n\nNEWS NOTES:\n${notes || '(none today)'}`, schema: SCHEMA, maxTokens: 4000, timeout: 30000 });
  const used = new Set(), raw = (Array.isArray(json.picks) ? json.picks : []).filter(p => Number.isInteger(p.pick) && p.pick >= 0 && p.pick < list.length && !used.has(p.pick) && used.add(p.pick)).slice(0, EDITION + 2);
  const picks = await Promise.all(raw.map(async p => {
    const c = list[p.pick];
    let yes = c.m.yes, no = c.m.no;
    try { const g = await getMarket(platform, c.m.id); if (g.yes != null && g.no != null) { yes = g.yes; no = g.no; } } catch (e) {}
    const side = p.side === 'no' ? 'no' : 'yes';
    const aiYes = Math.min(99, Math.max(1, Math.round(Number(p.ai_yes) || 50)));
    const price = r4(side === 'yes' ? yes : no), aiSide = side === 'yes' ? aiYes : 100 - aiYes;
    return {
      platform, market_id: c.m.id, event_title: c.e.title, label: c.m.label, closes: c.e.closes,
      title: c.e.title + (c.e.markets.length > 1 || c.m.label !== 'Yes' ? ` · ${c.m.label}` : ''),
      side, yes: r4(yes), no: r4(no), price, ai_yes: aiYes, ai_side: aiSide, edge: aiSide - Math.round(price * 100),
      headline: clip(p.headline, 90), risk: clip(p.risk, 160),
      reasons: (Array.isArray(p.reasons) ? p.reasons : []).slice(0, 3).map(r => clip(r, 140)).filter(Boolean),
      confidence: ['low', 'medium', 'high'].includes(p.confidence) ? p.confidence : 'low'
    };
  }));
  // Keep the model's order but drop picks the live price turned against (no gap left)
  const ranked = picks.filter(p => p.edge > 0).slice(0, EDITION).map((p, i) => Object.assign(p, { rank: i + 1 }));
  return ranked.length ? rpc('scanner_edition_put', { p_platform: platform, p_picks: ranked, p_model: model }) : null;
}

// Today's edition; the first caller of the day publishes it. Concurrent first callers share one model call per instance.
const pending = new Map();
async function edition(platform) {
  const have = await rpc('scanner_edition_get', { p_platform: platform });
  if (have) return have;
  const key = platform + new Date().toISOString().slice(0, 10);
  if (!pending.has(key)) pending.set(key, publish(platform).finally(() => pending.delete(key)));
  return pending.get(key);
}

const ACTIONS = {
  async status(b, hash) {
    const r = await rpc('scanner_status', { p_token_hash: hash, p_free: FREE });
    return r ? ok(r) : fail('signed_out', 401);
  },

  async scan(b, hash) {
    const platform = b.platform === 'kalshi' ? 'kalshi' : 'polymarket';
    const st = await rpc('scanner_status', { p_token_hash: hash, p_free: FREE });
    if (!st) return fail('signed_out', 401);
    if (st.left <= 0) return fail('daily_limit', 429);
    const ed = await edition(platform);
    if (!ed || !ed.picks.length) return fail('no_markets', 502);
    const seen = new Set(st.today.filter(s => s.platform === platform && s.rank).map(s => s.rank));
    const next = ed.picks.find(p => !seen.has(p.rank));
    if (!next) return fail('edition_done');
    const signal = Object.assign({}, next, { published_at: ed.created_at });
    const saved = await rpc('scanner_save', { p_token_hash: hash, p_free: FREE, p_platform: platform, p_rank: next.rank, p_market_id: next.market_id, p_signal: signal });
    if (!saved) return fail('signed_out', 401);
    if (saved.limited) return fail('daily_limit', 429);
    return ok({ signal: saved, left: st.left - 1, limit: st.limit, edition_size: ed.picks.length });
  }
};

async function scanner(body) {
  const b = body && typeof body === 'object' ? body : {};
  if (!TOKEN_RE.test(String(b.token))) return fail('signed_out', 401);
  const fn = Object.prototype.hasOwnProperty.call(ACTIONS, b.action) && ACTIONS[b.action];
  return fn ? fn(b, sessionHash(b.token)) : fail('unknown_action');
}

module.exports = { scanner };
