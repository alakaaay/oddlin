// Tab screens (Learn map, AI Coach, Simulator, Leaderboard, Profile, Achievements) as HTML strings.
import { avatarSVG } from './avatar.js';
import { ALL, CHEST, COURSE, TEST_UNLOCK, UPCOMING, nextNode } from './course.js';
import { AVG_MIN, BADGES, LEARNERS, level } from './progression.js';
import { fmtDate } from './share.js';
import { boardTab } from './board.js';
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
        <div class="li"><span>Subscription</span><span class="muted">${S.sub === 'active' ? 'Active (demo)' : 'Canceled (demo)'}</span></div>
      </div></div>
      <div class="card"><h3>Ready for real markets?</h3><p class="muted small">Finish the 28 days and keep your Brier score under 0.20 first. Oddlin never holds your money or trades for you.</p></div>
    </section>`;
  }
};
