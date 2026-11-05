// AI Coach (in development): canned replies built from the player's own calls.
import { stats } from './sim.js';
import { S } from './state.js';

export function coachReply(q) {
  const st = stats(), last = S.trades.find(t => t.settled);
  q = q.toLowerCase();
  if (q.includes('last') || q.includes('review')) {
    if (!last) return 'No settled calls yet. Place a trade in the Simulator and settle it, then I’ll walk you through it.';
    const crowd = Math.round(last.price * 100);
    return `"${last.title}" You said ${last.est}%, the crowd said ${crowd}%. It ${last.outcome ? 'happened' : 'didn’t happen'}. ${Math.abs(last.est - crowd) > 15 ? 'A gap that big needs a strong reason. What data did you use?' : 'You stayed close to the crowd, so the result says little about your edge.'}`;
  }
  if (q.includes('fed')) return 'Fed odds move on three things: the latest CPI print, the jobs report, and what Fed officials say in speeches. Lesson “Reading a Fed statement” on Day 3 covers it.';
  if (q.includes('overconfident') || q.includes('confident')) return st.n < 3 ? 'I need at least 3 settled calls to judge that. Keep going.' : `Your Brier score is ${st.brier.toFixed(2)}. ${st.brier > .25 ? 'That is worse than a coin flip: pull your odds closer to 50% when unsure.' : 'That beats a coin flip. Keep sizing small while you build a track record.'}`;
  return 'Good question. In the full version I’ll answer from your lessons and your own calls. For now, try one of the suggestions above.';
}
