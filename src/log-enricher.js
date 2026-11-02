// ─── Smart log reader ────────────────────────────────────────────────────────
// Fills in fields a log often lacks, so awards and statistics work on any ADIF:
//   COUNTRY / CONT       ← callsign, via the CTY country file (AD1C, country-files.com)
//   CQZ / ITUZ           ← the station's location, via CQ/ITU zone boundaries;
//                          falls back to the CTY prefix zone when there is no location
//   GRIDSQUARE           ← the station's coordinates (6-character locator)
//   STATE                ← the station's location, via subdivision boundaries
//                          (US, Alaska, Hawaii, Canada, Japan, NL, CH, PL)
//
// Logged values always win. Filled fields are listed in q._inferred so they can be
// recomputed when better data arrives (e.g. after a QRZ lookup adds coordinates).
// q._cty keeps the callsign lookup: { name, cont, cq, itu, wae, lat, lon } (wae = WAE-only entity name, if any;
// lat/lon = entity centre, converted from CTY's west-positive longitude).

import { CtyEngine } from './cty-engine.js';

// CTY entity name → DXCC number (only the entities we have subdivision boundaries for)
const STATE_ENTITY = { 'United States': 291, 'Alaska': 6, 'Hawaii': 110, 'Canada': 1, 'Japan': 339, 'Netherlands': 263, 'Switzerland': 287, 'Poland': 269 };

let cty = null, zones = null, states = null, loading = null;

function load() {
    if (loading) return loading;
    const base = import.meta.env.BASE_URL || './';
    const json = p => fetch(base + p).then(r => r.ok ? r.json() : null).catch(() => null);
    cty = new CtyEngine();
    loading = Promise.all([cty.load(base + 'cty.dat'), json('geo/zones.json'), json('geo/states.json')])
        .then(([, z, s]) => { zones = z; states = s; });
    return loading;
}

// Even-odd point-in-polygon across all rings (handles holes and multi-part shapes)
function inRings(lon, lat, rings) {
    let inside = false;
    for (const ring of rings) {
        for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
            const [xi, yi] = ring[i], [xj, yj] = ring[j];
            if ((yi > lat) !== (yj > lat) && lon < (xj - xi) * (lat - yi) / (yj - yi) + xi) inside = !inside;
        }
    }
    return inside;
}

function lookup(features, lat, lon) {
    if (!features) return null;
    // Zone polygons near the date line use longitudes beyond ±180
    for (const x of [lon, lon - 360, lon + 360]) {
        for (const [code, [x0, y0, x1, y1], rings] of features) {
            if (x < x0 || x > x1 || lat < y0 || lat > y1) continue;
            if (inRings(x, lat, rings)) return code;
        }
    }
    return null;
}

function gridToLatLon(grid) {
    if (!grid || !/^[A-R]{2}[0-9]{2}/i.test(grid)) return null;
    const g = grid.toUpperCase();
    let lon = (g.charCodeAt(0) - 65) * 20 - 180 + (+g[2]) * 2;
    let lat = (g.charCodeAt(1) - 65) * 10 - 90 + (+g[3]);
    if (/^[A-X]{2}$/.test(g.slice(4, 6))) { lon += (g.charCodeAt(4) - 65) / 12 + 1 / 24; lat += (g.charCodeAt(5) - 65) / 24 + 1 / 48; }
    else { lon += 1; lat += 0.5; }
    return { lat, lon, precise: g.length >= 6 };
}

// Best known location of the other station. "precise" = good enough for state boundaries.
function locate(q) {
    const lat = parseFloat(q.LAT), lon = parseFloat(q.LON);
    if (!isNaN(lat) && !isNaN(lon)) {
        // Coordinates derived from a 4-char grid are only square-centre accurate
        const fromSmallGrid = q._fromGrid && (q.GRIDSQUARE || '').length < 6;
        return { lat, lon, precise: !fromSmallGrid };
    }
    return gridToLatLon(q.GRIDSQUARE);
}

function latLonToGrid(lat, lon) {
    const x = Math.min(359.9999, Math.max(0, lon + 180)), y = Math.min(179.9999, Math.max(0, lat + 90));
    const A = 65, a = 97;
    return String.fromCharCode(A + Math.floor(x / 20), A + Math.floor(y / 10))
        + Math.floor((x % 20) / 2) + Math.floor(y % 10)
        + String.fromCharCode(a + Math.floor((x % 2) * 12), a + Math.floor((y % 1) * 24));
}

function setInferred(q, field, value) {
    const logged = q[field] && !(q._inferred && q._inferred.includes(field));
    if (logged) return false;
    if (value == null || value === '') {
        // Drop a stale guess if we can no longer support it
        if (q._inferred?.includes(field)) { delete q[field]; q._inferred = q._inferred.filter(f => f !== field); }
        return false;
    }
    q[field] = String(value);
    if (!q._inferred) q._inferred = [];
    if (!q._inferred.includes(field)) q._inferred.push(field);
    return true;
}

/**
 * Enrich QSOs in place. Safe to call repeatedly.
 * @returns {Promise<{ total, filled: { [field]: count } }>}
 */
export async function enrichQSOs(qsos) {
    await load();
    const filled = { COUNTRY: 0, CONT: 0, CQZ: 0, ITUZ: 0, STATE: 0, GRIDSQUARE: 0 };
    const memo = new Map(); // callsign → cty result
    for (const q of qsos) {
        const call = (q.CALL || '').toUpperCase();
        if (!memo.has(call)) {
            const r = cty?.resolve(call);
            const w = cty?.resolve(call, { dxccOnly: false });
            memo.set(call, r ? { name: r.name, cont: r.cont, cq: r.cq, itu: r.itu, wae: w && w.name !== r.name ? w.name : null, lat: r.lat, lon: -r.lon } : null);
        }
        const c = q._cty = memo.get(call);
        const loc = locate(q);
        // Grid from real coordinates only (never from a grid-derived centre)
        const hasCoords = !isNaN(parseFloat(q.LAT)) && !isNaN(parseFloat(q.LON)) && !q._fromGrid;
        if (setInferred(q, 'GRIDSQUARE', hasCoords ? latLonToGrid(parseFloat(q.LAT), parseFloat(q.LON)) : null)) filled.GRIDSQUARE++;

        if (c && !q.DXCC && setInferred(q, 'COUNTRY', c.name)) filled.COUNTRY++;
        if (setInferred(q, 'CONT', c?.cont)) filled.CONT++;
        const cq = loc ? lookup(zones?.cq, loc.lat, loc.lon) : null;
        const itu = loc ? lookup(zones?.itu, loc.lat, loc.lon) : null;
        if (setInferred(q, 'CQZ', cq ?? c?.cq)) filled.CQZ++;
        if (setInferred(q, 'ITUZ', itu ?? c?.itu)) filled.ITUZ++;

        const ent = STATE_ENTITY[c?.name];
        const st = ent && loc?.precise ? lookup(states?.[ent], loc.lat, loc.lon) : null;
        if (setInferred(q, 'STATE', st)) filled.STATE++;
    }
    return { total: qsos.length, filled };
}

let countriesPromise = null;
/** Country outlines (Natural Earth), loaded only when the Countries Worked map is opened. */
export function getCountries() {
    if (!countriesPromise) {
        const base = import.meta.env.BASE_URL || './';
        countriesPromise = fetch(base + 'geo/countries.json').then(r => r.ok ? r.json() : []).catch(() => { countriesPromise = null; return []; });
    }
    return countriesPromise;
}

/** Every DXCC entity in the CTY file (WAE-only ones excluded): name, centre, primary prefix. */
export async function getDxccEntities() {
    await load();
    return (cty?.entities || []).filter(e => !e.waeOnly)
        .map(e => ({ name: e.name, lat: e.lat, lon: -e.lon, prefix: e.primaryPrefix })); // CTY longitudes are west-positive
}

/** Zone and subdivision boundaries, for drawing award maps. */
export async function getGeoData() {
    await load();
    return { zones, states };
}

export function isInferred(q, field) {
    return !!q._inferred?.includes(field);
}
