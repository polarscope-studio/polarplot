/**
 * ADIF Worker for Polarplot
 * Handles parsing and coordinate conversion in a background thread.
 */

// Simple robust parser logic for the worker
function parseADIF(adifString) {
    const eohIndex = adifString.toUpperCase().indexOf('<EOH>');
    const dataPart = eohIndex !== -1 ? adifString.substring(eohIndex + 5) : adifString;
    const records = dataPart.split(/<EOR>/i);
    const qsos = [];

    for (const record of records) {
        if (!record.trim()) continue;
        const qso = parseRecord(record);
        if (qso.CALL) qsos.push(qso);
    }
    return qsos;
}

function parseRecord(record) {
    const qso = {};
    const regex = /<([^:>]+):(\d+)(?::[^>]+)?>([^<]*)/gi;
    let match;

    while ((match = regex.exec(record)) !== null) {
        const tag = match[1].toUpperCase();
        const length = parseInt(match[2]);
        const value = match[3].substring(0, length).trim();
        qso[tag] = value;
    }

    if (qso.QSO_DATE) {
        qso.formattedDate = `${qso.QSO_DATE.substring(0,4)}-${qso.QSO_DATE.substring(4,6)}-${qso.QSO_DATE.substring(6,8)}`;
    }

    // Auto-decode coordinates if present (handles WRL N/S/E/W DDD MM.MMM format)
    ['LAT', 'LON', 'MY_LAT', 'MY_LON'].forEach(field => {
        if (qso[field]) qso[field] = decodeCoordinate(qso[field]);
    });

    // Derive LAT/LON from GRIDSQUARE when not provided (WSJT-X, N1MM, etc.)
    if ((!qso.LAT || !qso.LON) && qso.GRIDSQUARE) {
        const coords = gridToCoords(qso.GRIDSQUARE);
        if (coords) { qso.LAT = coords.lat; qso.LON = coords.lon; qso._fromGrid = true; }
    }

    return qso;
}

function gridToCoords(grid) {
    if (!grid || grid.length < 4) return null;
    const g = grid.toUpperCase();
    const lon = (g.charCodeAt(0) - 65) * 20 - 180 + (parseInt(g[2]) * 2) + (g.length >= 6 ? (g.charCodeAt(4) - 65) * (2/24) + (1/24) : 1);
    const lat = (g.charCodeAt(1) - 65) * 10 - 90  + parseInt(g[3]) + (g.length >= 6 ? (g.charCodeAt(5) - 65) * (1/24) + (0.5/24) : 0.5);
    if (isNaN(lat) || isNaN(lon)) return null;
    // Add jitter so grid-derived contacts don't stack on exact cell centres
    const jLon = g.length >= 6 ? (Math.random() - 0.5) * (2/24) : (Math.random() - 0.5) * 1.6;
    const jLat = g.length >= 6 ? (Math.random() - 0.5) * (1/24) : (Math.random() - 0.5) * 0.8;
    return { lat: lat + jLat, lon: lon + jLon };
}

function decodeCoordinate(coordStr) {
    if (typeof coordStr !== 'string') return coordStr;
    const direction = coordStr.charAt(0).toUpperCase();
    if (!['N','S','E','W'].includes(direction)) return parseFloat(coordStr);
    
    const parts = coordStr.substring(1).trim().split(' ');
    if (parts.length < 2) {
        const val = parseFloat(coordStr.substring(1));
        return (direction === 'S' || direction === 'W') ? -val : val;
    }

    const degrees = parseFloat(parts[0]);
    const minutes = parseFloat(parts[1]);
    let decimal = degrees + (minutes / 60);
    return (direction === 'S' || direction === 'W') ? -decimal : decimal;
}

self.onmessage = function(e) {
    const { action, data } = e.data;
    if (action === 'parse') {
        const eohIndex = data.toUpperCase().indexOf('<EOH>');
        const dataPart = eohIndex !== -1 ? data.substring(eohIndex + 5) : data;
        const records = dataPart.split(/<EOR>/i);
        const qsos = [];
        const total = records.length;
        let chunkCount = 0;

        for (let i = 0; i < total; i++) {
            const record = records[i];
            if (!record.trim()) continue;
            const qso = parseRecord(record);
            if (qso.CALL) qsos.push(qso);
            
            // Stream chunks every 1000 records or at the end
            if (i % 1000 === 0 && qsos.length > 0) {
                self.postMessage({
                    action: 'chunkResult',
                    data: qsos.slice(chunkCount * 1000)
                });
                chunkCount++;
                self.postMessage({ action: 'progress', percent: Math.round((i / total) * 100) });
            }
        }
        self.postMessage({ action: 'progress', percent: 100 });
        self.postMessage({ action: 'parseResult', data: qsos });
    }
};
