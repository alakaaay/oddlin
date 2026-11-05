// Player state: one object kept in localStorage and synced to the account (debounced). Streak and freezes.
import { tip } from './progression.js';
import { $, AV_DEFAULT, KEY, MAX_FREEZE, SIM_START, START_BALANCE, addDays, dayGap, money, today } from './util.js';

export function fresh() {
  return { name: 'You', balance: START_BALANCE, simCash: SIM_START, xp: 0, streak: 0, lastActive: null, done: [], trades: [], chat: [], topics: ['The Fed', 'Inflation', 'Jobs'], minutes: 10,
    avatar: Object.assign({}, AV_DEFAULT), avatarSet: false, theme: 'system', email: 'you@example.com', days: [], bestStreak: 0, learnSec: 0, perfect: 0, asked: 0, badges: [], badgeAt: {}, stars: {}, chests: [],
    freezes: MAX_FREEZE, frozen: [], gift: { n: 0, last: null }, bonusAt: 0, quizTries: {} };
}
// One shared object for the whole app. Replaced in place (never reassigned) so every module keeps the same reference.
export const S = {};
export function replaceState(next) { for (const k of Object.keys(S)) delete S[k]; Object.assign(S, next); }
try { replaceState(Object.assign(fresh(), JSON.parse(localStorage.getItem(KEY) || '{}'))); } catch (e) { replaceState(fresh()); }
// Saves locally right away and to the server (debounced) when signed in. The server copy is the source of truth.
export let syncTimer = null;
export function save() {
  try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) {}
  paintBar();
  if (!S.uid) return;
  clearTimeout(syncTimer);
  syncTimer = setTimeout(pushProgress, 1200);
}
export function snapshot() { const d = Object.assign({}, S); delete d.user; delete d.uid; return d; }
export function pushProgress() {
  let token = null; try { token = localStorage.getItem('oddlin_token'); } catch (e) {}
  if (!token || !S.uid) return;
  fetch('/api/auth', { method: 'POST', headers: { 'Content-Type': 'application/json' }, keepalive: true,
    body: JSON.stringify({ action: 'progress_save', token, data: snapshot() }) }).catch(() => {});
}
addEventListener('pagehide', () => { if (syncTimer) { clearTimeout(syncTimer); pushProgress(); } });

// Missed days are covered by freezes, one per day, if there are enough; otherwise the streak resets.
// Runs on load, before any new activity is counted.
export function settleStreak() {
  if (!S.lastActive || !S.streak) return;
  const missed = dayGap(S.lastActive, today()) - 1;
  if (missed <= 0) return;
  if (missed <= S.freezes) {
    for (let i = 1; i <= missed; i++) S.frozen.push(addDays(S.lastActive, i));
    S.freezes -= missed; S.lastActive = addDays(today(), -1);
    setTimeout(() => tip(`Streak saved: ${missed} freeze${missed > 1 ? 's' : ''} used`), 400);
  } else S.streak = 0;
  save();
}
// A streak day counts once any lesson or trade happens that day. Every 3 days in a row earns a freeze (max 2).
export function touchStreak() {
  const t = today();
  if (S.lastActive === t) return;
  S.streak = S.lastActive === addDays(t, -1) ? S.streak + 1 : 1;
  S.lastActive = t;
  if (!S.days.includes(t)) S.days.push(t);
  S.bestStreak = Math.max(S.bestStreak, S.streak);
  if (S.streak % 3 === 0 && S.freezes < MAX_FREEZE) { S.freezes++; setTimeout(() => tip(`${S.streak}-day streak: +1 streak freeze`), 300); }
  bump('#streak');
}
export function bump(sel) { const el = $(sel).parentElement; el.classList.remove('bump'); void el.offsetWidth; el.classList.add('bump'); }
export function paintBar() {
  const alive = S.lastActive === today() || S.lastActive === addDays(today(), -1);
  $('#streak').textContent = alive ? S.streak : 0;
  $('#balance').textContent = money(S.balance);
}
