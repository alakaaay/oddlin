// Sends email. Two transports, no npm packages:
//   Gmail SMTP (lib/smtp.js) when GMAIL_USER and GMAIL_APP_PASSWORD are set: works for any recipient, within Gmail's daily limit.
//   Resend HTTP API (https://resend.com/docs/api-reference/emails/send-email) when RESEND_API_KEY is set; MAIL_FROM optional.
// Gmail wins when both are configured. Secrets are server only.
// Without a verified domain Resend only allows the test sender onboarding@resend.dev, and only to the email
// address of your own Resend account. Real recipients need a verified domain first.

const { smtpSend } = require('./smtp');

const API = 'https://api.resend.com/emails';
const TEST_FROM = 'Oddlin <onboarding@resend.dev>';

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

module.exports = { sendMail, mailConfigured };
