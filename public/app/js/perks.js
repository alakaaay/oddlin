// Streak calendar, 7-day gifts and the 3-hour coin bonus.
import { TIERS, openChest } from './chest.js';
import { CHEST } from './course.js';
import { tip } from './progression.js';
import { route } from './router.js';
import { S, bump, save } from './state.js';
import { $, BONUS_EVERY, GIFTS, MAX_FREEZE, addDays, giftLabel, iso, today } from './util.js';

export const SNOW = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M11 2h2v4.6l2.5-2.5 1.4 1.4L13 9.4V11h1.6l3.9-3.9 1.4 1.4L17.4 11H22v2h-4.6l2.5 2.5-1.4 1.4-3.9-3.9H13v1.6l3.9 3.9-1.4 1.4-2.5-2.5V22h-2v-4.6l-2.5 2.5-1.4-1.4 3.9-3.9V13H9.4l-3.9 3.9-1.4-1.4L6.6 13H2v-2h4.6L4.1 8.5l1.4-1.4L9.4 11H11V9.4L7.1 5.5l1.4-1.4L11 6.6z"/></svg>';
export const GIFT = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 7h-2.2A3 3 0 0 0 12 4.4 3 3 0 0 0 6.2 7H4a1 1 0 0 0-1 1v3h18V8a1 1 0 0 0-1-1zM9 7a1 1 0 1 1 1-1v1zm5 0V6a1 1 0 1 1 1 1zM4 13v6a1 1 0 0 0 1 1h6v-7zm9 7h6a1 1 0 0 0 1-1v-6h-7z"/></svg>';
export function openStreak() {
  let m = new Date(); m.setDate(1);
  const layer = $('#layer');
  function draw() {
    const y = m.getFullYear(), mo = m.getMonth(), first = (new Date(y, mo, 1).getDay() + 6) % 7, len = new Date(y, mo + 1, 0).getDate();
    const cells = [];
    for (let i = 0; i < first; i++) cells.push('<span></span>');
    for (let d = 1; d <= len; d++) {
      const ds = iso(new Date(y, mo, d)), fire = S.days.includes(ds), ice = S.frozen.includes(ds);
      cells.push(`<span class="cal-d${fire ? ' fire' : ice ? ' ice' : ''}${ds === today() ? ' today' : ''}"><b>${d}</b></span>`);
    }
    const alive = $('#streak').textContent;
    layer.innerHTML = `<div class="sheet${layer.firstChild ? '' : ' enter'}" role="dialog" aria-modal="true" aria-label="Streak"><div class="sheet-in">
      <div class="av-top"><button class="x" data-close aria-label="Close">×</button><h3>Streak</h3><span></span></div>
      <div class="streak-hero"><span class="flame huge" aria-hidden="true"></span><div><b>${alive}</b><span>day streak</span></div></div>
      <div class="card freeze-card"><div class="kv"><h3>Streak freezes</h3><span class="freezes">${Array.from({ length: MAX_FREEZE }, (_, i) => `<i class="${i < S.freezes ? 'on' : ''}">${SNOW}</i>`).join('')}</span></div>
        <p class="small muted">A freeze covers a day you miss, so your streak stays alive. You get +1 for every 3 days in a row. You can hold ${MAX_FREEZE}.</p></div>
      <div class="card">
        <div class="cal-h"><button class="x" data-m="-1" aria-label="Previous month">‹</button><h3>${m.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}</h3><button class="x" data-m="1" aria-label="Next month">›</button></div>
        <div class="cal">${['M', 'T', 'W', 'T', 'F', 'S', 'S'].map(d => `<span class="cal-w">${d}</span>`).join('')}${cells.join('')}</div>
        <div class="cal-key small muted"><span><i class="dot fire"></i> Streak day</span><span><i class="dot ice"></i> Freeze used</span></div>
      </div>
    </div></div>`;
  }
  layer.onclick = e => {
    if (e.target.closest('[data-close]')) { layer.innerHTML = ''; layer.onclick = null; return; }
    const b = e.target.closest('[data-m]'); if (b) { m.setMonth(m.getMonth() + +b.dataset.m); draw(); }
  };
  draw();
}
// Daily gifts: one per calendar day, 7-day ladder. Missing a day starts the ladder over.
export function giftState() {
  if (S.gift.last && S.gift.last !== today() && S.gift.last !== addDays(today(), -1)) S.gift = { n: 0, last: null };
  if (S.gift.n >= 7 && S.gift.last !== today()) S.gift.n = 0;
  return { ready: S.gift.last !== today(), next: S.gift.n };
}
export function openGifts() {
  const layer = $('#layer');
  function draw() {
    const g = giftState();
    layer.innerHTML = `<div class="sheet${layer.firstChild ? '' : ' enter'}" role="dialog" aria-modal="true" aria-label="Daily gifts"><div class="sheet-in">
      <div class="av-top"><button class="x" data-close aria-label="Close">×</button><h3>Daily gifts</h3><span></span></div>
      <p class="muted small">Come back every day. The longer you keep going, the bigger the gift. Miss a day and it starts over.</p>
      <div class="gifts">${GIFTS.map((x, i) => {
        const got = i < g.next, now = i === g.next && g.ready, chest = x.chest != null;
        return `<div class="gift${got ? ' got' : ''}${now ? ' now' : ''}${i === 6 ? ' big' : ''}${chest ? ` chest-gift t-${TIERS[x.chest].id}` : ''}"><span class="small">Day ${i + 1}</span>
          <span class="gift-i">${got ? '✓' : chest ? `<span class="mini-chest">${CHEST}</span>` : '<span class="coin">$</span>'}</span>
          <b>${chest ? (x.chest === 2 ? 'Epic' : 'Chest') : x.c}</b>${x.xp ? `<span class="small">+${x.xp} XP</span>` : ''}</div>`;
      }).join('')}</div>
      <button class="btn gold" data-claim ${g.ready ? '' : 'disabled'}>${g.ready ? `Claim day ${g.next + 1}: ${giftLabel(GIFTS[g.next])}` : 'Come back tomorrow'}</button>
    </div></div>`;
  }
  layer.onclick = e => {
    if (e.target.closest('[data-close]')) { layer.innerHTML = ''; layer.onclick = null; route(); return; }
    if (e.target.closest('[data-claim]')) {
      const g = giftState(); if (!g.ready) return;
      const x = GIFTS[g.next];
      let extra = '';
      if (x.xp) { S.xp += x.xp; extra = ` + ${x.xp} XP`; }
      S.gift = { n: g.next + 1, last: today() };
      if (x.chest != null) { save(); layer.innerHTML = ''; layer.onclick = null; if (x.xp) tip(`Day 7: +${x.xp} XP`); openChest('gift-' + today(), x.chest); return; }
      S.balance += x.c;
      save(); bump('#balance'); tip(`+${x.c} coins${extra}`); draw();
    }
  };
  draw();
}
export function bonusLeft() { return Math.max(0, S.bonusAt + BONUS_EVERY - Date.now()); }
export function paintPerks() {
  const p = $('#perks'); if (!p || p.hidden) return;
  const left = bonusLeft(), g = giftState();
  const hms = ms => { const t = Math.ceil(ms / 1000); return `${Math.floor(t / 3600)}:${String(Math.floor(t / 60) % 60).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`; };
  p.querySelector('[data-bonus] .perk-l').textContent = left ? hms(left) : 'Claim';
  p.querySelector('[data-bonus]').classList.toggle('ready', !left);
  p.querySelector('[data-gifts] .perk-l').textContent = g.ready ? `Day ${g.next + 1}` : 'Tomorrow';
  p.querySelector('[data-gifts]').classList.toggle('ready', g.ready);
}
setInterval(paintPerks, 1000);
