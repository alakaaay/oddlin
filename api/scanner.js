// Vercel serverless function: POST /api/scanner (AI Scanner signals). Same logic as the local server (lib/scanner.js).
const { scanner } = require('../lib/scanner');
const { handle } = require('../lib/vercel');

module.exports = (req, res) => handle(req, res, scanner);
