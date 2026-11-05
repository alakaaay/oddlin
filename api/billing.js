// Vercel serverless function: POST /api/billing (subscriptions and charge history). Same logic as the local server (lib/billing.js).
const { billing } = require('../lib/billing');
const { handle } = require('../lib/vercel');

module.exports = (req, res) => handle(req, res, billing);
