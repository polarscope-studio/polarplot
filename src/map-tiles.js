// ─── Map tile providers ──────────────────────────────────────────────────────
// CARTO basemaps (Dark Matter, Arctic White, Voyager) need a free API key.
// Request one at https://carto.com/basemaps (no account needed; free up to 5M tiles/month
// for non-commercial use) and paste it below.
//
// CARTO requires localhost to use a separate key from the live site, so there are two:
//   LIVE  – restricted (Referer) to https://polarplot.net and https://www.polarplot.net
//   LOCAL – restricted to http://localhost:5173, http://127.0.0.1:5173 (and :4173 for `npm run preview`)
// The right one is picked from the address the page is running on.
//
// Note: map tiles are fetched by the visitor's browser, so these keys are visible in the
// published site — that's expected for CARTO basemap keys. Don't reuse them for other projects.
const CARTO_API_KEY_LIVE = 'cb1_47xo_1_922889042c1de4cb61428d4c';
const CARTO_API_KEY_LOCAL = 'cb1_47xo_2_f4ae4678287bc0c015481c9e';

const isLocal = typeof location !== 'undefined' && /^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname);
export const CARTO_API_KEY = isLocal ? CARTO_API_KEY_LOCAL : CARTO_API_KEY_LIVE;

const isCarto = url => /basemaps\.cartocdn\.com/.test(url);

/** Tile URL with the provider key added where one is needed. */
export function tileUrl(url) {
    if (!isCarto(url) || !CARTO_API_KEY) return url;
    return `${url}${url.includes('?') ? '&' : '?'}key=${encodeURIComponent(CARTO_API_KEY)}`;
}

/** Credit line each provider's terms ask to keep visible on the map. */
export function tileAttribution(url) {
    if (isCarto(url)) return '© <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a> contributors © <a href="https://carto.com/attributions" target="_blank" rel="noopener">CARTO</a>';
    if (/openstreetmap\.org/.test(url)) return '© <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a> contributors';
    if (/arcgisonline\.com/.test(url)) return 'Tiles © Esri';
    return '';
}
