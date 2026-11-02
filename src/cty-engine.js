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
            // '*' marks DARC WAE-only entities (Sicily, Shetland…) that are not separate DXCC entities
            waeOnly: parts[7].trim().startsWith('*'),
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

  /**
   * Resolve a callsign to its entity / zones / continent.
   * dxccOnly (default) skips WAE-only entities so IT9xx resolves to Italy, not Sicily.
   * Returns null for /MM and /AM (no entity).
   */
  resolve(callsign, { dxccOnly = true } = {}) {
    if (!callsign || !this.isLoaded) return null;
    const full = callsign.toUpperCase().trim();
    const usable = e => e && !(dxccOnly && this.entities[e.entityIdx].waeOnly);

    if (usable(this.callsignMap.get(full))) return this.getMergedMetadata(this.callsignMap.get(full));

    const prefixPart = CtyEngine.prefixPart(full);
    if (!prefixPart) return null;
    if (prefixPart !== full && usable(this.callsignMap.get(prefixPart))) return this.getMergedMetadata(this.callsignMap.get(prefixPart));

    // Longest prefix match
    for (let i = prefixPart.length; i >= 1; i--) {
      const entry = this.prefixMap.get(prefixPart.substring(0, i));
      if (usable(entry)) return this.getMergedMetadata(entry);
    }
    return null;
  }

  /**
   * The part of a callsign that decides its entity:
   *   M9PXZ/P → M9PXZ · EA8/M9PXZ → EA8 · W1ABC/6 → W6ABC · G4ABC/MM → null
   */
  static prefixPart(call) {
    const SKIP = new Set(['P', 'M', 'QRP', 'QRPP', 'A', 'R', 'B', 'J', 'LH', 'PM', 'LGT', 'N', 'T']);
    let parts = call.split('/').filter(Boolean);
    // Maritime / aeronautical mobile is a SUFFIX (LY3X/MM). As a prefix, MM is Scotland (MM/LY3X).
    if (parts.length > 1 && /^(MM|AM)$/.test(parts[parts.length - 1])) return null;
    parts = parts.filter(p => !SKIP.has(p));
    if (!parts.length) return null;
    if (parts.length === 1) return parts[0];
    const digit = parts.find(p => /^\d$/.test(p));
    const rest = parts.filter(p => p !== digit);
    if (digit && rest.length === 1) return rest[0].replace(/\d(?=[A-Z]*$)/, digit); // call-area change
    return rest.reduce((a, b) => (b.length < a.length ? b : a)); // shorter part is the prefix
  }

  getMergedMetadata(entry) {
    const entity = this.entities[entry.entityIdx];
    return {
      ...entity,
      ...entry // Overwrites with prefix-specific overrides
    };
  }
}
