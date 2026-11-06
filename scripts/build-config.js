// Vercel build step: writes public/js/config.js with public settings taken from env vars.
// META_PIXEL_ID differs per Vercel environment (Production: the live pixel, Preview: the test pixel).
// No META_PIXEL_ID → no pixel at all, so a test never reports into the live one.
// Locally server.js serves the same file from .env.local (lib/public-config.js), nothing is written.
const fs = require('fs');
const path = require('path');
const { publicConfigJS } = require('../lib/public-config');

const out = path.join(__dirname, '..', 'public', 'js', 'config.js');
fs.writeFileSync(out, publicConfigJS());
console.log(`config.js: pixel ${process.env.META_PIXEL_ID ? 'set' : 'off'} (${process.env.VERCEL_ENV || 'local'})`);
