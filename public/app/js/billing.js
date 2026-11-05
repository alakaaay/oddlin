// Subscriptions and billing: the sheet with every subscription (cancel / resume) and the full charge history,
// and add-on purchases (Coach Plus, Scanner Pro / Max). Data comes from POST /api/billing.
// Beta: no payment provider yet, so charges are what the plans would bill; nothing is taken from a card.
import { getToken } from './gate.js';
import { tip } from './progression.js';
import { $, esc } from './util.js';

// Add-ons bought in the app; prices must match PRODUCTS in lib/billing.js
export const ADDONS = {
  coach_plus: { id: 'coach_plus', name: 'Coach Plus', price: 10, every: 'every 4 weeks', icon: '✨', short: '+10 AI Coach questions a day',
    text: '10 more questions to your AI Coach every day, 20 in total.', done: 'Coach Plus is on: +10 questions a day' },
  scanner_5: { id: 'scanner_5', name: 'Scanner Pro', price: 20, every: 'every 4 weeks', icon: '📡', short: '5 AI Scanner picks a day',
    text: 'See the top 5 of the AI Scanner’s daily picks instead of 1.', done: 'Scanner Pro is on: 5 picks a day' },
  scanner_10: { id: 'scanner_10', name: 'Scanner Max', price: 30, every: 'every 4 weeks', icon: '🚀', short: '10 AI Scanner picks a day',
    text: 'See all 10 of the AI Scanner’s daily picks instead of 1.', done: 'Scanner Max is on: 10 picks a day' }
};
export let billingData = null; // last answer of action "get"

async function post(body) {
  try {
    const r = await fetch('/api/billing', { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(Object.assign({ token: getToken() }, body)) });
    return await r.json();
  } catch (e) { return { ok: false, error: 'network' }; }
}
export async function loadBilling() { const r = await post({ action: 'get' }); if (r.ok) billingData = r; return r; }

const usd = n => '$' + Number(n).toFixed(2);
const day = iso => new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
const every = s => s.period_months ? (s.period_months === 1 ? 'every month' : `every ${s.period_months} months`)
  : s.period_days === 7 ? 'every week' : `every ${s.period_days / 7} weeks`;
const statusLine = s => s.status === 'active' ? `Renews ${day(s.renews_at)}`
  : s.status === 'canceled' ? `Canceled · access until ${day(s.renews_at)}` : `Ended ${day(s.renews_at)}`;

// Popup: buy an add-on. Resolves true once it is active.
export function buyAddon(id) {
  const A = ADDONS[id];
  return new Promise(resolve => {
    const m = $('#modal');
    let busy = false, err = '';
    const swap = id.startsWith('scanner_') && billingData && billingData.subscriptions.find(s => s.product.startsWith('scanner_') && s.product !== id && s.status !== 'ended');
    const draw = () => {
      m.innerHTML = `<div class="modal-back" data-no><div class="modal" role="alertdialog" aria-modal="true" aria-labelledby="m-t" aria-describedby="m-d">
        <div class="modal-ic plus-ic" aria-hidden="true">${A.icon}</div>
        <h2 id="m-t">${esc(A.name)}</h2>
        <p id="m-d" class="muted">${esc(A.text)}</p>
        <div class="modal-bal"><span>Price</span><b class="mono">${usd(A.price)} ${A.every}</b></div>
        <p class="disc">${swap ? `Replaces ${esc(swap.name)}, which stops today. ` : ''}Starts today and renews ${A.every} until you cancel. Cancel anytime in Profile → Subscriptions & billing. Beta: no payment is taken yet.</p>
        ${err ? `<p class="feedback miss" role="alert">${esc(err)}</p>` : ''}
        <button class="btn gold" data-yes ${busy ? 'disabled' : ''}>${busy ? 'Starting…' : `Get ${esc(A.name)} · ${usd(A.price)}`}</button>
        <button class="btn ghost" data-no>Not now</button></div></div>`;
    };
    const close = v => { m.innerHTML = ''; m.onclick = null; document.removeEventListener('keydown', onKey); resolve(v); };
    const onKey = e => { if (e.key === 'Escape' && !busy) close(false); };
    document.addEventListener('keydown', onKey);
    m.onclick = async e => {
      if (busy) return;
      if (e.target.closest('[data-yes]')) {
        busy = true; err = ''; draw();
        const r = await post({ action: 'buy', product: id });
        busy = false;
        if (!r.ok) { err = r.error === 'signed_out' ? 'Your session ended. Sign in again.' : 'It didn’t go through. Try again.'; return draw(); }
        await loadBilling();
        close(true); tip(A.done);
        return;
      }
      if (e.target.matches('[data-no]') || e.target.closest('button[data-no]')) close(false);
    };
    draw();
    setTimeout(() => { const b = m.querySelector('[data-yes]'); if (b) b.focus(); }, 30);
  });
}
export const buyCoachPlus = () => buyAddon('coach_plus');

// Full-screen sheet: subscriptions and charge history
export function openBilling() {
  const layer = $('#layer');
  let confirm = null, msg = '', busy = false, loading = !billingData;
  function subCard(s) {
    const asking = confirm === s.id;
    return `<div class="sub-card ${s.status}">
      <div class="kv"><b>${esc(s.name)}</b><span class="chip ${s.status === 'active' ? 'hit' : ''}">${s.status === 'active' ? 'Active' : s.status === 'canceled' ? 'Canceled' : 'Ended'}</span></div>
      <p class="small muted">${usd(s.price)} ${every(s)} · since ${day(s.started_at)}</p>
      <p class="small">${statusLine(s)}</p>
      ${asking ? `<div class="sub-ask"><p class="small">Cancel ${esc(s.name)}? You keep access until ${day(s.renews_at)}, then it stops and you won’t be charged again.</p>
          <div class="two-btn"><button class="btn ghost slim" data-keep>Keep it</button><button class="btn danger-btn slim" data-cancel-sub="${s.id}" ${busy ? 'disabled' : ''}>Cancel</button></div></div>`
        : s.status === 'active' ? `<button class="link danger" data-ask-cancel="${s.id}">Cancel subscription</button>`
        : s.status === 'canceled' ? `<button class="link" data-resume-sub="${s.id}" ${busy ? 'disabled' : ''}>Resume</button>` : ''}
    </div>`;
  }
  function draw() {
    const d = billingData, subs = d ? d.subscriptions : [], charges = d ? d.charges : [];
    const running = p => subs.some(s => s.product === p && s.status !== 'ended');
    // Offer every add-on not running; no scanner offers once any scanner plan is running
    const scanOn = running('scanner_5') || running('scanner_10');
    const offers = Object.values(ADDONS).filter(A => !running(A.id) && !(scanOn && A.id.startsWith('scanner_')));
    const total = charges.reduce((a, c) => a + Number(c.amount), 0);
    layer.innerHTML = `<div class="sheet${layer.firstChild ? '' : ' enter'}" role="dialog" aria-modal="true" aria-label="Subscriptions and billing"><div class="sheet-in">
      <div class="av-top"><button class="x" data-close aria-label="Close">×</button><h3>Subscriptions & billing</h3><span></span></div>
      ${loading ? '<p class="muted small center">Loading…</p>' : !d ? '<p class="feedback miss">Couldn’t load your billing. Try again in a minute.</p>' : `
      <div class="card"><h3>Subscriptions</h3>
        ${subs.length ? subs.map(subCard).join('') : '<p class="muted small">No subscriptions yet.</p>'}
        ${offers.map(A => `<button class="plus-offer" data-buy-addon="${A.id}"><span class="plus-ic" aria-hidden="true">${A.icon}</span>
          <span><b>${esc(A.name)}</b><span class="small muted">${esc(A.short)} · ${usd(A.price)} ${A.every}</span></span><span class="chev" aria-hidden="true">›</span></button>`).join('')}
      </div>
      <div class="card"><div class="kv"><h3>Charge history</h3>${charges.length ? `<span class="small muted">Total ${usd(total)}</span>` : ''}</div>
        ${charges.length ? `<div class="list">${charges.map(c => `<div class="li charge"><span><b>${esc(c.description)}</b><span class="small muted">${day(c.created_at)}</span></span><b class="mono">${usd(c.amount)}</b></div>`).join('')}</div>`
          : '<p class="muted small">No charges yet.</p>'}
      </div>
      ${msg ? `<p class="feedback hit" role="status">${esc(msg)}</p>` : ''}
      <p class="disc">Beta: no payment method is connected and no money is taken. The history shows what your plans would bill.</p>`}
    </div></div>`;
  }
  async function act(body, done) {
    busy = true; draw();
    const r = await post(body);
    busy = false; confirm = null;
    if (r.ok) { await loadBilling(); msg = done; } else msg = '';
    if (!r.ok) tip('That didn’t work. Try again.');
    draw();
  }
  layer.onclick = async e => {
    if (e.target.closest('[data-close]')) { layer.innerHTML = ''; layer.onclick = null; return; }
    if (busy) return;
    const ask = e.target.closest('[data-ask-cancel]'); if (ask) { confirm = +ask.dataset.askCancel; msg = ''; return draw(); }
    if (e.target.closest('[data-keep]')) { confirm = null; return draw(); }
    const c = e.target.closest('[data-cancel-sub]'); if (c) return act({ action: 'cancel', id: +c.dataset.cancelSub }, 'Canceled. You won’t be charged again.');
    const rs = e.target.closest('[data-resume-sub]'); if (rs) return act({ action: 'resume', id: +rs.dataset.resumeSub }, 'Resumed.');
    const ad = e.target.closest('[data-buy-addon]'); if (ad) { if (await buyAddon(ad.dataset.buyAddon)) { msg = `${ADDONS[ad.dataset.buyAddon].name} is on.`; draw(); } }
  };
  draw();
  loadBilling().then(() => { loading = false; if (layer.querySelector('[aria-label="Subscriptions and billing"]')) draw(); });
}
