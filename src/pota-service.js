// ─── POTA.app link ───────────────────────────────────────────────────────────
// Reads a callsign's PUBLIC Parks on the Air profile (api.pota.app allows browser requests,
// no login): official hunter/activator totals, awards earned, recent activations and the
// most recent hunter QSOs. The full hunted-park list needs a pota.app login, so it isn't here.

export async function fetchPotaProfile(callsign) {
    const call = (callsign || '').trim().toUpperCase();
    if (!call) throw new Error('Enter a callsign.');
    const res = await fetch(`https://api.pota.app/profile/${encodeURIComponent(call)}`);
    if (res.status === 404) throw new Error(`${call} isn't a POTA.app account. If it's linked to another callsign of yours, use that one.`);
    if (!res.ok) throw new Error(`POTA.app didn't respond (HTTP ${res.status}). Try again later.`);
    const data = await res.json();
    if (typeof data === 'string') throw new Error(data === 'Callsign not found' ? `${call} isn't registered on POTA.app.` : data);
    return {
        callsign: data.callsign,
        otherCallsigns: data.other_callsigns || [],
        name: data.name,
        stats: data.stats || {},
        awards: data.awards || [],
        activations: data.recent_activity?.activations || [],
        hunterQsos: data.recent_activity?.hunter_qsos || [],
        fetchedAt: new Date().toISOString().slice(0, 10),
    };
}

const baseCall = c => (c || '').toUpperCase().split('/').reduce((a, b) => (b.length > a.length ? b : a), '');
const minutes = (date, time) => {
    if (!/^\d{8}$/.test(date || '')) return null;
    const t = (time || '0000').padEnd(4, '0');
    return Date.UTC(+date.slice(0, 4), +date.slice(4, 6) - 1, +date.slice(6, 8), +t.slice(0, 2), +t.slice(2, 4)) / 60000;
};

/**
 * Add the park reference from POTA.app's recent hunter QSOs to matching log QSOs
 * (same station, band and date, within 30 minutes). Never overwrites a logged reference.
 * @returns {number} how many log QSOs gained a park
 */
export function applyPotaHunterQsos(qsos, hunterQsos) {
    let tagged = 0;
    for (const h of hunterQsos) {
        const [d, t = ''] = String(h.date || '').split('T');
        const date = d.replace(/-/g, ''), time = t.replace(/:/g, '').slice(0, 4);
        const ht = minutes(date, time), call = baseCall(h.callsign), band = (h.band || '').toUpperCase();
        for (const q of qsos) {
            if (baseCall(q.CALL) !== call || (q.BAND || '').toUpperCase() !== band || q.QSO_DATE !== date) continue;
            const qt = minutes(q.QSO_DATE, q.TIME_ON);
            if (ht != null && qt != null && Math.abs(qt - ht) > 30) continue;
            const refs = (q.POTA_REF || '').split(',').map(s => s.split('@')[0].trim().toUpperCase()).filter(Boolean);
            const ref = String(h.reference || '').toUpperCase();
            if (!ref || refs.includes(ref)) continue;
            if (refs.length && !q._potaFromApp) continue; // a reference the user logged wins
            // Two-fers: POTA lists each park of a multi-park QSO separately, so append
            q.POTA_REF = [...refs, ref].join(',');
            q._potaFromApp = true;
            tagged++;
        }
    }
    return tagged;
}

// ─── Full POTA log via bookmarklet ───────────────────────────────────────────
// pota.app has no log download and its logbook API needs the user's login, so Polarplot
// offers a bookmarklet. Clicked on pota.app while logged in, it uses that page's own session
// to read every page of the user's logbook — hunter AND activator side — and downloads it as
// ADIF, which the user then imports here. Polarplot never sees the POTA password.
//
// Source of truth for the request: pota.app's My Hunter Log page —
//   GET https://api.pota.app/user/logbook?hunterOnly=1|activatorOnly=1&page=N&size=M
//       (Authorization: Cognito idToken, stored by pota.app in a cookie)
//   → { count, entries: [{ qsoDateTime, station_callsign, worked_callsign, band, mode, reference, ... }] }
// Every entry comes from the ACTIVATOR's log: station_callsign = activator, worked_callsign =
// hunter, reference = the activator's park. So for the user's hunter entries the other station
// is station_callsign; for their activator entries it's worked_callsign.
//
// Written as a normal function (no escaping pitfalls); its source becomes the bookmarklet.
// It must stay self-contained: it runs on pota.app, not inside Polarplot.
function potaLogExport() {
    (async () => {
        if (!/(^|\.)pota\.app$/.test(location.hostname)) { alert('Open pota.app and log in, then click this bookmark again.'); return; }
        // pota.app's login (AWS Amplify) is kept in cookies; local/session storage are fallbacks
        const isIdToken = k => /^CognitoIdentityServiceProvider\..+\.idToken$/.test(k);
        let token = null;
        for (const c of document.cookie.split(';')) {
            const i = c.indexOf('=');
            const k = decodeURIComponent(c.slice(0, i).trim());
            if (isIdToken(k)) token = decodeURIComponent(c.slice(i + 1).trim());
        }
        for (const s of [localStorage, sessionStorage]) {
            if (!token) for (const k of Object.keys(s)) if (isIdToken(k)) token = s.getItem(k);
        }
        if (!token) { alert('Log in to pota.app first, then click this bookmark again.'); return; }

        // The site's table shows 100 rows at a time; the API pages the same way, so keep
        // asking for the next page until we have as many entries as it says exist.
        const fetchAll = async (filter) => {
            const out = [];
            let page = 1, total = Infinity;
            while (out.length < total && page < 500) {
                const r = await fetch('https://api.pota.app/user/logbook?' + filter + '=1&page=' + page + '&size=100', { headers: { Authorization: token } });
                if (!r.ok) throw new Error('POTA.app refused the request (' + r.status + '). Reload pota.app, make sure you are logged in, and try again.');
                const d = await r.json();
                total = d.count || 0;
                if (!d.entries || !d.entries.length) break;
                out.push(...d.entries);
                page++;
            }
            return out;
        };
        let hunter, activator;
        try {
            hunter = await fetchAll('hunterOnly');
            activator = await fetchAll('activatorOnly');
        } catch (err) { alert(err.message); return; }

        const f = (k, v) => (v == null || v === '') ? '' : '<' + k + ':' + String(v).length + '>' + v + ' ';
        const when = e => { const dt = String(e.qsoDateTime || '').replace(/\D/g, ''); return f('QSO_DATE', dt.slice(0, 8)) + f('TIME_ON', dt.slice(8, 12)); };
        let adif = 'POTA log exported for Polarplot ' + new Date().toISOString() + '\n<PROGRAMID:21>Polarplot POTA export <EOH>\n';
        for (const e of hunter) {
            adif += f('CALL', e.station_callsign) + when(e) + f('BAND', String(e.band || '').toLowerCase()) + f('MODE', e.mode)
                + f('POTA_REF', e.reference) + f('SIG', 'POTA') + f('SIG_INFO', e.reference)
                + f('STATION_CALLSIGN', e.worked_callsign) + f('APP_POLARPLOT_POTA_ROLE', 'HUNTER') + '<EOR>\n';
        }
        for (const e of activator) {
            adif += f('CALL', e.worked_callsign) + when(e) + f('BAND', String(e.band || '').toLowerCase()) + f('MODE', e.mode)
                + f('MY_POTA_REF', e.reference) + f('MY_SIG', 'POTA') + f('MY_SIG_INFO', e.reference)
                + f('STATION_CALLSIGN', e.station_callsign) + f('APP_POLARPLOT_POTA_ROLE', 'ACTIVATOR') + '<EOR>\n';
        }
        const a = document.createElement('a');
        a.href = URL.createObjectURL(new Blob([adif], { type: 'text/plain' }));
        a.download = 'pota-log.adi';
        document.body.appendChild(a); a.click(); a.remove();
        alert('Downloaded pota-log.adi: ' + hunter.length + ' hunter QSOs and ' + activator.length + ' activator QSOs.\nNow import it on the POTA page in Polarplot.');
    })();
}

/** href for the "drag to your bookmarks bar" link. */
export function potaBookmarkletHref() {
    return 'javascript:' + encodeURIComponent(`(${potaLogExport.toString()})()`);
}

const toIsoTime = r => `${(r.QSO_DATE || '').replace(/(\d{4})(\d{2})(\d{2})/, '$1-$2-$3')}T${(r.TIME_ON || '0000').slice(0, 2)}:${(r.TIME_ON || '0000').slice(2, 4)}:00`;
const refList = v => String(v || '').split(',').map(s => s.split('@')[0].trim().toUpperCase()).filter(Boolean);

/**
 * Tag log QSOs made during the user's activations with the park they were in (MY_POTA_REF).
 * Same matching as hunter QSOs: same station, band and date, within 30 minutes.
 */
function applyActivatorEntries(qsos, entries) {
    let tagged = 0;
    for (const e of entries) {
        const [d, t] = e.date.split('T');
        const date = d.replace(/-/g, ''), em = minutes(date, t.replace(/:/g, '').slice(0, 4));
        const call = baseCall(e.callsign), band = e.band, ref = e.reference.toUpperCase();
        for (const q of qsos) {
            if (baseCall(q.CALL) !== call || (q.BAND || '').toUpperCase() !== band || q.QSO_DATE !== date) continue;
            const qm = minutes(q.QSO_DATE, q.TIME_ON);
            if (em != null && qm != null && Math.abs(qm - em) > 30) continue;
            const refs = refList(q.MY_POTA_REF || (String(q.MY_SIG || '').toUpperCase() === 'POTA' ? q.MY_SIG_INFO : ''));
            if (refs.includes(ref)) { e.inLog = true; continue; }
            if (refs.length && !q._myPotaFromApp) continue; // a park the user logged wins
            q.MY_POTA_REF = [...refs, ref].join(',');
            q.MY_SIG = 'POTA';
            q.MY_SIG_INFO = q.MY_POTA_REF;
            q._myPotaFromApp = true;
            e.inLog = true;
            tagged++;
        }
    }
    return tagged;
}

/** Activations = one park on one UTC day; valid with 10+ QSOs (POTA's rule). */
function summariseActivations(entries) {
    const groups = new Map();
    for (const e of entries) {
        const day = e.date.slice(0, 10);
        for (const ref of refList(e.reference)) {
            const k = ref + '|' + day;
            if (!groups.has(k)) groups.set(k, { reference: ref, date: day, qsos: 0, calls: new Set(), bands: new Set() });
            const g = groups.get(k);
            g.qsos++; g.calls.add(baseCall(e.callsign)); g.bands.add(e.band);
        }
    }
    return [...groups.values()]
        .map(g => ({ reference: g.reference, date: g.date, qsos: g.qsos, stations: g.calls.size, bands: [...g.bands].sort(), valid: g.qsos >= 10 }))
        .sort((a, b) => b.date.localeCompare(a.date));
}

/**
 * Apply an exported POTA log (ADIF from the bookmarklet) to the log.
 * Handles the current export (hunter + activator, role-tagged) and the older hunter-only one.
 * @param {object[]} qsos      log QSOs (modified in place)
 * @param {object[]} records   parsed ADIF records
 */
export function applyPotaLog(qsos, records) {
    const role = r => String(r.APP_POLARPLOT_POTA_ROLE || '').toUpperCase() || (r.MY_POTA_REF ? 'ACTIVATOR' : 'HUNTER');
    const hunterRecs = records.filter(r => r.CALL && role(r) === 'HUNTER' && (r.POTA_REF || r.SIG_INFO));
    const actRecs = records.filter(r => r.CALL && role(r) === 'ACTIVATOR' && (r.MY_POTA_REF || r.MY_SIG_INFO));

    // Older hunter-only exports put the hunter (the user) in CALL. Work out which callsigns
    // are "me" and use the other field for those.
    const mine = new Set(qsos.flatMap(q => [q.STATION_CALLSIGN, q.OPERATOR]).filter(Boolean).map(baseCall));
    const freq = {};
    hunterRecs.forEach(r => { const c = baseCall(r.CALL); freq[c] = (freq[c] || 0) + 1; });
    Object.entries(freq).forEach(([c, n]) => { if (n > hunterRecs.length / 2) mine.add(c); });
    const workedCall = r => (mine.has(baseCall(r.CALL)) && r.STATION_CALLSIGN) ? r.STATION_CALLSIGN : r.CALL;

    const hunter = hunterRecs.map(r => ({ callsign: workedCall(r), band: (r.BAND || '').toUpperCase(), reference: r.POTA_REF || r.SIG_INFO, date: toIsoTime(r) }));
    const hunterTagged = applyPotaHunterQsos(qsos, hunter);
    const hunterInLog = h => qsos.some(q => (q._potaFromApp || q.POTA_REF) && refList(q.POTA_REF).includes(h.reference.toUpperCase()) && baseCall(q.CALL) === baseCall(h.callsign));

    const activator = actRecs.map(r => ({ callsign: r.CALL, band: (r.BAND || '').toUpperCase(), reference: r.MY_POTA_REF || r.MY_SIG_INFO, date: toIsoTime(r) }));
    const activatorTagged = applyActivatorEntries(qsos, activator);
    const activations = summariseActivations(activator);

    return {
        tagged: hunterTagged + activatorTagged,
        // Older bookmark exports are hunter-only and carry no role field
        hasRoles: records.some(r => r.APP_POLARPLOT_POTA_ROLE),
        hunter: {
            entries: hunter.length,
            parks: new Set(hunter.map(h => h.reference.toUpperCase())).size,
            tagged: hunterTagged,
            matched: hunter.filter(hunterInLog).length,
            // POTA's own record of every hunted QSO: each one is credited by POTA (no QSL needed)
            list: hunter.map(h => ({ reference: h.reference.toUpperCase(), call: h.callsign, date: h.date.slice(0, 10).replace(/-/g, ''), band: h.band, inLog: hunterInLog(h) })),
        },
        activator: {
            entries: activator.length,
            parks: new Set(activations.map(a => a.reference)).size,
            activations,
            valid: activations.filter(a => a.valid).length,
            tagged: activatorTagged,
            matched: activator.filter(e => e.inLog).length,
        },
    };
}

/**
 * Public park details for the given references, fetched a few at a time.
 * Adds to (and returns) `cache`: { 'GB-0577': { name, lat, lon, type, location } }.
 */
export async function fetchParkInfo(refs, cache = {}) {
    const todo = [...new Set(refs.map(r => String(r).toUpperCase()))].filter(r => !cache[r]);
    const worker = async () => {
        while (todo.length) {
            const ref = todo.shift();
            try {
                const res = await fetch(`https://api.pota.app/park/${encodeURIComponent(ref)}`);
                const p = res.ok ? await res.json() : null;
                cache[ref] = p && p.latitude != null
                    ? { name: p.name, lat: +p.latitude, lon: +p.longitude, type: p.parktypeDesc || '', location: p.locationDesc || '' }
                    : { name: '', lat: null, lon: null };
            } catch { /* network hiccup: leave it for next time */ }
        }
    };
    await Promise.all(Array.from({ length: 6 }, worker));
    return cache;
}
