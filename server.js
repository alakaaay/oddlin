// Oddlin quiz server. Node built-ins only, no npm install.
// Serves public/ on 127.0.0.1, starting at port 3000 and moving to the next free port if it is taken.
// Usage: node server.js [--open]   (--open launches the default browser once the server is up)

const http = require('http');
const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');

const HOST = '127.0.0.1';
const FIRST_PORT = Number(process.env.PORT) || 3000;
const MAX_TRIES = 50;
const PUBLIC_DIR = path.join(__dirname, 'public');
const OPEN = process.argv.includes('--open');

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

function handle(req, res) {
  if (req.method !== 'GET' && req.method !== 'HEAD') return send(res, 405, 'Method not allowed');

  let pathname;
  try {
    pathname = decodeURIComponent(new URL(req.url, `http://${HOST}`).pathname);
  } catch {
    return send(res, 400, 'Bad request');
  }
  if (pathname.endsWith('/')) pathname += 'index.html';

  // Resolve inside public/ only: blocks ../ traversal and absolute paths
  const file = path.normalize(path.join(PUBLIC_DIR, pathname));
  if (file !== PUBLIC_DIR && !file.startsWith(PUBLIC_DIR + path.sep)) return send(res, 403, 'Forbidden');

  fs.stat(file, (err, stat) => {
    if (err) return send(res, 404, 'Not found');
    if (stat.isDirectory()) {
      res.writeHead(301, { Location: pathname + '/' });
      return res.end();
    }
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
    const url = `http://${HOST}:${port}/`;
    console.log(`Oddlin quiz is running at ${url}`);
    console.log('Press Ctrl+C to stop.');
    if (OPEN) openBrowser(url);
  });
}

listen(FIRST_PORT, MAX_TRIES);
