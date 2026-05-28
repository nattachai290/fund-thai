const SEC_KEY = 'd65ae47a9e434f909e5bea3dd0268571';

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin', '*');
    return res.status(200).end();
  }

  const targetUrl = req.query.url;
  if (!targetUrl?.startsWith('https://api.sec.or.th/')) {
    return res.status(400).json({ error: 'invalid url' });
  }

  try {
    const response = await fetch(targetUrl, {
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
