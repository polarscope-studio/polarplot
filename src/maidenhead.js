// ─── Maidenhead helpers + coordinate sanity check ────────────────────────────
// Some loggers write LAT/LON that don't match the GRIDSQUARE the station actually sent
// (QRZ's logbook export does this for many 4-character grids, dropping them in the sea).
// The grid is what came over the air, so when the two disagree the grid wins.

/** { west, south, w, h } of a 4- or 6-character locator, or null if invalid. */
export function gridBounds(grid) {
    if (!grid || !/^[A-R]{2}[0-9]{2}/i.test(grid)) return null;
    const g = grid.toUpperCase();
    let west = (g.charCodeAt(0) - 65) * 20 - 180 + (+g[2]) * 2;
    let south = (g.charCodeAt(1) - 65) * 10 - 90 + (+g[3]);
    if (/^[A-X]{2}$/.test(g.slice(4, 6))) {
        west += (g.charCodeAt(4) - 65) / 12;
        south += (g.charCodeAt(5) - 65) / 24;
        return { west, south, w: 1 / 12, h: 1 / 24 };
    }
    return { west, south, w: 2, h: 1 };
}

/** True when lat/lon lie inside the locator's square (with a small tolerance). */
export function coordsInGrid(lat, lon, grid, tol = 0.05) {
    const b = gridBounds(grid);
    if (!b) return true; // nothing to check against
    return lon >= b.west - tol && lon <= b.west + b.w + tol && lat >= b.south - tol && lat <= b.south + b.h + tol;
}

/**
 * A point inside the square, spread by a stable hash of `seed` (e.g. the callsign) so stations
 * sharing a 4-char square don't stack on its centre — and don't jump around on every reload.
 */
export function gridPoint(grid, seed = '') {
    const b = gridBounds(grid);
    if (!b) return null;
    let h = 2166136261;
    for (const c of String(seed)) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
    const r1 = ((h >>> 0) % 1000) / 1000, r2 = ((Math.imul(h, 2654435761) >>> 0) % 1000) / 1000;
    // Stay within the central 80% so the dot is clearly inside its square
    return { lat: b.south + b.h * (0.1 + 0.8 * r2), lon: b.west + b.w * (0.1 + 0.8 * r1) };
}

/**
 * Replace LAT/LON that contradict GRIDSQUARE. Only a logged grid is trusted (not one the
 * smart reader derived from those same coordinates). Returns how many QSOs were corrected.
 */
export function repairCoordinates(qsos) {
    let fixed = 0;
    for (const q of qsos) {
        if (!q.GRIDSQUARE || q._inferred?.includes('GRIDSQUARE')) continue;
        const lat = parseFloat(q.LAT), lon = parseFloat(q.LON);
        if (isNaN(lat) || isNaN(lon) || coordsInGrid(lat, lon, q.GRIDSQUARE)) continue;
        const p = gridPoint(q.GRIDSQUARE, q.CALL);
        if (!p) continue;
        q._loggedLatLon = q._loggedLatLon || [q.LAT, q.LON];
        q.LAT = String(p.lat);
        q.LON = String(p.lon);
        q._fromGrid = true;
        fixed++;
    }
    return fixed;
}
