// Vercel serverless function: POST /api/subscribe. Same logic as the local server (lib/subscribe.js).
const { saveSubscriber } = require('../lib/subscribe');
const { handle } = require('../lib/vercel');

module.exports = (req, res) => handle(req, res, saveSubscriber);
