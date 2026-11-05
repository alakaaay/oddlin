// Tab screens (Learn map, AI Coach, Simulator, Leaderboard, Profile, Achievements) as HTML strings.
import { avatarSVG } from './avatar.js';
import { ALL, CHEST, COURSE, TEST_UNLOCK, UPCOMING, nextNode } from './course.js';
import { AVG_MIN, BADGES, LEARNERS, level } from './progression.js';
import { fmtDate } from './share.js';
import { boardTab } from './board.js';
import { COACH_HELLO, COACH_SUGGEST, coachBusy, coachLocked, coachMeter } from './coach.js';
import { scannerView } from './scanner.js';
import { simView, stats } from './sim.js';
import { S } from './state.js';
import { $, ICON, esc } from './util.js';

export const VIEWS = {
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
    const total = 28, doneN = COURSE.filter(d => d.nodes.every(n => S.done.includes(n.id))).length; // full days done out of the 28-day plan
    return `<section class="view">
      <div class="quest">
        <div><p class="eyebrow">28-day quest</p><h2>Prediction Markets</h2></div>
        <div class="quest-meter" aria-label="${doneN} of ${total} days done"><span>Day ${doneN}/${total}</span><i style="width:${Math.round(doneN / total * 100)}%"></i></div>
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

  // AI Tools hub: the scanner and the coach are live; arbitrage opens an explainer with a waitlist checkbox
  ai() {
    const tool = (t, i) => `<a href="${t.href}" class="tool-card ${t.cls}${t.soon ? ' soon' : ''}" style="--d:${i * 90}ms">
        <span class="tool-ic" aria-hidden="true">${t.icon}</span>
        <span class="tool-txt"><b>${t.name}</b><span class="small muted">${t.text}</span></span>
        <span class="chev" aria-hidden="true">›</span>
      </a>`;
    const tools = [
      { name: 'AI Scanner', cls: 'scan', href: '#/scanner', text: 'Daily picks where the price looks too cheap', icon: `<svg viewBox="0 0 48 48"><circle cx="24" cy="24" r="18" class="ring"/><circle cx="24" cy="24" r="11" class="ring"/><circle cx="24" cy="24" r="4" class="ring"/><path d="M24 24 L24 6 A18 18 0 0 1 39.6 15 Z" class="sweep"/><circle cx="33" cy="17" r="2.2" class="blip b1"/><circle cx="15" cy="30" r="2" class="blip b2"/></svg>` },
      { name: 'AI Arbitrage', cls: 'arb', href: '#/arbitrage', soon: true, text: 'Same event, two prices. Coming soon', icon: `<svg viewBox="0 0 48 48"><path d="M10 17h24" class="arr a1"/><path d="M28 11l6 6-6 6" class="arr a1"/><path d="M38 31H14" class="arr a2"/><path d="M20 25l-6 6 6 6" class="arr a2"/></svg>` },
      { name: 'AI Coach', cls: 'coach', href: '#/coach', text: 'Ask about any lesson or your own trades', icon: `<svg viewBox="0 0 48 48"><path d="M10 12h28a4 4 0 0 1 4 4v14a4 4 0 0 1-4 4H22l-8 7v-7h-4a4 4 0 0 1-4-4V16a4 4 0 0 1 4-4z" class="bubble"/><circle cx="17" cy="23" r="2.4" class="dot d1"/><circle cx="24" cy="23" r="2.4" class="dot d2"/><circle cx="31" cy="23" r="2.4" class="dot d3"/></svg>` }
    ];
    // Hero: a small neural net whose nodes pulse and whose links carry moving sparks
    const N = [[30, 40], [30, 90], [30, 140], [110, 25], [110, 75], [110, 125], [110, 165], [190, 55], [190, 115], [260, 85]];
    const L = [[0, 3], [0, 4], [1, 4], [1, 5], [2, 5], [2, 6], [1, 3], [3, 7], [4, 7], [4, 8], [5, 8], [6, 8], [5, 7], [7, 9], [8, 9]];
    const net = `<svg class="net" viewBox="0 0 290 190" aria-hidden="true">
      ${L.map(([a, b], i) => `<path d="M${N[a][0]} ${N[a][1]}L${N[b][0]} ${N[b][1]}" class="link" style="--d:${(i * 0.37) % 3}s"/>`).join('')}
      ${N.map(([x, y], i) => `<circle cx="${x}" cy="${y}" r="${i === 9 ? 9 : 5}" class="node${i === 9 ? ' out' : ''}" style="--d:${(i * 0.29) % 2}s"/>`).join('')}
    </svg>`;
    return `<section class="view tools">
      <div class="tools-hero">
        ${net}<span class="glow g1"></span><span class="glow g2"></span>
        <div class="tools-hero-txt"><p class="eyebrow">AI Tools</p><h1>Your AI edge</h1><p>Smart helpers that read the markets with you. Find a trade, ask your coach, more is on the way.</p></div>
      </div>
      <div class="tool-list">${tools.map(tool).join('')}</div>
      <p class="disc">Educational only, not financial advice. Oddlin never trades for you.</p>
    </section>`;
  },

  coach() {
    const st = stats();
    const chat = S.chat.length ? S.chat : [{ me: false, text: COACH_HELLO }];
    return `<section class="view">
      <a class="back-link" href="#/ai">‹ AI Tools</a>
      <div><p class="eyebrow">AI Coach</p><h1>How sharp are your odds?</h1></div>
      <div class="score">
        <div><b>${st.n}</b><span class="small muted">settled calls</span></div>
        <div><b>${st.n ? Math.round(st.hit * 100) + '%' : '–'}</b><span class="small muted">right side</span></div>
        <div><b>${st.n ? st.brier.toFixed(2) : '–'}</b><span class="small muted">Brier score</span></div>
      </div>
      <p class="disc">Brier score: 0 is perfect, 0.25 is a coin flip. Lower is better.</p>
      <div class="chat" id="chat" aria-live="polite">${chat.map(m => `<div class="msg ${m.me ? 'me' : 'coach'}">${esc(m.text)}</div>`).join('')}${coachBusy ? '<div class="msg coach typing" aria-label="Coach is typing"><i></i><i></i><i></i></div>' : ''}</div>
      <div class="sugg">${COACH_SUGGEST.map(q => `<button data-ask="${esc(q)}" ${coachLocked() ? 'disabled' : ''}>${esc(q)}</button>`).join('')}</div>
      <form class="ask" id="askf"><input id="askq" placeholder="${coachLocked() && !coachBusy ? 'Back tomorrow' : 'Ask about a lesson or your trades'}" autocomplete="off" maxlength="500" aria-label="Ask your coach" ${coachLocked() && !coachBusy ? 'disabled' : ''}><button class="btn" aria-label="Send" ${coachLocked() ? 'disabled' : ''}>↑</button></form>
      ${coachMeter()}
      <p class="disc">The coach only knows the Oddlin course and your demo trades. Educational only, not financial advice.</p>
    </section>`;
  },

  scanner() { return scannerView(); },

  // AI Arbitrage (coming soon): the idea in plain words, one example, and a "notify me" button (S.arbInterest, saved with progress)
  arbitrage() {
    const on = !!S.arbInterest;
    return `<section class="view arb-page">
      <a class="back-link" href="#/ai">‹ AI Tools</a>
      <div class="arb-hero">
        <div class="arb-hero-txt"><p class="eyebrow">AI Arbitrage <span class="tool-soon">Soon</span></p><h1>Same event, two prices</h1>
          <p>Sometimes Kalshi and Polymarket price the same question a little differently. The AI will point it out when that happens.</p></div>
      </div>
      <div class="card arb-how"><h3>How it works</h3>
        <div class="arb-ex">
          <div class="arb-leg k"><span class="small">Kalshi</span><b>YES</b><span class="arb-px">45¢</span></div>
          <span class="arb-plus" aria-hidden="true">+</span>
          <div class="arb-leg p"><span class="small">Polymarket</span><b>NO</b><span class="arb-px">50¢</span></div>
          <span class="arb-eq" aria-hidden="true">=</span>
          <div class="arb-leg t"><span class="small">Both sides</span><b>95¢</b><span class="arb-px">not $1</span></div>
        </div>
        <ol class="arb-steps">
          <li>Every event ends in YES or NO, and the right side pays $1.</li>
          <li>Here both sides together cost 95¢. That 5¢ difference is the price gap.</li>
          <li>The AI will look for these gaps and check that both sites use the same rules.</li>
        </ol>
        <p class="arb-note"><span aria-hidden="true">⚠️</span>Gaps are small, close fast and fees can eat them. If the two sites settle an event differently, both sides can lose. Practice with demo money first.</p>
      </div>
      <div class="card arb-soon"><h3>Not ready yet</h3>
        <p class="muted small">We’re building AI Arbitrage now. Want to try it first?</p>
        <button class="btn ${on ? 'ghost' : 'gold'} arb-notify" data-arb-notify ${on ? 'disabled' : ''}>${on ? '✓ You’re on the list' : 'Notify me when it’s ready'}</button>
        ${on ? '<p class="disc center">We’ll let you know in the app when it opens.</p>' : ''}
      </div>
      <p class="disc">Educational only, not financial advice.</p>
    </section>`;
  },

  // Real trading (coming soon): connect your own Kalshi / Polymarket account and trade from Oddlin for a small fee.
  // "Remind me first" is saved as S.realInterest (timestamp) with the player's progress.
  real() {
    const on = !!S.realInterest;
    const step = (n, title, text) => `<li><span class="real-n">${n}</span><span><b>${title}</b><span class="muted small">${text}</span></span></li>`;
    return `<section class="view real-page">
      <a class="back-link" href="#/sim">‹ Simulator</a>
      <div class="real-hero">
        <p class="eyebrow">Real trading <span class="tool-soon">Soon</span></p>
        <h1>Trade for real, the Oddlin way</h1>
        <p>Keep the simple screens you learned on. Your money stays in your own Kalshi or Polymarket account.</p>
      </div>
      <div class="card"><h3>How it will work</h3>
        <ol class="real-steps">
          ${step(1, 'Open an account', 'Sign up with Kalshi, Polymarket, or both, where they’re available to you.')}
          ${step(2, 'Connect it to Oddlin', 'Link your account in a few taps. Oddlin never holds your money.')}
          ${step(3, 'Trade in plain English', 'Same simple tickets as the simulator: your odds, max loss and payout before you buy.')}
          ${step(4, 'Pay a small fee', 'A small Oddlin fee per trade, always shown before you tap Buy.')}
        </ol>
      </div>
      <div class="card real-safe">
        <div><span aria-hidden="true">🔒</span><span>Your money stays with the platform, never with Oddlin.</span></div>
        <div><span aria-hidden="true">🧾</span><span>Every fee is shown up front. No hidden costs.</span></div>
        <div><span aria-hidden="true">🎓</span><span>Practice in the simulator first. Real trades can lose money.</span></div>
      </div>
      <div class="card arb-soon"><h3>Not ready yet</h3>
        <p class="muted small">We’re building real trading now. Want to be first in line?</p>
        <button class="btn ${on ? 'ghost' : 'gold'} arb-notify" data-real-notify ${on ? 'disabled' : ''}>${on ? '✓ We’ll remind you first' : 'Remind me first when it’s ready'}</button>
        ${on ? '<p class="disc center">You’ll be among the first to know, right here in the app.</p>' : ''}
      </div>
      <p class="disc">Not available yet. Educational only, not financial advice. Prediction markets involve risk of loss.</p>
    </section>`;
  },

  sim() { return simView(); },

  board() {
    const lv = level(S.xp);
    const tabs = `<div class="seg" role="group" aria-label="Leaderboard"><button data-btab="league" aria-pressed="${boardTab === 'league'}">XP league</button><button data-btab="traders" aria-pressed="${boardTab === 'traders'}">Demo traders</button></div>`;
    if (boardTab === 'traders') return `<section class="view">${tabs}
      <div><p class="eyebrow">Simulator \u00b7 <span class="demo-tag">DEMO</span> money</p><h1>Top demo traders</h1><p class="muted small">Ranked by profit from closed trades on Kalshi and Polymarket. Everyone starts with $1,000 in demo money.</p></div>
      <div id="board-rows"><p class="muted small center">Loading traders\u2026</p></div>
      <p class="disc">Demo money only, never real. Open trades count once they close.</p>
    </section>`;
    return `<section class="view">${tabs}
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
        <button class="li row-btn" data-billing><span>Subscriptions & billing</span><span class="chev" aria-hidden="true">›</span></button>
      </div></div>
      <div class="card"><h3>Ready for real markets?</h3><p class="muted small">Finish the 28 days and keep your Brier score under 0.20 first. Oddlin never holds your money or trades for you.</p></div>
    </section>`;
  }
};
