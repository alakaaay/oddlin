// Minimal SMTP client for Gmail (smtp.gmail.com:465, implicit TLS, AUTH LOGIN with an app password). Node built-ins only.
// Sends one message per connection: greeting → EHLO → AUTH → MAIL FROM → RCPT TO → DATA → QUIT.

const tls = require('tls');
const crypto = require('crypto');

const b64 = s => Buffer.from(s, 'utf8').toString('base64');
const wrap = s => s.replace(/.{1,76}/g, '$&\r\n'); // base64 bodies in 76-char lines
const encWord = s => /^[\x20-\x7e]*$/.test(s) ? s : `=?UTF-8?B?${b64(s)}?=`; // RFC 2047 for non-ASCII headers

function buildMessage({ from, fromName, to, subject, text, html }) {
  const boundary = 'b_' + crypto.randomBytes(12).toString('hex');
  const domain = from.split('@')[1] || 'localhost';
  const head = [
    `From: ${encWord(fromName || 'Oddlin')} <${from}>`,
    `To: <${to}>`,
    `Subject: ${encWord(subject)}`,
    `Date: ${new Date().toUTCString()}`,
    `Message-ID: <${crypto.randomUUID()}@${domain}>`,
    'MIME-Version: 1.0',
    `Content-Type: multipart/alternative; boundary="${boundary}"`
  ].join('\r\n');
  const part = (type, body) => `--${boundary}\r\nContent-Type: ${type}; charset=UTF-8\r\nContent-Transfer-Encoding: base64\r\n\r\n${wrap(b64(body))}`;
  return `${head}\r\n\r\n${part('text/plain', text || '')}${html ? part('text/html', html) : ''}--${boundary}--\r\n`;
}

function smtpSend({ host = 'smtp.gmail.com', port = 465, user, pass, fromName, to, subject, text, html, timeoutMs = 15000 }) {
  return new Promise((resolve, reject) => {
    const sock = tls.connect({ host, port, servername: host });
    let buf = '', waiter = null, done = false;
    const finish = err => { if (done) return; done = true; clearTimeout(timer); sock.destroy(); err ? reject(err) : resolve(); };
    const timer = setTimeout(() => finish(new Error('SMTP timeout')), timeoutMs);
    sock.on('error', finish);
    sock.on('data', d => {
      buf += d.toString('utf8');
      // a reply is complete when its last line is "NNN text" (not "NNN-text")
      const lines = buf.split('\r\n'); if (lines[lines.length - 1] !== '') return;
      const last = lines[lines.length - 2];
      if (!/^\d{3} /.test(last)) return;
      const reply = buf; buf = '';
      if (waiter) { const w = waiter; waiter = null; w(reply); }
    });
    const read = () => new Promise(r => { waiter = r; });
    const expect = async (cmd, code) => {
      if (cmd != null) sock.write(cmd + '\r\n');
      const reply = await read();
      if (!reply.startsWith(String(code))) throw new Error(`SMTP ${cmd ? cmd.split(' ')[0] : 'greeting'} failed: ${reply.trim().split('\r\n').pop().slice(0, 160)}`);
      return reply;
    };
    (async () => {
      await new Promise((res, rej) => { sock.once('secureConnect', res); sock.once('error', rej); });
      await expect(null, 220);
      await expect('EHLO oddlin', 250);
      await expect('AUTH LOGIN', 334);
      await expect(b64(user), 334);
      await expect(b64(pass), 235);
      await expect(`MAIL FROM:<${user}>`, 250);
      await expect(`RCPT TO:<${to}>`, 250);
      await expect('DATA', 354);
      const msg = buildMessage({ from: user, fromName, to, subject, text, html }).replace(/^\./gm, '..'); // dot-stuffing
      await expect(msg + '\r\n.', 250);
      sock.write('QUIT\r\n');
      finish();
    })().catch(finish);
  });
}

module.exports = { smtpSend };
