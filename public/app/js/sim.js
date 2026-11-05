// Simulator: live Kalshi and Polymarket markets, traded with play money.
// Home: one wallet card (cash, in trades, P&L), a "Buy a contract" button (opens the market browser with search), then My contracts as a compact list
// with P&L; a row opens the contract's details (and Sell). Buying opens the market browser (simTab 'browse').
// Markets come from GET /api/markets (sports and crypto left out, hottest first by 24h volume).
// Trades go through POST /api/trade: the server locks the live price, sells at the live bid and settles resolved
// markets. Payouts are added to the player's coins here, once per trade, then acknowledged to the server.
import { getToken } from './gate.js';
import { checkBadges } from './progression.js';
import { route } from './router.js';
import { S, save, touchStreak } from './state.js';
import { $, esc } from './util.js';

const PLATFORMS = [['polymarket', 'Polymarket'], ['kalshi', 'Kalshi']];
const AMOUNTS = [10, 25, 50, 100];
const CACHE_MS = 60 * 1000;

export let simTab = 'home'; // 'home' (wallet + my contracts) or 'browse' (buy: search and live markets)
export function setSimTab(v) { simTab = v === 'browse' || v === 'markets' ? 'browse' : 'home'; }
let cat = 'hot', query = '', events = [], categories = [], openEvents = new Set();
const listCache = new Map();
const platform = () => (S.simPlatform === 'kalshi' ? 'kalshi' : 'polymarket');
const platformName = p => (p === 'kalshi' ? 'Kalshi' : 'Polymarket');
const cents = p => `${Math.round(p * 100)}¢`;
const usd = n => '$' + n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); // trade sums down to the cent
const short = n => n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : n >= 1e3 ? `${Math.round(n / 1e3)}K` : String(Math.round(n));
const volume = e => (e.unit === 'usd' ? `$${short(e.volume)} traded today` : `${short(e.volume)} contracts today`);
const closeDate = iso => (iso ? new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: new Date(iso).getFullYear() !== new Date().getFullYear() ? 'numeric' : undefined }) : '');

async function post(body) {
  try {
    const r = await fetch('/api/trade', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(Object.assign({ token: getToken() }, body)) });
    return await r.json();
  } catch (e) { return { ok: false, error: 'network' }; }
}
// AI review of one contract: cached on the server for the day, and here for the session
const reviews = new Map();
async function getReview(e, m, title) {
  const key = e.platform + ':' + m.id;
  if (reviews.has(key)) return reviews.get(key);
  try {
    const r = await fetch('/api/review', { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: getToken(), platform: e.platform, market_id: m.id, title }) }).then(x => x.json());
    if (r.ok && r.review) reviews.set(key, r);
    return r;
  } catch (err) { return { ok: false, error: 'network' }; }
}
// AI opinion in the ticket: price vs AI odds bars, a plain verdict for the chosen side, short reasons both ways
function reviewCard(rv, side, price) {
  const head = conf => `<div class="aiop-head"><span class="aiop-ic" aria-hidden="true">✨</span><b>AI opinion</b>${conf ? `<span class="ai-conf ${conf}">${conf} confidence</span>` : ''}</div>`;
  if (!rv) return `<div class="card aiop">${head()}<p class="small muted ai-loading">Reading the news and the market rules…</p></div>`;
  if (!rv.ok || !rv.review) return `<div class="card aiop">${head()}<p class="small muted">AI opinion isn’t available right now. <button class="link" data-review-retry>Try again</button></p></div>`;
  const r = rv.review, mid = Math.round((r.ai_low + r.ai_high) / 2), pc = Math.round(price * 100);
  const aiSide = side === 'yes' ? mid : 100 - mid, lo = side === 'yes' ? r.ai_low : 100 - r.ai_high, hi = side === 'yes' ? r.ai_high : 100 - r.ai_low;
  const gap = aiSide - pc;
  const verdict = gap >= 5 ? ['cheap', '👍', `${side.toUpperCase()} looks cheap`, `The AI thinks ${side.toUpperCase()} is more likely than its price says.`]
    : gap <= -5 ? ['pricey', '👎', `${side.toUpperCase()} looks pricey`, `The AI thinks ${side.toUpperCase()} is less likely than its price says.`]
    : ['fair', '🤝', 'Fair price', 'The AI and the price roughly agree.'];
  const list = (a, cls) => a.slice(0, 2).map(x => `<li class="${cls}">${esc(x)}</li>`).join('');
  return `<div class="card aiop">${head(r.confidence)}
    <p class="aiop-sum">${esc((String(r.summary).match(/^.*?[.!?](\s|$)/) || [r.summary])[0].trim())}</p>
    <div class="sig-bars" role="img" aria-label="Chance of ${side.toUpperCase()}: price ${pc}%, AI ${lo} to ${hi}%">
      <p class="small muted">Chance of ${side.toUpperCase()}</p>
      <div class="sig-bar"><span>Price says</span><span class="track"><i style="width:${pc}%"></i></span><b class="mono">${pc}%</b></div>
      <div class="sig-bar ai"><span>AI says</span><span class="track range"><i style="width:${aiSide}%"></i><em style="left:${lo}%;width:${Math.max(2, hi - lo)}%"></em></span><b class="mono">${lo === hi ? lo : `${lo}–${hi}`}%</b></div>
    </div>
    <div class="aiop-verdict ${verdict[0]}"><span class="aiop-emo" aria-hidden="true">${verdict[1]}</span><span><b>${verdict[2]}</b><span>${verdict[3]}${gap >= 5 ? ` About ${gap}¢ per $1 contract.` : ''}</span></span></div>
    <div class="aiop-why">
      <div><p class="aiop-h yes">Why it could happen</p><ul>${list(r.yes_reasons, 'yes')}</ul></div>
      <div><p class="aiop-h no">Why it might not</p><ul>${list(r.no_reasons, 'no')}</ul></div>
    </div>
    ${r.watch && r.watch[0] ? `<p class="aiop-watch"><span aria-hidden="true">👀</span>Watch: ${esc(r.watch[0])}</p>` : ''}
    <p class="disc">AI estimate, updated once a day. It can be wrong and isn’t financial advice.</p></div>`;
}
const TRADE_ERR = {
  market_closed: 'This market just closed or moved out of range. Pick another one.',
  amount_too_small: 'The amount is too small for this price.',
  no_buyers: 'Nobody is buying right now. Try again in a minute.',
  already_settled: 'This market already settled. Your result is in My contracts.',
  market_unavailable: 'Couldn’t reach the market. Try again in a minute.',
  signed_out: 'Your session ended. Sign in again.',
  network: 'No connection. Check your internet and try again.'
};

// Server trade → the shape the rest of the app reads (stats, badges, coach)
function adoptTrade(t) {
  const settled = t.status === 'won' || t.status === 'lost';
  return Object.assign({}, t, { price: Number(t.price), exit_price: t.exit_price == null ? null : Number(t.exit_price), settled, won: t.status === 'won' });
}

export function stats(list = S.trades) {
  const s = list.filter(t => t.settled);
  if (!s.length) return { n: 0, hit: 0, brier: 0 };
  const brier = s.reduce((a, t) => a + Math.pow(t.est / 100 - (t.outcome ? 1 : 0), 2), 0) / s.length;
  return { n: s.length, hit: s.filter(t => t.won).length / s.length, brier };
}

// ── view ──
export function simView() {
  if (simTab === 'browse') return `<section class="view sim">
    <button class="back-link link-btn" data-seg="home">‹ My contracts</button>
    <div><p class="eyebrow">Buy a contract</p><h1>Live markets</h1></div>
    <div class="seg plat" role="group" aria-label="Data source">${PLATFORMS.map(([id, name]) => `<button data-plat="${id}" aria-pressed="${platform() === id}">${name}</button>`).join('')}</div>
    <label class="sim-search"><span class="sr">Search markets</span><input id="sim-q" type="search" placeholder="Search ${platformName(platform())} markets" value="${esc(query)}" autocomplete="off"></label>
    <div class="cat-chips" role="group" aria-label="Category" ${query ? 'hidden' : ''}>${(categories.length ? categories : [{ id: 'hot', label: 'Hot' }]).map(c => `<button data-cat="${c.id}" aria-pressed="${c.id === cat}">${esc(c.label)}</button>`).join('')}</div>
    <div id="sim-list"><p class="muted small center">Loading live markets…</p></div>
    <p class="disc">Live prices from ${platformName(platform())}, refreshed every 2 minutes. Sports and crypto are left out. Demo money only.</p>
  </section>`;
  return `<section class="view sim">
    <div><p class="eyebrow">Simulator · demo money</p><h1>Practice on live events</h1></div>
    <div id="sim-wallet">${walletCard()}</div>
    <a class="real-card" href="#/real">
      <span class="real-ic" aria-hidden="true">🚀</span>
      <span class="real-txt"><b>Ready for real trades?</b><span>Open an account and start</span></span>
      <span class="chev" aria-hidden="true">›</span>
    </a>
    <button class="btn buy-btn" data-seg="browse">Buy a contract</button>
    <div id="sim-mine">${mineList()}</div>
  </section>`;
}

// Home refreshes the trades (live prices for P&L); browse loads the markets
export function loadSim() {
  if (!S.simIntroSeen) showIntro();
  return simTab === 'browse' ? loadMarkets() : refreshTrades();
}

// Small popup used for the first-visit disclaimer and the P&L explainer
function infoModal(html, button, onClose, cls = '') {
  const m = $('#modal');
  m.innerHTML = `<div class="modal-back" data-modal-close><div class="modal info ${cls}" role="dialog" aria-modal="true">${html}
    <button class="btn" data-modal-close>${button}</button></div></div>`;
  const close = () => { m.innerHTML = ''; m.onclick = null; document.removeEventListener('keydown', onKey); if (onClose) onClose(); };
  const onKey = e => { if (e.key === 'Escape') close(); };
  document.addEventListener('keydown', onKey);
  m.onclick = e => { if (e.target.matches('[data-modal-close]') || e.target.closest('button[data-modal-close]')) close(); };
  setTimeout(() => { const b = m.querySelector('button[data-modal-close]'); if (b) b.focus(); }, 30);
}
// First visit: make it unmistakable that this is demo money and real money is never touched
function showIntro() {
  infoModal(`<div class="modal-ic"><i class="demo-tag big">DEMO</i></div>
    <h2>This is demo money</h2>
    <p class="muted">You get <b>${usd(S.simCash)}</b> in demo dollars to practice on real Kalshi and Polymarket events. It isn\u2019t real money and can\u2019t be withdrawn.</p>
    <ul class="intro-list">
      <li>We never touch your money: no card, no deposits, no real trades.</li>
      <li>Prices are real and come from live markets, so your calls play out like the real thing.</li>
      <li>Wins and losses only change your demo balance.</li>
    </ul>`, 'Got it, let\u2019s practice', () => { S.simIntroSeen = true; save(); if (ctaAfterIntro) { ctaAfterIntro = false; showScanCta(); } });
}
let ctaAfterIntro = false;
// After the first demo trade: point to the AI Scanner (never promise a result: "good trade", "looks cheap")
function showScanCta() {
  S.scanCtaSeen = true; save();
  const m = $('#modal');
  m.innerHTML = `<div class="modal-back" data-modal-close><div class="modal scan-cta" role="dialog" aria-modal="true" aria-labelledby="sc-t">
    <div class="scan-cta-ic" aria-hidden="true"><svg viewBox="0 0 48 48"><circle cx="24" cy="24" r="18" class="ring"/><circle cx="24" cy="24" r="11" class="ring"/><path d="M24 24 L24 6 A18 18 0 0 1 39.6 15 Z" class="sweep"/><circle cx="33" cy="17" r="2.2" class="blip"/></svg></div>
    <h2 id="sc-t">Your first demo trade! 🎉</h2>
    <p class="muted">Want a hand picking the next one? Ask the AI to find you a good trade: it checks live markets and shows where the price looks too low, with simple reasons.</p>
    <button class="btn gold" data-scan-cta>Find me a good trade</button>
    <button class="btn ghost" data-modal-close>Maybe later</button></div></div>`;
  const close = () => { m.innerHTML = ''; m.onclick = null; document.removeEventListener('keydown', onKey); };
  const onKey = e => { if (e.key === 'Escape') close(); };
  document.addEventListener('keydown', onKey);
  m.onclick = e => {
    if (e.target.closest('[data-scan-cta]')) { close(); location.hash = '#/scanner'; return; }
    if (e.target.matches('[data-modal-close]') || e.target.closest('button[data-modal-close]')) close();
  };
  setTimeout(() => { const b = m.querySelector('[data-scan-cta]'); if (b) b.focus(); }, 30);
}
function showPnlInfo() {
  infoModal(`<h2>What is P&amp;L?</h2>
    <p class="muted">How much demo money you’ve made or lost, on Kalshi and Polymarket together.</p>
    <ul class="intro-list">
      <li>Closed trades: what you got back.</li>
      <li>Open trades: what they’re worth now.</li>
      <li>%: how much you gained or lost for every $100 you put in.</li>
    </ul>`, 'Got it', null, 'compact');
}

const costOf = t => t.shares * t.price;
// What a trade is worth now: payout once closed, live bid while open (or its cost when no live price came back)
const valueOf = t => t.status === 'won' ? t.shares : t.status === 'lost' ? 0 : t.status === 'sold' ? t.shares * t.exit_price
  : t.now != null ? t.shares * Number(t.now) : costOf(t);
const money = n => `${n >= 0 ? '+' : '\u2212'}${usd(Math.abs(n))}`;
const pctOf = (pnl, cost) => (cost > 0 ? `${pnl >= 0 ? '+' : '\u2212'}${Math.abs(pnl / cost * 100).toFixed(1)}%` : '');
const tone = n => (n > 0.004 ? 'up' : n < -0.004 ? 'down' : '');

// One card: cash, in trades and P&L for all demo trades on both platforms
function walletCard() {
  const ts = S.trades, open = ts.filter(t => t.status === 'open');
  const pnl = ts.reduce((a, t) => a + valueOf(t) - costOf(t), 0);
  const invested = ts.reduce((a, t) => a + costOf(t), 0);
  const inTrades = open.reduce((a, t) => a + valueOf(t), 0);
  return `<div class="card wallet1">
    <div class="w-head"><i class="demo-tag">DEMO</i><span class="small muted">Demo money, never real</span></div>
    <div class="w-row">
      <div><span class="small muted">Cash</span><b class="mono">${usd(S.simCash)}</b></div>
      <div><span class="small muted">In trades</span><b class="mono">${usd(inTrades)}</b></div>
      <div class="w-pnl ${tone(pnl)}"><span class="small muted">P&amp;L <button class="info-btn" data-pnl-info aria-label="What is P&amp;L?">i</button></span><b class="mono">${money(pnl)}</b><span class="w-pct">${pctOf(pnl, invested) || '0.0%'}</span></div>
    </div>
  </div>`;
}

// My contracts: open first, then closed; each row shows only the title, side and P&L
function mineList() {
  const open = S.trades.filter(t => t.status === 'open').length;
  const head = `<div class="mine-head"><h3>My contracts</h3>${S.trades.length ? `<span class="small muted">${open} open · ${S.trades.length - open} closed</span>` : ''}</div>`;
  const ts = S.trades.slice().sort((a, b) => (a.status === 'open') === (b.status === 'open') ? String(b.opened_at).localeCompare(String(a.opened_at)) : a.status === 'open' ? -1 : 1);
  if (!ts.length) return head + `<div class="card empty-mine"><p class="muted small">No contracts yet. Tap Buy a contract, set your odds and buy with demo money.</p></div>`;
  return head + `<div class="card mine-card">${ts.map(t => {
    const pnl = valueOf(t) - costOf(t), st = t.status === 'open' ? '' : t.status === 'sold' ? 'Sold' : t.status === 'won' ? 'Won' : 'Lost';
    return `<button class="c-row" data-contract="${t.id}">
      <span class="c-main"><b>${esc(t.title)}</b><span class="c-meta"><span class="sig-side ${t.side}">${t.side.toUpperCase()}</span>${st ? `<span class="c-st ${t.status}">${st}</span>` : ''}</span></span>
      <span class="c-pnl ${tone(pnl)}"><b class="mono">${money(pnl)}</b><span>${pctOf(pnl, costOf(t))}</span></span>
    </button>`;
  }).join('')}</div>
  <p class="disc">Open contracts settle on their own when the event ends. You can also sell early at the live price.</p>`;
}
function paintMine() { const b = $('#sim-mine'); if (b) b.innerHTML = mineList(); }

function paintWallet() { const w = $('#sim-wallet'); if (w) w.innerHTML = walletCard(); }
async function refreshTrades() {
  const r = await post({ action: 'list' });
  if (!r.ok) { const b = $('#sim-mine'); if (b && !S.trades.length) b.innerHTML = `<div class="card"><p class="muted small">${esc(TRADE_ERR[r.error] || 'Contracts didn’t load. Try again in a minute.')}</p><button class="btn ghost" data-retry>Try again</button></div>`; return; }
  creditClosed(r.trades);
  S.trades = r.trades.map(adoptTrade);
  save(); checkBadges(); paintWallet(); paintMine();
}

async function loadMarkets() {
  const p = platform(), key = `${p}|${cat}|${query}`;
  let data = listCache.get(key);
  if (!data || Date.now() - data.at > CACHE_MS) {
    try {
      const r = await fetch(`/api/markets?platform=${p}&cat=${encodeURIComponent(cat)}&q=${encodeURIComponent(query)}`);
      const j = await r.json();
      if (!j.ok) throw new Error(j.error);
      data = { at: Date.now(), events: j.events, categories: j.categories };
      listCache.set(key, data);
    } catch (e) {
      const box = $('#sim-list');
      if (box) box.innerHTML = '<div class="card"><h3>Markets didn’t load</h3><p class="muted small">The data source didn’t answer. Try again in a minute.</p><button class="btn ghost" data-retry>Try again</button></div>';
      return;
    }
  }
  if (`${platform()}|${cat}|${query}` !== key) return; // the player switched while this was loading
  const firstCats = !categories.length;
  events = data.events; categories = data.categories;
  if (firstCats && !query) { const chips = $('.cat-chips'); if (chips) chips.outerHTML = simView().match(/<div class="cat-chips"[\s\S]*?<\/div>/)[0]; }
  const box = $('#sim-list'); if (!box) return;
  box.innerHTML = events.length ? events.map(eventCard).join('')
    : `<div class="card"><h3>Nothing here</h3><p class="muted small">${query ? `No open markets match “${esc(query)}”. Try another word.` : 'No open markets in this category right now.'}</p></div>`;
}

function eventCard(e, i) {
  const label = (categories.find(c => c.id === e.category) || {}).label || '';
  const single = e.markets.length === 1;
  const all = openEvents.has(e.id), rows = all ? e.markets : e.markets.slice(0, 3);
  const row = (m, j) => `<div class="ev-row">
      <span class="ev-label">${single ? 'Yes' : esc(m.label)}</span><b class="mono">${Math.round(m.yes * 100)}%</b>
      <button class="buy yes" data-buy="${i}:${j}:yes" aria-label="Buy YES on ${esc(m.label)} at ${cents(m.yes)}">Yes ${cents(m.yes)}</button>
      <button class="buy no" data-buy="${i}:${j}:no" aria-label="Buy NO on ${esc(m.label)} at ${cents(m.no)}">No ${cents(m.no)}</button></div>`;
  return `<article class="card ev">
    <div class="ev-head"><span class="chip">${esc(label)}</span><span class="small muted">${volume(e)}${e.closes ? ` · closes ${closeDate(e.closes)}` : ''}</span></div>
    <h3>${esc(e.title)}</h3>
    <div class="ev-rows">${rows.map(row).join('')}</div>
    ${e.markets.length > 3 ? `<button class="link" data-more="${esc(e.id)}">${all ? 'Show less' : `Show all ${e.markets.length} outcomes`}</button>` : ''}
  </article>`;
}

// ── trade ticket ──
// est0: YES odds stored with the trade (the AI Scanner passes its estimate); otherwise the AI opinion's midpoint, else the crowd's price
export function openTicket(e, m, side0, est0) {
  let side = side0, est = est0 || null, amt = AMOUNTS.find(a => a <= S.simCash && a >= 25) || 10, busy = false, err = '';
  const title = e.title + (e.markets.length > 1 || m.label !== 'Yes' ? ` · ${m.label}` : '');
  const layer = $('#layer');
  let review = null, closed = false;
  const fetchReview = () => getReview(e, m, title).then(r => { review = r; if (!closed && layer.firstChild) draw(); });
  const estNow = () => est || (review && review.review ? Math.round((review.review.ai_low + review.review.ai_high) / 2) : Math.round(m.yes * 100));
  function draw() {
    const price = side === 'yes' ? m.yes : m.no, pc = Math.round(price * 100);
    const shares = Math.floor(amt / price), cost = shares * price;
    const prev = layer.querySelector('.sheet-in'), scrollY = prev ? prev.scrollTop : 0; // keep the scroll position on redraw
    layer.innerHTML = `<div class="sheet${layer.firstChild ? '' : ' enter'}" role="dialog" aria-modal="true" aria-label="Trade"><div class="sheet-in">
      <div class="sheet-top"><button class="x" data-close aria-label="Close">×</button><span class="small muted">${platformName(e.platform)}${e.closes ? ` · closes ${closeDate(e.closes)}` : ''}</span></div>
      <div class="lesson-body">
        <h2>${esc(title)}</h2>
        <div class="card"><p class="eyebrow">Pick a side and amount</p>
          <div class="side"><button class="yes" data-side="yes" aria-pressed="${side === 'yes'}">YES ${cents(m.yes)}</button><button class="no" data-side="no" aria-pressed="${side === 'no'}">NO ${cents(m.no)}</button></div>
          <div class="amounts">${AMOUNTS.map(a => `<button data-amt="${a}" aria-pressed="${a === amt}" ${a > S.simCash ? 'disabled' : ''}>$${a}</button>`).join('')}</div>
          <div class="kv"><span>Contracts</span><b>${shares}</b></div>
          <div class="kv"><span>Max loss</span><b>${usd(cost)}</b></div>
          <div class="kv"><span>Payout if right</span><b>${usd(shares)}</b></div>
        </div>
        ${reviewCard(review, side, price)}
        ${err ? `<p class="feedback miss" role="alert">${esc(err)}</p>` : ''}
      </div>
      <div class="lesson-foot"><button class="btn" data-buy-now ${busy || cost > S.simCash || !shares ? 'disabled' : ''}>${busy ? 'Placing…' : `Place play-money trade · ${usd(cost)}`}</button>
        <p class="disc">Uses your simulator cash (${usd(S.simCash)} left). The price is locked from the live market when you tap.</p></div>
    </div></div>`;
    layer.querySelector('.sheet-in').scrollTop = scrollY;
  }
  layer.onclick = async ev => {
    if (ev.target.closest('[data-close]')) { closed = true; layer.innerHTML = ''; layer.onclick = null; return; }
    if (ev.target.closest('[data-review-retry]')) { review = null; draw(); fetchReview(); return; }
    const s = ev.target.closest('[data-side]'); if (s) { side = s.dataset.side; draw(); return; }
    const a = ev.target.closest('[data-amt]'); if (a) { amt = +a.dataset.amt; draw(); return; }
    if (ev.target.closest('[data-buy-now]') && !busy) {
      busy = true; err = ''; draw();
      const r = await post({ action: 'open', platform: e.platform, market_id: m.id, side, amount: amt, est: estNow(), title });
      busy = false;
      if (!r.ok) { err = TRADE_ERR[r.error] || 'The trade didn’t go through. Try again.'; return draw(); }
      const t = adoptTrade(r.trade);
      S.simCash -= t.shares * t.price;
      S.trades = [t].concat(S.trades.filter(x => x.id !== t.id));
      S.xp += 10; touchStreak(); save(); checkBadges();
      S.simPlatform = e.platform; save();
      closed = true; layer.innerHTML = ''; layer.onclick = null; setSimTab('home'); location.hash = '#/sim'; route();
      if (!S.scanCtaSeen && S.trades.length === 1) { if (S.simIntroSeen) showScanCta(); else ctaAfterIntro = true; } // first trade only; after the demo-money notice if it is showing
    }
  };
  draw();
  fetchReview();
}

// Adds the payout of trades that closed since the last look (won, lost, sold) to the simulator cash, once each,
// then tells the server. Settled calls also earn XP for accuracy.
function creditClosed(trades) {
  S.paidTrades = S.paidTrades || [];
  const fresh = trades.filter(t => t.status !== 'open' && !t.credited && !S.paidTrades.includes(t.id));
  if (!fresh.length) return;
  let cash = 0;
  for (const t of fresh) {
    const payout = t.status === 'won' ? t.shares : t.status === 'sold' ? t.shares * Number(t.exit_price) : 0;
    cash += payout;
    if (t.status !== 'sold') S.xp += Math.max(0, Math.round(20 * (1 - Math.pow(t.est / 100 - (t.outcome ? 1 : 0), 2) * 4)));
    S.paidTrades.push(t.id);
  }
  S.paidTrades = S.paidTrades.slice(-500);
  S.simCash += cash;
  post({ action: 'ack', ids: fresh.map(t => t.id) });
}

// ── one contract, in detail ──
function openContract(id) {
  const t = S.trades.find(x => x.id === id); if (!t) return;
  const layer = $('#layer');
  let busy = false, err = '';
  function draw() {
    const cost = costOf(t), value = valueOf(t), pnl = value - cost, now = t.now != null ? Number(t.now) : null;
    const rows = [
      ['Side', `${t.side.toUpperCase()} · ${t.shares} contracts`],
      ['Bought at', `${cents(t.price)} · ${usd(cost)}`],
      t.status === 'open' ? ['Price now', now != null ? cents(now) : 'unavailable'] : t.status === 'sold' ? ['Sold at', `${cents(t.exit_price)} · ${usd(value)}`] : ['Result', t.outcome ? 'The event happened' : 'The event didn’t happen'],
      [t.status === 'open' ? 'Worth now' : 'You got back', usd(value)],
      ['Pays if right', usd(t.shares)],
      ['Chance of YES: AI vs price', `${t.est}% vs ${Math.round((t.side === 'yes' ? t.price : 1 - t.price) * 100)}%`], // est: YES odds from the AI opinion at purchase (or the crowd's if none)
      ['Opened', new Date(t.opened_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })]
    ];
    layer.innerHTML = `<div class="sheet${layer.firstChild ? '' : ' enter'}" role="dialog" aria-modal="true" aria-label="Contract"><div class="sheet-in">
      <div class="av-top"><button class="x" data-close aria-label="Close">×</button><h3>${platformName(t.platform)}</h3><span></span></div>
      <h2 class="c-title">${esc(t.title)}</h2>
      <div class="c-big ${tone(pnl)}"><span class="small muted">${t.status === 'open' ? 'P&amp;L so far' : 'Final P&amp;L'}</span><b class="mono">${money(pnl)}</b><span>${pctOf(pnl, cost)}</span></div>
      <div class="card"><div class="list">${rows.map(([k, v]) => `<div class="li"><span class="muted">${k}</span><span>${v}</span></div>`).join('')}</div></div>
      ${err ? `<p class="feedback miss" role="alert">${esc(err)}</p>` : ''}
      ${t.status === 'open' ? `<div class="lesson-foot"><button class="btn" data-sell-now ${busy || !(now > 0) ? 'disabled' : ''}>${busy ? 'Selling…' : now > 0 ? `Sell now · ${usd(value)}` : 'No buyers right now'}</button>
        <p class="disc">Or keep it: it settles on its own when the event ends. Demo money only.</p></div>` : ''}
    </div></div>`;
  }
  layer.onclick = async e => {
    if (e.target.closest('[data-close]')) { layer.innerHTML = ''; layer.onclick = null; return; }
    if (e.target.closest('[data-sell-now]') && !busy) {
      busy = true; err = ''; draw();
      const r = await post({ action: 'sell', id: t.id });
      busy = false;
      if (!r.ok) { err = TRADE_ERR[r.error] || 'Couldn’t sell. Try again.'; return draw(); }
      await refreshTrades();
      const u = S.trades.find(x => x.id === t.id); if (u) Object.assign(t, u);
      draw();
    }
  };
  draw();
}

// ── events ──
let searchTimer = null;
document.addEventListener('input', ev => {
  if (ev.target.id !== 'sim-q') return;
  clearTimeout(searchTimer);
  searchTimer = setTimeout(() => {
    query = ev.target.value.trim();
    const chips = $('.cat-chips'); if (chips) chips.hidden = !!query;
    const box = $('#sim-list'); if (box) box.innerHTML = '<p class="muted small center">Searching…</p>';
    loadMarkets();
  }, 400);
});
document.addEventListener('click', async ev => {
  if (ev.target.closest('[data-pnl-info]')) { showPnlInfo(); return; }
  const ct = ev.target.closest('[data-contract]'); if (ct) { openContract(+ct.dataset.contract); return; }
  const p = ev.target.closest('[data-plat]');
  if (p) { S.simPlatform = p.dataset.plat; save(); cat = 'hot'; query = ''; categories = []; openEvents.clear(); route(); return; }
  const c = ev.target.closest('[data-cat]');
  if (c) { cat = c.dataset.cat; openEvents.clear(); route(); return; }
  const more = ev.target.closest('[data-more]');
  if (more) { const id = more.dataset.more; openEvents.has(id) ? openEvents.delete(id) : openEvents.add(id); const box = $('#sim-list'); if (box) box.innerHTML = events.map(eventCard).join(''); return; }
  const b = ev.target.closest('[data-buy]');
  if (b) { const [i, j, side] = b.dataset.buy.split(':'); const e = events[+i]; if (e) openTicket(e, e.markets[+j], side); return; }
  if (ev.target.closest('[data-retry]')) { listCache.clear(); loadSim(); return; }
});
