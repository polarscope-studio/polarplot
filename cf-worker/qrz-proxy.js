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
