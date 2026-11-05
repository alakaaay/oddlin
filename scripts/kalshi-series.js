// Builds lib/kalshi-series.json: the most active Kalshi series per category, by 24h volume.
// Kalshi's public API can't sort or filter events by category, and crawling every open event takes ~2 minutes,
// so the app only fetches these series. Re-run every week or two to pick up new hot series.
// Usage: node scripts/kalshi-series.js
const fs = require('fs');
const path = require('path');
const { KALSHI, kalshiCategory } = require('../lib/markets');

const PER_CATEGORY = 20;

async function get(url) {
  const res = await fetch(url, { headers: { 'User-Agent': 'oddlin' }, signal: AbortSignal.timeout(30000) });
  if (!res.ok) throw new Error(`${res.status} ${url}`);
  return res.json();
}

(async () => {
  const series = new Map(); // ticker -> { category, volume }
  let cursor = '', pages = 0;
  do {
    const d = await get(`${KALSHI}/events?status=open&limit=200&with_nested_markets=true${cursor ? `&cursor=${cursor}` : ''}`);
    for (const e of d.events || []) {
      const cat = kalshiCategory(e.category);
      if (!cat) continue; // sports, crypto and anything we don't show
      const vol = (e.markets || []).reduce((a, m) => a + (Number(m.volume_24h_fp) || 0), 0);
      const s = series.get(e.series_ticker) || { category: cat, volume: 0 };
      s.volume += vol;
      series.set(e.series_ticker, s);
    }
    cursor = d.cursor || '';
    pages++;
    process.stdout.write(`\rpages ${pages}, series ${series.size}`);
  } while (cursor);
  const byCat = {};
  for (const [ticker, s] of [...series].sort((a, b) => b[1].volume - a[1].volume)) {
    if (s.volume <= 0) continue;
    (byCat[s.category] = byCat[s.category] || []);
    if (byCat[s.category].length < PER_CATEGORY) byCat[s.category].push(ticker);
  }
  const out = { updated: new Date().toISOString().slice(0, 10), series: byCat };
  fs.writeFileSync(path.join(__dirname, '..', 'lib', 'kalshi-series.json'), JSON.stringify(out, null, 2) + '\n');
  console.log(`\nSaved ${Object.values(byCat).flat().length} series in ${Object.keys(byCat).length} categories.`);
})().catch(err => { console.error(err.message); process.exit(1); });
