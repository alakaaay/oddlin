// Entry point: global click handlers and boot.
import { openAvatar } from './avatar.js';
import { openChest } from './chest.js';
import { coachReply } from './coach.js';
import { ALL } from './course.js';
import { adopt, api, gate, getToken, loadProgress, setToken } from './gate.js';
import { bonusLeft, openGifts, openStreak, paintPerks } from './perks.js';
import { startNode } from './player.js';
import { BADGES, checkBadges, openRanks, tip } from './progression.js';
import { route } from './router.js';
import { applyTheme, openSettings } from './settings.js';
import { openBadge } from './share.js';
import { mkt, openTicket, setSimTab } from './sim.js';
import { S, bump, paintBar, save, settleStreak } from './state.js';
import { $, BONUS_COINS } from './util.js';

document.addEventListener('click', e => {
  const n = e.target.closest('[data-node]');
  if (n) { if (n.classList.contains('locked')) { tip('Finish the level before this one first.'); return; } startNode(ALL.find(x => x.id === n.dataset.node)); return; }
  if (e.target.closest('[data-streak]')) { openStreak(); return; }
  if (e.target.closest('[data-gifts]')) { openGifts(); return; }
  if (e.target.closest('[data-bonus]')) {
    if (bonusLeft()) { tip('Next bonus is on its way. Check the timer.'); return; }
    S.bonusAt = Date.now(); S.balance += BONUS_COINS; save(); bump('#balance'); tip(`+${BONUS_COINS} coins. Next bonus in 3 hours`); paintPerks(); return;
  }
  if (e.target.closest('[data-soon]')) { tip('Day 3 opens tomorrow. Come back to keep your streak going.'); return; }
  const ch = e.target.closest('[data-chest]');
  if (ch) {
    const id = ch.dataset.chest;
    if (S.chests.includes(id)) { tip('Already opened. See you at the next chest.'); return; }
    if (ch.getAttribute('aria-disabled')) { tip('Finish every level of this day to open the chest.'); return; }
    openChest(id);
    return;
  }
  const sg = e.target.closest('[data-seg]'); if (sg) { setSimTab(sg.dataset.seg); route(); return; }
  const mk = e.target.closest('[data-mkt]'); if (mk) { openTicket(mkt(mk.dataset.mkt)); return; }
  const se = e.target.closest('[data-settle]');
  if (se) {
    const t = S.trades.find(x => x.id === se.dataset.settle), m = mkt(t.mkt);
    t.outcome = Math.random() * 100 < m.price; // demo: the event happens with the crowd's probability
    t.won = (t.side === 'yes') === t.outcome; t.settled = true;
    if (t.won) { S.balance += t.shares; bump('#balance'); }
    S.xp += Math.max(0, Math.round(20 * (1 - Math.pow(t.est / 100 - (t.outcome ? 1 : 0), 2) * 4)));
    save(); checkBadges(); route(); return;
  }
  const ak = e.target.closest('[data-ask]'); if (ak) { ask(ak.dataset.ask); return; }
  if (e.target.closest('[data-avatar]')) { openAvatar(); return; }
  if (e.target.closest('[data-ranks]')) { openRanks(); return; }
  const bd = e.target.closest('[data-badge]'); if (bd) { openBadge(BADGES.find(b => b.id === bd.dataset.badge)); return; }
  if (e.target.closest('[data-settings]')) { openSettings(); return; }
});
document.addEventListener('submit', e => {
  if (e.target.id === 'askf') { e.preventDefault(); const v = $('#askq').value.trim(); if (v) ask(v); }
});
function ask(q) {
  if (!S.chat.length) S.chat.push({ me: false, text: 'Hi! I’m your coach. I look at your predictions and show where your odds drift from reality.' });
  S.chat.push({ me: true, text: q }, { me: false, text: coachReply(q) });
  S.chat = S.chat.slice(-20); S.asked++; save(); checkBadges(); route();
}

applyTheme();
settleStreak();
paintBar();
(async () => {
  const t = getToken();
  const r = t ? await api('me', { token: t }) : null;
  if (r && r.ok) { adopt(r.user); if (!r.user.onboarded) return gate('ob1'); await loadProgress(); route(); checkBadges(); }
  else { if (r && r.error === 'signed_out') setToken(null); gate('welcome'); }
})();
