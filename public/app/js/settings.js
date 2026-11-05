// Settings sheet: theme, account, subscription (demo) and legal links.
import { logout } from './gate.js';
import { route } from './router.js';
import { S, save } from './state.js';
import { $, esc } from './util.js';

// Theme is applied as data-theme on <html> (tokens.css has light and dark sets); 'system' follows the phone.
export function applyTheme() {
  const r = document.documentElement;
  if (S.theme === 'light' || S.theme === 'dark') r.dataset.theme = S.theme; else delete r.dataset.theme;
}
export function renewDate() { const d = new Date(Date.now() + 18 * 864e5); return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }); }
export function openSettings() {
  let page = 'main', msg = '';
  const layer = $('#layer');
  const chev = '<span class="chev" aria-hidden="true">›</span>';
  function draw() {
    let body = '';
    if (page === 'main') body = `
      <div class="card"><h3>Appearance</h3>
        <div class="seg three" role="group" aria-label="Theme">${['system', 'light', 'dark'].map(t => `<button data-theme-set="${t}" aria-pressed="${S.theme === t}">${t[0].toUpperCase() + t.slice(1)}</button>`).join('')}</div>
        <p class="disc">System follows your phone’s light or dark mode.</p></div>
      <div class="card"><h3>Account</h3><div class="list">
        <div class="li"><span>Email</span><span class="muted">${esc(S.user ? S.user.email : S.email)}</span></div>
        <button class="li row-btn" data-page="password"><span>Change password</span>${chev}</button>
        <button class="li row-btn danger" data-logout><span>Log out</span>${chev}</button>
      </div></div>
      <div class="card"><h3>Subscription</h3><div class="list">
        <div class="li"><span>Plan</span><span class="muted">28-day plan · Beta</span></div>
        <div class="li"><span>Status</span><span class="${S.sub === 'active' ? '' : 'muted'}">${S.sub === 'active' ? `Renews ${renewDate()}` : `Canceled · access until ${renewDate()}`}</span></div>
        ${S.sub === 'active' ? `<button class="li row-btn danger" data-page="cancel"><span>Cancel subscription</span>${chev}</button>` : `<button class="li row-btn" data-resume><span>Resume subscription</span>${chev}</button>`}
      </div></div>
      <div class="card"><h3>Legal</h3><div class="list">
        <a class="li row-btn" href="/terms" target="_blank" rel="noopener"><span>Terms of Service</span>${chev}</a>
        <a class="li row-btn" href="/privacy-policy" target="_blank" rel="noopener"><span>Privacy Policy</span>${chev}</a>
      </div></div>
      ${msg ? `<p class="feedback hit" role="status">${esc(msg)}</p>` : ''}
      <p class="disc center">Oddlin beta · demo account</p>`;
    if (page === 'password') body = `
      <form class="card form" id="pwf" novalidate>
        <label>Current password<input type="password" id="pw0" autocomplete="current-password"></label>
        <label>New password<input type="password" id="pw1" autocomplete="new-password"></label>
        <label>Repeat new password<input type="password" id="pw2" autocomplete="new-password"></label>
        <p class="disc">At least 8 characters.</p>
        ${msg ? `<p class="feedback miss" role="alert">${esc(msg)}</p>` : ''}
        <button class="btn">Update password</button>
      </form>
      <p class="disc">Demo: nothing is saved. Real accounts come with the beta backend.</p>`;
    if (page === 'cancel') body = `
      <div class="card"><h3>Cancel your subscription?</h3>
        <p class="muted small">You keep access until ${renewDate()}. After that you won’t be charged again. Your progress, badges and avatar stay saved.</p>
        <button class="btn ghost" data-page="main">Keep my plan</button>
        <button class="btn danger-btn" data-cancel>Cancel subscription</button>
      </div>`;
    const title = { main: 'Settings', password: 'Change password', cancel: 'Subscription' }[page];
    layer.innerHTML = `<div class="sheet${layer.firstChild ? '' : ' enter'}" role="dialog" aria-modal="true" aria-label="${title}"><div class="sheet-in">
      <div class="av-top"><button class="x" ${page === 'main' ? 'data-close aria-label="Close">×' : 'data-page="main" aria-label="Back">‹'}</button><h3>${title}</h3><span></span></div>
      ${body}</div></div>`;
    const f = $('#pwf');
    if (f) f.onsubmit = e => {
      e.preventDefault();
      const a = $('#pw0').value, b = $('#pw1').value, c = $('#pw2').value;
      msg = !a ? 'Enter your current password.' : b.length < 8 ? 'New password needs at least 8 characters.' : b !== c ? 'New passwords don’t match.' : '';
      if (msg) return draw();
      page = 'main'; msg = 'Password updated (demo).'; draw();
    };
  }
  layer.onclick = e => {
    if (e.target.closest('[data-close]')) { layer.innerHTML = ''; layer.onclick = null; route(); return; }
    const pg = e.target.closest('[data-page]'); if (pg) { page = pg.dataset.page; msg = ''; draw(); return; }
    const th = e.target.closest('[data-theme-set]'); if (th) { S.theme = th.dataset.themeSet; applyTheme(); save(); draw(); return; }
    if (e.target.closest('[data-cancel]')) { S.sub = 'canceled'; save(); page = 'main'; msg = 'Subscription canceled. No more charges.'; draw(); return; }
    if (e.target.closest('[data-resume]')) { S.sub = 'active'; save(); msg = 'Subscription resumed.'; draw(); return; }
    if (e.target.closest('[data-logout]')) { layer.innerHTML = ''; layer.onclick = null; logout(); }
  };
  draw();
}
