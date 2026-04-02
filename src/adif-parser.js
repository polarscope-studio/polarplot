/**
 * ADIF Parser for Polarplot
 * Robust regex-based parser for Amateur Data Interchange Format (.adi)
 */

export class ADIFParser {
  /**
   * Parse ADIF string into an array of QSO objects
   * @param {string} adifString 
   * @returns {Array} 
   */
  static parse(adifString) {
    // 1. Find the <EOH> (End of Header) or start from beginning
    const eohIndex = adifString.toUpperCase().indexOf('<EOH>');
    const dataPart = eohIndex !== -1 ? adifString.substring(eohIndex + 5) : adifString;

    // 2. Split into records by <EOR> (End of Record)
    const records = dataPart.split(/<EOR>/i);
    const qsos = [];

    for (const record of records) {
      if (!record.trim()) continue;

      const qso = this.parseRecord(record);
      if (qso.CALL) {
        qsos.push(qso);
      }
    }

    return qsos;
  }

  /**
   * Parse a single ADIF record
   * Format: <TAG:LEN>DATA or <TAG:LEN:TYPE>DATA
   */
  static parseRecord(record) {
    const qso = {};
    const regex = /<([^:>]+):(\d+)(?::[^>]+)?>([^<]*)/gi;
    let match;

    while ((match = regex.exec(record)) !== null) {
      const tag = match[1].toUpperCase();
      const length = parseInt(match[2]);
      const value = match[3].substring(0, length).trim();
      qso[tag] = value;
    }

    // Standardize some fields
    if (qso.QSO_DATE) {
      // YYYYMMDD -> YYYY-MM-DD
      qso.formattedDate = `${qso.QSO_DATE.substring(0,4)}-${qso.QSO_DATE.substring(4,6)}-${qso.QSO_DATE.substring(6,8)}`;
    }

    // Convert coordinates to decimal if in ADIF format (NMMM DD.DDD)
    const coordFields = ['LAT', 'LON', 'MY_LAT', 'MY_LON'];
    coordFields.forEach(field => {
        if (qso[field] && typeof qso[field] === 'string' && (qso[field].startsWith('N') || qso[field].startsWith('S') || qso[field].startsWith('E') || qso[field].startsWith('W'))) {
            qso[field] = this.decodeCoordinate(qso[field]);
        }
    });

    return qso;
  }

  /**
   * Convert ADIF coordinate string (e.g. N044 58.700) to decimal degrees
   */
  static decodeCoordinate(coordStr) {
    if (!coordStr) return null;
    
    // Format: YDDD MM.MMM (Y=N/S/E/W)
    const direction = coordStr.charAt(0).toUpperCase();
    const parts = coordStr.substring(1).trim().split(' ');
    
    if (parts.length < 2) {
        // Maybe it's already decimal or another format?
        // Let's try parsing as a fallback
        const val = parseFloat(coordStr.substring(1));
        return (direction === 'S' || direction === 'W') ? -val : val;
    }

    const degrees = parseFloat(parts[0]);
    const minutes = parseFloat(parts[1]);
    
    let decimal = degrees + (minutes / 60);
    if (direction === 'S' || direction === 'W') {
        decimal = -decimal;
    }
    
    return decimal;
  }
}
