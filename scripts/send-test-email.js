// Sends one sign-in code email (with a random code that signs nobody in) to check the mail setup.
// Usage: node scripts/send-test-email.js you@example.com
const crypto = require('crypto');
const { loadEnv } = require('../lib/env');
const { sendMail } = require('../lib/mail');
const { codeEmail } = require('../lib/auth');

loadEnv();
const to = process.argv[2];
if (!to) { console.error('Usage: node scripts/send-test-email.js you@example.com'); process.exit(1); }
const code = String(crypto.randomInt(0, 1e6)).padStart(6, '0');
sendMail(Object.assign({ to }, codeEmail(code)))
  .then(id => console.log(id === 'gmail' ? 'Sent through SMTP.' : `Sent through the email API. id: ${id}`))
  .catch(err => { console.error(err.message); process.exit(1); });
