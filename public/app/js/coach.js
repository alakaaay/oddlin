// AI Coach: asks POST /api/coach, which answers only about the course and the player's own simulator trades.
import { getToken } from './gate.js';
import { S } from './state.js';

export const COACH_HELLO = 'Hi! I’m your coach. Ask me about any lesson or quiz, or about your own trades in the Simulator.';
export const COACH_SUGGEST = ['Review my last trade', 'What is expected value?', 'How did my trades go?'];
export let coachBusy = false;

const ERR = {
  daily_limit: 'That’s all the questions for today. Come back tomorrow and we’ll keep going.',
  signed_out: 'Your session ended. Sign in again to keep chatting.',
  network: 'No connection. Check your internet and try again.'
};

export async function coachReply(q) {
  coachBusy = true;
  try {
    const history = S.chat.filter(m => m.text !== COACH_HELLO).slice(-6);
    const r = await fetch('/api/coach', { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: getToken(), question: q, history }) }).then(x => x.json());
    return r.ok ? r.answer : (ERR[r.error] || 'I couldn’t answer just now. Try again in a minute.');
  } catch (e) { return ERR.network; } finally { coachBusy = false; }
}
