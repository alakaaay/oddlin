// Simulator trades with play money on live markets. POST /api/trade { action, token, … }
//
//   list {token}                                  → { trades }  every trade of the player; open ones carry the live
//                                                    price (now) and are settled first if their market resolved
//   open {token, platform, market_id, side, amount, est}  → { trade }  price locked from the live market
//   sell {token, id}                              → { trade }  sold at the live bid
//   ack  {token, ids}                             → {}         payouts of these closed trades were added to the simulator cash
//   leaderboard {token}                           → { rows, me } demo traders ranked by realized P&L (top 50)
//   trader {token, pid}                           → { trader }  one trader's full history
//
// Trades settle when the player looks at them: list checks each open trade's market and settles it once it resolved.

const crypto = require('crypto');
const { rpc } = require('./supabase');
const { getMarket } = require('./markets');

const TOKEN_RE = /^[A-Za-z0-9_-]{40,60}$/;
const ID_RE = /^[A-Za-z0-9._-]{1,80}$/;
const MAX_AMOUNT = 1000; // demo dollars per trade
const SIM_START = 1000;  // starting demo cash; keep in sync with SIM_START in public/app/js/util.js

// Same session hashing as lib/auth.js
function sessionHash(token) {
  const s = process.env.AUTH_SECRET || process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!s) throw Object.assign(new Error('AUTH_SECRET is not set'), { status: 503 });
  const key = crypto.createHash('sha256').update('oddlin-auth:' + s).digest();
  return crypto.createHmac('sha256', key).update(['session', token].join(':')).digest('base64url');
}
const ok = body => ({ status: 200, body: Object.assign({ ok: true }, body) });
const fail = (error, status = 400) => ({ status, body: { ok: false, error } });
const round4 = n => Math.round(n * 10000) / 10000;

// Settles one market's open trades (of every player) if it resolved; returns the market, or null if it could not be read
async function settleMarket(platform, id) {
  let m;
  try { m = await getMarket(platform, id); } catch (e) { return null; }
  if (m.outcome != null) await rpc('trade_settle', { p_platform: platform, p_market_id: id, p_outcome: m.outcome });
  return m;
}

const ACTIONS = {
  async list(b, hash) {
    let trades = await rpc('trade_list', { p_token_hash: hash });
    if (trades == null) return fail('signed_out', 401);
    const open = [...new Map(trades.filter(t => t.status === 'open').map(t => [t.platform + ':' + t.market_id, t])).values()];
    const live = new Map();
    let settled = false;
    for (const t of open.slice(0, 20)) {
      const m = await settleMarket(t.platform, t.market_id);
      if (m) { live.set(t.platform + ':' + t.market_id, m); if (m.outcome != null) settled = true; }
    }
    if (settled) trades = await rpc('trade_list', { p_token_hash: hash });
    trades = trades.map(t => {
      const m = t.status === 'open' && live.get(t.platform + ':' + t.market_id);
      return m ? Object.assign(t, { now: t.side === 'yes' ? m.yesBid : m.noBid }) : t;
    });
    return ok({ trades });
  },

  async open(b, hash) {
    const platform = b.platform === 'kalshi' ? 'kalshi' : b.platform === 'polymarket' ? 'polymarket' : null;
    const side = b.side === 'yes' || b.side === 'no' ? b.side : null;
    const amount = Math.floor(Number(b.amount));
    const est = Math.min(99, Math.max(1, Math.round(Number(b.est) || 50)));
    if (!platform || !side || !ID_RE.test(String(b.market_id)) || !(amount >= 1 && amount <= MAX_AMOUNT)) return fail('bad_trade');
    const m = await getMarket(platform, String(b.market_id));
    const price = side === 'yes' ? m.yes : m.no;
    if (!m.open || !(price >= 0.02 && price <= 0.98)) return fail('market_closed');
    const shares = Math.floor(amount / price);
    if (shares < 1) return fail('amount_too_small');
    const title = String(b.title || m.title || '').slice(0, 300) || m.title;
    const trade = await rpc('trade_open', { p_token_hash: hash, p_platform: platform, p_market_id: m.id, p_title: title,
      p_side: side, p_shares: shares, p_price: round4(price), p_est: est });
    return trade ? ok({ trade }) : fail('signed_out', 401);
  },

  async sell(b, hash) {
    const id = Number(b.id);
    if (!Number.isInteger(id) || id < 1) return fail('bad_trade');
    const trades = await rpc('trade_list', { p_token_hash: hash });
    if (trades == null) return fail('signed_out', 401);
    const t = trades.find(x => x.id === id && x.status === 'open');
    if (!t) return fail('not_open');
    const m = await settleMarket(t.platform, t.market_id);
    if (!m) return fail('market_unavailable', 502);
    if (m.outcome != null) return fail('already_settled');
    const bid = t.side === 'yes' ? m.yesBid : m.noBid;
    if (!m.open || !(bid > 0)) return fail('no_buyers');
    const trade = await rpc('trade_sell', { p_token_hash: hash, p_id: id, p_price: round4(bid) });
    return trade ? ok({ trade }) : fail('not_open');
  },

  async leaderboard(b, hash) {
    const r = await rpc('sim_leaderboard', { p_token_hash: hash, p_start: SIM_START });
    return r ? ok(r) : fail('signed_out', 401);
  },

  async trader(b, hash) {
    if (!/^[a-f0-9]{32}$/.test(String(b.pid))) return fail('bad_trader');
    const r = await rpc('sim_trader', { p_token_hash: hash, p_pid: b.pid, p_start: SIM_START });
    return r ? ok({ trader: r }) : fail('not_found', 404);
  },

  async ack(b, hash) {
    const ids = (Array.isArray(b.ids) ? b.ids : []).map(Number).filter(n => Number.isInteger(n) && n > 0).slice(0, 200);
    if (ids.length) await rpc('trade_ack', { p_token_hash: hash, p_ids: ids });
    return ok({});
  }
};

async function trade(body) {
  const b = body && typeof body === 'object' ? body : {};
  if (!TOKEN_RE.test(String(b.token))) return fail('signed_out', 401);
  const fn = Object.prototype.hasOwnProperty.call(ACTIONS, b.action) && ACTIONS[b.action];
  return fn ? fn(b, sessionHash(b.token)) : fail('unknown_action');
}

module.exports = { trade };
