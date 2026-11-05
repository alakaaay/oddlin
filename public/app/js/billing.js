// Subscriptions and billing: the sheet with every subscription (cancel / resume) and the full charge history,
// and the Coach Plus purchase (10 more AI Coach questions a day). Data comes from POST /api/billing.
// Beta: no payment provider yet, so charges are what the plans would bill; nothing is taken from a card.
import { getToken } from './gate.js';
import { tip } from './progression.js';
import { $, esc } from './util.js';

export const COACH_PLUS = { id: 'coach_plus', name: 'Coach Plus', price: 10, every: 'every 4 weeks', extra: 10 };
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
export const hasCoachPlus = () => !!(billingData && billingData.subscriptions.some(s => s.product === 'coach_plus' && s.status === 'active'));

// Popup: buy Coach Plus. Resolves true once it is active.
export function buyCoachPlus() {
  return new Promise(resolve => {
    const m = $('#modal');
    let busy = false, err = '';
    const draw = () => {
      m.innerHTML = `<div class="modal-back" data-no><div class="modal" role="alertdialog" aria-modal="true" aria-labelledby="m-t" aria-describedby="m-d">
        <div class="modal-ic plus-ic" aria-hidden="true">✨</div>
        <h2 id="m-t">Coach Plus</h2>
        <p id="m-d" class="muted">${COACH_PLUS.extra} more questions to your AI Coach every day, ${COACH_PLUS.extra * 2} in total.</p>
        <div class="modal-bal"><span>Price</span><b class="mono">${usd(COACH_PLUS.price)} ${COACH_PLUS.every}</b></div>
        <p class="disc">Starts today and renews ${COACH_PLUS.every} until you cancel. Cancel anytime in Profile → Subscriptions & billing. Beta: no payment is taken yet.</p>
        ${err ? `<p class="feedback miss" role="alert">${esc(err)}</p>` : ''}
        <button class="btn gold" data-yes ${busy ? 'disabled' : ''}>${busy ? 'Starting…' : `Get Coach Plus · ${usd(COACH_PLUS.price)}`}</button>
        <button class="btn ghost" data-no>Not now</button></div></div>`;
    };
    const close = v => { m.innerHTML = ''; m.onclick = null; document.removeEventListener('keydown', onKey); resolve(v); };
    const onKey = e => { if (e.key === 'Escape' && !busy) close(false); };
    document.addEventListener('keydown', onKey);
    m.onclick = async e => {
      if (busy) return;
      if (e.target.closest('[data-yes]')) {
        busy = true; err = ''; draw();
        const r = await post({ action: 'buy', product: COACH_PLUS.id });
        busy = false;
        if (!r.ok) { err = r.error === 'signed_out' ? 'Your session ended. Sign in again.' : 'It didn’t go through. Try again.'; return draw(); }
        await loadBilling();
        close(true); tip('Coach Plus is on: +10 questions a day');
        return;
      }
      if (e.target.matches('[data-no]') || e.target.closest('button[data-no]')) close(false);
    };
    draw();
    setTimeout(() => { const b = m.querySelector('[data-yes]'); if (b) b.focus(); }, 30);
  });
}

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
    const plusOn = subs.some(s => s.product === 'coach_plus' && s.status !== 'ended');
    const total = charges.reduce((a, c) => a + Number(c.amount), 0);
    layer.innerHTML = `<div class="sheet${layer.firstChild ? '' : ' enter'}" role="dialog" aria-modal="true" aria-label="Subscriptions and billing"><div class="sheet-in">
      <div class="av-top"><button class="x" data-close aria-label="Close">×</button><h3>Subscriptions & billing</h3><span></span></div>
      ${loading ? '<p class="muted small center">Loading…</p>' : !d ? '<p class="feedback miss">Couldn’t load your billing. Try again in a minute.</p>' : `
      <div class="card"><h3>Subscriptions</h3>
        ${subs.length ? subs.map(subCard).join('') : '<p class="muted small">No subscriptions yet.</p>'}
        ${plusOn ? '' : `<button class="plus-offer" data-buy-plus><span class="plus-ic" aria-hidden="true">✨</span>
          <span><b>Coach Plus</b><span class="small muted">+${COACH_PLUS.extra} AI Coach questions a day · ${usd(COACH_PLUS.price)} ${COACH_PLUS.every}</span></span><span class="chev" aria-hidden="true">›</span></button>`}
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
    if (e.target.closest('[data-buy-plus]')) { if (await buyCoachPlus()) { msg = 'Coach Plus is on.'; draw(); } }
  };
  draw();
  loadBilling().then(() => { loading = false; if (layer.querySelector('[aria-label="Subscriptions and billing"]')) draw(); });
}
