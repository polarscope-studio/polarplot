export class CtyEngine {
  constructor() {
    this.entities = [];
    this.prefixMap = new Map(); // Prefix -> entity index
    this.callsignMap = new Map(); // Exact callsign -> entity index
    this.isLoaded = false;
  }

  async load(url = '/cty.dat') {
    try {
      const response = await fetch(url);
      const text = await response.text();
      this.parse(text);
      this.isLoaded = true;
      console.log(`CTY Engine: Loaded ${this.entities.length} entities and ${this.prefixMap.size + this.callsignMap.size} prefixes.`);
    } catch (err) {
      console.error('CTY Engine: Load failed', err);
    }
  }

  parse(text) {
    const lines = text.split(/\r?\n/);
    let currentEntity = null;

    for (let line of lines) {
      if (!line.trim()) continue;

      if (!line.startsWith(' ')) {
        // New Entity Header: Country:CQ:ITU:Cont:Lat:Lon:Offset:Prefix:
        const parts = line.split(':');
        if (parts.length >= 8) {
          currentEntity = {
            name: parts[0].trim(),
            cq: parseInt(parts[1]),
            itu: parseInt(parts[2]),
            cont: parts[3].trim(),
            lat: parseFloat(parts[4]),
            lon: parseFloat(parts[5]),
            offset: parseFloat(parts[6]),
            primaryPrefix: parts[7].replace('*', '').trim(),
            prefixes: []
          };
          this.entities.push(currentEntity);
          const entityIdx = this.entities.length - 1;
          this.addPrefix(currentEntity.primaryPrefix, entityIdx);
        }
      } else if (currentEntity) {
        // Alias prefixes (indented)
        const entityIdx = this.entities.length - 1;
        const aliases = line.trim().split(',');
        for (let alias of aliases) {
          const cleanAlias = alias.replace(';', '').trim();
          if (!cleanAlias) continue;
          this.addPrefix(cleanAlias, entityIdx);
        }
      }
    }
  }

  addPrefix(rawPrefix, entityIdx) {
    if (!rawPrefix) return;
    
    // Check for exact callsign match: =CALL
    let isExact = rawPrefix.startsWith('=');
    let prefix = rawPrefix;
    let metadata = {};

    // Extract overrides: (#) CQ, [#] ITU, <lat/lon>, {cont}, ~offset~
    const cqMatch = prefix.match(/\((\d+)\)/);
    if (cqMatch) metadata.cq = parseInt(cqMatch[1]);
    
    const ituMatch = prefix.match(/\[(\d+)\]/);
    if (ituMatch) metadata.itu = parseInt(ituMatch[1]);
    
    const latLonMatch = prefix.match(/<([\d.-]+\/[\d.-]+)>/);
    if (latLonMatch) {
      const [la, lo] = latLonMatch[1].split('/');
      metadata.lat = parseFloat(la);
      metadata.lon = parseFloat(lo);
    }

    const contMatch = prefix.match(/\{([A-Z]{2})\}/);
    if (contMatch) metadata.cont = contMatch[1];

    // Clean prefix of all markers
    prefix = prefix.replace(/=|\(.*\)|\[.*\]|<.*>|\{.*\}|~.*~/g, '').trim();
    if (!prefix) return;

    const entry = { entityIdx, ...metadata };

    if (isExact) {
      this.callsignMap.set(prefix.toUpperCase(), entry);
    } else {
      this.prefixMap.set(prefix.toUpperCase(), entry);
    }
  }

  resolve(callsign) {
    if (!callsign || !this.isLoaded) return null;
    const call = callsign.toUpperCase();

    // 1. Check Exact Callsign
    if (this.callsignMap.has(call)) {
      const entry = this.callsignMap.get(call);
      return this.getMergedMetadata(entry);
    }

    // 2. Longest Prefix Match
    for (let i = call.length; i >= 1; i--) {
      const pref = call.substring(0, i);
      if (this.prefixMap.has(pref)) {
        const entry = this.prefixMap.get(pref);
        return this.getMergedMetadata(entry);
      }
    }

    return null;
  }

  getMergedMetadata(entry) {
    const entity = this.entities[entry.entityIdx];
    return {
      ...entity,
      ...entry // Overwrites with prefix-specific overrides
    };
  }
}
