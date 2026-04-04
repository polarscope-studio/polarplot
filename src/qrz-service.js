/**
 * QRZ API Service for Polarplot
 * Handles session management and station lookups via XML API
 */

export class QRZService {
  constructor(user, pass, apiKey = '', proxyUrl = '') {
    this.user = user;
    this.pass = pass;
    this.apiKey = apiKey;
    this.proxyUrl = proxyUrl;
    this.sessionKey = apiKey || localStorage.getItem('qrz_session_key');
  }

  _proxyUrl(target) {
    if (!this.proxyUrl) return target;
    // Proxies ending with '?' (e.g. corsproxy.io/?) need the target URL encoded
    if (this.proxyUrl.endsWith('?')) return this.proxyUrl + encodeURIComponent(target);
    return this.proxyUrl + target;
  }

  async lookup(callsign) {
    if (!this.sessionKey) {
      await this.login();
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000); // 10s Tactical Timeout

    try {
      const url = this._proxyUrl(`https://xmldata.qrz.com/xml/current/?s=${this.sessionKey};callsign=${callsign}`);
      const response = await fetch(url, { signal: controller.signal });
      clearTimeout(timeoutId);
      const text = await response.text();
      
      if (text.includes('This API enables cross-origin requests')) throw new Error('PROXY_BLOCK');

      const parser = new DOMParser();
      const xml = parser.parseFromString(text, "text/xml");
      
      const error = xml.querySelector('Error');
      if (error) {
        const msg = error.textContent;
        if (msg.includes('Session expired') || msg.includes('Invalid session')) {
          this.sessionKey = null;
          localStorage.removeItem('qrz_session_key');
          await this.login();
          return this.lookup(callsign);
        }
        throw new Error(`QRZ Error: ${msg}`);
      }

      const callData = xml.querySelector('Callsign');
      if (!callData) return null;

      return {
        lat: callData.querySelector('lat')?.textContent,
        lon: callData.querySelector('lon')?.textContent,
        grid: callData.querySelector('grid')?.textContent,
        fname: callData.querySelector('fname')?.textContent,
        name: callData.querySelector('name')?.textContent,
        dxcc: callData.querySelector('dxcc')?.textContent,
        country: callData.querySelector('country')?.textContent,
      };
    } catch (e) {
      console.error('QRZ Lookup Failed:', e);
      throw e;
    }
  }

  /**
   * Fetch the user's QRZ logbook as ADIF and return a callsign→location map.
   * Uses the QRZ Logbook API (logbook.qrz.com/api).
   * The logbook API key is the same key used for XML access.
   * Returns: Map<string, { lat, lon, grid, country, dxcc }>
   */
  async fetchLogbook() {
    const key = this.apiKey || this.sessionKey;
    if (!key) throw new Error('No API key for logbook fetch');

    const body = new URLSearchParams({ KEY: key, ACTION: 'FETCH', OPTION: 'TYPE:ADIF,STATUS:ALL' });
    const fetchOpts = {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString()
    };

    // QRZ does not send CORS headers — must use proxy. Try proxy first, direct as last resort.
    const urls = [];
    if (this.proxyUrl) urls.push(this._proxyUrl('https://logbook.qrz.com/api'));
    urls.push('https://logbook.qrz.com/api');

    let raw = null;
    let lastErr = null;
    for (const url of urls) {
      try {
        const response = await fetch(url, fetchOpts);
        const text = await response.text();
        // cors-anywhere demo-wall detection
        if (text.includes('corsdemo') || text.includes('This API enables cross-origin')) continue;
        raw = text;
        break;
      } catch (e) {
        lastErr = e;
      }
    }
    if (raw === null) throw new Error(lastErr?.message || 'All fetch attempts failed');

    // Response is URL-encoded: RESULT=OK&COUNT=n&ADIF=<adif content>
    const adifIdx = raw.indexOf('ADIF=');
    if (adifIdx === -1) {
      const resultMatch = raw.match(/RESULT=([^&]+)/);
      const result = resultMatch ? decodeURIComponent(resultMatch[1]) : raw.slice(0, 120);
      throw new Error(`QRZ Logbook: ${result}`);
    }

    const adifRaw = decodeURIComponent(raw.substring(adifIdx + 5));

    // Parse the ADIF inline (same logic as adif-worker.js)
    const eohIdx = adifRaw.toUpperCase().indexOf('<EOH>');
    const dataPart = eohIdx !== -1 ? adifRaw.substring(eohIdx + 5) : adifRaw;
    const records = dataPart.split(/<EOR>/i);

    const locationMap = new Map(); // call → { lat, lon, grid, country, dxcc }

    for (const record of records) {
      if (!record.trim()) continue;
      const qso = {};
      const regex = /<([^:>]+):(\d+)(?::[^>]+)?>([^<]*)/gi;
      let match;
      while ((match = regex.exec(record)) !== null) {
        const tag = match[1].toUpperCase();
        const len = parseInt(match[2]);
        qso[tag] = match[3].substring(0, len).trim();
      }

      const call = qso.CALL;
      if (!call) continue;

      // Decode ADIF WRL-style coordinates if present
      const decodeCoord = (s) => {
        if (!s) return null;
        const dir = s.charAt(0).toUpperCase();
        if (!['N','S','E','W'].includes(dir)) { const v = parseFloat(s); return isNaN(v) ? null : v; }
        const parts = s.substring(1).trim().split(' ');
        let dec = parts.length >= 2 ? parseFloat(parts[0]) + parseFloat(parts[1]) / 60 : parseFloat(s.substring(1));
        return (dir === 'S' || dir === 'W') ? -dec : dec;
      };

      let lat = decodeCoord(qso.LAT);
      let lon = decodeCoord(qso.LON);

      // Fall back to grid square
      if ((lat == null || lon == null) && qso.GRIDSQUARE && qso.GRIDSQUARE.length >= 4) {
        const g = qso.GRIDSQUARE.toUpperCase();
        lon = (g.charCodeAt(0) - 65) * 20 - 180 + parseInt(g[2]) * 2 + (g.length >= 6 ? (g.charCodeAt(4) - 65) * (2/24) + (1/24) : 1);
        lat = (g.charCodeAt(1) - 65) * 10 - 90  + parseInt(g[3]) + (g.length >= 6 ? (g.charCodeAt(5) - 65) * (1/24) + (0.5/24) : 0.5);
      }

      if (lat == null || lon == null || isNaN(lat) || isNaN(lon)) continue;

      // Keep the best entry per callsign — prefer entries with a grid square
      const existing = locationMap.get(call);
      if (!existing || (!existing.grid && qso.GRIDSQUARE)) {
        locationMap.set(call, {
          lat: String(lat),
          lon: String(lon),
          grid: qso.GRIDSQUARE || existing?.grid || null,
          country: qso.COUNTRY || qso.DXCC_COUNTRY || existing?.country || null,
          dxcc: qso.DXCC || existing?.dxcc || null
        });
      }
    }

    return locationMap;
  }

  /**
   * Fetch all QSOs from QRZ logbook and return a Set of confirmed callsigns (uppercase).
   * A callsign is confirmed if any QSO has LOTW_QSL_RCVD=Y, QSL_RCVD=Y, or EQSL_QSL_RCVD=Y.
   * Separate from fetchLogbook so it can succeed/fail independently.
   */
  async fetchConfirmedCalls() {
    const key = this.apiKey || this.sessionKey;
    if (!key) throw new Error('No API key');

    const urls = [];
    if (this.proxyUrl) urls.push(this._proxyUrl('https://logbook.qrz.com/api'));
    urls.push('https://logbook.qrz.com/api');

    const body = new URLSearchParams({ KEY: key, ACTION: 'FETCH', OPTION: 'TYPE:ADIF,STATUS:ALL' }).toString();
    const fetchOpts = { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body };

    let raw = null;
    for (const url of urls) {
      try {
        const r = await fetch(url, fetchOpts);
        const t = await r.text();
        if (t.includes('corsdemo') || t.includes('This API enables cross-origin')) continue;
        raw = t;
        break;
      } catch {}
    }
    if (!raw) throw new Error('Unable to reach QRZ logbook');

    console.log('[QRZ confirmed] raw response:', raw.slice(0, 400));

    const resultMatch = raw.match(/RESULT=([^&\s]+)/);
    const result = resultMatch ? decodeURIComponent(resultMatch[1]) : null;
    console.log('[QRZ confirmed] RESULT field:', result);
    if (result && result !== 'OK') throw new Error(`QRZ: ${result}`);

    const confirmedCalls = new Set();
    const aIdx = raw.indexOf('ADIF=');
    if (aIdx === -1) throw new Error('No ADIF in logbook response');

    const adif = decodeURIComponent(raw.substring(aIdx + 5));
    const eoh  = adif.toUpperCase().indexOf('<EOH>');
    const part = eoh !== -1 ? adif.substring(eoh + 5) : adif;

    for (const rec of part.split(/<EOR>/i)) {
      if (!rec.trim()) continue;
      const getField = (name) => {
        const m = rec.match(new RegExp(`<${name}:(\\d+)[^>]*>([^<]*)`, 'i'));
        return m ? m[2].substring(0, parseInt(m[1])).trim().toUpperCase() : '';
      };
      const call = getField('CALL');
      if (!call) continue;
      const lotw = getField('LOTW_QSL_RCVD');
      const qsl  = getField('QSL_RCVD');
      const eqsl = getField('EQSL_QSL_RCVD');
      if (lotw === 'Y' || qsl === 'Y' || eqsl === 'Y') {
        confirmedCalls.add(call);
      }
    }
    console.log('[QRZ confirmed] parsed:', confirmedCalls.size, 'confirmed calls from', part.split(/<EOR>/i).length - 1, 'QSOs');
    return confirmedCalls;
  }

  async login() {
    // If we have a direct key, we skip login and try it in lookup.
    // If we've reached here, it means the key failed or we don't have one.
    if (this.apiKey && !this.user) {
        // Many apps use the API Key as the session key directly. 
        // If it failed in lookup, it's likely invalid.
        this.sessionKey = this.apiKey;
        return;
    }

    // Try standard auth. Use API key as password if password is missing.
    const loginUser = this.user;
    const loginPass = this.pass || this.apiKey;
    
    if (!loginUser || !loginPass) throw new Error('MISSING_CREDENTIALS');

    const url = this._proxyUrl(`https://xmldata.qrz.com/xml/current/?username=${loginUser};password=${encodeURIComponent(loginPass)};agent=polarplot-v1`);
    const response = await fetch(url);
    const text = await response.text();

    if (text.includes('This API enables cross-origin requests')) throw new Error('PROXY_BLOCK');

    const parser = new DOMParser();
    const xml = parser.parseFromString(text, "text/xml");
    
    const key = xml.querySelector('Key')?.textContent;
    if (key) {
      this.sessionKey = key;
      localStorage.setItem('qrz_session_key', key);
    } else {
      const err = xml.querySelector('Error')?.textContent || 'Login Failed';
      throw new Error(`QRZ Login Error: ${err}`);
    }
  }
}
