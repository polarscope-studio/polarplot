// ─── LoTW confirmation sync ──────────────────────────────────────────────────
// Downloads the user's LoTW QSL report (read-only) through the Polarplot Worker and marks
// matching log QSOs as LoTW-confirmed. LoTW sends no CORS headers, so the browser can't call
// it directly; the Worker's POST /lotw route builds the ARRL request server-side so the
// password never appears in a URL the browser sends.
//
// Matching follows LoTW's own rules: same callsign, band and mode group, within 30 minutes.

/**
 * @param {{ proxyUrl: string, login: string, password: string, since?: string }} opts
 *        since = 'YYYY-MM-DD' → only QSLs received since then (incremental sync)
 * @returns {Promise<string>} raw ADIF
 */
export async function fetchLotwReport({ proxyUrl, login, password, since }) {
    if (!proxyUrl || proxyUrl.endsWith('?')) {
        throw new Error('LoTW sync needs the Polarplot proxy (the default Data Proxy setting).');
    }
    const endpoint = new URL('lotw', proxyUrl.endsWith('/') ? proxyUrl : proxyUrl + '/').href;
    const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ login, password, since: since || null }),
    });
    if (res.status === 404 || res.status === 403) throw new Error('The proxy does not support LoTW yet. The Cloudflare Worker needs redeploying.');
    if (!res.ok) throw new Error(`LoTW request failed (HTTP ${res.status}).`);
    const text = await res.text();
    // A bad login comes back as an HTML page rather than ADIF
    if (!/<eoh>/i.test(text)) {
        if (/password|login|incorrect/i.test(text)) throw new Error('LoTW rejected the username or password.');
        throw new Error('LoTW returned an unexpected response. Try again later.');
    }
    if (!/<APP_LoTW_EOF>/i.test(text)) throw new Error('The LoTW download was cut short. Try again.');
    return text;
}

export function parseAdif(text) {
    const eoh = text.toUpperCase().indexOf('<EOH>');
    const body = eoh === -1 ? text : text.slice(eoh + 5);
    return body.split(/<EOR>/i).map(rec => {
        const q = {};
        const re = /<([A-Za-z0-9_]+):(\d+)(?::[^>]*)?>/g;
        let m;
        while ((m = re.exec(rec))) {
            q[m[1].toUpperCase()] = rec.substr(m.index + m[0].length, +m[2]).trim();
            re.lastIndex = m.index + m[0].length + +m[2];
        }
        return q;
    }).filter(q => q.CALL);
}

const PHONE = new Set(['SSB', 'USB', 'LSB', 'AM', 'FM', 'DIGITALVOICE', 'DV', 'C4FM', 'DSTAR', 'DMR']);
const modeGroup = m => {
    m = (m || '').toUpperCase();
    return m === 'CW' ? 'CW' : PHONE.has(m) ? 'PHONE' : 'DATA';
};
const minutes = (date, time) => {
    if (!/^\d{8}$/.test(date || '')) return null;
    const t = (time || '0000').padEnd(4, '0');
    return Date.UTC(+date.slice(0, 4), +date.slice(4, 6) - 1, +date.slice(6, 8), +t.slice(0, 2), +t.slice(2, 4)) / 60000;
};
const baseCall = c => (c || '').toUpperCase().split('/').reduce((a, b) => (b.length > a.length ? b : a), '');

// Fields LoTW reports for the confirmed station (qso_qsldetail=yes). They describe what the
// other station certified, so they replace smart-reader guesses — never values the user logged.
const DETAIL_FIELDS = ['GRIDSQUARE', 'CQZ', 'ITUZ', 'STATE', 'CNTY', 'IOTA', 'DXCC', 'COUNTRY'];

/**
 * Apply LoTW confirmations to log QSOs in place.
 * @returns {{ records, matched, newlyConfirmed, unmatched }}
 */
export function applyLotwConfirmations(qsos, lotwRecords) {
    const index = new Map();
    qsos.forEach(q => {
        const k = `${(q.CALL || '').toUpperCase()}|${(q.BAND || '').toUpperCase()}`;
        if (!index.has(k)) index.set(k, []);
        index.get(k).push(q);
    });
    let matched = 0, newlyConfirmed = 0, unmatched = 0;
    for (const r of lotwRecords) {
        if (r.QSL_RCVD && r.QSL_RCVD !== 'Y') continue; // only actual confirmations
        const cands = index.get(`${r.CALL.toUpperCase()}|${(r.BAND || '').toUpperCase()}`) || [];
        const rt = minutes(r.QSO_DATE, r.TIME_ON), rg = modeGroup(r.MODE);
        const hits = cands.filter(q => {
            if (modeGroup(q.MODE) !== rg) return false;
            const qt = minutes(q.QSO_DATE, q.TIME_ON);
            if (rt == null || qt == null || Math.abs(qt - rt) > 30) return false;
            // When both sides say which of my callsigns was used, they must agree
            return !(q.STATION_CALLSIGN && r.STATION_CALLSIGN) || baseCall(q.STATION_CALLSIGN) === baseCall(r.STATION_CALLSIGN);
        });
        if (!hits.length) { unmatched++; continue; }
        matched++;
        hits.forEach(q => {
            if (q.LOTW_QSL_RCVD !== 'Y') newlyConfirmed++;
            q.LOTW_QSL_RCVD = 'Y';
            if (r.QSLRDATE) q.LOTW_QSLRDATE = r.QSLRDATE;
            DETAIL_FIELDS.forEach(f => {
                if (!r[f] || (q[f] && !q._inferred?.includes(f))) return;
                q[f] = r[f];
                if (q._inferred) q._inferred = q._inferred.filter(x => x !== f);
            });
        });
    }
    return { records: lotwRecords.length, matched, newlyConfirmed, unmatched };
}
