// Vercel serverless function: GET /api/markets?platform=kalshi|polymarket&cat=…&q=…  (live markets for the simulator)
// The CDN keeps each answer for 2 minutes, so the platforms see one request per URL, not one per player.
const { listMarkets } = require('../lib/markets');

module.exports = async (req, res) => {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  if (req.method !== 'GET') { res.statusCode = 405; res.setHeader('Allow', 'GET'); return res.end(JSON.stringify({ ok: false, error: 'method_not_allowed' })); }
  try {
    const data = await listMarkets(req.query || {});
    res.setHeader('Cache-Control', 'public, s-maxage=120, stale-while-revalidate=600');
    res.statusCode = 200;
    res.end(JSON.stringify(Object.assign({ ok: true }, data)));
  } catch (err) {
    console.error(`/api/markets: ${err.message}`);
    res.setHeader('Cache-Control', 'no-store');
    res.statusCode = 502;
    res.end(JSON.stringify({ ok: false, error: 'markets_unavailable' }));
  }
};
