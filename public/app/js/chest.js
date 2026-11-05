// Chest opening: 4 taps, each may upgrade the tier.
import { CHEST } from './course.js';
import { shuffle } from './player.js';
import { tip } from './progression.js';
import { route } from './router.js';
import { S, bump, save } from './state.js';
import { $, MAX_FREEZE } from './util.js';

// 4 taps to open. Each tap has a 40% chance to upgrade the chest one tier. The very first chest is always
// epic (70%) or legendary (30%): the upgrades are spread over random taps so it still feels like luck.
export const TIERS = [
  { id: 'common', name: 'Common', coins: 100 },
  { id: 'rare', name: 'Rare', coins: 250 },
  { id: 'epic', name: 'Epic', coins: 500 },
  { id: 'legendary', name: 'Legendary', coins: 1000, freeze: 1 }
];
export const TAPS = 4, UPGRADE_CHANCE = .4;
// startTier lets a gift start higher (the day-7 gift is an Epic chest that can still turn Legendary)
export function openChest(id, startTier = 0) {
  const first = !startTier && !S.chests.length;
  let tier = startTier, taps = 0, opened = false;
  let plan = null; // first chest: which taps upgrade
  if (first) {
    const target = Math.random() < .3 ? 3 : 2;
    plan = shuffle([0, 1, 2, 3]).slice(0, target);
  }
  const layer = $('#layer');
  function draw(fx) {
    const T = TIERS[tier];
    layer.innerHTML = `<div class="sheet chest-sheet t-${T.id}${layer.firstChild ? '' : ' enter'}" role="dialog" aria-modal="true" aria-label="Open chest"><div class="sheet-in">
      <div class="tiers">${TIERS.map((t, i) => `<span class="${i === tier ? 'on' : i < tier ? 'past' : ''} t-${t.id}">${t.name}</span>`).join('')}</div>
      <div class="chest-stage">
        ${fx === 'up' ? `<p class="up-banner">Upgraded to ${T.name}!</p>` : ''}
        <div class="rays"></div>
        <button class="big-chest${opened ? ' open' : ''}${fx ? ' ' + fx : ''}" data-tapchest aria-label="${opened ? 'Opened' : `Tap to open, ${TAPS - taps} taps left`}">${CHEST}</button>
        ${opened ? `<div class="loot-card"><span class="coin">$</span><b>+${T.coins}</b><span>coins${T.freeze ? ' + 1 streak freeze' : ''}</span></div>` : ''}
      </div>
      <h2 class="center">${opened ? `${T.name} chest!` : `${T.name} chest`}</h2>
      ${opened ? '<button class="btn gold" data-collect>Collect</button>'
        : `<p class="center muted">Tap the chest ${TAPS - taps} more time${TAPS - taps > 1 ? 's' : ''}. Each tap can upgrade it.</p>
           <div class="tapdots">${Array.from({ length: TAPS }, (_, i) => `<i class="${i < taps ? 'on' : ''}"></i>`).join('')}</div>`}
    </div></div>`;
  }
  layer.onclick = e => {
    if (e.target.closest('[data-collect]')) {
      const T = TIERS[tier];
      S.chests.push(id); S.balance += T.coins; S.xp += 20;
      const gotFreeze = T.freeze && S.freezes < MAX_FREEZE;
      if (gotFreeze) S.freezes++;
      save(); bump('#balance'); layer.innerHTML = ''; layer.onclick = null;
      tip(`${T.name} chest: +${T.coins} coins${gotFreeze ? ' and a streak freeze' : ''}`); route();
      return;
    }
    if (!e.target.closest('[data-tapchest]') || opened) return;
    const up = tier < 3 && (plan ? plan.includes(taps) : Math.random() < UPGRADE_CHANCE);
    taps++;
    if (up) tier++;
    if (taps >= TAPS) { opened = true; draw(up ? 'up burst-open' : 'burst-open'); return; }
    draw(up ? 'up' : 'shake');
  };
  draw();
}
