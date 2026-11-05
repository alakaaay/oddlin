// AI Coach: asks POST /api/coach, which answers only about the course and the player's own simulator trades.
// Each player gets 10 questions a day, 20 with Coach Plus; the counter resets at midnight UTC.
import { getToken } from './gate.js';
import { S } from './state.js';
import { $ } from './util.js';

export const COACH_HELLO = 'Hi! I’m your coach. Ask me about any lesson or quiz, or about your own trades in the Simulator.';
export const COACH_SUGGEST = ['Review my last trade', 'What is expected value?', 'How did my trades go?'];
export let coachBusy = false;
export let coachLeft = null; // questions left today; null until the server answers
let coachLimit = 10, coachPlus = false; // today's limit and whether Coach Plus is on

const ERR = {
  daily_limit: 'That’s all your questions for today. Come back tomorrow, or get Coach Plus for 10 more a day.',
  signed_out: 'Your session ended. Sign in again to keep chatting.',
  network: 'No connection. Check your internet and try again.'
};

const post = body => fetch('/api/coach', { method: 'POST', headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(Object.assign({ token: getToken() }, body)) }).then(x => x.json());

// Local time when the daily limit resets (midnight UTC), e.g. "5:00 AM"
function resetTime() {
  const d = new Date(); d.setUTCHours(24, 0, 0, 0);
  return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
}

// The counter line under the chat input, and the input itself when nothing is left
export function coachMeter() {
  if (coachLeft == null) return '';
  const offer = coachPlus ? '' : `<button class="plus-offer slim" data-coach-plus><span class="plus-ic" aria-hidden="true">✨</span>
    <span><b>Get 10 more questions a day</b><span class="small muted">Coach Plus · $10 every 4 weeks</span></span><span class="chev" aria-hidden="true">›</span></button>`;
  if (coachLeft <= 0) return `<p class="coach-left out" id="coach-left">You’ve used all ${coachLimit} questions for today. New ones at ${resetTime()}.</p>${offer}`;
  const dots = Array.from({ length: coachLimit }, (_, i) => `<i class="${i < coachLeft ? 'on' : ''}"></i>`).join('');
  return `<p class="coach-left" id="coach-left"><span class="coach-dots" aria-hidden="true">${dots}</span>${coachLeft} of ${coachLimit} questions left today${coachPlus ? ' · Coach Plus' : ''}</p>${coachLeft <= 3 ? offer : ''}`;
}
export const coachLocked = () => coachBusy || coachLeft === 0;

// Reads how many questions are left (nothing is counted) and repaints the AI tab if it is open and the number changed
export async function loadCoachLeft(repaint) {
  try {
    const r = await post({ action: 'left' });
    if (!r.ok) return;
    const changed = r.left !== coachLeft || r.limit !== coachLimit || r.plus !== coachPlus;
    coachLeft = r.left; coachLimit = r.limit; coachPlus = r.plus;
    if (changed && $('#chat') && !coachBusy) repaint(); // repaint only on a change, so it can't loop
  } catch (e) {}
}

export async function coachReply(q) {
  coachBusy = true;
  try {
    const history = S.chat.filter(m => m.text !== COACH_HELLO).slice(-6);
    const r = await post({ question: q, history });
    if (typeof r.left === 'number') { coachLeft = r.left; coachLimit = r.limit || coachLimit; coachPlus = !!r.plus; }
    return r.ok ? r.answer : (ERR[r.error] || 'I couldn’t answer just now. Try again in a minute.');
  } catch (e) { return ERR.network; } finally { coachBusy = false; }
}
