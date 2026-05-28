import { SEC_API_KEY } from '../config/google';

const SEC_ORIGIN = 'https://api.sec.or.th';

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

export async function lookupProjId(fund) {
  const { projectInfo, companyInfo, classFundName } = fund;
  const params = new URLSearchParams({ fund_status: 'Registered', project_info: projectInfo });
  if (companyInfo) params.set('company_info', companyInfo);

  const items = [];
  let secUrl = `${SEC_ORIGIN}/v2/fund/general-info/profiles?${params}`;

  while (secUrl) {
    let data;
    try { data = await secFetch(secUrl); } catch { break; }
    items.push(...(data.items ?? []));
    const cursor = data.next_cursor;
    if (!cursor || cursor === 'xxxx-xxx-xxx') break;
    const next = new URLSearchParams(params);
    next.set('cursor', cursor);
    secUrl = `${SEC_ORIGIN}/v2/fund/general-info/profiles?${next}`;
  }

  const matched =
    items.find((it) => it.proj_abbr_name === projectInfo && it.fund_class_name === classFundName) ??
    items.find((it) => it.proj_abbr_name === projectInfo) ??
    items.find((it) => it.fund_class_name === classFundName) ??
    (items.length === 1 ? items[0] : null);

  if (!matched) return { projId: null, classFundName: null, isDividend: false };
  return {
    projId: matched.proj_id,
    classFundName: matched.fund_class_name ?? null,
    isDividend: matched.fund_class_detail?.includes('ปันผล') ?? false,
  };
}

// แบ่ง request เป็น chunk 90 วัน เพื่อหลีกเลี่ยง cursor pagination
// แต่ละ chunk มี ~64 trading days ซึ่งน้อยกว่า page_size=100
export async function fetchNAV(projId, classFundName, days = 1000) {
  const fmt = (d) => d.toISOString().slice(0, 10);
  const CHUNK = 90;
  const navMap = {};

  for (let offset = 0; offset < days; offset += CHUNK) {
    const chunkEnd = new Date(Date.now() - offset * 86400000);
    const chunkStart = new Date(Date.now() - Math.min(offset + CHUNK, days) * 86400000);

    const params = new URLSearchParams({
      proj_id: projId,
      start_nav_date: fmt(chunkStart),
      end_nav_date: fmt(chunkEnd),
    });

    try {
      const data = await secFetch(`${SEC_ORIGIN}/v2/fund/daily-info/nav?${params}`);
      const items = data.items ?? [];
      // ถ้า classFundName ไม่ตรงกับ class ใดเลยใน chunk → ไม่ filter (เอาทั้งหมด)
      const classes = new Set(items.map((r) => r.fund_class_name));
      const useFilter = classFundName && classes.has(classFundName);
      for (const row of items) {
        if (useFilter && row.fund_class_name !== classFundName) continue;
        const nav = parseFloat(row.last_val ?? 0);
        if (nav > 0 && row.nav_date) navMap[row.nav_date] = nav;
      }
    } catch {
      // chunk ล้มเหลว — ข้ามและใช้ข้อมูลที่มีอยู่
    }
  }

  return Object.entries(navMap)
    .map(([date, nav]) => ({ date, nav }))
    .sort((a, b) => a.date.localeCompare(b.date));
}
