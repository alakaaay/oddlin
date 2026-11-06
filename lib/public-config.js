// Public, non-secret settings for the browser (window.ODDLIN_CONFIG), built from env vars.
// Used by scripts/build-config.js on Vercel and by server.js locally for GET /js/config.js.
function publicConfigJS() {
  const id = String(process.env.META_PIXEL_ID || '').trim();
  const pixel = /^\d{6,20}$/.test(id) ? id : '';
  return `window.ODDLIN_CONFIG = ${JSON.stringify({ pixel })};\n`;
}

module.exports = { publicConfigJS };
