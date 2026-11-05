// Subscriptions and charge history. Beta: no payment provider yet, so charges record what a plan would bill.
// POST /api/billing { action, token, … }
//   get                → { subscriptions, charges }   bills renewals that came due first (no cron)
//   buy {product}      → { subscription }             add-ons bought in the app (Coach Plus)
//   cancel {id}        → { subscription }             no more charges, access until the period ends
//   resume {id}        → { subscription }
// startPlan(email, plan, promo) is called by the quiz purchase and the app sign-up.

const crypto = require('crypto');
const { rpc } = require('./supabase');

// Prices: keep in sync with PLANS in public/js/app.js and APP_PLANS / COACH_PLUS in public/app/js
const PRODUCTS = {
  oddlin_w1: { name: '1-week plan', price: 13, period: '7 days' },
  oddlin_w4: { name: '4-week plan', price: 39, period: '28 days' },
  oddlin_w12: { name: '12-week plan', price: 69, period: '84 days' },
  coach_plus: { name: 'Coach Plus', price: 10, period: '28 days', addon: true }
};
const COACH_BASE = 10, COACH_EXTRA = 10; // questions a day without and on top with Coach Plus

const TOKEN_RE = /^[A-Za-z0-9_-]{40,60}$/;
function sessionHash(token) {
  const s = process.env.AUTH_SECRET || process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!s) throw Object.assign(new Error('AUTH_SECRET is not set'), { status: 503 });
  const key = crypto.createHash('sha256').update('oddlin-auth:' + s).digest();
  return crypto.createHmac('sha256', key).update(['session', token].join(':')).digest('base64url');
}
const ok = body => ({ status: 200, body: Object.assign({ ok: true }, body) });
const fail = (error, status = 400) => ({ status, body: { ok: false, error } });

// Main plan with its first charge (50% off when the promo timer was running). Does nothing if a plan is already running.
async function startPlan(email, plan, promo) {
  const p = PRODUCTS[plan];
  if (!p || p.addon) return null;
  const first = promo ? Math.floor(p.price * 50) / 100 : p.price;
  return rpc('billing_start_plan', { p_email: email, p_product: plan, p_name: p.name, p_price: p.price, p_first: first, p_period: p.period });
}

const ACTIONS = {
  async get(b, hash) {
    const r = await rpc('billing_get', { p_token_hash: hash });
    return r ? ok(r) : fail('signed_out', 401);
  },
  async buy(b, hash) {
    const p = PRODUCTS[b.product];
    if (!p || !p.addon) return fail('bad_product');
    const s = await rpc('billing_buy', { p_token_hash: hash, p_product: b.product, p_name: p.name, p_price: p.price, p_period: p.period });
    return s ? ok({ subscription: s }) : fail('signed_out', 401);
  },
  async cancel(b, hash) { return change('billing_cancel', b, hash); },
  async resume(b, hash) { return change('billing_resume', b, hash); }
};
async function change(fn, b, hash) {
  const id = Number(b.id);
  if (!Number.isInteger(id) || id < 1) return fail('bad_subscription');
  const s = await rpc(fn, { p_token_hash: hash, p_id: id });
  if (!s) return fail('signed_out', 401);
  return s.error ? fail(s.error) : ok({ subscription: s });
}

async function billing(body) {
  const b = body && typeof body === 'object' ? body : {};
  if (!TOKEN_RE.test(String(b.token))) return fail('signed_out', 401);
  const fn = Object.prototype.hasOwnProperty.call(ACTIONS, b.action) && ACTIONS[b.action];
  return fn ? fn(b, sessionHash(b.token)) : fail('unknown_action');
}

module.exports = { billing, startPlan, PRODUCTS, COACH_BASE, COACH_EXTRA };
