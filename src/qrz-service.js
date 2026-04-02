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

  async lookup(callsign) {
    if (!this.sessionKey) {
      await this.login();
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000); // 10s Tactical Timeout

    try {
      const url = `${this.proxyUrl}https://xmldata.qrz.com/xml/current/?s=${this.sessionKey};callsign=${callsign}`;
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

    const url = `${this.proxyUrl}https://xmldata.qrz.com/xml/current/?username=${loginUser};password=${encodeURIComponent(loginPass)};agent=polarplot-v1`;
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
