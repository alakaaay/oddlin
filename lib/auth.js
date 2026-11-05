// App sign-in for /app. One JSON endpoint (POST /api/auth) with an "action" field, plus the paywall hook (POST /api/purchase).
//
// Flow:
//   start {email}            pending user → a 6-digit code is emailed     → { next: 'code' }
//                            active user                                    → { next: 'password' }
//                            unknown email                                  → { next: 'no_account' }
//   signup {email, plan, name, topics, minutes, level}  new user from the app (no quiz): account + code email → { next: 'code' }
//                            (an email that already has an active account → { next: 'password' })
//   forgot {email}           active user forgot the password → a code is emailed → { next: 'code' }
//   verify {email, code}     right code → a one-time setup token           → { setup }
//   set_password {email, setup, password}  activates the account          → { token, user }
//   login {email, password}  active user                                   → { token, user }
//   me {token} · profile {token, name, topics, minutes, level} · logout {token}
//   progress_load {token} → { data } · progress_save {token, data} · leaderboard {token} → { rank, rows } (players of the caller's rank)
//
// Secrets never stored in plain text: codes and tokens as HMAC-SHA256, passwords as scrypt.
// Env: AUTH_SECRET (optional; falls back to a hash of the Supabase secret key), RESEND_API_KEY for the code email.

const crypto = require('crypto');
const { rpc, SESSION_RE } = require('./supabase');
const { startPlan } = require('./billing');
const { sendMail } = require('./mail');

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const TOKEN_RE = /^[A-Za-z0-9_-]{40,60}$/;
const TOPICS = ['The Fed', 'Inflation', 'Jobs', 'Elections', 'Economy', 'Weather'];
// Quiz answer codes (public/funnel.json) → app profile fields
const QUIZ_TOPIC = { fed: 'The Fed', inflation: 'Inflation', jobs: 'Jobs', elections: 'Elections', weather: 'Weather' };
const QUIZ_LEVEL = { never: 'new', once: 'some', some: 'experienced' };
const LEVELS = ['new', 'some', 'experienced'];
// XP where each rank starts. Must match RANKS in public/app/app.js. Each step is bigger than the one before.
const RANK_XP = [0, 100, 250, 475, 800, 1250, 1850, 2650, 3700, 5100];
const MAX_PROGRESS = 200 * 1024; // bytes of JSON per user

function secret() {
  const s = process.env.AUTH_SECRET || process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!s) throw Object.assign(new Error('AUTH_SECRET is not set'), { status: 503 });
  return crypto.createHash('sha256').update('oddlin-auth:' + s).digest();
}
const mac = (...parts) => crypto.createHmac('sha256', secret()).update(parts.join(':')).digest('base64url');
const newToken = () => crypto.randomBytes(32).toString('base64url');
const newCode = () => String(crypto.randomInt(0, 1e6)).padStart(6, '0');

// scrypt$N$r$p$salt$hash
function hashPassword(pw) {
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(pw, salt, 64, { N: 16384, r: 8, p: 1 });
  return `scrypt$16384$8$1$${salt.toString('base64')}$${hash.toString('base64')}`;
}
function checkPassword(pw, stored) {
  const [alg, N, r, p, salt, hash] = String(stored || '').split('$');
  if (alg !== 'scrypt' || !hash) return false;
  const want = Buffer.from(hash, 'base64');
  const got = crypto.scryptSync(pw, Buffer.from(salt, 'base64'), want.length, { N: +N, r: +r, p: +p });
  return crypto.timingSafeEqual(want, got);
}

const ok = body => ({ status: 200, body: Object.assign({ ok: true }, body) });
const fail = (error, status = 400) => ({ status, body: { ok: false, error } });
const cleanEmail = e => String(e || '').trim().toLowerCase();
const publicUser = u => { if (!u) return null; const c = Object.assign({}, u); delete c.password_hash; delete c.locked_until; return c; };

// Email is sent only for these two cases: the first sign-in and a forgotten password.
function codeEmail(code, reset) {
  const what = reset ? 'password reset code' : 'sign-in code';
  const text = `Your Oddlin ${what} is ${code}\n\nIt works for 10 minutes. If you didn't ask for it, ignore this email.`;
  const html = `<!doctype html><html><body style="margin:0;background:#F6F7F9;font-family:Helvetica,Arial,sans-serif;color:#111318">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="padding:24px 12px"><tr><td align="center">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:420px;background:#fff;border:1px solid #E3E6EC;border-radius:16px">
  <tr><td style="padding:28px 24px;text-align:center">
    <div style="font-size:13px;letter-spacing:.08em;text-transform:uppercase;color:#3352E0">Oddlin</div>
    <div style="font-size:20px;font-weight:bold;margin:10px 0 18px">Your ${what}</div>
    <div style="font-size:36px;font-weight:bold;letter-spacing:10px;background:#E8EDFF;border-radius:12px;padding:16px 0">${code}</div>
    <p style="font-size:14px;color:#5E6573;margin:18px 0 0">It works for 10 minutes. If you didn't ask for it, ignore this email.</p>
  </td></tr></table></td></tr></table></body></html>`;
  return { subject: `${code} is your Oddlin ${reset ? 'reset ' : ''}code`, text, html };
}

async function signIn(user) {
  const token = newToken();
  await rpc('session_create', { p_user_id: user.id, p_token_hash: mac('session', token) });
  return ok({ token, user: publicUser(user) });
}

async function emailCode(u, email, reset) {
  const code = newCode();
  const stored = await rpc('auth_store_code', { p_user_id: u.id, p_code_hash: mac('code', u.id, code) });
  if (stored === 'cooldown') return ok({ next: 'code', resent: false, cooldown: true });
  try { await sendMail(Object.assign({ to: email }, codeEmail(code, reset))); }
  catch (err) { console.error(`code email: ${err.message}`); return fail('email_failed', 502); }
  return ok({ next: 'code', resent: true });
}

const ACTIONS = {
  async start(b) {
    const email = cleanEmail(b.email);
    if (!EMAIL_RE.test(email) || email.length > 254) return fail('invalid_email');
    const u = await rpc('auth_user', { p_email: email });
    if (!u) return ok({ next: 'no_account' });
    if (u.status === 'active') return ok({ next: 'password' });
    return emailCode(u, email, false);
  },

  async signup(b) {
    const email = cleanEmail(b.email);
    if (!EMAIL_RE.test(email) || email.length > 254) return fail('invalid_email');
    const plan = ['oddlin_w1', 'oddlin_w4', 'oddlin_w12'].includes(b.plan) ? b.plan : 'oddlin_w4';
    const topics = [...new Set((Array.isArray(b.topics) ? b.topics : []).filter(t => TOPICS.includes(t)))];
    const minutes = [5, 10, 15, 20].includes(Number(b.minutes)) ? Number(b.minutes) : 10;
    const level = LEVELS.includes(b.level) ? b.level : null;
    const name = String(b.name || '').trim().slice(0, 40) || null;
    const status = await rpc('signup_app_user', { p_email: email, p_plan: plan, p_topics: topics.length ? topics : null, p_minutes: minutes, p_level: level, p_name: name });
    await startPlan(email, plan, b.promo === true); // no-op when the account already has a plan running
    if (status === 'active') return ok({ next: 'password' });
    const u = await rpc('auth_user', { p_email: email });
    return emailCode(u, email, false);
  },

  async forgot(b) {
    const email = cleanEmail(b.email);
    if (!EMAIL_RE.test(email) || email.length > 254) return fail('invalid_email');
    const u = await rpc('auth_user', { p_email: email });
    if (!u) return ok({ next: 'no_account' });
    return emailCode(u, email, u.status === 'active');
  },

  async verify(b) {
    const email = cleanEmail(b.email), code = String(b.code || '').replace(/\D/g, '');
    if (code.length !== 6) return fail('bad_code');
    const u = await rpc('auth_user', { p_email: email });
    if (!u) return fail('bad_code');
    const setup = newToken();
    const r = await rpc('auth_verify_code', { p_user_id: u.id, p_code_hash: mac('code', u.id, code), p_setup_hash: mac('setup', setup) });
    if (r !== 'ok') return fail(r === 'bad' ? 'bad_code' : r === 'locked' ? 'too_many_tries' : 'code_expired');
    return ok({ setup });
  },

  async set_password(b) {
    const email = cleanEmail(b.email), pw = String(b.password || ''), setup = String(b.setup || '');
    if (pw.length < 8 || pw.length > 200) return fail('weak_password');
    if (!TOKEN_RE.test(setup)) return fail('denied');
    const u = await rpc('auth_user', { p_email: email });
    if (!u) return fail('denied');
    const r = await rpc('auth_set_password', { p_user_id: u.id, p_setup_hash: mac('setup', setup), p_password_hash: hashPassword(pw) });
    if (r !== 'ok') return fail('denied');
    return signIn(Object.assign({}, u, { status: 'active' }));
  },

  async login(b) {
    const email = cleanEmail(b.email), pw = String(b.password || '');
    const u = await rpc('auth_user', { p_email: email });
    if (!u || u.status !== 'active') return fail('wrong_password');
    if (u.locked_until && new Date(u.locked_until) > new Date()) return fail('locked', 429);
    const good = pw.length <= 200 && checkPassword(pw, u.password_hash);
    await rpc('auth_login_result', { p_user_id: u.id, p_ok: good });
    if (!good) return fail('wrong_password');
    return signIn(u);
  },

  async me(b) {
    if (!TOKEN_RE.test(String(b.token))) return fail('signed_out', 401);
    const u = await rpc('session_lookup', { p_token_hash: mac('session', b.token) });
    return u ? ok({ user: u }) : fail('signed_out', 401);
  },

  async profile(b) {
    if (!TOKEN_RE.test(String(b.token))) return fail('signed_out', 401);
    const name = String(b.name || '').trim().slice(0, 40) || null;
    const topics = (Array.isArray(b.topics) ? b.topics : []).filter(t => TOPICS.includes(t));
    const minutes = [5, 10, 15, 20].includes(Number(b.minutes)) ? Number(b.minutes) : 10;
    const level = LEVELS.includes(b.level) ? b.level : null;
    const u = await rpc('user_save_profile', { p_token_hash: mac('session', b.token), p_name: name, p_topics: topics, p_minutes: minutes, p_level: level });
    return u ? ok({ user: u }) : fail('signed_out', 401);
  },

  async progress_load(b) {
    if (!TOKEN_RE.test(String(b.token))) return fail('signed_out', 401);
    const data = await rpc('progress_get', { p_token_hash: mac('session', b.token) });
    return data == null ? fail('signed_out', 401) : ok({ data });
  },

  async progress_save(b) {
    if (!TOKEN_RE.test(String(b.token))) return fail('signed_out', 401);
    const data = b.data && typeof b.data === 'object' && !Array.isArray(b.data) ? b.data : null;
    if (!data) return fail('bad_data');
    if (JSON.stringify(data).length > MAX_PROGRESS) return fail('too_large', 413);
    const xp = Math.max(0, Math.min(1e7, Math.floor(Number(data.xp) || 0)));
    const saved = await rpc('progress_save', { p_token_hash: mac('session', b.token), p_data: data, p_xp: xp });
    return saved ? ok({}) : fail('signed_out', 401);
  },

  async leaderboard(b) {
    if (!TOKEN_RE.test(String(b.token))) return fail('signed_out', 401);
    const hash = mac('session', b.token);
    const data = await rpc('progress_get', { p_token_hash: hash });
    if (data == null) return fail('signed_out', 401);
    const xp = Math.max(0, Number(data.xp) || 0);
    let rank = 0; while (rank + 1 < RANK_XP.length && xp >= RANK_XP[rank + 1]) rank++;
    const max = rank + 1 < RANK_XP.length ? RANK_XP[rank + 1] : 1e9;
    const rows = await rpc('leaderboard', { p_token_hash: hash, p_min_xp: RANK_XP[rank], p_max_xp: max });
    return ok({ rank, rows: rows || [] });
  },

  async logout(b) {
    if (TOKEN_RE.test(String(b.token))) await rpc('session_delete', { p_token_hash: mac('session', b.token) });
    return ok({});
  }
};

async function auth(body) {
  const b = body && typeof body === 'object' ? body : {};
  const fn = Object.prototype.hasOwnProperty.call(ACTIONS, b.action) && ACTIONS[b.action];
  return fn ? fn(b) : fail('unknown_action');
}

// Quiz paywall paid: create the pending account for the email left in the quiz.
async function purchase(body) {
  const b = body && typeof body === 'object' ? body : {};
  const email = cleanEmail(b.email);
  if (!EMAIL_RE.test(email) || email.length > 254) return fail('invalid_email');
  if (!SESSION_RE.test(String(b.session_id))) return fail('invalid_session');
  const plan = /^[a-z0-9_-]{1,40}$/.test(String(b.plan)) ? b.plan : null;
  // Quiz answers become the app profile, so a user from the quiz skips the in-app onboarding
  const a = b.answers && typeof b.answers === 'object' ? b.answers : {};
  const topics = [...new Set((Array.isArray(a.events) ? a.events : []).map(c => QUIZ_TOPIC[c]).filter(Boolean))];
  const minutes = [5, 10, 15].includes(Number(a.time)) ? Number(a.time) : null;
  const level = QUIZ_LEVEL[a.experience] || null;
  await rpc('create_app_user', { p_email: email, p_session_id: b.session_id, p_plan: plan, p_topics: topics.length ? topics : null, p_minutes: minutes, p_level: level });
  if (plan) await startPlan(email, plan, b.promo === true);
  return ok({});
}

module.exports = { auth, purchase, hashPassword, checkPassword, codeEmail };
