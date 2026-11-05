/* Every event goes to three places:
   - the Meta Pixel (loaded in <head>) for ads,
   - dataLayer for a future GTM / GA4 setup,
   - our database through /api/event, tied to the session, the funnel version and the current step.
   db.answer carries the real answer codes for the database, even on steps hidden from Meta;
   db.value overrides the value stored in the database (Purchase goes to Meta with value 0). */
function track(type, name, params, db) {
  const data = Object.assign({ session_id: window.oddlinSession }, params || {});
  try { window.fbq(type, name, data); } catch (e) {}
  (window.dataLayer = window.dataLayer || []).push(Object.assign({ event: name }, data));
  logEvent(name, db || {}, (db && db.value) ?? data.value);
}

/* Visit metadata, read once per tab from the ad link and the screen; the server keeps it on the session row */
const META = (function () {
  const key = 'oddlin_meta';
  try { const saved = JSON.parse(sessionStorage.getItem(key)); if (saved) return saved; } catch (e) {}
  const q = new URLSearchParams(location.search);
  const ua = navigator.userAgent;
  const device = /iPad|Tablet/i.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1) ? 'tablet'
    : /Mobi|Android|iPhone/i.test(ua) ? 'mobile' : 'desktop';
  const meta = { utm_source: q.get('utm_source'), utm_campaign: q.get('utm_campaign'), utm_content: q.get('utm_content'), device };
  try { sessionStorage.setItem(key, JSON.stringify(meta)); } catch (e) {}
  return meta;
})();

/* Fire-and-forget POST to our API; keepalive lets it finish even as the screen changes */
function post(url, body) {
  try {
    fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), keepalive: true }).catch(() => {});
  } catch (e) {}
}

function logEvent(name, db, value) {
  if (!FUNNEL || !STEPS) return;
  post('/api/event', {
    session_id: window.oddlinSession,
    funnel: FUNNEL,
    step_key: db.step || STEPS[state.idx].id,
    event_name: name,
    answer: db.answer || null,
    value: value ?? null,
    meta: META
  });
}

/* Commerce events carry content_ids and content_type so Meta can match them to a catalog.
   Product ids: oddlin_w1, oddlin_w4, oddlin_w12 for the plans. */
const planId = p => 'oddlin_' + p.id;
function product(ids, name, value) {
  const params = { content_ids: ids, content_type: 'product', content_name: name };
  if (value !== undefined) Object.assign(params, { value, currency: 'USD', contents: ids.map(id => ({ id, quantity: 1 })) });
  return params;
}

/* Email goes to our database (/api/subscribe → leads). The funnel never waits on it. */
function saveEmail(email) {
  post('/api/subscribe', { email, session_id: window.oddlinSession, funnel: FUNNEL, meta: META });
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
   value is a string or an array (multi-select); labels come from the step's options when it has them.
   Steps marked private (money amounts) send the step but not the answer to Meta. */
function trackAnswer(s, value, question = s.q, options = s.options) {
  const codes = [].concat(value);
  const label = v => ((options || []).find(o => o.v === v) || {}).label || v;
  track('trackCustom', 'QuizAnswer', {
    step_number: STEPS.indexOf(s),
    step_id: s.id,
    question: String(question || '').replace(/<[^>]+>/g, ''),
    answer: s.private ? 'private' : codes.join(','),
    answer_label: s.private ? 'private' : codes.map(label).join(', ')
  }, { answer: codes, step: s.id });
}

/* Magic page bars: each one pauses at `stop` percent for the popup step `ask` */
const LOADER_BARS = [
  { label: 'Reading your answers', stop: 42, ask: 'st_practice' },
  { label: 'Picking your events', stop: 64, ask: 'time' },
  { label: 'Setting your limits', stop: 81, ask: 'limit' }
];
const TIPS = [
  'Every contract settles at $1 or $0.',
  'A 62¢ price means the market sees a 62% chance.',
  'You can sell before the event ends.',
  'Prices move as soon as news breaks.'
];

/* "You now vs With Oddlin": each fear the user picked, then what Oddlin changes about it */
const FEAR_FLIP = {
  how: ["Not sure how it works", "Every market without jargon"],
  lose: ["Afraid to lose money", "Max loss shown before every trade"],
  gambling: ["Feels like gambling", "Odds and math, not luck"],
  trust: ["Not sure which app to trust", "Practice first, then regulated exchanges"]
};
const ICON_X = '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M6 6l8 8M14 6l-8 8" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/></svg>';
const ICON_V = '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M5 10.4l3.2 3.2L15 6.8" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>';
const SPARK = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M10 3.5l1.6 4.9 4.9 1.6-4.9 1.6L10 16.5l-1.6-4.9L3.5 10l4.9-1.6zM18 13l.9 2.6 2.6.9-2.6.9L18 20l-.9-2.6-2.6-.9 2.6-.9zM18.5 2.5l.6 1.8 1.8.6-1.8.6-.6 1.8-.6-1.8-1.8-.6 1.8-.6z" fill="currentColor"/></svg>';

const DISCLAIMER = 'Education only, not financial advice. Prediction markets involve risk of loss.';
const PROMO_MIN = 10;

/* 4-week billing: 13 payments a year instead of 12. Most popular sits on the middle plan. */
const PLANS = [
  { id: 'w1', name: '1-week plan', full: 9.99, days: 7, every: 'every week' },
  { id: 'w4', name: '4-week plan', full: 29, days: 28, every: 'every 4 weeks', popular: true },
  { id: 'w12', name: '12-week plan', full: 69, days: 84, every: 'every 12 weeks' }
];

/* Steps and questions come from /funnel.json: the same file is loaded into the database
   (node scripts/seed-funnel.js), so screen text and stored answers always match. */
let FUNNEL = null, STEPS = null, EVENTS = [], EMAIL_IDX = -1;
const Q_START = 1;

const fresh = () => ({ idx: 0, ans: {}, hist: [], plan: 'w4', email: '', promoUntil: 0, code: '', checkoutSent: false });
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
  $('#back').style.visibility = state.idx === 0 || ['loader', 'done'].includes(s.type) ? 'hidden' : 'visible';
}

function render() {
  timers.forEach(clearInterval); timers = [];
  $$('.pop').forEach(p => p.remove());
  const s = STEPS[state.idx];
  chrome();
  $('#main').innerHTML = `<section class="screen">${RENDER[s.type].html(s)}</section>`;
  RENDER[s.type].bind && RENDER[s.type].bind(s);
  logEvent('ScreenView', {}); // database only, never sent to Meta
  window.scrollTo(0, 0);
  const h = $('#main h1, #main h2'); if (h) { h.setAttribute('tabindex', '-1'); h.focus({ preventScroll: true }); }
}

const optHtml = (s, multi) => `<div class="opts ${multi ? 'multi' : ''}">` + s.options.map(o => {
  const cur = state.ans[s.id];
  const on = multi ? (cur || []).includes(o.v) : cur === o.v;
  return `<button class="opt" data-v="${o.v}" aria-pressed="${on}"><span>${o.label}</span>${o.sub ? `<span class="opt-s">${o.sub}</span>` : ''}<span class="tick" aria-hidden="true"></span></button>`;
}).join('') + '</div>';
const head = s => `<h2>${s.q}</h2>${s.hint ? `<p class="hint">${s.hint}</p>` : ''}`;

/* The plain-English ticket: the product's core idea, shown on the landing and the explainer */
const ticketHtml = () => `
  <article class="ticket" aria-label="Example ticket">
    <div class="ticket-q">Will the Fed cut rates in December?</div>
    <dl class="ticket-rows">
      <div><dt>You pay</dt><dd>$62</dd></div>
      <div><dt>If it happens</dt><dd class="up">you get $100</dd></div>
      <div><dt>Most you can lose</dt><dd>$62</dd></div>
    </dl>
    <div class="ticket-foot"><span class="live" aria-hidden="true"></span>Practice mode · play money</div>
  </article>`;

/* What the user picked, in words, for the plan and paywall */
function profile() {
  const a = state.ans;
  const ev = (a.events || []).length ? a.events : ['fed', 'inflation'];
  const limit = a.limit || '0';
  return {
    events: ev.map(v => EVENTS.find(e => e.v === v).label.replace(/^The /, 'the ').replace(/^[A-Z](?=[a-z])/, c => c.toLowerCase())).join(', '),
    minutes: a.time || '10',
    limit: limit === '0' ? 'Practice only. Real money stays off' : `Up to $${limit} a month, trades above it are blocked`,
    fearLose: (a.fears || []).includes('lose'),
    fearGambling: (a.fears || []).includes('gambling'),
    fearHow: (a.fears || []).includes('how') || a.experience === 'never'
  };
}

/* A question over the magic page; the loader resumes once it's answered */
function askPopup(s, done) {
  const pop = document.createElement('div');
  pop.className = 'pop';
  pop.setAttribute('role', 'dialog'); pop.setAttribute('aria-modal', 'true'); pop.setAttribute('aria-labelledby', 'popq');
  pop.innerHTML = `<div class="pop-card">
    <div class="eyebrow">${s.statement ? 'Do you agree?' : 'To make your plan accurate'}</div>
    ${s.statement ? `<blockquote class="quote" id="popq">“${s.q}”</blockquote>` : `<h3 id="popq">${s.q}</h3>`}
    ${s.hint ? `<p class="hint">${s.hint}</p>` : ''}
    <div class="opts ${s.statement ? 'row3' : ''}">${s.options.map(o => `<button class="opt" data-v="${o.v}" aria-pressed="false"><span>${o.label}</span><span class="tick" aria-hidden="true"></span></button>`).join('')}</div>
  </div>`;
  document.body.appendChild(pop);
  logEvent('ScreenView', { step: s.id }); // database only
  pop.querySelector('.opt').focus({ preventScroll: true });
  pop.querySelectorAll('.opt').forEach(b => b.addEventListener('click', () => {
    if (state.ans[s.id] !== undefined) return;
    state.ans[s.id] = b.dataset.v;
    trackAnswer(s, b.dataset.v);
    b.setAttribute('aria-pressed', true);
    setTimeout(() => { pop.remove(); done(); }, 260);
  }));
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
      <div class="eyebrow">For adults new to prediction markets</div>
      <h1>You sat out crypto. <span class="hl">Learn this one</span> before you put in a dollar.</h1>
      <p class="lede">A 28-day plan on real events. Practice with play money, then decide.</p>
      ${ticketHtml()}
      <ul class="proof">
        <li>Plain English, no jargon</li>
        <li>The Fed, inflation, jobs and elections</li>
        <li>Your own limits before any real money</li>
      </ul>
      <p class="disc">${DISCLAIMER} Not affiliated with Kalshi or Polymarket. <a href="/terms">Terms</a> · <a href="/privacy-policy">Privacy</a></p>`,
    bind: () => setCta([{ label: 'Start my plan', onClick: () => { track('track', 'ViewContent', product(PLANS.map(planId), 'quiz_start')); next(); } }])
  },
  single: { html: s => head(s) + optHtml(s, false), bind: bindSingle },
  multi: {
    html: s => head(s) + optHtml(s, true),
    bind: s => {
      const sync = () => {
        const cur = state.ans[s.id] || [];
        $$('.opt').forEach(x => x.setAttribute('aria-pressed', cur.includes(x.dataset.v)));
        $('#cta0').disabled = !cur.length;
      };
      setCta([{ label: 'Continue', disabled: true, onClick: () => { trackAnswer(s, state.ans[s.id] || []); next(); } }]);
      $$('.opt').forEach(b => b.addEventListener('click', () => {
        let cur = state.ans[s.id] || [];
        const v = b.dataset.v;
        if (cur.includes(v)) cur = cur.filter(x => x !== v);
        else cur = v === 'none' ? ['none'] : cur.filter(x => x !== 'none').concat(v);
        state.ans[s.id] = cur;
        sync();
      }));
      sync();
    }
  },
  fact: {
    html: s => s.id === 'fact_late' ? `
        <div class="eyebrow">You're early this time</div>
        <h2>Crypto went mainstream while most people watched. Prediction markets are going mainstream now.</h2>
        <div class="card">
          <ol class="timeline now">
            <li><b>2017 · Bitcoin is all over the news</b><span>Most people wait and watch</span></li>
            <li><b>2020 · Kalshi gets US approval</b><span>Regulated by the CFTC, like futures</span></li>
            <li><b>2024 · Polymarket goes viral in the election</b><span>Its odds show up on the news</span></li>
            <li><b>2025 · Polymarket gets US approval</b><span>Back in the US under CFTC rules</span></li>
            <li><b>Now · You're looking</b><span>Before most people your age</span></li>
          </ol>
        </div>
        <p class="lede">Last time, most people waited until everyone else was in. This time you can learn it first.</p>` : `
        <div class="eyebrow">Simpler than it looks</div>
        <h2>The price is the crowd's guess.</h2>
        <div class="card odds" aria-label="Example: the crowd says 62%, your read says 75%">
          <div class="ticket-q">Will the Fed cut rates in December?</div>
          <div class="odds-row"><span>Crowd says</span><b>62%</b><i style="--w: 62%"></i></div>
          <div class="odds-row you"><span>Your read</span><b>75%</b><i style="--w: 75%"></i></div>
          <div class="ticket-foot">Price 62¢ = 62% chance · play money</div>
        </div>
        <p class="lede">Most people just guess. Oddlin teaches you the math behind the odds, step by step, with play money first:</p>
        <ul class="proof">
          <li>Turn data and news into your own odds</li>
          <li>Compare your odds with the price</li>
          <li>Know your max loss before every trade</li>
        </ul>`,
    bind: () => setCta([{ label: 'Continue', onClick: next }])
  },
  statement: {
    html: s => `<div class="eyebrow">Do you agree?</div><blockquote class="quote">“${s.q}”</blockquote>
      <div class="opts row3">${s.options.map(o => `<button class="opt" data-v="${o.v}" aria-pressed="${state.ans[s.id] === o.v}"><span>${o.label}</span><span class="tick"></span></button>`).join('')}</div>`,
    bind: bindSingle
  },
  email: {
    html: () => `
      <div class="eyebrow">Almost there</div>
      <h2>Where should we send it?</h2>
      <form id="f" novalidate class="opts">
        <div class="field"><label for="em">Email</label>
          <input class="input" id="em" type="email" autocomplete="email" inputmode="email" autocapitalize="off" spellcheck="false" placeholder="you@example.com" value="${esc(state.email)}"></div>
        <p class="err" id="err" role="alert"></p>
      </form>
      <p class="disc">By submitting your email, you confirm you're 18 or older and agree to our <a href="/terms" target="_blank" rel="noopener">Terms</a> and <a href="/privacy-policy" target="_blank" rel="noopener">Privacy Policy</a>. We'll email your plan and news about Oddlin's launch. Unsubscribe anytime. We never sell your email.</p>`,
    bind: () => {
      let sending = false;
      const submit = async e => {
        e && e.preventDefault();
        if (sending) return;
        const v = $('#em').value.trim();
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v)) { $('#err').textContent = 'Enter an email like name@example.com.'; return; }
        sending = true; $('#cta0').disabled = true;
        state.email = v; state.ans.age_confirmed = true;
        saveEmail(v);
        trackAnswer(STEPS[state.idx], 'email_submitted', 'Where should we send it?', [{ v: 'email_submitted', label: 'Email submitted, 18+ confirmed' }]);
        await matchEmail(v);
        track('track', 'Lead', { content_name: 'quiz_email', step_number: state.idx });
        next();
      };
      $('#f').addEventListener('submit', submit);
      setCta([{ label: 'Get my plan', onClick: submit }]);
    }
  },
  /* Magic page: three bars, each stops once for a popup question from funnel.json
     (type "popup"), then runs on. Long on purpose: the lecture benchmark says a longer loader converts better. */
  loader: {
    html: () => `
      <div class="eyebrow">One moment</div>
      <h2>Building your 28-day plan</h2>
      <div class="lbars">${LOADER_BARS.map((b, i) => `
        <div class="lbar" id="lr${i}">
          <div class="lbar-head"><span><span class="tick" aria-hidden="true"></span>${b.label}</span><b id="lp${i}">0%</b></div>
          <div class="lbar-track"><i id="lf${i}"></i></div>
        </div>`).join('')}
      </div>
      <div class="card tip"><div class="eyebrow">Did you know</div><p class="lede" id="tip" aria-live="polite">${TIPS[0]}</p></div>`,
    bind: () => {
      const myIdx = state.idx, reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
      const planIdx = STEPS.findIndex((s, i) => i > myIdx && s.type !== 'popup');
      setCta([{ label: 'See my plan', disabled: true, onClick: () => go(planIdx, false) }]);
      const speed = reduce ? 6 : 1.4; // percent per 30 ms tick: about 2 seconds per bar
      let k = 0, v = 0, asked = false, iv = 0;
      const run = () => { iv = setInterval(tick, 30); timers.push(iv); };
      const tick = () => {
        if (state.idx !== myIdx) return clearInterval(iv);
        if (k >= LOADER_BARS.length) { clearInterval(iv); $('#cta0').disabled = false; return; }
        const b = LOADER_BARS[k], s = STEPS.find(x => x.id === b.ask);
        if (!asked && v >= b.stop) {
          asked = true;
          if (s && state.ans[s.id] === undefined) { clearInterval(iv); askPopup(s, run); return; }
        }
        v = Math.min(100, v + speed);
        $('#lf' + k).style.width = v + '%';
        $('#lp' + k).textContent = Math.round(v) + '%';
        if (v >= 100) { $('#lr' + k).classList.add('done'); k++; v = 0; asked = false; }
      };
      let t = 0;
      timers.push(setInterval(() => { const el = $('#tip'); if (el) el.textContent = TIPS[++t % TIPS.length]; }, 3500));
      run();
    }
  },
  /* Result as the reward: the personal 28-day plan, built from the answers */
  plan: {
    html: () => { const p = profile(); return `
      <div class="eyebrow">Your result</div>
      <h2>Your 28-day plan</h2>
      <ol class="weeks">
        <li><em>Week 1</em><b>Learn</b><span>${p.fearHow ? 'Start from zero: how' : 'How'} prices, odds and payouts work</span></li>
        <li><em>Week 2</em><b>Practice</b><span>Play money on live events: ${esc(p.events)}</span></li>
        <li><em>Week 3</em><b>Get coached</b><span>AI shows where your guesses go wrong</span></li>
        <li><em>Week 4</em><b>Decide</b><span>Keep practicing or go live on a regulated exchange</span></li>
      </ol>
      <dl class="feed">
        <div class="feed-row"><dt>Daily time</dt><dd>${esc(p.minutes)} minutes</dd></div>
        <div class="feed-row"><dt>Your limit</dt><dd>${esc(p.limit)}</dd></div>
        ${p.fearGambling ? '<div class="feed-row"><dt>Approach</dt><dd>Odds and math first, no blind guesses</dd></div>' : ''}
      </dl>
      ${p.fearLose ? '<div class="callout">You said you’re afraid to lose money. You won’t risk a dollar until you choose to.</div>' : ''}`; },
    bind: () => setCta([{ label: 'Continue', onClick: next }])
  },
  /* Before and after, built from the fears they picked (Empacer-style). The line is confidence, not money */
  compare: {
    html: () => {
      const picked = state.ans.fears || [];
      const keys = picked.concat(Object.keys(FEAR_FLIP).filter(k => !picked.includes(k))).slice(0, 3);
      return `
      <h2>Stop guessing. Start reading the odds.</h2>
      <div class="vs">
        <div class="vs-head"><b>You now</b><span class="vs-ic no">${ICON_X}</span></div>
        <div class="vs-head with"><b>With Oddlin</b><span class="vs-ic yes">${ICON_V}</span></div>
        <svg class="vs-chart" viewBox="0 0 300 120" role="img" aria-label="Your confidence: flat now, rising over 28 days">
          <path class="vs-grid" d="M8 30H292M8 60H292M8 90H292"/>
          <path class="vs-flat" d="M10 100C60 99 100 98 150 96"/>
          <path class="vs-up" d="M150 96C170 92 178 44 198 42S226 66 244 58S270 36 284 24"/>
          <path class="vs-up" d="M272 22L286 22L282 36"/>
          <text x="10" y="116">Day 1</text><text class="with" x="290" y="116" text-anchor="end">Day 28</text>
        </svg>
        <ul class="vs-list">${keys.map(k => `<li><span class="vs-dot no">${ICON_X}</span>${FEAR_FLIP[k][0]}</li>`).join('')}</ul>
        <ul class="vs-list with">${keys.map(k => `<li><span class="vs-dot yes">${ICON_V}</span>${FEAR_FLIP[k][1]}</li>`).join('')}</ul>
      </div>
      <p class="disc">The line shows how confident you feel, not money. ${DISCLAIMER}</p>`;
    },
    bind: () => setCta([{ label: 'Continue', onClick: next }])
  },
  /* What the subscription gives, as a list with icons (Empacer-style) */
  benefits: {
    html: () => { const p = profile(); return `
      <p class="lede center">Your 28-day plan tells you exactly what to do every day.</p>
      <div class="card have">
        <h2>With Oddlin, you will have</h2>
        <ol class="have-list">
          <li><span class="have-ic">${SPARK}</span><b>A plan built for you</b><span>Around ${esc(p.events)}, ${esc(p.minutes)} minutes a day</span></li>
          <li><span class="have-ic">${SPARK}</span><b>Short daily lessons</b><span>Odds, prices and payouts, without jargon</span></li>
          <li><span class="have-ic">${SPARK}</span><b>A trading simulator</b><span>Trade live Kalshi and Polymarket events with play money and see how your calls play out</span></li>
          <li><span class="have-ic">${SPARK}</span><b>An AI coach</b><span>Shows where your guesses go wrong, and why</span></li>
          <li><span class="have-ic">${SPARK}</span><b>And much more…</b></li>
        </ol>
      </div>`; },
    bind: () => setCta([{ label: 'Continue', onClick: next }])
  },
  /* Scratch promo: EARLY50 + today's date (EARLY50-NOV04), echoing the "you're early" screen. Reserved for 10 minutes.
     No personal data in it, since the code goes to Meta */
  scratch: {
    html: () => {
      if (!state.code) {
        const d = new Date();
        state.code = `EARLY50-${d.toLocaleString('en-US', { month: 'short' }).toUpperCase()}${String(d.getDate()).padStart(2, '0')}`;
      }
      return `
        <div class="eyebrow">One more thing</div>
        <h2>A discount on your first payment</h2>
        <div class="scratch" id="sc">
          <div class="scratch-in"><div class="off">50% off</div><div class="code">${esc(state.code)}</div><div class="disc">Reserved for ${PROMO_MIN} minutes</div></div>
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
      // Holographic foil in brand colors; the canvas also shifts hue slowly in CSS (.scratch canvas), so it shimmers
      const tok = n => css.getPropertyValue(n).trim();
      const tint = (hex, k) => '#' + [1, 3, 5].map(i => Math.round(parseInt(hex.slice(i, i + 2), 16) * (1 - k) + 255 * k).toString(16).padStart(2, '0')).join('');
      const sig = tok('--signal'), act = tok('--action');
      const foil = ctx.createLinearGradient(0, 0, box.width, box.height);
      [[0, sig], [.3, tint(sig, .45)], [.55, act], [.8, tint(act, .3)], [1, sig]].forEach(([at, c]) => foil.addColorStop(at, c));
      ctx.fillStyle = foil; ctx.fillRect(0, 0, box.width, box.height);
      const sheen = ctx.createLinearGradient(0, box.height, box.width, 0);
      [[.2, 'rgba(255,255,255,0)'], [.42, 'rgba(255,255,255,.32)'], [.5, 'rgba(255,255,255,0)'], [.62, 'rgba(255,255,255,.18)'], [.8, 'rgba(255,255,255,0)']].forEach(([at, c]) => sheen.addColorStop(at, c));
      ctx.fillStyle = sheen; ctx.fillRect(0, 0, box.width, box.height);
      ctx.fillStyle = '#fff';
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
      const on = promoOn();
      return `
        ${on ? `<div class="timer" id="timer"><span>50% off reserved for you</span><b id="tleft">${mmss(promoLeft())}</b></div>` : ''}
        <h1>${on ? 'Start your plan at 50% off' : 'Start your plan'}</h1>
        <ul class="bens">
          <li>28-day plan on real events</li>
          <li>Practice with play money on live markets</li>
          <li>Every market explained in plain English</li>
          <li>AI coach and your own limits</li>
        </ul>
        <div class="plans" role="radiogroup" aria-label="Plan">${PLANS.map(p => `
          <label class="plan">${p.popular ? '<span class="badge">Most popular</span>' : ''}
            <input type="radio" name="plan" id="p-${p.id}" value="${p.id}" ${state.plan === p.id ? 'checked' : ''}>
            <span class="plan-n">${p.name}</span>
            <span class="plan-s">${on ? `<s>${money(p.full)}</s>` : ''}${money(priceOf(p))} first, then ${money(p.full)} ${p.every}</span>
            <span class="plan-p">${money(priceOf(p) / p.days)}<small>per day</small></span>
          </label>`).join('')}
        </div>
        <div class="card"><h3>How billing works</h3><ol class="timeline" id="tl"></ol></div>
        <p class="disc" id="renew"></p>
        <p class="disc">${DISCLAIMER} Oddlin never holds your money.</p>`;
    },
    bind: () => {
      const plan = () => PLANS.find(p => p.id === state.plan);
      const tl = () => { const p = plan(); $('#tl').innerHTML = `
        <li><b>Today: ${money(priceOf(p))}</b><span>Full access to your plan</span></li>
        <li><b>Day ${p.days - 3}: reminder email</b><span>3 days before renewal</span></li>
        <li><b>Day ${p.days}: ${money(p.full)} ${p.every}</b><span>Cancel anytime before</span></li>`;
        $('#renew').textContent = `Renews automatically at ${money(p.full)} ${p.every} until you cancel. Cancel anytime before the next charge.`; };
      tl();
      // Once per visit: not again when the promo timer runs out and the paywall re-renders, or on back and forward
      if (!state.checkoutSent) { state.checkoutSent = true; track('track', 'InitiateCheckout', product([planId(plan())], plan().name, priceOf(plan()))); }
      $$('input[name=plan]').forEach(r => r.addEventListener('change', () => { state.plan = r.value; tl(); }));
      if (promoOn()) timers.push(setInterval(() => {
        if (!promoOn()) { track('trackCustom', 'PromoExpired', {}); render(); return; }
        $('#tleft').textContent = mmss(promoLeft());
      }, 1000));
      setCta([{ label: 'Start my plan', onClick: () => {
        const p = plan();
        // No money is taken, so Meta gets value 0 (no fake revenue in Ads Manager); the database keeps the price
        track('track', 'Purchase', Object.assign(product([planId(p)], p.name, 0), { plan_price: priceOf(p), promo: promoOn() }), { value: priceOf(p) });
        // Creates the app account (status pending) for the quiz email with the quiz answers as its profile; the app asks for this email on first sign-in
        if (state.email) {
          post('/api/purchase', { email: state.email, session_id: window.oddlinSession, plan: planId(p), answers: { events: state.ans.events, time: state.ans.time, experience: state.ans.experience } });
          try { localStorage.setItem('oddlin_signup_email', state.email); } catch (e) {}
        }
        next();
      } }]);
    }
  },
  /* Smoke test ends here: honest reveal, nothing was charged */
  done: {
    html: () => `
      <div class="done-mark" aria-hidden="true"></div>
      <div class="eyebrow">Thank you</div>
      <h1>Sorry, Oddlin isn't live yet.</h1>
      <p class="lede">This is a beta test. We're checking whether people want a safe way to learn prediction markets, and you just helped us answer that.</p>
      <div class="card">
        <h3>You have not been charged.</h3>
        <p class="lede">We didn't ask for card details, and no payment was taken.</p>
      </div>
      ${state.email ? `<div class="callout">We'll email <b>${esc(state.email)}</b> your plan and news when Oddlin launches. Unsubscribe anytime.</div>` : ''}`,
    bind: () => { setCta(null); track('trackCustom', 'BetaReveal', { plan: state.plan }); }
  }
};

/* Loads the funnel definition, maps it to the shape the screens use, then shows the first screen */
async function start() {
  try {
    const res = await fetch('/funnel.json', { cache: 'no-store' });
    if (!res.ok) throw new Error(res.status);
    const f = await res.json();
    FUNNEL = { slug: f.slug, version: f.version };
    STEPS = f.steps.map(s => ({
      id: s.key, type: s.type, q: s.question, hint: s.hint, private: !!s.private, statement: !!s.statement,
      options: s.options && s.options.map(o => ({ v: o.code, label: o.label }))
    }));
    EVENTS = (STEPS.find(s => s.id === 'events') || {}).options || [];
    EMAIL_IDX = STEPS.findIndex(s => s.id === 'email');
    render();
  } catch (e) {
    $('#main').innerHTML = '<section class="screen"><h2>Something went wrong</h2><p class="lede">The quiz could not load. Refresh the page to try again.</p></section>';
  }
}
start();
