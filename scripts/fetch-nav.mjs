/**
 * Fetches NAV data from SEC Thailand API, calculates MACD,
 * saves JSON to public/data/, and sends Telegram notifications.
 *
 * Secrets required (GitHub Actions):
 *   SEC_API_KEY         - from https://apiportal.sec.or.th/
 *   TELEGRAM_BOT_TOKEN  - from @BotFather
 *   TELEGRAM_CHAT_ID    - your chat/group ID
 */

import { writeFileSync, mkdirSync, existsSync, readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const DATA_DIR = join(ROOT, 'public', 'data');

// ── Config ────────────────────────────────────────────────────────────────────
const FUNDS = [
  { code: 'LHESPORT-D',     name: 'LH E-Sport' },
  { code: 'LHSEMICON-D',    name: 'LH Semiconductor' },
  { code: 'K-GOLD-A(D)',    name: 'K Gold A' },
  { code: 'ONE-GLOBFIN-RD', name: 'ONE Global Finance' },
  { code: 'K-GLOBE',        name: 'K Globe' },
  { code: 'K-USXNDQ-A(D)',  name: 'K US NASDAQ A' },
  { code: 'SCBNK225D',      name: 'SCB Nikkei 225' },
  { code: 'KF-HJAPAND',     name: 'KF H-Japan D' },
  { code: 'SCBBLN',         name: 'SCB Balanced' },
  { code: 'B-USALPHA',      name: 'B US Alpha' },
  { code: 'SCBS&P500',      name: 'SCB S&P500' },
  { code: 'KF-JPSCAPD',     name: 'KF JP Small Cap D' },
];

const MACD_SHORT = 12;
const MACD_LONG = 26;
const MACD_SIGNAL = 9;
const HISTORY_DAYS = 250;

const SEC_API_KEY = process.env.SEC_API_KEY ?? '';
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN ?? '';
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID ?? '';

// ── Helpers ───────────────────────────────────────────────────────────────────
function dateRange(days) {
  const end = new Date();
  const start = new Date(Date.now() - days * 86400000);
  const fmt = (d) => d.toISOString().slice(0, 10);
  return { startDate: fmt(start), endDate: fmt(end) };
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

// ── SEC Thailand API ──────────────────────────────────────────────────────────
async function fetchNAV(fundCode) {
  const { startDate, endDate } = dateRange(HISTORY_DAYS);
  const encoded = encodeURIComponent(fundCode);
  const url = `https://api.sec.or.th/FundFactsheet/fund/${encoded}/nav?start_date=${startDate}&end_date=${endDate}`;

  const headers = { 'Content-Type': 'application/json', Accept: 'application/json' };
  if (SEC_API_KEY) headers['Authorization'] = `Bearer ${SEC_API_KEY}`;

  const res = await fetch(url, { headers, signal: AbortSignal.timeout(15000) });
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${await res.text()}`);
  return res.json();
}

function parseNAV(raw) {
  // Handle both array response and object with Data key
  const rows = Array.isArray(raw) ? raw : (raw?.Data ?? raw?.data ?? []);
  return rows
    .map((r) => ({
      date: (r.nav_date ?? r.navDate ?? r.date ?? '').toString().replace(/(\d{4})(\d{2})(\d{2})/, '$1-$2-$3'),
      nav: parseFloat(r.nav_value ?? r.navValue ?? r.nav ?? 0),
    }))
    .filter((r) => r.date && !isNaN(r.nav))
    .sort((a, b) => a.date.localeCompare(b.date));
}

// ── MACD ──────────────────────────────────────────────────────────────────────
function ema(values, period) {
  if (values.length < period) return values.map(() => null);
  const k = 2 / (period + 1);
  const result = new Array(period - 1).fill(null);
  let e = values.slice(0, period).reduce((a, b) => a + b, 0) / period;
  result.push(e);
  for (let i = period; i < values.length; i++) {
    e = values[i] * k + e * (1 - k);
    result.push(e);
  }
  return result;
}

function computeMACD(navRows) {
  const prices = navRows.map((r) => r.nav);
  const ema12 = ema(prices, MACD_SHORT);
  const ema26 = ema(prices, MACD_LONG);

  const macdLine = ema12.map((v12, i) =>
    v12 !== null && ema26[i] !== null ? v12 - ema26[i] : null
  );

  const validMacd = macdLine.filter((v) => v !== null);
  const signalEMA = ema(validMacd, MACD_SIGNAL);

  let idx = 0;
  return navRows.map((row, i) => {
    const macd = macdLine[i];
    if (macd === null) return { ...row, macd: null, signal: null, histogram: null };
    const sig = signalEMA[idx] ?? null;
    idx++;
    return {
      ...row,
      macd: +macd.toFixed(6),
      signal: sig !== null ? +sig.toFixed(6) : null,
      histogram: sig !== null ? +(macd - sig).toFixed(6) : null,
    };
  });
}

function detectCrossover(data) {
  if (data.length < 2) return null;
  const prev = data[data.length - 2];
  const curr = data[data.length - 1];
  if (!prev.signal || !curr.signal) return null;
  if (prev.macd < prev.signal && curr.macd >= curr.signal) return 'bullish';
  if (prev.macd > prev.signal && curr.macd <= curr.signal) return 'bearish';
  return null;
}

// ── File I/O ──────────────────────────────────────────────────────────────────
function safeFilename(code) {
  return code.replace(/[^a-zA-Z0-9-]/g, '_');
}

function saveData(code, name, data) {
  if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });
  const today = new Date().toISOString().slice(0, 10);
  const file = join(DATA_DIR, `${safeFilename(code)}.json`);
  writeFileSync(file, JSON.stringify({ fund: code, name, lastUpdated: today, data }, null, 2));
}

function loadCachedData(code) {
  try {
    const file = join(DATA_DIR, `${safeFilename(code)}.json`);
    const raw = JSON.parse(readFileSync(file, 'utf8'));
    return raw.data ?? [];
  } catch {
    return [];
  }
}

// ── Telegram ──────────────────────────────────────────────────────────────────
async function sendTelegram(text) {
  if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) {
    console.warn('[Telegram] Token or Chat ID not set — skipping notification');
    return;
  }
  const url = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: TELEGRAM_CHAT_ID,
      text,
      parse_mode: 'HTML',
    }),
    signal: AbortSignal.timeout(10000),
  });
  if (!res.ok) console.error('[Telegram] Failed:', await res.text());
}

function buildReport(results) {
  const date = new Date().toLocaleDateString('th-TH', { dateStyle: 'long' });
  const lines = [`📊 <b>Thai Fund MACD Report</b>\n📅 ${date}\n`];

  const crossovers = results.filter((r) => r.crossover);
  if (crossovers.length) {
    lines.push('<b>🔔 สัญญาณวันนี้:</b>');
    for (const r of crossovers) {
      const emoji = r.crossover === 'bullish' ? '🚀' : '⚠️';
      const label = r.crossover === 'bullish' ? 'Bullish Crossover' : 'Bearish Crossover';
      lines.push(`${emoji} <b>${r.code}</b> — ${label}`);
    }
    lines.push('');
  }

  lines.push('<b>📈 NAV & MACD ล่าสุด:</b>');
  for (const r of results) {
    if (r.error) {
      lines.push(`❌ ${r.code}: ${r.error}`);
      continue;
    }
    const last = r.data[r.data.length - 1];
    if (!last) continue;
    const prev = r.data[r.data.length - 2];
    const change = prev ? (((last.nav - prev.nav) / prev.nav) * 100).toFixed(2) : null;
    const arrow = change === null ? '' : change >= 0 ? ' ▲' : ' ▼';
    lines.push(
      `<b>${r.code}</b>\n` +
      `  NAV: ${last.nav?.toFixed(4)}${change !== null ? ` (${change}%${arrow})` : ''}\n` +
      `  MACD: ${last.macd?.toFixed(4) ?? 'N/A'} | Signal: ${last.signal?.toFixed(4) ?? 'N/A'}`
    );
  }

  return lines.join('\n');
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  console.log(`\n🚀 Starting NAV fetch — ${new Date().toISOString()}\n`);
  const results = [];

  for (const { code, name } of FUNDS) {
    console.log(`Fetching: ${code}`);
    try {
      const raw = await fetchNAV(code);
      const navRows = parseNAV(raw);

      if (!navRows.length) throw new Error('No NAV data returned');

      const merged = navRows; // API returns full history
      const data = computeMACD(merged);
      const crossover = detectCrossover(data);

      saveData(code, name, data);
      results.push({ code, name, data, crossover, error: null });
      console.log(`  ✅ ${navRows.length} rows, crossover: ${crossover ?? 'none'}`);
    } catch (err) {
      console.error(`  ❌ ${code}: ${err.message}`);
      // Fall back to cached data so we don't lose history
      const cached = loadCachedData(code);
      results.push({ code, name, data: cached, crossover: null, error: err.message });
    }

    await sleep(400); // polite rate limiting
  }

  const report = buildReport(results);
  console.log('\n' + report.replace(/<[^>]+>/g, '') + '\n');
  await sendTelegram(report);
  console.log('✅ Done');
}

main().catch((e) => {
  console.error('Fatal:', e);
  process.exit(1);
});
