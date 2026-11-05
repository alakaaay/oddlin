// Vercel serverless function: POST /api/trade (simulator trades). Same logic as the local server (lib/trades.js).
const { trade } = require('../lib/trades');
const { handle } = require('../lib/vercel');

module.exports = (req, res) => handle(req, res, trade);
