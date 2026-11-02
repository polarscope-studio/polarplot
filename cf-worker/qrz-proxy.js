/**
 * Polarplot QRZ Proxy — Cloudflare Worker
 * Forwards requests to QRZ XML and Logbook APIs, adding CORS headers.
 * Only proxies to allowed QRZ domains — nothing else.
 */

const ALLOWED_ORIGINS = [
  'https://polarplot.net',
  'https://www.polarplot.net',
  'http://localhost:5173',
  'http://127.0.0.1:5173',
];

const ALLOWED_HOSTS = [
  'xmldata.qrz.com',
  'logbook.qrz.com',
];

const CORS_HEADERS = {
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Max-Age': '86400',
};

async function handleLotw(request, allowedOrigin) {
  const headers = { 'Access-Control-Allow-Origin': allowedOrigin, 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' };
  let body;
  try { body = await request.json(); } catch { return new Response('Invalid request', { status: 400, headers }); }
  const { login, password, since } = body || {};
  if (typeof login !== 'string' || typeof password !== 'string' || !login || !password || login.length > 64 || password.length > 128) {
    return new Response('Missing LoTW username or password', { status: 400, headers });
  }
  const params = new URLSearchParams({
    login, password,
    qso_query: '1', qso_qsl: 'yes', qso_qsldetail: 'yes', qso_mydetail: 'yes',
    qso_qslsince: /^\d{4}-\d{2}-\d{2}$/.test(since || '') ? since : '1900-01-01',
  });
  const upstream = await fetch(`https://lotw.arrl.org/lotwuser/lotwreport.adi?${params}`, {
    headers: { 'User-Agent': 'Polarplot/1.9' },
  });
  return new Response(upstream.body, { status: upstream.status, headers });
}

export default {
  async fetch(request, env, ctx) {
    const origin = request.headers.get('Origin') || '';
    const allowedOrigin = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];

    // Handle CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        status: 204,
        headers: { ...CORS_HEADERS, 'Access-Control-Allow-Origin': allowedOrigin },
      });
    }

    const url = new URL(request.url);

    // LoTW confirmation report. Credentials arrive in the POST body (never in a browser URL)
    // and are only forwarded to ARRL over HTTPS — nothing is logged or stored here.
    if (url.pathname === '/lotw' && request.method === 'POST') {
      return handleLotw(request, allowedOrigin);
    }

    // Target URL is everything after the worker path, e.g. /https://xmldata.qrz.com/...
    const targetUrl = url.pathname.slice(1) + url.search;

    // Validate target is a QRZ domain
    let target;
    try {
      target = new URL(targetUrl);
    } catch {
      return new Response('Invalid target URL', { status: 400 });
    }

    if (!ALLOWED_HOSTS.includes(target.hostname)) {
      return new Response('Forbidden: target host not allowed', { status: 403 });
    }

    // Forward the request
    const proxyRequest = new Request(targetUrl, {
      method: request.method,
      headers: { 'User-Agent': 'Polarplot/1.5' },
      body: request.method === 'POST' ? request.body : undefined,
    });

    const response = await fetch(proxyRequest);
    const responseHeaders = new Headers(response.headers);
    responseHeaders.set('Access-Control-Allow-Origin', allowedOrigin);
    responseHeaders.set('Access-Control-Allow-Methods', CORS_HEADERS['Access-Control-Allow-Methods']);
    responseHeaders.set('Access-Control-Allow-Headers', CORS_HEADERS['Access-Control-Allow-Headers']);

    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers: responseHeaders,
    });
  },
};
