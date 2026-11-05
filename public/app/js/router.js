// Hash router for the five tabs, with placeholders for sections still in development.
import { loadBoard } from './board.js';
import { loadSim } from './sim.js';
import { ALL, nextNode } from './course.js';
import { paintPerks } from './perks.js';
import { $ } from './util.js';
import { VIEWS } from './views.js';

// Sections still in development: the tab stays visible with a "Soon" tag and opens a placeholder.
export const SOON = {
  ai: { icon: '\u2728', title: 'AI Coach is on its way', text: 'Your coach will review your calls, show where your odds drift from reality and answer questions about any market.' },
};
export function soonView(k) {
  const x = SOON[k];
  return `<section class="view soon"><div class="soon-ic">${x.icon}</div><span class="chip">In development</span>
    <h1>${x.title}</h1><p class="muted">${x.text}</p>
    <p class="small muted">Meanwhile, keep your streak going with today\u2019s lesson.</p>
    <a class="btn" href="#/learn">Go to lessons</a></section>`;
}
export function route() {
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
  if (v === 'sim') loadSim();
  if (v === 'ai' && !SOON.ai) { const c = $('#chat'); c.lastElementChild && c.lastElementChild.scrollIntoView({ block: 'nearest' }); }
}
addEventListener('hashchange', route);
