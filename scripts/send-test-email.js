// Sends the welcome email to one address, to check Resend setup.
// Usage: node scripts/send-test-email.js you@example.com
// In Resend test mode (no verified domain) the address must be the email of your own Resend account.
const { loadEnv } = require('../lib/env');
const { sendMail, welcomeEmail } = require('../lib/mail');

loadEnv();
const to = process.argv[2];
if (!to) { console.error('Usage: node scripts/send-test-email.js you@example.com'); process.exit(1); }
sendMail(Object.assign({ to }, welcomeEmail(to)))
  .then(id => console.log(id === "gmail" ? "Sent through Gmail." : `Sent through Resend. id: ${id}`))
  .catch(err => { console.error(err.message); process.exit(1); });
