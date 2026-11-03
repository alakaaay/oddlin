/* Funnel events go to the Meta Pixel (loaded in <head>) and to dataLayer for a future GTM / GA4 setup */
function track(type, name, params) {
  try { window.fbq(type, name, params || {}); } catch (e) {}
  (window.dataLayer = window.dataLayer || []).push(Object.assign({ event: name }, params || {}));
}

/* Commerce events carry content_ids and content_type so Meta can match them to a catalog.
   Product ids: oddlin_w1, oddlin_w4, oddlin_w12 for the plans, trade_audit for the upsell. */
const AUDIT_ID = 'trade_audit';
const planId = p => 'oddlin_' + p.id;
function product(ids, name, value) {
  const params = { content_ids: ids, content_type: 'product', content_name: name };
  if (value !== undefined) Object.assign(params, { value, currency: 'USD', contents: ids.map(id => ({ id, quantity: 1 })) });
  return params;
}

/* Email goes to our server (/api/subscribe) with the quiz answers. The funnel never waits on it:
   keepalive lets the request finish even as the screen changes. */
function saveEmail(email) {
  try {
    fetch('/api/subscribe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, answers: state.ans, page: location.pathname }),
      keepalive: true
    }).catch(() => {});
  } catch (e) {}
}

/* Meta advanced matching: re-init the pixel with the email so Lead and later events carry it.
   We send a SHA-256 hash of the normalized address, never the address itself. */
async function matchEmail(email) {
  try {
    const norm = email.trim().toLowerCase();
    const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(norm));
    const em = [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');
    window.fbq('init', '1801702574890246', { em });
  } catch (e) {}
}

/* One QuizAnswer per answered step: step number, step id, question and the answer as code and label.
   value is a string or an array (multi-select); labels come from the step's options when it has them. */
function trackAnswer(s, value, question = s.q, options = s.options) {
  const codes = [].concat(value);
  const label = v => ((options || []).find(o => o.v === v) || {}).label || v;
  track('trackCustom', 'QuizAnswer', {
    step_number: state.idx,
    step_id: s.id,
    question: String(question || '').replace(/<[^>]+>/g, ''),
    answer: codes.join(','),
    answer_label: codes.map(label).join(', ')
  });
}

const DISCLAIMER = 'Information only, not financial advice. Prediction markets involve risk of loss. Past signal performance does not guarantee future results.';
const PROMO_MIN = 10;
const DEVICE_Q = 'Where do you usually place trades?';
const DEVICE_OPTS = [{ v: 'phone', label: 'On my phone' }, { v: 'laptop', label: 'On a laptop or desktop' }, { v: 'both', label: 'Both' }];

const MARKETS = [
  { v: 'sports', label: 'Sports', n: 28 },
  { v: 'econ', label: 'Economics & the Fed', n: 9 },
  { v: 'politics', label: 'Politics', n: 6 },
  { v: 'weather', label: 'Weather', n: 7 },
  { v: 'crypto', label: 'Crypto', n: 5 },
  { v: 'culture', label: 'Culture & entertainment', n: 3 }
];

/* 4-week billing: 13 payments a year instead of 12. Most popular sits on the middle plan. */
const PLANS = [
  { id: 'w1', name: '1-week plan', full: 9.99, days: 7, every: 'every week' },
  { id: 'w4', name: '4-week plan', full: 29, days: 28, every: 'every 4 weeks', popular: true },
  { id: 'w12', name: '12-week plan', full: 69, days: 84, every: 'every 12 weeks' }
];

const STEPS = [
  { id: 'landing', type: 'landing' },
  { id: 'markets', type: 'multi', q: 'Which markets do you trade most?', hint: 'Pick all that apply.', options: MARKETS },
  { id: 'platform', type: 'single', q: 'Where do you trade?', options: [
    { v: 'kalshi', label: 'Kalshi' }, { v: 'polymarket', label: 'Polymarket' },
    { v: 'both', label: 'Both' }, { v: 'none', label: 'Not yet', sub: 'Just exploring' } ] },
  { id: 'tenure', type: 'single', q: 'How long have you been trading prediction markets?', options: [
    { v: 'new', label: 'Less than 3 months' }, { v: 'mid', label: '3 to 12 months' }, { v: 'long', label: 'More than a year' } ] },
  { id: 'frequency', type: 'single', q: 'How often do you place a trade?', options: [
    { v: 'daily', label: 'Daily' }, { v: 'weekly_plus', label: 'A few times a week' },
    { v: 'weekly', label: 'About once a week' }, { v: 'events', label: 'Only for big events' } ] },
  { id: 'size', type: 'single', q: 'What is your typical position size?', hint: 'We use this to hide markets too thin to fill your order.', options: [
    { v: 's', label: 'Under $25' }, { v: 'm', label: '$25 to $100' }, { v: 'l', label: '$100 to $500' }, { v: 'xl', label: 'Over $500' } ] },
  { id: 'fact_wallets', type: 'fact' },
  { id: 'results', type: 'single', q: 'Honestly, how are your results so far?', options: [
    { v: 'up', label: 'Up overall' }, { v: 'even', label: 'About even' },
    { v: 'down', label: 'Down overall' }, { v: 'untracked', label: "I don't really track it" } ] },
  { id: 'contracts', type: 'single', q: 'Which contracts do you buy most often?', options: [
    { v: 'longshot', label: 'Long shots', sub: 'Under 20¢' }, { v: 'middle', label: 'Middle of the range', sub: '20¢ to 80¢' },
    { v: 'favorite', label: 'Favorites', sub: 'Over 80¢' }, { v: 'unsure', label: 'Not sure' } ] },
  { id: 'fact_longshot', type: 'fact' },
  { id: 'method', type: 'multi', q: 'How do you usually decide what to trade?', hint: 'Pick all that apply.', options: [
    { v: 'gut', label: 'Gut feeling and news' }, { v: 'tipsters', label: 'Discord or X tipsters' },
    { v: 'books', label: 'Sportsbook lines' }, { v: 'model', label: 'My own stats or model' }, { v: 'ai', label: 'AI tools' } ] },
  { id: 'tools', type: 'single', q: 'Have you paid for picks or a signals tool before?', options: [
    { v: 'burned', label: "Yes, and it didn't deliver" }, { v: 'using', label: 'Yes, I still use one' }, { v: 'no', label: 'No' } ] },
  { id: 'priority', type: 'multi', max: 2, q: 'What matters most in a signal?', hint: 'Pick up to two.', options: [
    { v: 'proof', label: "Proof it's been right before" }, { v: 'why', label: 'A clear explanation of why' },
    { v: 'speed', label: 'Fast alerts' }, { v: 'liquid', label: 'Only markets I can actually fill' },
    { v: 'sources', label: 'Where the fair value comes from' } ] },
  { id: 'record', type: 'record' },
  { id: 'st_cheap', type: 'statement', q: 'I often buy a contract because the price feels cheap.' },
  { id: 'st_tipsters', type: 'statement', q: "I can't tell which tipsters and tools are actually right." },
  { id: 'alerts', type: 'single', q: 'Where should we send live alerts?', options: [
    { v: 'push', label: 'Push notifications' }, { v: 'telegram', label: 'Telegram' },
    { v: 'email', label: 'Email' }, { v: 'app', label: "I'll check the app" } ] },
  { id: 'strength', type: 'single', q: 'How many signals do you want?', options: [
    { v: 'strong', label: 'Only the strongest edges', sub: 'Fewer alerts, +5¢ or more after fees' },
    { v: 'balanced', label: 'Balanced', sub: '+3¢ or more after fees' },
    { v: 'all', label: 'Show me everything', sub: '+1¢ or more after fees' } ] },
  { id: 'email', type: 'email' },
  { id: 'loader', type: 'loader' },
  { id: 'summary', type: 'summary' },
  { id: 'selling', type: 'selling' },
  { id: 'compare', type: 'compare' },
  { id: 'scratch', type: 'scratch' },
  { id: 'paywall', type: 'paywall' },
  { id: 'audit', type: 'crosssell' },
  { id: 'welcome', type: 'done' }
];
const Q_START = 1;
const EMAIL_IDX = STEPS.findIndex(s => s.id === 'email');

const fresh = () => ({ idx: 0, ans: {}, hist: [], plan: 'w4', email: '', audit: false, promoUntil: 0, code: '' });
let state = fresh();
let timers = [];

const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const money = n => '$' + (n % 1 ? n.toFixed(2) : String(n));

const promoLeft = () => Math.max(0, state.promoUntil - Date.now());
const promoOn = () => promoLeft() > 0;
const priceOf = p => promoOn() ? Math.floor(p.full * 50) / 100 : p.full;
const mmss = ms => { const s = Math.ceil(ms / 1000); return String(Math.floor(s / 60)).padStart(2, '0') + ':' + String(s % 60).padStart(2, '0'); };

function go(i, push = true) {
  if (push) state.hist.push(state.idx);
  state.idx = i;
  render();
}
const next = () => go(state.idx + 1);
$('#back').addEventListener('click', () => {
  if (!state.hist.length) return;
  state.idx = state.hist.pop();
  if (STEPS[state.idx].type === 'loader') state.idx = state.hist.pop() ?? EMAIL_IDX;
  render();
});

function setCta(buttons) {
  const cta = $('#cta');
  if (!buttons) { cta.hidden = true; cta.innerHTML = ''; return; }
  cta.hidden = false;
  cta.innerHTML = buttons.map((b, i) => `<button class="btn ${b.ghost ? 'ghost' : ''}" id="cta${i}" ${b.disabled ? 'disabled' : ''}>${b.label}</button>`).join('');
  buttons.forEach((b, i) => $('#cta' + i).addEventListener('click', b.onClick));
}

function chrome() {
  const s = STEPS[state.idx];
  const inQuiz = state.idx >= Q_START && state.idx <= EMAIL_IDX;
  $('#progress').hidden = !inQuiz;
  $('#bar').style.width = Math.round(((state.idx - Q_START + 1) / (EMAIL_IDX - Q_START + 1)) * 100) + '%';
  $('#stepnum').textContent = inQuiz ? `${state.idx - Q_START + 1}/${EMAIL_IDX - Q_START + 1}` : '';
  $('#back').style.visibility = state.idx === 0 || ['loader', 'crosssell', 'done'].includes(s.type) ? 'hidden' : 'visible';
}

function render() {
  timers.forEach(clearInterval); timers = [];
  const s = STEPS[state.idx];
  chrome();
  $('#main').innerHTML = `<section class="screen">${RENDER[s.type].html(s)}</section>`;
  RENDER[s.type].bind && RENDER[s.type].bind(s);
  window.scrollTo(0, 0);
  const h = $('#main h1, #main h2'); if (h) { h.setAttribute('tabindex', '-1'); h.focus({ preventScroll: true }); }
}

const optHtml = (s, multi) => `<div class="opts ${multi ? 'multi' : ''}">` + s.options.map(o => {
  const cur = state.ans[s.id];
  const on = multi ? (cur || []).includes(o.v) : cur === o.v;
  return `<button class="opt" data-v="${o.v}" aria-pressed="${on}"><span>${o.label}</span>${o.sub ? `<span class="opt-s">${o.sub}</span>` : ''}<span class="tick" aria-hidden="true"></span></button>`;
}).join('') + '</div>';
const head = s => `<h2>${s.q}</h2>${s.hint ? `<p class="hint">${s.hint}</p>` : ''}`;

/* demo track record, always labelled as sample data */
const CALIB = [[10, 12], [20, 18], [30, 33], [40, 41], [50, 52], [60, 58], [70, 72], [80, 77], [90, 86]];
function calibSvg() {
  const W = 320, H = 200, L = 34, B = 28, T = 8, Rr = 8;
  const x = v => L + (v / 100) * (W - L - Rr), y = v => H - B - (v / 100) * (H - B - T);
  let g = '';
  [0, 50, 100].forEach(v => {
    g += `<line x1="${L}" x2="${W - Rr}" y1="${y(v)}" y2="${y(v)}" stroke="var(--line)" stroke-width="1"/>`;
    g += `<text x="${L - 6}" y="${y(v) + 3}" text-anchor="end">${v}%</text>`;
    g += `<text x="${x(v)}" y="${H - B + 14}" text-anchor="${v === 0 ? 'start' : v === 100 ? 'end' : 'middle'}">${v}%</text>`;
  });
  g += `<line x1="${x(0)}" y1="${y(0)}" x2="${x(100)}" y2="${y(100)}" stroke="var(--ink-muted)" stroke-width="1.5" stroke-dasharray="4 4"/>`;
  g += `<polyline fill="none" stroke="var(--signal)" stroke-width="2.5" stroke-linejoin="round" points="${CALIB.map(p => `${x(p[0])},${y(p[1])}`).join(' ')}"/>`;
  g += CALIB.map(p => `<circle cx="${x(p[0])}" cy="${y(p[1])}" r="4" fill="var(--signal)" stroke="var(--surface)" stroke-width="1.5"/>`).join('');
  g += `<text x="${(L + W - Rr) / 2}" y="${H - 1}" text-anchor="middle">Our fair value</text>`;
  return `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="Calibration chart, sample data: signals at each fair value resolved YES close to that rate">${g}</svg>`;
}
const SIGNALS = [
  { id: 1284, at: '2026-11-02 14:05', q: 'Will the Fed cut rates in December?', side: 'YES', price: 62, fv: 71, edge: 7, res: 'hit' },
  { id: 1279, at: '2026-11-01 19:40', q: 'Chiefs to beat the Bills on Sunday?', side: 'YES', price: 44, fv: 50, edge: 4, res: 'miss' },
  { id: 1271, at: '2026-10-31 09:15', q: 'NYC high above 60°F on Nov 1?', side: 'NO', price: 38, fv: 45, edge: 5, res: 'hit' }
];
const sigHtml = s => `<article class="sig">
  <div class="sig-top"><span>#${s.id}</span><span>${s.at} UTC</span></div>
  <div class="sig-q">${s.q}</div>
  <div class="sig-row"><span class="side">${s.side}</span><span>Price <b>${s.price}¢</b></span><span>Fair value <b>${s.fv}%</b></span><span><b>+${s.edge}¢</b> after fees</span>
  <span class="pill ${s.res}">${s.res === 'hit' ? '✓ Hit' : '✕ Miss'}</span></div></article>`;

function feed() {
  const a = state.ans;
  const cats = (a.markets || []).length ? a.markets : ['sports'];
  const factor = { strong: 0.5, balanced: 1, all: 1.8 }[a.strength || 'balanced'];
  return {
    cats: cats.map(v => MARKETS.find(m => m.v === v).label).join(', '),
    venue: { kalshi: 'Kalshi', polymarket: 'Polymarket', both: 'Kalshi and Polymarket', none: 'Kalshi and Polymarket' }[a.platform || 'both'],
    depth: { s: '$1k+ depth', m: '$5k+ depth', l: '$20k+ depth', xl: '$50k+ depth' }[a.size || 'm'],
    alerts: { push: 'Push notifications', telegram: 'Telegram', email: 'Email', app: 'In-app feed only' }[a.alerts || 'push'],
    alertsInline: { push: 'push notifications', telegram: 'Telegram', email: 'email alerts', app: 'your in-app feed' }[a.alerts || 'push'],
    edge: { strong: '+5¢ after fees', balanced: '+3¢ after fees', all: '+1¢ after fees' }[a.strength || 'balanced'],
    longshot: a.contracts === 'longshot',
    signals: Math.max(3, Math.round(cats.reduce((n, v) => n + MARKETS.find(m => m.v === v).n, 0) * factor))
  };
}

function bindSingle(s) {
  setCta(null);
  $$('.opt').forEach(b => b.addEventListener('click', () => {
    state.ans[s.id] = b.dataset.v;
    trackAnswer(s, b.dataset.v);
    $$('.opt').forEach(x => x.setAttribute('aria-pressed', x === b));
    setTimeout(next, 220);
  }));
}

const RENDER = {
  landing: {
    html: () => `
      <div class="eyebrow">Kalshi · Polymarket</div>
      <h1>Every AI picks tool shows its wins. We publish every signal.</h1>
      <p class="lede">Oddlin flags contracts priced below their real-world probability and logs every call the second it goes out, including the ones that miss. Take the 2-minute quiz to build your feed.</p>
      ${sigHtml(SIGNALS[1])}
      <ul class="proof">
        <li>Fair value from sportsbook consensus, CME FedWatch, NOAA and polls</li>
        <li>Every signal timestamped and never edited</li>
        <li>Calibration and accuracy against the market, published by category</li>
      </ul>
      <p class="disc">Sample signal shown. ${DISCLAIMER} Not affiliated with Kalshi or Polymarket. <a href="/terms">Terms</a> · <a href="/privacy-policy">Privacy</a></p>`,
    bind: () => setCta([{ label: 'Build my feed', onClick: () => { track('track', 'ViewContent', product(PLANS.map(planId), 'quiz_start')); next(); } }])
  },
  single: { html: s => head(s) + optHtml(s, false), bind: bindSingle },
  multi: {
    html: s => head(s) + optHtml(s, true),
    bind: s => {
      const sync = () => {
        const cur = state.ans[s.id] || [];
        $$('.opt').forEach(x => {
          const on = cur.includes(x.dataset.v);
          x.setAttribute('aria-pressed', on);
          x.disabled = !!s.max && !on && cur.length >= s.max;
        });
        $('#cta0').disabled = !cur.length;
      };
      setCta([{ label: 'Continue', disabled: true, onClick: () => { trackAnswer(s, state.ans[s.id] || []); next(); } }]);
      $$('.opt').forEach(b => b.addEventListener('click', () => {
        const cur = state.ans[s.id] || [];
        state.ans[s.id] = cur.includes(b.dataset.v) ? cur.filter(v => v !== b.dataset.v) : cur.concat(b.dataset.v);
        sync();
      }));
      sync();
    }
  },
  fact: {
    html: s => s.id === 'fact_wallets' ? `
        <div class="eyebrow">You're not alone</div>
        <div class="card">
          <div class="stat">70–84<em>%</em></div>
          <h2>of Polymarket wallets are down overall.</h2>
          <p class="lede">Only about 2% of wallets have made more than $1,000. Most tools only show you the trades that went right.</p>
          <div class="src">Akey et al. · Motley Fool 2025 · Sergeenkov</div>
        </div>` : `
        <div class="eyebrow">Cheap is not the same as underpriced</div>
        <div class="card">
          ${state.ans.contracts === 'longshot' ? '<div class="callout">You said you mostly buy long shots. This one is for you.</div>' : ''}
          <div class="stat">−60<em>%</em></div>
          <h2>Kalshi contracts under 10¢ lost more than 60% of the money put into them.</h2>
          <p class="lede">A 5¢ price says “5% likely”. Long shots are priced above their real odds more often than not. Fair value shows the gap between price and probability.</p>
          <div class="src">Bürgi, Deng, Whelan · CEPR 2026 · 300,000+ contracts</div>
        </div>`,
    bind: () => setCta([{ label: 'Continue', onClick: next }])
  },
  record: {
    html: () => `
      <div class="eyebrow">Our track record</div>
      <h2>Every signal we sent, including the ones that missed.</h2>
      <div class="card">
        <div class="row"><h3>Calibration</h3><span class="src">N = 412 · sample data</span></div>
        ${calibSvg()}
        <div class="legend"><span><i></i>Resolved YES</span><span><i class="ref"></i>Perfect calibration</span></div>
        <p class="lede">When we said 70%, it happened about 72% of the time.</p>
      </div>
      <div class="sigs">${SIGNALS.map(sigHtml).join('')}</div>
      <p class="disc">Sample data, hypothetical. ${DISCLAIMER}</p>`,
    bind: () => setCta([{ label: 'Continue', onClick: next }])
  },
  statement: {
    html: s => `<div class="eyebrow">Do you agree?</div><blockquote class="quote">“${s.q}”</blockquote>
      <div class="opts row3">${['Disagree', 'Not sure', 'Agree'].map(v => `<button class="opt" data-v="${v}" aria-pressed="${state.ans[s.id] === v}"><span>${v}</span><span class="tick"></span></button>`).join('')}</div>`,
    bind: bindSingle
  },
  email: {
    html: () => `
      <div class="eyebrow">Almost there</div>
      <h2>Where should we send your feed setup?</h2>
      <form id="f" novalidate class="opts">
        <div class="field"><label for="em">Email</label>
          <input class="input" id="em" type="email" autocomplete="email" inputmode="email" autocapitalize="off" spellcheck="false" placeholder="you@example.com" value="${esc(state.email)}"></div>
        <p class="err" id="err" role="alert"></p>
      </form>
      <p class="disc">By submitting your email, you confirm you're 18 or older and agree to our <a href="/terms" target="_blank" rel="noopener">Terms</a> and <a href="/privacy-policy" target="_blank" rel="noopener">Privacy Policy</a>. We'll email your feed setup and news about Oddlin's launch. Unsubscribe anytime. We never sell your email.</p>`,
    bind: () => {
      let sending = false;
      const submit = async e => {
        e && e.preventDefault();
        if (sending) return;
        const v = $('#em').value.trim();
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v)) { $('#err').textContent = 'Enter an email like name@example.com.'; return; }
        sending = true; $('#cta0').disabled = true;
        state.email = v; state.ans.age = true;
        saveEmail(v);
        trackAnswer(STEPS[state.idx], 'email_submitted', 'Where should we send your feed setup?', [{ v: 'email_submitted', label: 'Email submitted, 18+ confirmed' }]);
        await matchEmail(v);
        track('track', 'Lead', { content_name: 'quiz_email', step_number: state.idx });
        next();
      };
      $('#f').addEventListener('submit', submit);
      setCta([{ label: 'Build my feed', onClick: submit }]);
    }
  },
  /* Magic page: long loader on purpose (lecture benchmark), pauses halfway for one bottom-sheet question.
     Its answer is logged under the loader's step number with step_id "device". */
  loader: {
    html: () => { const f = feed(); return `
      <h2>Building your feed</h2>
      <div class="dialwrap"><svg class="dial" viewBox="0 0 200 200" aria-hidden="true">
        <circle cx="100" cy="100" r="76" fill="none" stroke="var(--line)" stroke-width="14"/>
        <circle id="arc" cx="100" cy="100" r="76" fill="none" stroke="var(--ink)" stroke-width="14" stroke-linecap="round" transform="rotate(-90 100 100)" stroke-dasharray="477.5" stroke-dashoffset="477.5"/>
        <circle id="knob" cx="100" cy="24" r="13" fill="var(--signal)" stroke="var(--ground)" stroke-width="5"/>
        <text id="pct" class="pct" x="100" y="114" text-anchor="middle">0%</text>
      </svg></div>
      <ul class="checks">
        <li data-at=".2"><span class="tick"></span>Matching ${esc(f.cats)} markets</li>
        <li data-at=".45"><span class="tick"></span>Filtering for ${esc(f.depth)}</li>
        <li data-at=".72"><span class="tick"></span>Setting your edge threshold</li>
        <li data-at=".96"><span class="tick"></span>Connecting ${esc(f.alertsInline)}</li>
      </ul>`; },
    bind: () => {
      setCta(null);
      const dur = matchMedia('(prefers-reduced-motion: reduce)').matches ? 2000 : 8000, C = 477.5, myIdx = state.idx;
      let elapsed = 0, last = performance.now(), paused = false;
      const items = $$('.checks li');
      const ask = () => {
        paused = true;
        const bg = document.createElement('div');
        bg.className = 'sheet-bg';
        bg.innerHTML = `<div class="sheet" role="dialog" aria-modal="true" aria-labelledby="sq">
          <div class="eyebrow">Quick question</div><h3 id="sq">${DEVICE_Q}</h3>
          <div class="opts">${DEVICE_OPTS.map(o => `<button class="opt" data-v="${o.v}" aria-pressed="false"><span>${o.label}</span><span class="tick"></span></button>`).join('')}</div></div>`;
        document.body.appendChild(bg);
        bg.querySelector('.opt').focus();
        bg.querySelectorAll('.opt').forEach(b => b.addEventListener('click', () => {
          state.ans.device = b.dataset.v;
          trackAnswer({ id: 'device' }, b.dataset.v, DEVICE_Q, DEVICE_OPTS);
          b.setAttribute('aria-pressed', 'true');
          setTimeout(() => { bg.remove(); last = performance.now(); paused = false; requestAnimationFrame(tick); }, 220);
        }));
      };
      const tick = now => {
        if (state.idx !== myIdx || paused) return;
        elapsed += now - last; last = now;
        const p = Math.min(1, elapsed / dur), e = 1 - Math.pow(1 - p, 1.6), a = e * 2 * Math.PI - Math.PI / 2;
        $('#arc').setAttribute('stroke-dashoffset', C * (1 - e));
        $('#knob').setAttribute('cx', 100 + 76 * Math.cos(a)); $('#knob').setAttribute('cy', 100 + 76 * Math.sin(a));
        $('#pct').textContent = Math.round(e * 100) + '%';
        items.forEach(li => li.classList.toggle('done', e >= +li.dataset.at));
        if (e >= 0.5 && !state.ans.device) return ask();
        if (p < 1) requestAnimationFrame(tick); else setTimeout(() => go(myIdx + 1, false), 450);
      };
      requestAnimationFrame(tick);
    }
  },
  summary: {
    html: () => { const f = feed(); return `
      <div class="eyebrow">Your result</div>
      <h2>Your Oddlin feed is ready</h2>
      <dl class="feed">
        <div class="feed-row"><dt>Markets</dt><dd>${esc(f.cats)}</dd></div>
        <div class="feed-row"><dt>Venues</dt><dd>${esc(f.venue)}</dd></div>
        <div class="feed-row"><dt>Liquidity</dt><dd>${esc(f.depth)} at the signal price</dd></div>
        <div class="feed-row"><dt>Edge</dt><dd>${esc(f.edge)}</dd></div>
        <div class="feed-row"><dt>Alerts</dt><dd>${esc(f.alerts)}</dd></div>
        ${f.longshot ? '<div class="feed-row"><dt>Long-shot flag</dt><dd>On: contracts under 10¢ get a fair-value check</dd></div>' : ''}
      </dl>
      <div class="row"><h3>Last 30 days in your markets</h3><span class="src">Sample data</span></div>
      <div class="kpis">
        <div class="kpi"><b>${f.signals}</b><span>signals sent</span></div>
        <div class="kpi"><b>±3 pts</b><span>calibration gap</span></div>
        <div class="kpi"><b>+2.1¢</b><span>avg closing line value</span></div>
      </div>
      <p class="disc">Same signals for every member. Your setup only filters what you see. ${DISCLAIMER}</p>`; },
    bind: () => setCta([{ label: 'Continue', onClick: next }])
  },
  /* Selling page: where you are now vs with Oddlin, built from answers */
  selling: {
    html: () => {
      const a = state.ans, f = feed(), now = [];
      if (a.results === 'down') now.push('Down overall, without knowing exactly where');
      if (a.results === 'untracked') now.push('No record of which trades work');
      if (a.contracts === 'longshot') now.push('Buying long shots that look cheap');
      if ((a.method || []).includes('tipsters')) now.push('Following tipsters with no public record');
      if ((a.method || []).includes('gut')) now.push('Deciding on gut feeling and headlines');
      if (a.tools === 'burned') now.push("Paid for picks that didn't deliver");
      if (now.length < 2) now.push('Guessing whether a price is fair', 'No way to check a tool before paying');
      return `
        <div class="eyebrow">Your plan</div>
        <h2>From guessing at prices to checking them</h2>
        <div class="fromto">
          <div class="ft now"><span class="src">Now</span><ul>${now.slice(0, 3).map(t => `<li>${t}</li>`).join('')}</ul></div>
          <svg class="arrow" width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M10 3v14M4 11l6 6 6-6"/></svg>
          <div class="ft to"><span class="src">With Oddlin</span><ul>
            <li>Fair value next to every price, with its sources</li>
            <li>Every signal checked against our public track record</li>
            <li>Alerts only for ${esc(f.cats)} with ${esc(f.depth)}</li>
            ${f.longshot ? '<li>A warning on long shots priced above their odds</li>' : '<li>A plain-English why on every signal</li>'}
          </ul></div>
        </div>`;
    },
    bind: () => setCta([{ label: 'Continue', onClick: next }])
  },
  /* Objection page. Real reviews go here once beta users exist; until then, a factual comparison. */
  compare: {
    html: () => `
      <div class="eyebrow">Before you decide</div>
      <h2>How Oddlin compares with a typical picks tool</h2>
      <div class="cmp" role="table">
        <div class="cmp-row" role="row"><span></span><span>Oddlin</span><span>Typical tool</span></div>
        <div class="cmp-row" role="row"><span>Shows losing signals</span><span>✓ All of them</span><span>Wins only</span></div>
        <div class="cmp-row" role="row"><span>Fair value sources</span><span>✓ Listed</span><span>Black box</span></div>
        <div class="cmp-row" role="row"><span>Liquidity check</span><span>✓ Your size</span><span>Rarely</span></div>
        <div class="cmp-row" role="row"><span>Calibration report</span><span>✓ Public</span><span>None</span></div>
        <div class="cmp-row" role="row"><span>Trades for you</span><span>✓ Never</span><span>Some do</span></div>
      </div>
      <p class="lede">Check our record first. Every past signal stays public after it resolves, so you can see how we did before you pay.</p>`,
    bind: () => setCta([{ label: 'Continue', onClick: next }])
  },
  /* Scratch promo: personal code from email + date, reserved for 10 minutes */
  scratch: {
    html: () => {
      if (!state.code) {
        const pre = (state.email.split('@')[0] || 'ODDL').replace(/[^a-z0-9]/gi, '').slice(0, 4).toUpperCase().padEnd(4, 'X');
        const d = new Date();
        state.code = `ODD-${pre}-${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
      }
      return `
        <div class="eyebrow">One more thing</div>
        <h2>We reserved a discount for your first period</h2>
        <p class="lede">Scratch the card to reveal your personal code.</p>
        <div class="scratch" id="sc">
          <div class="scratch-in"><div class="off">50% off</div><div class="code">${esc(state.code)}</div><div class="disc">First period of any plan · reserved for ${PROMO_MIN} minutes</div></div>
          ${state.promoUntil ? '' : '<canvas id="cv" aria-label="Scratch card"></canvas>'}
        </div>
        ${state.promoUntil ? '' : '<button class="linkbtn" id="reveal">Reveal without scratching</button>'}`;
    },
    bind: () => {
      const done = () => {
        if (!state.promoUntil) { state.promoUntil = Date.now() + PROMO_MIN * 60000; track('trackCustom', 'ScratchReveal', { code: state.code }); }
        const cv = $('#cv'); if (cv) { cv.style.opacity = 0; setTimeout(() => cv.remove(), 400); }
        const r = $('#reveal'); if (r) r.remove();
        $('#cta0').disabled = false;
      };
      setCta([{ label: 'Apply my discount', disabled: !state.promoUntil, onClick: next }]);
      const cv = $('#cv'); if (!cv) return;
      $('#reveal').addEventListener('click', done);
      const box = $('#sc').getBoundingClientRect(), dpr = window.devicePixelRatio || 1;
      cv.width = box.width * dpr; cv.height = box.height * dpr;
      const ctx = cv.getContext('2d'), css = getComputedStyle(document.documentElement);
      ctx.scale(dpr, dpr);
      ctx.fillStyle = css.getPropertyValue('--ink').trim(); ctx.fillRect(0, 0, box.width, box.height);
      ctx.fillStyle = css.getPropertyValue('--ground').trim();
      ctx.font = '600 18px Figtree, system-ui, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText('Scratch here', box.width / 2, box.height / 2);
      ctx.globalCompositeOperation = 'destination-out'; ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.lineWidth = 38;
      let down = false, lx = 0, ly = 0, moves = 0;
      const pos = e => { const r = cv.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };
      const cleared = () => { const d = ctx.getImageData(0, 0, cv.width, cv.height).data; let c = 0, n = 0; for (let i = 3; i < d.length; i += 64) { n++; if (d[i] === 0) c++; } return c / n; };
      cv.addEventListener('pointerdown', e => { down = true; [lx, ly] = pos(e); cv.setPointerCapture(e.pointerId); });
      cv.addEventListener('pointermove', e => {
        if (!down) return;
        const [x, y] = pos(e);
        ctx.beginPath(); ctx.moveTo(lx, ly); ctx.lineTo(x, y); ctx.stroke(); lx = x; ly = y;
        if (++moves % 8 === 0 && cleared() > 0.4) { down = false; done(); }
      });
      cv.addEventListener('pointerup', () => { down = false; });
      cv.addEventListener('pointercancel', () => { down = false; });
    }
  },
  paywall: {
    html: () => {
      const f = feed(), on = promoOn();
      const all = { proof: 'The full public track record, every signal since launch',
        why: 'A plain-English explanation on every signal',
        speed: `Real-time alerts to ${f.alerts === 'In-app feed only' ? 'your app' : f.alerts}`,
        liquid: `Only edges with ${f.depth} at the price`,
        sources: 'Every fair value lists its sources' };
      const pri = state.ans.priority || [];
      const order = pri.concat(Object.keys(all).filter(k => !pri.includes(k))).slice(0, 4);
      return `
        ${on ? `<div class="timer" id="timer"><span>50% off reserved for you</span><b id="tleft">${mmss(promoLeft())}</b></div>` : ''}
        <h1>${on ? 'Start your feed at 50% off' : 'Start your feed'}</h1>
        <p class="lede">Past signals stay public. Members get them live, filtered to ${esc(f.cats)}.</p>
        <ul class="bens">${order.map(k => `<li>${all[k]}</li>`).join('')}</ul>
        <div class="plans" role="radiogroup" aria-label="Plan">${PLANS.map(p => `
          <label class="plan">${p.popular ? '<span class="badge">Most popular</span>' : ''}
            <input type="radio" name="plan" id="p-${p.id}" value="${p.id}" ${state.plan === p.id ? 'checked' : ''}>
            <span class="plan-n">${p.name}</span>
            <span class="plan-s">${on ? `<s>${money(p.full)}</s>` : ''}${money(priceOf(p))} first, then ${money(p.full)} ${p.every}</span>
            <span class="plan-p">${money(priceOf(p) / p.days)}<small>per day</small></span>
          </label>`).join('')}
        </div>
        <div class="card"><h3>How billing works</h3><ol class="timeline" id="tl"></ol></div>
        <p class="disc">Cancel anytime in settings. ${DISCLAIMER} Oddlin does not trade for you or access your funds.</p>`;
    },
    bind: () => {
      const plan = () => PLANS.find(p => p.id === state.plan);
      const tl = () => { const p = plan(); $('#tl').innerHTML = `
        <li><b>Today: ${money(priceOf(p))}</b><span>Full access to live signals and alerts</span></li>
        <li><b>Day ${p.days - 3}: reminder email</b><span>We remind you 3 days before renewal</span></li>
        <li><b>Day ${p.days}: ${money(p.full)} ${p.every}</b><span>Renews automatically. Cancel anytime before</span></li>`; };
      tl();
      track('track', 'InitiateCheckout', product([planId(plan())], plan().name, priceOf(plan())));
      $$('input[name=plan]').forEach(r => r.addEventListener('change', () => { state.plan = r.value; tl(); }));
      if (promoOn()) timers.push(setInterval(() => {
        if (!promoOn()) { track('trackCustom', 'PromoExpired', {}); render(); return; }
        $('#tleft').textContent = mmss(promoLeft());
      }, 1000));
      setCta([{ label: 'Start membership', onClick: () => {
        const p = plan();
        track('track', 'Purchase', Object.assign(product([planId(p)], p.name, priceOf(p)), { promo: promoOn() }));
        next();
      } }]);
    }
  },
  /* Upsell before the product, right after payment */
  crosssell: {
    html: () => `
      <div class="eyebrow">Membership active · one more thing</div>
      <h2>Add a Trade Audit of your own history</h2>
      <p class="lede">Connect Kalshi read-only or paste a Polymarket address. We sort your past trades and show where the money went: long shots, taker fees, and the categories where you did worse than the market price.</p>
      <div class="card">
        <div class="row"><h3>Example audit</h3><span class="src">Sample data</span></div>
        <div class="kpis">
          <div class="kpi"><b>−$412</b><span>on contracts under 10¢</span></div>
          <div class="kpi"><b>$96</b><span>paid in taker fees</span></div>
          <div class="kpi"><b>Politics</b><span>weakest category</span></div>
        </div>
      </div>
      <p class="disc">One-time $19. An analysis of your own trades, not a recommendation.</p>`,
    bind: () => setCta([
      { label: 'Add Trade Audit for $19', onClick: () => { state.audit = true; track('track', 'AddToCart', product([AUDIT_ID], 'Trade Audit', 19)); next(); } },
      { label: 'No thanks', ghost: true, onClick: () => { track('trackCustom', 'CrossSellDeclined', { content_name: 'trade_audit' }); next(); } }
    ])
  },
  /* Smoke test ends here: honest reveal, nothing was charged */
  done: {
    html: () => `
      <div class="eyebrow">Thank you</div>
      <h1>Sorry, Oddlin isn't live yet.</h1>
      <p class="lede">This is a beta test. We're checking whether prediction market traders want a scanner that publishes its full track record, and you just helped us answer that.</p>
      <div class="card">
        <h3>You have not been charged.</h3>
        <p class="lede">We didn't ask for card details, and no payment was taken${state.audit ? ', including the Trade Audit' : ''}.</p>
      </div>
      <p class="lede">Thank you for taking the time to go through it. Your answers shape what we build first.</p>
      ${state.email ? `<div class="callout">If Oddlin launches, we'll email <b>${esc(state.email)}</b> once with your feed setup. Nothing else.</div>` : ''}`,
    bind: () => { setCta(null); track('trackCustom', 'BetaReveal', { plan: state.plan, audit: state.audit }); }
  }
};

function start(d) {
  if (d && d.ans) state = Object.assign(fresh(), d);
  render();
}
start();
