/* Funnel events go to the Meta Pixel (loaded in <head>) and to dataLayer for a future GTM / GA4 setup.
   Every event carries session_id (set in <head>), so one visitor's path can be followed step by step. */
function track(type, name, params) {
  const data = Object.assign({ session_id: window.oddlinSession }, params || {});
  try { window.fbq(type, name, data); } catch (e) {}
  (window.dataLayer = window.dataLayer || []).push(Object.assign({ event: name }, data));
}

/* Commerce events carry content_ids and content_type so Meta can match them to a catalog.
   Product ids: oddlin_w1, oddlin_w4, oddlin_w12 for the plans, masterclass for the upsell. */
const UPSELL_ID = 'masterclass';
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
      body: JSON.stringify({ email, session_id: window.oddlinSession, answers: state.ans, page: location.pathname }),
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
   value is a string or an array (multi-select); labels come from the step's options when it has them.
   Steps marked private (money amounts) send the step but not the answer to Meta. */
function trackAnswer(s, value, question = s.q, options = s.options) {
  const codes = [].concat(value);
  const label = v => ((options || []).find(o => o.v === v) || {}).label || v;
  track('trackCustom', 'QuizAnswer', {
    step_number: state.idx,
    step_id: s.id,
    question: String(question || '').replace(/<[^>]+>/g, ''),
    answer: s.private ? 'private' : codes.join(','),
    answer_label: s.private ? 'private' : codes.map(label).join(', ')
  });
}

const DISCLAIMER = 'Education only, not financial advice. Prediction markets involve risk of loss.';
const PROMO_MIN = 10;

const EVENTS = [
  { v: 'fed', label: 'The Fed and interest rates' },
  { v: 'inflation', label: 'Inflation and gas prices' },
  { v: 'jobs', label: 'Jobs and the economy' },
  { v: 'weather', label: 'Weather' },
  { v: 'elections', label: 'Elections' }
];

/* 4-week billing: 13 payments a year instead of 12. Most popular sits on the middle plan. */
const PLANS = [
  { id: 'w1', name: '1-week plan', full: 9.99, days: 7, every: 'every week' },
  { id: 'w4', name: '4-week plan', full: 29, days: 28, every: 'every 4 weeks', popular: true },
  { id: 'w12', name: '12-week plan', full: 69, days: 84, every: 'every 12 weeks' }
];

const STEPS = [
  { id: 'landing', type: 'landing' },
  { id: 'age', type: 'single', q: 'How old are you?', options: [
    { v: '35-44', label: '35 to 44' }, { v: '45-54', label: '45 to 54' }, { v: '55+', label: '55 or older' }, { v: 'under35', label: 'Under 35' } ] },
  { id: 'missed', type: 'multi', q: 'Which of these did you sit out?', hint: 'Pick all that apply.', options: [
    { v: 'crypto', label: 'Bitcoin and crypto' }, { v: 'meme', label: 'Meme stocks like GameStop' },
    { v: 'tech', label: 'The Tesla and Nvidia run' }, { v: 'housing', label: 'The housing boom' }, { v: 'none', label: 'None of these' } ] },
  { id: 'fact_late', type: 'fact' },
  { id: 'fears', type: 'multi', max: 2, q: 'What holds you back?', hint: 'Pick up to two.', options: [
    { v: 'how', label: "I don't get how it works" }, { v: 'lose', label: "I'm afraid to lose money" },
    { v: 'gambling', label: 'It feels like gambling' }, { v: 'trust', label: "I don't know which app to trust" } ] },
  { id: 'experience', type: 'single', q: 'Have you ever traded on an event?', options: [
    { v: 'never', label: 'Never' }, { v: 'once', label: 'Once or twice' }, { v: 'some', label: 'A few times' } ] },
  { id: 'fact_ticket', type: 'fact' },
  { id: 'events', type: 'multi', q: 'Which events would you follow?', hint: 'No sports. Only events that touch your money.', options: EVENTS },
  { id: 'time', type: 'single', q: 'How much time can you give it a day?', options: [
    { v: '5', label: '5 minutes' }, { v: '10', label: '10 minutes' }, { v: '15', label: '15 minutes or more' } ] },
  { id: 'limit', type: 'single', private: true, q: 'When you go live, what monthly limit feels safe?', hint: 'You can change it later. Trades above it are blocked.', options: [
    { v: '0', label: 'Practice only for now' }, { v: '50', label: 'Up to $50' }, { v: '200', label: 'Up to $200' }, { v: '500', label: 'Up to $500' } ] },
  { id: 'st_practice', type: 'statement', q: "I'd rather practice first than risk real money." },
  { id: 'email', type: 'email' },
  { id: 'loader', type: 'loader' },
  { id: 'plan', type: 'plan' },
  { id: 'scratch', type: 'scratch' },
  { id: 'paywall', type: 'paywall' },
  { id: 'upsell', type: 'crosssell' },
  { id: 'welcome', type: 'done' }
];
const Q_START = 1;
const EMAIL_IDX = STEPS.findIndex(s => s.id === 'email');

const fresh = () => ({ idx: 0, ans: {}, hist: [], plan: 'w4', email: '', upsell: false, promoUntil: 0, code: '' });
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

/* The plain-English ticket: the product's core idea, shown on the landing and the explainer */
const ticketHtml = () => `
  <article class="ticket" aria-label="Example ticket">
    <div class="ticket-q">Will the Fed cut rates in December?</div>
    <dl class="ticket-rows">
      <div><dt>You pay</dt><dd>$62</dd></div>
      <div><dt>If it happens</dt><dd class="up">you get $100</dd></div>
      <div><dt>Most you can lose</dt><dd>$62</dd></div>
    </dl>
    <div class="ticket-foot">Practice mode · play money</div>
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
      <h1>You sat out crypto. Learn this one before you put in a dollar.</h1>
      <p class="lede">A 28-day plan on real events. Practice with play money, then decide.</p>
      ${ticketHtml()}
      <ul class="proof">
        <li>Plain English, no jargon</li>
        <li>Fed, inflation and the economy. No sports</li>
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
        $$('.opt').forEach(x => {
          const on = cur.includes(x.dataset.v);
          x.setAttribute('aria-pressed', on);
          x.disabled = !!s.max && !on && cur.length >= s.max;
        });
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
        <div class="eyebrow">You're not late this time</div>
        <div class="card">
          <div class="stat">+60<em>%</em></div>
          <h2>Kalshi's fastest-growing age group is 46 and older.</h2>
          <p class="lede">Prediction markets are still early. Most people your age are just starting to look.</p>
          <div class="src">Apptopia · World Cup 2026</div>
        </div>` : `
        <div class="eyebrow">Simpler than it looks</div>
        <h2>Every trade is a yes-or-no question with a price.</h2>
        ${ticketHtml()}
        <p class="lede">You always know the most you can lose before you start. And you start with play money.</p>`,
    bind: () => setCta([{ label: 'Continue', onClick: next }])
  },
  statement: {
    html: s => `<div class="eyebrow">Do you agree?</div><blockquote class="quote">“${s.q}”</blockquote>
      <div class="opts row3">${['Disagree', 'Not sure', 'Agree'].map(v => `<button class="opt" data-v="${v}" aria-pressed="${state.ans[s.id] === v}"><span>${v}</span><span class="tick"></span></button>`).join('')}</div>`,
    bind: bindSingle
  },
  email: {
    html: () => `
      <div class="eyebrow">Your plan is ready</div>
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
  /* Magic page: a long loader on purpose (lecture benchmark: longer converts better) */
  loader: {
    html: () => `
      <h2>Building your plan</h2>
      <div class="dialwrap"><svg class="dial" viewBox="0 0 200 200" aria-hidden="true">
        <circle cx="100" cy="100" r="76" fill="none" stroke="var(--line)" stroke-width="14"/>
        <circle id="arc" cx="100" cy="100" r="76" fill="none" stroke="var(--ink)" stroke-width="14" stroke-linecap="round" transform="rotate(-90 100 100)" stroke-dasharray="477.5" stroke-dashoffset="477.5"/>
        <circle id="knob" cx="100" cy="24" r="13" fill="var(--signal)" stroke="var(--ground)" stroke-width="5"/>
        <text id="pct" class="pct" x="100" y="114" text-anchor="middle">0%</text>
      </svg></div>
      <ul class="checks">
        <li data-at=".25"><span class="tick"></span>Picking your events</li>
        <li data-at=".55"><span class="tick"></span>Setting your limits</li>
        <li data-at=".9"><span class="tick"></span>Building your 28 days</li>
      </ul>`,
    bind: () => {
      setCta(null);
      const dur = matchMedia('(prefers-reduced-motion: reduce)').matches ? 2000 : 7000, C = 477.5, myIdx = state.idx;
      const t0 = performance.now(), items = $$('.checks li');
      const tick = now => {
        if (state.idx !== myIdx) return;
        const p = Math.min(1, (now - t0) / dur), e = 1 - Math.pow(1 - p, 1.6), a = e * 2 * Math.PI - Math.PI / 2;
        $('#arc').setAttribute('stroke-dashoffset', C * (1 - e));
        $('#knob').setAttribute('cx', 100 + 76 * Math.cos(a)); $('#knob').setAttribute('cy', 100 + 76 * Math.sin(a));
        $('#pct').textContent = Math.round(e * 100) + '%';
        items.forEach(li => li.classList.toggle('done', e >= +li.dataset.at));
        if (p < 1) requestAnimationFrame(tick); else setTimeout(() => go(myIdx + 1, false), 400);
      };
      requestAnimationFrame(tick);
    }
  },
  /* Result as the reward: the personal 28-day plan, built from the answers */
  plan: {
    html: () => { const p = profile(); return `
      <div class="eyebrow">Your result</div>
      <h2>Your 28-day plan</h2>
      <ol class="weeks">
        <li><b>Week 1 · Learn</b><span>${p.fearHow ? 'Start from zero: ' : ''}how prices, odds and payouts work</span></li>
        <li><b>Week 2 · Practice</b><span>Play money on live events: ${esc(p.events)}</span></li>
        <li><b>Week 3 · Get coached</b><span>AI shows where your guesses go wrong</span></li>
        <li><b>Week 4 · Decide</b><span>Keep practicing or go live on a regulated exchange</span></li>
      </ol>
      <dl class="feed">
        <div class="feed-row"><dt>Daily time</dt><dd>${esc(p.minutes)} minutes</dd></div>
        <div class="feed-row"><dt>Your limit</dt><dd>${esc(p.limit)}</dd></div>
        ${p.fearGambling ? '<div class="feed-row"><dt>Markets</dt><dd>No sports, no casino-style bets</dd></div>' : ''}
      </dl>
      ${p.fearLose ? '<div class="callout">You said you’re afraid to lose money. You won’t risk a dollar until you choose to.</div>' : ''}`; },
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
        <h2>A discount for your first month</h2>
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
        <p class="disc">Cancel anytime. ${DISCLAIMER} Oddlin never trades for you or holds your money.</p>`;
    },
    bind: () => {
      const plan = () => PLANS.find(p => p.id === state.plan);
      const tl = () => { const p = plan(); $('#tl').innerHTML = `
        <li><b>Today: ${money(priceOf(p))}</b><span>Full access to your plan</span></li>
        <li><b>Day ${p.days - 3}: reminder email</b><span>3 days before renewal</span></li>
        <li><b>Day ${p.days}: ${money(p.full)} ${p.every}</b><span>Cancel anytime before</span></li>`; };
      tl();
      track('track', 'InitiateCheckout', product([planId(plan())], plan().name, priceOf(plan())));
      $$('input[name=plan]').forEach(r => r.addEventListener('change', () => { state.plan = r.value; tl(); }));
      if (promoOn()) timers.push(setInterval(() => {
        if (!promoOn()) { track('trackCustom', 'PromoExpired', {}); render(); return; }
        $('#tleft').textContent = mmss(promoLeft());
      }, 1000));
      setCta([{ label: 'Start my plan', onClick: () => {
        const p = plan();
        track('track', 'Purchase', Object.assign(product([planId(p)], p.name, priceOf(p)), { promo: promoOn() }));
        next();
      } }]);
    }
  },
  /* Upsell before the product, right after payment */
  crosssell: {
    html: () => `
      <div class="eyebrow">You're in · one more thing</div>
      <h2>Add the Fed and inflation masterclass</h2>
      <p class="lede">Six 5-minute lessons on how rates and prices move your mortgage, savings and credit card. And how markets price them.</p>
      <p class="disc">One-time $19. Education only.</p>`,
    bind: () => setCta([
      { label: 'Add it for $19', onClick: () => { state.upsell = true; track('track', 'AddToCart', product([UPSELL_ID], 'Fed and inflation masterclass', 19)); next(); } },
      { label: 'No thanks', ghost: true, onClick: () => { track('trackCustom', 'CrossSellDeclined', { content_name: UPSELL_ID }); next(); } }
    ])
  },
  /* Smoke test ends here: honest reveal, nothing was charged */
  done: {
    html: () => `
      <div class="eyebrow">Thank you</div>
      <h1>Sorry, Oddlin isn't live yet.</h1>
      <p class="lede">This is a beta test. We're checking whether people want a safe way to learn prediction markets, and you just helped us answer that.</p>
      <div class="card">
        <h3>You have not been charged.</h3>
        <p class="lede">We didn't ask for card details, and no payment was taken${state.upsell ? ', including the masterclass' : ''}.</p>
      </div>
      ${state.email ? `<div class="callout">If Oddlin launches, we'll email <b>${esc(state.email)}</b> with your plan. Nothing else.</div>` : ''}`,
    bind: () => { setCta(null); track('trackCustom', 'BetaReveal', { plan: state.plan, upsell: state.upsell }); }
  }
};

function start(d) {
  if (d && d.ans) state = Object.assign(fresh(), d);
  render();
}
start();
