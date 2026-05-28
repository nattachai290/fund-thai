import { SEC_API_KEY } from '../config/google';

// dev: Vite proxy /sec-api → https://api.sec.or.th
// prod (Vercel): vercel.json rewrite /sec-api → https://api.sec.or.th
// prod (อื่นๆ): ใช้ VITE_SEC_PROXY ถ้า set ไว้ (เช่น Cloudflare Worker URL)
const SEC_BASE = import.meta.env.VITE_SEC_PROXY ?? '/sec-api';

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

// หา proj_id จาก profiles API โดย match fund_class_name
export async function lookupProjId(fund) {
  const { projectInfo, companyInfo, classFundName } = fund;
  const params = new URLSearchParams({ fund_status: 'Registered', project_info: projectInfo });
  if (companyInfo) params.set('company_info', companyInfo);

  const items = [];
  let url = `${SEC_BASE}/v2/fund/general-info/profiles?${params}`;

  while (url) {
    const data = await secFetch(url);
    items.push(...(data.items ?? []));
    const cursor = data.next_cursor;
    if (!cursor || cursor === 'xxxx-xxx-xxx') break;
    const next = new URLSearchParams(params);
    next.set('cursor', cursor);
    url = `${SEC_BASE}/v2/fund/general-info/profiles?${next}`;
  }

  const matched =
    items.find((it) => it.fund_class_name === classFundName) ??
    items.find((it) => it.proj_abbr_name === projectInfo) ??
    (items.length === 1 ? items[0] : null);

  return matched?.proj_id ?? null;
}

// ดึง NAV history (date range) — returns [{date, nav}]
export async function fetchNAV(projId, days = 250) {
  const end = new Date();
  const start = new Date(Date.now() - days * 86400000);
  const fmt = (d) => d.toISOString().slice(0, 10);

  const navMap = {};
  const params = new URLSearchParams({
    proj_id: projId,
    start_nav_date: fmt(start),
    end_nav_date: fmt(end),
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
    const next = new URLSearchParams(params);
    next.set('cursor', cursor);
    url = `${SEC_BASE}/v2/fund/daily-info/nav?${next}`;
  }

  return Object.entries(navMap)
    .map(([date, nav]) => ({ date, nav }))
    .sort((a, b) => a.date.localeCompare(b.date));
}
