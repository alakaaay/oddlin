// Sends email. Two transports, no npm packages:
//   Gmail SMTP (lib/smtp.js) when GMAIL_USER and GMAIL_APP_PASSWORD are set: works for any recipient, within Gmail's daily limit.
//   Resend HTTP API (https://resend.com/docs/api-reference/emails/send-email) when RESEND_API_KEY is set; MAIL_FROM optional.
// Gmail wins when both are configured. Secrets are server only.
// Without a verified domain Resend only allows the test sender onboarding@resend.dev, and only to the email
// address of your own Resend account. Real recipients need a verified domain first.

const API = 'https://api.resend.com/emails';
const TEST_FROM = 'Oddlin <onboarding@resend.dev>';

const { smtpSend } = require('./smtp');

const gmailConfigured = () => Boolean(process.env.GMAIL_USER && process.env.GMAIL_APP_PASSWORD);
function mailConfigured() { return gmailConfigured() || Boolean(process.env.RESEND_API_KEY); }

async function sendMail({ to, subject, html, text }) {
  if (gmailConfigured()) {
    await smtpSend({ user: process.env.GMAIL_USER, pass: process.env.GMAIL_APP_PASSWORD.replace(/\s+/g, ''), fromName: 'Oddlin', to, subject, text, html });
    return 'gmail';
  }
  const key = process.env.RESEND_API_KEY;
  if (!key) throw new Error('RESEND_API_KEY is not set');
  const res = await fetch(API, {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: process.env.MAIL_FROM || TEST_FROM, to: [to], subject, html, text }),
    signal: AbortSignal.timeout(8000)
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(`Resend ${res.status}: ${data.message || data.name || 'send failed'}`);
    err.status = res.status;
    throw err;
  }
  return data.id;
}

const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// Welcome email after the quiz signup. Plain copy, no promises about earnings.
function welcomeEmail(email) {
  const subject = 'Your Oddlin plan is saved';
  const text = [
    'Hi there,',
    '',
    'Thanks for taking the Oddlin quiz. Your 28-day plan is saved.',
    '',
    'Here is what happens next:',
    '- We will email you when Oddlin launches.',
    '- Every lesson takes a few minutes a day.',
    '- You practice with play money first, so mistakes cost nothing.',
    '',
    'Quick tip for today: a 62 cent price means the market sees about a 62% chance.',
    '',
    'The Oddlin team',
    '',
    `You got this email because ${email} signed up at Oddlin.`
  ].join('\n');
  const html = `<!doctype html><html><body style="margin:0;background:#F6F7F9;font-family:Helvetica,Arial,sans-serif;color:#111318">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F6F7F9;padding:24px 12px"><tr><td align="center">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;background:#ffffff;border:1px solid #E3E6EC;border-radius:16px;overflow:hidden">
      <tr><td style="background:linear-gradient(135deg,#4C6FFF,#3B57F0);background-color:#4C6FFF;padding:28px 24px;color:#ffffff">
        <div style="font-size:13px;letter-spacing:.08em;text-transform:uppercase;opacity:.85">Oddlin</div>
        <div style="font-size:24px;font-weight:bold;line-height:1.25;margin-top:6px">Your 28-day plan is saved</div>
      </td></tr>
      <tr><td style="padding:24px;font-size:16px;line-height:1.55">
        <p style="margin:0 0 14px">Thanks for taking the quiz. Here is what happens next:</p>
        <p style="margin:0 0 8px">&#10003;&nbsp; We'll email you when Oddlin launches.</p>
        <p style="margin:0 0 8px">&#10003;&nbsp; Lessons take a few minutes a day.</p>
        <p style="margin:0 0 18px">&#10003;&nbsp; You practice with play money first, so mistakes cost nothing.</p>
        <div style="background:#E8EDFF;border-left:3px solid #4C6FFF;border-radius:10px;padding:12px 14px;font-size:15px">
          <b>Tip for today:</b> a 62&cent; price means the market sees about a 62% chance.
        </div>
        <p style="margin:20px 0 0">The Oddlin team</p>
      </td></tr>
      <tr><td style="padding:16px 24px;border-top:1px solid #E3E6EC;font-size:12px;line-height:1.5;color:#5E6573">
        You got this email because ${esc(email)} signed up at Oddlin. Oddlin is an education app and never holds your money.
      </td></tr>
    </table>
  </td></tr></table></body></html>`;
  return { subject, html, text };
}

module.exports = { sendMail, mailConfigured, welcomeEmail };
