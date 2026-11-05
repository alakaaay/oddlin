// Lesson and quiz player, quiz retakes and the coin-spend consent popup.
import { TEST_UNLOCK } from './course.js';
import { checkBadges } from './progression.js';
import { route } from './router.js';
import { S, bump, save, touchStreak } from './state.js';
import { $, LESSON_REWARD, QUIZ_RETAKE, esc, money } from './util.js';

// Lessons and quizzes share one player. A quiz (kind 'review') needs PASS_SHARE of answers right to count as done.
export const PASS_SHARE = .8;
export const shuffle = a => { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
// Story-style player: tap the right part of the screen to go forward, the left part to go back.
// Questions must be checked before moving on; answers stay locked when you come back to them.
export function openLesson(node) {
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
      if (TEST_UNLOCK || S.done.includes(node.id)) { layer.innerHTML = ''; openLesson(node); return; }
      payRetake(node); return;
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
// A failed quiz costs coins to retake (after the player agrees in a popup); a passed one can be replayed for free
export function startNode(node) {
  const failed = !TEST_UNLOCK && node.kind === 'review' && !S.done.includes(node.id) && (S.quizTries[node.id] || 0) > 0;
  if (!failed) return openLesson(node);
  payRetake(node);
}
export async function payRetake(node) {
  const ok = await confirmCoins({
    title: `You didn’t pass ${node.title} yet`,
    text: `A retake costs ${QUIZ_RETAKE} coins. You need 8 of 10 to pass.`,
    cost: QUIZ_RETAKE,
    action: `Spend ${QUIZ_RETAKE} coins and retake`
  });
  if (!ok || S.balance < QUIZ_RETAKE) return;
  S.balance -= QUIZ_RETAKE; save(); bump('#balance');
  $('#layer').innerHTML = ''; openLesson(node);
}
// Consent popup before spending coins. Resolves true only when the player taps the spend button.
export function confirmCoins({ title, text, cost, action }) {
  return new Promise(resolve => {
    const m = $('#modal'), can = S.balance >= cost;
    m.innerHTML = `<div class="modal-back" data-no><div class="modal" role="alertdialog" aria-modal="true" aria-labelledby="m-t" aria-describedby="m-d">
      <div class="modal-ic"><span class="coin">$</span></div>
      <h2 id="m-t">${esc(title)}</h2><p id="m-d" class="muted">${esc(text)}</p>
      <div class="modal-bal"><span>Your coins</span><b class="mono">${money(S.balance)}${can ? ` → ${money(S.balance - cost)}` : ''}</b></div>
      ${can ? '' : `<p class="feedback miss">You need ${money(cost - S.balance)} more. Claim your daily bonus and gifts on the map.</p>`}
      <button class="btn gold" data-yes ${can ? '' : 'disabled'}>${esc(action)}</button>
      <button class="btn ghost" data-no>Not now</button></div></div>`;
    const close = v => { m.innerHTML = ''; m.onclick = null; document.removeEventListener('keydown', onKey); resolve(v); };
    const onKey = e => { if (e.key === 'Escape') close(false); };
    document.addEventListener('keydown', onKey);
    m.onclick = e => {
      if (e.target.closest('[data-yes]') && can) return close(true);
      if (e.target.matches('[data-no]') || e.target.closest('button[data-no]')) close(false);
    };
    setTimeout(() => { const b = m.querySelector('[data-yes]:not([disabled])') || m.querySelector('button[data-no]'); if (b) b.focus(); }, 30);
  });
}
