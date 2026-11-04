// Vercel serverless function: POST /api/event. Same logic as the local server (lib/event.js).
const { logEvent } = require('../lib/event');
const { handle } = require('../lib/vercel');

module.exports = (req, res) => handle(req, res, logEvent);
