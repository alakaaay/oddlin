// Achievement detail sheet and the story-sized share image.
import { avatarSVG } from './avatar.js';
import { color } from './board.js';
import { level } from './progression.js';
import { S } from './state.js';
import { $, esc, iso, money } from './util.js';

export function fmtDate(iso) { return iso ? 'Earned ' + new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : 'Earned'; }
export function openBadge(b) {
  const p = Object.assign({ got: S.badges.includes(b.id) }, b.prog());
  const layer = $('#layer');
  const pct = Math.round((p.cur || 0) / (p.goal || 1) * 100);
  layer.innerHTML = `<div class="sheet enter" role="dialog" aria-modal="true" aria-label="${esc(b.name)}"><div class="sheet-in">
    <div class="av-top"><button class="x" data-close aria-label="Close">×</button><span></span><span></span></div>
    <div class="badge-hero${p.got ? '' : ' off'}"><span class="medal xl" style="--c:${b.c}">${b.icon}</span>
      <h2>${esc(b.name)}</h2>
      <p class="chip xp-chip">+${b.xp} XP</p>
      ${p.got ? `<p class="chip hit">${esc(fmtDate(S.badgeAt[b.id]))}</p><p class="muted">${esc(b.desc)}</p>`
        : `<p class="chip">Locked</p>`}
    </div>
    ${p.got ? `<div class="card"><h3>Share it</h3><p class="muted small">Get a ready-made image for Instagram stories or any feed.</p>
        <div class="share-prev" id="sharePrev"></div>
        <button class="btn" data-dl>Download image</button>
        ${navigator.canShare ? '<button class="btn ghost" data-share>Share…</button>' : ''}</div>`
      : `<div class="card"><h3>How to get it</h3><p>${esc(b.how)}</p>
        ${p.goal > 1 ? `<div class="kv small"><span>Progress</span><b>${p.cur}/${p.goal}</b></div><div class="lv thick"><i style="width:${pct}%"></i></div>` : ''}
        ${p.left ? `<p class="small muted">${esc(p.left)}</p>` : ''}</div>`}
  </div></div>`;
  if (p.got) $('#sharePrev').innerHTML = shareSVG(b);
  layer.onclick = e => {
    if (e.target.closest('[data-close]')) { layer.innerHTML = ''; layer.onclick = null; return; }
    if (e.target.closest('[data-dl]')) { sharePNG(b).then(blob => { const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `oddlin-${b.id}.png`; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 2000); }); return; }
    if (e.target.closest('[data-share]')) {
      sharePNG(b).then(blob => {
        const file = new File([blob], `oddlin-${b.id}.png`, { type: 'image/png' });
        const data = { files: [file], title: b.name, text: `I just earned “${b.name}” on Oddlin while learning prediction markets.` };
        if (navigator.canShare(data)) navigator.share(data).catch(() => {});
      });
    }
  };
}
// Story-sized card (1080x1920) drawn as SVG, then rasterized to PNG on a canvas
export function shareSVG(b) {
  const W = 1080, H = 1920;
  const icon = (b.icon.match(/<path[^>]*\/>/g) || []).join('');
  const ava = avatarSVG(S.avatar).replace(/<svg class="[^"]*"/, '<svg x="430" y="1290" width="220" height="220"');
  const date = fmtDate(S.badgeAt[b.id]).replace('Earned ', '');
  const font = 'Avenir Next, Helvetica Neue, Helvetica, Arial, sans-serif';
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}">
    <defs>
      <linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#4C6FFF"/><stop offset="1" stop-color="#1B2A8C"/></linearGradient>
      <radialGradient id="m" cx="35%" cy="30%" r="75%"><stop offset="0" stop-color="#fff" stop-opacity=".55"/><stop offset=".6" stop-color="#fff" stop-opacity="0"/></radialGradient>
      <radialGradient id="glow" cx="50%" cy="50%" r="50%"><stop offset="0" stop-color="${b.c}" stop-opacity=".7"/><stop offset="1" stop-color="${b.c}" stop-opacity="0"/></radialGradient>
      <clipPath id="ac"><circle cx="540" cy="1400" r="110"/></clipPath>
    </defs>
    <rect width="${W}" height="${H}" fill="url(#g)"/>
    <g fill="#fff" opacity=".08">${[[120, 260, 90], [960, 420, 140], [180, 1650, 120], [930, 1780, 70], [880, 1060, 40]].map(([x, y, r]) => `<circle cx="${x}" cy="${y}" r="${r}"/>`).join('')}</g>
    <g stroke="#fff" stroke-width="6" stroke-linecap="round" opacity=".55">${Array.from({ length: 12 }, (_, i) => { const a = i * Math.PI / 6, r1 = 330, r2 = 380; return `<line x1="${540 + Math.cos(a) * r1}" y1="${720 + Math.sin(a) * r1}" x2="${540 + Math.cos(a) * r2}" y2="${720 + Math.sin(a) * r2}"/>`; }).join('')}</g>
    <circle cx="540" cy="720" r="420" fill="url(#glow)"/>
    <text x="540" y="230" text-anchor="middle" font-family="${font}" font-size="44" font-weight="700" letter-spacing="10" fill="#fff" opacity=".85">BADGE UNLOCKED</text>
    <circle cx="540" cy="720" r="270" fill="${b.c}" stroke="#fff" stroke-width="18"/>
    <circle cx="540" cy="720" r="236" fill="none" stroke="#000" stroke-opacity=".15" stroke-width="14"/>
    <circle cx="540" cy="720" r="270" fill="url(#m)"/>
    <g fill="#fff" transform="translate(396 576) scale(12)">${icon}</g>
    <text x="540" y="1125" text-anchor="middle" font-family="${font}" font-size="96" font-weight="700" fill="#fff">${esc(b.name)}</text>
    <text x="540" y="1200" text-anchor="middle" font-family="${font}" font-size="44" fill="#fff" opacity=".8">${esc(b.desc)}</text>
    <circle cx="540" cy="1400" r="122" fill="#fff"/>
    <g clip-path="url(#ac)">${ava}</g>
    <text x="540" y="1590" text-anchor="middle" font-family="${font}" font-size="52" font-weight="700" fill="#fff">${esc(S.name === 'You' ? 'Oddlin learner' : S.name)}</text>
    <text x="540" y="1650" text-anchor="middle" font-family="${font}" font-size="38" fill="#fff" opacity=".75">${esc(date)} · ${esc(level(S.xp).name)}</text>
    <text x="540" y="1810" text-anchor="middle" font-family="${font}" font-size="46" font-weight="700" fill="#fff">oddlin</text>
    <text x="540" y="1860" text-anchor="middle" font-family="${font}" font-size="30" fill="#fff" opacity=".7">Learning prediction markets with play money</text>
  </svg>`;
}
export function sharePNG(b) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const c = document.createElement('canvas'); c.width = 1080; c.height = 1920;
      c.getContext('2d').drawImage(img, 0, 0);
      c.toBlob(blob => blob ? resolve(blob) : reject(new Error('png')), 'image/png');
    };
    img.onerror = reject;
    img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(shareSVG(b));
  });
}
