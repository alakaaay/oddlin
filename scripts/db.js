// Runs a SQL file (or a query) against Supabase Postgres. Node built-ins only: no psql, no npm driver.
// Usage:
//   node scripts/db.js db/schema.sql          run a file (several statements allowed)
//   node scripts/db.js -c "select now()"      run one query and print the rows
// Connection: POSTGRES_URL_NON_POOLING from .env.local (or the environment). Always over TLS with SCRAM-SHA-256.
// TLS trusts db/supabase-ca.crt (Supabase → Project Settings → Database → SSL Configuration → Download certificate).

const fs = require('fs');
const path = require('path');
const net = require('net');
const tls = require('tls');
const crypto = require('crypto');
const { loadEnv } = require('../lib/env');

// ── wire protocol helpers ──────────────────────────────────────────────
const int32 = n => { const b = Buffer.alloc(4); b.writeInt32BE(n); return b; };
const cstr = s => Buffer.concat([Buffer.from(s, 'utf8'), Buffer.from([0])]);
const msg = (type, body) => Buffer.concat([Buffer.from(type), int32(body.length + 4), body]);

function startupMessage(user, database) {
  const body = Buffer.concat([int32(196608), cstr('user'), cstr(user), cstr('database'), cstr(database), cstr('client_encoding'), cstr('UTF8'), Buffer.from([0])]);
  return Buffer.concat([int32(body.length + 4), body]);
}

function parseError(payload) {
  const fields = {};
  let i = 0;
  while (i < payload.length && payload[i] !== 0) {
    const code = String.fromCharCode(payload[i]);
    const end = payload.indexOf(0, i + 1);
    fields[code] = payload.toString('utf8', i + 1, end);
    i = end + 1;
  }
  return fields;
}

// ── SCRAM-SHA-256 ───────────────────────────────────────────────────────
const hmac = (key, data) => crypto.createHmac('sha256', key).update(data).digest();
const sha256 = data => crypto.createHash('sha256').update(data).digest();

class Client {
  constructor(url) {
    this.url = new URL(url);
    this.buf = Buffer.alloc(0);
    this.waiters = [];
  }

  async connect() {
    const host = this.url.hostname, port = Number(this.url.port) || 5432;
    const raw = net.connect({ host, port });
    await new Promise((res, rej) => { raw.once('connect', res); raw.once('error', rej); });
    // SSLRequest: Postgres answers 'S' if it will speak TLS on this socket
    raw.write(Buffer.concat([int32(8), int32(80877103)]));
    const answer = await new Promise((res, rej) => { raw.once('data', d => res(d)); raw.once('error', rej); });
    if (String.fromCharCode(answer[0]) !== 'S') throw new Error('Server refused TLS');
    // Supabase signs Postgres certificates with its own root CA: trust it explicitly, never skip verification
    const caFile = path.join(__dirname, '..', 'db', 'supabase-ca.crt');
    if (!fs.existsSync(caFile)) throw new Error('db/supabase-ca.crt is missing. Download it in Supabase → Project Settings → Database → SSL Configuration');
    this.sock = tls.connect({ socket: raw, servername: host, ca: [fs.readFileSync(caFile)] });
    await new Promise((res, rej) => { this.sock.once('secureConnect', res); this.sock.once('error', rej); });
    this.sock.on('data', d => { this.buf = Buffer.concat([this.buf, d]); this.pump(); });
    this.sock.on('error', e => this.waiters.splice(0).forEach(w => w.rej(e)));

    const user = decodeURIComponent(this.url.username);
    const password = decodeURIComponent(this.url.password);
    const database = decodeURIComponent(this.url.pathname.slice(1)) || 'postgres';
    this.sock.write(startupMessage(user, database));
    await this.authenticate(password);
    await this.until('Z');
  }

  pump() {
    while (this.buf.length >= 5) {
      const len = this.buf.readInt32BE(1);
      if (this.buf.length < len + 1) return;
      const m = { type: String.fromCharCode(this.buf[0]), payload: this.buf.subarray(5, len + 1) };
      this.buf = this.buf.subarray(len + 1);
      (this.queue = this.queue || []).push(m);
    }
    while (this.queue && this.queue.length && this.waiters.length) this.waiters.shift().res(this.queue.shift());
  }

  next() {
    if (this.queue && this.queue.length) return Promise.resolve(this.queue.shift());
    return new Promise((res, rej) => this.waiters.push({ res, rej }));
  }

  async until(type) {
    for (;;) {
      const m = await this.next();
      if (m.type === 'E') throw new Error(parseError(m.payload).M);
      if (m.type === type) return m;
    }
  }

  async authenticate(password) {
    const m = await this.next();
    if (m.type === 'E') throw new Error(parseError(m.payload).M);
    const code = m.payload.readInt32BE(0);
    if (code === 0) return;
    if (code === 3) {
      // Cleartext password, used by Supabase's pooler. Safe here only because the TLS certificate was verified above.
      this.sock.write(msg('p', cstr(password)));
      const ok = await this.until('R');
      if (ok.payload.readInt32BE(0) !== 0) throw new Error('Authentication failed');
      return;
    }
    if (code !== 10) throw new Error(`Unsupported auth method ${code}; expected SCRAM-SHA-256 or password over TLS`);

    const nonce = crypto.randomBytes(18).toString('base64');
    const clientFirstBare = `n=,r=${nonce}`;
    const first = Buffer.from('n,,' + clientFirstBare);
    this.sock.write(msg('p', Buffer.concat([cstr('SCRAM-SHA-256'), int32(first.length), first])));

    const cont = await this.until('R');
    const serverFirst = cont.payload.subarray(4).toString('utf8');
    const attrs = Object.fromEntries(serverFirst.split(',').map(kv => [kv[0], kv.slice(2)]));
    if (!attrs.r.startsWith(nonce)) throw new Error('SCRAM nonce mismatch');

    const salted = crypto.pbkdf2Sync(password, Buffer.from(attrs.s, 'base64'), Number(attrs.i), 32, 'sha256');
    const clientKey = hmac(salted, 'Client Key');
    const finalNoProof = `c=biws,r=${attrs.r}`;
    const authMessage = `${clientFirstBare},${serverFirst},${finalNoProof}`;
    const signature = hmac(sha256(clientKey), authMessage);
    const proof = Buffer.from(clientKey.map((b, i) => b ^ signature[i])).toString('base64');
    this.sock.write(msg('p', Buffer.from(`${finalNoProof},p=${proof}`)));

    const fin = await this.until('R');
    const serverSig = fin.payload.subarray(4).toString('utf8').replace(/^v=/, '');
    const expected = hmac(hmac(salted, 'Server Key'), authMessage).toString('base64');
    if (serverSig !== expected) throw new Error('Server signature mismatch: refusing to continue');
    const ok = await this.until('R');
    if (ok.payload.readInt32BE(0) !== 0) throw new Error('Authentication failed');
  }

  // Simple query protocol: runs every statement in sql, returns command tags, notices and the last result set.
  async query(sql) {
    this.sock.write(msg('Q', cstr(sql)));
    const out = { tags: [], notices: [], columns: [], rows: [], error: null };
    for (;;) {
      const m = await this.next();
      if (m.type === 'C') out.tags.push(m.payload.toString('utf8', 0, m.payload.length - 1));
      else if (m.type === 'N') out.notices.push(parseError(m.payload).M);
      else if (m.type === 'E') out.error = parseError(m.payload);
      else if (m.type === 'T') {
        out.columns = []; out.rows = [];
        let i = 2;
        for (let c = 0; c < m.payload.readInt16BE(0); c++) {
          const end = m.payload.indexOf(0, i);
          out.columns.push(m.payload.toString('utf8', i, end));
          i = end + 1 + 18;
        }
      } else if (m.type === 'D') {
        const row = [];
        let i = 2;
        for (let c = 0; c < m.payload.readInt16BE(0); c++) {
          const len = m.payload.readInt32BE(i); i += 4;
          row.push(len === -1 ? null : m.payload.toString('utf8', i, i + len)); if (len > 0) i += len;
        }
        out.rows.push(row);
      } else if (m.type === 'Z') return out;
    }
  }

  end() { try { this.sock.write(msg('X', Buffer.alloc(0))); this.sock.end(); } catch {} }
}

async function main() {
  loadEnv();
  const url = process.env.POSTGRES_URL_NON_POOLING || process.env.POSTGRES_URL;
  if (!url) throw new Error('POSTGRES_URL_NON_POOLING is not set (.env.local)');
  const args = process.argv.slice(2);
  const sql = args[0] === '-c' ? args[1] : args[0] ? fs.readFileSync(args[0], 'utf8') : null;
  if (!sql) throw new Error('Usage: node scripts/db.js <file.sql> | -c "<query>"');

  const client = new Client(url);
  await client.connect();
  console.log(`Connected to ${client.url.hostname.replace(/^[^.]+/, '***')}`);
  const res = await client.query(sql);
  client.end();

  res.notices.forEach(n => console.log(`notice: ${n}`));
  if (res.tags.length) console.log(res.tags.join('\n'));
  if (res.columns.length) {
    console.log(res.columns.join(' | '));
    res.rows.forEach(r => console.log(r.map(v => v ?? 'null').join(' | ')));
  }
  if (res.error) {
    console.error(`ERROR: ${res.error.M}${res.error.P ? ` (at character ${res.error.P})` : ''}${res.error.D ? `\n${res.error.D}` : ''}`);
    process.exit(1);
  }
}

if (require.main === module) main().catch(err => { console.error(`Failed: ${err.message}`); process.exit(1); });

module.exports = { Client, loadEnv };
