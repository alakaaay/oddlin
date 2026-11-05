// AI Scanner screen (#/scanner): today's edition of AI picks, the same for every user, published once a day per platform.
// Picks open in rank order: 1 a day free, 5 with Scanner Pro, 10 with Scanner Max.
// The screen is a list of every pick the user opened (30-day history); a row opens the pick's own sheet with the
// reasons and "Trade it", which opens the simulator ticket with the AI's odds.
// The list repaints in place (not through route()), so the scroll position never jumps.
import { ADDONS, buyAddon, loadBilling } from './billing.js';
import { getToken } from './gate.js';
import { openTicket } from './sim.js';
import { S, save } from './state.js';
import { $, esc } from './util.js';

let st = null, busy = false, err = ''; // status from the server, scan running, error text

const ERR = {
  daily_limit: 'That’s all your picks for today. Get more below or come back tomorrow.',
  edition_done: 'You’ve seen all of today’s picks on this platform. Try the other one or come back tomorrow.',
  no_markets: 'Couldn’t read the markets right now. Try again in a minute.',
  signed_out: 'Your session ended. Sign in again.',
  network: 'No connection. Check your internet and try again.'
};
async function post(body) {
  try {
    const r = await fetch('/api/scanner', { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(Object.assign({ token: getToken() }, body)) });
    return await r.json();
  } catch (e) { return { ok: false, error: 'network' }; }
}

const platform = () => (S.simPlatform === 'kalshi' ? 'kalshi' : 'polymarket');
const platName = p => (p === 'kalshi' ? 'Kalshi' : 'Polymarket');
const cents = p => `${Math.round(p * 100)}¢`;
const day = iso => (iso ? new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '');
const time = iso => new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
const resetTime = () => { const d = new Date(); d.setUTCHours(24, 0, 0, 0); return time(d.toISOString()); };
const RADAR = `<svg viewBox="0 0 48 48" aria-hidden="true"><circle cx="24" cy="24" r="18" class="ring"/><circle cx="24" cy="24" r="11" class="ring"/><circle cx="24" cy="24" r="4" class="ring"/><path d="M24 24 L24 6 A18 18 0 0 1 39.6 15 Z" class="sweep"/><circle cx="33" cy="17" r="2.2" class="blip b1"/><circle cx="15" cy="30" r="2" class="blip b2"/></svg>`;

// ── list ──
function row(s) {
  return `<button class="pick-row" data-pick="${s.id}">
    <span class="pick-rank">${s.rank ? `#${s.rank}` : '•'}</span>
    <span class="pick-main"><b>${esc(s.headline || s.title)}</b>
      <span class="pick-meta"><span class="sig-side ${s.side}">${s.side.toUpperCase()}</span>${cents(s.price)} → AI ${s.ai_side}% · ${platName(s.platform)}</span></span>
    <span class="pick-gap ${s.edge > 0 ? 'pos' : ''}">${s.edge > 0 ? '+' : ''}${s.edge}¢</span>
  </button>`;
}
function history() {
  const list = st ? st.history : [];
  if (!list.length) return '';
  const today = new Date().toISOString().slice(0, 10), groups = new Map();
  for (const s of list) { const k = s.day || today; if (!groups.has(k)) groups.set(k, []); groups.get(k).push(s); }
  return `<div class="pick-list">${[...groups].map(([d, items]) => `<p class="eyebrow">${d === today ? 'Today' : new Date(d + 'T12:00:00Z').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}</p>
    <div class="card pick-card">${items.map(row).join('')}</div>`).join('')}</div>`;
}
function upsell() {
  if (st && st.tier) return ''; // already on Scanner Pro or Max: no upsell
  const plans = ['scanner_5', 'scanner_10'];
  return `<div class="card scan-up"><h3>${st && st.left === 0 ? 'See more of today’s picks' : 'More picks a day'}</h3>
    <div class="scan-plans">${plans.map(id => { const A = ADDONS[id]; return `<button class="scan-plan${id === 'scanner_10' ? ' best' : ''}" data-buy-scan="${id}">
      ${id === 'scanner_10' ? '<span class="scan-best">Best value</span>' : ''}<span class="scan-n">${id === 'scanner_10' ? 10 : 5}</span><span class="small">picks a day</span>
      <b>$${A.price}</b><span class="small muted">every 4 weeks</span></button>`; }).join('')}</div>
    <p class="disc">Beta: no payment is taken yet. Cancel anytime in Profile.</p></div>`;
}

export function scannerView() {
  const left = st ? st.left : null, limit = st ? st.limit : 1, seen = st ? st.today.length : 0;
  const plan = st && st.tier ? (st.tier === 'scanner_10' ? 'Scanner Max' : 'Scanner Pro') : 'Free';
  return `<section class="view scanner">
    <a class="back-link" href="#/ai">‹ AI Tools</a>
    <div class="scan-hero">
      <div class="scan-radar">${RADAR}</div>
      <div><p class="eyebrow">AI Scanner</p><h1>Trades that look cheap</h1>
        <p>Every day the AI reads the news, checks live markets and lists the ones where the price looks too low.</p></div>
    </div>
    <ol class="scan-steps">
      <li><span aria-hidden="true">📰</span>Reads today’s news</li>
      <li><span aria-hidden="true">⚖️</span>Compares its odds with the price</li>
      <li><span aria-hidden="true">🎯</span>Lists the 10 best</li>
    </ol>
    <p class="scan-same"><span aria-hidden="true">👥</span>Every Oddlin user gets the same picks, in the same order. Your plan only sets how many you can open.</p>
    <div class="seg" role="group" aria-label="Platform"><button data-scan-plat="polymarket" aria-pressed="${platform() === 'polymarket'}">Polymarket</button><button data-scan-plat="kalshi" aria-pressed="${platform() === 'kalshi'}">Kalshi</button></div>
    ${busy ? loaderHTML() : `<button class="btn scan-go" data-scan ${left === 0 || left == null ? 'disabled' : ''}>${left === 0 ? `More picks at ${resetTime()}` : seen ? 'Show the next pick' : 'Show today’s pick'}</button>
    ${st ? `<p class="scan-left">${left} of ${limit} ${limit === 1 ? 'pick' : 'picks'} left today · ${plan}</p>` : ''}`}
    ${err ? `<p class="feedback miss" role="alert">${esc(err)}</p>` : ''}
    ${history()}
    ${st ? upsell() : ''}
  </section>`;
}
// Repaints the scanner in place, keeping the scroll position
function paint() { const v = $('#view'); if (v && v.querySelector('.scanner')) v.innerHTML = scannerView(); }

export async function loadScanner() {
  const before = JSON.stringify([st, err]);
  const r = await post({ action: 'status' });
  if (r.ok) { st = r; err = ''; } else err = ERR[r.error] || 'Couldn’t load the scanner. Try again.';
  if (!busy && JSON.stringify([st, err]) !== before) paint();
}

// ── one pick, on its own sheet ──
function openPick(s) {
  const layer = $('#layer'), pc = Math.round(s.price * 100), side = s.side.toUpperCase(), gap = s.edge;
  layer.innerHTML = `<div class="sheet enter" role="dialog" aria-modal="true" aria-label="AI pick"><div class="sheet-in">
    <div class="av-top"><button class="x" data-close aria-label="Close">×</button><h3>${s.rank ? `Pick #${s.rank}` : 'AI pick'}</h3><span></span></div>
    <article class="sig">
      <div class="sig-top"><span class="small muted">${platName(s.platform)}${s.closes ? ` · ends ${day(s.closes)}` : ''}</span><span class="sig-conf ${s.confidence}">${s.confidence} confidence</span></div>
      <h2>${esc(s.headline || s.title)}</h2>
      <p class="small muted">${esc(s.title)}</p>
      <div class="sig-pick"><span class="sig-side ${s.side}">${side}</span><span>Buy <b>${side}</b> at <b>${pc}¢</b></span></div>
      <div class="sig-bars" role="img" aria-label="The price says ${pc}%, the AI says ${s.ai_side}%">
        <div class="sig-bar"><span>Price says</span><span class="track"><i style="width:${pc}%"></i></span><b class="mono">${pc}%</b></div>
        <div class="sig-bar ai"><span>AI says</span><span class="track"><i style="width:${s.ai_side}%"></i></span><b class="mono">${s.ai_side}%</b></div>
      </div>
      <div class="sig-gap ${gap > 0 ? 'pos' : 'neg'}"><b>${gap > 0 ? '+' : ''}${gap}¢</b><span>${gap > 0 ? `If the AI is right, each $1 contract is worth about ${gap}¢ more than its price.` : 'No clear edge here. The AI and the price mostly agree.'}</span></div>
      <p class="sig-h">Why it looks good</p>
      <ul class="sig-why">${s.reasons.map(r => `<li>${esc(r)}</li>`).join('')}</ul>
      ${s.risk ? `<p class="sig-risk"><span aria-hidden="true">⚠️</span>${esc(s.risk)}</p>` : ''}
      <p class="disc">${s.published_at ? `Published ${day(s.published_at)}, ${time(s.published_at)} at ${pc}¢. Prices move, the ticket shows the live price. ` : ''}Same picks for every user. AI estimate, it can be wrong. Demo money only, not financial advice.</p>
    </article>
    <div class="lesson-foot"><button class="btn gold" data-trade>Trade it with demo money</button><button class="btn ghost" data-close>Not now</button></div>
  </div></div>`;
  layer.onclick = e => {
    if (e.target.closest('[data-close]')) { layer.innerHTML = ''; layer.onclick = null; return; }
    if (e.target.closest('[data-trade]')) {
      layer.innerHTML = ''; layer.onclick = null;
      openTicket({ platform: s.platform, title: s.event_title, closes: s.closes, markets: [{}] },
        { id: s.market_id, label: s.label, yes: s.yes, no: s.no }, s.side, s.ai_yes);
    }
  };
}

// ── loading card while the pick is being found (in place of the button, not full screen) ──
const STEPS = ['Reading today’s news', 'Checking 30 live markets', 'Comparing AI odds with prices', 'Ranking today’s best picks'];
const loaderHTML = () => `<div class="scan-load" role="status" aria-live="polite">
    <div class="scan-load-radar">${RADAR}<span class="pulse p1"></span><span class="pulse p2"></span></div>
    <div class="scan-load-txt"><b>Scanning the markets</b>
      <ol class="scan-load-steps">${STEPS.map(t => `<li><span class="sl-tick" aria-hidden="true"></span>${t}</li>`).join('')}</ol></div>
    <div class="scan-load-bar"><i></i></div>
  </div>`;
function runLoader() {
  let i = 0;
  const box = () => $('.scan-load');
  const step = () => {
    const b = box(); if (!b) return;
    b.querySelectorAll('.scan-load-steps li').forEach((li, k) => { li.className = k < i ? 'done' : k === i ? 'now' : ''; });
    const bar = b.querySelector('.scan-load-bar i'); if (bar) bar.style.width = `${Math.min(92, (i + 1) * 23)}%`;
    if (i < STEPS.length - 1) i++;
  };
  step();
  const b = box(); if (b) b.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  const t = setInterval(step, 1400);
  return async () => {
    clearInterval(t);
    const b2 = box();
    if (b2) { b2.querySelectorAll('.scan-load-steps li').forEach(li => { li.className = 'done'; }); const bar = b2.querySelector('.scan-load-bar i'); if (bar) bar.style.width = '100%'; }
    await new Promise(r => setTimeout(r, 450));
  };
}

async function scan() {
  busy = true; err = ''; paint();
  const done = runLoader(), started = Date.now();
  const r = await post({ action: 'scan', platform: platform() });
  await new Promise(res => setTimeout(res, Math.max(0, 2600 - (Date.now() - started)))); // let the loader play even when the pick is cached
  await done();
  busy = false;
  if (r.ok) {
    st.today = [r.signal].concat(st.today);
    st.history = [Object.assign({ day: new Date().toISOString().slice(0, 10) }, r.signal)].concat(st.history);
    st.left = r.left;
    paint(); openPick(r.signal);
  } else { err = ERR[r.error] || 'The scan didn’t work. Try again in a minute.'; if (r.error === 'daily_limit') st.left = 0; paint(); }
}

// Click handling for the scanner screen; returns true when it handled the click
export function scannerClick(e) {
  if (!$('.scanner') || e.target.closest('#layer') || e.target.closest('#modal')) return false;
  if (e.target.closest('[data-scan]')) { if (!busy) scan(); return true; }
  const p = e.target.closest('[data-scan-plat]'); if (p) { S.simPlatform = p.dataset.scanPlat; save(); paint(); return true; }
  const pk = e.target.closest('[data-pick]'); if (pk) { const s = st.history.find(x => x.id === +pk.dataset.pick); if (s) openPick(s); return true; }
  const b = e.target.closest('[data-buy-scan]');
  if (b) { loadBilling().then(() => buyAddon(b.dataset.buyScan)).then(ok => { if (ok) loadScanner(); }); return true; }
  return false;
}
