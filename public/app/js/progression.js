// Ranks, comparison with other learners, achievements and toasts.
import { stats } from './sim.js';
import { S, fresh, save } from './state.js';
import { $, ICON, esc } from './util.js';

// 10 ranks by XP. Each step needs more XP than the one before (100, 150, 225, 325, 450, 600, 800, 1050, 1400).
// Keep the thresholds in sync with RANK_XP in lib/auth.js (the leaderboard groups players by rank).
export const RANKS = [
  { xp: 0, name: 'Rookie', icon: '🌱', c: '#7C8698' },
  { xp: 100, name: 'Learner', icon: '📘', c: '#3BA3E6' },
  { xp: 250, name: 'Apprentice', icon: '🧭', c: '#14A3A0' },
  { xp: 475, name: 'Analyst', icon: '📊', c: '#4C6FFF' },
  { xp: 800, name: 'Strategist', icon: '♟️', c: '#6B5BD6' },
  { xp: 1250, name: 'Forecaster', icon: '🔭', c: '#8B5CF6' },
  { xp: 1850, name: 'Expert', icon: '🎯', c: '#E0457B' },
  { xp: 2650, name: 'Master', icon: '🏅', c: '#F2643D' },
  { xp: 3700, name: 'Grandmaster', icon: '👑', c: '#E0A33A' },
  { xp: 5100, name: 'Oracle', icon: '🔮', c: '#C98A00' }
];
export function level(xp) {
  let i = RANKS.length - 1; while (xp < RANKS[i].xp) i--;
  const R = RANKS[i], N = RANKS[i + 1];
  return { idx: i, name: R.name, icon: R.icon, c: R.c, min: R.xp, next: N && N.xp, nextName: N && N.name, pct: N ? Math.round((xp - R.xp) / (N.xp - R.xp) * 100) : 100 };
}
export function openRanks() {
  const lv = level(S.xp), layer = $('#layer');
  layer.innerHTML = `<div class="sheet enter" role="dialog" aria-modal="true" aria-label="Ranks"><div class="sheet-in">
    <div class="av-top"><button class="x" data-close aria-label="Close">\u00d7</button><h3>Ranks</h3><span></span></div>
    <div class="rank-now" style="--rc:${lv.c}"><span class="rank-ic">${lv.icon}</span><div><b>${lv.name}</b><span class="small muted">${S.xp} XP${lv.next ? ` \u00b7 ${lv.next - S.xp} XP to ${lv.nextName}` : ' \u00b7 top rank'}</span>
      <div class="lv"><i style="width:${lv.pct}%"></i></div></div></div>
    <p class="small muted">Earn XP from lessons, quizzes, accurate calls and daily gifts. Each rank takes more XP than the last. On the leaderboard you compete with players of your own rank.</p>
    <ol class="ranks">${RANKS.map((r, i) => `<li class="${i < lv.idx ? 'past' : i === lv.idx ? 'now' : 'next'}" style="--rc:${r.c}">
      <span class="rank-ic sm">${r.icon}</span><b>${r.name}</b><span class="mono small">${r.xp.toLocaleString('en-US')} XP</span>
      <span class="small muted">${i === lv.idx ? 'You are here' : i < lv.idx ? '\u2713' : `+${(r.xp - (RANKS[i - 1] ? RANKS[i - 1].xp : 0)).toLocaleString('en-US')} from ${RANKS[i - 1].name}`}</span></li>`).join('')}</ol>
  </div></div>`;
  layer.onclick = e => { if (e.target.closest('[data-close]')) { layer.innerHTML = ''; layer.onclick = null; } };
}
// Demo distribution of lessons completed by other learners, and their average learning time in minutes
export const LEARNERS = [0, 0, 0, 0, 1, 1, 1, 1, 1, 2, 2, 2, 2, 3, 3, 3, 4, 4, 5, 6];
export const AVG_MIN = 12;
export const I = {
  book: ICON.lesson, crown: ICON.review, check: ICON.done,
  flame: '<svg viewBox="0 0 24 24"><path d="M12 2c1 4 6 6 6 12a6 6 0 0 1-12 0c0-3 2-5 2-8 2 1 3 3 3 5 1-2 1-5 1-9z"/></svg>',
  cal: '<svg viewBox="0 0 24 24"><path d="M7 2v2H4v17h16V4h-3V2h-2v2H9V2zM6 9h12v10H6z"/></svg>',
  face: '<svg viewBox="0 0 24 24"><path d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zM8.5 9a1.5 1.5 0 1 1 0 3 1.5 1.5 0 0 1 0-3zm7 0a1.5 1.5 0 1 1 0 3 1.5 1.5 0 0 1 0-3zM7.5 14h9a4.5 4.5 0 0 1-9 0z"/></svg>',
  chart: '<svg viewBox="0 0 24 24"><path d="M3 19h18v2H3zM4 16l5-6 4 3 6-8 1.6 1.2L13.4 16 9.3 13 5.5 17.3z"/></svg>',
  target: '<svg viewBox="0 0 24 24"><path d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zm0 4a6 6 0 1 1 0 12 6 6 0 0 1 0-12zm0 3a3 3 0 1 0 0 6 3 3 0 0 0 0-6z"/></svg>',
  chat: '<svg viewBox="0 0 24 24"><path d="M4 4h16v12H8l-4 4z"/></svg>',
  star: '<svg viewBox="0 0 24 24"><path d="M12 2l3 6.5 7 .8-5.2 4.8 1.5 7L12 17.5 5.7 21l1.5-7L2 9.3l7-.8z"/></svg>'
};
const n = (cur, goal, unit) => ({ left: cur >= goal ? '' : `${goal - cur} ${unit} to go`, ok: cur >= goal, cur: Math.min(cur, goal), goal });
export const BADGES = [
  { id: 'first_lesson', how: 'Open the Learn tab and finish any lesson.', name: 'First step', desc: 'Finished a lesson', icon: I.book, c: '#4C6FFF', prog: () => n(S.done.length, 1, 'lesson') },
  { id: 'avatar', how: 'Tap your picture in Profile, build your avatar and press Done.', name: 'Looking sharp', desc: 'Made your avatar', icon: I.face, c: '#7A4FD6', prog: () => n(+S.avatarSet, 1, 'avatar') },
  { id: 'first_trade', how: 'Open the Simulator, pick a market, set your odds and place a play-money trade.', name: 'First call', desc: 'Placed a play-money trade', icon: I.chart, c: '#0A6E78', prog: () => n(S.trades.length, 1, 'trade') },
  { id: 'day1', how: 'Finish the Day 1 lessons, then pass the Day 1 quiz with at least 8 of 10.', name: 'Day 1 cleared', desc: 'Passed the Day 1 quiz', icon: I.crown, c: '#E0A33A', prog: () => n(+S.done.includes('d1r'), 1, 'check') },
  { id: 'streak3', how: 'Do a lesson or a trade 3 days in a row.', name: 'On fire', desc: '3-day streak', icon: I.flame, c: '#FF7A1A', prog: () => n(S.bestStreak, 3, 'days') },
  { id: 'streak7', how: 'Do a lesson or a trade 7 days in a row.', name: 'Week warrior', desc: '7-day streak', icon: I.flame, c: '#B93C0A', prog: () => n(S.bestStreak, 7, 'days') },
  { id: 'days5', how: 'Learn on 5 different days. They don\u2019t have to be in a row.', name: 'Regular', desc: 'Learned on 5 different days', icon: I.cal, c: '#3B57F0', prog: () => n(S.days.length, 5, 'days') },
  { id: 'lessons5', how: 'Finish 5 lessons in your 28-day plan.', name: 'Bookworm', desc: 'Finished 5 lessons', icon: I.book, c: '#0A6E78', prog: () => n(S.done.length, 5, 'lessons') },
  { id: 'perfect', how: 'Score 10 out of 10 on any daily quiz.', name: 'Sharp mind', desc: '10/10 on a daily quiz', icon: I.star, c: '#E0A33A', prog: () => n(S.perfect, 1, 'perfect quiz') },
  { id: 'settled', how: 'Place a trade in the Simulator and wait for the event to settle.', name: 'Moment of truth', desc: 'First call settled', icon: I.check, c: '#5E6573', prog: () => n(S.trades.filter(t => t.settled).length, 1, 'settled call') },
  { id: 'calibrated', how: 'Get 5 calls settled and keep your Brier score under 0.20. Odds close to reality beat lucky guesses.', name: 'Calibrated', desc: '5 settled calls, Brier under 0.20', icon: I.target, c: '#7A4FD6', prog: () => { const st = stats(); return st.n >= 5 ? { ok: st.brier < .2, left: st.brier < .2 ? '' : 'Brier under 0.20', cur: 5, goal: 5 } : n(st.n, 5, 'settled calls'); } },
  { id: 'curious', how: 'Ask your AI Coach any question.', name: 'Curious', desc: 'Asked your coach a question', icon: I.chat, c: '#4C6FFF', prog: () => n(S.asked, 1, 'question') }
];
export function checkBadges() {
  const fresh = BADGES.filter(b => !S.badges.includes(b.id) && b.prog().ok);
  if (!fresh.length) return;
  fresh.forEach(b => { S.badges.push(b.id); S.badgeAt[b.id] = new Date().toISOString(); }); save();
  fresh.forEach((b, i) => setTimeout(() => toast(b), i * 1800));
}
export function tip(text) {
  const t = document.createElement('div');
  t.className = 'toast'; t.setAttribute('role', 'status');
  t.innerHTML = `<div><b>${esc(text)}</b></div>`;
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 2600);
}
export function toast(b) {
  const t = document.createElement('div');
  t.className = 'toast'; t.setAttribute('role', 'status');
  t.innerHTML = `<span class="medal sm" style="--c:${b.c}">${b.icon}</span><div><b>Badge unlocked</b><span class="small muted">${esc(b.name)}</span></div>`;
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 2600);
}
