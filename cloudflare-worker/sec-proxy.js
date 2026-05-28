/**
 * Cloudflare Worker — SEC API CORS Proxy
 *
 * วิธี deploy:
 * 1. ไปที่ https://workers.cloudflare.com/ → Create Worker
 * 2. วางโค้ดนี้แล้ว Deploy
 * 3. Copy Worker URL (เช่น https://sec-proxy.xxxx.workers.dev)
 * 4. ใส่ใน GitHub repo → Settings → Secrets and variables → Variables
 *    ชื่อ: VITE_SEC_PROXY  ค่า: https://sec-proxy.xxxx.workers.dev
 *    (หรือสร้าง .env.production ใน local แล้ว push)
 */

const SEC_ORIGIN = 'https://api.sec.or.th';
const SEC_KEY = 'd65ae47a9e434f909e5bea3dd0268571';

export default {
  async fetch(request) {
    // handle CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        headers: corsHeaders(),
      });
    }

    const url = new URL(request.url);
    const target = SEC_ORIGIN + url.pathname + url.search;

    const res = await fetch(target, {
      headers: {
        'ocp-apim-subscription-key': SEC_KEY,
        'cache-control': 'no-cache',
        Accept: 'application/json',
      },
      signal: AbortSignal.timeout(15000),
    });

    const body = await res.text();
    return new Response(body, {
      status: res.status,
      headers: {
        'Content-Type': 'application/json',
        ...corsHeaders(),
      },
    });
  },
};

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };
}
