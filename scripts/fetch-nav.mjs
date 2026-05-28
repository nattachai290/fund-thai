/**
 * Fetches NAV data from SEC Thailand API v2, calculates MACD,
 * saves JSON to public/data/, and sends Telegram notifications.
 *
 * Secrets required (GitHub Actions):
 *   SEC_API_KEY         - จาก https://api-portal.sec.or.th/
 *   TELEGRAM_BOT_TOKEN  - from @BotFather
 *   TELEGRAM_CHAT_ID    - your chat/group ID
 *
 * SEC API v2 flow:
 *   1. GET /v2/fund/general-info/profiles?fund_status=Registered&project_info=X&company_info=Y
 *      → find proj_id by matching fund_class_name
 *   2. GET /v2/fund/daily-info/nav?proj_id=X&start_nav_date=YYYY-MM-DD&end_nav_date=YYYY-MM-DD
 *      → fetch NAV history by date range
 */

import { writeFileSync, readFileSync, mkdirSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const DATA_DIR = join(ROOT, 'public', 'data');
const PROJ_ID_CACHE = join(DATA_DIR, '_proj_id_cache.json');

// ── Config ────────────────────────────────────────────────────────────────────
// projectInfo  = ค่าที่ใส่ใน query param project_info (proj_abbr_name ของกลุ่ม ไม่มี class suffix)
// companyInfo  = ค่าที่ใส่ใน query param company_info (ชื่อธนาคาร/บลจ. เพื่อกันผลลัพธ์ที่ใกล้กัน)
// classFundName = ค่า fund_class_name ใน response ที่ต้องการ match เพื่อเอา proj_id
const FUNDS = [
  { code: 'LHESPORT-D',     name: 'LH E-Sport',        projectInfo: 'LHESPORT',    companyInfo: '',         classFundName: 'LHESPORT-D'     },
  { code: 'LHSEMICON-D',    name: 'LH Semiconductor',   projectInfo: 'LHSEMICON',   companyInfo: '',         classFundName: 'LHSEMICON-D'    },
  { code: 'K-GOLD-A(D)',    name: 'K Gold A',           projectInfo: 'K-GOLD',      companyInfo: 'KASIKORN', classFundName: 'K-GOLD-A(D)'    },
  { code: 'ONE-GLOBFIN-RD', name: 'ONE Global Finance', projectInfo: 'ONE-GLOBFIN', companyInfo: '',         classFundName: 'ONE-GLOBFIN-RD'  },
  { code: 'K-GLOBE',        name: 'K Globe',            projectInfo: 'K-GLOBE',     companyInfo: 'KASIKORN', classFundName: 'K-GLOBE'         },
  { code: 'K-USXNDQ-A(D)',  name: 'K US NASDAQ A',      projectInfo: 'K-USXNDQ',    companyInfo: 'KASIKORN', classFundName: 'K-USXNDQ-A(D)'  },
  { code: 'SCBNK225D',      name: 'SCB Nikkei 225',     projectInfo: 'SCBNK225',    companyInfo: 'SCB',      classFundName: 'SCBNK225D'       },
  { code: 'KF-HJAPAND',     name: 'KF H-Japan D',       projectInfo: 'KF-HJAPAN',   companyInfo: 'Krungsri', classFundName: 'KF-HJAPAND'      },
  { code: 'SCBBLN',         name: 'SCB Balanced',       projectInfo: 'SCBBLN',      companyInfo: 'SCB',      classFundName: 'SCBBLN'          },
  { code: 'B-USALPHA',      name: 'B US Alpha',         projectInfo: 'B-USALPHA',   companyInfo: 'BBL',      classFundName: 'B-USALPHA'       },
  { code: 'SCBS&P500',      name: 'SCB S&P500',         projectInfo: 'SCBS&P500',   companyInfo: 'SCB',      classFundName: 'SCBS&P500'       },
  { code: 'KF-JPSCAPD',     name: 'KF JP Small Cap D',  projectInfo: 'KF-JPSCAPD',  companyInfo: 'Krungsri', classFundName: 'KF-JPSCAPD'      },
];

// EXTRA_FUNDS env: comma-separated "code:projectInfo:companyInfo:classFundName:name"
// e.g. "BGOLD:BGOLD:BBL:BGOLD:B Gold"
function parseExtraFunds() {
  const raw = process.env.EXTRA_FUNDS ?? '';
  return raw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => {
      const [code, projectInfo, companyInfo, classFundName, ...nameParts] = s.split(':');
      return { code, projectInfo, companyInfo: companyInfo ?? '', classFundName: classFundName ?? code, name: nameParts.join(':') || code };
    });
}

const MACD_SHORT = 12;
const MACD_LONG = 26;
const MACD_SIGNAL = 9;
const HISTORY_DAYS = 250;

const SEC_API_KEY = process.env.SEC_API_KEY ?? process.env.SEC_API_KEY_DAILY ?? '';
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN ?? '';
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID ?? '';
const SEC_BASE = 'https://api.sec.or.th';

// ── Helpers ───────────────────────────────────────────────────────────────────
function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function secHeaders() {
  return {
    'Content-Type': 'application/json',
    Accept: 'application/json',
    'cache-control': 'no-cache',
    ...(SEC_API_KEY ? { 'ocp-apim-subscription-key': SEC_API_KEY } : {}),
  };
}

async function secFetch(url) {
  const res = await fetch(url, { headers: secHeaders(), signal: AbortSignal.timeout(15000) });
  if (res.status === 204) return { items: [], next_cursor: null };
  if (!res.ok) throw new Error(`HTTP ${res.status} — ${url}`);
  return res.json();
}

// ── proj_id lookup ─────────────────────────────────────────────────────────────
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

async function fetchProfilesAllPages(projectInfo, companyInfo) {
  const items = [];
  const params = new URLSearchParams({ fund_status: 'Registered', project_info: projectInfo });
  if (companyInfo) params.set('company_info', companyInfo);

  let url = `${SEC_BASE}/v2/fund/general-info/profiles?${params}`;

  while (url) {
    const data = await secFetch(url);
    items.push(...(data.items ?? []));
    const cursor = data.next_cursor;
    if (!cursor || cursor === 'xxxx-xxx-xxx') break;
    const nextParams = new URLSearchParams(params);
    nextParams.set('cursor', cursor);
    url = `${SEC_BASE}/v2/fund/general-info/profiles?${nextParams}`;
    await sleep(200);
  }

  return items;
}

async function buildProjIdMap(funds) {
  const cache = loadProjIdCache();
  const missing = funds.filter((f) => !cache[f.code]);
  if (!missing.length) return cache;

  console.log(`🔍 Looking up proj_id for: ${missing.map((f) => f.code).join(', ')}`);

  for (const fund of missing) {
    await sleep(300);
    try {
      const items = await fetchProfilesAllPages(fund.projectInfo, fund.companyInfo);

      const matched =
        items.find((it) => it.fund_class_name === fund.classFundName) ??
        items.find((it) => it.proj_abbr_name === fund.projectInfo) ??
        (items.length === 1 ? items[0] : null);

      if (matched?.proj_id) {
        cache[fund.code] = matched.proj_id;
        console.log(`  ✅ ${fund.code} → ${matched.proj_id} (class: ${matched.fund_class_name})`);
      } else {
        console.error(`  ❌ proj_id not found for ${fund.code} (got ${items.length} results)`);
        if (items.length) {
          console.error(`     Available classes: ${items.map((it) => it.fund_class_name).join(', ')}`);
        }
      }
    } catch (err) {
      console.error(`  ❌ ${fund.code}: ${err.message}`);
    }
  }

  saveProjIdCache(cache);
  return cache;
}

// ── NAV fetching ──────────────────────────────────────────────────────────────
function isoDate(d) {
  return d.toISOString().slice(0, 10);
}

async function fetchNAVHistory(projId) {
  const endDate = new Date();
  const startDate = new Date(Date.now() - HISTORY_DAYS * 86400000);
  const navMap = {};

  const params = new URLSearchParams({
    proj_id: projId,
    start_nav_date: isoDate(startDate),
    end_nav_date: isoDate(endDate),
  });

  let url = `${SEC_BASE}/v2/fund/daily-info/nav?${params}`;

  while (url) {
    const data = await secFetch(url);
    for (const row of data.items ?? []) {
      const nav = parseFloat(row.last_val ?? 0);
      if (nav > 0 && row.nav_date) navMap[row.nav_date] = nav;
    }
    const cursor = data.next_cursor;
    if (!cursor || cursor === 'xxxx-xxx-xxx') break;
    const nextParams = new URLSearchParams(params);
    nextParams.set('cursor', cursor);
    url = `${SEC_BASE}/v2/fund/daily-info/nav?${nextParams}`;
    await sleep(150);
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

  if (!SEC_API_KEY) console.warn('⚠️  SEC_API_KEY not set');

  const extraFunds = parseExtraFunds();
  const allFunds = [...FUNDS, ...extraFunds.filter((e) => !FUNDS.find((f) => f.code === e.code))];

  const projIdMap = await buildProjIdMap(allFunds);

  const results = [];

  for (const { code, name } of allFunds) {
    console.log(`\nFetching: ${code}`);
    const projId = projIdMap[code];

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
