/**
 * Fetches NAV data from SEC Thailand API, calculates MACD,
 * saves JSON to public/data/, and sends Telegram notifications.
 *
 * Secrets required (GitHub Actions):
 *   SEC_API_KEY         - จาก https://api-portal.sec.or.th/
 *   TELEGRAM_BOT_TOKEN  - from @BotFather
 *   TELEGRAM_CHAT_ID    - your chat/group ID
 *
 * SEC API flow:
 *   1. GET /FundFactsheet/fund/amc                → list all AMCs
 *   2. GET /FundFactsheet/fund/amc/{id}           → list funds + proj_id
 *   3. GET /FundDailyInfo/{proj_id}/dailynav/{date} → NAV per day
 */

import { writeFileSync, readFileSync, mkdirSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const DATA_DIR = join(ROOT, 'public', 'data');
const PROJ_ID_CACHE = join(DATA_DIR, '_proj_id_cache.json');

// ── Config ────────────────────────────────────────────────────────────────────
const FUNDS = [
  { code: 'LHESPORT-D',     secCode: 'LHESPORT',    name: 'LH E-Sport' },
  { code: 'LHSEMICON-D',    secCode: 'LHSEMICON',   name: 'LH Semiconductor' },
  { code: 'K-GOLD-A(D)',    secCode: 'K-GOLD',       name: 'K Gold A' },
  { code: 'ONE-GLOBFIN-RD', secCode: 'ONE-GLOBFIN',  name: 'ONE Global Finance' },
  { code: 'K-GLOBE',                                  name: 'K Globe' },
  { code: 'K-USXNDQ-A(D)', secCode: 'K-USXNDQ',     name: 'K US NASDAQ A' },
  { code: 'SCBNK225D',      secCode: 'SCBNKY225',    name: 'SCB Nikkei 225' },
  { code: 'KF-HJAPAND',                               name: 'KF H-Japan D' },
  { code: 'SCBBLN',         secCode: 'SCBBLNFUND',   name: 'SCB Balanced' },
  { code: 'B-USALPHA',                                name: 'B US Alpha' },
  { code: 'SCBS&P500',      secCode: 'SCBSP500T1',   name: 'SCB S&P500' },
  { code: 'KF-JPSCAPD',                               name: 'KF JP Small Cap D' },
];

const MACD_SHORT = 12;
const MACD_LONG = 26;
const MACD_SIGNAL = 9;
const HISTORY_DAYS = 250;

const SEC_KEY_DAILY = process.env.SEC_API_KEY_DAILY ?? '';
const SEC_KEY_FACTSHEET = process.env.SEC_API_KEY_FACTSHEET ?? '';
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN ?? '';
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID ?? '';
const SEC_BASE = 'https://api.sec.or.th';

// ── Helpers ───────────────────────────────────────────────────────────────────
function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function secHeaders(key) {
  return {
    'Content-Type': 'application/json',
    Accept: 'application/json',
    ...(key ? { 'Ocp-Apim-Subscription-Key': key } : {}),
  };
}

function factsheetHeaders() { return secHeaders(SEC_KEY_FACTSHEET); }
function dailyHeaders()     { return secHeaders(SEC_KEY_DAILY); }

async function secFetch(url, headers) {
  const res = await fetch(url, { headers, signal: AbortSignal.timeout(15000) });
  if (res.status === 204) return [];
  if (!res.ok) throw new Error(`HTTP ${res.status} — ${url}`);
  return res.json();
}

// ── proj_id lookup ─────────────────────────────────────────────────────────────
function normCode(s) {
  return s.replace(/[\s\-()\[\]]/g, '').toUpperCase();
}

function loadProjIdCache() {
  try {
    return JSON.parse(readFileSync(PROJ_ID_CACHE, 'utf8'));
  } catch {
    return {};
  }
}

function saveProjIdCache(map) {
  if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });
  writeFileSync(PROJ_ID_CACHE, JSON.stringify(map, null, 2));
}

function resolveProjId(map, code) {
  if (map[code]) return map[code];
  const norm = normCode(code);
  for (const [key, val] of Object.entries(map)) {
    if (normCode(key) === norm) return val;
  }
  return null;
}

async function buildProjIdMap(funds) {
  const cache = loadProjIdCache();
  const missing = funds.filter(({ code, secCode }) => !resolveProjId(cache, secCode ?? code));
  if (!missing.length) return cache;

  console.log(`🔍 Looking up proj_id for: ${missing.map((f) => f.secCode ?? f.code).join(', ')}`);

  const amcs = await secFetch(`${SEC_BASE}/FundFactsheet/fund/amc`, factsheetHeaders());
  const amcList = Array.isArray(amcs) ? amcs : (amcs?.Data ?? amcs?.data ?? []);

  for (const amc of amcList) {
    const uid = amc.unique_id ?? amc.uniqueId ?? amc.id;
    if (!uid) continue;
    await sleep(200);

    let funds;
    try {
      funds = await secFetch(`${SEC_BASE}/FundFactsheet/fund/amc/${uid}`, factsheetHeaders());
    } catch {
      continue;
    }
    const fundList = Array.isArray(funds) ? funds : (funds?.Data ?? funds?.data ?? []);

    for (const f of fundList) {
      const abbr = f.proj_abbr_name ?? f.projAbbrName ?? f.abbr_name ?? '';
      const projId = f.proj_id ?? f.projId ?? f.id;
      if (abbr && projId) cache[abbr] = projId;
    }
  }

  saveProjIdCache(cache);
  return cache;
}

// ── NAV fetching ──────────────────────────────────────────────────────────────
function getDatesInRange(days) {
  const dates = [];
  for (let i = days; i >= 0; i--) {
    const d = new Date(Date.now() - i * 86400000);
    const day = d.getDay();
    if (day === 0 || day === 6) continue; // skip weekends
    dates.push(d.toISOString().slice(0, 10).replace(/-/g, ''));
  }
  return dates;
}

async function fetchNAVHistory(projId) {
  // Fetch from cache first; only pull dates we don't have
  const dates = getDatesInRange(HISTORY_DAYS);
  const navMap = {};

  for (const date of dates) {
    await sleep(150);
    try {
      const data = await secFetch(`${SEC_BASE}/FundDailyInfo/${projId}/dailynav/${date}`, dailyHeaders());
      const row = Array.isArray(data) ? data[0] : data;
      if (!row) continue;
      const nav = parseFloat(row.nav_value ?? row.navValue ?? row.nav ?? 0);
      if (nav > 0) {
        const iso = `${date.slice(0, 4)}-${date.slice(4, 6)}-${date.slice(6, 8)}`;
        navMap[iso] = nav;
      }
    } catch {
      // date not found or API error — skip
    }
  }

  return Object.entries(navMap)
    .map(([date, nav]) => ({ date, nav }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

function mergeWithCache(cached, fresh) {
  const map = Object.fromEntries(cached.map((r) => [r.date, r]));
  for (const r of fresh) map[r.date] = { date: r.date, nav: r.nav };
  return Object.values(map).sort((a, b) => a.date.localeCompare(b.date));
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
  // สัญญาณที่ต้องการ: fast ตัด slow ขึ้นขณะที่ MACD ยังอยู่ใต้ 0
  if (prev.macd < prev.signal && curr.macd >= curr.signal && curr.macd < 0) return 'bullish_below_zero';
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
    console.warn('[Telegram] Token or Chat ID not set — skipping');
    return;
  }
  const res = await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: TELEGRAM_CHAT_ID, text, parse_mode: 'HTML' }),
    signal: AbortSignal.timeout(10000),
  });
  if (!res.ok) console.error('[Telegram] Failed:', await res.text());
}

function buildReport(results) {
  const date = new Date().toLocaleDateString('th-TH', { dateStyle: 'long' });
  const signals = results.filter((r) => r.crossover === 'bullish_below_zero');

  if (!signals.length) {
    const lines = [`📊 <b>Thai Fund MACD</b> — ${date}`, '', '⏳ ไม่มีสัญญาณวันนี้', ''];
    for (const r of results) {
      if (r.error || !r.data.length) continue;
      const last = r.data[r.data.length - 1];
      lines.push(`${r.code}: MACD ${last.macd?.toFixed(4) ?? 'N/A'}`);
    }
    return lines.join('\n');
  }

  const lines = [`🚨 <b>สัญญาณซื้อ! Thai Fund MACD</b>\n📅 ${date}\n`];
  lines.push('<b>✅ MACD (fast) ตัด Signal (slow) ขึ้น ขณะ MACD &lt; 0:</b>');
  for (const r of signals) {
    const last = r.data[r.data.length - 1];
    const prev = r.data[r.data.length - 2];
    const change = prev ? (((last.nav - prev.nav) / prev.nav) * 100).toFixed(2) : null;
    lines.push(
      `\n🚀 <b>${r.code}</b> (${r.name})` +
      `\n  NAV: ${last.nav?.toFixed(4)}${change !== null ? ` (${change >= 0 ? '+' : ''}${change}%)` : ''}` +
      `\n  MACD: <b>${last.macd?.toFixed(4)}</b> | Signal: ${last.signal?.toFixed(4)}` +
      `\n  Histogram: ${last.histogram?.toFixed(4)}`
    );
  }
  return lines.join('\n');
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  console.log(`\n🚀 Starting NAV fetch — ${new Date().toISOString()}\n`);

  if (!SEC_KEY_DAILY)     console.warn('⚠️  SEC_API_KEY_DAILY not set');
  if (!SEC_KEY_FACTSHEET) console.warn('⚠️  SEC_API_KEY_FACTSHEET not set');

  const extraCodes = (process.env.EXTRA_FUNDS ?? '')
    .split(',').map((s) => s.trim()).filter(Boolean);
  const allFunds = [
    ...FUNDS,
    ...extraCodes
      .filter((c) => !FUNDS.some((f) => f.code === c || f.secCode === c))
      .map((c) => ({ code: c, name: c })),
  ];

  // Step 1: resolve proj_id for all funds
  const projIdMap = await buildProjIdMap(allFunds);

  const results = [];

  for (const { code, secCode, name } of allFunds) {
    console.log(`\nFetching: ${code}`);
    const projId = resolveProjId(projIdMap, secCode ?? code);

    if (!projId) {
      console.error(`  ❌ proj_id not found for ${code}`);
      results.push({ code, name, data: loadCachedData(code), crossover: null, error: 'proj_id not found' });
      continue;
    }

    try {
      const fresh = await fetchNAVHistory(projId);
      if (!fresh.length) throw new Error('No NAV data returned');

      const cached = loadCachedData(code);
      const merged = mergeWithCache(
        cached.map((r) => ({ date: r.date, nav: r.nav })),
        fresh
      );

      const data = computeMACD(merged);
      const crossover = detectCrossover(data);

      saveData(code, name, data);
      results.push({ code, name, data, crossover, error: null });
      console.log(`  ✅ ${merged.length} rows, crossover: ${crossover ?? 'none'}`);
    } catch (err) {
      console.error(`  ❌ ${err.message}`);
      const cached = loadCachedData(code);
      results.push({ code, name, data: cached, crossover: null, error: err.message });
    }
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
