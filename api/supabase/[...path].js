// /api/supabase/[...path].js

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_ANON = process.env.SUPABASE_ANON_KEY;

export default async function handler(req, res) {
  const segs = (req.query.path || []);
  const qs = req.url && req.url.includes('?') ? req.url.substring(req.url.indexOf('?')) : '';
  const target = `${SUPABASE_URL}/rest/v1/${segs.join('/')}${qs}`;

  // Preflight
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin', req.headers.origin || '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PATCH,DELETE,HEAD,OPTIONS');
    res.setHeader(
      'Access-Control-Allow-Headers',
      'authorization,apikey,content-type,prefer,range,accept-profile,content-profile'
    );
    return res.status(204).end();
  }

  const headers = {
    apikey: SUPABASE_ANON,
    Authorization: `Bearer ${SUPABASE_ANON}`,
  };

  for (const h of [
    'content-type',
    'prefer',
    'range',
    'range-unit',
    'accept-profile',
    'content-profile',
  ]) {
    const v = req.headers[h];
    if (v) headers[h] = Array.isArray(v) ? v.join(',') : v;
  }

  let body;
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    const b = req.body;
    if (typeof b === 'string' || Buffer.isBuffer(b)) body = b;
    else if (b != null) {
      body = JSON.stringify(b);
      if (!headers['content-type']) headers['content-type'] = 'application/json';
    }
  }

  const upstream = await fetch(target, { method: req.method, headers, body });
  const buf = Buffer.from(await upstream.arrayBuffer());

  upstream.headers.forEach((v, k) => res.setHeader(k, v));
  res.setHeader('Access-Control-Allow-Origin', req.headers.origin || '*');

  return res.status(upstream.status).send(buf);
}
