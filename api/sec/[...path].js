const SEC_KEY = 'd65ae47a9e434f909e5bea3dd0268571';

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.status(200).end();
    return;
  }

  // req.url = /api/sec/v2/fund/... → strip /api/sec
  const path = req.url.replace(/^\/api\/sec/, '');
  const url = `https://api.sec.or.th${path}`;

  try {
    const response = await fetch(url, {
      headers: {
        'ocp-apim-subscription-key': SEC_KEY,
        'cache-control': 'no-cache',
        Accept: 'application/json',
      },
    });

    const text = await response.text();
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Content-Type', 'application/json');
    res.status(response.status).send(text);
  } catch (e) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.status(500).json({ error: e.message });
  }
}
