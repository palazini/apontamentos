// api/supabase/[...path].js
const SUPABASE_URL  = process.env.SUPABASE_URL;
const SUPABASE_ANON = process.env.SUPABASE_ANON_KEY;

export default async function handler(req, res) {
  // monta caminho alvo
  const segs = (req.query.path || []);
  const qs   = req.url && req.url.includes('?') ? req.url.substring(req.url.indexOf('?')) : '';
  const target = `${SUPABASE_URL}/rest/v1/${segs.join('/')}${qs}`;

  // Preflight
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin', req.headers.origin || '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PATCH,DELETE,HEAD,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers',
      'authorization,apikey,content-type,prefer,range,accept-profile,content-profile'
    );
    return res.status(204).end();
  }

  // Cabeçalhos que vamos repassar/ajustar
  const headers = {
    apikey: SUPABASE_ANON,
    Authorization: `Bearer ${SUPABASE_ANON}`,
  };

  // Copia alguns cabeçalhos úteis do cliente
  for (const h of [
    'content-type', 'prefer', 'range', 'range-unit',
    'accept-profile', 'content-profile'
  ]) {
    const v = req.headers[h];
    if (v) headers[h] = Array.isArray(v) ? v.join(',') : v;
  }

  // Corpo (quando houver)
  let body;
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    const b = req.body;
    if (typeof b === 'string' || Buffer.isBuffer(b)) body = b;
    else if (b != null) {
      body = JSON.stringify(b);
      if (!headers['content-type']) headers['content-type'] = 'application/json';
    }
  }

  // Proxy
  const upstream = await fetch(target, {
    method: req.method,
    headers,
    body,
  });

  // Repassa resposta
  res.status(upstream.status);
  upstream.headers.forEach((v, k) => {
    // Evita sobrescrever CORS com algo estranho do Supabase
    if (!['content-length', 'connection'].includes(k)) res.setHeader(k, v);
  });
  res.setHeader('Access-Control-Allow-Origin', req.headers.origin || '*');

  const buf = Buffer.from(await upstream.arrayBuffer());
  res.end(buf);
}
