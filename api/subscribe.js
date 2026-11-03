// Vercel serverless function: POST /api/subscribe. Same logic as the local server.
// On Vercel, set SUBSCRIBE_WEBHOOK_URL in Project Settings → Environment Variables, or signups have nowhere to go.

const { saveSubscriber } = require('../lib/subscribe');

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    res.statusCode = 405;
    res.setHeader('Allow', 'POST');
    return res.end();
  }
  let body = req.body;
  if (typeof body === 'string') {
    try { body = JSON.parse(body); } catch { body = {}; }
  }
  const result = await saveSubscriber(body || {}, { userAgent: req.headers['user-agent'] });
  res.statusCode = result.status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(result.body));
};
