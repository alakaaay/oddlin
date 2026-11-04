// Shared wrapper for Vercel functions: POST only, JSON in and out, errors mapped like the local server.
async function handle(req, res, handler) {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') {
    res.statusCode = 405;
    res.setHeader('Allow', 'POST');
    return res.end(JSON.stringify({ ok: false, error: 'method_not_allowed' }));
  }
  let body = req.body;
  if (typeof body === 'string') {
    try { body = JSON.parse(body); } catch { body = null; }
  }
  try {
    const result = await handler(body || {});
    res.statusCode = result.status;
    res.end(JSON.stringify(result.body));
  } catch (err) {
    console.error(`${req.url}: ${err.message}`);
    res.statusCode = err.status || 500;
    res.end(JSON.stringify({ ok: false, error: res.statusCode === 400 ? 'rejected' : 'server_error' }));
  }
}

module.exports = { handle };
