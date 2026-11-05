// Oddlin quiz server. Node built-ins only, no npm install.
// Serves public/ on 127.0.0.1, starting at port 3000 and moving to the next free port if it is taken.
// POST /api/event and POST /api/subscribe write quiz events and emails to Supabase (lib/event.js, lib/subscribe.js).
// POST /api/purchase creates the app account after the paywall; POST /api/auth signs in to /app (lib/auth.js).
// GET /api/markets lists live Kalshi / Polymarket markets; POST /api/trade runs simulator trades (lib/markets.js, lib/trades.js).
// Supabase keys come from .env.local.
// Usage: node server.js [--open]   (--open launches the default browser once the server is up)

const http = require('http');
const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');
const { loadEnv } = require('./lib/env');
const { logEvent } = require('./lib/event');
const { saveSubscriber } = require('./lib/subscribe');
const { auth, purchase } = require('./lib/auth');
const { trade } = require('./lib/trades');
const { review } = require('./lib/review');
const { coach } = require('./lib/coach');
const { listMarkets } = require('./lib/markets');

loadEnv();

const HOST = '127.0.0.1';
const FIRST_PORT = Number(process.env.PORT) || 3000;
const MAX_TRIES = 50;
const PUBLIC_DIR = path.join(__dirname, 'public');
const OPEN = process.argv.includes('--open');
const MAX_BODY = 16 * 1024;

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8'
};

function send(res, status, body, type = 'text/plain; charset=utf-8') {
  res.writeHead(status, { 'Content-Type': type, 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
  res.end(body);
}

// JSON API routes: the handler gets the parsed body and returns { status, body }
const API = {
  '/api/event': logEvent,
  '/api/subscribe': saveSubscriber,
  '/api/auth': auth,
  '/api/purchase': purchase,
  '/api/trade': trade,
  '/api/review': review,
  '/api/coach': coach
};

function api(req, res, handler) {
  if (!String(req.headers['content-type'] || '').startsWith('application/json')) return send(res, 415, 'Expected JSON');
  let raw = '';
  let tooBig = false;
  req.setEncoding('utf8');
  req.on('data', chunk => {
    raw += chunk;
    if (raw.length > MAX_BODY && !tooBig) {
      tooBig = true;
      res.writeHead(413, { 'Content-Type': TYPES['.json'], Connection: 'close' });
      res.end(JSON.stringify({ ok: false, error: 'too_large' }));
      req.pause();
    }
  });
  req.on('end', async () => {
    if (tooBig) return;
    let body;
    try { body = JSON.parse(raw); } catch { return send(res, 400, JSON.stringify({ ok: false, error: 'bad_json' }), TYPES['.json']); }
    try {
      const result = await handler(body);
      send(res, result.status, JSON.stringify(result.body), TYPES['.json']);
    } catch (err) {
      console.error(`${req.url}: ${err.message}`);
      const status = err.status || 500;
      send(res, status, JSON.stringify({ ok: false, error: status === 400 ? 'rejected' : 'server_error' }), TYPES['.json']);
    }
  });
}

// GET /api/markets: live markets for the simulator (lib/markets.js caches each upstream URL for 2 minutes)
async function markets(req, res) {
  if (req.method !== 'GET') return send(res, 405, 'Method not allowed');
  try {
    const q = Object.fromEntries(new URL(req.url, `http://${HOST}`).searchParams);
    send(res, 200, JSON.stringify(Object.assign({ ok: true }, await listMarkets(q))), TYPES['.json']);
  } catch (err) {
    console.error(`/api/markets: ${err.message}`);
    send(res, 502, JSON.stringify({ ok: false, error: 'markets_unavailable' }), TYPES['.json']);
  }
}

function handle(req, res) {
  if (req.url.split('?')[0] === '/api/markets') return markets(req, res);
  const route = API[req.url.split('?')[0]];
  if (route) return req.method === 'POST' ? api(req, res, route) : send(res, 405, 'Method not allowed');
  if (req.method !== 'GET' && req.method !== 'HEAD') return send(res, 405, 'Method not allowed');

  let pathname;
  try {
    pathname = decodeURIComponent(new URL(req.url, `http://${HOST}`).pathname);
  } catch {
    return send(res, 400, 'Bad request');
  }
  // The quiz lives at /quiz; the root redirects there and keeps the query string (UTM tags), like vercel.json does
  if (pathname === '/') {
    res.writeHead(307, { Location: '/quiz' + new URL(req.url, `http://${HOST}`).search, 'Cache-Control': 'no-store' });
    return res.end();
  }
  if (pathname.endsWith('/')) pathname += 'index.html';

  // Resolve inside public/ only: blocks ../ traversal and absolute paths
  const file = path.normalize(path.join(PUBLIC_DIR, pathname));
  if (file !== PUBLIC_DIR && !file.startsWith(PUBLIC_DIR + path.sep)) return send(res, 403, 'Forbidden');

  serveFile(req, res, file, true);
}

// A folder with index.html is served at its clean path (/terms -> public/terms/index.html), the same way Vercel does
function serveFile(req, res, file, tryIndex) {
  fs.stat(file, (err, stat) => {
    if (!err && stat.isDirectory() && tryIndex) return serveFile(req, res, path.join(file, 'index.html'), false);
    if (err || !stat.isFile()) return send(res, 404, 'Not found');
    res.writeHead(200, {
      'Content-Type': TYPES[path.extname(file).toLowerCase()] || 'application/octet-stream',
      'Content-Length': stat.size,
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff'
    });
    if (req.method === 'HEAD') return res.end();
    fs.createReadStream(file).on('error', () => res.destroy()).pipe(res);
  });
}

function openBrowser(url) {
  const cmd = process.platform === 'darwin' ? `open "${url}"`
    : process.platform === 'win32' ? `start "" "${url}"`
    : `xdg-open "${url}"`;
  exec(cmd, err => { if (err) console.log(`Open ${url} in your browser.`); });
}

function listen(port, triesLeft) {
  const server = http.createServer(handle);
  server.once('error', err => {
    if (err.code === 'EADDRINUSE' && triesLeft > 0) {
      console.log(`Port ${port} is busy, trying ${port + 1}...`);
      return listen(port + 1, triesLeft - 1);
    }
    console.error(`Could not start the server: ${err.message}`);
    process.exit(1);
  });
  server.listen(port, HOST, () => {
    const url = `http://${HOST}:${port}/quiz`;
    console.log(`Oddlin quiz is running at ${url}`);
    console.log('Press Ctrl+C to stop.');
    if (OPEN) openBrowser(url);
  });
}

listen(FIRST_PORT, MAX_TRIES);
