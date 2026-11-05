// Vercel serverless function: POST /api/auth (app sign-in). Same logic as the local server (lib/auth.js).
const { auth } = require('../lib/auth');
const { handle } = require('../lib/vercel');

module.exports = (req, res) => handle(req, res, auth);
