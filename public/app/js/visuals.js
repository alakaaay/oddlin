// Slide illustrations: small animated SVG scenes (320x160) built from parametric pieces. Animations live in app.css.
import { $ } from './util.js';

// Small animated SVG scenes (320x160) built from a few parametric pieces. Animations are CSS classes in app.css.
export const VW = 320, VH = 160;
export const vsvg = inner => `<svg viewBox="0 0 ${VW} ${VH}" aria-hidden="true">${inner}</svg>`;
export const dl = s => `style="--d:${s}s"`;
export const pill = (x, y, w, h, fill, label, fg, cls = 'pop', d = 0) => `<g class="${cls}" ${dl(d)}><rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${h / 2}" fill="${fill}"/><text x="${x + w / 2}" y="${y + h / 2}" class="vt" fill="${fg}" font-size="${Math.round(h * .45)}">${label}</text></g>`;
export const emo = (e, x, y, size, cls = 'pop', d = 0) => `<text x="${x}" y="${y}" class="ve ${cls}" ${dl(d)} font-size="${size}">${e}</text>`;
export const V = {
  q(l1, l2) {
    return vsvg(`<g class="pop"><rect x="40" y="18" width="240" height="124" rx="18" fill="var(--surface)" stroke="var(--line)" stroke-width="2"/>
      <text x="160" y="50" class="vt" font-size="17">${l1}</text><text x="160" y="72" class="vt" font-size="17">${l2}</text></g>
      ${pill(70, 94, 80, 32, 'var(--hit)', 'YES', '#fff', 'pop', .35)}${pill(170, 94, 80, 32, 'var(--miss)', 'NO', '#fff', 'pop', .5)}
      ${emo('🔮', 272, 26, 30, 'float', .2)}`);
  },
  split(a, b) {
    return vsvg(`<g class="tap-a">${pill(42, 50, 110, 48, 'var(--hit)', a, '#fff', 'pop', 0)}</g><g class="tap-b">${pill(168, 50, 110, 48, 'var(--miss)', b, '#fff', 'pop', .15)}</g>
      <g class="finger"><text x="97" y="118" class="ve" font-size="34">👆</text></g>`);
  },
  dots(n, k, label, marks) {
    const cols = Math.min(n, 10), rows = Math.ceil(n / cols), r = n > 20 ? 7 : 11, gap = n > 20 ? 20 : 27;
    const x0 = VW / 2 - (cols - 1) * gap / 2, y0 = (label ? 66 : 80) - (rows - 1) * gap / 2;
    let o = '';
    for (let i = 0; i < n; i++) {
      const x = x0 + (i % cols) * gap, y = y0 + Math.floor(i / cols) * gap, on = i < k;
      o += `<g class="pop" ${dl((i * (n > 20 ? .02 : .07)).toFixed(2))}><circle cx="${x}" cy="${y}" r="${r}" fill="${on ? (marks ? 'var(--hit)' : 'var(--signal)') : marks ? 'var(--miss)' : 'var(--line-strong)'}"/>
        ${marks ? `<text x="${x}" y="${y + 1}" class="vt" fill="#fff" font-size="12">${on ? '✓' : '✕'}</text>` : ''}</g>`;
    }
    return vsvg(o + (label ? `<text x="160" y="146" class="vt muted-t pop" ${dl(.8)} font-size="14">${label}</text>` : ''));
  },
  bars(list, unit = '') {
    const w = 46, gap = 26, x0 = VW / 2 - (list.length * w + (list.length - 1) * gap) / 2;
    return vsvg(list.map((b, i) => {
      const h = Math.max(6, b.v * 1.05), x = x0 + i * (w + gap);
      return `<rect class="grow-y" ${dl(i * .15)} x="${x}" y="${128 - h}" width="${w}" height="${h}" rx="8" fill="${b.c || 'var(--signal)'}"/>
        <text x="${x + w / 2}" y="${120 - h}" class="vt pop" ${dl(.4 + i * .15)} font-size="14">${b.top || b.v + unit}</text>
        <text x="${x + w / 2}" y="146" class="vt muted-t" font-size="12">${b.l}</text>`;
    }).join(''));
  },
  winloss() {
    let o = '';
    for (let i = 0; i < 9; i++) o += `<rect class="grow-y" ${dl(i * .06)} x="${30 + i * 24}" y="70" width="16" height="10" rx="3" fill="var(--hit)"/>`;
    o += `<rect class="grow-down" ${dl(.7)} x="254" y="80" width="30" height="62" rx="5" fill="var(--miss)"/>
      <line x1="20" y1="80" x2="300" y2="80" stroke="var(--line-strong)" stroke-width="2"/>
      <text x="130" y="54" class="vt pop" ${dl(.6)} font-size="14" fill="var(--hit)">9 wins × +10¢</text>
      <text x="269" y="62" class="vt pop" ${dl(1)} font-size="14" fill="var(--miss)">−90¢</text>`;
    return vsvg(o);
  },
  chart(kind, flag) {
    const pts = { up: 'M20 120 L70 112 L110 116 L150 96 L190 88 L230 60 L270 52 L300 40', down: 'M20 50 L70 58 L110 54 L150 76 L190 84 L230 104 L270 110 L300 122', wave: 'M20 90 L60 70 L100 96 L140 56 L180 84 L220 44 L260 76 L300 50' }[kind];
    const fx = kind === 'wave' ? 220 : 230, fy = { up: 60, down: 104, wave: 44 }[kind];
    return vsvg(`<line x1="20" y1="140" x2="300" y2="140" stroke="var(--line)" stroke-width="2"/>
      <path class="draw" d="${pts}" fill="none" stroke="var(--signal)" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>
      ${flag ? `<circle class="pop" ${dl(1.1)} cx="${fx}" cy="${fy}" r="7" fill="${kind === 'down' ? 'var(--miss)' : 'var(--hit)'}"/>${pill(fx - 44, fy - 44, 88, 28, kind === 'down' ? 'var(--miss)' : 'var(--hit)', flag, '#fff', 'pop', 1.25)}` : ''}`);
  },
  chips(tokens, tone) {
    const fs = 17, ws = tokens.map(t => Math.max(30, String(t).length * 10 + 18)), gap = 6, total = ws.reduce((a, b) => a + b, 0) + gap * (tokens.length - 1);
    const sc = Math.min(1, 300 / total);
    let x = (VW - total * sc) / 2;
    const o = tokens.map((t, i) => {
      const w = ws[i] * sc, last = i === tokens.length - 1 && tone, op = /^[×−=+]$/.test(t);
      const g = op ? `<text class="vt pop" ${dl(i * .18)} x="${x + w / 2}" y="80" font-size="${fs * sc + 4}">${t}</text>`
        : pill(x, 62, w, 36, last ? `var(--${tone})` : 'var(--surface)', t, last ? '#fff' : 'var(--ink)', 'pop', i * .18).replace('<rect', `<rect stroke="${last ? 'none' : 'var(--line)'}" stroke-width="2"`);
      x += w + gap * sc; return g;
    }).join('');
    return vsvg(o);
  },
  gauge(v, ghost) {
    const a = -90 + v * 1.8;
    const mk = val => { const r = (-180 + val * 1.8) * Math.PI / 180; return [160 + Math.cos(r) * 92, 132 + Math.sin(r) * 92]; };
    const [gx, gy] = ghost != null ? mk(ghost) : [0, 0];
    return vsvg(`<path d="M60 132 A100 100 0 0 1 260 132" fill="none" stroke="var(--line)" stroke-width="16" stroke-linecap="round"/>
      <path class="gdraw" pathLength="100" d="M60 132 A100 100 0 0 1 260 132" fill="none" stroke="var(--signal)" stroke-width="16" stroke-linecap="round" style="--v:${v}"/>
      <g class="needle${ghost == null && v === 50 ? ' wobble' : ''}" style="--a:${a}deg"><line x1="160" y1="132" x2="160" y2="52" stroke="var(--ink)" stroke-width="4" stroke-linecap="round"/></g>
      <circle cx="160" cy="132" r="8" fill="var(--ink)"/>
      <text x="160" y="104" class="vt pop" ${dl(.9)} font-size="22">${v}%</text>
      ${ghost != null ? `<g class="pop" ${dl(1.2)}><circle cx="${gx}" cy="${gy}" r="9" fill="var(--hit)"/><text x="${gx - 4}" y="${gy - 18}" class="vt" font-size="12" fill="var(--hit)">reality ${ghost}%</text></g>` : ''}`);
  },
  coin(from, to, sub, muted) {
    return vsvg(`<g class="pop"><rect x="34" y="46" width="96" height="64" rx="12" fill="var(--surface)" stroke="var(--line)" stroke-width="2"/><text x="82" y="78" class="vt" font-size="18">${from}</text></g>
      <path class="draw" ${dl(.3)} d="M142 78 H190" stroke="var(--line-strong)" stroke-width="4" stroke-linecap="round" fill="none"/><path class="pop" ${dl(.6)} d="M184 68 L196 78 L184 88" stroke="var(--line-strong)" stroke-width="4" fill="none" stroke-linecap="round"/>
      <g class="pop coinspin" ${dl(.7)}><circle cx="244" cy="78" r="38" fill="${muted ? 'var(--line-strong)' : 'var(--gold)'}" stroke="${muted ? 'var(--line)' : 'var(--gold-d)'}" stroke-width="5"/><text x="244" y="80" class="vt" font-size="24" fill="${muted ? 'var(--surface)' : '#5A3D00'}">${to}</text></g>
      ${sub ? `<text x="160" y="146" class="vt muted-t pop" ${dl(1)} font-size="14">${sub}</text>` : ''}`);
  },
  ticket(rows) {
    return vsvg(`<g class="pop"><rect x="60" y="16" width="200" height="128" rx="16" fill="var(--surface)" stroke="var(--line)" stroke-width="2"/>
      <text x="80" y="40" class="vt-l muted-t" font-size="12">TRADE TICKET · PLAY MONEY</text></g>
      ${rows.map((r, i) => `<g class="pop${i === rows.length - 1 ? ' pulse' : ''}" ${dl(.25 + i * .2)}><rect x="72" y="${54 + i * 40}" width="176" height="32" rx="8" fill="${i === rows.length - 1 ? 'var(--signal-soft)' : 'transparent'}"/>
        <text x="84" y="${71 + i * 40}" class="vt-l" font-size="14">${r[0]}</text><text x="236" y="${71 + i * 40}" class="vt-r" font-size="15">${r[1]}</text></g>`).join('')}`);
  },
  stack(parts, total = '$1') {
    let x = 30;
    const o = parts.map((p, i) => { const w = p.v * 2.2; const g = `<rect class="grow-x" ${dl(i * .35)} x="${x}" y="58" width="${w}" height="40" rx="${i === 0 ? 10 : 0}" fill="${p.c || 'var(--signal)'}"/>
      <text x="${x + w / 2}" y="120" class="vt pop" ${dl(.4 + i * .35)} font-size="13">${p.l}</text>`; x += w; return g; }).join('');
    return vsvg(o + `<text x="${x + 22}" y="79" class="vt pop" ${dl(1)} font-size="18">= ${total}</text>`);
  },
  slider(from, to, label) {
    return vsvg(`<line x1="50" y1="92" x2="270" y2="92" stroke="var(--line)" stroke-width="10" stroke-linecap="round"/>
      <line class="grow-x" x1="50" y1="92" x2="200" y2="92" stroke="var(--signal)" stroke-width="10" stroke-linecap="round"/>
      <g class="knob"><circle cx="200" cy="92" r="16" fill="var(--surface)" stroke="var(--signal)" stroke-width="5"/></g>
      <text x="50" y="126" class="vt muted-t" font-size="13">${from}</text><text x="270" y="126" class="vt muted-t" font-size="13">${to}</text>
      ${pill(140, 34, 120, 30, 'var(--signal)', label, '#fff', 'pop', .8)}`);
  },
  emoji(main, extras = [], anim = 'float') {
    const spots = [[70, 44], [252, 50], [254, 122], [66, 122]];
    return vsvg(`<circle cx="160" cy="82" r="58" fill="var(--signal-soft)" class="pop"/>${emo(main, 160, 84, 66, anim, .1)}
      ${extras.map((e, i) => /\p{Extended_Pictographic}/u.test(e) ? emo(e, spots[i][0], spots[i][1], 32, 'pop bob', .4 + i * .2)
        : pill(spots[i][0] - 38, spots[i][1] - 15, 76, 30, 'var(--surface)', e, 'var(--ink)', 'pop bob', .4 + i * .2).replace('<rect', '<rect stroke="var(--line)" stroke-width="2"')).join('')}`);
  },
  exchange() {
    return vsvg(`<circle cx="62" cy="80" r="34" fill="var(--signal-soft)" class="pop"/>${emo('🙂', 62, 82, 40, 'pop')}
      <circle cx="258" cy="80" r="34" fill="var(--hit-soft)" class="pop" ${dl(.15)}/>${emo('🧐', 258, 82, 40, 'pop', .15)}
      <g class="slide-r">${pill(108, 46, 56, 24, 'var(--hit)', 'YES', '#fff', '')}</g><g class="slide-l">${pill(156, 92, 56, 24, 'var(--gold)', '62¢', '#5A3D00', '')}</g>
      <text x="160" y="146" class="vt muted-t pop" ${dl(.6)} font-size="13">buyer and seller agree on a price</text>`);
  },
  seesaw() {
    return vsvg(`<path d="M160 100 L144 132 H176 Z" fill="var(--line-strong)"/>
      <g class="seesaw"><rect x="50" y="92" width="220" height="10" rx="5" fill="var(--ink)"/>${pill(54, 60, 72, 30, 'var(--hit)', 'YES ↑', '#fff', '')}${pill(194, 60, 72, 30, 'var(--miss)', 'NO ↓', '#fff', '')}</g>`);
  },
  spread(buy, sell) {
    return vsvg(`${pill(44, 44, 104, 40, 'var(--hit)', `Buy ${buy}¢`, '#fff', 'pop', 0)}${pill(172, 44, 104, 40, 'var(--miss)', `Sell ${sell}¢`, '#fff', 'pop', .2)}
      <path class="draw" ${dl(.5)} d="M96 98 V112 H224 V98" fill="none" stroke="var(--gold)" stroke-width="3"/>
      <text x="160" y="134" class="vt pop" ${dl(.9)} font-size="15">spread: ${buy - sell}¢</text>`);
  },
  average() {
    const pts = [[40, 50, 1], [62, 110, 0], [84, 64, 1], [106, 100, 0], [128, 56, 1], [150, 118, 0], [172, 70, 1], [194, 60, 1], [216, 104, 0], [238, 66, 1], [260, 92, 0], [282, 58, 1]];
    return vsvg(pts.map(([x, y, w], i) => `<circle class="pop" ${dl(i * .07)} cx="${x}" cy="${y}" r="7" fill="${w ? 'var(--hit)' : 'var(--miss)'}"/>`).join('')
      + `<path class="draw" ${dl(.9)} d="M30 96 L290 66" stroke="var(--signal)" stroke-width="4" stroke-dasharray="0" fill="none" stroke-linecap="round"/>
      <text x="250" y="140" class="vt pop" ${dl(1.4)} font-size="13" fill="var(--signal-text)">your average ↗</text>`);
  },
  cycle(steps) {
    const at = [[160, 30], [262, 80], [160, 130], [58, 80]];
    return vsvg(`<circle cx="160" cy="80" r="50" fill="none" stroke="var(--line)" stroke-width="4" stroke-dasharray="8 8" class="spin"/>`
      + steps.map((s, i) => pill(at[i][0] - 46, at[i][1] - 15, 92, 30, i === 3 ? 'var(--signal)' : 'var(--surface)', s, i === 3 ? '#fff' : 'var(--ink)', 'pop', i * .25).replace('<rect', '<rect stroke="var(--line)" stroke-width="2"')).join(''));
  },
  check(items) {
    return vsvg(items.map((t, i) => `<g class="pop" ${dl(i * .3)}><rect x="70" y="${18 + i * 34}" width="24" height="24" rx="6" fill="var(--hit)"/>
      <path d="M76 ${30 + i * 34} l5 5 l9 -10" stroke="#fff" stroke-width="3" fill="none" stroke-linecap="round"/>
      <text x="106" y="${31 + i * 34}" class="vt-l" font-size="16">${t}</text></g>`).join(''));
  },
  numline() {
    return vsvg(`<line class="grow-x" x1="40" y1="84" x2="280" y2="84" stroke="var(--line-strong)" stroke-width="6" stroke-linecap="round"/>
      <g class="pop" ${dl(.4)}><circle cx="40" cy="84" r="11" fill="var(--hit)"/><text x="40" y="118" class="vt" font-size="14">0 perfect</text></g>
      <g class="pop" ${dl(.7)}><circle cx="100" cy="84" r="11" fill="var(--gold)"/><text x="100" y="56" class="vt" font-size="13">0.25 = always 50%</text></g>
      <g class="pop" ${dl(1)}><circle cx="280" cy="84" r="11" fill="var(--miss)"/><text x="280" y="118" class="vt" font-size="14">1 worst</text></g>`);
  }
};
