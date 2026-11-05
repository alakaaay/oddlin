// Vercel serverless function: POST /api/purchase (quiz paywall paid → app account). Same logic as the local server (lib/auth.js).
const { purchase } = require('../lib/auth');
const { handle } = require('../lib/vercel');

module.exports = (req, res) => handle(req, res, purchase);
