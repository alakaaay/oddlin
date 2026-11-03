// Stores one email signup. Used by server.js (local) and api/subscribe.js (Vercel).
// Where it goes:
//   - data/subscribers.jsonl, one JSON line per signup, when running locally (Vercel's disk is read-only)
//   - SUBSCRIBE_WEBHOOK_URL, if set: the same record is POSTed there (for example a Google Sheets Apps Script)

const fs = require('fs');
const path = require('path');

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const SESSION_RE = /^s_[A-Za-z0-9-]{8,64}$/;
const DATA_FILE = path.join(__dirname, '..', 'data', 'subscribers.jsonl');
const MAX_ANSWERS_CHARS = 4000;

function cleanAnswers(answers) {
  if (!answers || typeof answers !== 'object' || Array.isArray(answers)) return {};
  const out = {};
  for (const [k, v] of Object.entries(answers).slice(0, 40)) {
    const key = String(k).slice(0, 40);
    if (Array.isArray(v)) out[key] = v.slice(0, 10).map(x => String(x).slice(0, 60));
    else if (['string', 'number', 'boolean'].includes(typeof v)) out[key] = typeof v === 'string' ? v.slice(0, 120) : v;
  }
  return JSON.stringify(out).length > MAX_ANSWERS_CHARS ? {} : out;
}

async function saveSubscriber(body, meta = {}) {
  const email = String((body && body.email) || '').trim().toLowerCase();
  if (email.length > 254 || !EMAIL_RE.test(email)) return { status: 400, body: { ok: false, error: 'invalid_email' } };

  const session = String((body && body.session_id) || '');
  const record = {
    email,
    session_id: SESSION_RE.test(session) ? session : null,
    created_at: new Date().toISOString(),
    answers: cleanAnswers(body.answers),
    page: String(body.page || '').slice(0, 200),
    user_agent: String(meta.userAgent || '').slice(0, 300)
  };

  const stored = [];
  if (!process.env.VERCEL) {
    fs.mkdirSync(path.dirname(DATA_FILE), { recursive: true });
    fs.appendFileSync(DATA_FILE, JSON.stringify(record) + '\n');
    stored.push('file');
  }
  if (process.env.SUBSCRIBE_WEBHOOK_URL) {
    try {
      const res = await fetch(process.env.SUBSCRIBE_WEBHOOK_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(record)
      });
      if (res.ok) stored.push('webhook');
      else console.error(`Subscribe webhook answered ${res.status}`);
    } catch (err) {
      console.error(`Subscribe webhook failed: ${err.message}`);
    }
  }

  if (!stored.length) return { status: 503, body: { ok: false, error: 'storage_unavailable' } };
  return { status: 200, body: { ok: true } };
}

module.exports = { saveSubscriber };
