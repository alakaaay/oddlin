// Avatar: SVG builder, editor sheet, and the small avatar used in lists.
import { color } from './board.js';
import { checkBadges } from './progression.js';
import { route } from './router.js';
import { S, save } from './state.js';
import { $, AV_DEFAULT, esc } from './util.js';

// Built from SVG parts. Colors are stored as indexes into the palettes below.
export const SKIN = ['#F6D3B3', '#E8B48C', '#C98E62', '#A0673F', '#6E4428'];
export const HAIR = ['#2B2A33', '#5A3A22', '#A0522D', '#E0A33A', '#F2E6C9', '#C9532E'];
export const SHIRT = ['#4C6FFF', '#0A6E78', '#B93C0A', '#5E6573', '#7A4FD6', '#E0A33A'];
export const BG = ['#E8EDFF', '#E1F4F5', '#FDEBDF', '#EDE6FF', '#EEF0F3', '#FFF3C4'];
export const AV_TABS = [
  { id: 'body', label: 'Body', parts: [{ k: 'body', label: 'Body type', opts: ['m', 'f'], names: ['Masculine', 'Feminine'] }, { k: 'skin', label: 'Skin tone', colors: SKIN }] },
  { id: 'hair', label: 'Hair', parts: [{ k: 'hair', label: 'Hairstyle', opts: ['none', 'short', 'quiff', 'curly', 'bun', 'long'] }, { k: 'hairColor', label: 'Hair color', colors: HAIR }] },
  { id: 'face', label: 'Face', parts: [{ k: 'eyes', label: 'Eyes', opts: ['round', 'happy', 'sleepy', 'dots'] }, { k: 'facial', label: 'Facial hair', opts: ['none', 'stubble', 'mustache', 'beard'] }] },
  { id: 'extras', label: 'Extras', parts: [{ k: 'glasses', label: 'Glasses', opts: ['none', 'round', 'square'] }] },
  { id: 'style', label: 'Style', parts: [{ k: 'shirt', label: 'Top', colors: SHIRT }, { k: 'bg', label: 'Background', colors: BG }] }
];
export function avatarSVG(a, cls) {
  a = Object.assign({}, AV_DEFAULT, a);
  if (!['round', 'happy', 'sleepy', 'dots'].includes(a.eyes)) a.eyes = 'round'; // e.g. 'wink' from the illustrated version
  const sk = SKIN[a.skin], hc = HAIR[a.hairColor], sh = SHIRT[a.shirt], f = a.body === 'f', ink = '#2B2A33';
  let o = `<svg class="ava-svg ${cls || ''}" viewBox="0 0 100 100" aria-hidden="true"><rect width="100" height="100" fill="${BG[a.bg]}"/><g class="char">`;
  // Hair behind the head. The feminine head is a narrower oval, so it gets its own fitted shapes.
  const back = f ? {
    long: `<path d="M26 52Q24 19 50 18Q76 19 74 52L77 86Q50 92 23 86Z"/>`,
    short: `<path d="M27 58C24 33 34 20 50 20S76 33 73 58Q72 64 67 63L66 44H34L33 63Q28 64 27 58Z"/>`,
    curly: `<circle cx="30" cy="52" r="6.5"/><circle cx="70" cy="52" r="6.5"/><circle cx="31" cy="60" r="5.5"/><circle cx="69" cy="60" r="5.5"/>`
  }[a.hair] : a.hair === 'long' ? `<path d="M24 50Q22 18 50 17Q78 18 76 50L79 86Q50 92 21 86Z"/>` : '';
  if (back) o += `<g fill="${hc}">${back}</g>`;
  o += f ? `<path d="M22 100Q24 78 50 76Q76 78 78 100V116H22Z" fill="${sh}"/><rect x="44" y="62" width="12" height="16" rx="5" fill="${sk}"/>`
         : `<path d="M16 100Q18 76 50 74Q82 76 84 100V116H16Z" fill="${sh}"/><rect x="42" y="62" width="16" height="16" rx="5" fill="${sk}"/>`;
  o += `<circle cx="28" cy="50" r="6" fill="${sk}"/><circle cx="72" cy="50" r="6" fill="${sk}"/>`;
  o += f ? `<ellipse cx="50" cy="48" rx="21" ry="25" fill="${sk}"/>` : `<rect x="28" y="23" width="44" height="49" rx="20" fill="${sk}"/>`;
  if (f) o += `<circle cx="28" cy="58" r="2" fill="${HAIR[3]}"/><circle cx="72" cy="58" r="2" fill="${HAIR[3]}"/>`;
  if (a.facial === 'stubble') o += `<path d="M30 54Q32 72 50 73Q68 72 70 54Q66 66 50 66Q34 66 30 54Z" fill="${hc}" opacity=".35"/>`;
  if (a.facial === 'beard') o += `<path d="M28 50Q28 77 50 79Q72 77 72 50Q70 60 64 62Q58 57 50 58Q42 57 36 62Q30 60 28 50Z" fill="${hc}"/>`;
  // eyes
  const eye = x => ({
    round: `<circle cx="${x}" cy="48" r="5.5" fill="#fff"/><circle cx="${x + .5}" cy="48.5" r="3" fill="${ink}"/>`,
    happy: `<path d="M${x - 4.5} 49.5Q${x} 43.5 ${x + 4.5} 49.5" fill="none" stroke="${ink}" stroke-width="2.4" stroke-linecap="round"/>`,
    sleepy: `<circle cx="${x}" cy="48" r="5.5" fill="#fff"/><circle cx="${x + .5}" cy="49.5" r="3" fill="${ink}"/><rect x="${x - 6}" y="41.5" width="12" height="6.5" fill="${sk}"/><path d="M${x - 5.5} 48h11" stroke="${ink}" stroke-width="2" stroke-linecap="round"/>`,
    dots: `<circle cx="${x}" cy="48" r="2.8" fill="${ink}"/>`
  }[a.eyes]);
  o += `<g class="eyes">${eye(41)}${eye(59)}`;
  if (f && a.eyes !== 'happy') o += `<path d="M35 45l-2.5-2M65 45l2.5-2" stroke="${ink}" stroke-width="1.6" stroke-linecap="round"/>`;
  o += '</g>';
  o += `<path d="M36 40.5q5-3 10 0M54 40.5q5-3 10 0" fill="none" stroke="${hc}" stroke-width="2.6" stroke-linecap="round"/>`;
  o += `<path d="M50 50q-2.5 5 .5 6.5" fill="none" stroke="rgba(0,0,0,.22)" stroke-width="1.8" stroke-linecap="round"/>`;
  if (a.facial === 'mustache') o += `<path d="M41 60.5Q45 55 50 58Q55 55 59 60.5Q55 59.5 50 61.5Q45 59.5 41 60.5Z" fill="${hc}"/>`;
  o += `<path d="M44 62Q50 67 56 62" fill="none" stroke="#7A3B2E" stroke-width="2.2" stroke-linecap="round"/>`;
  if (a.glasses === 'round') o += `<g fill="none" stroke="${ink}" stroke-width="2.2"><circle cx="41" cy="48" r="7.5"/><circle cx="59" cy="48" r="7.5"/><path d="M48.5 48h3M33.5 47l-5-2M66.5 47l5-2"/></g>`;
  if (a.glasses === 'square') o += `<g fill="none" stroke="${ink}" stroke-width="2.4"><rect x="32.5" y="42" width="16" height="12" rx="3"/><rect x="51.5" y="42" width="16" height="12" rx="3"/><path d="M48.5 47h3M32.5 46l-4-2M67.5 46l4-2"/></g>`;
    const top = f ? {
      short: `<path d="M29 47C27 29 37 21 50 21S73 29 71 47C68 38 62 33 55 32C48 36 39 38 31 38Z"/>`,
      quiff: `<path d="M29 45C27 27 37 19 50 19C63 19 73 27 71 45C69 36 63 31 56 30C49 34 40 37 30 41Z"/><path d="M50 19C56 13 66 15 69 22C64 19 57 19 50 21Z"/>`,
      long: `<path d="M28 52C26 28 36 20 50 20S74 28 72 52C70 39 66 33 59 30C51 36 40 38 31 38Z"/>`,
      bun: `<circle cx="50" cy="14" r="8.5"/><path d="M29 44C28 28 37 21 50 21S72 28 71 44C67 34 60 30 50 30S33 34 29 44Z"/>`,
      curly: [[31, 40, 6.5], [34, 31, 7], [41, 25, 7.5], [50, 22, 8], [59, 25, 7.5], [66, 31, 7], [69, 40, 6.5]].map(([x, y, r]) => `<circle cx="${x}" cy="${y}" r="${r}"/>`).join('')
    }[a.hair] : {
      short: `<path d="M28 44Q27 21 50 20Q73 21 72 44Q66 31 50 30Q34 31 28 44Z"/>`,
      quiff: `<path d="M28 42Q26 21 46 17Q53 9 65 15Q75 22 72 42Q64 29 50 29Q36 30 28 42Z"/>`,
      long: `<path d="M27 52Q25 19 50 18Q75 19 73 52Q71 31 57 29Q45 36 30 37Z"/>`,
      bun: `<circle cx="50" cy="13" r="9"/><path d="M28 44Q27 21 50 20Q73 21 72 44Q66 31 50 30Q34 31 28 44Z"/>`,
      curly: [30, 38, 46, 54, 62, 70].map(x => `<circle cx="${x}" cy="29" r="7.5"/>`).join('') + [36, 46, 56, 64].map(x => `<circle cx="${x}" cy="22" r="7.5"/>`).join('')
    }[a.hair];
    if (top) o += `<g fill="${hc}">${top}</g>`;
  return o + '</g></svg>';
}
export function avaOf(r) { return r.me ? avatarSVG(S.avatar, 'ava') : r.avatar ? avatarSVG(r.avatar, 'ava') : `<span class="ava" style="background:${color(r.name)}">${esc(r.name[0])}</span>`; }

export function openAvatar() {
  const draft = Object.assign({}, AV_DEFAULT, S.avatar);
  let tab = 'body', name = S.name === 'You' ? '' : S.name, react = false;
  const layer = $('#layer');
  function draw() {
    const t = AV_TABS.find(x => x.id === tab);
    layer.innerHTML = `<div class="sheet${layer.firstChild ? '' : ' enter'}" role="dialog" aria-modal="true" aria-label="Edit avatar"><div class="sheet-in">
      <div class="av-top"><button class="x" data-close aria-label="Close">×</button><h3>Edit avatar</h3><button class="link" data-done>Done</button></div>
      <div class="av-stage">${avatarSVG(draft, 'ava-hero' + (react ? ' react' : ''))}</div>
      <input class="name-in" id="avname" maxlength="18" placeholder="Your name" value="${esc(name)}" aria-label="Your name">
      <div class="seg av-tabs" role="tablist">${AV_TABS.map(x => `<button role="tab" data-avtab="${x.id}" aria-pressed="${x.id === tab}">${x.label}</button>`).join('')}</div>
      ${t.parts.map(p => `<div class="av-part"><h3>${p.label}</h3><div class="${p.colors ? 'swatches' : 'av-grid'}">${
        p.colors ? p.colors.map((c, i) => `<button class="sw" data-k="${p.k}" data-v="${i}" aria-pressed="${draft[p.k] === i}" aria-label="${p.label} ${i + 1}"><i style="background:${c}"></i></button>`).join('')
        : p.opts.map((v, i) => `<button class="tile" data-k="${p.k}" data-v="${v}" aria-pressed="${draft[p.k] === v}">${avatarSVG(Object.assign({}, draft, { [p.k]: v }), 'ava-tile')}<span>${p.names ? p.names[i] : v === 'none' ? 'None' : v[0].toUpperCase() + v.slice(1)}</span></button>`).join('')
      }</div></div>`).join('')}
    </div></div>`;
    $('#avname').oninput = e => { name = e.target.value; };
  }
  layer.onclick = e => {
    if (e.target.closest('[data-close]')) { layer.innerHTML = ''; layer.onclick = null; return; }
    const tb = e.target.closest('[data-avtab]'); if (tb) { tab = tb.dataset.avtab; draw(); return; }
    const o = e.target.closest('[data-k]');
    if (o) { const k = o.dataset.k, v = o.dataset.v; draft[k] = typeof AV_DEFAULT[k] === 'number' ? +v : v; react = true; draw(); react = false; return; }
    if (e.target.closest('[data-done]')) {
      S.avatar = draft; S.avatarSet = true; S.name = name.trim() || 'You';
      save(); layer.innerHTML = ''; layer.onclick = null; route(); checkBadges();
    }
  };
  draw();
}
