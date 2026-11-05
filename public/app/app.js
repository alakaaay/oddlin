// Oddlin app MVP skeleton. No build step, no dependencies.
// Routes (hash): #/learn (home), #/ai, #/sim, #/board, #/profile. Lessons open as a full-screen sheet over the current tab.
// Everything is demo data: markets, prices, leaderboard and coach answers are mocks. Progress is kept in localStorage only.
(function () {
  'use strict';

  const KEY = 'oddlin_app_v1';
  const START_BALANCE = 1000;
  const LESSON_REWARD = 100; // play money for finishing a lesson
  const AV_DEFAULT = { body: 'm', skin: 1, hair: 'short', hairColor: 0, eyes: 'round', facial: 'none', glasses: 'none', shirt: 0, bg: 0 };
  const $ = (s, r = document) => r.querySelector(s);
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const money = n => '$' + Math.round(n).toLocaleString('en-US');
  // Local calendar dates as YYYY-MM-DD
  const iso = d => d.toLocaleDateString('en-CA');
  const today = () => iso(new Date());
  const addDays = (s, n) => { const d = new Date(s + 'T12:00:00'); d.setDate(d.getDate() + n); return iso(d); };
  const dayGap = (a, b) => Math.round((new Date(b + 'T12:00:00') - new Date(a + 'T12:00:00')) / 864e5);
  const MAX_FREEZE = 2, QUIZ_RETAKE = 500, BONUS_COINS = 50, BONUS_EVERY = 3 * 36e5;
  // 7-day gift ladder: coins, a chest on day 5, an Epic chest plus 30 XP on day 7
  const GIFTS = [{ c: 50 }, { c: 100 }, { c: 150 }, { c: 200 }, { chest: 0 }, { c: 400 }, { chest: 2, xp: 30 }];
  const giftLabel = g => g.chest == null ? `${g.c} coins` : g.chest === 2 ? 'Epic chest' : 'Mystery chest';

  // ---------- state ----------
  function fresh() {
    return { name: 'You', balance: START_BALANCE, xp: 0, streak: 0, lastActive: null, done: [], trades: [], chat: [], topics: ['The Fed', 'Inflation', 'Jobs'], minutes: 10,
      avatar: Object.assign({}, AV_DEFAULT), avatarSet: false, theme: 'system', sub: 'active', email: 'you@example.com', days: [], bestStreak: 0, learnSec: 0, perfect: 0, asked: 0, badges: [], badgeAt: {}, stars: {}, chests: [],
      freezes: MAX_FREEZE, frozen: [], gift: { n: 0, last: null }, bonusAt: 0, quizTries: {} };
  }
  let S;
  try { S = Object.assign(fresh(), JSON.parse(localStorage.getItem(KEY) || '{}')); } catch (e) { S = fresh(); }
  // Saves locally right away and to the server (debounced) when signed in. The server copy is the source of truth.
  let syncTimer = null;
  function save() {
    try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) {}
    paintBar();
    if (!S.uid) return;
    clearTimeout(syncTimer);
    syncTimer = setTimeout(pushProgress, 1200);
  }
  function snapshot() { const d = Object.assign({}, S); delete d.user; delete d.uid; return d; }
  function pushProgress() {
    let token = null; try { token = localStorage.getItem('oddlin_token'); } catch (e) {}
    if (!token || !S.uid) return;
    fetch('/api/auth', { method: 'POST', headers: { 'Content-Type': 'application/json' }, keepalive: true,
      body: JSON.stringify({ action: 'progress_save', token, data: snapshot() }) }).catch(() => {});
  }
  addEventListener('pagehide', () => { if (syncTimer) { clearTimeout(syncTimer); pushProgress(); } });

  // Missed days are covered by freezes, one per day, if there are enough; otherwise the streak resets.
  // Runs on load, before any new activity is counted.
  function settleStreak() {
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
  function touchStreak() {
    const t = today();
    if (S.lastActive === t) return;
    S.streak = S.lastActive === addDays(t, -1) ? S.streak + 1 : 1;
    S.lastActive = t;
    if (!S.days.includes(t)) S.days.push(t);
    S.bestStreak = Math.max(S.bestStreak, S.streak);
    if (S.streak % 3 === 0 && S.freezes < MAX_FREEZE) { S.freezes++; setTimeout(() => tip(`${S.streak}-day streak: +1 streak freeze`), 300); }
    bump('#streak');
  }
  function bump(sel) { const el = $(sel).parentElement; el.classList.remove('bump'); void el.offsetWidth; el.classList.add('bump'); }
  function paintBar() {
    const alive = S.lastActive === today() || S.lastActive === addDays(today(), -1);
    $('#streak').textContent = alive ? S.streak : 0;
    $('#balance').textContent = money(S.balance);
  }

  // ---------- course ----------
  // Node kinds: lesson (book icon) and review (crown). Steps: text | odds | q (question with one right answer).
  // ---------- slide illustrations ----------
  // Small animated SVG scenes (320x160) built from a few parametric pieces. Animations are CSS classes in app.css.
  const VW = 320, VH = 160;
  const vsvg = inner => `<svg viewBox="0 0 ${VW} ${VH}" aria-hidden="true">${inner}</svg>`;
  const dl = s => `style="--d:${s}s"`;
  const pill = (x, y, w, h, fill, label, color, cls = 'pop', d = 0) => `<g class="${cls}" ${dl(d)}><rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${h / 2}" fill="${fill}"/><text x="${x + w / 2}" y="${y + h / 2}" class="vt" fill="${color}" font-size="${Math.round(h * .45)}">${label}</text></g>`;
  const emo = (e, x, y, size, cls = 'pop', d = 0) => `<text x="${x}" y="${y}" class="ve ${cls}" ${dl(d)} font-size="${size}">${e}</text>`;
  const V = {
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

  // Day = 2-3 lessons + a 10-question quiz (pass 8/10). A lesson = 8-15 short slides (20-40 words, plain words) + 2-3 questions with hints.
  // Every slide has an illustration (v). Options are shuffled on screen, so the right answer is written first (a: 0).
  const T = (big, body, v) => ({ t: 'text', big, body, v });
  const q = (ask, opts, why, hint) => ({ t: 'q', ask, opts, a: 0, why, hint });
  const C = '¢';
  const COURSE = [
    { day: 1, title: 'How it works, and why it isn’t gambling', nodes: [
      { id: 'd1l1', kind: 'lesson', title: 'A price is a probability', steps: [
        T('Welcome! Let’s start simple.', 'A prediction market asks one yes-or-no question about the future. For example: will the Fed cut interest rates in December?', V.q('Will the Fed cut rates', 'in December?')),
        T('Pick a side: YES or NO.', 'Think it’ll happen? Buy YES. Think it won’t? Buy NO. That’s the whole idea. Each piece you buy is called a contract.', V.split('YES', 'NO')),
        { t: 'odds', big: 'Every contract has a price.', crowd: 62, body: `Prices go from 1${C} to 99${C}. Right now, YES on the Fed question costs 62${C}. Let’s see what that number means.` },
        T('The price is like a vote count.', `62${C} means the crowd thinks there’s about a 62% chance. Just read cents as percent. Easy, right?`, V.dots(50, 31, '62% of the crowd says YES')),
        T('Cheap means unlikely. Pricey means likely.', `10${C}? The crowd thinks it’s a long shot. 90${C}? Almost sure. But almost sure is still not certain.`, V.bars([{ l: 'long shot', v: 10, top: `10${C}`, c: 'var(--miss)' }, { l: 'coin flip', v: 50, top: `50${C}`, c: 'var(--gold)' }, { l: 'likely', v: 90, top: `90${C}`, c: 'var(--hit)' }])),
        T('News moves the price.', 'A surprise inflation number or a Fed speech can push the price up or down in minutes. Prices change as people change their minds.', V.chart('up', 'CPI news')),
        T('The crowd isn’t always right.', 'Something priced at 62% still fails about 4 times out of 10. Your job is to spot when the crowd is too high or too low.', V.dots(10, 6, 'priced at 62%: about 6 hit, 4 miss', true)),
        T('Practice with play money first.', 'Every trade in Oddlin uses play money. Make mistakes for free, learn how prices move and build your own track record.', V.emoji('🪙', ['🎮', '✨', 'PLAY'])),
        q(`YES costs 30${C}. What chance does the market give?`, ['About 30%', 'About 70%', `It pays 30${C}`], 'Read cents as percent: 30¢ ≈ 30%.', 'Read the price in cents as a percent.'),
        q(`A contract costs 85${C}. What does the crowd think?`, ['Likely, but not certain', 'It will surely happen', 'It’s unlikely'], '85% is high, but only 100% would be certain.', 'How far is 85 from 100?')
      ] },
      { id: 'd1l2', kind: 'lesson', title: '$1 or $0: your max loss is fixed', steps: [
        T('Every market has an end date.', 'On that day we get a clear answer. Did the Fed cut rates or not? It’s yes or no, nothing in between.', V.emoji('🗓️', ['✅', 'DEC 10'])),
        T('Right answer? You get $1.', 'Each winning contract pays exactly $1. Held YES and it happened? $1 each. Held NO and it didn’t happen? Also $1 each.', V.coin('YES ✓', '$1', 'winners always get $1')),
        T('Wrong answer? You get $0.', 'Losing contracts pay nothing. That’s the worst case. No debt, no surprise bills. A contract can’t drop below zero.', V.coin('NO ✕', '$0', 'no debt, no bills', true)),
        T('What you pay is the most you can lose.', `Buy 10 YES at 62${C} and you pay $6.20. If you’re wrong, you lose $6.20. Not a cent more.`, V.ticket([[`10 YES × 62${C}`, '$6.20'], ['Max loss', '$6.20']])),
        T('Your best case is fixed too.', 'Those 10 contracts pay $10 at most. You paid $6.20, so the most you can make is $3.80.', V.stack([{ l: 'you paid $6.20', v: 62 }, { l: 'gain $3.80', v: 38, c: 'var(--hit)' }], '$10')),
        T('Cheap contracts: big payout, rare win.', `A 10${C} contract pays $1 if it wins. That’s ten times your money. But the crowd says it happens about 1 time in 10.`, V.coin(`10${C}`, '$1', 'happens about 1 time in 10')),
        T('Pricey contracts: small payout, often.', `A 90${C} contract earns just 10${C} when it wins. One loss costs 90${C} and wipes out nine wins.`, V.winloss()),
        T('Check two numbers before every trade.', 'Max loss and max payout. Oddlin shows both on every ticket. Look at them before you tap Buy. Every single time.', V.ticket([['Max loss', '$6.20'], ['Max payout', '$10.00']])),
        T('Pick your comfort zone first.', 'Before a trade, decide how much you’re okay losing on that idea. Then buy only as many contracts as fit that amount.', V.slider('$0', '$20', 'okay to lose: $10')),
        T('Start small. Seriously.', 'Small trades keep mistakes cheap. With play money you can try ideas, see what happens and learn without any stress.', V.emoji('🌱', ['💧', '☀️'])),
        q(`You buy 20 YES at 40${C}. What’s your max loss?`, ['$8', '$20', '$12'], '20 × $0.40 = $8. That’s what you paid.', 'Max loss = contracts × price.'),
        q('You hold NO and the event does NOT happen. What does each NO pay?', ['$1', '$0', 'What you paid'], 'NO wins when it doesn’t happen, and winners pay $1.', 'NO means “it won’t happen”.'),
        q(`You buy 10 YES at 70${C}. What’s the most you can make?`, ['$3', '$10', '$7'], '$10 payout − $7 paid = $3.', 'Total payout minus what you paid.')
      ] },
      { id: 'd1l3', kind: 'lesson', title: 'Odds, not luck', steps: [
        T('Wait, isn’t this gambling?', 'Fair question! Both involve money and an uncertain result. The difference is how you decide and what you’re deciding on.', V.emoji('🤔', ['🎲', '📊'])),
        T('Casinos are built to beat you.', 'Roulette and slots are designed so the house wins over time. No amount of research changes how a wheel spins.', V.emoji('🎰', ['🏠', '💸'], 'shake')),
        T('Real events leave clues.', 'Inflation, jobs and Fed decisions come with data, official statements and history. Read the clues well and your odds get better.', V.emoji('🔍', ['📈', '📰', '🏛️'])),
        T('There’s no house here.', 'On an exchange, another person takes the other side of your trade. The price is just where buyers and sellers meet.', V.exchange()),
        T('Good judgment can be measured.', 'Say 70% on lots of events, and about 7 in 10 should happen. Track that, and you’ll know if your instincts are actually good.', V.dots(10, 7, 'said 70%: about 7 in 10 happen', true)),
        T('One trade proves nothing.', 'Any single call can go wrong, even with great reasoning. Skill shows up over many calls. Judge yourself on dozens, not one.', V.emoji('🪙', ['1 call', '50 calls'], 'flip')),
        T('Gamblers chase. Forecasters adjust.', 'After a loss, a gambler bets bigger to win it back. A forecaster checks the data, updates the estimate and moves on calmly.', V.emoji('🧘', ['📉', '📋'])),
        T('Some markets are regulated.', 'In the US, Kalshi is an exchange regulated by the CFTC, the agency that oversees futures markets. The rules of each market are public.', V.emoji('🏛️', ['✅', 'CFTC'])),
        T('Four simple rules.', 'Trade only when you have a reason. Know your max loss. Never chase losses. Write down every call and how it turned out.', V.check(['Have a reason', 'Know your max loss', 'Never chase losses', 'Log every call'])),
        T('That’s what Oddlin trains.', 'You make calls with play money, get an accuracy score and see where your judgment is strong or weak. All before any real decision.', V.emoji('🎯', ['📊', '💪'])),
        q('What makes forecasting different from a slot machine?', ['You can use data to judge the odds', 'The payout is always bigger', 'You can never lose'], 'Real events leave clues you can study. A slot machine doesn’t.', 'Think about what research can change.'),
        q('You lost a trade that had solid reasoning. What’s the forecaster move?', ['Review the data and keep sizes small', 'Double the next trade to win it back', 'Stop using data'], 'One loss doesn’t prove you wrong. Review, update, stay small.', 'Gamblers chase. Forecasters adjust.')
      ] },
      { id: 'd1r', kind: 'review', title: 'Day 1 quiz', steps: [
        q(`A YES contract costs 45${C}. What chance does the market give?`, ['About 45%', 'About 55%', 'About 4.5%'], 'Read cents as percent.'),
        q(`A contract costs 90${C}. What does that mean?`, ['Very likely, not certain', 'Already decided', 'Unlikely'], 'Only 100% would be certain.'),
        q('What does a winning contract pay at the end?', ['$1', 'The price you paid', 'It depends on volume'], 'Every winning contract pays $1.'),
        q(`You buy 10 YES at 62${C}. What’s your max loss?`, ['$6.20', '$10', '$3.80'], '10 × $0.62 = $6.20, what you paid.'),
        q(`You buy 10 YES at 62${C} and it happens. What’s your profit?`, ['$3.80', '$10', '$6.20'], '$10 back for $6.20 paid: $3.80 profit.'),
        q(`A 10${C} YES contract wins. What does it pay?`, ['$1', `10${C}`, '$10'], 'Every winner pays $1, whatever you paid.'),
        q('On an exchange, who takes the other side of your trade?', ['Another trader', 'A casino', 'Nobody'], 'Buyers and sellers meet. There is no house.'),
        q('What’s the best way to judge your forecasting skill?', ['Track accuracy over many calls', 'Look at your last trade', 'Count only your wins'], 'Skill shows over many calls, not one.'),
        q('After a loss, what does a forecaster do?', ['Reviews the data and adjusts', 'Doubles the next trade', 'Ignores the data'], 'Adjust calmly. Never chase.'),
        q(`A price moves from 40${C} to 60${C}. What does that tell you?`, ['The crowd thinks YES got more likely', 'The event already happened', 'Fees went up'], 'Prices follow the crowd’s current odds.')
      ] }
    ] },
    { day: 2, title: 'Your read vs the crowd', nodes: [
      { id: 'd2l1', kind: 'lesson', title: 'YES, NO and selling early', steps: [
        T('YES and NO are a pair.', 'They’re two sides of the same question. When YES becomes more likely, its price goes up and the NO price goes down.', V.seesaw()),
        T('Together they make about $1.', `YES at 70${C} means NO is about 30${C}. Tiny gaps happen because buyers pay a bit more than sellers get.`, V.stack([{ l: `YES 70${C}`, v: 70, c: 'var(--hit)' }, { l: `NO 30${C}`, v: 30, c: 'var(--miss)' }])),
        T('Think it won’t happen? Buy NO.', 'If you think a Fed cut is unlikely, you don’t have to sit it out. Buy NO. It pays $1 if there’s no cut.', V.coin('NO', '$1', 'pays if there’s no cut')),
        T('You can leave any time.', 'You don’t have to wait until the end. You can sell your contracts at the current price whenever you like.', V.emoji('🚪', ['🏃', 'SELL'])),
        T('Selling early can lock in a gain.', `Bought YES at 40${C} and now it’s 55${C}? Sell, and you keep 15${C} per contract, no matter what happens next.`, V.chart('up', `+15${C}`)),
        T('It can also limit a loss.', `Price fell from 40${C} to 25${C}? Selling now means you lose 15${C} per contract instead of the full 40${C}.`, V.chart('down', `−15${C}`)),
        T('Why sell early?', 'Maybe news changed your mind. Maybe you want the money for a better idea. Or you just like locking in a win.', V.emoji('💭', ['📰', '💡', '🔒'])),
        T('The spread is a small hidden cost.', 'Buyers pay a little more than sellers get. On busy markets the gap is tiny. On quiet ones it can eat your edge.', V.spread(63, 61)),
        T('Watch the moves, not just the end.', 'Lots of traders never wait for the final answer. They follow how the odds react to news and trade those moves.', V.chart('wave')),
        T('Try both in the simulator.', 'Hold one trade until the end. Sell another one early. Then compare what happened and which choice fit your thinking.', V.emoji('🧪', ['HOLD', 'SELL'])),
        q(`YES costs 70${C}. About what does NO cost?`, [`30${C}`, `70${C}`, '$1'], 'YES + NO ≈ $1.', 'The two sides add up to about $1.'),
        q(`You bought YES at 40${C}. Now it’s 55${C}. Profit if you sell one?`, [`15${C}`, `55${C}`, '$1'], `55${C} − 40${C} = 15${C}.`, 'Sell price minus buy price.')
      ] },
      { id: 'd2l2', kind: 'lesson', title: 'Make your own odds', steps: [
        T('Guess first, peek later.', 'If you see the price first, it sticks in your head. Write down your own guess before you look at what the crowd says.', V.emoji('🙈', [`62${C}?`, '📝'])),
        T('Start with history.', 'How often did this happen before? If the Fed cut at 3 of its last 10 meetings, about 30% is a fair place to start.', V.dots(10, 3, 'example: 3 cuts in 10 meetings')),
        T('Then adjust with fresh news.', 'Inflation cooling? Weak jobs report? Fed officials hinting? Each clue can nudge your number up or down from that start.', V.slider('30%', '60%', 'now: 45%')),
        T('Say a number, not a feeling.', '“75%” beats “probably”. A number can be checked later and teach you something. A vague feeling can’t.', V.emoji('📝', ['75%', '✅'])),
        { t: 'odds', big: 'Now compare with the crowd.', crowd: 62, you: 75, body: 'You say 75%. The market says 62%. That 13-point gap is where an opportunity might be hiding.' },
        T('A gap isn’t proof.', 'The crowd often knows something you missed. A big gap means: double-check your thinking before you trade.', V.emoji('🔍', ['⚠️', '13 pts'])),
        T('Expected value: the gap in money.', 'The formula is: your chance × $1 − price. It tells you what one contract is worth to you, if your odds are right.', V.chips(['chance', '×', '$1', '−', 'price'])),
        T('Let’s try it.', `You think 75%. YES costs 62${C}. So 0.75 × $1 − 62${C} = +13${C} per contract. Positive means it looks cheap to you.`, V.chips(['0.75', '×', '$1', '−', `62${C}`, '=', `+13${C}`], 'hit')),
        T('Negative? Skip it.', `You think 40%, YES costs 55${C}. That’s −15${C}. By your numbers YES is overpriced. Skip it, or take a look at NO.`, V.chips(['0.40', '×', '$1', '−', `55${C}`, '=', `−15${C}`], 'miss')),
        T('It’s an average, not a promise.', 'Even a good call can lose. Expected value pays off over many calls where your odds are better than the crowd’s.', V.average()),
        T('Tiny edge? Tiny trade.', 'A 2-point gap is easy to get wrong. Keep trades small unless your reasoning is strong and the gap is big.', V.bars([{ l: '2-pt edge', v: 12, top: 'small' }, { l: '15-pt edge', v: 60, top: 'bigger' }])),
        T('This is the Oddlin habit.', 'Guess, compare, calculate, decide. Repeat it on every market, and your accuracy score will show if it’s working.', V.cycle(['Guess', 'Compare', 'Calculate', 'Decide'])),
        q(`You think 70%. YES costs 50${C}. What does the math say?`, ['YES looks cheap', 'YES looks expensive', 'No difference'], `It’s worth 70${C} to you and costs 50${C}.`, `Compare 70${C} of value with the 50${C} price.`),
        q(`You think 60%. YES costs 50${C}. Expected value per contract?`, [`+10${C}`, `+60${C}`, `−10${C}`], `0.60 × $1 − 50${C} = +10${C}.`, 'Your chance × $1, minus the price.'),
        q('Why write your guess before looking at the price?', ['So the price doesn’t anchor you', 'Because prices are always wrong', 'To trade faster'], 'Seeing a number first pulls your guess toward it.', 'What happens to your guess after you see a number?')
      ] },
      { id: 'd2l3', kind: 'lesson', title: 'Are your odds any good?', steps: [
        T('70% is a promise you can check.', 'If your 70% calls come true about 70% of the time, you’re calibrated. That’s the real test of good judgment.', V.emoji('🎯', ['70%', '✅'])),
        T('Most beginners are too sure.', 'They say 90% for things that happen 70% of the time. Feeling confident is nice, but it costs you over many calls.', V.gauge(90, 70)),
        T('Some play it too safe.', 'They say 50% on everything. They’re rarely embarrassed, but they never find the spots where the crowd is clearly wrong.', V.gauge(50)),
        T('The Brier score keeps you honest.', 'It compares your number with what happened. 0 is perfect. 0.25 is what you’d get by always saying 50%.', V.numline()),
        T('You said 80%, and it happened.', 'Your score for that call: (0.8 − 1)² = 0.04. That’s close to zero, which is great.', V.chips(['(0.8 − 1)²', '=', '0.04'], 'hit')),
        T('You said 80%, and it didn’t.', 'Now it’s (0.8 − 0)² = 0.64. Ouch. Confident misses hurt a lot, so it pays to be honest about doubt.', V.chips(['(0.8 − 0)²', '=', '0.64'], 'miss')),
        T('Look at the average.', 'One bad call won’t define you. After 20 or 30 calls, your average starts telling you something real.', V.dots(30, 21, '30 calls: the pattern shows')),
        T('Use levels you can explain.', '60% when you lean yes. 80% when the data clearly points one way. 95% only when it’s nearly settled.', V.bars([{ l: 'lean yes', v: 60, top: '60%' }, { l: 'clear data', v: 80, top: '80%' }, { l: 'nearly done', v: 95, top: '95%' }])),
        T('Your AI Coach keeps score.', 'Every settled call updates your score. The coach shows where you drift, by topic and by how confident you were.', V.emoji('🤖', ['📊', '0.18'])),
        T('Your first-month goal.', 'Make at least 20 play-money calls and get your Brier score under 0.20. That beats guessing and shows real skill.', V.emoji('🏆', ['20 calls', '< 0.20'])),
        q('Your 90% calls come true 6 times in 10. You are…', ['Too sure (overconfident)', 'Too careful (underconfident)', 'Perfectly calibrated'], 'You said 90%, reality said 60%.', 'Compare what you said with what happened.'),
        q('Which Brier score is best?', ['0.12', '0.30', '0.25'], 'Lower is better. 0.12 beats always saying 50% (0.25).', 'Lower is better. 0.25 = always saying 50%.')
      ] },
      { id: 'd2r', kind: 'review', title: 'Day 2 quiz', steps: [
        q(`YES costs 62${C}. About what does NO cost?`, [`38${C}`, `62${C}`, '$1'], 'YES + NO ≈ $1.'),
        q(`You bought 4 YES at 50${C}. Now it’s 65${C}. Profit if you sell all 4?`, [`60${C}`, '$2.60', `15${C}`], `4 × 15${C} = 60${C}.`),
        q(`You think 75%. YES costs 62${C}. What does the math say?`, ['YES looks cheap', 'YES looks expensive', 'No edge'], `75${C} of value for 62${C}.`),
        q(`You think 80%. YES costs 70${C}. Expected value per contract?`, [`+10${C}`, `+80${C}`, `−10${C}`], `0.80 − 0.70 = +10${C}.`),
        q(`You think 20%. YES costs 35${C}. Expected value of YES?`, [`−15${C}`, `+15${C}`, `+20${C}`], `0.20 − 0.35 = −15${C}.`),
        q(`Same market: you think NO is 80% likely. NO costs 65${C}. Expected value of NO?`, [`+15${C}`, `−15${C}`, `+45${C}`], `0.80 − 0.65 = +15${C}.`),
        q('Why write your guess before checking the price?', ['To avoid anchoring on it', 'Prices are always wrong', 'It’s faster'], 'Seeing a number first pulls your guess toward it.'),
        q('What does “calibrated” mean?', ['Your 70% calls happen about 70% of the time', 'You win most trades', 'You always say 50%'], 'It compares what you said with what happened.'),
        q('You said 80% and it didn’t happen. Brier score for that call?', ['0.64', '0.04', '0.20'], '(0.8 − 0)² = 0.64.'),
        q(`Price 50${C}, your odds 52%. What’s the sensible move?`, ['Skip or go very small: the edge is thin', 'Go all in', 'Buy NO instead'], 'A 2-point edge is easy to get wrong.')
      ] }
    ] }
  ];
  const UPCOMING = ['Reading a Fed statement', 'Inflation data in 5 minutes', 'Jobs day', 'When to sell early', 'Elections and polls', 'Your first week in review'];
  const ALL = COURSE.flatMap(d => d.nodes);
  const ICON = {
    lesson: '<svg viewBox="0 0 24 24"><path d="M3 5.5A1.5 1.5 0 0 1 4.5 4H11v16l-1-1H4.5A1.5 1.5 0 0 1 3 17.5zM13 4h6.5A1.5 1.5 0 0 1 21 5.5v12a1.5 1.5 0 0 1-1.5 1.5H14l-1 1z"/></svg>',
    review: '<svg viewBox="0 0 24 24"><path d="M3 7l4.5 4L12 4l4.5 7L21 7l-2 12H5z"/></svg>',
    done: '<svg viewBox="0 0 24 24"><path d="M9.5 16.2L5 11.7l-1.6 1.6 6.1 6.1L21 7.9l-1.6-1.6z"/></svg>'
  };
  const CHEST = '<svg viewBox="0 0 64 56" aria-hidden="true"><path class="lid" d="M6 22C6 10 16 4 32 4s26 6 26 18v4H6z"/><g class="loot"><path d="M9 27Q32 17 55 27Z" fill="#3A2414"/><circle cx="22" cy="24.5" r="4.5" fill="#F5B301"/><circle cx="32" cy="22" r="5" fill="#FFD34D"/><circle cx="42" cy="24.5" r="4.5" fill="#F5B301"/></g><rect class="box" x="6" y="26" width="52" height="26" rx="4"/><rect class="band" x="6" y="24" width="52" height="6"/><rect class="lock" x="27" y="22" width="10" height="13" rx="2"/></svg>';
  const TEST_UNLOCK = false; // true opens every built lesson and quiz and makes quiz retakes free (for testing)
  const nextNode = () => ALL.find(n => !S.done.includes(n.id));

  // ---------- views ----------
  const VIEWS = {
    learn() {
      // Game map: a winding road through numbered levels. Lessons are hexagons, the daily check is a boss level,
      // a chest closes every day. Upcoming days are shown as locked levels.
      const cur = nextNode();
      const items = [];
      COURSE.forEach(d => {
        items.push({ t: 'day', day: d.day, title: d.title, open: true });
        d.nodes.forEach(n => items.push({ t: 'node', n }));
        items.push({ t: 'chest', id: 'chest-d' + d.day, ready: d.nodes.every(n => S.done.includes(n.id)) });
      });
      UPCOMING.slice(0, 3).forEach((title, k) => {
        items.push({ t: 'day', day: k + 3, title, open: false });
        for (let j = 0; j < 3; j++) items.push({ t: 'ghost', boss: j === 2 });
      });
      const H = { day: 96, node: 140, chest: 110, ghost: 130 };
      let y = 24, lvl = 0, idx = 0;
      const pts = [];
      const html = items.map(it => {
        const top = y; y += H[it.t];
        if (it.t === 'day') return `<div class="map-day${it.open ? '' : ' off'}" style="top:${top}px"><span>Day ${it.day}</span><b>${it.open ? esc(it.title) : 'Opens on day ' + it.day}</b></div>`;
        const x = 50 + Math.sin(idx++ * 1.05) * 26; // percent of the map width
        const cy = top + H[it.t] / 2;
        pts.push([x, cy, it.t === 'node' ? S.done.includes(it.n.id) : it.t === 'chest' ? it.ready : false]); // a finished day's chest doesn't block the gold road
        if (it.t === 'chest') {
          const opened = S.chests.includes(it.id);
          return `<button class="chest${opened ? ' opened' : it.ready ? ' ready' : ' locked'}" style="left:${x}%;top:${cy}px" data-chest="${it.id}" ${it.ready && !opened ? '' : 'aria-disabled="true"'} aria-label="Day reward chest${opened ? ', opened' : it.ready ? ', ready to open' : ', locked'}">${CHEST}</button>`;
        }
        lvl++;
        if (it.t === 'ghost') return `<button class="lvl locked${it.boss ? ' boss' : ''}" style="left:${x}%;top:${cy}px" data-soon aria-label="Level ${lvl}, locked"><span class="hex"><span class="num">${lvl}</span></span></button>`;
        const n = it.n, done = S.done.includes(n.id), isCur = cur && cur.id === n.id, boss = n.kind === 'review';
        const st = S.stars[n.id] || (done ? 1 : 0);
        return `<button class="lvl ${done ? 'done' : isCur ? 'current' : TEST_UNLOCK ? 'open' : 'locked'}${boss ? ' boss' : ''}" style="left:${x}%;top:${cy}px" data-node="${n.id}" aria-label="Level ${lvl}: ${esc(n.title)}${done ? ', done' : isCur ? ', play' : TEST_UNLOCK ? '' : ', locked'}">
          ${done ? `<span class="stars">${[1, 2, 3].map(k => `<i class="${k <= st ? 'on' : ''}">★</i>`).join('')}</span>` : ''}
          <span class="hex"><span class="num">${boss ? ICON.review : lvl}</span></span>
          ${isCur || boss || done ? `<span class="tag">${isCur ? (boss ? 'Quiz' : 'Play') : boss ? 'Quiz' : esc(n.title)}</span>` : ''}
        </button>`;
      }).join('');
      // road: smooth curve through the level centers; the walked part is gold
      const seg = (a, b) => { const my = (a[1] + b[1]) / 2; return `M${a[0]} ${a[1]}C${a[0]} ${my} ${b[0]} ${my} ${b[0]} ${b[1]}`; };
      let walked = '', ahead = '';
      for (let k = 1; k < pts.length; k++) (pts[k - 1][2] && (pts[k][2] || (cur && k === pts.findIndex(p => !p[2])))) ? walked += seg(pts[k - 1], pts[k]) : ahead += seg(pts[k - 1], pts[k]);
      const total = ALL.length, doneN = S.done.length;
      return `<section class="view">
        <div class="quest">
          <div><p class="eyebrow">28-day quest</p><h2>Prediction Markets</h2></div>
          <div class="quest-meter"><span>${doneN}/${total}</span><i style="width:${Math.round(doneN / total * 100)}%"></i></div>
        </div>
        <div class="map" style="height:${y + 40}px">
          <svg class="road" viewBox="0 0 100 ${y + 40}" preserveAspectRatio="none" aria-hidden="true">
            <path d="${walked + ahead}" class="road-base"/><path d="${ahead}" class="road-dash"/><path d="${walked}" class="road-gold"/>
          </svg>
          ${html}
          <p class="map-end" style="top:${y}px">New days open one at a time. Come back tomorrow.</p>
        </div>
      </section>`;
    },

    ai() {
      const st = stats();
      const chat = S.chat.length ? S.chat : [{ me: false, text: 'Hi! I’m your coach. I look at your predictions and show where your odds drift from reality. Ask me anything about a market or a lesson.' }];
      return `<section class="view">
        <div><p class="eyebrow">AI Coach</p><h1>How sharp are your odds?</h1></div>
        <div class="score">
          <div><b>${st.n}</b><span class="small muted">settled calls</span></div>
          <div><b>${st.n ? Math.round(st.hit * 100) + '%' : '–'}</b><span class="small muted">right side</span></div>
          <div><b>${st.n ? st.brier.toFixed(2) : '–'}</b><span class="small muted">Brier score</span></div>
        </div>
        <p class="disc">Brier score: 0 is perfect, 0.25 is a coin flip. Lower is better.</p>
        <div class="chat" id="chat">${chat.map(m => `<div class="msg ${m.me ? 'me' : 'bot'}">${esc(m.text)}</div>`).join('')}</div>
        <div class="sugg">${['Review my last call', 'What moves Fed odds?', 'Am I overconfident?'].map(q => `<button data-ask="${esc(q)}">${esc(q)}</button>`).join('')}</div>
        <form class="ask" id="askf"><input id="askq" placeholder="Ask your coach" autocomplete="off" aria-label="Ask your coach"><button class="btn" aria-label="Send">↑</button></form>
        <p class="disc">Demo answers. Educational only, not financial advice.</p>
      </section>`;
    },

    sim() {
      const tab = simTab;
      const open = S.trades.filter(t => !t.settled), closed = S.trades.filter(t => t.settled);
      return `<section class="view">
        <div><p class="eyebrow">Simulator · play money</p><h1>Practice on live events</h1></div>
        <div class="seg" role="group"><button data-seg="markets" aria-pressed="${tab === 'markets'}">Markets</button><button data-seg="mine" aria-pressed="${tab === 'mine'}">My calls${open.length ? ' (' + open.length + ')' : ''}</button></div>
        ${tab === 'markets' ? MARKETS.map(m => `<button class="card mkt" data-mkt="${m.id}">
            <h3>${esc(m.q)}</h3><span class="price">${m.price}¢</span>
            <span class="meta"><span class="chip">${esc(m.topic)}</span><span class="small muted">${esc(m.src)} · closes ${esc(m.closes)}</span></span>
          </button>`).join('') + '<p class="disc">Sample prices for the demo. Live Kalshi and Polymarket data comes next.</p>'
        : (open.length || closed.length ? [...open, ...closed].map(tradeCard).join('') : '<div class="card"><h3>No calls yet</h3><p class="muted small">Pick a market, write your own odds and place a play-money trade.</p></div>')}
      </section>`;
    },

    board() {
      const lv = level(S.xp);
      return `<section class="view">
        <button class="league-head" data-ranks style="--rc:${lv.c}"><span class="rank-ic">${lv.icon}</span>
          <span><span class="eyebrow">Your league</span><b>${esc(lv.name)} league</b><span class="small muted">${lv.next ? `${lv.min.toLocaleString('en-US')}–${(lv.next - 1).toLocaleString('en-US')} XP · reach ${lv.next.toLocaleString('en-US')} XP for ${esc(lv.nextName)}` : `${lv.min.toLocaleString('en-US')}+ XP · top rank`}</span></span>
          <span class="chev">›</span></button>
        <div id="board-rows"><p class="muted small center">Loading your league…</p></div>
        <p class="disc">You only compete with players of your rank. XP comes from lessons and well-calibrated calls, never from profit.</p>
      </section>`;
    },

    badges() {
      const list = BADGES.map(b => Object.assign({ got: S.badges.includes(b.id) }, b, b.prog()));
      const got = list.filter(b => b.got), todo = list.filter(b => !b.got);
      const grid = arr => `<div class="badges three">${arr.map(b => `<div class="badge${b.got ? '' : ' off'}" data-badge="${b.id}" role="button" tabindex="0">
        <span class="medal" style="--c:${b.c}">${b.icon}</span><b>${esc(b.name)}</b>
        ${b.got ? `<span class="small muted">${esc(fmtDate(S.badgeAt[b.id]).replace('Earned ', ''))}</span>` : `<span class="mini"><i style="width:${Math.round((b.cur || 0) / (b.goal || 1) * 100)}%"></i></span>`}</div>`).join('')}</div>`;
      return `<section class="view">
        <a class="back-link" href="#/profile">‹ Profile</a>
        <p class="muted small">${got.length} of ${BADGES.length} earned. Tap a badge to see how to get it.</p>
        <div class="lv thick"><i style="width:${Math.round(got.length / BADGES.length * 100)}%"></i></div>
        ${got.length ? `<h3>Earned</h3>${grid(got)}` : ''}
        ${todo.length ? `<h3>To unlock</h3>${grid(todo)}` : ''}
      </section>`;
    },

    profile() {
      const lv = level(S.xp), st = stats();
      const mine = S.done.length, pct = Math.round(LEARNERS.filter(x => x < mine).length / LEARNERS.length * 100);
      const mins = Math.round(S.learnSec / 60);
      const tiers = [1, 2, 4, 6]; // lessons done by the 25th, 50th, 75th and 90th percentile learner (demo)
      const myBar = tiers.filter(t => mine >= t).length - 1;
      const planPct = Math.round(mine / ALL.length * 100);
      const list = BADGES.map(b => Object.assign({ got: S.badges.includes(b.id) }, b, b.prog()));
      list.sort((a, b) => b.got - a.got);
      const shown = list.slice(0, 4);
      return `<section class="view">
        <div class="card me-card">
          <button class="ava-btn" data-avatar aria-label="Edit avatar">${avatarSVG(S.avatar, 'ava-xl')}<span class="pen" aria-hidden="true">✎</span></button>
          <div><h2>${esc(S.name)}</h2><button class="rank-pill" data-ranks style="--rc:${lv.c}">${lv.icon} ${esc(lv.name)} · ${S.xp} XP ›</button>
            <div class="lv"><i style="width:${lv.pct}%"></i></div><p class="disc">${lv.next ? `${lv.next - S.xp} XP to ${esc(lv.nextName)}` : 'Top level'}</p></div>
          ${S.avatarSet ? '' : '<button class="btn ghost slim" data-avatar>Create your avatar</button>'}
        </div>

        <div class="card"><h3>Overview</h3><div class="ov">
          <div><span class="flame big" aria-hidden="true"></span><b>${$('#streak').textContent}</b><span class="small muted">day streak</span></div>
          <div><span class="ov-i" aria-hidden="true">★</span><b>${S.bestStreak}</b><span class="small muted">best streak</span></div>
          <div><span class="ov-i" aria-hidden="true">▦</span><b>${S.days.length}</b><span class="small muted">active days</span></div>
        </div></div>

        <div class="card"><h3>Progress</h3>
          <div class="kv small"><span>28-day plan</span><b>${mine}/${ALL.length} lessons</b></div>
          <div class="lv thick"><i style="width:${planPct}%"></i></div>
          <div class="cmp">
            <div>${mine ? `<p>You completed more lessons than <b class="hl">${pct}% of learners</b></p>` : '<p>Finish your first lesson to see how you compare with other learners.</p>'}</div>
            <div class="bars" aria-hidden="true">${tiers.map((t, i) => `<span class="${i === myBar ? 'you' : ''}" style="height:${30 + i * 18}px">${i === myBar ? '<em>You</em>' : ''}</span>`).join('')}</div>
          </div>
          <div class="two">
            <div><span class="ov-i" aria-hidden="true">${ICON.lesson}</span><b>${mine}</b><span class="small muted">lessons done</span></div>
            <div><span class="ov-i" aria-hidden="true">⏱</span><b>${mins} min</b><span class="small muted">learning time</span></div>
          </div>
          <div class="hbars">
            <div class="odds-row you"><span>You</span><span class="track"><i style="width:${Math.min(100, mins / AVG_MIN / 2 * 100)}%"></i></span><b class="mono">${mins}m</b></div>
            <div class="odds-row"><span>Avg learner</span><span class="track"><i style="width:50%"></i></span><b class="mono">${AVG_MIN}m</b></div>
          </div>
          <p class="disc">Comparison uses demo data until real learners join. ${st.n ? `Brier score ${st.brier.toFixed(2)}.` : ''}</p>
        </div>

        <div class="card"><div class="kv"><h3>Achievements</h3><a class="link" href="#/badges">View all</a></div>
          <div class="badges">${shown.map(b => `<div class="badge${b.got ? '' : ' off'}" data-badge="${b.id}" role="button" tabindex="0">
            <span class="medal" style="--c:${b.c}">${b.icon}</span><b>${esc(b.name)}</b>
            <span class="small muted">${b.got ? esc(b.desc) : esc(b.left)}</span></div>`).join('')}</div>
        </div>

        <div class="card"><h3>My plan</h3><div class="list">
          <div class="li"><span>Daily time</span><span class="muted">${esc(S.minutes)} min</span></div>
          <div class="li"><span>Topics</span><span class="muted">${esc(S.topics.join(', '))}</span></div>
          <div class="li"><span>Subscription</span><span class="muted">${S.sub === 'active' ? 'Active (demo)' : 'Canceled (demo)'}</span></div>
        </div></div>
        <div class="card"><h3>Ready for real markets?</h3><p class="muted small">Finish the 28 days and keep your Brier score under 0.20 first. Oddlin never holds your money or trades for you.</p></div>
      </section>`;
    }
  };

  // ---------- simulator data ----------
  const MARKETS = [
    { id: 'fed-dec', q: 'Will the Fed cut rates in December?', topic: 'The Fed', price: 62, src: 'Kalshi', closes: 'Dec 10' },
    { id: 'cpi-3', q: 'Will November CPI come in above 3.0%?', topic: 'Inflation', price: 38, src: 'Kalshi', closes: 'Dec 11' },
    { id: 'jobs-150', q: 'Will November payrolls beat 150k?', topic: 'Jobs', price: 47, src: 'Polymarket', closes: 'Dec 5' },
    { id: 'gdp-q4', q: 'Will Q4 GDP growth be above 2%?', topic: 'Economy', price: 55, src: 'Polymarket', closes: 'Jan 30' },
    { id: 'shutdown', q: 'Will the government shut down before Feb 1?', topic: 'Politics', price: 21, src: 'Kalshi', closes: 'Feb 1' }
  ];
  const mkt = id => MARKETS.find(m => m.id === id);
  let simTab = 'markets';
  // Seeded price history so each market's sparkline stays the same between renders
  function history(m) {
    let seed = [...m.id].reduce((a, c) => a + c.charCodeAt(0), 0), p = m.price - 12, out = [];
    for (let k = 0; k < 30; k++) { seed = (seed * 9301 + 49297) % 233280; p += (seed / 233280 - .45) * 4; out.push(Math.max(3, Math.min(97, p))); }
    out[29] = m.price;
    return out;
  }
  function spark(m) {
    const h = history(m), w = 300, ht = 64, lo = Math.min(...h) - 2, hi = Math.max(...h) + 2;
    const d = h.map((v, k) => `${k ? 'L' : 'M'}${(k / 29 * w).toFixed(1)},${(ht - (v - lo) / (hi - lo) * ht).toFixed(1)}`).join('');
    return `<svg class="spark" viewBox="0 0 ${w} ${ht}" preserveAspectRatio="none" aria-hidden="true"><path d="${d}"/></svg>`;
  }
  function tradeCard(t) {
    const m = mkt(t.mkt), cost = t.shares * t.price / 100;
    const res = t.settled ? (t.won ? `<span class="chip hit">Won ${money(t.shares)}</span>` : `<span class="chip miss">Lost ${money(cost)}</span>`) : `<span class="chip">Open</span>`;
    return `<div class="card"><div class="kv"><h3>${esc(m.q)}</h3></div>
      <div class="kv"><span>${t.side.toUpperCase()} · ${t.shares} @ ${t.price}¢</span>${res}</div>
      <div class="kv small muted"><span>Your odds ${t.est}% · crowd ${t.price}%</span><span>Max loss ${money(cost)}</span></div>
      ${t.settled ? '' : `<button class="btn ghost" data-settle="${t.id}">Settle now (demo)</button>`}</div>`;
  }
  function stats() {
    const s = S.trades.filter(t => t.settled);
    if (!s.length) return { n: 0, hit: 0, brier: 0 };
    const brier = s.reduce((a, t) => a + Math.pow(t.est / 100 - (t.outcome ? 1 : 0), 2), 0) / s.length;
    return { n: s.length, hit: s.filter(t => t.won).length / s.length, brier };
  }

  // ---------- leaderboard data ----------
  const LEAGUE = [
    { name: 'Mark', xp: 640 }, { name: 'Linda', xp: 520 }, { name: 'Dave', xp: 410 }, { name: 'Susan', xp: 330 },
    { name: 'Rick', xp: 260 }, { name: 'Karen', xp: 190 }, { name: 'Tom', xp: 120 }, { name: 'Amy', xp: 60 }
  ];
  // Fills the leaderboard after the view renders: real players of my rank from the server, topped up with
  // practice players inside the same XP band so a league always has at least 10 rows.
  async function loadBoard() {
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
  function color(name) { const h = [...name].reduce((a, c) => a + c.charCodeAt(0), 0) * 47 % 360; return `hsl(${h} 55% 48%)`; }

  // ---------- avatar ----------
  // Built from SVG parts. Colors are stored as indexes into the palettes below.
  const SKIN = ['#F6D3B3', '#E8B48C', '#C98E62', '#A0673F', '#6E4428'];
  const HAIR = ['#2B2A33', '#5A3A22', '#A0522D', '#E0A33A', '#F2E6C9', '#C9532E'];
  const SHIRT = ['#4C6FFF', '#0A6E78', '#B93C0A', '#5E6573', '#7A4FD6', '#E0A33A'];
  const BG = ['#E8EDFF', '#E1F4F5', '#FDEBDF', '#EDE6FF', '#EEF0F3', '#FFF3C4'];
  const AV_TABS = [
    { id: 'body', label: 'Body', parts: [{ k: 'body', label: 'Body type', opts: ['m', 'f'], names: ['Masculine', 'Feminine'] }, { k: 'skin', label: 'Skin tone', colors: SKIN }] },
    { id: 'hair', label: 'Hair', parts: [{ k: 'hair', label: 'Hairstyle', opts: ['none', 'short', 'quiff', 'curly', 'bun', 'long'] }, { k: 'hairColor', label: 'Hair color', colors: HAIR }] },
    { id: 'face', label: 'Face', parts: [{ k: 'eyes', label: 'Eyes', opts: ['round', 'happy', 'sleepy', 'dots'] }, { k: 'facial', label: 'Facial hair', opts: ['none', 'stubble', 'mustache', 'beard'] }] },
    { id: 'extras', label: 'Extras', parts: [{ k: 'glasses', label: 'Glasses', opts: ['none', 'round', 'square'] }] },
    { id: 'style', label: 'Style', parts: [{ k: 'shirt', label: 'Top', colors: SHIRT }, { k: 'bg', label: 'Background', colors: BG }] }
  ];
  function avatarSVG(a, cls) {
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
  function avaOf(r) { return r.me ? avatarSVG(S.avatar, 'ava') : r.avatar ? avatarSVG(r.avatar, 'ava') : `<span class="ava" style="background:${color(r.name)}">${esc(r.name[0])}</span>`; }

  function openAvatar() {
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

  // ---------- levels, comparison, badges ----------
  // 10 ranks by XP. Each step needs more XP than the one before (100, 150, 225, 325, 450, 600, 800, 1050, 1400).
  // Keep the thresholds in sync with RANK_XP in lib/auth.js (the leaderboard groups players by rank).
  const RANKS = [
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
  function level(xp) {
    let i = RANKS.length - 1; while (xp < RANKS[i].xp) i--;
    const R = RANKS[i], N = RANKS[i + 1];
    return { idx: i, name: R.name, icon: R.icon, c: R.c, min: R.xp, next: N && N.xp, nextName: N && N.name, pct: N ? Math.round((xp - R.xp) / (N.xp - R.xp) * 100) : 100 };
  }
  function openRanks() {
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
  const LEARNERS = [0, 0, 0, 0, 1, 1, 1, 1, 1, 2, 2, 2, 2, 3, 3, 3, 4, 4, 5, 6];
  const AVG_MIN = 12;
  const I = {
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
  const BADGES = [
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
  function checkBadges() {
    const fresh = BADGES.filter(b => !S.badges.includes(b.id) && b.prog().ok);
    if (!fresh.length) return;
    fresh.forEach(b => { S.badges.push(b.id); S.badgeAt[b.id] = new Date().toISOString(); }); save();
    fresh.forEach((b, i) => setTimeout(() => toast(b), i * 1800));
  }
  function tip(text) {
    const t = document.createElement('div');
    t.className = 'toast'; t.setAttribute('role', 'status');
    t.innerHTML = `<div><b>${esc(text)}</b></div>`;
    document.body.appendChild(t);
    setTimeout(() => t.remove(), 2600);
  }
  function toast(b) {
    const t = document.createElement('div');
    t.className = 'toast'; t.setAttribute('role', 'status');
    t.innerHTML = `<span class="medal sm" style="--c:${b.c}">${b.icon}</span><div><b>Badge unlocked</b><span class="small muted">${esc(b.name)}</span></div>`;
    document.body.appendChild(t);
    setTimeout(() => t.remove(), 2600);
  }

  // ---------- settings ----------
  // Theme is applied as data-theme on <html> (tokens.css has light and dark sets); 'system' follows the phone.
  function applyTheme() {
    const r = document.documentElement;
    if (S.theme === 'light' || S.theme === 'dark') r.dataset.theme = S.theme; else delete r.dataset.theme;
  }
  function renewDate() { const d = new Date(Date.now() + 18 * 864e5); return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }); }
  function openSettings() {
    let page = 'main', msg = '';
    const layer = $('#layer');
    const chev = '<span class="chev" aria-hidden="true">›</span>';
    function draw() {
      let body = '';
      if (page === 'main') body = `
        <div class="card"><h3>Appearance</h3>
          <div class="seg three" role="group" aria-label="Theme">${['system', 'light', 'dark'].map(t => `<button data-theme-set="${t}" aria-pressed="${S.theme === t}">${t[0].toUpperCase() + t.slice(1)}</button>`).join('')}</div>
          <p class="disc">System follows your phone’s light or dark mode.</p></div>
        <div class="card"><h3>Account</h3><div class="list">
          <div class="li"><span>Email</span><span class="muted">${esc(S.user ? S.user.email : S.email)}</span></div>
          <button class="li row-btn" data-page="password"><span>Change password</span>${chev}</button>
          <button class="li row-btn danger" data-logout><span>Log out</span>${chev}</button>
        </div></div>
        <div class="card"><h3>Subscription</h3><div class="list">
          <div class="li"><span>Plan</span><span class="muted">28-day plan · Beta</span></div>
          <div class="li"><span>Status</span><span class="${S.sub === 'active' ? '' : 'muted'}">${S.sub === 'active' ? `Renews ${renewDate()}` : `Canceled · access until ${renewDate()}`}</span></div>
          ${S.sub === 'active' ? `<button class="li row-btn danger" data-page="cancel"><span>Cancel subscription</span>${chev}</button>` : `<button class="li row-btn" data-resume><span>Resume subscription</span>${chev}</button>`}
        </div></div>
        <div class="card"><h3>Legal</h3><div class="list">
          <a class="li row-btn" href="/terms" target="_blank" rel="noopener"><span>Terms of Service</span>${chev}</a>
          <a class="li row-btn" href="/privacy-policy" target="_blank" rel="noopener"><span>Privacy Policy</span>${chev}</a>
        </div></div>
        ${msg ? `<p class="feedback hit" role="status">${esc(msg)}</p>` : ''}
        <p class="disc center">Oddlin beta · demo account</p>`;
      if (page === 'password') body = `
        <form class="card form" id="pwf" novalidate>
          <label>Current password<input type="password" id="pw0" autocomplete="current-password"></label>
          <label>New password<input type="password" id="pw1" autocomplete="new-password"></label>
          <label>Repeat new password<input type="password" id="pw2" autocomplete="new-password"></label>
          <p class="disc">At least 8 characters.</p>
          ${msg ? `<p class="feedback miss" role="alert">${esc(msg)}</p>` : ''}
          <button class="btn">Update password</button>
        </form>
        <p class="disc">Demo: nothing is saved. Real accounts come with the beta backend.</p>`;
      if (page === 'cancel') body = `
        <div class="card"><h3>Cancel your subscription?</h3>
          <p class="muted small">You keep access until ${renewDate()}. After that you won’t be charged again. Your progress, badges and avatar stay saved.</p>
          <button class="btn ghost" data-page="main">Keep my plan</button>
          <button class="btn danger-btn" data-cancel>Cancel subscription</button>
        </div>`;
      const title = { main: 'Settings', password: 'Change password', cancel: 'Subscription' }[page];
      layer.innerHTML = `<div class="sheet${layer.firstChild ? '' : ' enter'}" role="dialog" aria-modal="true" aria-label="${title}"><div class="sheet-in">
        <div class="av-top"><button class="x" ${page === 'main' ? 'data-close aria-label="Close">×' : 'data-page="main" aria-label="Back">‹'}</button><h3>${title}</h3><span></span></div>
        ${body}</div></div>`;
      const f = $('#pwf');
      if (f) f.onsubmit = e => {
        e.preventDefault();
        const a = $('#pw0').value, b = $('#pw1').value, c = $('#pw2').value;
        msg = !a ? 'Enter your current password.' : b.length < 8 ? 'New password needs at least 8 characters.' : b !== c ? 'New passwords don’t match.' : '';
        if (msg) return draw();
        page = 'main'; msg = 'Password updated (demo).'; draw();
      };
    }
    layer.onclick = e => {
      if (e.target.closest('[data-close]')) { layer.innerHTML = ''; layer.onclick = null; route(); return; }
      const pg = e.target.closest('[data-page]'); if (pg) { page = pg.dataset.page; msg = ''; draw(); return; }
      const th = e.target.closest('[data-theme-set]'); if (th) { S.theme = th.dataset.themeSet; applyTheme(); save(); draw(); return; }
      if (e.target.closest('[data-cancel]')) { S.sub = 'canceled'; save(); page = 'main'; msg = 'Subscription canceled. No more charges.'; draw(); return; }
      if (e.target.closest('[data-resume]')) { S.sub = 'active'; save(); msg = 'Subscription resumed.'; draw(); return; }
      if (e.target.closest('[data-logout]')) { layer.innerHTML = ''; layer.onclick = null; logout(); }
    };
    draw();
  }

  // ---------- badge detail and share image ----------
  function fmtDate(iso) { return iso ? 'Earned ' + new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : 'Earned'; }
  function openBadge(b) {
    const p = Object.assign({ got: S.badges.includes(b.id) }, b.prog());
    const layer = $('#layer');
    const pct = Math.round((p.cur || 0) / (p.goal || 1) * 100);
    layer.innerHTML = `<div class="sheet enter" role="dialog" aria-modal="true" aria-label="${esc(b.name)}"><div class="sheet-in">
      <div class="av-top"><button class="x" data-close aria-label="Close">×</button><span></span><span></span></div>
      <div class="badge-hero${p.got ? '' : ' off'}"><span class="medal xl" style="--c:${b.c}">${b.icon}</span>
        <h2>${esc(b.name)}</h2>
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
  function shareSVG(b) {
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
  function sharePNG(b) {
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

  // ---------- router ----------
  // Sections still in development: the tab stays visible with a "Soon" tag and opens a placeholder.
  const SOON = {
    ai: { icon: '\u2728', title: 'AI Coach is on its way', text: 'Your coach will review your calls, show where your odds drift from reality and answer questions about any market.' },
    sim: { icon: '\ud83d\udcc8', title: 'Simulator is on its way', text: 'Soon you\u2019ll practice on live events with play money: set your odds, see your max loss and track how your calls play out.' }
  };
  function soonView(k) {
    const x = SOON[k];
    return `<section class="view soon"><div class="soon-ic">${x.icon}</div><span class="chip">In development</span>
      <h1>${x.title}</h1><p class="muted">${x.text}</p>
      <p class="small muted">Meanwhile, keep your streak going with today\u2019s lesson.</p>
      <a class="btn" href="#/learn">Go to lessons</a></section>`;
  }
  function route() {
    const name = (location.hash.match(/^#\/(\w+)/) || [])[1];
    const v = VIEWS[name] ? name : 'learn';
    $('#view').innerHTML = SOON[v] ? soonView(v) : VIEWS[v]();
    const prof = v === 'profile' || v === 'badges', tabOf = v === 'badges' ? 'profile' : v;
    $('.mark').hidden = prof; $('.stats').hidden = prof; $('.bar-title').hidden = !prof; $('.gear').hidden = v !== 'profile';
    $('.bar-title').textContent = v === 'badges' ? 'Achievements' : 'Profile';
    document.querySelectorAll('.tabs a').forEach(a => a.dataset.tab === tabOf ? a.setAttribute('aria-current', 'page') : a.removeAttribute('aria-current'));
    const cur = v === 'learn' && nextNode(), play = $('#play');
    play.hidden = !cur;
    $('#perks').hidden = v !== 'learn'; paintPerks();
    if (cur) { play.dataset.node = cur.id; play.textContent = `Play · Level ${ALL.indexOf(cur) + 1}`; }
    if (v === 'learn') { const c = $('.lvl.current'); if (c) c.scrollIntoView({ block: 'center' }); } else window.scrollTo(0, 0);
    if (v === 'board') loadBoard();
    if (v === 'ai' && !SOON.ai) { const c = $('#chat'); c.lastElementChild && c.lastElementChild.scrollIntoView({ block: 'nearest' }); }
  }
  addEventListener('hashchange', route);

  // ---------- lesson player ----------
  // Lessons and quizzes share one player. A quiz (kind 'review') needs PASS_SHARE of answers right to count as done.
  const PASS_SHARE = .8;
  const shuffle = a => { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
  // Story-style player: tap the right part of the screen to go forward, the left part to go back.
  // Questions must be checked before moving on; answers stay locked when you come back to them.
  function openLesson(node) {
    const quiz = node.kind === 'review';
    const qs = node.steps.filter(x => x.t === 'q').length, need = Math.ceil(qs * PASS_SHARE);
    const order = node.steps.map(st => st.t === 'q' ? shuffle(st.opts.map((_, j) => j)) : null);
    const ans = {};   // step index -> the answer that settled it (quiz: any answer; lesson: the right one)
    const tried = {}; // lesson only: step index -> wrong options already tried
    const missed = {}; // lesson only: step index -> true if the first try was wrong (used for stars)
    let k = 0, picked = null, hint = false, ended = false;
    const started = Date.now();
    const layer = $('#layer');
    const wrong = () => quiz ? Object.keys(ans).filter(i => ans[i] !== node.steps[i].a).length : Object.keys(missed).length;
    function draw() {
      const st = node.steps[k], checked = ans[k] != null, sel = checked ? ans[k] : picked;
      let body = '';
      if (st.t === 'text') body = `${st.v ? `<div class="vis">${st.v}</div>` : ''}<p class="big">${esc(st.big)}</p><p class="muted">${esc(st.body)}</p>`;
      if (st.t === 'odds') body = `<p class="big">${esc(st.big)}</p><div class="card odds odds-anim">
          <div class="odds-row"><span>Crowd says</span><span class="track"><i style="width:${st.crowd}%"></i></span><b class="mono">${st.crowd}%</b></div>
          ${st.you ? `<div class="odds-row you"><span>Your read</span><span class="track"><i style="width:${st.you}%"></i></span><b class="mono">${st.you}%</b></div>` : ''}
          <span class="disc">Example · play money</span></div><p class="muted">${esc(st.body)}</p>`;
      if (st.t === 'q') {
        const answered = Object.keys(ans).length, right = answered - wrong();
        const t = tried[k] || [], again = !quiz && !checked && t.length > 0;
        body = `<p class="eyebrow">${quiz ? `Question ${k + 1} of ${qs} · ${right} right` : 'Your turn'}</p><p class="big">${esc(st.ask)}</p><div class="opts">${order[k].map(j => {
            // a quiz reveals the right answer; a lesson only marks the wrong tries and lets you pick again
            const cls = checked ? (j === st.a ? ' right' : quiz && j === sel ? ' wrong' : '') : t.includes(j) ? ' wrong shake-x' : '';
            return `<button class="opt${cls}" data-opt="${j}" aria-pressed="${sel === j}" ${checked || t.includes(j) ? 'disabled' : ''}>${esc(st.opts[j])}</button>`; }).join('')}</div>
            ${checked ? `<div class="feedback ${sel === st.a ? 'hit' : 'miss'}"><b>${sel === st.a ? (missed[k] ? 'There you go.' : 'Correct!') : 'Not quite.'}</b> ${esc(st.why)}</div>`
              : again ? `<div class="feedback miss"><b>Not quite. Try again.</b>${st.hint ? ` Hint: ${esc(st.hint)}` : ''}</div>`
              : st.hint ? (hint ? `<div class="hint-box"><b>Hint:</b> ${esc(st.hint)}</div>` : '<button class="hint-btn" data-hint>💡 Show hint</button>') : ''}`;
      }
      const needCheck = st.t === 'q' && !checked;
      const segs = node.steps.map((_, i) => `<i class="${i < k ? 'full' : i === k ? 'now' : ''}"></i>`).join('');
      layer.innerHTML = `<div class="sheet${layer.firstChild ? '' : ' enter'}" role="dialog" aria-modal="true" aria-label="${esc(node.title)}"><div class="sheet-in">
        <div class="sheet-top"><button class="x" data-close aria-label="Close">×</button><div class="segs${quiz ? ' quizbar' : ''}" role="progressbar" aria-valuenow="${k + 1}" aria-valuemax="${node.steps.length}">${segs}</div></div>
        ${quiz && k === 0 && !checked ? `<p class="chip quiz-chip">Pass mark ${need}/${qs}</p>` : ''}
        <div class="lesson-body tap">${body}</div>
        <div class="lesson-foot">
          ${st.t !== 'q' && k === 0 ? '<p class="disc center">Tap right to go on, left to go back</p>' : ''}
          <button class="btn" data-next ${needCheck && picked === null ? 'disabled' : ''}>${needCheck ? 'Check' : k === node.steps.length - 1 ? 'Finish' : 'Continue'}</button></div>
      </div></div>`;
    }
    function go(d) {
      if (ended) return;
      const st = node.steps[k];
      if (d > 0 && st.t === 'q' && ans[k] == null) return; // check first
      const nk = k + d;
      if (nk < 0) return;
      if (nk >= node.steps.length) return finish();
      k = nk; picked = null; hint = false; draw();
    }
    function finish() {
      ended = true;
      const mistakes = wrong(), right = qs - mistakes, passed = !quiz || right >= need;
      S.learnSec += Math.min(900, Math.round((Date.now() - started) / 1000)); // cap at 15 min so an idle tab doesn't count
      if (quiz) S.quizTries[node.id] = (S.quizTries[node.id] || 0) + 1;
      if (!passed) {
        touchStreak(); save();
        const free = TEST_UNLOCK || S.done.includes(node.id); // already passed once (or testing): retakes are free
        const can = free || S.balance >= QUIZ_RETAKE;
        layer.innerHTML = `<div class="sheet"><div class="sheet-in"><div class="reward lesson-body">
          <div class="burst fail">${right}/${qs}</div><h2>So close</h2>
          <p class="muted">You need ${need} of ${qs} to pass ${esc(node.title)}. ${free ? 'You already passed it, so retakes are free.' : 'Review the lessons and try again.'}</p>
        </div><div class="lesson-foot">
          <button class="btn gold" data-retake ${can ? '' : 'disabled'}>${free ? 'Retake for free' : `<span class="coin" aria-hidden="true">$</span> Retake for ${QUIZ_RETAKE}`}</button>
          ${can ? '' : `<p class="disc center">You have ${money(S.balance)}. Claim your daily bonus and gifts on the map to earn more.</p>`}
          <button class="btn ghost" data-close>Back to the map</button></div></div></div>`;
        return;
      }
      const first = !S.done.includes(node.id);
      const xp = quiz ? 50 : 30;
      if (first) { S.done.push(node.id); S.balance += LESSON_REWARD; S.xp += xp; }
      if (quiz && !mistakes) S.perfect++;
      const stars = quiz ? (right === qs ? 3 : right >= qs - 1 ? 2 : 1) : (mistakes === 0 ? 3 : mistakes === 1 ? 2 : 1);
      S.stars[node.id] = Math.max(S.stars[node.id] || 0, stars);
      touchStreak(); save(); checkBadges();
      if (first) bump('#balance');
      layer.innerHTML = `<div class="sheet"><div class="sheet-in"><div class="reward lesson-body">
        <div class="burst">${quiz ? `${right}/${qs}` : '✓'}</div>
        <p class="big-stars">${[1, 2, 3].map(i => `<i class="${i <= stars ? 'on' : ''}">★</i>`).join('')}</p>
        <h2>${esc(node.title)}: ${quiz ? 'passed' : 'done'}</h2>
        <p class="muted">${first ? `+${xp} XP · +${LESSON_REWARD} coins` : 'Nice refresher.'}</p>
        ${mistakes && !quiz ? `<p class="small muted">${mistakes} answer${mistakes > 1 ? 's' : ''} to revisit. Your coach will bring ${mistakes > 1 ? 'them' : 'it'} back.</p>` : ''}
      </div><div class="lesson-foot"><button class="btn" data-close>Continue</button></div></div></div>`;
    }
    layer.onclick = e => {
      if (e.target.closest('[data-close]')) { layer.innerHTML = ''; layer.onclick = null; route(); return; }
      if (e.target.closest('[data-retake]')) {
        if (!TEST_UNLOCK && !S.done.includes(node.id)) { if (S.balance < QUIZ_RETAKE) return; S.balance -= QUIZ_RETAKE; save(); bump('#balance'); }
        layer.innerHTML = ''; openLesson(node); return;
      }
      if (e.target.closest('[data-hint]')) { hint = true; draw(); return; }
      const o = e.target.closest('[data-opt]');
      if (o) { if (ans[k] == null) { picked = +o.dataset.opt; draw(); } return; }
      if (e.target.closest('[data-next]')) {
        const st = node.steps[k];
        if (st.t === 'q' && ans[k] == null) {
          if (quiz || picked === st.a) ans[k] = picked;
          else { (tried[k] = tried[k] || []).push(picked); missed[k] = true; picked = null; }
          draw(); return;
        }
        return go(1);
      }
      // tap zones: left third goes back, the rest goes forward
      const zone = e.target.closest('.sheet-in');
      if (zone && !e.target.closest('button, a, input')) {
        const r = layer.querySelector('.sheet-in').getBoundingClientRect();
        go(e.clientX - r.left < r.width / 3 ? -1 : 1);
      }
    };
    draw();
  }
  // A failed quiz costs coins to retake; a passed one can be replayed for free
  function startNode(node) {
    const failed = !TEST_UNLOCK && node.kind === 'review' && !S.done.includes(node.id) && (S.quizTries[node.id] || 0) > 0;
    if (!failed) return openLesson(node);
    const layer = $('#layer'), can = S.balance >= QUIZ_RETAKE;
    layer.innerHTML = `<div class="sheet enter" role="dialog" aria-modal="true" aria-label="Retake quiz"><div class="sheet-in">
      <div class="av-top"><button class="x" data-close aria-label="Close">×</button><span></span><span></span></div>
      <div class="reward lesson-body"><div class="burst">↻</div><h2>Retake ${esc(node.title)}?</h2>
        <p class="muted">10 questions, pass mark 8. A retake costs ${QUIZ_RETAKE} coins. You have ${money(S.balance)}.</p></div>
      <div class="lesson-foot"><button class="btn gold" data-pay ${can ? '' : 'disabled'}><span class="coin" aria-hidden="true">$</span> Retake for ${QUIZ_RETAKE}</button>
        ${can ? '' : '<p class="disc center">Not enough coins yet. Claim your daily bonus and gifts on the map.</p>'}</div>
    </div></div>`;
    layer.onclick = e => {
      if (e.target.closest('[data-close]')) { layer.innerHTML = ''; layer.onclick = null; return; }
      if (e.target.closest('[data-pay]') && S.balance >= QUIZ_RETAKE) { S.balance -= QUIZ_RETAKE; save(); bump('#balance'); layer.innerHTML = ''; openLesson(node); }
    };
  }

  // ---------- chest opening ----------
  // 4 taps to open. Each tap has a 40% chance to upgrade the chest one tier. The very first chest is always
  // epic (70%) or legendary (30%): the upgrades are spread over random taps so it still feels like luck.
  const TIERS = [
    { id: 'common', name: 'Common', coins: 100 },
    { id: 'rare', name: 'Rare', coins: 250 },
    { id: 'epic', name: 'Epic', coins: 500 },
    { id: 'legendary', name: 'Legendary', coins: 1000, freeze: 1 }
  ];
  const TAPS = 4, UPGRADE_CHANCE = .4;
  // startTier lets a gift start higher (the day-7 gift is an Epic chest that can still turn Legendary)
  function openChest(id, startTier = 0) {
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

  // ---------- streak calendar, daily gifts, 3-hour bonus ----------
  const SNOW = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M11 2h2v4.6l2.5-2.5 1.4 1.4L13 9.4V11h1.6l3.9-3.9 1.4 1.4L17.4 11H22v2h-4.6l2.5 2.5-1.4 1.4-3.9-3.9H13v1.6l3.9 3.9-1.4 1.4-2.5-2.5V22h-2v-4.6l-2.5 2.5-1.4-1.4 3.9-3.9V13H9.4l-3.9 3.9-1.4-1.4L6.6 13H2v-2h4.6L4.1 8.5l1.4-1.4L9.4 11H11V9.4L7.1 5.5l1.4-1.4L11 6.6z"/></svg>';
  const GIFT = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 7h-2.2A3 3 0 0 0 12 4.4 3 3 0 0 0 6.2 7H4a1 1 0 0 0-1 1v3h18V8a1 1 0 0 0-1-1zM9 7a1 1 0 1 1 1-1v1zm5 0V6a1 1 0 1 1 1 1zM4 13v6a1 1 0 0 0 1 1h6v-7zm9 7h6a1 1 0 0 0 1-1v-6h-7z"/></svg>';
  function openStreak() {
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
  function giftState() {
    if (S.gift.last && S.gift.last !== today() && S.gift.last !== addDays(today(), -1)) S.gift = { n: 0, last: null };
    if (S.gift.n >= 7 && S.gift.last !== today()) S.gift.n = 0;
    return { ready: S.gift.last !== today(), next: S.gift.n };
  }
  function openGifts() {
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
  function bonusLeft() { return Math.max(0, S.bonusAt + BONUS_EVERY - Date.now()); }
  function paintPerks() {
    const p = $('#perks'); if (!p || p.hidden) return;
    const left = bonusLeft(), g = giftState();
    const hms = ms => { const t = Math.ceil(ms / 1000); return `${Math.floor(t / 3600)}:${String(Math.floor(t / 60) % 60).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`; };
    p.querySelector('[data-bonus] .perk-l').textContent = left ? hms(left) : 'Claim';
    p.querySelector('[data-bonus]').classList.toggle('ready', !left);
    p.querySelector('[data-gifts] .perk-l').textContent = g.ready ? `Day ${g.next + 1}` : 'Tomorrow';
    p.querySelector('[data-gifts]').classList.toggle('ready', g.ready);
  }
  setInterval(paintPerks, 1000);

  // ---------- trade ticket ----------
  function openTicket(m) {
    let side = 'yes', est = m.price, amt = 25;
    const layer = $('#layer');
    function draw() {
      const price = side === 'yes' ? m.price : 100 - m.price;
      const shares = Math.floor(amt / (price / 100));
      const cost = shares * price / 100;
      const myP = side === 'yes' ? est : 100 - est;
      const edge = myP - price;
      layer.innerHTML = `<div class="sheet${layer.firstChild ? '' : ' enter'}" role="dialog" aria-modal="true" aria-label="Trade"><div class="sheet-in">
        <div class="sheet-top"><button class="x" data-close aria-label="Close">×</button><span class="small muted">${esc(m.src)} · closes ${esc(m.closes)}</span></div>
        <div class="lesson-body">
          <h2>${esc(m.q)}</h2>${spark(m)}
          <div class="card"><p class="eyebrow">1 · Your odds first</p>
            <div class="kv"><span>I think YES has a</span><b>${est}%</b></div>
            <input type="range" min="1" max="99" value="${est}" id="est" aria-label="Your odds for YES">
            <div class="odds"><div class="odds-row"><span>Crowd</span><span class="track"><i style="width:${m.price}%"></i></span><b class="mono">${m.price}%</b></div>
            <div class="odds-row you"><span>You</span><span class="track"><i style="width:${est}%"></i></span><b class="mono">${est}%</b></div></div>
          </div>
          <div class="card"><p class="eyebrow">2 · Side and size</p>
            <div class="side"><button class="yes" data-side="yes" aria-pressed="${side === 'yes'}">YES ${m.price}¢</button><button class="no" data-side="no" aria-pressed="${side === 'no'}">NO ${100 - m.price}¢</button></div>
            <div class="amounts">${[10, 25, 50, 100].map(a => `<button data-amt="${a}" aria-pressed="${a === amt}">$${a}</button>`).join('')}</div>
            <div class="kv"><span>Contracts</span><b>${shares}</b></div>
            <div class="kv"><span>Max loss</span><b>${money(cost)}</b></div>
            <div class="kv"><span>Payout if right</span><b>${money(shares)}</b></div>
            <p class="small" style="color:${edge > 0 ? 'var(--hit)' : edge < 0 ? 'var(--miss)' : 'var(--ink-muted)'}">${edge > 0 ? `Your odds are ${edge} pts above the price. The math says this side looks cheap.` : edge === 0 ? 'Your odds match the price. No edge here.' : `Your odds are ${-edge} pts below the price. The math says skip or take the other side.`}</p>
          </div>
        </div>
        <div class="lesson-foot"><button class="btn" data-buy ${cost > S.balance || !shares ? 'disabled' : ''}>Place play-money trade · ${money(cost)}</button><p class="disc">Play money only. No real money is used.</p></div>
      </div></div>`;
      $('#est').oninput = e => { est = +e.target.value; draw(); $('#est').focus(); };
    }
    layer.onclick = e => {
      if (e.target.closest('[data-close]')) { layer.innerHTML = ''; layer.onclick = null; return; }
      const s = e.target.closest('[data-side]'); if (s) { side = s.dataset.side; draw(); return; }
      const a = e.target.closest('[data-amt]'); if (a) { amt = +a.dataset.amt; draw(); return; }
      if (e.target.closest('[data-buy]')) {
        const price = side === 'yes' ? m.price : 100 - m.price;
        const shares = Math.floor(amt / (price / 100));
        S.balance -= shares * price / 100;
        S.trades.unshift({ id: 't' + Date.now(), mkt: m.id, side, est, price, shares, settled: false });
        S.xp += 10; touchStreak(); save(); bump('#balance'); checkBadges();
        layer.innerHTML = ''; layer.onclick = null; simTab = 'mine'; location.hash = '#/sim'; route();
      }
    };
    draw();
  }

  // ---------- coach (mock) ----------
  function coachReply(q) {
    const st = stats(), last = S.trades.find(t => t.settled);
    q = q.toLowerCase();
    if (q.includes('last') || q.includes('review')) {
      if (!last) return 'No settled calls yet. Place a trade in the Simulator and settle it, then I’ll walk you through it.';
      const m = mkt(last.mkt);
      return `"${m.q}" You said ${last.est}%, the crowd said ${m.price}%. It ${last.outcome ? 'happened' : 'didn’t happen'}. ${Math.abs(last.est - m.price) > 15 ? 'A gap that big needs a strong reason. What data did you use?' : 'You stayed close to the crowd, so the result says little about your edge.'}`;
    }
    if (q.includes('fed')) return 'Fed odds move on three things: the latest CPI print, the jobs report, and what Fed officials say in speeches. Lesson “Reading a Fed statement” on Day 3 covers it.';
    if (q.includes('overconfident') || q.includes('confident')) return st.n < 3 ? 'I need at least 3 settled calls to judge that. Keep going.' : `Your Brier score is ${st.brier.toFixed(2)}. ${st.brier > .25 ? 'That is worse than a coin flip: pull your odds closer to 50% when unsure.' : 'That beats a coin flip. Keep sizing small while you build a track record.'}`;
    return 'Good question. In the full version I’ll answer from your lessons and your own calls. For now, try one of the suggestions above.';
  }

  // ---------- events ----------
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
    const sg = e.target.closest('[data-seg]'); if (sg) { simTab = sg.dataset.seg; route(); return; }
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

  // ---------- sign-in gate ----------
  // Accounts are created when the quiz paywall is paid (status pending). First visit: email → 6-digit code →
  // new password → short onboarding → lesson 1. Later visits: email → password. The session token lives in localStorage.
  const TOKEN_KEY = 'oddlin_token';
  const getToken = () => { try { return localStorage.getItem(TOKEN_KEY); } catch (e) { return null; } };
  const setToken = t => { try { t ? localStorage.setItem(TOKEN_KEY, t) : localStorage.removeItem(TOKEN_KEY); } catch (e) {} };
  async function api(action, data) {
    try {
      const r = await fetch('/api/auth', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(Object.assign({ action }, data)) });
      return await r.json();
    } catch (e) { return { ok: false, error: 'network' }; }
  }
  const ERR = {
    invalid_email: 'That doesn’t look like an email address.',
    bad_code: 'That code isn’t right. Check the email and try again.',
    code_expired: 'This code has expired. Send a new one.',
    too_many_tries: 'Too many wrong tries. Send a new code.',
    weak_password: 'Use at least 8 characters.',
    wrong_password: 'Wrong email or password.',
    locked: 'Too many wrong tries. Try again in 15 minutes.',
    email_failed: 'We couldn’t send the email. Try again in a minute.',
    denied: 'This step expired. Start again with your email.',
    network: 'No connection. Check your internet and try again.'
  };
  const TOPIC_OPTS = ['The Fed', 'Inflation', 'Jobs', 'Elections', 'Economy', 'Weather'];
  const APP_PLANS = [
    { id: 'oddlin_w1', name: '1-week plan', price: 9.99, every: 'every week', days: 7 },
    { id: 'oddlin_w4', name: '4-week plan', price: 29, every: 'every 4 weeks', days: 28, popular: true },
    { id: 'oddlin_w12', name: '12-week plan', price: 69, every: 'every 12 weeks', days: 84 }
  ];
  const usd = n => '$' + (Number.isInteger(n) ? n : n.toFixed(2));
  // New-user steps in order (welcome → "I'm new"); the back button walks this list
  const NEW_FLOW = ['n0', 'n1', 'n2', 'n3', 'nplan', 'nemail'];
  const PROMO_MIN = 10; // 50% off the first payment, reserved for 10 minutes from the first look at the plans
  const LEVEL_OPTS = [['new', 'Brand new'], ['some', 'I know a bit'], ['experienced', 'I’ve traded before']];

  function gate(startStep) {
    let step = startStep || 'email', email = '', setup = '', err = '', busy = false, resendAt = 0;
    let reset = false, wrongPw = false; // reset = forgot-password flow; wrongPw shows the "Forgot password?" link
    let isNew = false, plan = 'oddlin_w4'; // isNew = signing up in the app (welcome → "I'm new")
    let promoUntil = 0, promoShown = false;
    const promoLeft = () => Math.max(0, promoUntil - Date.now());
    const firstPrice = x => promoLeft() ? Math.floor(x.price * 50) / 100 : x.price;
    const mmss = ms => { const t = Math.ceil(ms / 1000); return `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`; };
    try { email = localStorage.getItem('oddlin_signup_email') || ''; } catch (e) {}
    const prof = { name: '', topics: [], minutes: 10, level: null };
    let g = $('#gate');
    if (!g) { g = document.createElement('div'); g.id = 'gate'; document.body.appendChild(g); }
    document.body.classList.add('gated');
    const field = (id, type, ph, ac, extra = '') => `<input class="g-in" id="${id}" type="${type}" placeholder="${ph}" autocomplete="${ac}" ${extra}>`;
    function view() {
      const back = !['welcome', 'ready'].includes(step) && !step.startsWith('ob') ? '<button class="x" data-g="back" aria-label="Back">‹</button>' : '<span></span>';
      const obN = { ob1: 1, ob2: 2, ob3: 3, ob4: 4 }[step];
      const nN = NEW_FLOW.indexOf(step) + 1;
      let body = '';
      if (step === 'welcome') body = `<div class="g-hero"><img src="/assets/logo/oddlin-icon.svg" alt="" width="72" height="72"></div>
        <h1>Learn prediction markets, the safe way</h1><p class="muted">Short daily lessons and a play-money simulator on real events.</p>
        <div class="g-split"><button class="btn" data-g="new">I’m new here</button><button class="btn ghost" data-g="have">I already have an account</button></div>`;
      if (step === 'n0') body = `<h1>What should we call you?</h1><p class="muted">Your name shows on your profile and the leaderboard.</p>
        ${field('g-name', 'text', 'Your first name', 'given-name', `maxlength="40" value="${esc(prof.name)}"`)}
        <button class="btn" data-g="n0">Continue</button>`;
      if (step === 'n1') body = `<h1>What do you want to follow?</h1><p class="muted">Pick all that interest you. Your lessons and markets follow these.</p>
        <div class="g-chips">${TOPIC_OPTS.map(t => `<button class="g-chip" data-topic="${t}" aria-pressed="${prof.topics.includes(t)}">${t}</button>`).join('')}</div>
        <button class="btn" data-g="n1" ${prof.topics.length ? '' : 'disabled'}>Continue</button>`;
      if (step === 'n2') body = `<h1>How much time a day?</h1><p class="muted">Small and steady works best. You can change it later.</p>
        <div class="g-opts">${[5, 10, 15, 20].map(m => `<button class="opt" data-min="${m}" aria-pressed="${prof.minutes === m}">${m} minutes</button>`).join('')}</div>
        <button class="btn" data-g="n2">Continue</button>`;
      if (step === 'n3') body = `<h1>How well do you know prediction markets?</h1><p class="muted">No wrong answers. It helps us pace your plan.</p>
        <div class="g-opts">${LEVEL_OPTS.map(([v, l]) => `<button class="opt" data-level="${v}" aria-pressed="${prof.level === v}">${l}</button>`).join('')}</div>
        <button class="btn" data-g="n3" ${prof.level ? '' : 'disabled'}>Continue</button>`;
      if (step === 'nplan') { const P = APP_PLANS.find(x => x.id === plan), on = promoLeft() > 0; promoShown = on; body = `
        ${on ? `<div class="g-timer"><span>🎟️ 50% off your first payment</span><b id="g-tleft">${mmss(promoLeft())}</b></div>` : ''}
        <h1>${on ? `${prof.name ? esc(prof.name) + ', start' : 'Start'} your plan at 50% off` : 'Choose your plan'}</h1>
        <p class="muted">${esc(prof.topics.join(', '))} · ${prof.minutes} min a day</p>
        <div class="g-opts">${APP_PLANS.map(x => `<button class="opt g-plan" data-plan="${x.id}" aria-pressed="${plan === x.id}">
          <span><b>${x.name}</b>${x.popular ? ' <span class="chip">Most popular</span>' : ''}<br>
            <span class="small muted">${on ? `<s>${usd(x.price)}</s> ${usd(firstPrice(x))} first, then ${usd(x.price)} ${x.every}` : `${usd(x.price)} ${x.every}`}</span></span>
          <span class="g-pd"><b>${usd(+(firstPrice(x) / x.days).toFixed(2))}</b><span class="small muted">per day</span></span></button>`).join('')}</div>
        <button class="btn gold" data-g="nplan">Start my plan${on ? ` · ${usd(firstPrice(P))}` : ''}</button>
        <p class="disc">Today: ${usd(firstPrice(P))}. Renews automatically at ${usd(P.price)} ${P.every} until you cancel. Cancel anytime before the next charge. Beta: no payment is taken yet.</p>`; }
      if (step === 'nemail') body = `<h1>Create your account</h1><p class="muted">We’ll send a 6-digit code to confirm your email.</p>
        ${field('g-email', 'email', 'you@example.com', 'email', `inputmode="email" autocapitalize="off" spellcheck="false" value="${esc(email)}"`)}
        <button class="btn" data-g="nemail">Send code</button>
        <p class="disc">By continuing you confirm you’re 18 or older and agree to our <a href="/terms" target="_blank" rel="noopener">Terms</a> and <a href="/privacy-policy" target="_blank" rel="noopener">Privacy Policy</a>.</p>`;
      if (step === 'email') body = `<div class="g-hero"><img src="/assets/logo/oddlin-icon.svg" alt="" width="64" height="64"></div>
        <h1>Welcome to Oddlin</h1><p class="muted">Sign in with the email you used in the quiz.</p>
        ${field('g-email', 'email', 'you@example.com', 'email', `inputmode="email" autocapitalize="off" spellcheck="false" value="${esc(email)}"`)}
        <button class="btn" data-g="email">Continue</button>`;
      if (step === 'no_account') body = `<div class="g-hero">🔍</div><h1>No plan for this email</h1>
        <p class="muted">We couldn’t find a plan for <b>${esc(email)}</b>. Check the spelling, or take the quiz to get your plan.</p>
        <button class="btn" data-g="retry">Try another email</button><a class="btn ghost" href="/quiz">Take the quiz</a>`;
      if (step === 'code') body = `<div class="g-hero">✉️</div><h1>${reset ? 'Reset your password' : 'Check your email'}</h1>
        <p class="muted">We sent a 6-digit code to <b>${esc(email)}</b>. It works for 10 minutes.</p>
        <input class="g-in g-code" id="g-code" type="text" placeholder="000000" autocomplete="one-time-code" inputmode="numeric" maxlength="6">
        <button class="btn" data-g="code">Verify</button>
        <button class="link center" data-g="resend" ${Date.now() < resendAt ? 'disabled' : ''}>${Date.now() < resendAt ? `Send a new code in ${Math.ceil((resendAt - Date.now()) / 1000)}s` : 'Send a new code'}</button>`;
      if (step === 'newpw') body = `<div class="g-hero">🔐</div><h1>${reset ? 'Set a new password' : 'Create a password'}</h1>
        <p class="muted">${reset ? 'Use it from now on. Other devices will be signed out.' : 'Next time you’ll sign in with your email and this password.'}</p>
        ${field('g-pw1', 'password', 'New password (8+ characters)', 'new-password')}${field('g-pw2', 'password', 'Repeat password', 'new-password')}
        <button class="btn" data-g="newpw">Save password</button>`;
      if (step === 'password') body = `<div class="g-hero">👋</div><h1>Welcome back</h1>
        <p class="muted">Enter the password for <b>${esc(email)}</b>.</p>
        ${field('g-pw', 'password', 'Password', 'current-password')}
        <button class="btn" data-g="login">Sign in</button>
        ${wrongPw ? '<button class="link center" data-g="forgot">Forgot password?</button>' : ''}`;
      if (step === 'ob1') body = `<h1>What should we call you?</h1><p class="muted">Your name shows on your profile and leaderboard.</p>
        ${field('g-name', 'text', 'Your first name', 'given-name', `maxlength="40" value="${esc(prof.name)}"`)}
        <button class="btn" data-g="ob1">Continue</button>`;
      if (step === 'ob2') body = `<h1>What do you want to follow?</h1><p class="muted">Pick all that interest you. We’ll use them for your lessons and markets.</p>
        <div class="g-chips">${TOPIC_OPTS.map(t => `<button class="g-chip" data-topic="${t}" aria-pressed="${prof.topics.includes(t)}">${t}</button>`).join('')}</div>
        <button class="btn" data-g="ob2" ${prof.topics.length ? '' : 'disabled'}>Continue</button>`;
      if (step === 'ob3') body = `<h1>How much time a day?</h1><p class="muted">Small and steady works best. You can change it later.</p>
        <div class="g-opts">${[5, 10, 15, 20].map(m => `<button class="opt" data-min="${m}" aria-pressed="${prof.minutes === m}">${m} minutes</button>`).join('')}</div>
        <button class="btn" data-g="ob3">Continue</button>`;
      if (step === 'ob4') body = `<h1>How well do you know prediction markets?</h1><p class="muted">No wrong answers. It helps us pace your plan.</p>
        <div class="g-opts">${LEVEL_OPTS.map(([v, l]) => `<button class="opt" data-level="${v}" aria-pressed="${prof.level === v}">${l}</button>`).join('')}</div>
        <button class="btn" data-g="ob4" ${prof.level ? '' : 'disabled'}>Continue</button>`;
      if (step === 'ready') body = `<div class="g-hero">🚀</div><h1>You’re all set${prof.name ? ', ' + esc(prof.name) : ''}!</h1>
        <p class="muted">Your 28-day plan starts now. Lesson 1 takes about 3 minutes.</p>
        <button class="btn gold" data-g="go">Start lesson 1</button>`;
      g.innerHTML = `<div class="g-in-wrap">
        <div class="g-top">${back}${obN ? `<div class="segs">${[1, 2, 3, 4].map(i => `<i class="${i < obN ? 'full' : i === obN ? 'now' : ''}"></i>`).join('')}</div>`
          : nN ? `<div class="segs">${NEW_FLOW.map((_, i) => `<i class="${i + 1 < nN ? 'full' : i + 1 === nN ? 'now' : ''}"></i>`).join('')}</div>` : ''}</div>
        <form class="g-body" novalidate>${body}${err ? `<p class="feedback miss" role="alert">${esc(err)}</p>` : ''}</form></div>`;
      const first = g.querySelector('input'); if (first) setTimeout(() => first.focus(), 50);
    }
    const go = s => { step = s; err = ''; view(); };
    async function act(what) {
      if (busy) return; busy = true;
      const val = id => (g.querySelector('#' + id) || {}).value || '';
      try {
        if (what === 'nemail') {
          email = val('g-email').trim().toLowerCase();
          const r = await api('signup', Object.assign({ email, plan }, prof));
          if (!r.ok) { err = ERR[r.error] || 'Something went wrong. Try again.'; return view(); }
          if (r.next === 'password') { isNew = false; go('password'); tip('You already have an account. Sign in with your password.'); return; }
          resendAt = Date.now() + 60000;
          return go('code');
        }
        if (what === 'forgot') {
          const r = await api('forgot', { email });
          if (!r.ok) { err = ERR[r.error] || 'Something went wrong. Try again.'; return view(); }
          if (r.next === 'no_account') return go('no_account');
          reset = true; resendAt = Date.now() + 60000;
          return go('code');
        }
        if (what === 'email' || what === 'resend') {
          if (what === 'email') { email = val('g-email').trim().toLowerCase(); reset = false; wrongPw = false; }
          const r = await api(reset ? 'forgot' : 'start', { email });
          if (!r.ok) { err = ERR[r.error] || 'Something went wrong. Try again.'; return view(); }
          if (r.next === 'no_account') return go('no_account');
          if (r.next === 'password') return go('password');
          resendAt = Date.now() + 60000;
          if (r.cooldown && what === 'resend') { err = 'A code was just sent. Wait a minute before asking again.'; return view(); }
          return go('code');
        }
        if (what === 'code') {
          const r = await api('verify', { email, code: val('g-code') });
          if (!r.ok) { err = ERR[r.error] || 'Something went wrong.'; return view(); }
          setup = r.setup; return go('newpw');
        }
        if (what === 'newpw') {
          const a = val('g-pw1'), b = val('g-pw2');
          if (a.length < 8) { err = ERR.weak_password; return view(); }
          if (a !== b) { err = 'Passwords don’t match.'; return view(); }
          const r = await api('set_password', { email, setup, password: a });
          if (!r.ok) { err = ERR[r.error] || 'Something went wrong.'; if (r.error === 'denied') step = 'email'; return view(); }
          setToken(r.token); adopt(r.user);
          if (reset) { done(false); tip('Password updated. You’re signed in.'); return; }
          return r.user.onboarded ? done(true) : go('ob1'); // came from the quiz: profile is filled, start lesson 1
        }
        if (what === 'login') {
          const r = await api('login', { email, password: val('g-pw') });
          if (!r.ok) { err = ERR[r.error] || 'Something went wrong.'; wrongPw = true; return view(); }
          setToken(r.token); adopt(r.user);
          return r.user.onboarded ? done(false) : go('ob1');
        }
        if (what === 'ob4') {
          const r = await api('profile', Object.assign({ token: getToken() }, prof));
          if (!r.ok) { err = ERR[r.error] || 'Couldn’t save. Try again.'; return view(); }
          adopt(r.user); return go('ready');
        }
      } finally { busy = false; }
    }
    async function done(firstRun) {
      await loadProgress();
      g.innerHTML = ''; document.body.classList.remove('gated');
      location.hash = '#/learn'; route(); checkBadges();
      if (firstRun) startNode(ALL[0]); // the very first sign-in goes straight into lesson 1
    }
    g.onsubmit = e => e.preventDefault();
    g.onclick = e => {
      const t = e.target.closest('[data-topic]'); if (t) { const v = t.dataset.topic; prof.topics = prof.topics.includes(v) ? prof.topics.filter(x => x !== v) : prof.topics.concat(v); view(); return; }
      const m = e.target.closest('[data-min]'); if (m) { prof.minutes = +m.dataset.min; view(); return; }
      const l = e.target.closest('[data-level]'); if (l) { prof.level = l.dataset.level; view(); return; }
      const pl = e.target.closest('[data-plan]'); if (pl) { plan = pl.dataset.plan; view(); return; }
      const b = e.target.closest('[data-g]'); if (!b) return;
      e.preventDefault();
      const a = b.dataset.g;
      if (a === 'back') {
        if (NEW_FLOW.includes(step)) return go(NEW_FLOW.indexOf(step) ? NEW_FLOW[NEW_FLOW.indexOf(step) - 1] : 'welcome');
        if (step === 'newpw') return go('code');
        if (step === 'code') return go(reset ? 'password' : isNew ? 'nemail' : 'email');
        if (step === 'email') return go('welcome');
        return go(isNew ? 'nemail' : 'email');
      }
      if (a === 'new') { isNew = true; return go('n0'); }
      if (a === 'n0') { prof.name = (g.querySelector('#g-name').value || '').trim().slice(0, 40); return go('n1'); }
      if (a === 'have') { isNew = false; return go('email'); }
      if (a === 'n1') return go('n2');
      if (a === 'n2') return go('n3');
      if (a === 'n3') { if (!promoUntil) promoUntil = Date.now() + PROMO_MIN * 60000; return go('nplan'); }
      if (a === 'nplan') return go('nemail');
      if (a === 'retry') return go('email');
      if (a === 'ob1') { prof.name = (g.querySelector('#g-name').value || '').trim().slice(0, 40); return go('ob2'); }
      if (a === 'ob2') return go('ob3');
      if (a === 'ob3') return go('ob4');
      if (a === 'go') return done(true);
      act(a);
    };
    g.onkeydown = e => { if (e.key === 'Enter') { const b = g.querySelector('.btn[data-g]:not([disabled])'); if (b) { e.preventDefault(); b.click(); } } };
    setInterval(() => {
      if (step !== 'nplan') return;
      const t = g.querySelector('#g-tleft');
      if (promoLeft() > 0) { if (t) t.textContent = mmss(promoLeft()); }
      else if (promoShown) view(); // timer ran out: show full prices
    }, 1000);
    setInterval(() => { if (step === 'code' && resendAt > Date.now() - 1000) { const r = g.querySelector('[data-g="resend"]'); if (r) { const left = Math.ceil((resendAt - Date.now()) / 1000); r.disabled = left > 0; r.textContent = left > 0 ? `Send a new code in ${left}s` : 'Send a new code'; } } }, 1000);
    view();
  }
  // The signed-in user's profile feeds the local app state. Progress is kept per account on this device.
  function adopt(u) {
    if (!u) return;
    if (S.uid && S.uid !== u.id) { S = fresh(); }
    S.uid = u.id; S.user = u;
    if (u.name) S.name = u.name;
    if (u.topics && u.topics.length) S.topics = u.topics;
    if (u.minutes) S.minutes = u.minutes;
    try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) {}
  }
  // Server progress wins. An account with nothing saved yet takes what this device has (a fresh state for a new account).
  async function loadProgress() {
    const r = await api('progress_load', { token: getToken() });
    if (!r.ok) return;
    const u = S.user, uid = S.uid;
    if (r.data && Object.keys(r.data).length) {
      S = Object.assign(fresh(), r.data, { user: u, uid });
      if (u && u.name && (!S.name || S.name === 'You')) S.name = u.name;
      applyTheme(); settleStreak();
      try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) {}
      paintBar();
    } else { save(); pushProgress(); }
  }
  async function logout() {
    const t = getToken(); setToken(null);
    if (t) api('logout', { token: t });
    gate('welcome');
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
})();
