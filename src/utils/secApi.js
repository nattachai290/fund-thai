import { SEC_API_KEY } from '../config/google';

const SEC_ORIGIN = 'https://api.sec.or.th';

// dev: Vite proxy /sec-proxy → https://api.sec.or.th
// prod: /api/sec?url=<encoded full SEC URL>
function proxyFetchUrl(secUrl) {
  if (import.meta.env.DEV) {
    return secUrl.replace(SEC_ORIGIN, '/sec-proxy');
  }
  return `/api/sec?url=${encodeURIComponent(secUrl)}`;
}

async function secFetch(secUrl) {
  const fetchUrl = proxyFetchUrl(secUrl);
  const headers = import.meta.env.DEV
    ? { 'ocp-apim-subscription-key': SEC_API_KEY, 'cache-control': 'no-cache' }
    : {};
  const res = await fetch(fetchUrl, { headers });
  if (!res.ok) throw new Error(`SEC API ${res.status}`);
  return res.json();
}

async function fetchAllPages(firstSecUrl, extractItems) {
  const allItems = [];
  let secUrl = firstSecUrl;
  const base = firstSecUrl.split('?')[0];
  const baseParams = new URLSearchParams(firstSecUrl.split('?')[1] ?? '');

  while (secUrl) {
    let data;
    try {
      data = await secFetch(secUrl);
    } catch {
      break;
    }
    allItems.push(...extractItems(data));

    const cursor = data.next_cursor;
    if (!cursor || cursor === 'xxxx-xxx-xxx') break;

    const next = new URLSearchParams(baseParams);
    next.set('cursor', cursor);
    secUrl = `${base}?${next}`;
  }

  return allItems;
}

export async function lookupProjId(fund) {
  const { projectInfo, companyInfo, classFundName } = fund;
  const params = new URLSearchParams({ fund_status: 'Registered', project_info: projectInfo });
  if (companyInfo) params.set('company_info', companyInfo);

  const firstUrl = `${SEC_ORIGIN}/v2/fund/general-info/profiles?${params}`;
  const items = await fetchAllPages(firstUrl, (d) => d.items ?? []);

  return (
    items.find((it) => it.fund_class_name === classFundName)?.proj_id ??
    items.find((it) => it.proj_abbr_name === projectInfo)?.proj_id ??
    (items.length === 1 ? items[0].proj_id : null)
  );
}

export async function fetchNAV(projId, days = 250) {
  const end = new Date();
  const start = new Date(Date.now() - days * 86400000);
  const fmt = (d) => d.toISOString().slice(0, 10);

  const params = new URLSearchParams({
    proj_id: projId,
    start_nav_date: fmt(start),
    end_nav_date: fmt(end),
  });

  const firstUrl = `${SEC_ORIGIN}/v2/fund/daily-info/nav?${params}`;
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
