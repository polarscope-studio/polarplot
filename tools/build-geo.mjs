// Builds the compact boundary files used by the smart log reader (src/log-enricher.js).
//
//   node tools/build-geo.mjs
//
// Source: Wavelog's GeoJSON (MIT licence, https://github.com/wavelog/wavelog/tree/master/assets/json/geojson)
// Output: public/geo/zones.json     – CQ & ITU zone polygons
//         public/geo/states.json    – first-level subdivisions per DXCC entity (ADIF STATE codes)
//         public/geo/countries.json – country outlines for the Countries Worked map, from
//                                     Natural Earth 1:50m map units (public domain)
//
// Polygons are simplified (Douglas–Peucker) and rounded so the files stay small enough to
// load in the browser; the accuracy loss (~1-2 km) is far below a 6-character grid square.

import fs from 'fs';

const SRC = 'https://raw.githubusercontent.com/wavelog/wavelog/master/assets/json/geojson/';
// DXCC entity number → which awards need it
const STATE_ENTITIES = [291, 6, 110, 1, 339, 263, 287, 269];

async function fetchJson(name) {
    const res = await fetch(SRC + name);
    if (!res.ok) throw new Error(`${name}: HTTP ${res.status}`);
    return JSON.parse((await res.text()).replace(/^﻿/, ''));
}

function simplify(points, tol) {
    if (points.length <= 4) return points;
    const sq = tol * tol;
    const keep = new Uint8Array(points.length);
    keep[0] = keep[points.length - 1] = 1;
    const stack = [[0, points.length - 1]];
    while (stack.length) {
        const [a, b] = stack.pop();
        const [ax, ay] = points[a], [bx, by] = points[b];
        const dx = bx - ax, dy = by - ay, len = dx * dx + dy * dy;
        let max = 0, idx = -1;
        for (let i = a + 1; i < b; i++) {
            const [px, py] = points[i];
            let t = len ? ((px - ax) * dx + (py - ay) * dy) / len : 0;
            t = Math.max(0, Math.min(1, t));
            const ex = ax + t * dx - px, ey = ay + t * dy - py, d = ex * ex + ey * ey;
            if (d > max) { max = d; idx = i; }
        }
        if (max > sq) { keep[idx] = 1; stack.push([a, idx], [idx, b]); }
    }
    return points.filter((_, i) => keep[i]);
}

// → [code, [minLon, minLat, maxLon, maxLat], [[ring], [ring], ...]]  (all rings of all parts; even-odd test)
function compact(feature, code, tol) {
    const g = feature.geometry;
    const polys = g.type === 'Polygon' ? [g.coordinates] : g.coordinates;
    const rings = [];
    polys.forEach(poly => poly.forEach(ring => {
        const r = simplify(ring, tol).map(([x, y]) => [Math.round(x * 1000) / 1000, Math.round(y * 1000) / 1000]);
        if (r.length >= 4) rings.push(r);
    }));
    const xs = rings.flat().map(p => p[0]), ys = rings.flat().map(p => p[1]);
    return [code, [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)], rings];
}

const cq = await fetchJson('cqzones.geojson');
const itu = await fetchJson('ituzones.geojson');
const zones = {
    cq: cq.features.map(f => compact(f, f.properties.cq_zone_number, 0.02)),
    itu: itu.features.map(f => compact(f, f.properties.itu_zone_number, 0.02)),
};

const states = {};
for (const dxcc of STATE_ENTITIES) {
    const gj = await fetchJson(`states_${dxcc}.geojson`);
    states[dxcc] = gj.features.map(f => compact(f, f.properties.code, 0.01));
}

// Countries: keyed like Polarplot's flag codes (lower-case ISO 3166-1 alpha-2), with the UK
// split into its four DXCC entities. Map units that share a code (Belgium's regions…) merge.
const NE = 'https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_50m_admin_0_map_units.geojson';
const UK = { ENG: 'gb-eng', SCT: 'gb-sct', WLS: 'gb-wls', NIR: 'gb-nir' };
const ne = JSON.parse((await (await fetch(NE)).text()).replace(/^﻿/, ''));
const byCode = new Map();
for (const f of ne.features) {
    const p = f.properties;
    const code = UK[p.GU_A3] || (p.ISO_A2_EH && p.ISO_A2_EH !== '-99' ? p.ISO_A2_EH.toLowerCase() : null);
    if (!code) continue;
    const [, bbox, rings] = compact(f, code, 0.03);
    if (!rings.length) continue;
    const name = UK[p.GU_A3] ? p.GEOUNIT : p.ADMIN;
    const prev = byCode.get(code);
    if (!prev) byCode.set(code, [code, bbox, rings, name]);
    else {
        prev[1] = [Math.min(prev[1][0], bbox[0]), Math.min(prev[1][1], bbox[1]), Math.max(prev[1][2], bbox[2]), Math.max(prev[1][3], bbox[3])];
        prev[2].push(...rings);
    }
}
const countries = [...byCode.values()];

fs.mkdirSync('public/geo', { recursive: true });
fs.writeFileSync('public/geo/zones.json', JSON.stringify(zones));
fs.writeFileSync('public/geo/states.json', JSON.stringify(states));
fs.writeFileSync('public/geo/countries.json', JSON.stringify(countries));
for (const f of ['zones.json', 'states.json', 'countries.json']) console.log(f, (fs.statSync('public/geo/' + f).size / 1024).toFixed(0), 'KB');
