// Vercel serverless function: POST /api/coach (AI Coach chat). Same logic as the local server (lib/coach.js).
const { coach } = require('../lib/coach');
const { handle } = require('../lib/vercel');

module.exports = (req, res) => handle(req, res, coach);
