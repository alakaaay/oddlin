// Sign-in gate: welcome choice, in-app sign-up, email code, password, reset, onboarding, progress load.
import { ALL } from './course.js';
import { startNode } from './player.js';
import { checkBadges, level, tip } from './progression.js';
import { route } from './router.js';
import { applyTheme } from './settings.js';
import { S, fresh, paintBar, pushProgress, replaceState, save, settleStreak } from './state.js';
import { $, KEY, esc } from './util.js';

// Accounts are created when the quiz paywall is paid (status pending). First visit: email → 6-digit code →
// new password → short onboarding → lesson 1. Later visits: email → password. The session token lives in localStorage.
export const TOKEN_KEY = 'oddlin_token';
export const getToken = () => { try { return localStorage.getItem(TOKEN_KEY); } catch (e) { return null; } };
export const setToken = t => { try { t ? localStorage.setItem(TOKEN_KEY, t) : localStorage.removeItem(TOKEN_KEY); } catch (e) {} };
export async function api(action, data) {
  try {
    const r = await fetch('/api/auth', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(Object.assign({ action }, data)) });
    return await r.json();
  } catch (e) { return { ok: false, error: 'network' }; }
}
export const ERR = {
  invalid_email: 'That doesn’t look like an email address.',
  bad_code: 'That code isn’t right. Check the email and try again.',
  code_expired: 'This code has expired. Send a new one.',
  too_many_tries: 'Too many wrong tries. Send a new code.',
  weak_password: 'Use at least 8 characters.',
  wrong_password: 'Wrong email or password.',
  locked: 'Too many wrong tries. Try again in 15 minutes.',
  email_failed: 'We couldn’t send the email. Try again in a minute.',
  denied: 'This step expired. Start again with your email.',
  network: 'No connection. Check your internet and try again.'
};
export const TOPIC_OPTS = ['The Fed', 'Inflation', 'Jobs', 'Elections', 'Economy', 'Weather'];
export const APP_PLANS = [
  { id: 'oddlin_w1', name: '1-week plan', price: 9.99, every: 'every week', days: 7 },
  { id: 'oddlin_w4', name: '4-week plan', price: 29, every: 'every 4 weeks', days: 28, popular: true },
  { id: 'oddlin_w12', name: '12-week plan', price: 69, every: 'every 12 weeks', days: 84 }
];
export const usd = n => '$' + (Number.isInteger(n) ? n : n.toFixed(2));
// New-user steps in order (welcome → "I'm new"); the back button walks this list
export const NEW_FLOW = ['n0', 'n1', 'n2', 'n3', 'nplan', 'nemail'];
export const PROMO_MIN = 10; // 50% off the first payment, reserved for 10 minutes from the first look at the plans
export const LEVEL_OPTS = [['new', 'Brand new'], ['some', 'I know a bit'], ['experienced', 'I’ve traded before']];

export function gate(startStep) {
  let step = startStep || 'email', email = '', setup = '', err = '', busy = false, resendAt = 0;
  let reset = false, wrongPw = false; // reset = forgot-password flow; wrongPw shows the "Forgot password?" link
  let isNew = false, plan = 'oddlin_w4'; // isNew = signing up in the app (welcome → "I'm new")
  let promoUntil = 0, promoShown = false;
  const promoLeft = () => Math.max(0, promoUntil - Date.now());
  const firstPrice = x => promoLeft() ? Math.floor(x.price * 50) / 100 : x.price;
  const mmss = ms => { const t = Math.ceil(ms / 1000); return `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`; };
  try { email = localStorage.getItem('oddlin_signup_email') || ''; } catch (e) {}
  const prof = { name: '', topics: [], minutes: 10, level: null };
  let g = $('#gate');
  if (!g) { g = document.createElement('div'); g.id = 'gate'; document.body.appendChild(g); }
  document.body.classList.add('gated');
  const field = (id, type, ph, ac, extra = '') => `<input class="g-in" id="${id}" type="${type}" placeholder="${ph}" autocomplete="${ac}" ${extra}>`;
  function view() {
    const back = !['welcome', 'ready'].includes(step) && !step.startsWith('ob') ? '<button class="x" data-g="back" aria-label="Back">‹</button>' : '<span></span>';
    const obN = { ob1: 1, ob2: 2, ob3: 3, ob4: 4 }[step];
    const nN = NEW_FLOW.indexOf(step) + 1;
    let body = '';
    if (step === 'welcome') body = `<div class="g-hero"><img src="/assets/logo/oddlin-icon.svg" alt="" width="72" height="72"></div>
      <h1>Learn prediction markets, the safe way</h1><p class="muted">Short daily lessons and a play-money simulator on real events.</p>
      <div class="g-split"><button class="btn" data-g="new">I’m new here</button><button class="btn ghost" data-g="have">I already have an account</button></div>`;
    if (step === 'n0') body = `<h1>What should we call you?</h1><p class="muted">Your name shows on your profile and the leaderboard.</p>
      ${field('g-name', 'text', 'Your first name', 'given-name', `maxlength="40" value="${esc(prof.name)}"`)}
      <button class="btn" data-g="n0">Continue</button>`;
    if (step === 'n1') body = `<h1>What do you want to follow?</h1><p class="muted">Pick all that interest you. Your lessons and markets follow these.</p>
      <div class="g-chips">${TOPIC_OPTS.map(t => `<button class="g-chip" data-topic="${t}" aria-pressed="${prof.topics.includes(t)}">${t}</button>`).join('')}</div>
      <button class="btn" data-g="n1" ${prof.topics.length ? '' : 'disabled'}>Continue</button>`;
    if (step === 'n2') body = `<h1>How much time a day?</h1><p class="muted">Small and steady works best. You can change it later.</p>
      <div class="g-opts">${[5, 10, 15, 20].map(m => `<button class="opt" data-min="${m}" aria-pressed="${prof.minutes === m}">${m} minutes</button>`).join('')}</div>
      <button class="btn" data-g="n2">Continue</button>`;
    if (step === 'n3') body = `<h1>How well do you know prediction markets?</h1><p class="muted">No wrong answers. It helps us pace your plan.</p>
      <div class="g-opts">${LEVEL_OPTS.map(([v, l]) => `<button class="opt" data-level="${v}" aria-pressed="${prof.level === v}">${l}</button>`).join('')}</div>
      <button class="btn" data-g="n3" ${prof.level ? '' : 'disabled'}>Continue</button>`;
    if (step === 'nplan') { const P = APP_PLANS.find(x => x.id === plan), on = promoLeft() > 0; promoShown = on; body = `
      ${on ? `<div class="g-timer"><span>🎟️ 50% off your first payment</span><b id="g-tleft">${mmss(promoLeft())}</b></div>` : ''}
      <h1>${on ? `${prof.name ? esc(prof.name) + ', start' : 'Start'} your plan at 50% off` : 'Choose your plan'}</h1>
      <p class="muted">${esc(prof.topics.join(', '))} · ${prof.minutes} min a day</p>
      <div class="g-opts">${APP_PLANS.map(x => `<button class="opt g-plan" data-plan="${x.id}" aria-pressed="${plan === x.id}">
        <span><b>${x.name}</b>${x.popular ? ' <span class="chip">Most popular</span>' : ''}<br>
          <span class="small muted">${on ? `<s>${usd(x.price)}</s> ${usd(firstPrice(x))} first, then ${usd(x.price)} ${x.every}` : `${usd(x.price)} ${x.every}`}</span></span>
        <span class="g-pd"><b>${usd(+(firstPrice(x) / x.days).toFixed(2))}</b><span class="small muted">per day</span></span></button>`).join('')}</div>
      <button class="btn gold" data-g="nplan">Start my plan${on ? ` · ${usd(firstPrice(P))}` : ''}</button>
      <p class="disc">Today: ${usd(firstPrice(P))}. Renews automatically at ${usd(P.price)} ${P.every} until you cancel. Cancel anytime before the next charge. Beta: no payment is taken yet.</p>`; }
    if (step === 'nemail') body = `<h1>Create your account</h1><p class="muted">We’ll send a 6-digit code to confirm your email.</p>
      ${field('g-email', 'email', 'you@example.com', 'email', `inputmode="email" autocapitalize="off" spellcheck="false" value="${esc(email)}"`)}
      <button class="btn" data-g="nemail">Send code</button>
      <p class="disc">By continuing you confirm you’re 18 or older and agree to our <a href="/terms" target="_blank" rel="noopener">Terms</a> and <a href="/privacy-policy" target="_blank" rel="noopener">Privacy Policy</a>.</p>`;
    if (step === 'email') body = `<div class="g-hero"><img src="/assets/logo/oddlin-icon.svg" alt="" width="64" height="64"></div>
      <h1>Welcome to Oddlin</h1><p class="muted">Sign in with the email you used in the quiz.</p>
      ${field('g-email', 'email', 'you@example.com', 'email', `inputmode="email" autocapitalize="off" spellcheck="false" value="${esc(email)}"`)}
      <button class="btn" data-g="email">Continue</button>`;
    if (step === 'no_account') body = `<div class="g-hero">🔍</div><h1>No plan for this email</h1>
      <p class="muted">We couldn’t find a plan for <b>${esc(email)}</b>. Check the spelling, or take the quiz to get your plan.</p>
      <button class="btn" data-g="retry">Try another email</button><a class="btn ghost" href="/quiz">Take the quiz</a>`;
    if (step === 'code') body = `<div class="g-hero">✉️</div><h1>${reset ? 'Reset your password' : 'Check your email'}</h1>
      <p class="muted">We sent a 6-digit code to <b>${esc(email)}</b>. It works for 10 minutes.</p>
      <input class="g-in g-code" id="g-code" type="text" placeholder="000000" autocomplete="one-time-code" inputmode="numeric" maxlength="6">
      <button class="btn" data-g="code">Verify</button>
      <button class="link center" data-g="resend" ${Date.now() < resendAt ? 'disabled' : ''}>${Date.now() < resendAt ? `Send a new code in ${Math.ceil((resendAt - Date.now()) / 1000)}s` : 'Send a new code'}</button>`;
    if (step === 'newpw') body = `<div class="g-hero">🔐</div><h1>${reset ? 'Set a new password' : 'Create a password'}</h1>
      <p class="muted">${reset ? 'Use it from now on. Other devices will be signed out.' : 'Next time you’ll sign in with your email and this password.'}</p>
      ${field('g-pw1', 'password', 'New password (8+ characters)', 'new-password')}${field('g-pw2', 'password', 'Repeat password', 'new-password')}
      <button class="btn" data-g="newpw">Save password</button>`;
    if (step === 'password') body = `<div class="g-hero">👋</div><h1>Welcome back</h1>
      <p class="muted">Enter the password for <b>${esc(email)}</b>.</p>
      ${field('g-pw', 'password', 'Password', 'current-password')}
      <button class="btn" data-g="login">Sign in</button>
      ${wrongPw ? '<button class="link center" data-g="forgot">Forgot password?</button>' : ''}`;
    if (step === 'ob1') body = `<h1>What should we call you?</h1><p class="muted">Your name shows on your profile and leaderboard.</p>
      ${field('g-name', 'text', 'Your first name', 'given-name', `maxlength="40" value="${esc(prof.name)}"`)}
      <button class="btn" data-g="ob1">Continue</button>`;
    if (step === 'ob2') body = `<h1>What do you want to follow?</h1><p class="muted">Pick all that interest you. We’ll use them for your lessons and markets.</p>
      <div class="g-chips">${TOPIC_OPTS.map(t => `<button class="g-chip" data-topic="${t}" aria-pressed="${prof.topics.includes(t)}">${t}</button>`).join('')}</div>
      <button class="btn" data-g="ob2" ${prof.topics.length ? '' : 'disabled'}>Continue</button>`;
    if (step === 'ob3') body = `<h1>How much time a day?</h1><p class="muted">Small and steady works best. You can change it later.</p>
      <div class="g-opts">${[5, 10, 15, 20].map(m => `<button class="opt" data-min="${m}" aria-pressed="${prof.minutes === m}">${m} minutes</button>`).join('')}</div>
      <button class="btn" data-g="ob3">Continue</button>`;
    if (step === 'ob4') body = `<h1>How well do you know prediction markets?</h1><p class="muted">No wrong answers. It helps us pace your plan.</p>
      <div class="g-opts">${LEVEL_OPTS.map(([v, l]) => `<button class="opt" data-level="${v}" aria-pressed="${prof.level === v}">${l}</button>`).join('')}</div>
      <button class="btn" data-g="ob4" ${prof.level ? '' : 'disabled'}>Continue</button>`;
    if (step === 'ready') body = `<div class="g-hero">🚀</div><h1>You’re all set${prof.name ? ', ' + esc(prof.name) : ''}!</h1>
      <p class="muted">Your 28-day plan starts now. Lesson 1 takes about 3 minutes.</p>
      <button class="btn gold" data-g="go">Start lesson 1</button>`;
    g.innerHTML = `<div class="g-in-wrap">
      <div class="g-top">${back}${obN ? `<div class="segs">${[1, 2, 3, 4].map(i => `<i class="${i < obN ? 'full' : i === obN ? 'now' : ''}"></i>`).join('')}</div>`
        : nN ? `<div class="segs">${NEW_FLOW.map((_, i) => `<i class="${i + 1 < nN ? 'full' : i + 1 === nN ? 'now' : ''}"></i>`).join('')}</div>` : ''}</div>
      <form class="g-body" novalidate>${body}${err ? `<p class="feedback miss" role="alert">${esc(err)}</p>` : ''}</form></div>`;
    const first = g.querySelector('input'); if (first) setTimeout(() => first.focus(), 50);
  }
  const go = s => { step = s; err = ''; view(); };
  async function act(what) {
    if (busy) return; busy = true;
    const val = id => (g.querySelector('#' + id) || {}).value || '';
    try {
      if (what === 'nemail') {
        email = val('g-email').trim().toLowerCase();
        const r = await api('signup', Object.assign({ email, plan }, prof));
        if (!r.ok) { err = ERR[r.error] || 'Something went wrong. Try again.'; return view(); }
        if (r.next === 'password') { isNew = false; go('password'); tip('You already have an account. Sign in with your password.'); return; }
        resendAt = Date.now() + 60000;
        return go('code');
      }
      if (what === 'forgot') {
        const r = await api('forgot', { email });
        if (!r.ok) { err = ERR[r.error] || 'Something went wrong. Try again.'; return view(); }
        if (r.next === 'no_account') return go('no_account');
        reset = true; resendAt = Date.now() + 60000;
        return go('code');
      }
      if (what === 'email' || what === 'resend') {
        if (what === 'email') { email = val('g-email').trim().toLowerCase(); reset = false; wrongPw = false; }
        const r = await api(reset ? 'forgot' : 'start', { email });
        if (!r.ok) { err = ERR[r.error] || 'Something went wrong. Try again.'; return view(); }
        if (r.next === 'no_account') return go('no_account');
        if (r.next === 'password') return go('password');
        resendAt = Date.now() + 60000;
        if (r.cooldown && what === 'resend') { err = 'A code was just sent. Wait a minute before asking again.'; return view(); }
        return go('code');
      }
      if (what === 'code') {
        const r = await api('verify', { email, code: val('g-code') });
        if (!r.ok) { err = ERR[r.error] || 'Something went wrong.'; return view(); }
        setup = r.setup; return go('newpw');
      }
      if (what === 'newpw') {
        const a = val('g-pw1'), b = val('g-pw2');
        if (a.length < 8) { err = ERR.weak_password; return view(); }
        if (a !== b) { err = 'Passwords don’t match.'; return view(); }
        const r = await api('set_password', { email, setup, password: a });
        if (!r.ok) { err = ERR[r.error] || 'Something went wrong.'; if (r.error === 'denied') step = 'email'; return view(); }
        setToken(r.token); adopt(r.user);
        if (reset) { done(false); tip('Password updated. You’re signed in.'); return; }
        return r.user.onboarded ? done(true) : go('ob1'); // came from the quiz: profile is filled, start lesson 1
      }
      if (what === 'login') {
        const r = await api('login', { email, password: val('g-pw') });
        if (!r.ok) { err = ERR[r.error] || 'Something went wrong.'; wrongPw = true; return view(); }
        setToken(r.token); adopt(r.user);
        return r.user.onboarded ? done(false) : go('ob1');
      }
      if (what === 'ob4') {
        const r = await api('profile', Object.assign({ token: getToken() }, prof));
        if (!r.ok) { err = ERR[r.error] || 'Couldn’t save. Try again.'; return view(); }
        adopt(r.user); return go('ready');
      }
    } finally { busy = false; }
  }
  async function done(firstRun) {
    await loadProgress();
    g.innerHTML = ''; document.body.classList.remove('gated');
    location.hash = '#/learn'; route(); checkBadges();
    if (firstRun) startNode(ALL[0]); // the very first sign-in goes straight into lesson 1
  }
  g.onsubmit = e => e.preventDefault();
  g.onclick = e => {
    const t = e.target.closest('[data-topic]'); if (t) { const v = t.dataset.topic; prof.topics = prof.topics.includes(v) ? prof.topics.filter(x => x !== v) : prof.topics.concat(v); view(); return; }
    const m = e.target.closest('[data-min]'); if (m) { prof.minutes = +m.dataset.min; view(); return; }
    const l = e.target.closest('[data-level]'); if (l) { prof.level = l.dataset.level; view(); return; }
    const pl = e.target.closest('[data-plan]'); if (pl) { plan = pl.dataset.plan; view(); return; }
    const b = e.target.closest('[data-g]'); if (!b) return;
    e.preventDefault();
    const a = b.dataset.g;
    if (a === 'back') {
      if (NEW_FLOW.includes(step)) return go(NEW_FLOW.indexOf(step) ? NEW_FLOW[NEW_FLOW.indexOf(step) - 1] : 'welcome');
      if (step === 'newpw') return go('code');
      if (step === 'code') return go(reset ? 'password' : isNew ? 'nemail' : 'email');
      if (step === 'email') return go('welcome');
      return go(isNew ? 'nemail' : 'email');
    }
    if (a === 'new') { isNew = true; return go('n0'); }
    if (a === 'n0') { prof.name = (g.querySelector('#g-name').value || '').trim().slice(0, 40); return go('n1'); }
    if (a === 'have') { isNew = false; return go('email'); }
    if (a === 'n1') return go('n2');
    if (a === 'n2') return go('n3');
    if (a === 'n3') { if (!promoUntil) promoUntil = Date.now() + PROMO_MIN * 60000; return go('nplan'); }
    if (a === 'nplan') return go('nemail');
    if (a === 'retry') return go('email');
    if (a === 'ob1') { prof.name = (g.querySelector('#g-name').value || '').trim().slice(0, 40); return go('ob2'); }
    if (a === 'ob2') return go('ob3');
    if (a === 'ob3') return go('ob4');
    if (a === 'go') return done(true);
    act(a);
  };
  g.onkeydown = e => { if (e.key === 'Enter') { const b = g.querySelector('.btn[data-g]:not([disabled])'); if (b) { e.preventDefault(); b.click(); } } };
  setInterval(() => {
    if (step !== 'nplan') return;
    const t = g.querySelector('#g-tleft');
    if (promoLeft() > 0) { if (t) t.textContent = mmss(promoLeft()); }
    else if (promoShown) view(); // timer ran out: show full prices
  }, 1000);
  setInterval(() => { if (step === 'code' && resendAt > Date.now() - 1000) { const r = g.querySelector('[data-g="resend"]'); if (r) { const left = Math.ceil((resendAt - Date.now()) / 1000); r.disabled = left > 0; r.textContent = left > 0 ? `Send a new code in ${left}s` : 'Send a new code'; } } }, 1000);
  view();
}
// The signed-in user's profile feeds the local app state. Progress is kept per account on this device.
export function adopt(u) {
  if (!u) return;
  if (S.uid && S.uid !== u.id) { replaceState(fresh()); }
  S.uid = u.id; S.user = u;
  if (u.name) S.name = u.name;
  if (u.topics && u.topics.length) S.topics = u.topics;
  if (u.minutes) S.minutes = u.minutes;
  try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) {}
}
// Server progress wins. An account with nothing saved yet takes what this device has (a fresh state for a new account).
export async function loadProgress() {
  const r = await api('progress_load', { token: getToken() });
  if (!r.ok) return;
  const u = S.user, uid = S.uid;
  if (r.data && Object.keys(r.data).length) {
    replaceState(Object.assign(fresh(), r.data, { user: u, uid }));
    if (u && u.name && (!S.name || S.name === 'You')) S.name = u.name;
    applyTheme(); settleStreak();
    try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) {}
    paintBar();
  } else { save(); pushProgress(); }
}
export async function logout() {
  const t = getToken(); setToken(null);
  if (t) api('logout', { token: t });
  gate('welcome');
}
