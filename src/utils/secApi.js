import { SEC_API_KEY } from '../config/google';

// dev: Vite proxy /api/sec → https://api.sec.or.th
// prod (Vercel): /api/sec/[...path].js serverless function
const SEC_BASE = '/api/sec';

function secHeaders() {
  return {
    'ocp-apim-subscription-key': SEC_API_KEY,
    'cache-control': 'no-cache',
  };
}

async function secFetch(url) {
  const res = await fetch(url, { headers: secHeaders() });
  if (!res.ok) throw new Error(`SEC API ${res.status}`);
  return res.json();
}

// วน pagination จนครบ — ถ้า cursor ใช้ไม่ได้ก็ใช้ข้อมูลที่ได้มาแล้วพอ
async function fetchAllPages(firstUrl, extractItems) {
  const allItems = [];
  let url = firstUrl;
  const baseParams = new URL(firstUrl, 'http://x').searchParams;

  while (url) {
    let data;
    try {
      data = await secFetch(url);
    } catch {
      break; // cursor อาจหมดอายุหรือ invalid — ใช้ข้อมูลที่มีแล้ว
    }

    allItems.push(...extractItems(data));

    const cursor = data.next_cursor;
    if (!cursor || cursor === 'xxxx-xxx-xxx') break;

    const next = new URLSearchParams(baseParams);
    next.set('cursor', cursor);
    url = firstUrl.split('?')[0] + '?' + next;
  }

  return allItems;
}

// หา proj_id จาก profiles API โดย match fund_class_name
export async function lookupProjId(fund) {
  const { projectInfo, companyInfo, classFundName } = fund;
  const params = new URLSearchParams({ fund_status: 'Registered', project_info: projectInfo });
  if (companyInfo) params.set('company_info', companyInfo);

  const firstUrl = `${SEC_BASE}/v2/fund/general-info/profiles?${params}`;
  const items = await fetchAllPages(firstUrl, (d) => d.items ?? []);

  return (
    items.find((it) => it.fund_class_name === classFundName)?.proj_id ??
    items.find((it) => it.proj_abbr_name === projectInfo)?.proj_id ??
    (items.length === 1 ? items[0].proj_id : null)
  );
}

// ดึง NAV history (date range) — returns [{date, nav}]
export async function fetchNAV(projId, days = 250) {
  const end = new Date();
  const start = new Date(Date.now() - days * 86400000);
  const fmt = (d) => d.toISOString().slice(0, 10);

  const params = new URLSearchParams({
    proj_id: projId,
    start_nav_date: fmt(start),
    end_nav_date: fmt(end),
  });

  const firstUrl = `${SEC_BASE}/v2/fund/daily-info/nav?${params}`;
  const rows = await fetchAllPages(firstUrl, (d) => d.items ?? []);

  const navMap = {};
  for (const row of rows) {
    const nav = parseFloat(row.last_val ?? 0);
    if (nav > 0 && row.nav_date) navMap[row.nav_date] = nav;
  }

  return Object.entries(navMap)
    .map(([date, nav]) => ({ date, nav }))
    .sort((a, b) => a.date.localeCompare(b.date));
}
