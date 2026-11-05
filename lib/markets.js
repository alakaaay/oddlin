// Live prediction markets from Kalshi and Polymarket, in one shape, for the play-money simulator.
// Public read-only APIs, no keys. Sports and crypto are left out. Results are cached for 2 minutes per URL.
//
// Event:  { id, platform, title, category, volume, unit, closes, markets: [Market] }
// Market: { id, label, yes, no, yesBid, noBid, volume }   prices in dollars (0-1); yes/no = price to buy that side

const KALSHI = 'https://api.elections.kalshi.com/trade-api/v2';
const POLY = 'https://gamma-api.polymarket.com';
const TTL = 120 * 1000;

// Our categories, in display order, and how each platform maps onto them
const CATEGORIES = [
  { id: 'hot', label: 'Hot' },
  { id: 'economy', label: 'Economy' },
  { id: 'markets', label: 'Markets' },
  { id: 'politics', label: 'Politics' },
  { id: 'world', label: 'World' },
  { id: 'weather', label: 'Weather' },
  { id: 'tech', label: 'Tech & Science' },
  { id: 'culture', label: 'Culture' }
];
const KALSHI_CATS = {
  Economics: 'economy', Financials: 'markets', Politics: 'politics', Elections: 'politics', World: 'world',
  'Climate and Weather': 'weather', 'Science and Technology': 'tech', AI: 'tech', Companies: 'tech', Health: 'tech',
  Entertainment: 'culture', Social: 'culture'
};
const POLY_TAGS = {
  economy: ['economy', 'fed'], markets: ['finance'], politics: ['politics'], world: ['geopolitics'],
  weather: ['weather'], tech: ['tech', 'science'], culture: ['pop-culture']
};
const POLY_BLOCKED = new Set(['sports', 'crypto', 'crypto-prices', 'bitcoin', 'ethereum', 'solana', 'xrp', 'esports',
  'nba', 'nfl', 'nhl', 'mlb', 'soccer', 'tennis', 'golf', 'f1', 'ufc', 'boxing', 'cricket', 'games', 'memecoins']);

const kalshiCategory = c => KALSHI_CATS[c] || null;

let kalshiSeries = { series: {} };
try { kalshiSeries = require('./kalshi-series.json'); } catch (e) { /* run scripts/kalshi-series.js */ }

// ── fetch with a small in-memory cache (helps the local server and warm serverless instances) ──
const cache = new Map();
async function getJSON(url, ttl = TTL) {
  const hit = cache.get(url);
  if (hit && Date.now() - hit.at < ttl) return hit.data;
  const res = await fetch(url, { headers: { 'User-Agent': 'oddlin' }, signal: AbortSignal.timeout(10000) });
  if (!res.ok) throw Object.assign(new Error(`${res.status} ${url}`), { status: 502 });
  const data = await res.json();
  cache.set(url, { at: Date.now(), data });
  if (cache.size > 500) cache.delete(cache.keys().next().value);
  return data;
}
// Runs fn over items with at most `limit` requests at a time
async function pool(items, limit, fn) {
  const out = []; let i = 0;
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (i < items.length) { const k = i++; try { out[k] = await fn(items[k]); } catch (e) { out[k] = null; } }
  }));
  return out;
}
const num = v => { const n = Number(v); return Number.isFinite(n) ? n : null; };
const tradable = p => p != null && p >= 0.02 && p <= 0.98; // skip near-certain outcomes: nothing to learn there

// ── Kalshi ──
function kalshiMarket(m) {
  const yes = num(m.yes_ask_dollars), no = num(m.no_ask_dollars);
  if (m.status !== 'active' || !tradable(yes) || !tradable(no)) return null;
  return { id: m.ticker, label: m.yes_sub_title || m.title, yes, no, yesBid: num(m.yes_bid_dollars) || 0, noBid: num(m.no_bid_dollars) || 0, volume: num(m.volume_24h_fp) || 0 };
}
function kalshiEvent(e) {
  const cat = kalshiCategory(e.category);
  if (!cat) return null;
  const markets = (e.markets || []).map(kalshiMarket).filter(Boolean).sort((a, b) => b.yes - a.yes);
  if (!markets.length) return null;
  const closes = (e.markets || []).map(m => m.close_time).filter(Boolean).sort()[0] || null;
  return { id: e.event_ticker, platform: 'kalshi', title: e.title, category: cat, volume: markets.reduce((a, m) => a + m.volume, 0), unit: 'contracts', closes, markets };
}
async function kalshiEvents(cat) {
  const lists = kalshiSeries.series || {};
  const tickers = cat === 'hot' || cat === 'all'
    ? Object.values(lists).flatMap(l => l.slice(0, cat === 'all' ? 10 : 5))
    : (lists[cat] || []);
  const pages = await pool(tickers, 8, t => getJSON(`${KALSHI}/events?series_ticker=${encodeURIComponent(t)}&status=open&with_nested_markets=true&limit=100`));
  return pages.flatMap(p => (p && p.events) || []).map(kalshiEvent).filter(Boolean);
}

// ── Polymarket ──
const parse = s => { try { return typeof s === 'string' ? JSON.parse(s) : s; } catch (e) { return null; } };
function polyMarket(m) {
  if (!m.active || m.closed || m.acceptingOrders === false) return null;
  const prices = parse(m.outcomePrices) || [];
  const ask = num(m.bestAsk) ?? num(prices[0]), bid = num(m.bestBid) ?? num(prices[0]);
  const yes = ask, no = bid != null ? 1 - bid : null;
  if (!tradable(yes) || !tradable(no)) return null;
  return { id: String(m.id), label: m.groupItemTitle || 'Yes', yes, no, yesBid: bid || 0, noBid: ask != null ? 1 - ask : 0, volume: num(m.volume24hr) || 0 };
}
function polyCategory(tags) {
  const slugs = new Set((tags || []).map(t => t.slug));
  for (const c of CATEGORIES) if (POLY_TAGS[c.id] && POLY_TAGS[c.id].some(s => slugs.has(s))) return c.id;
  return null;
}
function polyEvent(e) {
  const slugs = (e.tags || []).map(t => t.slug);
  if (slugs.some(s => POLY_BLOCKED.has(s))) return null;
  const cat = polyCategory(e.tags);
  if (!cat) return null;
  const markets = (e.markets || []).map(polyMarket).filter(Boolean).sort((a, b) => b.yes - a.yes);
  if (!markets.length) return null;
  return { id: String(e.id), platform: 'polymarket', title: e.title, category: cat, volume: num(e.volume24hr) || markets.reduce((a, m) => a + m.volume, 0), unit: 'usd', closes: e.endDate || null, markets };
}
async function polyEvents(cat) {
  const base = `${POLY}/events?active=true&closed=false&order=volume24hr&ascending=false`;
  const urls = cat === 'hot' ? [`${base}&limit=100`] : (POLY_TAGS[cat] || []).map(t => `${base}&limit=60&tag_slug=${t}`);
  const pages = await pool(urls, 4, u => getJSON(u));
  const seen = new Set();
  return pages.flat().filter(Boolean).map(polyEvent).filter(e => e && !seen.has(e.id) && seen.add(e.id));
}
async function polySearch(q) {
  const d = await getJSON(`${POLY}/public-search?q=${encodeURIComponent(q)}&events_status=active&limit_per_type=30`);
  return (d.events || []).map(polyEvent).filter(Boolean);
}

// ── public API ──
const LIST_SIZE = 30;
// GET /api/markets?platform=kalshi|polymarket&cat=hot|economy|…&q=search
async function listMarkets(query) {
  const platform = query.platform === 'kalshi' ? 'kalshi' : 'polymarket';
  const cat = CATEGORIES.some(c => c.id === query.cat) ? query.cat : 'hot';
  const q = String(query.q || '').trim().slice(0, 80);
  let events;
  if (q) {
    const words = q.toLowerCase().split(/\s+/).filter(Boolean);
    const match = e => words.every(w => (e.title + ' ' + e.markets.map(m => m.label).join(' ')).toLowerCase().includes(w));
    events = platform === 'kalshi' ? (await kalshiEvents('all')).filter(match) : await polySearch(q);
  } else {
    events = platform === 'kalshi' ? await kalshiEvents(cat) : await polyEvents(cat);
    if (cat !== 'hot') events = events.filter(e => e.category === cat);
  }
  const seen = new Set();
  events = events.filter(e => !seen.has(e.id) && seen.add(e.id)).sort((a, b) => b.volume - a.volume).slice(0, LIST_SIZE)
    .map(e => Object.assign({}, e, { markets: e.markets.slice(0, 8) }));
  return { platform, cat, q, categories: CATEGORIES, events, updated: new Date().toISOString() };
}

// One market, fresh (no cache): live prices to open or sell a trade, and the result once it resolves.
// Returns { id, title, yes, no, yesBid, noBid, open, outcome } — outcome is true / false once resolved, else null.
async function getMarket(platform, id) {
  if (platform === 'kalshi') {
    const d = await getJSON(`${KALSHI}/markets/${encodeURIComponent(id)}`, 0);
    const m = d.market || {};
    const result = m.result === 'yes' ? true : m.result === 'no' ? false : null;
    return { id: m.ticker, title: m.title + (m.yes_sub_title && !m.title.includes(m.yes_sub_title) ? ` · ${m.yes_sub_title}` : ''),
      yes: num(m.yes_ask_dollars), no: num(m.no_ask_dollars), yesBid: num(m.yes_bid_dollars) || 0, noBid: num(m.no_bid_dollars) || 0,
      open: m.status === 'active', outcome: result,
      // context for the AI review
      rules: [m.rules_primary, m.rules_secondary].filter(Boolean).join(' ').slice(0, 1500), closes: m.close_time || null,
      volume24: num(m.volume_24h_fp) || 0, last: num(m.last_price_dollars), previous: num(m.previous_price_dollars) };
  }
  const m = await getJSON(`${POLY}/markets/${encodeURIComponent(id)}`, 0);
  const prices = (parse(m.outcomePrices) || []).map(Number);
  const resolved = m.closed && prices.length === 2 && (prices[0] >= 0.99 || prices[0] <= 0.01);
  const ask = num(m.bestAsk), bid = num(m.bestBid);
  return { id: String(m.id), title: m.question, yes: ask, no: bid != null ? 1 - bid : null, yesBid: bid || 0, noBid: ask != null ? 1 - ask : 0,
    open: !!m.active && !m.closed && m.acceptingOrders !== false, outcome: resolved ? prices[0] >= 0.99 : null,
    // context for the AI review
    rules: String(m.description || '').slice(0, 1500), closes: m.endDate || null, volume24: num(m.volume24hr) || 0,
    change1d: num(m.oneDayPriceChange), change1w: num(m.oneWeekPriceChange) };
}

module.exports = { listMarkets, getMarket, KALSHI, kalshiCategory, CATEGORIES };
