// Vercel serverless function: POST /api/review (AI review of a simulator contract). Same logic as the local server (lib/review.js).
const { review } = require('../lib/review');
const { handle } = require('../lib/vercel');

module.exports = (req, res) => handle(req, res, review);
