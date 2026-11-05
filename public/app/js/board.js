// Leaderboard: the XP league (players of the same rank, topped up with practice players) and the demo traders board
// (real players ranked by profit from closed simulator trades).
import { avaOf } from './avatar.js';
import { api, getToken } from './gate.js';
import { level } from './progression.js';
import { route } from './router.js';
import { S } from './state.js';
import { $, esc } from './util.js';

// Fills the leaderboard after the view renders: real players of my rank from the server, topped up with
// practice players inside the same XP band so a league always has at least 10 rows.
export let boardTab = 'league';

export async function loadBoard() {
  if (boardTab === 'traders') return loadTraders();
  const box = $('#board-rows'); if (!box) return;
  const lv = level(S.xp), hi = lv.next || lv.min + 2000;
  const r = getToken() ? await api('leaderboard', { token: getToken() }) : null;
  let rows = r && r.ok ? r.rows.map(x => ({ name: x.name, xp: x.xp, avatar: x.avatar, me: x.me })) : [];
  if (!rows.some(x => x.me)) rows.push({ name: S.name, xp: S.xp, me: true });
  rows = rows.map(x => x.me ? Object.assign(x, { name: S.name, xp: S.xp }) : x);
  const real = rows.length;
  const names = ['Mark', 'Linda', 'Dave', 'Susan', 'Rick', 'Karen', 'Tom', 'Amy', 'Greg', 'Nina', 'Paul', 'Rosa'];
  let seed = lv.idx * 7 + 3;
  for (let i = 0; rows.length < 10 && i < names.length; i++) {
    seed = (seed * 9301 + 49297) % 233280;
    rows.push({ name: names[i], xp: lv.min + Math.floor(seed / 233280 * (hi - lv.min)), bot: true });
  }
  rows.sort((a, b) => b.xp - a.xp);
  if (!$('#board-rows')) return;
  const top = rows.slice(0, 3);
  box.innerHTML = `<div class="podium">${[top[1], top[0], top[2]].filter(Boolean).map((x, k) => `<div class="${k === 1 ? 'p1' : ''}">${avaOf(x)}<b class="small">${esc(x.name)}</b><span class="mono small">${x.xp} XP</span></div>`).join('')}</div>
    <div class="rows">${rows.map((x, k) => `<div class="lrow${x.me ? ' me' : ''}"><span class="mono muted">${k + 1}</span>${avaOf(x)}<b>${esc(x.name)}${x.bot ? ' <span class="bot">practice</span>' : ''}</b><span class="mono">${x.xp} XP</span></div>`).join('')}</div>
    ${real < 10 ? `<p class="disc">${real === 1 ? 'You’re the first real player in this league.' : `${real} real players in this league.`} Practice players fill the rest until more people join.</p>` : ''}`;
}
export function color(name) { const h = [...name].reduce((a, c) => a + c.charCodeAt(0), 0) * 47 % 360; return `hsl(${h} 55% 48%)`; }

// Demo traders: top 50 players with at least one simulator trade, by realized P&L. Balance = $1,000 start + P&L.
// Your own row always shows under the list with your place. Tapping a trader opens their full history.
const usd = n => '$' + Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const signed = n => `${n > 0 ? '+' : n < 0 ? '−' : ''}${usd(n)}`;
const tone = n => (n > 0 ? 'up' : n < 0 ? 'down' : '');
async function tradeApi(body) {
  try {
    const res = await fetch('/api/trade', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(Object.assign({ token: getToken() }, body)) });
    return await res.json();
  } catch (e) { return null; }
}
function traderRow(x) {
  return `<button class="lrow trader${x.me ? ' me' : ''}" data-trader="${esc(x.pid)}" aria-label="${esc(x.me ? S.name : x.name)}: see trade history">
    <span class="mono muted">${x.pos}</span>${avaOf(Object.assign({}, x, { me: x.me }))}
    <span class="tr-name"><b>${esc(x.me ? S.name : x.name)}</b><span class="small muted">${usd(x.balance)} demo · ${x.trades} trade${x.trades === 1 ? '' : 's'}</span></span>
    <b class="mono ${tone(x.pnl)}">${x.pnl === 0 ? '$0.00' : signed(x.pnl)}</b></button>`;
}
async function loadTraders() {
  const box = $('#board-rows'); if (!box) return;
  const r = await tradeApi({ action: 'leaderboard' });
  if (!$('#board-rows') || boardTab !== 'traders') return;
  if (!r || !r.ok) { box.innerHTML = '<div class="card"><h3>The board didn’t load</h3><p class="muted small">Try again in a minute.</p></div>'; return; }
  box.innerHTML = `${r.rows.length ? `<p class="eyebrow">Top ${Math.min(50, r.rows.length)}</p><div class="rows">${r.rows.map(traderRow).join('')}</div>`
      : '<div class="card"><h3>No traders yet</h3><p class="muted small">Place a demo trade in the Simulator and you’ll be the first on the board.</p></div>'}
    <p class="eyebrow">Your place</p>
    ${r.me ? `<div class="rows">${traderRow(r.me)}</div>`
      : '<div class="card"><p class="muted small">You’re not on the board yet. Place a demo trade in the Simulator to join.</p><a class="btn" href="#/sim">Open the Simulator</a></div>'}`;
}
// Full history of one trader, read-only
async function openTrader(pid) {
  const layer = $('#layer');
  layer.innerHTML = `<div class="sheet enter" role="dialog" aria-modal="true" aria-label="Trader history"><div class="sheet-in">
    <div class="av-top"><button class="x" data-close aria-label="Close">×</button><h3>Trade history</h3><span></span></div>
    <p class="muted small center">Loading…</p></div></div>`;
  layer.onclick = e => { if (e.target.closest('[data-close]')) { layer.innerHTML = ''; layer.onclick = null; } };
  const r = await tradeApi({ action: 'trader', pid });
  const t = r && r.ok && r.trader;
  const body = layer.querySelector('.sheet-in'); if (!body) return;
  if (!t) { body.innerHTML += '<p class="feedback miss">This history didn’t load. Try again in a minute.</p>'; body.querySelector('.muted.center')?.remove(); return; }
  const count = st => t.trades.filter(x => x.status === st).length;
  const day = iso => new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  const card = x => {
    const cost = x.shares * x.price;
    const chip = x.status === 'open' ? '<span class="chip">Open</span>'
      : x.status === 'won' ? `<span class="chip hit">Won ${signed(x.shares - cost)}</span>`
      : x.status === 'lost' ? `<span class="chip miss">Lost ${signed(-cost)}</span>`
      : `<span class="chip ${tone(x.shares * x.exit_price - cost)}">Sold ${signed(x.shares * x.exit_price - cost)}</span>`;
    return `<div class="card trade"><h3>${esc(x.title)}</h3>
      <div class="kv"><span>${x.side.toUpperCase()} · ${x.shares} @ ${Math.round(x.price * 100)}¢</span>${chip}</div>
      <div class="kv small muted"><span>${x.est ? `Odds ${x.est}% · crowd ${Math.round(x.price * 100)}%` : ''}</span><span>${x.platform === 'kalshi' ? 'Kalshi' : 'Polymarket'} · ${day(x.opened_at)}</span></div></div>`;
  };
  body.innerHTML = `<div class="av-top"><button class="x" data-close aria-label="Close">×</button><h3>Trade history</h3><span></span></div>
    <div class="trader-head">${avaOf({ name: t.name, avatar: t.avatar, me: t.me })}<div><h2>${esc(t.me ? S.name : t.name)}</h2>
      <span class="small muted">${usd(t.balance)} <i class="demo-tag">DEMO</i></span></div>
      <b class="mono ${tone(t.pnl)}">${t.pnl === 0 ? '$0.00' : signed(t.pnl)}</b></div>
    <div class="score"><div><b>${count('won')}</b><span class="small muted">won</span></div><div><b>${count('lost')}</b><span class="small muted">lost</span></div><div><b>${count('sold') + count('open')}</b><span class="small muted">sold · open</span></div></div>
    ${t.trades.length ? t.trades.map(card).join('') : '<p class="muted small center">No trades yet.</p>'}
    <p class="disc">Demo money only. P&amp;L counts closed trades.</p>`;
}
document.addEventListener('click', e => {
  const b = e.target.closest('[data-btab]');
  if (b) { boardTab = b.dataset.btab; route(); }
  const tr = e.target.closest('[data-trader]');
  if (tr) openTrader(tr.dataset.trader);
});
