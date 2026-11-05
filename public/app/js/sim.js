// Simulator (in development): demo markets, trade ticket, settled calls and their stats.
import { checkBadges } from './progression.js';
import { route } from './router.js';
import { S, bump, save, touchStreak } from './state.js';
import { $, esc, money } from './util.js';

export const MARKETS = [
  { id: 'fed-dec', q: 'Will the Fed cut rates in December?', topic: 'The Fed', price: 62, src: 'Kalshi', closes: 'Dec 10' },
  { id: 'cpi-3', q: 'Will November CPI come in above 3.0%?', topic: 'Inflation', price: 38, src: 'Kalshi', closes: 'Dec 11' },
  { id: 'jobs-150', q: 'Will November payrolls beat 150k?', topic: 'Jobs', price: 47, src: 'Polymarket', closes: 'Dec 5' },
  { id: 'gdp-q4', q: 'Will Q4 GDP growth be above 2%?', topic: 'Economy', price: 55, src: 'Polymarket', closes: 'Jan 30' },
  { id: 'shutdown', q: 'Will the government shut down before Feb 1?', topic: 'Politics', price: 21, src: 'Kalshi', closes: 'Feb 1' }
];
export const mkt = id => MARKETS.find(m => m.id === id);
export let simTab = 'markets';
export function setSimTab(v) { simTab = v; }
// Seeded price history so each market's sparkline stays the same between renders
export function history(m) {
  let seed = [...m.id].reduce((a, c) => a + c.charCodeAt(0), 0), p = m.price - 12, out = [];
  for (let k = 0; k < 30; k++) { seed = (seed * 9301 + 49297) % 233280; p += (seed / 233280 - .45) * 4; out.push(Math.max(3, Math.min(97, p))); }
  out[29] = m.price;
  return out;
}
export function spark(m) {
  const h = history(m), w = 300, ht = 64, lo = Math.min(...h) - 2, hi = Math.max(...h) + 2;
  const d = h.map((v, k) => `${k ? 'L' : 'M'}${(k / 29 * w).toFixed(1)},${(ht - (v - lo) / (hi - lo) * ht).toFixed(1)}`).join('');
  return `<svg class="spark" viewBox="0 0 ${w} ${ht}" preserveAspectRatio="none" aria-hidden="true"><path d="${d}"/></svg>`;
}
export function tradeCard(t) {
  const m = mkt(t.mkt), cost = t.shares * t.price / 100;
  const res = t.settled ? (t.won ? `<span class="chip hit">Won ${money(t.shares)}</span>` : `<span class="chip miss">Lost ${money(cost)}</span>`) : `<span class="chip">Open</span>`;
  return `<div class="card"><div class="kv"><h3>${esc(m.q)}</h3></div>
    <div class="kv"><span>${t.side.toUpperCase()} · ${t.shares} @ ${t.price}¢</span>${res}</div>
    <div class="kv small muted"><span>Your odds ${t.est}% · crowd ${t.price}%</span><span>Max loss ${money(cost)}</span></div>
    ${t.settled ? '' : `<button class="btn ghost" data-settle="${t.id}">Settle now (demo)</button>`}</div>`;
}
export function stats() {
  const s = S.trades.filter(t => t.settled);
  if (!s.length) return { n: 0, hit: 0, brier: 0 };
  const brier = s.reduce((a, t) => a + Math.pow(t.est / 100 - (t.outcome ? 1 : 0), 2), 0) / s.length;
  return { n: s.length, hit: s.filter(t => t.won).length / s.length, brier };
}

export function openTicket(m) {
  let side = 'yes', est = m.price, amt = 25;
  const layer = $('#layer');
  function draw() {
    const price = side === 'yes' ? m.price : 100 - m.price;
    const shares = Math.floor(amt / (price / 100));
    const cost = shares * price / 100;
    const myP = side === 'yes' ? est : 100 - est;
    const edge = myP - price;
    layer.innerHTML = `<div class="sheet${layer.firstChild ? '' : ' enter'}" role="dialog" aria-modal="true" aria-label="Trade"><div class="sheet-in">
      <div class="sheet-top"><button class="x" data-close aria-label="Close">×</button><span class="small muted">${esc(m.src)} · closes ${esc(m.closes)}</span></div>
      <div class="lesson-body">
        <h2>${esc(m.q)}</h2>${spark(m)}
        <div class="card"><p class="eyebrow">1 · Your odds first</p>
          <div class="kv"><span>I think YES has a</span><b>${est}%</b></div>
          <input type="range" min="1" max="99" value="${est}" id="est" aria-label="Your odds for YES">
          <div class="odds"><div class="odds-row"><span>Crowd</span><span class="track"><i style="width:${m.price}%"></i></span><b class="mono">${m.price}%</b></div>
          <div class="odds-row you"><span>You</span><span class="track"><i style="width:${est}%"></i></span><b class="mono">${est}%</b></div></div>
        </div>
        <div class="card"><p class="eyebrow">2 · Side and size</p>
          <div class="side"><button class="yes" data-side="yes" aria-pressed="${side === 'yes'}">YES ${m.price}¢</button><button class="no" data-side="no" aria-pressed="${side === 'no'}">NO ${100 - m.price}¢</button></div>
          <div class="amounts">${[10, 25, 50, 100].map(a => `<button data-amt="${a}" aria-pressed="${a === amt}">$${a}</button>`).join('')}</div>
          <div class="kv"><span>Contracts</span><b>${shares}</b></div>
          <div class="kv"><span>Max loss</span><b>${money(cost)}</b></div>
          <div class="kv"><span>Payout if right</span><b>${money(shares)}</b></div>
          <p class="small" style="color:${edge > 0 ? 'var(--hit)' : edge < 0 ? 'var(--miss)' : 'var(--ink-muted)'}">${edge > 0 ? `Your odds are ${edge} pts above the price. The math says this side looks cheap.` : edge === 0 ? 'Your odds match the price. No edge here.' : `Your odds are ${-edge} pts below the price. The math says skip or take the other side.`}</p>
        </div>
      </div>
      <div class="lesson-foot"><button class="btn" data-buy ${cost > S.balance || !shares ? 'disabled' : ''}>Place play-money trade · ${money(cost)}</button><p class="disc">Play money only. No real money is used.</p></div>
    </div></div>`;
    $('#est').oninput = e => { est = +e.target.value; draw(); $('#est').focus(); };
  }
  layer.onclick = e => {
    if (e.target.closest('[data-close]')) { layer.innerHTML = ''; layer.onclick = null; return; }
    const s = e.target.closest('[data-side]'); if (s) { side = s.dataset.side; draw(); return; }
    const a = e.target.closest('[data-amt]'); if (a) { amt = +a.dataset.amt; draw(); return; }
    if (e.target.closest('[data-buy]')) {
      const price = side === 'yes' ? m.price : 100 - m.price;
      const shares = Math.floor(amt / (price / 100));
      S.balance -= shares * price / 100;
      S.trades.unshift({ id: 't' + Date.now(), mkt: m.id, side, est, price, shares, settled: false });
      S.xp += 10; touchStreak(); save(); bump('#balance'); checkBadges();
      layer.innerHTML = ''; layer.onclick = null; setSimTab('mine'); location.hash = '#/sim'; route();
    }
  };
  draw();
}
