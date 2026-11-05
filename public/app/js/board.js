// Leaderboard: players of the same rank from the server, topped up with practice players.
import { avaOf } from './avatar.js';
import { api, getToken } from './gate.js';
import { level } from './progression.js';
import { S } from './state.js';
import { $, esc } from './util.js';

// Fills the leaderboard after the view renders: real players of my rank from the server, topped up with
// practice players inside the same XP band so a league always has at least 10 rows.
export async function loadBoard() {
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
