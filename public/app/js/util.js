// Shared helpers and game constants: DOM and text helpers, local dates, prices, rewards and base icons.

export const KEY = 'oddlin_app_v1';
export const START_BALANCE = 1000;
export const SIM_START = 1000; // virtual dollars for the simulator, separate from coins
export const LESSON_REWARD = 100; // play money for finishing a lesson
export const AV_DEFAULT = { body: 'm', skin: 1, hair: 'short', hairColor: 0, eyes: 'round', facial: 'none', glasses: 'none', shirt: 0, bg: 0 };
export const $ = (s, r = document) => r.querySelector(s);
export const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const money = n => '$' + Math.round(n).toLocaleString('en-US');
// Local calendar dates as YYYY-MM-DD
export const iso = d => d.toLocaleDateString('en-CA');
export const today = () => iso(new Date());
export const addDays = (s, n) => { const d = new Date(s + 'T12:00:00'); d.setDate(d.getDate() + n); return iso(d); };
export const dayGap = (a, b) => Math.round((new Date(b + 'T12:00:00') - new Date(a + 'T12:00:00')) / 864e5);
export const MAX_FREEZE = 2, QUIZ_RETAKE = 500, BONUS_COINS = 50, BONUS_EVERY = 3 * 36e5;
// 7-day gift ladder: coins, a chest on day 5, an Epic chest plus 30 XP on day 7
export const GIFTS = [{ c: 50 }, { c: 100 }, { c: 150 }, { c: 200 }, { chest: 0 }, { c: 400 }, { chest: 2, xp: 30 }];
export const giftLabel = g => g.chest == null ? `${g.c} coins` : g.chest === 2 ? 'Epic chest' : 'Mystery chest';

export const ICON = {
  lesson: '<svg viewBox="0 0 24 24"><path d="M3 5.5A1.5 1.5 0 0 1 4.5 4H11v16l-1-1H4.5A1.5 1.5 0 0 1 3 17.5zM13 4h6.5A1.5 1.5 0 0 1 21 5.5v12a1.5 1.5 0 0 1-1.5 1.5H14l-1 1z"/></svg>',
  review: '<svg viewBox="0 0 24 24"><path d="M3 7l4.5 4L12 4l4.5 7L21 7l-2 12H5z"/></svg>',
  done: '<svg viewBox="0 0 24 24"><path d="M9.5 16.2L5 11.7l-1.6 1.6 6.1 6.1L21 7.9l-1.6-1.6z"/></svg>'
};
