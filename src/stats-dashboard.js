import { tileUrl, tileAttribution } from './map-tiles.js';
import { potaBookmarkletHref } from './pota-service.js';

// ─── Statistics Dashboard ────────────────────────────────────────────────────
// Wavelog-style statistics over the currently filtered log. Self-contained: builds its
// own modal DOM on first open. main.js passes the QSOs plus a small context of helpers.
//
// Charts are hand-rolled SVG/HTML in a single accent hue (magnitude = one hue, light→dark);
// green/amber are reserved for confirmed/unconfirmed status and always carry a text label.

const MONTHS = ['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC'];
const WEEKDAYS = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];
const CONTINENTS = { NA: 'North America', SA: 'South America', EU: 'Europe', AS: 'Asia', AF: 'Africa', OC: 'Oceania', AN: 'Antarctica' };
const CONF_COLOR = '#22c55e', UNCONF_COLOR = '#f59e0b';

// ISO 3166 → continent (DXCC convention: Caribbean counts as NA, Cyprus/Turkey as AS)
const ISO_CONT = {};
Object.entries({
    NA: 'US CA MX GT BZ SV HN NI CR PA CU JM HT DO PR BS BB TT AG DM GD KN LC VC AI BM KY MS TC VG VI GL PM AW CW SX BQ MF BL GP MQ',
    SA: 'AR BO BR CL CO EC FK GF GY PE PY SR UY VE GS',
    EU: 'AD AL AT AX BA BE BG BY CH CZ DE DK EE ES FI FO FR GB GG GI GR HR HU IE IM IS IT JE LI LT LU LV MC MD ME MK MT NL NO PL PT RO RS RU SE SI SJ SK SM UA VA XK',
    AS: 'AE AF AM AZ BD BH BN BT CN CY GE HK ID IL IN IQ IR JO JP KG KH KP KR KW KZ LA LB LK MM MN MO MV MY NP OM PH PK PS QA SA SG SY TH TJ TL TM TR TW UZ VN YE',
    AF: 'AO BF BI BJ BW CD CF CG CI CM CV DJ DZ EG ER ET GA GH GM GN GQ GW KE KM LR LS LY MA MG ML MR MU MW MZ NA NE NG RE RW SC SD SL SN SO SS ST SZ TD TG TN TZ UG YT ZA ZM ZW EH SH',
    OC: 'AS AU CK FJ FM GU KI MH MP NC NF NR NU NZ PF PG PN PW SB TK TO TV VU WF WS',
    AN: 'AQ'
}).forEach(([cont, list]) => list.split(' ').forEach(iso => { ISO_CONT[iso] = cont; }));

const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmtNum = n => Number(n).toLocaleString();
const fmtDate = d => d?.length === 8 ? `${d.slice(6, 8)}-${MONTHS[+d.slice(4, 6) - 1] || '??'}-${d.slice(0, 4)}` : '--';
const dayIndex = d => Date.UTC(+d.slice(0, 4), +d.slice(4, 6) - 1, +d.slice(6, 8)) / 86400000;
const pct = (a, b) => b ? Math.round(a / b * 100) : 0;
// Sequential single-hue scale: 0..1 → accent mixed into the surface
const heat = t => t <= 0 ? 'var(--surf2)' : `color-mix(in srgb, var(--acc) ${Math.round(18 + t * 82)}%, var(--surf2))`;

function maidenheadToLatLon(grid) {
    if (!grid || grid.length < 4 || !/^[A-R]{2}[0-9]{2}/i.test(grid)) return null;
    const g = grid.toUpperCase();
    let lon = (g.charCodeAt(0) - 65) * 20 - 180 + (+g[2]) * 2;
    let lat = (g.charCodeAt(1) - 65) * 10 - 90 + (+g[3]);
    if (g.length >= 6 && /[A-X]{2}/.test(g.slice(4, 6))) {
        lon += (g.charCodeAt(4) - 65) * (2 / 24) + 1 / 24;
        lat += (g.charCodeAt(5) - 65) * (1 / 24) + 0.5 / 24;
    } else { lon += 1; lat += 0.5; }
    return [lat, lon];
}

function haversineKm(a, b) {
    const R = 6371, toR = Math.PI / 180;
    const dLat = (b[0] - a[0]) * toR, dLon = (b[1] - a[1]) * toR;
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(a[0] * toR) * Math.cos(b[0] * toR) * Math.sin(dLon / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(h));
}

function bearingDeg(a, b) {
    const toR = Math.PI / 180;
    const y = Math.sin((b[1] - a[1]) * toR) * Math.cos(b[0] * toR);
    const x = Math.cos(a[0] * toR) * Math.sin(b[0] * toR) - Math.sin(a[0] * toR) * Math.cos(b[0] * toR) * Math.cos((b[1] - a[1]) * toR);
    return (Math.atan2(y, x) / toR + 360) % 360;
}

// WPX-style prefix: leading letters/digits up to the last digit of the prefix (M9PXZ → M9, 2E0ABC → 2E0)
function wpxPrefix(call) {
    const parts = (call || '').toUpperCase().split('/');
    const base = parts.reduce((a, b) => (b.length > a.length ? b : a), '');
    return base.match(/^(\d?[A-Z]+\d+)/)?.[1] || base.match(/^([A-Z0-9]+?\d)/)?.[1] || base;
}

// ─── Dataset ────────────────────────────────────────────────────────────────

function buildDataset(qsos, ctx) {
    const kmToUnit = ctx.units === 'mi' ? 0.621371 : 1;
    const rows = qsos.map(q => {
        const date = (q.QSO_DATE || '').slice(0, 8);
        const band = (q.BAND || 'UNKNOWN').toUpperCase();
        const mode = (q.SUBMODE && q.MODE === 'MFSK') ? q.SUBMODE : (q.MODE || 'UNKNOWN');
        // CTY entity name (smart reader) keeps DXCC counting consistent whatever naming the log used
        const country = q._cty?.name || q.COUNTRY || q.DXCC || 'Unknown';
        const iso = (ctx.isoOf(q) || '').toUpperCase();
        let cont = (q.CONT || '').toUpperCase();
        if (!CONTINENTS[cont]) {
            cont = ISO_CONT[iso] || '';
            if (iso === 'RU' && parseFloat(q.LON) > 60) cont = 'AS';
        }
        const there = (q.LAT && q.LON) ? [parseFloat(q.LAT), parseFloat(q.LON)] : maidenheadToLatLon(q.GRIDSQUARE);
        const here = maidenheadToLatLon(q.MY_GRIDSQUARE) || ctx.home;
        const distKm = (there && here) ? haversineKm(here, there) : null;
        return {
            q, date, band, mode, country, iso, cont,
            call: (q.CALL || '').toUpperCase(),
            time: (q.TIME_ON || '').slice(0, 4),
            grid4: (q.GRIDSQUARE || '').toUpperCase().slice(0, 4),
            myGrid4: (q.MY_GRIDSQUARE || '').toUpperCase().slice(0, 4),
            prop: (q.PROP_MODE || '').toUpperCase(),
            sat: q.SAT_NAME || '',
            confirmed: ctx.isConfirmed(q),
            dist: distKm != null ? distKm * kmToUnit : null,
            distKm,
            bearing: (there && here && distKm > 1) ? bearingDeg(here, there) : null,
        };
    });
    const dated = rows.filter(r => /^\d{8}$/.test(r.date)).sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time));
    return { rows, dated, units: ctx.units, ctx };
}

const validGrid = g => /^[A-R]{2}[0-9]{2}$/.test(g);

// ─── Chart primitives ───────────────────────────────────────────────────────

function hbars(items, { valueFmt = fmtNum, max } = {}) {
    if (!items.length) return emptyState('Nothing to show for the current filters.');
    const top = max || Math.max(...items.map(i => i.value), 1);
    return `<div class="sd-hbars">${items.map(i => `
        <div class="sd-hbar" data-tip="${esc(i.tip || `${i.labelText ?? i.label}: ${valueFmt(i.value)}`)}">
            <span class="sd-hbar-label">${i.dot ? `<i class="sd-dot" style="background:${i.dot}"></i>` : ''}${i.label}</span>
            <span class="sd-hbar-track"><span class="sd-hbar-fill" style="width:${Math.max(0.5, i.value / top * 100)}%"></span></span>
            <span class="sd-hbar-val">${valueFmt(i.value)}</span>
        </div>`).join('')}</div>`;
}

// Vertical bars. Rounded data-end, square baseline.
function vbars(items, { height = 220, labelEvery } = {}) {
    if (!items.length) return emptyState('Nothing to show for the current filters.');
    const W = 760, H = height, pl = 44, pr = 8, pt = 10, pb = 28;
    const max = Math.max(...items.map(i => i.value), 1);
    const nice = niceMax(max);
    const slot = (W - pl - pr) / items.length;
    const bw = Math.max(2, Math.min(28, slot - 2));
    const every = labelEvery || Math.ceil(items.length / 14);
    const y = v => pt + (H - pt - pb) * (1 - v / nice);
    let svg = '';
    for (let k = 0; k <= 4; k++) {
        const v = nice * k / 4, yy = y(v);
        svg += `<line x1="${pl}" x2="${W - pr}" y1="${yy}" y2="${yy}" class="sd-grid"/><text x="${pl - 6}" y="${yy + 3}" class="sd-axis" text-anchor="end">${fmtNum(Math.round(v))}</text>`;
    }
    items.forEach((it, i) => {
        const x = pl + slot * i + (slot - bw) / 2, yy = y(it.value), h = H - pb - yy;
        if (h > 0) svg += `<path d="${roundTop(x, yy, bw, h, Math.min(4, bw / 2))}" class="sd-bar"/>`;
        svg += `<rect x="${pl + slot * i}" y="${pt}" width="${slot}" height="${H - pt - pb}" fill="transparent" data-tip="${esc(it.tip || `${it.label}: ${fmtNum(it.value)}`)}"/>`;
        if (i % every === 0) svg += `<text x="${x + bw / 2}" y="${H - pb + 16}" class="sd-axis" text-anchor="middle">${esc(it.label)}</text>`;
    });
    return `<svg class="sd-svg" viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid meet">${svg}</svg>`;
}

function roundTop(x, y, w, h, r) {
    r = Math.min(r, h);
    return `M${x},${y + h}V${y + r}Q${x},${y} ${x + r},${y}H${x + w - r}Q${x + w},${y} ${x + w},${y + r}V${y + h}Z`;
}

function niceMax(v) {
    const p = 10 ** Math.floor(Math.log10(v));
    for (const m of [1, 1.2, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10]) if (m * p >= v) return m * p;
    return v;
}

// Single-series line with crosshair hover (wired in afterRender via data-line)
function lineChart(points, { height = 260, label = 'Total' } = {}) {
    if (points.length < 2) return emptyState('Need QSOs on at least two different months.');
    const W = 760, H = height, pl = 48, pr = 12, pt = 12, pb = 28;
    const nice = niceMax(Math.max(...points.map(p => p.value), 1));
    const x = i => pl + (W - pl - pr) * i / (points.length - 1);
    const y = v => pt + (H - pt - pb) * (1 - v / nice);
    let svg = '';
    for (let k = 0; k <= 4; k++) {
        const v = nice * k / 4;
        svg += `<line x1="${pl}" x2="${W - pr}" y1="${y(v)}" y2="${y(v)}" class="sd-grid"/><text x="${pl - 6}" y="${y(v) + 3}" class="sd-axis" text-anchor="end">${fmtNum(Math.round(v))}</text>`;
    }
    const every = Math.ceil(points.length / 10);
    points.forEach((p, i) => { if (i % every === 0) svg += `<text x="${x(i)}" y="${H - pb + 16}" class="sd-axis" text-anchor="middle">${esc(p.label)}</text>`; });
    const d = points.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(p.value).toFixed(1)}`).join('');
    svg += `<path d="${d}V${H - pb}H${pl}Z" class="sd-area"/><path d="${d}" class="sd-line"/>`;
    svg += `<line class="sd-cross" x1="0" x2="0" y1="${pt}" y2="${H - pb}" style="display:none"/><circle class="sd-cross-dot" r="4.5" style="display:none"/>`;
    svg += `<rect class="sd-hit" x="${pl}" y="${pt}" width="${W - pl - pr}" height="${H - pt - pb}" fill="transparent"/>`;
    const data = esc(JSON.stringify(points.map((p, i) => [x(i), y(p.value), `${p.label} · ${label}: ${fmtNum(p.value)}`])));
    return `<svg class="sd-svg" viewBox="0 0 ${W} ${H}" data-line="${data}">${svg}</svg>`;
}

function table(headers, rows, { max = 500 } = {}) {
    if (!rows.length) return emptyState('Nothing to show for the current filters.');
    const more = rows.length > max ? `<tr><td colspan="${headers.length}" class="sd-more">+${fmtNum(rows.length - max)} more</td></tr>` : '';
    return `<div class="sd-table-wrap"><table class="sd-table"><thead><tr>${headers.map(h => `<th>${h}</th>`).join('')}</tr></thead>
        <tbody>${rows.slice(0, max).map(r => `<tr>${r.map(c => `<td>${c}</td>`).join('')}</tr>`).join('')}${more}</tbody></table></div>`;
}

const tiles = list => `<div class="sd-tiles">${list.map(t => `
    <div class="sd-tile"><div class="sd-tile-label">${t.label}</div><div class="sd-tile-value">${t.value}</div>${t.sub ? `<div class="sd-tile-sub">${t.sub}</div>` : ''}</div>`).join('')}</div>`;

const card = (title, body, note = '') => `<div class="sd-card"><div class="sd-card-head"><h3>${title}</h3>${note ? `<span>${note}</span>` : ''}</div>${body}</div>`;
const emptyState = msg => `<div class="sd-empty">${msg}</div>`;
const segmented = (name, options, active) => `<div class="sd-seg" data-seg="${name}">${options.map(([v, l]) =>
    `<button data-v="${v}" class="${v === active ? 'active' : ''}">${l}</button>`).join('')}</div>`;
const status = ok => `<span class="sd-status" style="color:${ok ? CONF_COLOR : UNCONF_COLOR}">${ok ? '● CFM' : '○ WKD'}</span>`;
const bandTag = (b, ctx) => `<span style="color:${ctx.bandColors[b] || 'var(--text)'};font-weight:700">${esc(b)}</span>`;
const unitLbl = D => D.units === 'mi' ? 'mi' : 'km';

// ─── Sections ───────────────────────────────────────────────────────────────

function sectionOverview(D) {
    const r = D.rows;
    const calls = new Set(r.map(x => x.call));
    const dxcc = new Set(r.map(x => x.country).filter(c => c !== 'Unknown'));
    const grids = new Set(r.map(x => x.grid4).filter(validGrid));
    const conts = new Set(r.map(x => x.cont).filter(Boolean));
    const days = new Set(D.dated.map(x => x.date));
    const far = r.reduce((a, b) => (b.dist ?? -1) > (a?.dist ?? -1) ? b : a, null);
    const conf = r.filter(x => x.confirmed).length;
    const first = D.dated[0], last = D.dated[D.dated.length - 1];

    const byYear = {};
    D.dated.forEach(x => { const y = x.date.slice(0, 4); byYear[y] = (byYear[y] || 0) + 1; });

    return tiles([
        { label: 'QSOs', value: fmtNum(r.length) },
        { label: 'Unique Calls', value: fmtNum(calls.size) },
        { label: 'DXCC Entities', value: fmtNum(dxcc.size) },
        { label: 'Grid Squares', value: fmtNum(grids.size) },
        { label: 'Continents', value: `${conts.size}<small>/6</small>` },
        { label: 'Confirmed', value: `${pct(conf, r.length)}%`, sub: `${fmtNum(conf)} QSOs` },
        { label: 'Days Active', value: fmtNum(days.size) },
        { label: 'Longest', value: far?.dist != null ? `${fmtNum(Math.round(far.dist))}<small> ${unitLbl(D)}</small>` : '--', sub: far?.dist != null ? esc(far.call) : '' },
    ]) + card('QSOs per year', vbars(Object.keys(byYear).sort().map(y => ({ label: y, value: byYear[y] }))),
        first ? `${fmtDate(first.date)} → ${fmtDate(last.date)}` : '');
}

function sectionQSL(D) {
    const chans = [['LoTW', q => q.LOTW_QSL_RCVD === 'Y'], ['QSL', q => q.QSL_RCVD === 'Y'], ['eQSL', q => q.EQSL_QSL_RCVD === 'Y'], ['QRZ', q => q.APP_QRZLOG_STATUS === 'C']];
    const byBand = {};
    D.rows.forEach(r => {
        const b = byBand[r.band] ||= { n: 0, any: 0, ch: [0, 0, 0, 0] };
        b.n++; if (r.confirmed) b.any++;
        chans.forEach(([, f], i) => { if (f(r.q)) b.ch[i]++; });
    });
    const order = Object.keys(D.ctx.bandColors);
    const bands = Object.keys(byBand).sort((a, b) => (order.indexOf(a) + 1 || 99) - (order.indexOf(b) + 1 || 99));
    const tot = { n: 0, any: 0, ch: [0, 0, 0, 0] };
    bands.forEach(b => { tot.n += byBand[b].n; tot.any += byBand[b].any; byBand[b].ch.forEach((v, i) => tot.ch[i] += v); });
    const row = (label, b) => [label, fmtNum(b.n), ...b.ch.map(v => v ? fmtNum(v) : '<span class="sd-muted">–</span>'),
        `<b style="color:${CONF_COLOR}">${fmtNum(b.any)}</b>`, `<span class="sd-pctbar"><i style="width:${pct(b.any, b.n)}%"></i></span>${pct(b.any, b.n)}%`];

    return tiles([
        { label: 'Confirmed QSOs', value: fmtNum(tot.any), sub: `${pct(tot.any, tot.n)}% of ${fmtNum(tot.n)}` },
        ...chans.map(([n], i) => ({ label: n, value: fmtNum(tot.ch[i]), sub: `${pct(tot.ch[i], tot.n)}%` })),
    ]) + card('Confirmations by band',
        table(['Band', 'QSOs', ...chans.map(c => c[0]), 'Any', 'Rate'], [...bands.map(b => row(bandTag(b, D.ctx), byBand[b])), row('<b>Total</b>', tot)]),
        'A QSO can be confirmed on several channels');
}

function sectionGridMap(D) {
    const per = {};
    const all = new Map();
    D.rows.forEach(r => {
        if (!validGrid(r.grid4)) return;
        const b = per[r.band] ||= new Map();
        b.set(r.grid4, b.get(r.grid4) || r.confirmed);
        all.set(r.grid4, all.get(r.grid4) || r.confirmed);
    });
    const conf = [...all.values()].filter(Boolean).length;
    const order = Object.keys(D.ctx.bandColors);
    const rows = Object.keys(per).sort((a, b) => (order.indexOf(a) + 1 || 99) - (order.indexOf(b) + 1 || 99)).map(b => {
        const m = per[b], c = [...m.values()].filter(Boolean).length;
        return [bandTag(b, D.ctx), fmtNum(m.size), `<span style="color:${CONF_COLOR}">${fmtNum(c)}</span>`, `<span style="color:${UNCONF_COLOR}">${fmtNum(m.size - c)}</span>`];
    });
    return tiles([
        { label: 'Worked', value: fmtNum(all.size) },
        { label: 'Confirmed', value: fmtNum(conf), sub: `${pct(conf, all.size)}%` },
        { label: 'Unconfirmed', value: fmtNum(all.size - conf) },
        { label: 'Fields', value: fmtNum(new Set([...all.keys()].map(g => g.slice(0, 2))).size), sub: 'of 324' },
    ]) + `<button class="sd-action" data-action="show-grids">▦ Open the grid square map</button>`
       + card('Grid squares per band', table(['Band', 'Worked', 'Confirmed', 'Unconfirmed'], rows));
}

function sectionActivated(D) {
    const m = {};
    D.rows.forEach(r => {
        if (!validGrid(r.myGrid4)) return;
        const g = m[r.myGrid4] ||= { n: 0, first: r.date, last: r.date, bands: new Set(), calls: new Set() };
        g.n++; g.bands.add(r.band); g.calls.add(r.call);
        if (r.date && r.date < g.first) g.first = r.date;
        if (r.date > g.last) g.last = r.date;
    });
    const rows = Object.entries(m).sort((a, b) => b[1].n - a[1].n).map(([g, v]) =>
        [`<b>${g}</b>`, fmtNum(v.n), fmtNum(v.calls.size), [...v.bands].map(b => bandTag(b, D.ctx)).join(' '), fmtDate(v.first), fmtDate(v.last)]);
    return card('Grid squares you operated from', rows.length
        ? table(['My Grid', 'QSOs', 'Stations', 'Bands', 'First', 'Last'], rows)
        : emptyState('No <code>MY_GRIDSQUARE</code> in your log. Most loggers write it when your station location is set.'),
        `${rows.length} activated`);
}

function sectionActivators(D) {
    const m = {};
    D.rows.forEach(r => {
        if (!validGrid(r.grid4)) return;
        (m[r.call] ||= new Set()).add(r.grid4);
        (r.q.VUCC_GRIDS || '').split(',').map(g => g.trim().toUpperCase().slice(0, 4)).filter(validGrid).forEach(g => m[r.call].add(g));
    });
    const rows = Object.entries(m).filter(([, s]) => s.size > 1).sort((a, b) => b[1].size - a[1].size)
        .map(([c, s]) => [D.ctx.qrzLink(c, `<b>${esc(c)}</b>`), fmtNum(s.size), `<span class="sd-muted">${[...s].sort().join(' ')}</span>`]);
    return card('Stations worked from more than one grid', rows.length
        ? table(['Call', 'Grids', 'Grid list'], rows, { max: 200 })
        : emptyState('No station in this log was worked from more than one grid square.'),
        'Rovers & portable ops');
}

function sectionDistances(D) {
    const withD = D.rows.filter(r => r.dist != null);
    if (!withD.length) return emptyState('No distances available. Set your home location (or log <code>MY_GRIDSQUARE</code>) and make sure contacts have a location.');
    const u = unitLbl(D);
    const step = u === 'mi' ? 500 : 1000;
    const maxBin = Math.ceil(Math.max(...withD.map(r => r.dist)) / step);
    const bins = Array.from({ length: maxBin }, (_, i) => ({ label: `${(i * step) / 1000}k`, value: 0, tip: '' }));
    withD.forEach(r => bins[Math.min(maxBin - 1, Math.floor(r.dist / step))].value++);
    bins.forEach((b, i) => { b.tip = `${fmtNum(i * step)}–${fmtNum((i + 1) * step)} ${u}: ${fmtNum(b.value)} QSOs`; });

    const perBand = {};
    withD.forEach(r => { if (!perBand[r.band] || r.dist > perBand[r.band].dist) perBand[r.band] = r; });
    const order = Object.keys(D.ctx.bandColors);
    const bandRows = Object.values(perBand).sort((a, b) => (order.indexOf(a.band) + 1 || 99) - (order.indexOf(b.band) + 1 || 99))
        .map(r => [bandTag(r.band, D.ctx), D.ctx.qrzLink(r.call, `<b>${esc(r.call)}</b>`), esc(r.country), `<b>${fmtNum(Math.round(r.dist))}</b> ${u}`, esc(r.mode), fmtDate(r.date)]);
    const top = [...withD].sort((a, b) => b.dist - a.dist).slice(0, 25)
        .map((r, i) => [i + 1, D.ctx.qrzLink(r.call, `<b>${esc(r.call)}</b>`), esc(r.country), `<b>${fmtNum(Math.round(r.dist))}</b> ${u}`, bandTag(r.band, D.ctx), esc(r.mode), fmtDate(r.date)]);
    const avg = withD.reduce((s, r) => s + r.dist, 0) / withD.length;
    return tiles([
        { label: 'Longest', value: `${fmtNum(Math.round(withD.reduce((a, b) => Math.max(a, b.dist), 0)))}<small> ${u}</small>` },
        { label: 'Average', value: `${fmtNum(Math.round(avg))}<small> ${u}</small>` },
        { label: 'Total Distance', value: `${fmtNum(Math.round(withD.reduce((s, r) => s + r.dist, 0)))}<small> ${u}</small>` },
    ]) + card(`QSOs by distance (${u})`, vbars(bins))
       + card('Longest QSO per band', table(['Band', 'Call', 'Country', 'Distance', 'Mode', 'Date'], bandRows))
       + card('Top 25 longest QSOs', table(['#', 'Call', 'Country', 'Distance', 'Band', 'Mode', 'Date'], top));
}

function sectionSatellites(D) {
    const sat = D.rows.filter(r => r.prop === 'SAT' || r.sat);
    if (!sat.length) return emptyState('No satellite QSOs found (<code>PROP_MODE = SAT</code> or <code>SAT_NAME</code>).');
    const u = unitLbl(D);
    const m = {};
    sat.forEach(r => {
        const k = (r.sat || 'Unknown').toUpperCase();
        const s = m[k] ||= { n: 0, best: null, calls: new Set(), grids: new Set() };
        s.n++; s.calls.add(r.call); if (validGrid(r.grid4)) s.grids.add(r.grid4);
        if (r.dist != null && (!s.best || r.dist > s.best.dist)) s.best = r;
    });
    const rows = Object.entries(m).sort((a, b) => (b[1].best?.dist || 0) - (a[1].best?.dist || 0)).map(([k, s]) => [
        `<b>${esc(k)}</b>`, fmtNum(s.n), fmtNum(s.calls.size), fmtNum(s.grids.size),
        s.best ? `<b>${fmtNum(Math.round(s.best.dist))}</b> ${u}` : '--',
        s.best ? D.ctx.qrzLink(s.best.call, esc(s.best.call)) : '--', s.best ? fmtDate(s.best.date) : '--']);
    return tiles([
        { label: 'Satellite QSOs', value: fmtNum(sat.length) },
        { label: 'Satellites', value: fmtNum(Object.keys(m).length) },
        { label: 'Sat Grids', value: fmtNum(new Set(sat.map(r => r.grid4).filter(validGrid)).size) },
    ]) + card('Distance records per satellite', table(['Satellite', 'QSOs', 'Stations', 'Grids', 'Record', 'Call', 'Date'], rows));
}

function sectionDays(D, state) {
    const perDay = {};
    D.dated.forEach(r => { perDay[r.date] = (perDay[r.date] || 0) + 1; });
    const days = Object.keys(perDay).sort();
    if (!days.length) return emptyState('No dated QSOs.');
    // Streaks
    let longest = { len: 0 }, run = 1, runStart = days[0];
    for (let i = 1; i <= days.length; i++) {
        if (i < days.length && dayIndex(days[i]) - dayIndex(days[i - 1]) === 1) { run++; continue; }
        if (run > longest.len) longest = { len: run, from: runStart, to: days[i - 1] };
        run = 1; runStart = days[i];
    }
    const best = days.reduce((a, b) => perDay[b] > perDay[a] ? b : a);
    const years = [...new Set(days.map(d => d.slice(0, 4)))].sort();
    const year = years.includes(state.year) ? state.year : years[years.length - 1];
    state.year = year;

    // Calendar: 53 weeks × 7 days, Monday-first
    const start = Date.UTC(+year, 0, 1) / 86400000;
    const lead = (new Date(start * 86400000).getUTCDay() + 6) % 7;
    const yearMax = Math.max(1, ...days.filter(d => d.startsWith(year)).map(d => perDay[d]));
    const daysInYear = (Date.UTC(+year + 1, 0, 1) / 86400000) - start;
    let cells = '';
    for (let i = 0; i < lead; i++) cells += '<i class="sd-cal-pad"></i>';
    for (let i = 0; i < daysInYear; i++) {
        const dt = new Date((start + i) * 86400000);
        const key = dt.toISOString().slice(0, 10).replace(/-/g, '');
        const n = perDay[key] || 0;
        cells += `<i class="sd-cal-cell" style="background:${heat(n ? Math.sqrt(n / yearMax) : 0)}" data-tip="${fmtDate(key)} · ${n ? `${fmtNum(n)} QSO${n > 1 ? 's' : ''}` : 'no QSOs'}"></i>`;
    }
    const yearDays = days.filter(d => d.startsWith(year)).length;
    const weekday = Array(7).fill(0);
    days.forEach(d => { weekday[(new Date(dayIndex(d) * 86400000).getUTCDay() + 6) % 7]++; });

    return tiles([
        { label: 'Days with QSOs', value: fmtNum(days.length) },
        { label: 'Longest Streak', value: `${longest.len}<small> days</small>`, sub: longest.len > 1 ? `${fmtDate(longest.from)} → ${fmtDate(longest.to)}` : '' },
        { label: 'Busiest Day', value: fmtNum(perDay[best]), sub: fmtDate(best) },
        { label: 'QSOs / Active Day', value: (D.dated.length / days.length).toFixed(1) },
    ]) + card(`${year} · ${yearDays} active days`,
        `${segmented('year', years.map(y => [y, y]), year)}
         <div class="sd-cal-wrap"><div class="sd-cal-days">${WEEKDAYS.map((d, i) => `<span>${i % 2 ? '' : d}</span>`).join('')}</div><div class="sd-cal">${cells}</div></div>
         <div class="sd-legend">Less ${[0, 0.25, 0.5, 0.75, 1].map(t => `<i style="background:${heat(t)}"></i>`).join('')} More</div>`)
       + card('Active days by weekday', vbars(WEEKDAYS.map((d, i) => ({ label: d, value: weekday[i], tip: `${d}: ${fmtNum(weekday[i])} active days` })), { height: 180 }));
}

function sectionTimeline(D) {
    const first = new Map();
    D.dated.forEach(r => { if (r.country !== 'Unknown' && !first.has(r.country)) first.set(r.country, r); });
    const conf = new Set(D.rows.filter(r => r.confirmed).map(r => r.country));
    const list = [...first.values()].reverse();
    const rows = list.map((r, i) => [list.length - i, fmtDate(r.date), `<b>${esc(r.country)}</b>`, D.ctx.qrzLink(r.call, esc(r.call)), bandTag(r.band, D.ctx), esc(r.mode), status(conf.has(r.country))]);
    return card('DXCC entities in the order you first worked them', table(['#', 'First QSO', 'Entity', 'Call', 'Band', 'Mode', 'Status'], rows), `${list.length} entities`);
}

function sectionAccumulated(D, state) {
    const metrics = [['dxcc', 'DXCC'], ['grids', 'Grids'], ['calls', 'Unique Calls'], ['qsos', 'QSOs'], ['conts', 'Continents']];
    const metric = state.metric || 'dxcc';
    const keyOf = { dxcc: r => r.country !== 'Unknown' ? r.country : null, grids: r => validGrid(r.grid4) ? r.grid4 : null, calls: r => r.call, conts: r => r.cont || null };
    const seen = new Set(); let qsos = 0;
    const months = new Map();
    D.dated.forEach(r => {
        const k = keyOf[metric]?.(r); if (k) seen.add(k);
        qsos++;
        months.set(r.date.slice(0, 6), metric === 'qsos' ? qsos : seen.size);
    });
    // Fill gaps so flat periods show as flat
    const keys = [...months.keys()];
    const pts = [];
    if (keys.length) {
        let y = +keys[0].slice(0, 4), m = +keys[0].slice(4, 6), last = 0;
        const end = keys[keys.length - 1];
        while (true) {
            const k = `${y}${String(m).padStart(2, '0')}`;
            if (months.has(k)) last = months.get(k);
            pts.push({ label: `${MONTHS[m - 1]} ${String(y).slice(2)}`, value: last });
            if (k >= end) break;
            if (++m > 12) { m = 1; y++; }
        }
    }
    const label = metrics.find(m => m[0] === metric)[1];
    return card(`Accumulated ${label}`, segmented('metric', metrics, metric) + lineChart(pts, { label }));
}

function sectionTimeplotter(D) {
    const order = Object.keys(D.ctx.bandColors);
    const grid = {}; let max = 1;
    D.rows.forEach(r => {
        if (!/^\d{4}$/.test(r.time)) return;
        const h = +r.time.slice(0, 2);
        const row = grid[r.band] ||= Array(24).fill(0);
        max = Math.max(max, ++row[h]);
    });
    const bands = Object.keys(grid).sort((a, b) => (order.indexOf(a) + 1 || 99) - (order.indexOf(b) + 1 || 99));
    if (!bands.length) return emptyState('No QSO times (<code>TIME_ON</code>) in this log.');
    const hourTotals = Array(24).fill(0);
    bands.forEach(b => grid[b].forEach((v, h) => { hourTotals[h] += v; }));
    const hdr = `<span></span>${Array.from({ length: 24 }, (_, h) => `<span class="sd-tp-h">${h % 3 ? '' : String(h).padStart(2, '0')}</span>`).join('')}`;
    const body = bands.map(b => `<span class="sd-tp-band">${bandTag(b, D.ctx)}</span>` + grid[b].map((v, h) =>
        `<i style="background:${heat(v ? Math.sqrt(v / max) : 0)}" data-tip="${b} · ${String(h).padStart(2, '0')}:00–${String(h).padStart(2, '0')}:59 UTC · ${fmtNum(v)} QSOs"></i>`).join('')).join('');
    return card('When you make QSOs — band × hour (UTC)', `<div class="sd-tp">${hdr}${body}</div>
        <div class="sd-legend">Less ${[0, 0.25, 0.5, 0.75, 1].map(t => `<i style="background:${heat(t)}"></i>`).join('')} More</div>`)
        + card('All bands by hour (UTC)', vbars(hourTotals.map((v, h) => ({ label: String(h).padStart(2, '0'), value: v, tip: `${String(h).padStart(2, '0')}:00 UTC: ${fmtNum(v)} QSOs` })), { height: 180, labelEvery: 2 }));
}

function sectionContinents(D) {
    const m = {};
    D.rows.forEach(r => {
        const k = r.cont || '?';
        const c = m[k] ||= { n: 0, conf: 0, dxcc: new Set(), calls: new Set() };
        c.n++; if (r.confirmed) c.conf++; c.dxcc.add(r.country); c.calls.add(r.call);
    });
    const list = Object.keys(CONTINENTS).filter(k => k !== 'AN' || m.AN).map(k => [k, m[k] || { n: 0, conf: 0, dxcc: new Set(), calls: new Set() }]);
    const unknown = m['?']?.n || 0;
    return card('QSOs by continent', hbars(list.map(([k, c]) => ({ label: `${k} · ${CONTINENTS[k]}`, value: c.n }))),
            unknown ? `${fmtNum(unknown)} QSOs without a continent` : '')
        + card('Continent detail', table(['Continent', 'QSOs', 'DXCC', 'Stations', 'Confirmed', 'Status'],
            list.map(([k, c]) => [`<b>${k}</b> ${CONTINENTS[k]}`, fmtNum(c.n), fmtNum(c.dxcc.size), fmtNum(c.calls.size), fmtNum(c.conf),
                c.n ? status(c.conf > 0) : '<span class="sd-muted">not worked</span>'])));
}

function sectionCallsigns(D) {
    const calls = {}, prefixes = {};
    D.rows.forEach(r => {
        const c = calls[r.call] ||= { n: 0, bands: new Set(), modes: new Set(), country: r.country, last: '' };
        c.n++; c.bands.add(r.band); c.modes.add(r.mode); if (r.date > c.last) c.last = r.date;
        const p = wpxPrefix(r.call); prefixes[p] = (prefixes[p] || 0) + 1;
    });
    const top = Object.entries(calls).sort((a, b) => b[1].n - a[1].n).slice(0, 50).map(([c, v], i) =>
        [i + 1, D.ctx.qrzLink(c, `<b>${esc(c)}</b>`), esc(v.country), fmtNum(v.n), [...v.bands].map(b => bandTag(b, D.ctx)).join(' '), esc([...v.modes].join(', ')), fmtDate(v.last)]);
    const once = Object.values(calls).filter(v => v.n === 1).length;
    const topPfx = Object.entries(prefixes).sort((a, b) => b[1] - a[1]).slice(0, 20);
    return tiles([
        { label: 'Unique Calls', value: fmtNum(Object.keys(calls).length) },
        { label: 'WPX Prefixes', value: fmtNum(Object.keys(prefixes).length) },
        { label: 'Worked Once', value: fmtNum(once), sub: `${pct(once, Object.keys(calls).length)}%` },
        { label: 'Avg QSOs / Call', value: (D.rows.length / Math.max(1, Object.keys(calls).length)).toFixed(1) },
    ]) + card('Most worked stations', table(['#', 'Call', 'Country', 'QSOs', 'Bands', 'Modes', 'Last'], top))
       + card('Top prefixes (WPX)', hbars(topPfx.map(([p, n]) => ({ label: esc(p), value: n }))));
}

function sectionEME(D) {
    const eme = D.dated.filter(r => r.prop === 'EME');
    if (!eme.length) return emptyState('No EME QSOs found (<code>PROP_MODE = EME</code>).');
    const first = new Map();
    eme.forEach(r => { if (!first.has(r.call)) first.set(r.call, r); });
    const conf = new Set(eme.filter(r => r.confirmed).map(r => r.call));
    const list = [...first.values()];
    return tiles([{ label: 'EME Initials', value: fmtNum(list.length) }, { label: 'EME QSOs', value: fmtNum(eme.length) }])
        + card('EME initials (first QSO with each station)', table(['#', 'Call', 'Date', 'Band', 'Mode', 'Grid', 'Status'],
            list.map((r, i) => [i + 1, D.ctx.qrzLink(r.call, `<b>${esc(r.call)}</b>`), fmtDate(r.date), bandTag(r.band, D.ctx), esc(r.mode), r.grid4 || '--', status(conf.has(r.call))])));
}

function sectionCountBy(D, state) {
    const dims = [
        ['year', 'Year', r => r.date.slice(0, 4) || null, 'key'],
        ['month', 'Month', r => r.date ? MONTHS[+r.date.slice(4, 6) - 1] : null, MONTHS],
        ['weekday', 'Weekday', r => r.date.length === 8 ? WEEKDAYS[(new Date(dayIndex(r.date) * 86400000).getUTCDay() + 6) % 7] : null, WEEKDAYS],
        ['hour', 'Hour', r => /^\d{4}$/.test(r.time) ? `${r.time.slice(0, 2)}z` : null, 'key'],
        ['band', 'Band', r => r.band, Object.keys(D.ctx.bandColors)],
        ['mode', 'Mode', r => r.mode, 'count'],
        ['prop', 'Propagation', r => r.prop || 'Not logged', 'count'],
        ['cont', 'Continent', r => r.cont || null, 'count'],
        ['dxcc', 'Country', r => r.country, 'count'],
        ['station', 'My Station', r => (r.q.STATION_CALLSIGN || r.q.OPERATOR || '').toUpperCase() || null, 'count'],
    ];
    const dim = dims.find(d => d[0] === state.dim) || dims[0];
    state.dim = dim[0];
    const counts = {};
    D.rows.forEach(r => { const k = dim[2](r); if (k) counts[k] = (counts[k] || 0) + 1; });
    let keys = Object.keys(counts);
    if (Array.isArray(dim[3])) keys.sort((a, b) => (dim[3].indexOf(a) + 1 || 99) - (dim[3].indexOf(b) + 1 || 99));
    else if (dim[3] === 'key') keys.sort();
    else keys.sort((a, b) => counts[b] - counts[a]);
    const total = D.rows.length;
    const items = keys.map(k => ({ label: dim[0] === 'band' ? bandTag(k, D.ctx) : esc(k), labelText: k, value: counts[k], tip: `${k}: ${fmtNum(counts[k])} QSOs (${pct(counts[k], total)}%)` }));
    return card(`QSOs by ${dim[1].toLowerCase()}`, segmented('dim', dims.map(d => [d[0], d[1]]), dim[0]) + hbars(items), `${keys.length} values`);
}

// ─── Awards ─────────────────────────────────────────────────────────────────
// Progress towards real operating awards, computed from the ADIF fields each award is
// based on (CQZ, ITUZ, STATE, CNTY, *_REF, SIG…). Confirmed = any QSL channel received.

const range = (a, b) => Array.from({ length: b - a + 1 }, (_, i) => String(a + i));
const US_STATES = 'AL AK AZ AR CA CO CT DE FL GA HI ID IL IN IA KS KY LA ME MD MA MI MN MS MO MT NE NV NH NJ NM NY NC ND OH OK OR PA RI SC SD TN TX UT VT VA WA WV WI WY'.split(' ');
const CA_PROVINCES = 'AB BC MB NB NL NS NT NU ON PE QC SK YT'.split(' ');
const NL_PROVINCES = 'DR FL FR GD GR LB NB NH OV UT ZH ZL'.split(' ');
const CH_CANTONS = 'AG AI AR BE BL BS FR GE GL GR JU LU NE NW OW SG SH SO SZ TG TI UR VD VS ZG ZH'.split(' ');
const VUCC_BANDS = [['6M', 100], ['4M', 100], ['2M', 100], ['1.25M', 50], ['70CM', 50], ['33CM', 25], ['23CM', 25], ['13CM', 10], ['9CM', 5], ['6CM', 5], ['3CM', 5]];

// Which DXCC entity a QSO is in, by ADIF DXCC number or our ISO guess
const ENTITY = {
    US: [291, 6, 110], CA: [1], JP: [339], DE: [230], NL: [263], CH: [287], PL: [269],
};
const CTY_NAMES = { US: ['United States', 'Alaska', 'Hawaii'], CA: ['Canada'], JP: ['Japan'], DE: ['Fed. Rep. of Germany'], NL: ['Netherlands'], CH: ['Switzerland'], PL: ['Poland'] };
const inEntity = (r, iso) => r.q._cty ? CTY_NAMES[iso].includes(r.q._cty.name) : (r.iso === iso || ENTITY[iso].includes(+r.q.DXCC));
const stCode = r => (r.q.STATE || '').trim().toUpperCase();
const cnty = r => (r.q.CNTY || '').trim().toUpperCase();
const isSat = r => r.prop === 'SAT' || !!r.sat;
// Group by entity NAME (CTY's, else the logged COUNTRY) so a QSO the callsign lookup couldn't
// resolve still lands with the others for that country; the DXCC number is a last resort.
const dxccKey = r => r.country !== 'Unknown' ? r.country.toUpperCase() : r.q.DXCC ? `#${+r.q.DXCC}` : null;
// Activity references can come from the dedicated field or SIG/SIG_INFO; lists are comma separated
const refs = (r, field, sig) => {
    const out = [];
    const add = v => String(v || '').split(',').forEach(x => { const s = x.split('@')[0].trim().toUpperCase(); if (s) out.push(s); });
    add(r.q[field]);
    if ((r.q.SIG || '').toUpperCase() === sig) add(r.q.SIG_INFO);
    return out.length ? out : null;
};

// Parks the user was in (their own activations): MY_POTA_REF, or MY_SIG=POTA + MY_SIG_INFO
const myPotaParks = r => {
    const v = r.q.MY_POTA_REF || (String(r.q.MY_SIG || '').toUpperCase() === 'POTA' ? r.q.MY_SIG_INFO : '');
    const out = String(v || '').split(',').map(x => x.split('@')[0].trim().toUpperCase()).filter(Boolean);
    return out.length ? out : null;
};

const AWARDS = [
    // International
    { id: 'dxcc', group: 'intl', icon: 'DX', name: 'DXCC', desc: 'DX Century Club: confirm 100 DXCC entities', goal: 100, key: dxccKey, label: (k, r) => r.country },
    { id: 'waz', field: 'CQZ', group: 'intl', icon: 'CQ', name: 'CQ WAZ', desc: 'Worked All Zones: all 40 CQ zones', items: range(1, 40), key: r => r.q.CQZ ? String(+r.q.CQZ) : null, label: k => `Zone ${k}`, needs: 'CQZ' },
    { id: 'itu', field: 'ITUZ', group: 'intl', icon: 'ITU', name: 'ITU Zones', desc: 'All 90 ITU zones', items: range(1, 90), key: r => r.q.ITUZ ? String(+r.q.ITUZ) : null, label: k => `Zone ${k}`, needs: 'ITUZ' },
    { id: 'wac', field: 'CONT', group: 'intl', icon: 'WAC', name: 'Worked All Continents', desc: 'IARU WAC: all 6 continents', items: ['NA', 'SA', 'EU', 'AS', 'AF', 'OC'], key: r => r.cont || null, label: k => CONTINENTS[k] },
    { id: 'wae', group: 'intl', icon: 'WAE', name: 'Worked All Europe', desc: 'DARC WAE: 40 European entities', goal: 40, key: r => r.cont === 'EU' ? (r.q._cty?.wae || dxccKey(r)) : null, label: (k, r) => r.q._cty?.wae || r.country },
    { id: 'wpx', group: 'intl', icon: 'WPX', name: 'Worked All Prefixes', desc: 'CQ WPX: 300 confirmed prefixes', goal: 300, key: r => wpxPrefix(r.call) },
    { id: 'vucc', group: 'intl', icon: 'VU', name: 'VUCC', desc: 'VHF/UHF Century Club: grid squares per band', vucc: true },
    { id: 'sat', group: 'intl', icon: 'SAT', name: 'Satellite Grids', desc: 'VUCC Satellite: 100 grids via satellite', goal: 100, key: r => isSat(r) && validGrid(r.grid4) ? r.grid4 : null, needs: 'PROP_MODE=SAT' },
    { id: 'sig', group: 'intl', icon: 'SIG', name: 'SIG', desc: 'Special interest group references (SIG / SIG_INFO)', key: r => r.q.SIG ? `${r.q.SIG.toUpperCase()} ${(r.q.SIG_INFO || '').toUpperCase()}`.trim() : null, needs: 'SIG' },
    // xOTA
    { id: 'pota', group: 'xota', icon: 'POTA', name: 'POTA Hunter', desc: 'Parks on the Air: parks hunted', goal: 100, key: r => refs(r, 'POTA_REF', 'POTA'), needs: 'POTA_REF' },
    { id: 'potaact', group: 'xota', icon: 'POTA', name: 'POTA Activator', desc: 'Parks you activated (valid activation = 10+ QSOs in a UTC day)', key: myPotaParks, needs: 'MY_POTA_REF' },
    { id: 'sota', group: 'xota', icon: 'SOTA', name: 'SOTA Chaser', desc: 'Summits on the Air: summits chased', goal: 100, key: r => refs(r, 'SOTA_REF', 'SOTA'), needs: 'SOTA_REF' },
    { id: 'wwff', group: 'xota', icon: 'WWFF', name: 'WWFF', desc: 'World Wide Flora & Fauna: 44 references', goal: 44, key: r => refs(r, 'WWFF_REF', 'WWFF'), needs: 'WWFF_REF' },
    { id: 'iota', group: 'xota', icon: 'IOTA', name: 'IOTA', desc: 'Islands on the Air: 100 island groups', goal: 100, key: r => refs(r, 'IOTA', 'IOTA'), needs: 'IOTA' },
    // National
    { id: 'was', field: 'STATE', group: 'nat', flag: 'US', name: 'Worked All States', desc: 'ARRL WAS: all 50 US states', items: US_STATES, key: r => { const s = stCode(r) === 'DC' ? 'MD' : stCode(r); return inEntity(r, 'US') && US_STATES.includes(s) ? s : null; }, needs: 'STATE' },
    { id: 'usaca', group: 'nat', flag: 'US', name: 'USA-CA Counties', desc: 'CQ USA-CA: 500 US counties', goal: 500, key: r => inEntity(r, 'US') && cnty(r) ? `${stCode(r) ? stCode(r) + ',' : ''}${cnty(r).replace(/^[A-Z]{2},/, '')}` : null, needs: 'CNTY' },
    { id: 'waca', field: 'STATE', group: 'nat', flag: 'CA', name: 'Worked All Canada', desc: 'RAC: all 13 provinces & territories', items: CA_PROVINCES, key: r => inEntity(r, 'CA') && CA_PROVINCES.includes(stCode(r)) ? stCode(r) : null, needs: 'STATE' },
    { id: 'waja', field: 'STATE', group: 'nat', flag: 'JP', name: 'WAJA', desc: 'JARL Worked All Japan: 47 prefectures', items: range(1, 47).map(n => n.padStart(2, '0')), key: r => inEntity(r, 'JP') && /^\d{1,2}$/.test(stCode(r)) ? stCode(r).padStart(2, '0') : null, label: k => `Prefecture ${k}`, needs: 'STATE' },
    { id: 'jcc', group: 'nat', flag: 'JP', name: 'JCC', desc: 'JARL Japan Century Cities: 100 cities', goal: 100, key: r => inEntity(r, 'JP') && /^\d{4}(\d{2})?$/.test(cnty(r)) ? cnty(r) : null, needs: 'CNTY' },
    { id: 'jcg', group: 'nat', flag: 'JP', name: 'JCG', desc: 'JARL Japan Century Guns: 100 guns', goal: 100, key: r => inEntity(r, 'JP') && /^\d{5}$/.test(cnty(r)) ? cnty(r) : null, needs: 'CNTY' },
    { id: 'jagrid', group: 'nat', flag: 'JP', name: 'JA Gridmaster', desc: 'Grid squares worked in Japan', key: r => inEntity(r, 'JP') && validGrid(r.grid4) ? r.grid4 : null },
    { id: 'dld', group: 'nat', flag: 'DE', name: 'DLD (DOKs)', desc: 'DARC Deutschland-Diplom: 100 DOKs', goal: 100, key: r => (r.q.DARC_DOK || '').trim().toUpperCase() || null, needs: 'DARC_DOK' },
    { id: 'nlprov', field: 'STATE', group: 'nat', flag: 'NL', name: 'Dutch Provinces', desc: 'All 12 Netherlands provinces', items: NL_PROVINCES, key: r => inEntity(r, 'NL') && NL_PROVINCES.includes(stCode(r)) ? stCode(r) : null, needs: 'STATE' },
    { id: 'chcant', field: 'STATE', group: 'nat', flag: 'CH', name: 'Swiss Cantons', desc: 'All 26 Swiss cantons', items: CH_CANTONS, key: r => inEntity(r, 'CH') && CH_CANTONS.includes(stCode(r)) ? stCode(r) : null, needs: 'STATE' },
    { id: 'plvoiv', group: 'nat', flag: 'PL', name: 'Polish Voivodeships', desc: 'All 16 Polish voivodeships', goal: 16, key: r => inEntity(r, 'PL') && stCode(r) ? stCode(r) : null, needs: 'STATE' },
];

// Where to put an item's dot on the award map: entity centre for entity awards, else the station
function locOf(a, r) {
    if (MAP_SPEC[a.id]?.entity && r.q._cty?.lat != null) return [r.q._cty.lat, r.q._cty.lon];
    if (MAP_SPEC[a.id]?.mine) {
        const la = parseFloat(r.q.MY_LAT), lo = parseFloat(r.q.MY_LON);
        return (!isNaN(la) && !isNaN(lo)) ? [la, lo] : maidenheadToLatLon(r.q.MY_GRIDSQUARE) || D.ctx.home;
    }
    const lat = parseFloat(r.q.LAT), lon = parseFloat(r.q.LON);
    if (!isNaN(lat) && !isNaN(lon)) return [lat, lon];
    return maidenheadToLatLon(r.q.GRIDSQUARE);
}

function computeAward(a, D, keyFn = a.key) {
    const m = new Map();
    D.rows.forEach(r => {
        let keys = keyFn(r);
        if (!keys) return;
        if (!Array.isArray(keys)) keys = [keys];
        keys.forEach(k => {
            let e = m.get(k);
            if (!e) m.set(k, e = { key: k, label: a.label ? a.label(k, r) : k, n: 0, cfm: false, bands: new Set(), cfmBands: new Set(), first: r, estimated: true });
            e.n++; e.bands.add(r.band);
            // Estimated = every QSO behind this item had the field filled in by the smart reader
            if (!a.field || !r.q._inferred?.includes(a.field)) e.estimated = false;
            if (r.confirmed) { e.cfm = true; e.cfmBands.add(r.band); }
            if ((r.date + r.time) < (e.first.date + e.first.time)) e.first = r;
            if (!e.loc) e.loc = locOf(a, r);
        });
    });
    const cfm = [...m.values()].filter(e => e.cfm).length;
    return { m, wkd: m.size, cfm, goal: a.items ? a.items.length : a.goal || null };
}

// POTA doesn't use QSLs: a park counts once the activator's log is uploaded. So when the user
// has imported their POTA log, the POTA awards follow POTA's record (every listed park is
// credited, including ones missing from this log file); without it, they fall back to the log.
const isPotaAward = a => a.id === 'pota' || a.id === 'potaact';
const cfmWord = a => a.id === 'pota' ? 'credited' : a.id === 'potaact' ? 'valid' : 'confirmed';

function awardData(a, D) {
    const base = computeAward(a, D);
    const newEntry = (key, first) => ({ key, label: key, n: 0, cfm: false, bands: new Set(), cfmBands: new Set(), first, estimated: false });
    if (a.id === 'pota' && D.ctx.potaLog?.hunter?.list?.length) {
        const m = new Map();
        for (const h of D.ctx.potaLog.hunter.list) {
            let e = m.get(h.reference);
            if (!e) m.set(h.reference, e = { ...newEntry(h.reference, { call: h.call, date: h.date }), cfm: true, credited: true });
            e.n++; e.bands.add(h.band); e.cfmBands.add(h.band);
            if (h.date < e.first.date) e.first = { call: h.call, date: h.date };
        }
        // Parks in this log that POTA hasn't credited (activator didn't upload, or a busted call)
        base.m.forEach((e, k) => { if (!m.has(k)) m.set(k, { ...e, cfm: false, cfmBands: new Set() }); });
        return { m, wkd: m.size, cfm: [...m.values()].filter(e => e.cfm).length, goal: a.goal || null, fromPota: true };
    }
    if (a.id === 'potaact' && D.ctx.potaLog?.activator?.activations?.length) {
        const m = new Map();
        for (const act of D.ctx.potaLog.activator.activations) {
            let e = m.get(act.reference);
            const date = act.date.replace(/-/g, '');
            if (!e) m.set(act.reference, e = { ...newEntry(act.reference, { call: '', date }), activations: 0 });
            e.n += act.qsos; e.activations++;
            (act.bands || []).forEach(b => { e.bands.add(b); if (act.valid) e.cfmBands.add(b); });
            if (act.valid) e.cfm = true;
            if (date < e.first.date) e.first = { call: '', date };
        }
        return { m, wkd: m.size, cfm: [...m.values()].filter(e => e.cfm).length, goal: a.goal || null, fromPota: true };
    }
    return base;
}

function computeVucc(D) {
    return VUCC_BANDS.map(([band, goal]) => {
        const grids = new Map();
        D.rows.forEach(r => {
            if (r.band !== band || isSat(r)) return;
            const list = r.q.VUCC_GRIDS ? r.q.VUCC_GRIDS.split(',').map(g => g.trim().toUpperCase().slice(0, 4)) : [r.grid4];
            list.filter(validGrid).forEach(g => grids.set(g, grids.get(g) || r.confirmed));
        });
        return { band, goal, grids, wkd: grids.size, cfm: [...grids.values()].filter(Boolean).length };
    }).filter(b => b.wkd);
}

// ─── Award maps ──────────────────────────────────────────────────────────────
// poly: boundary features ([code, bbox, rings]) coloured per item · grid: worked grid squares ·
// otherwise dots per item (entity centre when entity: true, else the station's location)
const MAP_SPEC = {
    waz: { poly: g => g.zones?.cq },
    itu: { poly: g => g.zones?.itu },
    was: { poly: g => [...(g.states?.[291] || []), ...(g.states?.[6] || []), ...(g.states?.[110] || [])], alias: { DC: 'MD' }, fit: g => g.states?.[291] },
    waca: { poly: g => g.states?.[1] },
    waja: { poly: g => g.states?.[339] },
    nlprov: { poly: g => g.states?.[263] },
    chcant: { poly: g => g.states?.[287] },
    plvoiv: { poly: g => g.states?.[269] },
    vucc: { grid: true }, sat: { grid: true }, jagrid: { grid: true },
    dxcc: { entity: true }, wae: { entity: true }, wac: { entity: true, pointKey: r => dxccKey(r) },
    potaact: { mine: true, parks: true },
    pota: { parks: true },
};

const STYLE = {
    cfm: { color: CONF_COLOR, fillColor: CONF_COLOR, fillOpacity: 0.45, weight: 1, opacity: 0.9 },
    wkd: { color: UNCONF_COLOR, fillColor: UNCONF_COLOR, fillOpacity: 0.45, weight: 1, opacity: 0.9 },
    need: { color: '#94a3b8', fillColor: '#94a3b8', fillOpacity: 0.05, weight: 1, opacity: 0.45 },
};
const statusOf = e => !e?.n ? 'need' : e.cfm ? 'cfm' : 'wkd';
const STATUS_TXT = { cfm: 'Confirmed', wkd: 'Worked, not confirmed', need: 'Needed' };

function mapCard(a, D, st, extra = '') {
    if (!window.L) return '';
    return card('Map', extra + `<div class="sd-award-map" data-award-map="${a.id}"></div>
        <div class="sd-legend sd-map-legend"><i style="background:${CONF_COLOR}"></i> ${a.id === 'potaact' ? 'Valid activation (bubble = QSOs)' : a.id === 'pota' ? 'Credited by POTA' : 'Confirmed'} <i style="background:${UNCONF_COLOR}"></i> ${a.id === 'potaact' ? 'Under 10 QSOs' : a.id === 'pota' ? 'Not in POTA log' : 'Worked'}
        ${MAP_SPEC[a.id]?.poly ? `<i style="background:transparent;border:1px solid #94a3b8"></i> Needed` : ''}</div>`);
}

// Label anchor: centroid of the largest ring (a bbox centre misplaces Florida, Michigan...)
function labelPoint(rings) {
    let best = null, bestA = 0;
    for (const r of rings) {
        let a = 0, cx = 0, cy = 0;
        for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
            const f = r[j][0] * r[i][1] - r[i][0] * r[j][1];
            a += f; cx += (r[j][0] + r[i][0]) * f; cy += (r[j][1] + r[i][1]) * f;
        }
        if (Math.abs(a) > bestA) { bestA = Math.abs(a); best = [cy / (3 * a), cx / (3 * a)]; }
    }
    return best;
}

let awardMap = null;
function mountAwardMap(D, st) {
    if (awardMap) { awardMap.remove(); awardMap = null; }
    const el = root.querySelector('[data-award-map]');
    if (!el || !window.L) return;
    const L = window.L, a = AWARDS.find(x => x.id === el.dataset.awardMap), spec = MAP_SPEC[a.id] || {};
    const map = awardMap = L.map(el, { worldCopyJump: true, minZoom: 1, zoomSnap: 0.25 });
    map.attributionControl.setPrefix(false);
    const baseUrl = D.ctx.tileUrl || 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png';
    L.tileLayer(tileUrl(baseUrl), { maxZoom: 14, attribution: tileAttribution(baseUrl) }).addTo(map);
    const layer = L.featureGroup().addTo(map);
    const tip = (title, status, n) => `<b>${esc(title)}</b><br><span style="color:${STYLE[status].color}">${STATUS_TXT[status]}</span>${n ? ` · ${fmtNum(n)} QSO${n > 1 ? 's' : ''}` : ''}`;
    let fitTo = null;

    if (spec.parks && (D.ctx.potaLog || D.ctx.loadParks)) {
        drawParkMap(a, D, map, layer, el);
        return;
    }
    if (spec.poly) {
        const { m } = computeAward(a, D);
        const feats = spec.poly(D.ctx.geo || {}) || [];
        const labels = [];
        feats.forEach(([code, bbox, rings]) => {
            const key = String(code), e = m.get(spec.alias?.[key] || key), status = statusOf(e);
            L.polygon(rings.map(r => r.map(([x, y]) => [y, x])), { ...STYLE[status], fillRule: 'evenodd' })
                .bindTooltip(tip(a.label ? a.label(key) : key, status, e?.n), { sticky: true }).addTo(layer);
            const at = labelPoint(rings);
            if (at) labels.push({ bbox, marker: L.marker(at, { interactive: false, icon: L.divIcon({ className: 'sd-map-label', html: `<span>${esc(key)}</span>`, iconSize: null }) }) });
        });
        // Only label regions big enough on screen to hold their label, so small ones don't pile up
        const cullLabels = () => labels.forEach(({ bbox: [x0, y0, x1, y1], marker }) => {
            const a = map.latLngToLayerPoint([y0, x0]), b = map.latLngToLayerPoint([y1, x1]);
            const fits = Math.abs(b.x - a.x) > 20 && Math.abs(b.y - a.y) > 12;
            if (fits && !map.hasLayer(marker)) marker.addTo(map);
            else if (!fits && map.hasLayer(marker)) marker.remove();
        });
        map.on('zoomend', cullLabels);
        map.whenReady(() => requestAnimationFrame(cullLabels));
        if (!feats.length) el.insertAdjacentHTML('afterend', emptyState('Boundary data is still loading or unavailable.'));
        const fitFeats = spec.fit?.(D.ctx.geo || {});
        if (fitFeats?.length) fitTo = L.latLngBounds(fitFeats.flatMap(([, [x0, y0, x1, y1]]) => [[y0, x0], [y1, x1]]));
    } else if (spec.grid) {
        let grids;
        if (a.vucc) grids = computeVucc(D).find(b => b.band === st.vuccBand)?.grids || new Map();
        else { const { m } = computeAward(a, D); grids = new Map([...m.values()].map(e => [e.key, e.cfm])); }
        grids.forEach((cfm, g) => {
            const lon = (g.charCodeAt(0) - 65) * 20 - 180 + (+g[2]) * 2, lat = (g.charCodeAt(1) - 65) * 10 - 90 + (+g[3]);
            const status = cfm ? 'cfm' : 'wkd';
            L.rectangle([[lat, lon], [lat + 1, lon + 2]], STYLE[status]).bindTooltip(tip(g, status), { sticky: true }).addTo(layer);
        });
    } else {
        const { m } = computeAward(a, D, spec.pointKey || a.key);
        m.forEach(e => {
            if (!e.loc) return;
            const status = statusOf(e);
            L.circleMarker(e.loc, { radius: 6, weight: 2, color: '#0b1220', fillColor: STYLE[status].color, fillOpacity: 0.95 })
                .bindTooltip(tip(e.label, status, e.n)).addTo(layer);
        });
    }
    // Leaflet needs real dimensions; the modal content has only just been laid out
    requestAnimationFrame(() => {
        map.invalidateSize();
        const b = fitTo || (layer.getLayers().length ? layer.getBounds() : null);
        if (b?.isValid()) map.fitBounds(b, { padding: [20, 20], maxZoom: 7 });
        else map.setView([25, 0], 1.5);
    });
}

// POTA award maps: each park at its real location (POTA's park data).
// Activator: a bubble per activated park, sized and labelled by QSO count, green once valid.
// Hunter: a dot per hunted park, green when POTA credited it.
async function drawParkMap(a, D, map, layer, el) {
    const L = window.L;
    const { m } = awardData(a, D);
    const refs = [...m.keys()];
    const fit = () => {
        map.invalidateSize();
        if (layer.getLayers().length) map.fitBounds(layer.getBounds(), { padding: [30, 30], maxZoom: a.id === 'potaact' ? 10 : 7 });
        else map.setView([50, 0], 3);
    };
    let info = D.ctx.parkInfo || {};
    const missing = refs.filter(r => !info[r]);
    if (missing.length && D.ctx.loadParks) {
        const note = document.createElement('div');
        note.className = 'sd-map-note';
        note.textContent = `Loading ${missing.length} park location${missing.length === 1 ? '' : 's'} from POTA.app…`;
        el.appendChild(note);
        try { info = D.ctx.parkInfo = await D.ctx.loadParks(refs); } catch { /* show what we have */ }
        note.remove();
    }
    if (map !== awardMap) return; // user moved on while loading
    const acts = D.ctx.potaLog?.activator?.activations || [];
    const fmtD = v => fmtDate(String(v || '').replace(/-/g, ''));
    let placed = 0;
    m.forEach((e, ref) => {
        const p = info[ref];
        if (!p || p.lat == null) return;
        placed++;
        const color = e.cfm ? CONF_COLOR : UNCONF_COLOR;
        const head = `<b>${esc(ref)}</b> ${esc(p.name || '')}<br><span style="opacity:0.7">${esc([p.type, p.location].filter(Boolean).join(' · '))}</span>`;
        if (a.id === 'potaact') {
            const mine = acts.filter(x => x.reference === ref);
            const size = Math.round(Math.min(46, 22 + Math.sqrt(e.n) * 2.2));
            L.marker([p.lat, p.lon], { icon: L.divIcon({ className: 'sd-park-bubble', iconSize: [size, size],
                html: `<div style="width:${size}px;height:${size}px;background:${color}">${fmtNum(e.n)}</div>` }) })
                .bindTooltip(`${head}<br><b>${fmtNum(e.n)}</b> QSOs · ${fmtNum(mine.length || e.activations || 0)} activation${(mine.length || e.activations) === 1 ? '' : 's'}`
                    + (mine.length ? '<br>' + mine.slice(0, 8).map(x => `${fmtD(x.date)}: ${fmtNum(x.qsos)} QSOs ${x.valid ? '✓' : `(${10 - x.qsos} short)`}`).join('<br>') + (mine.length > 8 ? `<br>+${mine.length - 8} more` : '') : ''),
                    { direction: 'top', offset: [0, -size / 2] })
                .addTo(layer);
        } else {
            L.circleMarker([p.lat, p.lon], { radius: 6, weight: 2, color: '#0b1220', fillColor: color, fillOpacity: 0.95 })
                .bindTooltip(`${head}<br>${e.cfm ? '● Credited' : '○ Not in POTA log'} · ${fmtNum(e.n)} QSO${e.n === 1 ? '' : 's'}${e.first?.call ? `<br>First: ${esc(e.first.call)} ${fmtD(e.first.date)}` : ''}`)
                .addTo(layer);
        }
    });
    if (!placed && refs.length) el.insertAdjacentHTML('afterend', emptyState('Couldn\'t load park locations from POTA.app right now. Try again later.'));
    requestAnimationFrame(fit);
}

function progressBar(cfm, wkd, goal) {
    if (!goal) return '';
    const c = Math.min(100, cfm / goal * 100), w = Math.min(100 - c, (wkd - cfm) / goal * 100);
    return `<div class="sd-award-bar"><i style="width:${c}%;background:${CONF_COLOR}"></i><i style="width:${w}%;background:${UNCONF_COLOR}"></i></div>`;
}

function awardIcon(a, D) {
    if (a.flag && D.ctx.flag) return `<span class="sd-award-flag">${D.ctx.flag(a.flag)}</span>`;
    return `<span class="sd-award-icon">${a.icon || a.flag}</span>`;
}

function awardCards(group, D) {
    const list = AWARDS.filter(a => a.group === group);
    return `<div class="sd-awards">${list.map(a => {
        let wkd, cfm, goal, sub;
        if (a.vucc) {
            const bands = computeVucc(D);
            const best = bands.sort((x, y) => y.cfm / y.goal - x.cfm / x.goal)[0];
            wkd = best?.wkd || 0; cfm = best?.cfm || 0; goal = best?.goal || 100;
            sub = best ? `Best: ${best.band} · ${bands.filter(b => b.cfm >= b.goal).length} band(s) qualified` : 'No VHF/UHF grids yet';
        } else {
            ({ wkd, cfm, goal } = awardData(a, D));
            sub = wkd ? '' : (a.needs ? `Needs <code>${a.needs}</code> in your log` : 'Nothing worked yet');
            if (a.id === 'pota') sub = D.ctx.pota
                ? `POTA.app: <b>${fmtNum(D.ctx.pota.stats?.hunter?.parks || 0)}</b> parks hunted · ${fmtNum(D.ctx.pota.awards.length)} awards`
                : 'Open to load your POTA.app profile';
            if (a.id === 'potaact') {
                const act = D.ctx.potaLog?.activator, prof = D.ctx.pota?.stats?.activator;
                sub = act?.entries ? `POTA log: <b>${fmtNum(act.valid)}</b> valid activations · ${fmtNum(act.parks)} park${act.parks === 1 ? '' : 's'} · ${fmtNum(act.entries)} QSOs`
                    : prof ? `POTA.app: <b>${fmtNum(prof.activations)}</b> activations · ${fmtNum(prof.parks)} parks · ${fmtNum(prof.qsos)} QSOs`
                    : 'Import your POTA log on this page';
            }
        }
        const done = goal && cfm >= goal;
        return `<button class="sd-award ${done ? 'done' : ''} ${wkd ? '' : 'empty'}" data-award="${a.id}">
            <div class="sd-award-top">${awardIcon(a, D)}<div><div class="sd-award-name">${esc(a.name)}</div><div class="sd-award-desc">${esc(a.desc)}</div></div></div>
            <div class="sd-award-nums">
                <span><b style="color:${CONF_COLOR}">${fmtNum(cfm)}</b> ${cfmWord(a)}</span>
                <span><b style="color:${UNCONF_COLOR}">${fmtNum(wkd)}</b> worked</span>
                ${goal ? `<span class="sd-muted">of ${fmtNum(goal)}</span>` : ''}
            </div>
            ${progressBar(cfm, wkd, goal)}
            ${done ? '<div class="sd-award-done">★ Qualified</div>' : sub ? `<div class="sd-award-sub">${sub}</div>` : ''}
        </button>`;
    }).join('')}</div>`;
}

function awardDetail(a, D, st) {
    const back = `<button class="sd-back" data-award-back>‹ All awards</button>`;
    const head = `<div class="sd-award-head">${awardIcon(a, D)}<div><h3>${esc(a.name)}</h3><p>${esc(a.desc)}</p></div></div>`
        + (a.id === 'pota' ? potaCard(D, st) + potaLogCard(D, st) : '')
        + (a.id === 'potaact' ? activationsCard(D) + potaLogCard(D, st) : '');
    if (a.vucc) {
        const rows = computeVucc(D).map(b => [bandTag(b.band, D.ctx), fmtNum(b.wkd), `<b style="color:${CONF_COLOR}">${fmtNum(b.cfm)}</b>`, fmtNum(b.goal),
            `${progressBar(b.cfm, b.wkd, b.goal)}`, b.cfm >= b.goal ? `<span class="sd-status" style="color:${CONF_COLOR}">★ QUALIFIED</span>` : `${fmtNum(b.goal - b.cfm)} to go`]);
        const bands = computeVucc(D);
        if (!bands.some(b => b.band === st.vuccBand)) st.vuccBand = bands[0]?.band;
        return back + head + (bands.length ? mapCard(a, D, st, segmented('vuccBand', bands.map(b => [b.band, b.band]), st.vuccBand)) : '')
            + card('Grid squares per band (terrestrial)', rows.length
            ? table(['Band', 'Worked', 'Confirmed', 'Needed', 'Progress', 'Status'], rows)
            : emptyState('No grid squares on 6m or higher yet.'), 'Satellite grids count separately');
    }
    const { m, wkd, cfm, goal, fromPota } = awardData(a, D);
    const filter = st.awardFilter || 'all';
    let entries = a.items
        ? a.items.map(k => m.get(k) || { key: k, label: a.label ? a.label(k) : k, n: 0, cfm: false, bands: new Set(), cfmBands: new Set(), first: null })
        : [...m.values()].sort((x, y) => String(x.label).localeCompare(String(y.label), undefined, { numeric: true }));
    const counts = { all: entries.length, cfm: entries.filter(e => e.cfm).length, wkd: entries.filter(e => e.n && !e.cfm).length, need: entries.filter(e => !e.n).length };
    entries = entries.filter(e => filter === 'all' || (filter === 'cfm' && e.cfm) || (filter === 'wkd' && e.n && !e.cfm) || (filter === 'need' && !e.n));
    const W = cfmWord(a)[0].toUpperCase() + cfmWord(a).slice(1);
    const opts = [['all', `All (${counts.all})`], ['cfm', `${W} (${counts.cfm})`], ['wkd', `${a.id === 'pota' ? 'Not credited' : a.id === 'potaact' ? 'Not yet valid' : 'Worked only'} (${counts.wkd})`]];
    if (a.items) opts.push(['need', `Needed (${counts.need})`]);
    const potaStatus = e => a.id === 'pota'
        ? (e.cfm ? `<span class="sd-status" style="color:${CONF_COLOR}">● CREDITED</span>` : `<span class="sd-status" style="color:${UNCONF_COLOR}" title="In your log but not in your POTA log: the activator may not have uploaded yet, or the callsign/time didn't match">○ NOT IN POTA LOG</span>`)
        : (e.cfm ? `<span class="sd-status" style="color:${CONF_COLOR}">● VALID</span>` : `<span class="sd-status" style="color:${UNCONF_COLOR}">○ UNDER 10 QSOs</span>`);
    const statusCell = e => !e.n ? '<span class="sd-muted">○ NEEDED</span>'
        : (fromPota ? potaStatus(e) : status(e.cfm)) + (e.estimated ? ' <span class="sd-muted" title="Worked out by the smart reader from the callsign/location, not logged">≈ est.</span>' : '');
    const rows = entries.map(e => [`<b>${esc(e.label)}</b>${e.label !== e.key && !String(e.key).startsWith('#') ? ` <span class="sd-muted">${esc(e.key)}</span>` : ''}`,
        statusCell(e), e.n ? fmtNum(e.n) : '', [...e.bands].map(b => e.cfmBands.has(b) ? `<b>${bandTag(b, D.ctx)}</b>` : `<span style="opacity:0.55">${bandTag(b, D.ctx)}</span>`).join(' '),
        e.first ? `${e.first.call ? D.ctx.qrzLink(e.first.call, esc(e.first.call)) + ' ' : ''}<span class="sd-muted">${fmtDate(e.first.date)}</span>` : '']);
    return back + head
        + tiles([{ label: W, value: fmtNum(cfm), sub: fromPota ? 'from your POTA log' : '' }, { label: a.id === 'potaact' ? 'Parks' : 'Worked', value: fmtNum(wkd) }, ...(goal ? [{ label: 'Required', value: fmtNum(goal), sub: cfm >= goal ? '★ Qualified' : `${fmtNum(Math.max(0, goal - cfm))} to go` }] : [])])
        + (wkd || MAP_SPEC[a.id]?.poly ? mapCard(a, D, st) : '')
        + (wkd || a.items ? card('Progress', progressBar(cfm, wkd, goal) + segmented('awardFilter', opts, filter)
            + table([isPotaAward(a) ? 'Park' : 'Item', 'Status', 'QSOs', `Bands (bold = ${cfmWord(a)})`, a.id === 'potaact' ? 'First activation' : 'First QSO'], rows, { max: 1000 }))
            : emptyState(a.needs ? `Nothing found. This award uses the <code>${a.needs}</code> field, which isn't in your log for these QSOs.` : 'Nothing worked yet.'));
}

// Full POTA log (hunter + activator): bookmarklet export from pota.app + import here
function potaLogCard(D, st) {
    const imp = D.ctx.potaLog;
    const h = imp?.hunter || (imp?.entries != null ? imp : null), act = imp?.activator;
    return card('Full POTA log', `
        <ol class="sd-steps">
            <li><b>Once:</b> drag this button onto your browser's bookmarks bar →
                <a class="sd-bookmarklet" href="${potaBookmarkletHref()}" title="Drag me to your bookmarks bar" onclick="event.preventDefault(); alert('Drag this button onto your bookmarks bar, then click it while you are on pota.app.');">⬇ Polarplot POTA export</a></li>
            <li>Open <a href="https://pota.app" target="_blank" rel="noopener" style="color:var(--acc);">pota.app</a>, log in, then click that bookmark. It saves your whole hunter <i>and</i> activator log as <code>pota-log.adi</code>.</li>
            <li>Import that file here:
                <label class="sd-action sd-file-btn">Import POTA log<input type="file" accept=".adi,.adif,.txt" data-action="pota-import" hidden></label></li>
        </ol>
        ${st.potaLogMsg ? `<p class="sd-pota-msg" style="margin:6px 0 0;">${st.potaLogMsg}</p>` : ''}
        ${imp ? `<p class="sd-muted" style="font-size:0.68rem;margin:8px 0 0;">Last import ${esc(imp.importedAt)}:
            ${h ? `hunter ${fmtNum(h.entries)} QSOs · ${fmtNum(h.parks)} parks (${fmtNum(h.matched)} in this log)` : ''}
            ${act?.entries ? ` · activator ${fmtNum(act.entries)} QSOs · ${fmtNum(act.activations.length)} activations · ${fmtNum(act.parks)} park${act.parks === 1 ? '' : 's'} (${fmtNum(act.matched)} in this log)` : ''}
            ${act?.entries ? `<br><button class="sd-back" data-award="potaact" style="margin:6px 0 0;">See your ${fmtNum(act.activations.length)} activations on the POTA Activator page ›</button>` : ''}
            ${h && !imp.hasRoles ? '<br><b style="color:#f59e0b">This came from the old bookmark (hunter only).</b> Delete the old bookmark, drag the button above to your bookmarks bar again, and re-export to include your activations.' : ''}</p>` : ''}
        <p class="sd-muted" style="font-size:0.66rem;margin:8px 0 0;">The bookmark runs on pota.app using the login you already have there, so Polarplot never sees your POTA password. It reads every page of your log, not just the first 100 rows.</p>`);
}

// Your activations: from the imported POTA log (complete) or the public profile (recent)
function activationsCard(D) {
    const act = D.ctx.potaLog?.activator;
    const list = act?.activations?.length ? act.activations : (D.ctx.pota?.activations || []).map(a => ({ reference: a.reference, date: a.date, qsos: a.total, valid: a.total >= 10, park: a.park }));
    const parkName = ref => D.ctx.parkInfo?.[ref]?.name || D.ctx.pota?.activations?.find(a => a.reference === ref)?.park || '';
    const fmtD = v => fmtDate(String(v || '').slice(0, 10).replace(/-/g, ''));
    const tagged = D.rows.filter(r => r.q.MY_POTA_REF || String(r.q.MY_SIG || '').toUpperCase() === 'POTA').length;
    const head = `<div class="sd-pota-form">
        <button class="sd-action" data-action="act-map" data-ref="" style="margin:0;" ${tagged ? '' : 'disabled'}>Show my activation QSOs on the map</button>
        <span class="sd-muted" style="font-size:0.68rem;">${fmtNum(tagged)} QSO${tagged === 1 ? '' : 's'} in this log are from your activations</span></div>`;
    if (!list.length) return card('Your activations', head + emptyState('Import your POTA log below (or load your POTA.app profile on the POTA Hunter page) to list your activations.'));
    return card('Your activations', head + table(['Date', 'Park', '', 'QSOs', 'Stations', 'Bands', 'Valid', ''],
        list.map(a => [fmtD(a.date),
            `<a href="https://pota.app/#/park/${encodeURIComponent(a.reference)}" target="_blank" rel="noopener" style="color:var(--acc);text-decoration:none;font-weight:700;">${esc(a.reference)}</a>`,
            `<span class="sd-muted">${esc(a.park || parkName(a.reference))}</span>`, `<b>${fmtNum(a.qsos)}</b>`, a.stations != null ? fmtNum(a.stations) : '', esc((a.bands || []).join(' ')),
            a.valid ? `<span class="sd-status" style="color:${CONF_COLOR}">✓ VALID</span>` : `<span class="sd-status" style="color:${UNCONF_COLOR}">${fmtNum(10 - a.qsos)} SHORT</span>`,
            `<button class="sd-back" data-action="act-map" data-ref="${esc(a.reference)}" style="margin:0;padding:3px 9px;">Map</button>`])),
        act?.activations?.length ? `${fmtNum(list.length)} activations · ${fmtNum(act.valid)} valid` : 'recent, from POTA.app');
}

// ─── POTA.app (public profile) ───────────────────────────────────────────────
function potaCard(D, st) {
    const p = D.ctx.pota;
    const form = `<div class="sd-pota-form">
        <input id="sd-pota-call" class="field-input" value="${esc(p?.callsign || D.ctx.potaCall || '')}" placeholder="Your callsign" spellcheck="false" style="text-transform:uppercase;">
        <button class="sd-action" data-action="pota-load" style="margin:0;">${p ? '↻ Refresh from POTA.app' : 'Load from POTA.app'}</button>
        ${st.potaMsg ? `<span class="sd-pota-msg">${st.potaMsg}</span>` : ''}
    </div>`;
    if (!p) return card('POTA.app', form + `<p class="sd-intro" style="margin:10px 0 0;">Your log doesn't record which parks you hunted (no <code>POTA_REF</code>). Load your public POTA.app profile to see your official totals, the awards you've earned and your recent park contacts. Recent hunter QSOs found in your log get their park reference added.</p>`);

    const s = p.stats || {};
    const fmtD = v => fmtDate(String(v || '').slice(0, 10).replace(/-/g, ''));
    const matched = h => D.rows.some(r => r.q._potaFromApp && (r.q.POTA_REF || '').toUpperCase() === h.reference.toUpperCase() && r.date === String(h.date).slice(0, 10).replace(/-/g, ''));
    return card(`POTA.app · ${esc(p.callsign)}${p.otherCallsigns?.length ? ` <span class="sd-muted">(also ${esc(p.otherCallsigns.join(', '))})</span>` : ''}`,
        form
        + tiles([
            { label: 'Parks Hunted', value: fmtNum(s.hunter?.parks || 0), sub: `${fmtNum(s.hunter?.qsos || 0)} hunter QSOs` },
            { label: 'Activations', value: fmtNum(s.activator?.activations || 0), sub: `${fmtNum(s.activator?.parks || 0)} park${s.activator?.parks === 1 ? '' : 's'} · ${fmtNum(s.activator?.qsos || 0)} QSOs` },
            { label: 'Awards', value: fmtNum(s.awards || p.awards.length), sub: `${fmtNum(s.endorsements || 0)} endorsements` },
        ])
        + (p.awards.length ? `<div class="sd-pota-awards">${p.awards.map(a => `<div class="sd-pota-award" data-tip="${esc((a.endorsements || []).join(' · ') || 'No endorsements')}">
              <b>★ ${esc(a.name)}</b><span>${fmtD(a.granted)}</span></div>`).join('')}</div>` : '')
        + `<p class="sd-muted" style="font-size:0.68rem;margin:10px 0 0;">Official figures from POTA.app, fetched ${esc(p.fetchedAt)}. The complete list of parks you've hunted needs your POTA.app login, so it can't be read here. <a href="https://pota.app/#/profile/${encodeURIComponent(p.callsign)}" target="_blank" rel="noopener" style="color:var(--acc);">Open your POTA.app profile ›</a></p>`)
        + (p.hunterQsos.length ? card('Recent hunter QSOs', table(['Date', 'Activator', 'Band', 'Mode', 'Park', '', 'In your log'],
            p.hunterQsos.map(h => [fmtD(h.date), D.ctx.qrzLink(h.callsign, `<b>${esc(h.callsign)}</b>`), bandTag(String(h.band || '').toUpperCase(), D.ctx), esc(h.mode),
                `<a href="https://pota.app/#/park/${encodeURIComponent(h.reference)}" target="_blank" rel="noopener" style="color:var(--acc);text-decoration:none;font-weight:700;">${esc(h.reference)}</a>`,
                `<span class="sd-muted">${esc(h.park)}</span>`, matched(h) ? `<span class="sd-status" style="color:${CONF_COLOR}">✓ tagged</span>` : '<span class="sd-muted">–</span>'])), `last ${p.hunterQsos.length}`) : '')
        + (p.activations.length ? card('Your recent activations', table(['Date', 'Park', '', 'Location', 'CW', 'Data', 'Phone', 'QSOs'],
            p.activations.map(a => [fmtD(a.date), `<a href="https://pota.app/#/park/${encodeURIComponent(a.reference)}" target="_blank" rel="noopener" style="color:var(--acc);text-decoration:none;font-weight:700;">${esc(a.reference)}</a>`,
                `<span class="sd-muted">${esc(a.park)}</span>`, esc(a.location), fmtNum(a.cw), fmtNum(a.data), fmtNum(a.phone), `<b>${fmtNum(a.total)}</b>`]))) : '');
}

const awardSection = group => (D, st) => {
    const a = st.award && AWARDS.find(x => x.id === st.award && x.group === group);
    if (a) return awardDetail(a, D, st);
    const smart = D.rows.filter(r => r.q._inferred?.length).length;
    return `<p class="sd-intro">Progress from your log. Confirmed means LoTW, a paper QSL, eQSL or QRZ confirmation has been received. Click an award for details.`
        + (smart ? `<br>Smart reader: zones, states or continents for <b>${fmtNum(smart)}</b> QSOs were worked out from the callsign and the station's location, because the log didn't include them.` : '')
        + `</p>` + awardCards(group, D);
};

function sectionAntenna(D) {
    const withB = D.rows.filter(r => r.bearing != null);
    let html = '';
    if (withB.length) {
        const N = 16, sectors = Array(N).fill(0);
        withB.forEach(r => { sectors[Math.round(r.bearing / (360 / N)) % N]++; });
        const max = Math.max(...sectors, 1);
        const names = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];
        const C = 170, R = 140;
        const pt = (deg, rad) => [C + rad * Math.sin(deg * Math.PI / 180), C - rad * Math.cos(deg * Math.PI / 180)];
        let svg = [0.25, 0.5, 0.75, 1].map(f => `<circle cx="${C}" cy="${C}" r="${R * f}" class="sd-grid" fill="none"/>`).join('');
        for (let i = 0; i < N; i++) {
            const [x, y] = pt(i * 22.5, R); svg += `<line x1="${C}" y1="${C}" x2="${x}" y2="${y}" class="sd-grid"/>`;
        }
        sectors.forEach((v, i) => {
            if (!v) return;
            const rad = R * Math.sqrt(v / max); // area-true
            const a0 = i * 22.5 - 10.25, a1 = i * 22.5 + 10.25;
            const [x0, y0] = pt(a0, rad), [x1, y1] = pt(a1, rad);
            svg += `<path d="M${C},${C}L${x0},${y0}A${rad},${rad} 0 0 1 ${x1},${y1}Z" class="sd-wedge" data-tip="${names[i]} (${(i * 22.5 - 11.25 + 360) % 360}°–${i * 22.5 + 11.25}°): ${fmtNum(v)} QSOs (${pct(v, withB.length)}%)"/>`;
        });
        ['N', 'E', 'S', 'W'].forEach((n, i) => { const [x, y] = pt(i * 90, R + 16); svg += `<text x="${x}" y="${y + 4}" class="sd-axis sd-axis-strong" text-anchor="middle">${n}</text>`; });
        const top = sectors.map((v, i) => [names[i], v]).sort((a, b) => b[1] - a[1]).slice(0, 5);
        html += card('Beam headings worked (short path from your QTH)',
            `<div class="sd-rose"><svg viewBox="0 0 340 340" class="sd-svg sd-rose-svg">${svg}</svg>
             <div class="sd-rose-side">${hbars(top.map(([n, v]) => ({ label: n, value: v, tip: `${n}: ${fmtNum(v)} QSOs` })))}
             <p class="sd-muted">Wedge area is proportional to QSO count. Uses <code>MY_GRIDSQUARE</code> per QSO when present, otherwise your home location.</p></div></div>`,
            `${fmtNum(withB.length)} QSOs with a heading`);
    } else {
        html += emptyState('Set your home location (or log <code>MY_GRIDSQUARE</code>) to see beam headings.');
    }
    const ants = {};
    D.rows.forEach(r => { const a = r.q.MY_ANTENNA || r.q.MY_ANT; if (a) (ants[a] ||= { n: 0, dxcc: new Set(), far: 0 }).n++; });
    D.rows.forEach(r => { const a = r.q.MY_ANTENNA || r.q.MY_ANT; if (a) { ants[a].dxcc.add(r.country); ants[a].far = Math.max(ants[a].far, r.dist || 0); } });
    const antRows = Object.entries(ants).sort((a, b) => b[1].n - a[1].n).map(([a, v]) => [`<b>${esc(a)}</b>`, fmtNum(v.n), fmtNum(v.dxcc.size), v.far ? `${fmtNum(Math.round(v.far))} ${unitLbl(D)}` : '--']);
    html += card('By antenna', antRows.length ? table(['Antenna', 'QSOs', 'DXCC', 'Longest'], antRows)
        : emptyState('No <code>MY_ANTENNA</code> field in your log. Loggers like Log4OM, N1MM and Wavelog can record which antenna you used.'));
    return html;
}

const SECTIONS = [
    { id: 'overview', title: 'Overview', render: sectionOverview },
    { id: 'countries', title: 'Countries Worked', render: sectionCountries },
    { group: 'Confirmations' },
    { id: 'qsl', title: 'QSL Statistics', render: sectionQSL },
    { group: 'Grids' },
    { id: 'gridmap', title: 'Gridsquare Map', render: sectionGridMap },
    { id: 'activated', title: 'Activated Gridsquares', render: sectionActivated },
    { id: 'activators', title: 'Gridsquare Activators', render: sectionActivators },
    { group: 'Distance & Direction' },
    { id: 'distances', title: 'Distances Worked', render: sectionDistances },
    { id: 'satellites', title: 'Satellite Distance Records', render: sectionSatellites },
    { id: 'antenna', title: 'Antenna Analytics', render: sectionAntenna },
    { group: 'Time' },
    { id: 'days', title: 'Days with QSOs', render: sectionDays },
    { id: 'timeline', title: 'Timeline', render: sectionTimeline },
    { id: 'accumulated', title: 'Accumulated Statistics', render: sectionAccumulated },
    { id: 'timeplotter', title: 'Timeplotter', render: sectionTimeplotter },
    { group: 'Breakdowns' },
    { id: 'continents', title: 'Continents', render: sectionContinents },
    { id: 'callsigns', title: 'Callsign Statistics', render: sectionCallsigns },
    { id: 'eme', title: 'EME Initials', render: sectionEME },
    { id: 'countby', title: 'Count QSOs by…', render: sectionCountBy },
    { group: 'Awards' },
    { id: 'awards-intl', title: 'International', render: awardSection('intl') },
    { id: 'awards-xota', title: 'xOTA', render: awardSection('xota') },
    { id: 'awards-nat', title: 'National', render: awardSection('nat') },
];

// ─── Countries Worked ────────────────────────────────────────────────────────
// One row per DXCC entity; the map outlines every country and shades the ones worked.
function countryEntities(D) {
    const m = new Map();
    D.rows.forEach(r => {
        const k = dxccKey(r);
        if (!k) return;
        let e = m.get(k);
        if (!e) m.set(k, e = { key: k, label: r.country, iso: (r.iso || '').toLowerCase(), cont: r.cont, n: 0, cfm: false, bands: new Set(), first: r,
            loc: r.q._cty?.lat != null ? [r.q._cty.lat, r.q._cty.lon] : null });
        e.n++; e.bands.add(r.band);
        if (r.confirmed) e.cfm = true;
        if (!e.iso && r.iso) e.iso = r.iso.toLowerCase();
        if (!e.cont && r.cont) e.cont = r.cont;
        if ((r.date + r.time) < (e.first.date + e.first.time)) e.first = r;
    });
    return m;
}

function sectionCountries(D, st) {
    const m = countryEntities(D);
    const all = [...m.values()].sort((a, b) => a.label.localeCompare(b.label));
    const cfm = all.filter(e => e.cfm).length;
    const filter = st.ctyFilter || 'all';
    const shown = all.filter(e => filter === 'all' || (filter === 'cfm' ? e.cfm : !e.cfm));
    const flag = iso => iso && D.ctx.flag ? `<span class="sd-cty-flag">${D.ctx.flag(iso)}</span>` : '<span class="sd-cty-flag"></span>';
    const rows = shown.map(e => [
        `${flag(e.iso)}<b>${esc(e.label)}</b>`, esc(e.cont || '–'), status(e.cfm), fmtNum(e.n),
        [...e.bands].map(b => bandTag(b, D.ctx)).join(' '),
        `${D.ctx.qrzLink(e.first.call, esc(e.first.call))} <span class="sd-muted">${fmtDate(e.first.date)}</span>`]);
    return tiles([
        { label: 'Entities Worked', value: fmtNum(all.length), sub: 'DXCC' },
        { label: 'Confirmed', value: fmtNum(cfm), sub: `${pct(cfm, all.length)}%` },
        { label: 'Unconfirmed', value: fmtNum(all.length - cfm) },
        { label: 'Continents', value: `${new Set(all.map(e => e.cont).filter(c => c && c !== 'AN')).size}<small>/6</small>` },
    ])
    + card('Map', `<div class="sd-award-map" data-countries-map style="height:460px;"></div>
        <div class="sd-legend sd-map-legend"><i style="background:${CONF_COLOR}"></i> Confirmed <i style="background:${UNCONF_COLOR}"></i> Worked
        <i style="background:transparent;border:1px solid #94a3b8"></i> Not worked yet <span style="margin-left:8px;opacity:0.8">· outlines follow DXCC entities (Hawaii, Alaska, Canaries… separate) · dots = small entities</span></div>`)
    + card('Entities', segmented('ctyFilter', [['all', `All (${all.length})`], ['cfm', `Confirmed (${cfm})`], ['wkd', `Worked only (${all.length - cfm})`]], filter)
        + table(['Entity', 'Cont.', 'Status', 'QSOs', 'Bands', 'First QSO'], rows, { max: 1000 }));
}

// Country outlines are political; DXCC counts some islands/regions separately. Pieces of a
// country whose centre falls in one of these boxes belong to that entity instead.
// [entity (CTY name), south, west, north, east]
const DXCC_REGIONS = [
    ['Hawaii', 18, -161, 23, -154],
    ['Alaska', 51, -180, 72, -129.9], ['Alaska', 51, 172, 56, 180],
    ['Canary Islands', 27.4, -18.4, 29.5, -13.2], ['Balearic Islands', 38.5, 1, 40.2, 4.5],
    ['Azores', 36.8, -31.6, 39.9, -24.6], ['Madeira Islands', 32.3, -17.4, 33.2, -16.2],
    ['Corsica', 41.3, 8.4, 43.1, 9.7], ['Sardinia', 38.8, 8, 41.4, 10],
    ['Crete', 34.7, 23.4, 35.8, 26.5], ['Dodecanese', 35.3, 26, 37.6, 28.4],
    ['Kaliningrad', 54.2, 19.5, 55.4, 23], ['Franz Josef Land', 79.5, 44, 82, 66],
    ['Jan Mayen', 70.7, -9.2, 71.3, -7.8], ['Aland Islands', 59.8, 19.2, 60.6, 21.3],
    ['Galapagos Islands', -1.6, -92.2, 0.8, -89], ['Easter Island', -27.3, -109.6, -27, -109.1],
    ['Juan Fernandez Islands', -34, -81, -33.5, -78.7], ['Fernando de Noronha', -4, -32.6, -3.7, -32.3],
    ['Andaman & Nicobar Is.', 6.5, 92, 14, 94.3], ['Lakshadweep Islands', 8, 71.5, 12.5, 74],
    ['Rodriguez Island', -19.9, 63.2, -19.6, 63.6], ['Ogasawara', 24, 141, 27.8, 142.4],
    ['Chatham Islands', -44.5, -177, -43.5, -176], ['Lord Howe Island', -31.7, 158.9, -31.4, 159.2],
    ['Ceuta & Melilla', 35.2, -5.5, 35.95, -2.9], ['San Andres & Providencia', 12.4, -81.9, 13.5, -81.2],
];

function ringCentre(r) {
    let a = 0, cx = 0, cy = 0;
    for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
        const f = r[j][0] * r[i][1] - r[i][0] * r[j][1];
        a += f; cx += (r[j][0] + r[i][0]) * f; cy += (r[j][1] + r[i][1]) * f;
    }
    if (!a) return r[0];
    return [cx / (3 * a), cy / (3 * a)];
}

// Keep the part of a ring west (keepWest) or east of longitude x0 (Sutherland–Hodgman, one edge)
function clipRingAtLon(ring, x0, keepWest) {
    const inside = p => keepWest ? p[0] <= x0 : p[0] >= x0;
    const out = [];
    for (let i = 0; i < ring.length; i++) {
        const a = ring[i], b = ring[(i + 1) % ring.length];
        if (inside(a)) out.push(a);
        if (inside(a) !== inside(b)) {
            const t = (x0 - a[0]) / (b[0] - a[0]);
            out.push([x0, a[1] + t * (b[1] - a[1])]);
        }
    }
    return out.length >= 4 ? out : null;
}

/** Split country outlines into DXCC entities → Map(entity name → { name, rings }) */
function dxccShapes(countries, entities) {
    const shapes = new Map();
    const add = (name, ring) => { if (!shapes.has(name)) shapes.set(name, { name, rings: [] }); shapes.get(name).rings.push(ring); };
    const carved = new Set(DXCC_REGIONS.map(r => r[0]));
    const isoOf = new Map(entities.map(e => [e.name, e.iso]));
    const codes = new Set(countries.map(c => c[0]));
    // A region is only carved out of its own country: skip it when its entity's flag code is a
    // DIFFERENT country we have an outline for (stops Alaska's box claiming Russia's Chukotka)
    const regionOf = ([x, y], code) => DXCC_REGIONS.find(([name, s, w, n, e]) => y >= s && y <= n && x >= w && x <= e
        && !(isoOf.get(name) && isoOf.get(name) !== code && codes.has(isoOf.get(name))))?.[0];
    const dist = (a, b) => Math.hypot(a[0] - b[0], (a[1] - b[1]) * Math.cos(a[0] * Math.PI / 180));
    for (const [code, , rings, countryName] of countries) {
        // The country's main entity: same flag code, not a carved-out region (nearest one if several)
        const mains = entities.filter(e => e.iso === code && !carved.has(e.name));
        const mainFor = c => mains.length ? mains.reduce((b, e) => dist([c[1], c[0]], [e.lat, e.lon]) < dist([c[1], c[0]], [b.lat, b.lon]) ? e : b).name : countryName;
        for (const ring of rings) {
            if (code === 'ru') {
                // DXCC splits Russia at the Urals (≈60°E). Arctic islands west of 70°E stay European.
                const c = ringCentre(ring), region = regionOf(c, code);
                if (region) { add(region, ring); continue; }
                // Chukotka crosses the date line: pieces with negative longitude are the far east
                if (c[0] < 0) { add('Asiatic Russia', ring); continue; }
                const arcticWest = c[1] > 68 && c[0] < 70;
                const west = arcticWest ? ring : clipRingAtLon(ring, 60, true);
                const east = arcticWest ? null : clipRingAtLon(ring, 60, false);
                if (west) add('European Russia', west);
                if (east) add('Asiatic Russia', east);
                continue;
            }
            const c = ringCentre(ring);
            add(regionOf(c, code) || mainFor(c), ring);
        }
    }
    return shapes;
}

async function mountCountriesMap(D) {
    const el = root.querySelector('[data-countries-map]');
    if (!el || !window.L) return;
    const L = window.L;
    const map = awardMap = L.map(el, { worldCopyJump: true, minZoom: 1, zoomSnap: 0.25 });
    map.attributionControl.setPrefix(false);
    const baseUrl = D.ctx.tileUrl || 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png';
    L.tileLayer(tileUrl(baseUrl), { maxZoom: 10, attribution: tileAttribution(baseUrl) + ' · Borders: Natural Earth' }).addTo(map);
    requestAnimationFrame(() => { map.invalidateSize(); map.setView([30, 10], 1.75); });

    const worked = countryEntities(D); // key = entity name, upper-case
    const [countries, dxcc] = await Promise.all([
        D.ctx.loadCountries ? D.ctx.loadCountries() : [],
        D.ctx.loadDxccEntities ? D.ctx.loadDxccEntities() : [],
    ]);
    if (map !== awardMap) return; // user moved on while loading
    const outlined = new Set();
    const STYLE_C = {
        cfm: { color: CONF_COLOR, weight: 1, opacity: 0.9, fillColor: CONF_COLOR, fillOpacity: 0.42 },
        wkd: { color: UNCONF_COLOR, weight: 1, opacity: 0.9, fillColor: UNCONF_COLOR, fillOpacity: 0.42 },
        need: { color: '#94a3b8', weight: 0.8, opacity: 0.55, fillColor: '#94a3b8', fillOpacity: 0.03 },
    };
    const line = e => `${esc(e.label)} · ${e.cfm ? '<span style="color:' + CONF_COLOR + '">● confirmed</span>' : '<span style="color:' + UNCONF_COLOR + '">○ worked</span>'} · ${fmtNum(e.n)} QSO${e.n === 1 ? '' : 's'}`;
    dxccShapes(countries, dxcc).forEach(({ name, rings }) => {
        const e = worked.get(name.toUpperCase());
        if (e) outlined.add(e);
        const status = !e ? 'need' : e.cfm ? 'cfm' : 'wkd';
        L.polygon(rings.map(r => r.map(([x, y]) => [y, x])), { ...STYLE_C[status], fillRule: 'evenodd' })
            .bindTooltip(`<b>${esc(name)}</b><br>${e ? line(e) : '<span style="opacity:0.7">Not worked yet</span>'}`, { sticky: true })
            .addTo(map);
    });
    // Islands and other entities with no outline at this scale
    [...worked.values()].filter(e => !outlined.has(e) && e.loc).forEach(e => {
        L.circleMarker(e.loc, { radius: 5, weight: 2, color: '#0b1220', fillColor: e.cfm ? CONF_COLOR : UNCONF_COLOR, fillOpacity: 0.95 })
            .bindTooltip(line(e)).addTo(map);
    });
}

// ─── Modal shell ────────────────────────────────────────────────────────────

let root = null, D = null, active = 'overview', srcQsos = [];
const state = {};

function ensureDom(ctx) {
    if (root) return;
    root = document.createElement('div');
    root.id = 'stats-dashboard';
    root.className = 'sd-overlay';
    root.innerHTML = `
        <div class="sd-window" role="dialog" aria-modal="true" aria-labelledby="sd-title">
            <div class="sd-head">
                <div><h2 id="sd-title">Statistics</h2><span id="sd-scope" class="sd-scope"></span></div>
                <button class="close-btn" id="sd-close" aria-label="Close statistics">×</button>
            </div>
            <div class="sd-body">
                <nav class="sd-nav">${SECTIONS.map(s => s.group
                    ? `<div class="sd-nav-group">${s.group}</div>`
                    : `<button data-sec="${s.id}">${s.title}</button>`).join('')}</nav>
                <div class="sd-content" id="sd-content"></div>
            </div>
        </div>
        <div class="sd-tip" id="sd-tip"></div>`;
    document.body.appendChild(root);

    const close = () => root.classList.remove('visible');
    root.querySelector('#sd-close').addEventListener('click', close);
    root.addEventListener('click', e => { if (e.target === root) close(); });
    document.addEventListener('keydown', e => { if (e.key === 'Escape' && root.classList.contains('visible')) close(); });

    root.querySelector('.sd-nav').addEventListener('click', e => {
        const b = e.target.closest('[data-sec]'); if (!b) return;
        active = b.dataset.sec; state.award = null; state.awardFilter = null; render();
    });

    const content = root.querySelector('#sd-content');
    content.addEventListener('click', e => {
        const seg = e.target.closest('.sd-seg button');
        if (seg) { state[seg.parentElement.dataset.seg] = seg.dataset.v; render(false); return; }
        if (e.target.closest('[data-action="show-grids"]')) { close(); ctx.showGridsOnMap?.(); return; }
        const actBtn = e.target.closest('[data-action="act-map"]');
        if (actBtn && D?.ctx.showActivationOnMap) { close(); D.ctx.showActivationOnMap(actBtn.dataset.ref); return; }
        const potaBtn = e.target.closest('[data-action="pota-load"]');
        if (potaBtn && D?.ctx.loadPota) {
            const c = D.ctx; // current open's settings (the ctx captured by this listener may be stale)
            const call = root.querySelector('#sd-pota-call')?.value;
            potaBtn.disabled = true; potaBtn.textContent = 'Loading…';
            c.loadPota(call).then(({ profile, tagged }) => {
                c.pota = profile;
                state.potaMsg = tagged ? `✓ Added park references to ${tagged} QSO${tagged === 1 ? '' : 's'} in your log` : '✓ Loaded';
            }).catch(err => { state.potaMsg = `<span style="color:#f87171">✗ ${esc(err.message)}</span>`; })
              .finally(() => { D = buildDataset(srcQsos, c); render(false); });
            return;
        }
        const award = e.target.closest('[data-award]');
        if (award) { state.award = award.dataset.award; state.awardFilter = null; render(); return; }
        if (e.target.closest('[data-award-back]')) { state.award = null; render(); }
    });

    // Shared hover tooltip for every [data-tip] mark
    const tip = root.querySelector('#sd-tip');
    const place = (x, y) => {
        const w = tip.offsetWidth, h = tip.offsetHeight;
        tip.style.left = Math.min(window.innerWidth - w - 8, x + 14) + 'px';
        tip.style.top = (y - h - 12 < 8 ? y + 18 : y - h - 12) + 'px';
    };
    content.addEventListener('change', e => {
        const input = e.target.closest('[data-action="pota-import"]');
        const c = D?.ctx;
        if (!input || !input.files[0] || !c?.importPotaLog) return;
        input.files[0].text().then(text => {
            const res = c.importPotaLog(text);
            c.potaLog = res.summary;
            const { hunter: h, activator: act } = res.summary;
            state.potaLogMsg = (h.entries || act.entries)
                ? `✓ Hunter: ${fmtNum(h.entries)} QSOs, ${fmtNum(h.parks)} parks · Activator: ${fmtNum(act.entries)} QSOs, ${fmtNum(act.activations.length)} activations · park added to ${fmtNum(res.tagged)} QSO${res.tagged === 1 ? '' : 's'} in your log`
                  + (res.summary.hasRoles ? '' : ` <span style="color:#f59e0b">· old bookmark: no activator data</span>`)
                : `<span style="color:#f87171">✗ No POTA QSOs found in that file.</span>`;
        }).catch(err => { state.potaLogMsg = `<span style="color:#f87171">✗ ${esc(err.message)}</span>`; })
          .finally(() => { input.value = ''; D = buildDataset(srcQsos, c); render(false); });
    });

    content.addEventListener('mouseover', e => {
        const t = e.target.closest('[data-tip]'); if (!t) return;
        tip.textContent = t.dataset.tip; tip.classList.add('visible'); place(e.clientX, e.clientY);
    });
    content.addEventListener('mousemove', e => {
        if (e.target.closest('[data-tip]')) place(e.clientX, e.clientY);
        // Line chart crosshair
        const svg = e.target.closest('svg[data-line]');
        if (svg && e.target.classList.contains('sd-hit')) {
            const pts = svg._pts ||= JSON.parse(svg.dataset.line);
            const r = svg.getBoundingClientRect();
            const vx = (e.clientX - r.left) / r.width * svg.viewBox.baseVal.width;
            const p = pts.reduce((a, b) => Math.abs(b[0] - vx) < Math.abs(a[0] - vx) ? b : a);
            const cross = svg.querySelector('.sd-cross'), dot = svg.querySelector('.sd-cross-dot');
            cross.setAttribute('x1', p[0]); cross.setAttribute('x2', p[0]); cross.style.display = '';
            dot.setAttribute('cx', p[0]); dot.setAttribute('cy', p[1]); dot.style.display = '';
            tip.textContent = p[2]; tip.classList.add('visible'); place(e.clientX, e.clientY);
        }
    });
    content.addEventListener('mouseout', e => {
        if (e.relatedTarget?.closest?.('[data-tip], .sd-hit')) return;
        tip.classList.remove('visible');
        content.querySelectorAll('.sd-cross, .sd-cross-dot').forEach(el => { el.style.display = 'none'; });
    });
}

function render(scrollTop = true) {
    root.querySelectorAll('.sd-nav button').forEach(b => b.classList.toggle('active', b.dataset.sec === active));
    const sec = SECTIONS.find(s => s.id === active);
    const content = root.querySelector('#sd-content');
    content.innerHTML = `<h2 class="sd-sec-title">${sec.title}</h2>` + (D.rows.length ? sec.render(D, state) : emptyState('No QSOs match the current filters.'));
    root.querySelector('#sd-tip').classList.remove('visible');
    if (scrollTop) content.scrollTop = 0;
    mountAwardMap(D, state);
    if (root.querySelector('[data-countries-map]')) mountCountriesMap(D);
}

/**
 * Open the dashboard.
 * @param {object[]} qsos      QSOs after the sidebar filters
 * @param {number}   totalAll  size of the whole log (for the scope line)
 * @param {object}   ctx       { units, home:[lat,lon]|null, bandColors, isoOf(q), isConfirmed(q), qrzLink(call, html), flag(iso), showGridsOnMap() }
 */
export function openStatsDashboard(qsos, totalAll, ctx) {
    ensureDom(ctx);
    srcQsos = qsos;
    state.potaMsg = null;
    state.potaLogMsg = null;
    D = buildDataset(qsos, ctx);
    root.querySelector('#sd-scope').textContent = qsos.length === totalAll
        ? `${fmtNum(totalAll)} QSOs · whole log`
        : `${fmtNum(qsos.length)} of ${fmtNum(totalAll)} QSOs · following your sidebar filters`;
    render();
    root.classList.add('visible');
}
