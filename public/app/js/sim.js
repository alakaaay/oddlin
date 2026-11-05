// Simulator: live Kalshi and Polymarket markets, traded with play money.
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

export let simTab = 'markets';
export function setSimTab(v) { simTab = v; }
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
const TRADE_ERR = {
  market_closed: 'This market just closed or moved out of range. Pick another one.',
  amount_too_small: 'The amount is too small for this price.',
  no_buyers: 'Nobody is buying right now. Try again in a minute.',
  already_settled: 'This market already settled. Your result is in My calls.',
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
  const open = mine().filter(t => t.status === 'open').length;
  return `<section class="view sim">
    <div><p class="eyebrow">Simulator · play money</p><h1>Practice on live events</h1></div>
    <div class="seg plat" role="group" aria-label="Data source">${PLATFORMS.map(([id, name]) => `<button data-plat="${id}" aria-pressed="${platform() === id}">${name}</button>`).join('')}</div>
    <div id="sim-wallet">${walletCard()}</div>
    <div class="seg" role="group"><button data-seg="markets" aria-pressed="${simTab === 'markets'}">Markets</button><button data-seg="mine" aria-pressed="${simTab === 'mine'}">My calls${open ? ` (${open})` : ''}</button></div>
    ${simTab === 'markets' ? `
      <label class="sim-search"><span class="sr">Search markets</span><input id="sim-q" type="search" placeholder="Search ${platformName(platform())} markets" value="${esc(query)}" autocomplete="off"></label>
      <div class="cat-chips" role="group" aria-label="Category" ${query ? 'hidden' : ''}>${(categories.length ? categories : [{ id: 'hot', label: 'Hot' }]).map(c => `<button data-cat="${c.id}" aria-pressed="${c.id === cat}">${esc(c.label)}</button>`).join('')}</div>
      <div id="sim-list"><p class="muted small center">Loading live markets…</p></div>
      <p class="disc">Live prices from ${platformName(platform())}, refreshed every 2 minutes. Sports and crypto are left out. Play money only: no real money is used.</p>`
    : '<div id="sim-mine"><p class="muted small center">Loading your calls…</p></div>'}
  </section>`;
}

// Markets tab also refreshes the trades in the background so the wallet shows live P&L
export function loadSim() {
  if (!S.simIntroSeen) showIntro();
  return simTab === 'markets' ? (loadMarkets(), refreshTrades()) : loadMine();
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
    </ul>`, 'Got it, let\u2019s practice', () => { S.simIntroSeen = true; save(); });
}
function showPnlInfo() {
  infoModal(`<h2>What is P&amp;L?</h2>
    <p class="muted">How much demo money you’ve made or lost on ${platformName(platform())}.</p>
    <ul class="intro-list">
      <li>Closed trades: what you got back.</li>
      <li>Open trades: what they’re worth now.</li>
      <li>%: profit for every $100 you traded.</li>
    </ul>`, 'Got it', null, 'compact');
}

// Trades of the platform on screen: Kalshi and Polymarket are kept apart everywhere
const mine = () => S.trades.filter(t => t.platform === platform());
const costOf = t => t.shares * t.price;
// What a trade is worth now: payout once closed, live bid while open (or its cost when no live price came back)
const valueOf = t => t.status === 'won' ? t.shares : t.status === 'lost' ? 0 : t.status === 'sold' ? t.shares * t.exit_price
  : t.now != null ? t.shares * Number(t.now) : costOf(t);
function walletCard() {
  const ts = mine(), open = ts.filter(t => t.status === 'open');
  const pnl = ts.reduce((a, t) => a + valueOf(t) - costOf(t), 0);
  const invested = ts.reduce((a, t) => a + costOf(t), 0);
  const pct = invested > 0 ? pnl / invested * 100 : 0; // return on the demo money put into trades
  const inTrades = open.reduce((a, t) => a + valueOf(t), 0);
  const sign = pnl > 0.004 ? 'up' : pnl < -0.004 ? 'down' : '';
  return `<div class="wallet">
    <div><span class="small muted">Cash <i class="demo-tag">DEMO</i></span><b class="mono">${usd(S.simCash)}</b></div>
    <div><span class="small muted">In trades <i class="demo-tag">DEMO</i></span><b class="mono">${usd(inTrades)}</b></div>
    <div class="pnl ${sign}"><span class="small muted">P&amp;L <button class="info-btn" data-pnl-info aria-label="What is P&amp;L?">i</button></span>
      <b class="mono">${pnl >= 0 ? '+' : '\u2212'}${usd(Math.abs(pnl))} <span class="pct">${pct >= 0 ? '+' : '\u2212'}${Math.abs(pct).toFixed(1)}%</span></b></div>
  </div>`;
}
function paintWallet() { const w = $('#sim-wallet'); if (w) w.innerHTML = walletCard(); }
async function refreshTrades() {
  const r = await post({ action: 'list' });
  if (!r.ok) return;
  creditClosed(r.trades);
  S.trades = r.trades.map(adoptTrade);
  save(); paintWallet();
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
function openTicket(e, m, side0) {
  let side = side0, est = Math.round(m.yes * 100), amt = AMOUNTS.find(a => a <= S.simCash && a >= 25) || 10, busy = false, err = '';
  const title = e.title + (e.markets.length > 1 || m.label !== 'Yes' ? ` · ${m.label}` : '');
  const layer = $('#layer');
  function draw() {
    const price = side === 'yes' ? m.yes : m.no, pc = Math.round(price * 100);
    const shares = Math.floor(amt / price), cost = shares * price;
    const prev = layer.querySelector('.sheet-in'), scrollY = prev ? prev.scrollTop : 0; // keep the scroll position on redraw
    const edge = (side === 'yes' ? est : 100 - est) - pc;
    layer.innerHTML = `<div class="sheet${layer.firstChild ? '' : ' enter'}" role="dialog" aria-modal="true" aria-label="Trade"><div class="sheet-in">
      <div class="sheet-top"><button class="x" data-close aria-label="Close">×</button><span class="small muted">${platformName(e.platform)}${e.closes ? ` · closes ${closeDate(e.closes)}` : ''}</span></div>
      <div class="lesson-body">
        <h2>${esc(title)}</h2>
        <div class="card"><p class="eyebrow">1 · Your odds first</p>
          <div class="kv"><span>I think YES has a</span><b>${est}%</b></div>
          <input type="range" min="1" max="99" value="${est}" id="est" aria-label="Your odds for YES">
          <div class="odds"><div class="odds-row"><span>Crowd</span><span class="track"><i style="width:${Math.round(m.yes * 100)}%"></i></span><b class="mono">${Math.round(m.yes * 100)}%</b></div>
          <div class="odds-row you"><span>You</span><span class="track"><i style="width:${est}%"></i></span><b class="mono">${est}%</b></div></div>
        </div>
        <div class="card"><p class="eyebrow">2 · Side and size</p>
          <div class="side"><button class="yes" data-side="yes" aria-pressed="${side === 'yes'}">YES ${cents(m.yes)}</button><button class="no" data-side="no" aria-pressed="${side === 'no'}">NO ${cents(m.no)}</button></div>
          <div class="amounts">${AMOUNTS.map(a => `<button data-amt="${a}" aria-pressed="${a === amt}" ${a > S.simCash ? 'disabled' : ''}>$${a}</button>`).join('')}</div>
          <div class="kv"><span>Contracts</span><b>${shares}</b></div>
          <div class="kv"><span>Max loss</span><b>${usd(cost)}</b></div>
          <div class="kv"><span>Payout if right</span><b>${usd(shares)}</b></div>
          <p class="small" style="color:${edge > 0 ? 'var(--hit)' : edge < 0 ? 'var(--miss)' : 'var(--ink-muted)'}">${edge > 0 ? `Your odds are ${edge} pts above the price. The math says this side looks cheap.` : edge === 0 ? 'Your odds match the price. No edge here.' : `Your odds are ${-edge} pts below the price. The math says skip or take the other side.`}</p>
        </div>
        ${err ? `<p class="feedback miss" role="alert">${esc(err)}</p>` : ''}
      </div>
      <div class="lesson-foot"><button class="btn" data-buy-now ${busy || cost > S.simCash || !shares ? 'disabled' : ''}>${busy ? 'Placing…' : `Place play-money trade · ${usd(cost)}`}</button>
        <p class="disc">Uses your simulator cash (${usd(S.simCash)} left). The price is locked from the live market when you tap.</p></div>
    </div></div>`;
    layer.querySelector('.sheet-in').scrollTop = scrollY;
    $('#est').oninput = ev => { est = +ev.target.value; draw(); $('#est').focus(); };
  }
  layer.onclick = async ev => {
    if (ev.target.closest('[data-close]')) { layer.innerHTML = ''; layer.onclick = null; return; }
    const s = ev.target.closest('[data-side]'); if (s) { side = s.dataset.side; draw(); return; }
    const a = ev.target.closest('[data-amt]'); if (a) { amt = +a.dataset.amt; draw(); return; }
    if (ev.target.closest('[data-buy-now]') && !busy) {
      busy = true; err = ''; draw();
      const r = await post({ action: 'open', platform: e.platform, market_id: m.id, side, amount: amt, est, title });
      busy = false;
      if (!r.ok) { err = TRADE_ERR[r.error] || 'The trade didn’t go through. Try again.'; return draw(); }
      const t = adoptTrade(r.trade);
      S.simCash -= t.shares * t.price;
      S.trades = [t].concat(S.trades.filter(x => x.id !== t.id));
      S.xp += 10; touchStreak(); save(); checkBadges();
      layer.innerHTML = ''; layer.onclick = null; setSimTab('mine'); location.hash = '#/sim'; route();
    }
  };
  draw();
}

// ── my calls ──
async function loadMine() {
  const r = await post({ action: 'list' });
  const box = () => $('#sim-mine');
  if (!r.ok) { if (box()) box().innerHTML = `<div class="card"><h3>Calls didn’t load</h3><p class="muted small">${esc(TRADE_ERR[r.error] || 'Try again in a minute.')}</p><button class="btn ghost" data-retry>Try again</button></div>`; return; }
  creditClosed(r.trades);
  S.trades = r.trades.map(adoptTrade);
  save(); checkBadges(); paintWallet();
  if (!box()) return;
  const ts = mine(), open = ts.filter(t => t.status === 'open'), closed = ts.filter(t => t.status !== 'open');
  const st = stats(ts);
  box().innerHTML = !ts.length
    ? `<div class="card"><h3>No ${platformName(platform())} calls yet</h3><p class="muted small">Pick a live market, write your own odds and place a play-money trade.</p><button class="btn" data-seg="markets">Browse markets</button></div>`
    : `${st.n ? `<div class="score"><div><b>${st.n}</b><span class="small muted">settled</span></div><div><b>${Math.round(st.hit * 100)}%</b><span class="small muted">right side</span></div><div><b>${st.brier.toFixed(2)}</b><span class="small muted">Brier</span></div></div>` : ''}
      ${open.length ? `<h3>Open · ${open.length}</h3>${open.map(tradeCard).join('')}` : ''}
      ${closed.length ? `<h3>Closed</h3>${closed.map(tradeCard).join('')}` : ''}
      <p class="disc">Open calls settle on their own when the event resolves. You can also sell early at the live price.</p>`;
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

function tradeCard(t) {
  const cost = t.shares * t.price;
  let status, line;
  if (t.status === 'open') {
    const now = t.now != null ? Number(t.now) : null, value = now != null ? t.shares * now : null, pl = value != null ? value - cost : null;
    status = '<span class="chip">Open</span>';
    line = now != null
      ? `<div class="kv small"><span>Now ${cents(now)} · worth ${usd(value)}</span><b style="color:${pl >= 0 ? 'var(--hit)' : 'var(--miss)'}">${pl >= 0 ? '+' : '−'}${usd(Math.abs(pl))}</b></div>
         <button class="btn ghost" data-sell="${t.id}" ${now > 0 ? '' : 'disabled'}>Sell now · ${usd(value)}</button>`
      : '<p class="small muted">Live price unavailable right now.</p>';
  } else if (t.status === 'sold') {
    const got = t.shares * t.exit_price, pl = got - cost;
    status = `<span class="chip ${pl >= 0 ? 'hit' : 'miss'}">Sold ${pl >= 0 ? '+' : '−'}${usd(Math.abs(pl))}</span>`;
    line = `<p class="small muted">Sold at ${cents(t.exit_price)} for ${usd(got)}</p>`;
  } else {
    status = t.status === 'won' ? `<span class="chip hit">Won ${usd(t.shares)}</span>` : `<span class="chip miss">Lost ${usd(cost)}</span>`;
    line = `<p class="small muted">The event ${t.outcome ? 'happened' : 'didn’t happen'}.</p>`;
  }
  return `<div class="card trade"><h3>${esc(t.title)}</h3>
    <div class="kv"><span>${t.side.toUpperCase()} · ${t.shares} @ ${cents(t.price)}</span>${status}</div>
    <div class="kv small muted"><span>Your odds ${t.est}% · crowd ${Math.round(t.price * 100)}%</span><span>${platformName(t.platform)}</span></div>
    ${line}</div>`;
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
  const p = ev.target.closest('[data-plat]');
  if (p) { S.simPlatform = p.dataset.plat; save(); cat = 'hot'; query = ''; categories = []; openEvents.clear(); route(); return; }
  const c = ev.target.closest('[data-cat]');
  if (c) { cat = c.dataset.cat; openEvents.clear(); route(); return; }
  const more = ev.target.closest('[data-more]');
  if (more) { const id = more.dataset.more; openEvents.has(id) ? openEvents.delete(id) : openEvents.add(id); const box = $('#sim-list'); if (box) box.innerHTML = events.map(eventCard).join(''); return; }
  const b = ev.target.closest('[data-buy]');
  if (b) { const [i, j, side] = b.dataset.buy.split(':'); const e = events[+i]; if (e) openTicket(e, e.markets[+j], side); return; }
  if (ev.target.closest('[data-retry]')) { listCache.clear(); loadSim(); return; }
  const s = ev.target.closest('[data-sell]');
  if (s && !s.disabled) {
    s.disabled = true; s.textContent = 'Selling…';
    const r = await post({ action: 'sell', id: Number(s.dataset.sell) });
    if (!r.ok) { s.textContent = TRADE_ERR[r.error] || 'Couldn’t sell. Try again.'; setTimeout(loadMine, 2500); return; }
    loadMine();
  }
});
