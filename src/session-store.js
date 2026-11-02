// ─── Saved sessions ──────────────────────────────────────────────────────────
// Keeps loaded logs in the browser (IndexedDB) so a refresh doesn't lose them — including
// everything resolved since import (QRZ locations, LoTW confirmations). Nothing leaves the device.
//
// Record: { id, name, savedAt, created, count, qsos, meta }
//   meta: free-form per-log state, e.g. { lotwSyncedAt: '2026-10-02' }

const DB_NAME = 'polarplot', STORE = 'logs', LAST_KEY = 'polarplot_last_log';

let dbPromise = null;
function db() {
    if (!dbPromise) dbPromise = new Promise((resolve, reject) => {
        const req = indexedDB.open(DB_NAME, 1);
        req.onupgradeneeded = () => req.result.createObjectStore(STORE, { keyPath: 'id' });
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
    });
    return dbPromise;
}

function tx(mode, fn) {
    return db().then(d => new Promise((resolve, reject) => {
        const t = d.transaction(STORE, mode);
        const result = fn(t.objectStore(STORE));
        t.oncomplete = () => resolve(result?.result ?? result);
        t.onerror = () => reject(t.error);
        t.onabort = () => reject(t.error);
    }));
}

// Runtime-only fields (callsign lookups etc.) are rebuilt on load; keep the stored copy lean
const stripRuntime = qsos => qsos.map(q => {
    const { _cty, ...rest } = q;
    return rest;
});

export const isAvailable = () => typeof indexedDB !== 'undefined';

/** Newest first, without the QSO arrays. */
export async function listSessions() {
    const all = await tx('readonly', s => s.getAll());
    return all.map(({ qsos, ...info }) => info).sort((a, b) => b.savedAt - a.savedAt);
}

export async function saveSession({ id, name, qsos, meta = {} }) {
    const prev = id ? await tx('readonly', s => s.get(id)) : null;
    const rec = {
        id: id || `log-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
        name: name || prev?.name || 'Untitled log',
        created: prev?.created || Date.now(),
        savedAt: Date.now(),
        count: qsos.length,
        qsos: stripRuntime(qsos),
        meta: { ...(prev?.meta || {}), ...meta },
    };
    await tx('readwrite', s => s.put(rec));
    setLastSessionId(rec.id);
    return rec;
}

export const loadSession = id => tx('readonly', s => s.get(id));

export async function renameSession(id, name) {
    const rec = await loadSession(id);
    if (!rec) return;
    rec.name = name;
    await tx('readwrite', s => s.put(rec));
}

export async function deleteSession(id) {
    await tx('readwrite', s => s.delete(id));
    if (getLastSessionId() === id) setLastSessionId(null);
}

export function getLastSessionId() {
    try { return localStorage.getItem(LAST_KEY); } catch { return null; }
}

export function setLastSessionId(id) {
    try { id ? localStorage.setItem(LAST_KEY, id) : localStorage.removeItem(LAST_KEY); } catch { /* storage blocked */ }
}
