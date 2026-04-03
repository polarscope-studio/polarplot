import './style.css';
import { MapEngine } from './src/map-engine.js';
import { QRZService } from './src/qrz-service.js';

let mapEngine;
let worker;
let currentQSOs = [];
let searchQuery = '';
let selectedDXCC = '';
let isResolving = false;
let currentUnits = localStorage.getItem('polarlog_units') || 'km';

// Flag rendering — flagcdn primary, Wikimedia Commons fallback
const FLAG_OVERRIDES = {
    'gb-eng': 'https://upload.wikimedia.org/wikipedia/en/b/be/Flag_of_England.svg',
    'gb-sct': 'https://upload.wikimedia.org/wikipedia/commons/1/10/Flag_of_Scotland.svg',
    'gb-wls': 'https://upload.wikimedia.org/wikipedia/commons/d/dc/Flag_of_Wales.svg',
    'gb-nir': 'https://upload.wikimedia.org/wikipedia/commons/b/b1/Ulster_Banner.svg',
};

function qrzLink(call, innerHtml, extraStyle = '') {
    return `<a href="https://www.qrz.com/db/${encodeURIComponent(call)}" target="_blank" rel="noopener" style="color:inherit;text-decoration:none;${extraStyle}">${innerHtml}</a>`;
}

function buildFlagImg(iso, name, cdnWidth, style, onFail) {
    if (!iso) return '';
    const src  = FLAG_OVERRIDES[iso] || `https://flagcdn.com/w${cdnWidth}/${iso}.png`;
    const wiki = `https://commons.wikimedia.org/wiki/Special:FilePath/Flag_of_${encodeURIComponent((name || '').replace(/\s+/g, '_'))}.svg`;
    return `<img src="${src}" data-wiki="${wiki}" style="${style}" alt="${name || ''}" onerror="if(!this._w){this._w=1;this.src=this.dataset.wiki;}else{${onFail}}">`;
}

// Total panel sort state
let totalSortCol = 'count';
let totalSortDir = -1;

// 3D Globe state
let globeInstance = null;
let globeInitialized = false;
let globeVisible = false;
let globeDayMode = true;    // true = day, false = night
let globeFPVMode = false;
let globePreFPVPov = null; 

const DXCC_MAP = {
    // Numeric DXCC Codes -> ISO (Strict ISO 3166-1 Alpha-2)
    '1': 'ca', '6': 'us', '7': 'al', '10': 'tf', '11': 'an', '12': 'ai', '13': 'aq', '14': 'dz', '15': 'ru', '16': 'as',
    '17': 'at', '18': 'az', '19': 'ar', '20': 'au', '21': 'at', '24': 'be', '27': 'by', '28': 'bz', '29': 'bj', '30': 'bg',
    '31': 'bt', '32': 'bo', '33': 'ba', '34': 'bw', '35': 'bv', '36': 'br', '37': 'io', '38': 'bn', '39': 'bi', '40': 'kh',
    '42': 'cm', '43': 'ca', '44': 'cv', '45': 'ky', '46': 'cf', '47': 'td', '48': 'cl', '49': 'cn', '50': 'cx', '51': 'cc',
    '52': 'co', '53': 'km', '54': 'ru', '55': 'cg', '56': 'ck', '57': 'cr', '58': 'ci', '59': 'hr', '60': 'bs', '61': 'cu',
    '62': 'bb', '63': 'cy', '64': 'bm', '65': 'vg', '66': 'ky', '67': 'cz', '68': 'dk', '69': 'dm', '70': 'jm', '71': 'cu',
    '72': 'do', '74': 'ec', '75': 'eg', '76': 'sv', '77': 'gd', '78': 'ht', '79': 'gp', '80': 'gq', '81': 'ee', '82': 'mq',
    '84': 'ms', '86': 'aw', '87': 'et', '88': 'fk', '89': 'tc', '90': 'tt', '91': 'fo', '94': 'ag', '97': 'lc', '98': 'vc',
    '100': 'fi', '104': 'fr', '105': 'tf', '106': 're', '107': 'gp', '108': 'mq', '109': 'pm', '110': 'us', '112': 'tf', '114': 'pf',
    '115': 'tf', '116': 'tf', '117': 'yt', '118': 'wf', '120': 'ga', '121': 'gm', '122': 'ge', '124': 'gh', '126': 'gi', '128': 'gr',
    '129': 'gl', '130': 'gd', '131': 'gl', '132': 'gu', '133': 'gt', '135': 'gn', '136': 'gw', '137': 'gy', '138': 'ht', '140': 'hm',
    '141': 'hn', '142': 'hk', '143': 'hu', '144': 'is', '145': 'in', '146': 'id', '147': 'ir', '148': 'ie', '149': 'pt', '150': 'it',
    '151': 'it', '152': 'it', '153': 'it', '155': 'ci', '156': 'jm', '157': 'jp', '158': 'jp', '159': 'jo', '160': 'kz',
    '161': 'ke', '162': 'ki', '163': 'ki', '164': 'ki', '165': 'ki', '166': 'kp', '167': 'kr', '168': 'kw', '169': 'kg', '170': 'la',
    '171': 'la', '172': 'lb', '173': 'ls', '174': 'lr', '175': 'ly', '176': 'li', '177': 'lt', '178': 'lu', '179': 'mo', '180': 'mk',
    '181': 'mg', '182': 'mw', '183': 'my', '184': 'my', '185': 'mv', '186': 'ml', '187': 'mt', '188': 'mh', '189': 'mr', '190': 'mu',
    '191': 'mx', '192': 'fm', '193': 'fm', '194': 'fm', '195': 'fm', '196': 'md', '197': 'mc', '198': 'mn', '201': 'ma', '202': 'pr',
    '203': 'mz', '204': 'mm', '205': 'na', '206': 'nr', '209': 'cw', '211': 'nl', '212': 'nl', '213': 'mf', '214': 'bl', '215': 'nc',
    '216': 'nz', '217': 'ni', '218': 'ne', '219': 'ng', '220': 'nu', '221': 'nf', '222': 'no', '223': 'gb-eng', '224': 'om', '225': 'pk',
    '226': 'pw', '227': 'pa', '228': 'pg', '229': 'py', '230': 'de', '231': 'pe', '232': 'ph', '233': 'pn', '234': 'pl', '235': 'pt',
    '236': 'pt', '237': 'pt', '238': 'pt', '239': 'gr', '241': 'qa', '242': 're', '243': 'ro', '244': 'lv', '245': 'rw', '246': 'sh', 
    '247': 'kn', '248': 'sx', '249': 'lc', '250': 'sh', '251': 'vc', '252': 'ws', '253': 'sm', '254': 'st', '255': 'sa', '256': 'sn', 
    '257': 'sc', '258': 'sl', '259': 'sg', '260': 'sk', '261': 'si', '262': 'sb', '263': 'so', '264': 'za', '265': 'gb-nir', '266': 'gs', 
    '267': 'lk', '268': 'sd', '269': 'sr', '270': 'sj', '271': 'sz', '272': 'se', '273': 'ch', '274': 'sy', '275': 'tw', '276': 'tj', 
    '277': 'tz', '278': 'th', '279': 'gb-sct', '280': 'tg', '281': 'es', '282': 'to', '283': 'tt', '284': 'tn', '285': 'vi', '286': 'tr', 
    '287': 'tm', '288': 'tc', '289': 'tv', '290': 'gl', '291': 'us', '292': 'ug', '293': 'ua', '294': 'gb-wls', '295': 'ae', '296': 'gb', 
    '297': 'uy', '298': 'uz', '299': 'vu', '300': 'va', '301': 've', '302': 'vn', '303': 'vi', '304': 'wk', '305': 'wf', '306': 'eh', 
    '307': 'ye', '308': 'ye', '309': 'ye', '310': 'zm', '311': 'zw', '312': 'rs', '313': 'me', '318': 'ru', '339': 'id',

    // Name Fallbacks — comprehensive DXCC name-to-ISO-3166-1-alpha-2 mapping
    // Europe
    'UNITED KINGDOM': 'gb', 'UK': 'gb', 'GBR': 'gb',
    'ENGLAND': 'gb-eng', 'SCOTLAND': 'gb-sct', 'WALES': 'gb-wls', 'NORTHERN IRELAND': 'gb-nir',
    'GERMANY': 'de', 'DEU': 'de', 'FEDERAL REPUBLIC OF GERMANY': 'de', 'FED. REP. OF GERMANY': 'de', 'FED REP OF GERMANY': 'de',
    'FRANCE': 'fr', 'FRA': 'fr',
    'ITALY': 'it', 'ITA': 'it', 'SARDINIA': 'it', 'SICILY': 'it',
    'SPAIN': 'es', 'ESP': 'es',
    'PORTUGAL': 'pt', 'PRT': 'pt', 'AZORES': 'pt', 'MADEIRA': 'pt',
    'SWITZERLAND': 'ch', 'CHE': 'ch',
    'SWEDEN': 'se', 'SWE': 'se',
    'NORWAY': 'no', 'NOR': 'no', 'SVALBARD': 'sj',
    'DENMARK': 'dk', 'DNK': 'dk',
    'FINLAND': 'fi', 'FIN': 'fi', 'ALAND ISLANDS': 'ax', 'MARKET REEF': 'ax',
    'NETHERLANDS': 'nl', 'NLD': 'nl', 'HOLLAND': 'nl',
    'AUSTRIA': 'at', 'AUT': 'at',
    'BELGIUM': 'be', 'BEL': 'be',
    'LUXEMBOURG': 'lu', 'LUX': 'lu',
    'IRELAND': 'ie', 'IRL': 'ie', 'REPUBLIC OF IRELAND': 'ie',
    'ICELAND': 'is', 'ISL': 'is',
    'GREENLAND': 'gl', 'GRL': 'gl',
    'FAROE ISLANDS': 'fo', 'FRO': 'fo', 'FAROES': 'fo',
    'RUSSIA': 'ru', 'RUS': 'ru', 'RUSSIAN FEDERATION': 'ru',
    'UKRAINE': 'ua', 'UKR': 'ua',
    'POLAND': 'pl', 'POL': 'pl',
    'CZECH REPUBLIC': 'cz', 'CZE': 'cz', 'CZECHIA': 'cz',
    'SLOVAKIA': 'sk', 'SVK': 'sk',
    'HUNGARY': 'hu', 'HUN': 'hu',
    'ROMANIA': 'ro', 'ROU': 'ro',
    'BULGARIA': 'bg', 'BGR': 'bg',
    'SERBIA': 'rs', 'SRB': 'rs',
    'CROATIA': 'hr', 'HRV': 'hr',
    'SLOVENIA': 'si', 'SVN': 'si',
    'BOSNIA AND HERZEGOVINA': 'ba', 'BIH': 'ba', 'BOSNIA-HERZEGOVINA': 'ba', 'BOSNIA': 'ba',
    'NORTH MACEDONIA': 'mk', 'MKD': 'mk', 'MACEDONIA': 'mk',
    'ALBANIA': 'al', 'ALB': 'al',
    'GREECE': 'gr', 'GRC': 'gr', 'DODECANESE': 'gr', 'CRETE': 'gr',
    'MONTENEGRO': 'me', 'MNE': 'me',
    'KOSOVO': 'xk',
    'ESTONIA': 'ee', 'EST': 'ee',
    'LATVIA': 'lv', 'LVA': 'lv',
    'LITHUANIA': 'lt', 'LTU': 'lt',
    'BELARUS': 'by', 'BLR': 'by',
    'MOLDOVA': 'md', 'MDA': 'md',
    'LIECHTENSTEIN': 'li', 'LIE': 'li',
    'MONACO': 'mc', 'MCO': 'mc',
    'ANDORRA': 'ad', 'AND': 'ad',
    'SAN MARINO': 'sm', 'SMR': 'sm',
    'VATICAN': 'va', 'VAT': 'va', 'VATICAN CITY': 'va',
    'MALTA': 'mt', 'MLT': 'mt',
    'CYPRUS': 'cy', 'CYP': 'cy',
    'GEORGIA': 'ge', 'GEO': 'ge',
    'ARMENIA': 'am', 'ARM': 'am',
    'AZERBAIJAN': 'az', 'AZE': 'az',
    'GIBRALTAR': 'gi', 'GIB': 'gi',

    // North America & Caribbean
    'UNITED STATES': 'us', 'USA': 'us', 'UNITED STATES OF AMERICA': 'us',
    'CANADA': 'ca', 'CAN': 'ca',
    'MEXICO': 'mx', 'MEX': 'mx',
    'CUBA': 'cu', 'CUB': 'cu',
    'JAMAICA': 'jm', 'JAM': 'jm',
    'HAITI': 'ht', 'HTI': 'ht',
    'DOMINICAN REPUBLIC': 'do', 'DOM': 'do',
    'PUERTO RICO': 'pr', 'PRI': 'pr',
    'BARBADOS': 'bb', 'BRB': 'bb',
    'TRINIDAD AND TOBAGO': 'tt', 'TTO': 'tt', 'TRINIDAD': 'tt', 'TOBAGO': 'tt',
    'GRENADA': 'gd', 'GRD': 'gd',
    'SAINT LUCIA': 'lc', 'LCA': 'lc', 'ST. LUCIA': 'lc', 'ST LUCIA': 'lc',
    'SAINT VINCENT AND THE GRENADINES': 'vc', 'VCT': 'vc', 'ST. VINCENT': 'vc', 'ST VINCENT': 'vc',
    'SAINT KITTS AND NEVIS': 'kn', 'KNA': 'kn', 'ST. KITTS': 'kn', 'NEVIS': 'kn', 'ST KITTS AND NEVIS': 'kn', 'ST. KITTS AND NEVIS': 'kn',
    'ANTIGUA AND BARBUDA': 'ag', 'ATG': 'ag', 'ANTIGUA': 'ag',
    'DOMINICA': 'dm', 'DMA': 'dm',
    'BAHAMAS': 'bs', 'BHS': 'bs',
    'BERMUDA': 'bm', 'BMU': 'bm',
    'CAYMAN ISLANDS': 'ky', 'CYM': 'ky',
    'TURKS AND CAICOS ISLANDS': 'tc', 'TCA': 'tc', 'TURKS AND CAICOS': 'tc',
    'BRITISH VIRGIN ISLANDS': 'vg', 'VGB': 'vg',
    'US VIRGIN ISLANDS': 'vi', 'VIR': 'vi', 'UNITED STATES VIRGIN ISLANDS': 'vi', 'U.S. VIRGIN ISLANDS': 'vi',
    'ARUBA': 'aw', 'ABW': 'aw',
    'CURACAO': 'cw', 'CUW': 'cw',
    'SINT MAARTEN': 'sx', 'SXM': 'sx', 'ST. MAARTEN': 'sx', 'ST MAARTEN': 'sx', 'SAINT MAARTEN': 'sx',
    'GUADELOUPE': 'gp', 'GLP': 'gp',
    'MARTINIQUE': 'mq', 'MTQ': 'mq',
    'SAINT BARTHELEMY': 'bl', 'BLM': 'bl', 'ST. BARTHELEMY': 'bl',
    'SAINT MARTIN': 'mf', 'MAF': 'mf',
    'MONTSERRAT': 'ms', 'MSR': 'ms',
    'ANGUILLA': 'ai', 'AIA': 'ai',
    'BELIZE': 'bz', 'BLZ': 'bz',
    'COSTA RICA': 'cr', 'CRI': 'cr',
    'EL SALVADOR': 'sv', 'SLV': 'sv',
    'GUATEMALA': 'gt', 'GTM': 'gt',
    'HONDURAS': 'hn', 'HND': 'hn',
    'NICARAGUA': 'ni', 'NIC': 'ni',
    'PANAMA': 'pa', 'PAN': 'pa',
    'ALASKA': 'us', 'HAWAII': 'us',

    // South America
    'BRAZIL': 'br', 'BRA': 'br', 'BRASIL': 'br',
    'ARGENTINA': 'ar', 'ARG': 'ar',
    'CHILE': 'cl', 'CHL': 'cl',
    'PERU': 'pe', 'PER': 'pe',
    'COLOMBIA': 'co', 'COL': 'co',
    'VENEZUELA': 've', 've': 've', 'VEN': 've',
    'ECUADOR': 'ec', 'ECU': 'ec',
    'BOLIVIA': 'bo', 'BOL': 'bo',
    'PARAGUAY': 'py', 'PRY': 'py',
    'URUGUAY': 'uy', 'URY': 'uy',
    'GUYANA': 'gy', 'GUY': 'gy',
    'SURINAME': 'sr', 'SUR': 'sr', 'SURINAM': 'sr',
    'FRENCH GUIANA': 'gf', 'GUF': 'gf',
    'FALKLAND ISLANDS': 'fk', 'FLK': 'fk', 'FALKLANDS': 'fk', 'ISLAS MALVINAS': 'fk',
    'SOUTH GEORGIA': 'gs', 'SGS': 'gs', 'SOUTH GEORGIA AND THE SOUTH SANDWICH ISLANDS': 'gs',
    'TRINIDAD & TOBAGO': 'tt',
    'GALAPAGOS': 'ec',

    // Asia
    'CHINA': 'cn', 'CHN': 'cn', 'PEOPLES REPUBLIC OF CHINA': 'cn', "PEOPLE'S REPUBLIC OF CHINA": 'cn',
    'JAPAN': 'jp', 'JPN': 'jp', 'OGASAWARA': 'jp', 'MINAMI TORISHIMA': 'jp',
    'SOUTH KOREA': 'kr', 'KOR': 'kr', 'KOREA': 'kr', 'REPUBLIC OF KOREA': 'kr',
    'NORTH KOREA': 'kp', 'PRK': 'kp', 'DEMOCRATIC PEOPLES REPUBLIC OF KOREA': 'kp',
    'TAIWAN': 'tw', 'TWN': 'tw',
    'HONG KONG': 'hk', 'HKG': 'hk',
    'MACAU': 'mo', 'MAC': 'mo', 'MACAO': 'mo',
    'MONGOLIA': 'mn', 'MNG': 'mn',
    'INDIA': 'in', 'IND': 'in',
    'PAKISTAN': 'pk', 'PAK': 'pk',
    'BANGLADESH': 'bd', 'BGD': 'bd',
    'SRI LANKA': 'lk', 'LKA': 'lk', 'CEYLON': 'lk',
    'NEPAL': 'np', 'NPL': 'np',
    'BHUTAN': 'bt', 'BTN': 'bt',
    'MALDIVES': 'mv', 'MDV': 'mv',
    'MYANMAR': 'mm', 'MMR': 'mm', 'BURMA': 'mm',
    'THAILAND': 'th', 'THA': 'th',
    'VIETNAM': 'vn', 'VNM': 'vn', 'VIET NAM': 'vn',
    'CAMBODIA': 'kh', 'KHM': 'kh',
    'LAOS': 'la', 'LAO': 'la',
    'MALAYSIA': 'my', 'MYS': 'my',
    'SINGAPORE': 'sg', 'SGP': 'sg',
    'INDONESIA': 'id', 'IDN': 'id',
    'PHILIPPINES': 'ph', 'PHL': 'ph',
    'BRUNEI': 'bn', 'BRN': 'bn', 'BRUNEI DARUSSALAM': 'bn',
    'EAST TIMOR': 'tl', 'TLS': 'tl', 'TIMOR-LESTE': 'tl',
    'AFGHANISTAN': 'af', 'AFG': 'af',
    'IRAN': 'ir', 'IRN': 'ir', 'ISLAMIC REPUBLIC OF IRAN': 'ir',
    'IRAQ': 'iq', 'IRQ': 'iq',
    'ISRAEL': 'il', 'ISR': 'il',
    'JORDAN': 'jo', 'JOR': 'jo',
    'KUWAIT': 'kw', 'KWT': 'kw',
    'SAUDI ARABIA': 'sa', 'SAU': 'sa',
    'BAHRAIN': 'bh', 'BHR': 'bh',
    'QATAR': 'qa', 'QAT': 'qa',
    'UNITED ARAB EMIRATES': 'ae', 'ARE': 'ae', 'UAE': 'ae',
    'UNITED NATIONS HQ': 'un', 'UNITED NATIONS': 'un', '4U1UN': 'un', 'UN HQ': 'un',
    'OMAN': 'om', 'OMN': 'om',
    'YEMEN': 'ye', 'YEM': 'ye',
    'SYRIA': 'sy', 'SYR': 'sy', 'SYRIAN ARAB REPUBLIC': 'sy',
    'LEBANON': 'lb', 'LBN': 'lb',
    'TURKEY': 'tr', 'TUR': 'tr', 'TURKIYE': 'tr',
    'KAZAKHSTAN': 'kz', 'KAZ': 'kz',
    'UZBEKISTAN': 'uz', 'UZB': 'uz',
    'TURKMENISTAN': 'tm', 'TKM': 'tm',
    'KYRGYZSTAN': 'kg', 'KGZ': 'kg',
    'TAJIKISTAN': 'tj', 'TJK': 'tj',

    // Middle East & Africa
    'EGYPT': 'eg', 'EGY': 'eg',
    'LIBYA': 'ly', 'LBY': 'ly',
    'TUNISIA': 'tn', 'TUN': 'tn',
    'ALGERIA': 'dz', 'DZA': 'dz',
    'MOROCCO': 'ma', 'MAR': 'ma',
    'WESTERN SAHARA': 'eh', 'ESH': 'eh',
    'MAURITANIA': 'mr', 'MRT': 'mr',
    'SENEGAL': 'sn', 'SEN': 'sn',
    'GAMBIA': 'gm', 'GMB': 'gm',
    'GUINEA-BISSAU': 'gw', 'GNB': 'gw',
    'GUINEA': 'gn', 'GIN': 'gn',
    'SIERRA LEONE': 'sl', 'SLE': 'sl',
    'LIBERIA': 'lr', 'LBR': 'lr',
    'COTE D\'IVOIRE': 'ci', 'IVORY COAST': 'ci', 'CIV': 'ci',
    'GHANA': 'gh', 'GHA': 'gh',
    'TOGO': 'tg', 'TGO': 'tg',
    'BENIN': 'bj', 'BEN': 'bj',
    'NIGERIA': 'ng', 'NGA': 'ng',
    'NIGER': 'ne', 'NER': 'ne',
    'MALI': 'ml', 'MLI': 'ml',
    'BURKINA FASO': 'bf', 'BFA': 'bf',
    'CAPE VERDE': 'cv', 'CPV': 'cv', 'CABO VERDE': 'cv',
    'SAO TOME AND PRINCIPE': 'st', 'STP': 'st', 'SAO TOME': 'st',
    'EQUATORIAL GUINEA': 'gq', 'GNQ': 'gq',
    'CAMEROON': 'cm', 'CMR': 'cm',
    'CENTRAL AFRICAN REPUBLIC': 'cf', 'CAF': 'cf',
    'CHAD': 'td', 'TCD': 'td',
    'SUDAN': 'sd', 'SDN': 'sd',
    'SOUTH SUDAN': 'ss', 'SSD': 'ss',
    'ETHIOPIA': 'et', 'ETH': 'et',
    'ERITREA': 'er', 'ERI': 'er',
    'DJIBOUTI': 'dj', 'DJI': 'dj',
    'SOMALIA': 'so', 'SOM': 'so',
    'KENYA': 'ke', 'KEN': 'ke',
    'UGANDA': 'ug', 'UGA': 'ug',
    'RWANDA': 'rw', 'RWA': 'rw',
    'BURUNDI': 'bi', 'BDI': 'bi',
    'TANZANIA': 'tz', 'TZA': 'tz',
    'DEMOCRATIC REPUBLIC OF THE CONGO': 'cd', 'COD': 'cd', 'DR CONGO': 'cd', 'DRC': 'cd', 'ZAIRE': 'cd',
    'REPUBLIC OF THE CONGO': 'cg', 'COG': 'cg', 'CONGO': 'cg',
    'GABON': 'ga', 'GAB': 'ga',
    'ANGOLA': 'ao', 'AGO': 'ao',
    'ZAMBIA': 'zm', 'ZMB': 'zm',
    'ZIMBABWE': 'zw', 'ZWE': 'zw',
    'MALAWI': 'mw', 'MWI': 'mw',
    'MOZAMBIQUE': 'mz', 'MOZ': 'mz',
    'MADAGASCAR': 'mg', 'MDG': 'mg',
    'SOUTH AFRICA': 'za', 'ZAF': 'za',
    'NAMIBIA': 'na', 'NAM': 'na',
    'BOTSWANA': 'bw', 'BWA': 'bw',
    'LESOTHO': 'ls', 'LSO': 'ls',
    'ESWATINI': 'sz', 'SWZ': 'sz', 'SWAZILAND': 'sz',
    'COMOROS': 'km', 'COM': 'km',
    'MAURITIUS': 'mu', 'MUS': 'mu',
    'SEYCHELLES': 'sc', 'SYC': 'sc',
    'REUNION': 're', 'REU': 're',
    'MAYOTTE': 'yt', 'MYT': 'yt',
    'SAINT HELENA': 'sh', 'SHN': 'sh', 'ST. HELENA': 'sh',
    'ASCENSION ISLAND': 'sh', 'TRISTAN DA CUNHA': 'sh',

    // Pacific & Oceania
    'AUSTRALIA': 'au', 'AUS': 'au',
    'NEW ZEALAND': 'nz', 'NZL': 'nz',
    'PAPUA NEW GUINEA': 'pg', 'PNG': 'pg',
    'SOLOMON ISLANDS': 'sb', 'SLB': 'sb',
    'VANUATU': 'vu', 'VUT': 'vu', 'NEW HEBRIDES': 'vu',
    'FIJI': 'fj', 'FJI': 'fj',
    'TONGA': 'to', 'TON': 'to',
    'SAMOA': 'ws', 'WSM': 'ws', 'WESTERN SAMOA': 'ws',
    'AMERICAN SAMOA': 'as', 'ASM': 'as',
    'KIRIBATI': 'ki', 'KIR': 'ki',
    'TUVALU': 'tv', 'TUV': 'tv',
    'NAURU': 'nr', 'NRU': 'nr',
    'PALAU': 'pw', 'PLW': 'pw',
    'MARSHALL ISLANDS': 'mh', 'MHL': 'mh',
    'MICRONESIA': 'fm', 'FSM': 'fm', 'FEDERATED STATES OF MICRONESIA': 'fm',
    'NORTHERN MARIANA ISLANDS': 'mp', 'MNP': 'mp', 'MARIANA ISLANDS': 'mp',
    'GUAM': 'gu', 'GUM': 'gu',
    'COOK ISLANDS': 'ck', 'COK': 'ck',
    'NIUE': 'nu', 'NIU': 'nu',
    'TOKELAU': 'tk', 'TKL': 'tk',
    'FRENCH POLYNESIA': 'pf', 'PYF': 'pf', 'TAHITI': 'pf',
    'NEW CALEDONIA': 'nc', 'NCL': 'nc',
    'WALLIS AND FUTUNA': 'wf', 'WLF': 'wf',
    'NORFOLK ISLAND': 'nf', 'NFK': 'nf',
    'PITCAIRN': 'pn', 'PCN': 'pn', 'PITCAIRN ISLANDS': 'pn',
    'CHRISTMAS ISLAND': 'cx', 'CXR': 'cx',
    'COCOS ISLANDS': 'cc', 'CCK': 'cc', 'COCOS (KEELING) ISLANDS': 'cc',
    'HEARD ISLAND': 'hm', 'HMD': 'hm',
    'WAKE ISLAND': 'us',
    'JOHNSTON ISLAND': 'us',
    'MIDWAY ISLAND': 'us', 'MIDWAY ISLANDS': 'us',

    // Antarctic / Special
    'ANTARCTICA': 'aq', 'ATA': 'aq',
    'BOUVET ISLAND': 'bv', 'BVT': 'bv',
    'KERGUELEN': 'tf', 'CROZET ISLAND': 'tf', 'AMSTERDAM AND ST. PAUL ISLANDS': 'tf', 'FRENCH SOUTHERN TERRITORIES': 'tf',
};

// Reverse lookup: ISO code → display country name (built from DXCC_MAP, picks first multi-char name per ISO)
const _tc = s => s.toLowerCase().replace(/\b\w/g, c => c.toUpperCase());
const ISO_TO_NAME = {};
for (const [key, iso] of Object.entries(DXCC_MAP)) {
    if (!ISO_TO_NAME[iso] && isNaN(Number(key)) && key.length > 3) {
        ISO_TO_NAME[iso] = _tc(key);
    }
}

const PREFIX_MAP = {
    // Middle East
    'YL': 'lv', 'A4': 'om', 'A6': 'ae', 'A7': 'qa', 'HZ': 'sa', '7Z': 'sa', '9K': 'kw', 'A9': 'bh', 'JY': 'jo', 'OD': 'lb',
    '4X': 'il', 'SU': 'eg', 'TA': 'tr', 'TC': 'tr', 'YK': 'sy', '5B': 'cy', 'YI': 'iq', 'EP': 'ir', 'EZ': 'tm', '7O': 'ye',
    // Central Asia
    'UK': 'uz', 'EY': 'tj', 'EX': 'kg', 'UN': 'kz', '4L': 'ge', 'ER': 'md', 'EK': 'am', '4J': 'az', 'EW': 'by',
    // Ukraine
    'UR': 'ua', 'UW': 'ua', 'UX': 'ua', 'UY': 'ua', 'UZ': 'ua', 'EO': 'ua',
    // Baltics
    'LY': 'lt', 'ES': 'ee',
    // Eastern Europe
    'HA': 'hu', 'HG': 'hu', 'YO': 'ro', 'YP': 'ro', 'YQ': 'ro', 'YR': 'ro', 'LZ': 'bg',
    '9A': 'hr', 'S5': 'si', 'Z3': 'mk', 'E7': 'ba', 'YT': 'rs', 'YU': 'rs', '4O': 'me', 'Z6': 'xk',
    'OK': 'cz', 'OL': 'cz', 'OM': 'sk', 'SP': 'pl', 'SN': 'pl', 'SO': 'pl', 'SQ': 'pl', 'SR': 'pl',
    // Scandinavia
    'OZ': 'dk', 'OU': 'dk', 'OV': 'dk', 'OW': 'dk', 'OY': 'fo',
    'LA': 'no', 'LB': 'no', 'LC': 'no', 'LG': 'no', 'LJ': 'no', 'LN': 'no',
    'SM': 'se', 'SK': 'se', 'SL': 'se', 'SA': 'se', 'SB': 'se', 'SC': 'se', 'SD': 'se', 'SE': 'se', 'SF': 'se', 'SG': 'se', 'SH': 'se', 'SI': 'se', 'SJ': 'se',
    'OH': 'fi', 'OF': 'fi', 'OG': 'fi', 'OI': 'fi', 'OJ': 'fi',
    'TF': 'is',
    // Benelux
    'PA': 'nl', 'PB': 'nl', 'PC': 'nl', 'PD': 'nl', 'PE': 'nl', 'PF': 'nl', 'PG': 'nl', 'PH': 'nl', 'PI': 'nl',
    'ON': 'be', 'OO': 'be', 'OP': 'be', 'OQ': 'be', 'OR': 'be', 'OS': 'be', 'OT': 'be',
    'LX': 'lu',
    // Russia — all R* prefixes
    'RA': 'ru', 'RB': 'ru', 'RC': 'ru', 'RD': 'ru', 'RE': 'ru', 'RF': 'ru', 'RG': 'ru', 'RH': 'ru', 'RI': 'ru', 'RJ': 'ru',
    'RK': 'ru', 'RL': 'ru', 'RM': 'ru', 'RN': 'ru', 'RO': 'ru', 'RP': 'ru', 'RQ': 'ru', 'RS': 'ru', 'RT': 'ru', 'RU': 'ru',
    'RV': 'ru', 'RW': 'ru', 'RX': 'ru', 'RY': 'ru', 'RZ': 'ru',
    'UA': 'ru', 'UB': 'ru', 'UC': 'ru', 'UD': 'ru', 'UE': 'ru', 'UF': 'ru', 'UG': 'ru', 'UH': 'ru', 'UI': 'ru',
    // Germany — all D* amateur prefixes
    'DA': 'de', 'DB': 'de', 'DC': 'de', 'DD': 'de', 'DE': 'de', 'DF': 'de', 'DG': 'de', 'DH': 'de', 'DI': 'de',
    'DJ': 'de', 'DK': 'de', 'DL': 'de', 'DM': 'de', 'DN': 'de', 'DO': 'de', 'DP': 'de', 'DQ': 'de', 'DR': 'de',
    // Switzerland / Austria
    'HB': 'ch', 'HB3': 'li', 'OE': 'at',
    // Spain / Portugal
    'EA': 'es', 'EB': 'es', 'EC': 'es', 'ED': 'es', 'EE': 'es', 'EF': 'es', 'EG': 'es', 'EH': 'es',
    'CT': 'pt', 'CQ': 'pt', 'CR': 'pt', 'CU': 'pt',
    // Italy (all I* prefixes)
    'I': 'it', 'IK': 'it', 'IW': 'it', 'IU': 'it', 'IQ': 'it', 'II': 'it', 'IR': 'it', 'IS': 'it', 'IV': 'it', 'IZ': 'it', 'IN': 'it',
    // France
    'F': 'fr', 'TK': 'fr',
    // UK — national + sub-national
    'G': 'gb', 'GC': 'gb', 'GM': 'gb-sct', 'GW': 'gb-wls', 'GI': 'gb-nir', 'GD': 'im', 'GJ': 'je', 'GU': 'gg',
    'M': 'gb', 'MM': 'gb-sct', 'MW': 'gb-wls', 'MI': 'gb-nir',
    '2': 'gb', '2M': 'gb-sct', '2W': 'gb-wls', '2I': 'gb-nir',
    // Americas
    'K': 'us', 'W': 'us', 'N': 'us', 'AA': 'us', 'AB': 'us', 'AC': 'us', 'AD': 'us', 'AE': 'us', 'AF': 'us', 'AG': 'us', 'AH': 'us', 'AI': 'us', 'AJ': 'us', 'AK': 'us',
    'VE': 'ca', 'VA': 'ca', 'VO': 'ca', 'VY': 'ca', 'CF': 'ca', 'CG': 'ca', 'VG': 'ca',
    'XE': 'mx', 'XF': 'mx',
    'TI': 'cr', 'YN': 'ni', 'HQ': 'hn', 'HR': 'hn', 'YS': 'sv', 'HH': 'ht', 'HI': 'do', 'HP': 'pa', 'CO': 'cu',
    'LU': 'ar', 'LW': 'ar', 'AY': 'ar', 'AZ': 'ar',
    'PY': 'br', 'PP': 'br', 'PQ': 'br', 'PR': 'br', 'PS': 'br', 'PT': 'br', 'PU': 'br', 'PV': 'br', 'PW': 'br', 'PX': 'br', 'ZV': 'br', 'ZW': 'br', 'ZX': 'br', 'ZY': 'br', 'ZZ': 'br',
    'CE': 'cl', 'XQ': 'cl', 'CA': 'cl', 'CB': 'cl', 'CC': 'cl', 'CD': 'cl',
    'CX': 'uy', 'ZP': 'py', 'CP': 'bo', 'OA': 'pe', 'OB': 'pe', 'OC': 'pe',
    'HC': 'ec', 'HD': 'ec', 'HJ': 'co', 'HK': 'co', 'YV': 've', 'YW': 've', 'YX': 've', 'YY': 've',
    '4M': 've', '8R': 'gy', 'PZ': 'sr', 'FY': 'gf',
    // Caribbean / NA islands
    'KP2': 'vi', 'KP4': 'pr', 'NP4': 'pr', 'WP4': 'pr', 'KH6': 'us', 'KL7': 'us',
    // Pacific / Oceania
    'VK': 'au', 'ZL': 'nz', 'ZM': 'nz', 'FK': 'nc', 'FO': 'pf', 'FW': 'wf', 'YJ': 'vu',
    'T2': 'tv', 'T3': 'ki', 'V7': 'mh', 'KC6': 'fm', 'V6': 'fm', 'C2': 'nr', 'DU': 'ph', 'DV': 'ph', 'DX': 'ph', 'DY': 'ph', 'DZ': 'ph',
    // East Asia
    'JA': 'jp', 'JB': 'jp', 'JC': 'jp', 'JD': 'jp', 'JE': 'jp', 'JF': 'jp', 'JG': 'jp', 'JH': 'jp', 'JI': 'jp',
    'JJ': 'jp', 'JK': 'jp', 'JL': 'jp', 'JM': 'jp', 'JN': 'jp', 'JO': 'jp', 'JP': 'jp', 'JQ': 'jp', 'JR': 'jp', 'JS': 'jp',
    'HL': 'kr', 'DS': 'kr', 'DT': 'kr', 'KI': 'kr', 'KO': 'kr',
    'P5': 'kp', 'HM': 'kp',
    'BY': 'cn', 'BA': 'cn', 'BD': 'cn', 'BG': 'cn', 'BH': 'cn', 'BI': 'cn', 'BJ': 'cn', 'BK': 'cn', 'BL': 'cn', 'BM': 'cn', 'BN': 'cn', 'BO': 'cn', 'BP': 'cn', 'BQ': 'cn', 'BR': 'cn', 'BS': 'cn', 'BT': 'cn', 'BU': 'cn', 'BV': 'tw',
    'JT': 'mn', 'JU': 'mn', 'JV': 'mn',
    'VR2': 'hk',
    // Southeast / South Asia
    'VU': 'in', 'AT': 'in', 'AU': 'in', 'AV': 'in', 'AW': 'in',
    'AP': 'pk', 'AS': 'pk',
    '4S': 'lk', 'S2': 'bd', 'S3': 'bd', 'A5': 'bt', '9N': 'np', '8Q': 'mv',
    'XY': 'mm', 'XZ': 'mm', 'HS': 'th', 'E2': 'th', '3W': 'vn', 'XV': 'vn', 'XU': 'kh',
    'XW': 'la', 'RDXC': 'la', 'VL': 'au', '9M': 'my', '9V': 'sg', 'YB': 'id', 'YC': 'id', 'YD': 'id', 'YE': 'id', 'YF': 'id', 'YG': 'id',
    // Africa
    'ZS': 'za', 'ZR': 'za', 'ZU': 'za', 'V5': 'na', 'A2': 'bw', 'Z2': 'zw', '9J': 'zm', 'C9': 'mz', '7P': 'ls', '3DA': 'sz',
    '5R': 'mg', '3B': 'mu', 'S7': 'sc', 'S9': 'st', 'D6': 'km', 'FR': 're',
    '5Z': 'ke', 'EZ': 'tz', '5X': 'ug', '9X': 'rw', '9U': 'bi', '5H': 'tz',
    'ET': 'et', '7O': 'ye', 'E3': 'er', 'ST': 'sd', 'SS': 'sd',
    '5N': 'ng', '5O': 'ml', '6W': 'sn', '9L': 'sl', 'EL': 'lr', 'TU': 'ci', '5V': 'tg', 'TY': 'bj', 'TZ': 'ml',
    'TR': 'ga', 'TT': 'td', 'TL': 'cf', '9G': 'gh', 'OX': 'gl',
    'CN': 'ma', '7X': 'dz', 'ZA': 'al', '5A': 'ly', '3V': 'tn', 'TS': 'tn',
    'S0': 'eh', 'T5': 'so', '6O': 'so',
    'OX': 'gl', 'XP': 'gl',
};

function getISOFromCallsign(call) {
    if (!call) return null;
    const c = call.toUpperCase();
    // Try longer prefixes first (3 chars), then 2, then 1
    for (let len = 3; len >= 1; len--) {
        const pref = c.substring(0, len);
        if (PREFIX_MAP[pref]) return PREFIX_MAP[pref];
    }
    return null;
}

// Compact country bounding boxes for coordinate-based fallback
// [iso, minLat, maxLat, minLon, maxLon]
const COUNTRY_BBOX = [
    ['de', 47.3, 55.1, 5.9, 15.0], ['fr', 41.3, 51.1, -5.2, 9.6],
    ['gb', 49.9, 60.9, -8.2, 1.8], ['it', 35.5, 47.1, 6.6, 18.5],
    ['es', 36.0, 43.8, -9.4, 4.4], ['pt', 36.8, 42.2, -9.5, -6.2],
    ['nl', 50.7, 53.6, 3.3, 7.2],  ['be', 49.5, 51.5, 2.5, 6.4],
    ['ch', 45.8, 47.8, 5.9, 10.5], ['at', 46.4, 49.0, 9.5, 17.2],
    ['pl', 49.0, 54.9, 14.1, 24.2],['cz', 48.5, 51.1, 12.1, 18.9],
    ['sk', 47.7, 49.6, 16.8, 22.6],['hu', 45.7, 48.6, 16.1, 22.9],
    ['ro', 43.6, 48.3, 20.2, 30.0],['bg', 41.2, 44.2, 22.3, 28.6],
    ['hr', 42.4, 46.6, 13.5, 19.5],['si', 45.4, 46.9, 13.4, 16.6],
    ['rs', 42.2, 46.2, 18.8, 23.0],['ba', 42.5, 45.3, 15.7, 19.7],
    ['me', 41.9, 43.6, 18.4, 20.4],['al', 39.6, 42.7, 19.3, 21.1],
    ['mk', 40.8, 42.4, 20.5, 23.0],['gr', 34.8, 41.8, 19.4, 29.7],
    ['cy', 34.6, 35.7, 32.3, 34.6],['tr', 35.8, 42.1, 25.7, 44.8],
    ['se', 55.3, 69.1, 10.6, 24.2],['no', 57.9, 71.2, 4.5, 31.1],
    ['fi', 59.8, 70.1, 20.0, 31.6],['dk', 54.6, 57.8, 8.1, 15.2],
    ['is', 63.3, 66.6, -24.5, -13.5],
    ['ua', 44.4, 52.4, 22.1, 40.2],['by', 51.3, 56.2, 23.2, 32.8],
    ['md', 45.5, 48.5, 26.6, 30.1],['lt', 53.9, 56.4, 20.9, 26.8],
    ['lv', 55.7, 57.8, 20.9, 28.2],['ee', 57.5, 59.7, 21.8, 28.2],
    ['ru', 41.2, 82.0, 19.6, 60.0],// western Russia bbox
    ['us', 24.5, 49.4, -125.0, -66.9],['ca', 41.7, 83.1, -141.0, -52.6],
    ['mx', 14.5, 32.7, -117.1, -86.7],
    ['jp', 24.4, 45.5, 122.9, 153.9],['cn', 18.2, 53.6, 73.6, 134.8],
    ['kr', 33.1, 38.6, 124.6, 129.6],['kp', 37.7, 42.5, 124.2, 130.7],
    ['tw', 21.9, 25.3, 120.0, 122.1],
    ['au', -43.7, -10.7, 113.3, 153.6],['nz', -47.3, -34.4, 166.4, 178.6],
    ['in', 8.1, 35.5, 68.1, 97.4],  ['pk', 24.0, 37.1, 60.9, 75.2],
    ['id', -10.9, 5.9, 95.0, 141.0],['my', 1.0, 7.4, 99.6, 119.3],
    ['ph', 4.6, 21.1, 116.7, 127.0],['th', 5.6, 20.5, 97.3, 105.6],
    ['vn', 8.6, 23.4, 102.2, 109.5],['il', 29.5, 33.3, 34.3, 35.9],
    ['sa', 15.1, 32.2, 36.5, 55.7], ['ir', 25.1, 39.8, 44.0, 63.3],
    ['iq', 29.1, 37.4, 38.8, 48.8], ['sy', 32.3, 37.4, 35.7, 42.4],
    ['jo', 29.2, 33.4, 34.9, 39.3], ['ae', 22.6, 26.1, 51.6, 56.4],
    ['eg', 22.0, 31.7, 24.7, 37.1], ['za', -34.8, -22.1, 16.5, 32.9],
    ['ng', 4.3, 13.9, 2.7, 14.7],   ['ke', -4.7, 4.6, 34.0, 41.9],
    ['et', 3.4, 14.9, 32.9, 48.0],  ['tz', -11.7, -1.0, 29.3, 40.4],
    ['br', -33.7, 5.3, -73.9, -34.8],['ar', -55.1, -21.8, -73.6, -53.6],
    ['cl', -55.9, -17.5, -75.7, -66.4],['ve', 0.7, 12.2, -73.3, -59.8],
    ['co', -4.2, 12.5, -79.0, -66.9],['pe', -18.4, 0.0, -81.3, -68.7],
    ['ma', 27.7, 35.9, -13.2, -1.0],['dz', 19.0, 37.1, -8.7, 11.9],
    ['tn', 30.2, 37.5, 7.5, 11.6],  ['ly', 19.5, 33.2, 9.3, 25.2],
];

function getISOFromCoords(lat, lon) {
    if (lat == null || lon == null || isNaN(lat) || isNaN(lon)) return null;
    for (const [iso, minLat, maxLat, minLon, maxLon] of COUNTRY_BBOX) {
        if (lat >= minLat && lat <= maxLat && lon >= minLon && lon <= maxLon) return iso;
    }
    return null;
}

function calculateDistance(lat1, lon1, lat2, lon2, unit = 'km') {
    const R = 6371;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
              Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
              Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    const d = R * c;
    return unit === 'mi' ? d * 0.621371 : d;
}

const BAND_COLORS = {
    '2200M': '#4B0082', '630M': '#483D8B', 
    '160M': '#A020F0', '80M': '#0000FF', '60M': '#00FFFF', 
    '40M': '#008000', '30M': '#008080', '20M': '#FFFF00', 
    '17M': '#FFA500', '15M': '#FF0000', '12M': '#FF1493', 
    '10M': '#8B5CF6', '6M': '#B500D0', '4M': '#8B008B', 
    '2M': '#E20084', '1.25M': '#FF1493', '70CM': '#E2001E', 
    '33CM': '#FF4500', '23CM': '#FF6347', '13CM': '#FF7F50',
    '9CM': '#FFA07A', '6CM': '#F08080', '3CM': '#CD5C5C', 
    '1.25CM': '#A52A2A', '6MM': '#800000', '4MM': '#556B2F'
};

const savedBands = localStorage.getItem('polarlog_active_bands');
const activeBands = savedBands ? new Set(JSON.parse(savedBands)) : new Set(Object.keys(BAND_COLORS));

const OVERLAY_PRESETS = [
    { id: 'dark',      name: 'Dark Matter',  view: '2d', url: 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',            preview: 'https://a.basemaps.cartocdn.com/dark_all/3/4/3.png' },
    { id: 'light',     name: 'Arctic White', view: '2d', url: 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png',           preview: 'https://a.basemaps.cartocdn.com/light_all/3/4/3.png' },
    { id: 'voyager',   name: 'Voyager',      view: '2d', url: 'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', preview: 'https://a.basemaps.cartocdn.com/rastertiles/voyager/3/4/3.png' },
    { id: 'osm',       name: 'Open Streets', view: '2d', url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',                      preview: 'https://a.tile.openstreetmap.org/3/4/3.png' },
    { id: 'satellite', name: 'Satellite',    view: '2d', url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',   preview: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/3/3/4' },
    { id: 'topo',      name: 'Topographic',  view: '2d', url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Topo_Map/MapServer/tile/{z}/{y}/{x}', preview: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Topo_Map/MapServer/tile/3/3/4' },
    
    // 3D Orbit Presets
    { id: 'globe-day',   name: 'Globe Day',    view: '3d', preview: 'https://unpkg.com/three-globe@2/example/img/earth-blue-marble.jpg', texture: 'https://unpkg.com/three-globe@2/example/img/earth-blue-marble.jpg' },
    { id: 'globe-night', name: 'Globe Night',  view: '3d', preview: 'https://unpkg.com/three-globe@2/example/img/earth-night.jpg',       texture: 'https://unpkg.com/three-globe@2/example/img/earth-night.jpg' }
];

document.addEventListener('DOMContentLoaded', async () => {
    console.log('Polarplot Pro: Initializing System...');

    // DYNAMIC INJECTION - RE-CALIBRATION
    if (!document.getElementById('globe-ctrl-bar')) {
        const globeContainer = document.getElementById('globe-container');
        if (globeContainer) {
            const bar = document.createElement('div');
            bar.id = 'globe-ctrl-bar';
            bar.className = 'globe-ctrl-bar';
            bar.innerHTML = `
              <button id="globe-btn-overlay" class="globe-ctrl-btn" title="Map Overlays">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 2 7 12 12 22 7 12 2"></polygon><polyline points="2 17 12 22 22 17"></polyline><polyline points="2 12 12 17 22 12"></polyline></svg>
              </button>
              <button id="globe-btn-daynight" class="globe-ctrl-btn" title="Toggle Day / Night">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>
              </button>
              <button id="globe-btn-toggle" class="globe-ctrl-btn active" title="Return to 2D Map">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="2" y1="12" x2="22" y2="12"></line><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"></path></svg>
              </button>
              <button id="globe-btn-arcs" class="globe-ctrl-btn" title="Toggle Contact Arcs">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><path d="M3 17 Q8 4 12 12 Q16 20 21 7"/></svg>
              </button>
              <button id="globe-btn-fpv" class="globe-ctrl-btn" title="First-Person Perspective View">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
              </button>
            `;
            globeContainer.appendChild(bar);
        }
    }
    
    try {
        mapEngine = new MapEngine('map');
        worker = new Worker(new URL('./src/adif-worker.js', import.meta.url), { type: 'module' });
        
        const loadingStages = [
            'analyzing spectrum...', 'plotting tactical paths...', 'resolving dxcc layers...',
            'calculating signal distances...', 'optimizing pulse frequency...', 'mapping global qsos...'
        ];
        let stageIdx = 0;
        let textRotation;

        // Universal UI Controls Binding
        document.getElementById('ui-btn-layer')?.addEventListener('click', () => {
            const picker = document.getElementById('overlay-picker');
            if (picker && !picker.classList.contains('visible')) {
                renderOverlayGrid();
            }
            picker?.classList.toggle('visible');
        });

        document.getElementById('ui-btn-globe')?.addEventListener('click', () => {
            toggleGlobe();
        });

        document.getElementById('ui-btn-zoomin')?.addEventListener('click', () => {
            if (globeVisible && globeInstance) {
                const pov = globeInstance.pointOfView();
                globeInstance.pointOfView({ altitude: Math.max(0.1, pov.altitude - 0.5) }, 400);
            } else {
                mapEngine.map.zoomIn();
            }
        });

        document.getElementById('ui-btn-zoomout')?.addEventListener('click', () => {
            if (globeVisible && globeInstance) {
                const pov = globeInstance.pointOfView();
                globeInstance.pointOfView({ altitude: Math.min(5, pov.altitude + 0.5) }, 400);
            } else {
                mapEngine.map.zoomOut();
            }
        });

        document.getElementById('ui-btn-screenshot')?.addEventListener('click', () => {
            if (!currentQSOs.length) { showTacticalToast('Import a log first.', 3000); return; }
            const modal = document.getElementById('screenshot-modal');
            if (modal) { modal.style.display = 'flex'; }
        });
        document.getElementById('ss-cancel')?.addEventListener('click', () => {
            document.getElementById('screenshot-modal').style.display = 'none';
        });
        // View toggle (Full Map / Camera View)
        let _ssCameraView = false;
        const _ssToggleFull = document.getElementById('ss-toggle-full');
        const _ssToggleCam  = document.getElementById('ss-toggle-cam');
        const _setSSToggle = (camView) => {
            _ssCameraView = camView;
            if (_ssToggleFull) {
                _ssToggleFull.style.background = camView ? 'transparent' : 'color-mix(in srgb,var(--acc),transparent 80%)';
                _ssToggleFull.style.color = camView ? 'var(--muted)' : 'var(--acc)';
            }
            if (_ssToggleCam) {
                _ssToggleCam.style.background = camView ? 'color-mix(in srgb,var(--acc),transparent 80%)' : 'transparent';
                _ssToggleCam.style.color = camView ? 'var(--acc)' : 'var(--muted)';
            }
        };
        _ssToggleFull?.addEventListener('click', () => _setSSToggle(false));
        _ssToggleCam?.addEventListener('click',  () => _setSSToggle(true));
        document.getElementById('ss-save')?.addEventListener('click', () => takeScreenshot(_ssCameraView));

        // Remove old internal map listeners
        // mapEngine.map.on('globebtnclick', toggleGlobe);
        // mapEngine.map.on('overlaybtnclick', () => { ... });

        worker.onmessage = (e) => {
            const { action, data, percent } = e.data;
            if (action === 'progress') {
                updateLoadingStatus(true, loadingStages[stageIdx % loadingStages.length], percent);
            } else if (action === 'chunkResult') {
                requestAnimationFrame(() => {
                    data.forEach(q => {
                        if (q.LAT && q.LON) {
                            mapEngine.plotQSO([q], BAND_COLORS[q.BAND?.toUpperCase()] || '#38bdf8');
                        }
                    });
                    stageIdx++;
                });
            } else if (action === 'parseResult') {
                currentQSOs = data;
                clearInterval(textRotation);
                finalizeParsedData(data);
            }
        };

        const homeGridInput = document.getElementById('my-grid');
        const homeLatInput = document.getElementById('my-lat');
        const homeLonInput = document.getElementById('my-lon');
        const myCallInput = document.getElementById('my-call');
        const modeGridBtn = document.getElementById('mode-grid');
        const modeCoordsBtn = document.getElementById('mode-coords');
        const gridContainer = document.getElementById('grid-container');
        const coordsContainer = document.getElementById('coords-container');

        if (modeGridBtn && modeCoordsBtn) {
            modeGridBtn.addEventListener('click', () => {
                modeGridBtn.classList.add('active');
                modeCoordsBtn.classList.remove('active');
                gridContainer.classList.add('active');
                coordsContainer.classList.remove('active');
                updateHome();
            });
            modeCoordsBtn.addEventListener('click', () => {
                modeCoordsBtn.classList.add('active');
                modeGridBtn.classList.remove('active');
                coordsContainer.classList.add('active');
                gridContainer.classList.remove('active');
                updateHome();
            });
        }

        const updateHome = () => {
            const isGridMode = modeGridBtn.classList.contains('active');
            if (isGridMode) {
                const grid = homeGridInput.value.trim();
                const coords = maidenheadToCoords(grid);
                if (coords) {
                    mapEngine.setHomeLocation(coords.lat, coords.lon);
                    localStorage.setItem('polarlog_my_grid', grid);
                    processQSOs(currentQSOs, false, true);
                }
            } else {
                const lat = parseFloat(homeLatInput.value);
                const lon = parseFloat(homeLonInput.value);
                if (!isNaN(lat) && !isNaN(lon)) {
                    mapEngine.setHomeLocation(lat, lon);
                    localStorage.setItem('polarlog_my_lat', lat);
                    localStorage.setItem('polarlog_my_lon', lon);
                    processQSOs(currentQSOs, false, true);
                }
            }
        };

        if (homeLatInput && homeLonInput) {
            const savedLat = localStorage.getItem('polarlog_my_lat');
            const savedLon = localStorage.getItem('polarlog_my_lon');
            if (savedLat) homeLatInput.value = savedLat;
            if (savedLon) homeLonInput.value = savedLon;
            if (savedLat && savedLon) mapEngine.setHomeLocation(savedLat, savedLon);
            homeLatInput.addEventListener('input', updateHome);
            homeLonInput.addEventListener('input', updateHome);
        }

        if (myCallInput) {
            myCallInput.value = localStorage.getItem('polarlog_my_call') || '';
            myCallInput.addEventListener('input', (e) => localStorage.setItem('polarlog_my_call', e.target.value));
        }

        if (homeGridInput) {
            homeGridInput.value = localStorage.getItem('polarlog_my_grid') || '';
            if (homeGridInput.value) updateHome();
            homeGridInput.addEventListener('input', updateHome);
        }

        const chkPaths = document.getElementById('chk-paths');
        const chkClusters = document.getElementById('chk-clusters');

        const chkPathHover = document.getElementById('chk-path-hover');

        if (chkPaths) {
            chkPaths.checked = false;
            mapEngine.setPathsVisible(false);
            localStorage.setItem('polarlog_show_paths', false);
            chkPaths.addEventListener('change', (e) => {
                const val = e.target.checked;
                localStorage.setItem('polarlog_show_paths', val);
                mapEngine.setPathsVisible(val);
                // Build paths on first enable only; if already built, showing the layer is enough
                if (val && mapEngine.paths.getLayers().length === 0) processQSOs(currentQSOs, false, true);
                if (globeVisible && globeInstance) {
                    if (val) {
                        if (currentQSOs.length) showGlobeArcLoading();
                        requestAnimationFrame(() => requestAnimationFrame(() => updateGlobeArcs()));
                    } else {
                        updateGlobeArcs();
                    }
                }
                // Keep Line Distance Hover locked to Contact Paths state
                if (chkPathHover) {
                    chkPathHover.disabled = !val;
                    if (!val && chkPathHover.checked) {
                        chkPathHover.checked = false;
                        chkPathHover.dispatchEvent(new Event('change'));
                    }
                }
            });
        }

        if (chkPathHover) {
            chkPathHover.checked = false;
            chkPathHover.disabled = true; // disabled until Contact Paths is on
            chkPathHover.addEventListener('change', (e) => {
                mapEngine.setPathHoverEnabled(e.target.checked);
            });
        }

        document.getElementById('path-hover-row')?.addEventListener('click', () => {
            if (chkPathHover?.disabled) {
                showTacticalToast('Turn on Contact Paths first.', 3000);
            }
        });

        if (chkClusters) {
            chkClusters.checked = false;
            mapEngine.setClustersEnabled(false);
            localStorage.setItem('polarlog_show_clusters', false);
            chkClusters.addEventListener('change', (e) => {
                localStorage.setItem('polarlog_show_clusters', e.target.checked);
                mapEngine.setClustersEnabled(e.target.checked);
                if (globeVisible && globeInstance) {
                    globeInstance.resumeAnimation();
                    updateGlobeDots();
                }
            });
        }

        // Block Visual Options interactions when no log is loaded
        document.getElementById('visual-options-section')?.addEventListener('click', (e) => {
            if (currentQSOs.length) return;
            e.preventDefault();
            e.stopImmediatePropagation();
            showTacticalToast('Upload a log first.', 3000);
        }, true);

        document.querySelectorAll('.band-chip').forEach(chip => {
            const band = chip.dataset.band;
            if (activeBands.has(band)) chip.classList.add('active');
            else chip.classList.remove('active');
            chip.addEventListener('click', () => {
                if (activeBands.has(band)) {
                    activeBands.delete(band);
                    chip.classList.remove('active');
                } else {
                    activeBands.add(band);
                    chip.classList.add('active');
                }
                localStorage.setItem('polarlog_active_bands', JSON.stringify([...activeBands]));
                processQSOs(currentQSOs, false);
                if (globeVisible && globeInstance) updateGlobeData();
            });
        });

        const dropzone = document.getElementById('dropzone');
        const fileInput = document.getElementById('adif-input');
        if (dropzone && fileInput) {
            dropzone.onclick = () => fileInput.click();
            dropzone.ondragover = (e) => { e.preventDefault(); dropzone.classList.add('active'); };
            dropzone.ondragleave = () => dropzone.classList.remove('active');
            dropzone.ondrop = (e) => {
                e.preventDefault(); dropzone.classList.remove('active');
                if (e.dataTransfer.files.length) handleFiles(e.dataTransfer.files);
            };
            fileInput.onchange = (e) => {
                if (e.target.files.length) handleFiles(e.target.files);
            };
        }

        const qrzKeyInput = document.getElementById('qrz-key');
        const qrzUserInput = document.getElementById('qrz-user');

        const corsProxyInput = document.getElementById('cors-proxy');
        const lookupBtn = document.getElementById('lookup-btn');
        const bulkBtn = document.getElementById('bulk-resolve-btn');

        if (qrzKeyInput) {
            qrzKeyInput.value = localStorage.getItem('polarlog_qrz_key') || '';
            qrzKeyInput.addEventListener('input', (e) => localStorage.setItem('polarlog_qrz_key', e.target.value));
        }
        if (qrzUserInput) {
            qrzUserInput.value = localStorage.getItem('polarlog_qrz_user') || '';
            qrzUserInput.addEventListener('input', (e) => localStorage.setItem('polarlog_qrz_user', e.target.value));
        }
        if (corsProxyInput) {
            corsProxyInput.value = localStorage.getItem('polarlog_cors_proxy') || 'https://cors-anywhere.herokuapp.com/';
            corsProxyInput.addEventListener('input', (e) => localStorage.setItem('polarlog_cors_proxy', e.target.value));
        }
        
        if (bulkBtn) bulkBtn.onclick = (e) => { e.preventDefault(); bulkResolveQSOs(); };

        if (lookupBtn) {
            lookupBtn.onclick = async () => {
                const searchField = document.getElementById('search-call');
                const homeField = document.getElementById('my-call');
                let call = searchField?.value.trim().toUpperCase() || homeField?.value.trim().toUpperCase();
                const key = document.getElementById('qrz-key').value;
                const user = document.getElementById('qrz-user').value;
                const pass = document.getElementById('qrz-pass').value;
                const proxy = document.getElementById('cors-proxy').value;
                
                if (!call || (!key && !user)) return alert('Enter a Callsign and either a Direct Key OR QRZ Username.');
                
                try {
                    isResolving = true;
                    updateLoadingStatus(true, `Resolving ${call}...`, 45);
                    lookupBtn.textContent = 'PENDING...';
                    lookupBtn.disabled = true;
                    const qrz = new QRZService(user, pass, key, proxy);
                    const data = await qrz.lookup(call);
                    isResolving = false;
                    lookupBtn.textContent = 'RESOLVE HOME';
                    lookupBtn.disabled = false;
                    updateLoadingStatus(false);
                    
                    if (data) {
                        if (searchField && !searchField.value) searchField.value = call;
                        if (call === homeField?.value.trim().toUpperCase()) {
                            if (data.grid) {
                                document.getElementById('my-grid').value = data.grid;
                                localStorage.setItem('polarlog_my_grid', data.grid);
                            }
                            if (data.lat && data.lon) {
                                document.getElementById('my-lat').value = data.lat;
                                document.getElementById('my-lon').value = data.lon;
                                localStorage.setItem('polarlog_my_lat', data.lat);
                                localStorage.setItem('polarlog_my_lon', data.lon);
                            }
                        }
                    } else alert('Station not found or QRZ Session Error.');
                } catch (err) {
                    isResolving = false;
                    updateLoadingStatus(false);
                    lookupBtn.textContent = 'RESOLVE HOME';
                    lookupBtn.disabled = false;
                    if (err.message === 'PROXY_BLOCK') {
                        if (window.confirm('PROXY BLOCKED: Activate CORS session?')) window.open(proxy, '_blank');
                    } else alert('Connection Failed: ' + err.message);
                }
            };
        }

        async function bulkResolveQSOs(forceAll = false) {
            const btn = document.getElementById('bulk-resolve-btn');
            const stats = document.getElementById('resolve-stats');
            if (currentQSOs.length === 0) return alert('Import a log first.');
            btn.disabled = true;
            btn.textContent = 'INITIALIZING...';
            const missing = forceAll ? currentQSOs : currentQSOs.filter(q => !q.LAT || !q.GRIDSQUARE);
            const user = document.getElementById('qrz-user').value, pass = document.getElementById('qrz-pass').value, key = document.getElementById('qrz-key').value, proxy = document.getElementById('cors-proxy').value;
            if (!key && (!user || !pass)) { btn.disabled = false; btn.textContent = 'RESOLVE MISSING / LOCATION DATA'; return alert('Credentials Required.'); }
            if (!forceAll && missing.length === 0) {
                if (window.confirm('All contacts resolved. Force refresh?')) return bulkResolveQSOs(true);
                btn.disabled = false; btn.textContent = 'RESOLVE MISSING / LOCATION DATA'; return;
            }
            isResolving = true;
            btn.textContent = 'RESOLVING...';
            stats.style.display = 'block';
            updateLoadingStatus(true, `Pulse Engine Initiated...`, 5);
            const qrz = new QRZService(user, pass, key, proxy);

            // ── Phase 1: Cross-reference QRZ logbook ───────────────────────
            let logbookMap = null;
            let logbookMatched = 0;
            try {
                stats.textContent = 'Fetching QRZ logbook...';
                updateLoadingStatus(true, 'Fetching QRZ Logbook...', 8);
                logbookMap = await qrz.fetchLogbook();
                // Apply logbook matches immediately
                for (const qso of missing) {
                    const entry = logbookMap.get(qso.CALL);
                    if (!entry) continue;
                    qso.LAT = entry.lat;
                    qso.LON = entry.lon;
                    if (entry.grid)    qso.GRIDSQUARE = entry.grid;
                    if (entry.country) qso.COUNTRY    = entry.country;
                    if (entry.dxcc)    qso.DXCC       = entry.dxcc;
                    logbookMatched++;
                }
                stats.textContent = `QRZ Logbook: ${logbookMatched} matched from ${logbookMap.size} entries`;
                updateLoadingStatus(true, `Logbook: ${logbookMatched}/${missing.length} resolved`, 15);
                mapEngine.clear(); mapEngine.clearPaths();
                processQSOs(currentQSOs, false, true); // new locations → rebuild paths
                await new Promise(r => setTimeout(r, 400)); // brief pause so user sees the count
            } catch (e) {
                // Logbook fetch is best-effort — fall through to XML lookups
                stats.textContent = `Logbook unavailable (${e.message.slice(0,40)}), using XML lookup...`;
                await new Promise(r => setTimeout(r, 600));
            }


            // ── Phase 3: XML lookup for remaining unresolved contacts ───────
            const stillMissing = missing.filter(q => !q.LAT || !q.LON);
            let resolvedCount = logbookMatched, totalToResolve = stillMissing.length, processedCount = 0;
            let lastRedraw = Date.now();

            if (stillMissing.length > 0) {
                stats.textContent = `Logbook: ${logbookMatched} matched. XML lookup: 0 / ${stillMissing.length}...`;
                let idx = 0, batchSize = 5;
                const processPulse = async () => {
                    while (idx < totalToResolve) {
                        const qso = stillMissing[idx++];
                        try {
                            const data = await qrz.lookup(qso.CALL);
                            processedCount++;
                            if (data) {
                                qso.LAT = data.lat;
                                qso.LON = data.lon;
                                qso.GRIDSQUARE = data.grid;
                                if (data.dxcc)    qso.DXCC    = data.dxcc;
                                if (data.country) qso.COUNTRY = data.country;
                                resolvedCount++;
                            }
                            const percent = 15 + Math.floor((processedCount / totalToResolve) * 85);
                            stats.textContent = `Logbook: ${logbookMatched} · XML: ${processedCount}/${stillMissing.length} (${resolvedCount} total resolved)`;
                            updateLoadingStatus(true, `Pulse Engine: ${processedCount}/${stillMissing.length}`, percent);
                            if (Date.now() - lastRedraw > 1500) { processQSOs(currentQSOs, false); lastRedraw = Date.now(); }
                        } catch (e) { processedCount++; updateLoadingStatus(true, `Pulse Engine: ${processedCount}/${stillMissing.length}`, 15 + Math.floor((processedCount / totalToResolve) * 85)); }
                    }
                };
                await Promise.all(Array(batchSize).fill(0).map(() => processPulse()));
            }

            isResolving = false; updateLoadingStatus(false);
            // Synchronously wipe all old markers before the async replot so nothing lingers
            mapEngine.clear();
            mapEngine.clearPaths();
            processQSOs(currentQSOs, false, true);
            btn.disabled = false; btn.textContent = 'RESOLVE MISSING / LOCATION DATA';
        }

        // ── QRZ ADIF cross-reference (CORS-free) ────────────────────────
        const qrzAdifDropzone = document.getElementById('qrz-adif-dropzone');
        const qrzAdifInput    = document.getElementById('qrz-adif-input');
        const qrzAdifStatus   = document.getElementById('qrz-adif-status');

        const applyQRZAdif = (text) => {
            const eohIdx = text.toUpperCase().indexOf('<EOH>');
            const dataPart = eohIdx !== -1 ? text.substring(eohIdx + 5) : text;
            const records = dataPart.split(/<EOR>/i);
            const refMap = new Map();
            const decodeCoord = (s) => {
                if (!s) return null;
                const dir = s.charAt(0).toUpperCase();
                if (!['N','S','E','W'].includes(dir)) { const v = parseFloat(s); return isNaN(v) ? null : v; }
                const parts = s.substring(1).trim().split(' ');
                let dec = parts.length >= 2 ? parseFloat(parts[0]) + parseFloat(parts[1]) / 60 : parseFloat(s.substring(1));
                return (dir === 'S' || dir === 'W') ? -dec : dec;
            };
            for (const record of records) {
                if (!record.trim()) continue;
                const qso = {};
                const regex = /<([^:>]+):(\d+)(?::[^>]+)?>([^<]*)/gi;
                let m;
                while ((m = regex.exec(record)) !== null) qso[m[1].toUpperCase()] = m[3].substring(0, parseInt(m[2])).trim();
                if (!qso.CALL) continue;
                let lat = decodeCoord(qso.LAT), lon = decodeCoord(qso.LON);
                if ((lat == null || lon == null) && qso.GRIDSQUARE?.length >= 4) {
                    const g = qso.GRIDSQUARE.toUpperCase();
                    lon = (g.charCodeAt(0)-65)*20-180 + parseInt(g[2])*2 + (g.length>=6 ? (g.charCodeAt(4)-65)*(2/24)+(1/24) : 1);
                    lat = (g.charCodeAt(1)-65)*10-90  + parseInt(g[3])   + (g.length>=6 ? (g.charCodeAt(5)-65)*(1/24)+(0.5/24) : 0.5);
                }
                if (lat == null || lon == null || isNaN(lat) || isNaN(lon)) continue;
                const existing = refMap.get(qso.CALL);
                if (!existing || (!existing.grid && qso.GRIDSQUARE))
                    refMap.set(qso.CALL, { lat: String(lat), lon: String(lon), grid: qso.GRIDSQUARE||null, country: qso.COUNTRY||qso.DXCC_COUNTRY||null, dxcc: qso.DXCC||null });
            }
            if (!refMap.size) { qrzAdifStatus.style.display='block'; qrzAdifStatus.style.color='var(--muted)'; qrzAdifStatus.textContent='No mappable contacts found in file.'; return; }
            let matched = 0;
            for (const qso of currentQSOs) {
                const entry = refMap.get(qso.CALL);
                if (!entry) continue;
                qso.LAT = entry.lat; qso.LON = entry.lon;
                if (entry.grid)    qso.GRIDSQUARE = entry.grid;
                if (entry.country) qso.COUNTRY    = entry.country;
                if (entry.dxcc)    qso.DXCC       = entry.dxcc;
                matched++;
            }
            qrzAdifStatus.style.display = 'block';
            qrzAdifStatus.style.color = matched > 0 ? 'var(--acc)' : 'var(--muted)';
            qrzAdifStatus.textContent = matched > 0
                ? `✓ ${matched} contacts enriched from ${refMap.size} logbook entries`
                : 'No callsign matches found between logs.';
            if (matched > 0) { processQSOs(currentQSOs, false, true); if (globeVisible && globeInstance) updateGlobeData(); }
        };

        if (qrzAdifDropzone) {
            qrzAdifDropzone.addEventListener('click', () => qrzAdifInput?.click());
            qrzAdifDropzone.addEventListener('dragover', e => { e.preventDefault(); qrzAdifDropzone.style.borderColor='var(--acc)'; });
            qrzAdifDropzone.addEventListener('dragleave', () => qrzAdifDropzone.style.borderColor='var(--brd)');
            qrzAdifDropzone.addEventListener('drop', e => {
                e.preventDefault(); qrzAdifDropzone.style.borderColor='var(--brd)';
                const file = e.dataTransfer.files[0]; if (!file) return;
                const reader = new FileReader(); reader.onload = ev => applyQRZAdif(ev.target.result); reader.readAsText(file);
            });
        }
        if (qrzAdifInput) {
            qrzAdifInput.addEventListener('change', () => {
                const file = qrzAdifInput.files[0]; if (!file) return;
                const reader = new FileReader(); reader.onload = ev => applyQRZAdif(ev.target.result); reader.readAsText(file);
                qrzAdifInput.value = '';
            });
        }

        mapEngine.map.on('popupopen', (e) => {
            const btn = e.popup._container.querySelector('.btn-show-history');
            if (btn) btn.onclick = () => {
                const data = e.popup._source?.options?.stationData || e.popup._stationData;
                if (data) showHistoryPanel(data);
            };
        });

        document.getElementById('search-call')?.addEventListener('input', (e) => { searchQuery = e.target.value.toUpperCase(); processQSOs(currentQSOs, false); if (globeVisible && globeInstance) updateGlobeData(); });
        document.getElementById('filter-dxcc')?.addEventListener('change', (e) => { selectedDXCC = e.target.value; processQSOs(currentQSOs, false); if (globeVisible && globeInstance) updateGlobeData(); });
        document.getElementById('close-history')?.addEventListener('click', () => document.getElementById('history-panel').classList.remove('visible'));
        document.getElementById('close-station')?.addEventListener('click', () => document.getElementById('station-panel').classList.remove('visible'));

        // Stat card buttons
        ['total', 'dxcc', 'bands', 'modes'].forEach(type => {
            document.getElementById(`card-${type}`)?.addEventListener('click', () => openStatsPanel(type));
        });
        document.getElementById('stats-backdrop')?.addEventListener('click', closeStatsPanels);
        document.querySelectorAll('.close-stats-btn').forEach(btn => btn.addEventListener('click', closeStatsPanels));

        // 3D Globe toggle
        mapEngine.map.on('globebtnclick', toggleGlobe);

        const themeChips = document.querySelectorAll('.tchip');
        const currentTheme = localStorage.getItem('polarlog_theme') || 'dark';
        document.documentElement.setAttribute('data-theme', currentTheme);
        themeChips.forEach(chip => chip.classList.remove('active'));
        themeChips.forEach(chip => {
            if (chip.dataset.t === currentTheme) chip.classList.add('active');
            chip.onclick = () => {
                const theme = chip.dataset.t;
                document.documentElement.setAttribute('data-theme', theme);
                localStorage.setItem('polarlog_theme', theme);
                themeChips.forEach(c => c.classList.remove('active'));
                chip.classList.add('active');
            };
        });

        // Overlay Picker Logic - Context Aware
        const overlayPanel = document.getElementById('overlay-picker');
        const overlayGrid  = document.getElementById('overlay-grid');
        
        let activeOverlayId = localStorage.getItem('polarlog_overlay') || 'dark';
        let active3DOverlayId = localStorage.getItem('polarlog_3d_overlay') || 'globe-day';

        // RE-CALIBRATION PULSE: Force to 'dark' if we were mis-aligned by previous turns
        if (localStorage.getItem('polarlog_recalibrated_v2') !== 'true') {
            localStorage.setItem('polarlog_overlay', 'dark');
            localStorage.setItem('polarlog_recalibrated_v2', 'true');
            activeOverlayId = 'dark';
        }

        function renderOverlayGrid() {
            if (!overlayGrid) return;
            overlayGrid.innerHTML = '';
            
            const currentMode = globeVisible ? '3d' : '2d';
            const currentActive = globeVisible ? active3DOverlayId : activeOverlayId;
            
            const filtered = OVERLAY_PRESETS.filter(p => p.view === currentMode || p.view === 'both');
            
            filtered.forEach(preset => {
                const card = document.createElement('div');
                card.className = 'overlay-card' + (preset.id === currentActive ? ' active' : '');
                card.dataset.overlayId = preset.id;
                card.innerHTML = `
                    <div class="overlay-preview">
                        <img src="${preset.preview}" alt="${preset.name}" loading="lazy">
                    </div>
                    <span class="overlay-label">${preset.name}</span>`;
                    
                card.addEventListener('click', () => {
                    if (!globeVisible) {
                        // 2D Mode
                        mapEngine.setTileLayer(preset.url);
                        activeOverlayId = preset.id;
                        localStorage.setItem('polarlog_overlay', preset.id);
                    } else {
                        // 3D Mode
                        if (globeInstance) {
                            globeInstance.globeImageUrl(preset.texture);
                            active3DOverlayId = preset.id;
                            localStorage.setItem('polarlog_3d_overlay', preset.id);
                            forceGlobeRender();
                        }
                    }
                    
                    overlayGrid.querySelectorAll('.overlay-card').forEach(c => c.classList.remove('active'));
                    card.classList.add('active');
                });
                overlayGrid.appendChild(card);
            });
        }

        // Initialize grid on boot
        renderOverlayGrid();

        mapEngine.map.on('click', () => overlayPanel.classList.remove('visible'));
        document.getElementById('close-overlay-picker')?.addEventListener('click', () => overlayPanel.classList.remove('visible'));

        // Restore saved overlay
        // HARD RESET: If current is satellite but was meant to be dark baseline, we stay dark
        if (!localStorage.getItem('polarlog_overlay')) activeOverlayId = 'dark';
        
        if (activeOverlayId !== 'dark') {
            const saved = OVERLAY_PRESETS.find(p => p.id === activeOverlayId);
            if (saved) mapEngine.setTileLayer(saved.url);
        }

        const unitKmBtn = document.getElementById('unit-km'), unitMiBtn = document.getElementById('unit-mi');
        if (unitKmBtn && unitMiBtn) {
            const updateUnitUI = (unit) => {
                currentUnits = unit; localStorage.setItem('polarlog_units', unit);
                unitKmBtn.classList.toggle('active', unit === 'km'); unitMiBtn.classList.toggle('active', unit === 'mi');
                processQSOs(currentQSOs, false);
            };
            unitKmBtn.onclick = () => updateUnitUI('km');
            unitMiBtn.onclick = () => updateUnitUI('mi');
            updateUnitUI(currentUnits);
        }
        updateLoadingStatus(false);
    } catch (e) { console.error('INIT FAILURE:', e); }
});

function handleFiles(files) {
    const file = files[0]; if (!file) return;
    updateLoadingStatus(true, `Spectrum Analysis: ${file.name}...`, 10);
    const reader = new FileReader(); reader.onload = (e) => worker.postMessage({ action: 'parse', data: e.target.result }); reader.readAsText(file);
}

function finalizeParsedData(data) {
    const filter = document.getElementById('filter-dxcc');
    if (filter) {
        const dxccs = [...new Set(data.map(q => q.COUNTRY || q.DXCC).filter(Boolean))].sort();
        filter.innerHTML = '<option value="">All Countries</option>' + dxccs.map(d => `<option value="${d}">${d}</option>`).join('');
    }
    const dCount = new Set(data.map(q => q.COUNTRY || q.DXCC).filter(Boolean));
    const bCount = new Set(data.map(q => q.BAND?.toUpperCase()).filter(Boolean));
    const mCount = new Set(data.map(q => q.MODE).filter(Boolean));
    document.getElementById('stat-total').textContent = data.length;
    document.getElementById('stat-dxcc').textContent = dCount.size;
    document.getElementById('stat-bands').textContent = bCount.size;
    document.getElementById('stat-modes').textContent = mCount.size;
    mapEngine.fitBounds(); processQSOs(data, true, true); updateLoadingStatus(false);

    // If in globe mode, auto-enable clustering now that a log is loaded
    if (globeVisible) {
        const chkClusters = document.getElementById('chk-clusters');
        if (chkClusters && !chkClusters.checked) {
            chkClusters.checked = true;
            chkClusters.dispatchEvent(new Event('change'));
        }
    }
}

// ─── Screenshot Export ───────────────────────────────────────────────────────

const _CTRY_ABBR = {
    'England':'ENG','Scotland':'SCO','Wales':'WAL','Northern Ireland':'NIR','United Kingdom':'UK',
    'United States':'USA','United States Of America':'USA','Canada':'CAN','Mexico':'MEX',
    'Fed. Rep. of Germany':'GER','Germany':'GER','France':'FRA','Italy':'ITA','Spain':'ESP',
    'Portugal':'POR','Netherlands':'NLD','Belgium':'BEL','Switzerland':'SUI','Austria':'AUT',
    'Denmark':'DEN','Norway':'NOR','Sweden':'SWE','Finland':'FIN','Iceland':'ISL',
    'Ireland':'IRL','Luxembourg':'LUX',
    'Poland':'POL','Czech Republic':'CZE','Slovak Republic':'SVK','Hungary':'HUN',
    'Romania':'ROM','Bulgaria':'BGR','Greece':'GRE','Serbia':'SRB','Croatia':'HRV',
    'Slovenia':'SVN','Bosnia':'BIH','Montenegro':'MNE','Albania':'ALB','Kosovo':'KOS',
    'Latvia':'LVA','Lithuania':'LTU','Estonia':'EST','Ukraine':'UKR','Belarus':'BLR',
    'Moldova':'MDA','Georgia':'GEO','Armenia':'ARM','Azerbaijan':'AZE',
    'European Russia':'RUS','Asiatic Russia':'RUS','Russia':'RUS',
    'Kazakhstan':'KAZ','Uzbekistan':'UZB','Kyrgyzstan':'KGZ','Tajikistan':'TJK','Turkmenistan':'TKM',
    'Turkey':'TUR','Israel':'ISR','Saudi Arabia':'SAU','United Arab Emirates':'UAE',
    'Iraq':'IRQ','Iran':'IRN','Syria':'SYR','Jordan':'JOR','Lebanon':'LBN',
    'Kuwait':'KWT','Qatar':'QAT','Oman':'OMN','Yemen':'YEM','Afghanistan':'AFG',
    'Pakistan':'PAK','India':'IND','Bangladesh':'BGD','Sri Lanka':'LKA',
    'China':'CHN','Japan':'JPN','South Korea':'KOR','Republic of Korea':'KOR',
    'Taiwan':'TWN','Mongolia':'MNG','Vietnam':'VNM','Thailand':'THA',
    'Malaysia':'MYS','Indonesia':'IDN','Philippines':'PHL','Singapore':'SGP',
    'Australia':'AUS','New Zealand':'NZL','Papua New Guinea':'PNG','Fiji':'FJI',
    'Brazil':'BRA','Argentina':'ARG','Chile':'CHL','Colombia':'COL','Peru':'PER',
    'Venezuela':'VEN','Ecuador':'ECU','Bolivia':'BOL','Paraguay':'PRY','Uruguay':'URY',
    'Cuba':'CUB','Jamaica':'JAM','Puerto Rico':'PRI','Dominican Republic':'DOM',
    'Egypt':'EGY','Morocco':'MAR','Algeria':'DZA','Tunisia':'TUN','Libya':'LBY',
    'Nigeria':'NGA','South Africa':'SAF','Kenya':'KEN','Ethiopia':'ETH','Ghana':'GHA',
};
function _ctryAbbr(name) {
    if (!name) return '???';
    const u = name.toUpperCase();
    for (const [k, v] of Object.entries(_CTRY_ABBR)) {
        if (k.toUpperCase() === u) return v;
    }
    // Fallback: first 3 non-space chars
    return name.replace(/\s+/g, '').slice(0, 3).toUpperCase();
}

async function takeScreenshot(cameraView = false) {
    const modal  = document.getElementById('screenshot-modal');
    const status = document.getElementById('ss-status');
    const btnSave = document.getElementById('ss-save');
    if (btnSave) btnSave.disabled = true;
    status.textContent = 'Rendering…';

    const inclCallsign = document.getElementById('ss-callsign')?.checked;
    const inclStats    = document.getElementById('ss-stats')?.checked;
    const inclBands    = document.getElementById('ss-bands')?.checked;
    const inclDXCC     = document.getElementById('ss-dxcc')?.checked;
    const inclModes    = document.getElementById('ss-modes')?.checked;

    try {
        const rootStyle = getComputedStyle(document.documentElement);
        const cBg    = rootStyle.getPropertyValue('--bg').trim()   || '#080b12';
        const cSurf  = rootStyle.getPropertyValue('--surf').trim() || '#0f1624';
        const cAcc   = rootStyle.getPropertyValue('--acc').trim()  || '#38bdf8';
        const cText  = rootStyle.getPropertyValue('--text').trim() || '#e2e8f0';
        const cMuted = rootStyle.getPropertyValue('--muted').trim()|| '#64748b';
        const cBrd   = rootStyle.getPropertyValue('--brd').trim()  || '#1e293b';
        const scale  = window.devicePixelRatio || 1;

        // ── Build stat data (shared between 2D and 3D paths) ───────────────
        const call      = document.getElementById('my-call')?.value?.trim() || 'N/A';
        const grid      = document.getElementById('my-grid')?.value?.trim() || '';
        const totalQSOs = currentQSOs.length;
        const dCount    = new Set(currentQSOs.map(q => q.COUNTRY || q.DXCC).filter(Boolean)).size;
        const bCount    = new Set(currentQSOs.map(q => q.BAND?.toUpperCase()).filter(Boolean)).size;
        const mCount    = new Set(currentQSOs.map(q => q.MODE).filter(Boolean)).size;

        const bandCounts = {};
        currentQSOs.forEach(q => { const b = q.BAND?.toUpperCase(); if (b) bandCounts[b] = (bandCounts[b]||0)+1; });
        const bandsSorted = Object.entries(bandCounts).sort((a,b) => b[1]-a[1]).slice(0,8);

        const dxccCounts = {};
        currentQSOs.forEach(q => { const c = q.COUNTRY||q.DXCC||''; if(c) dxccCounts[c]=(dxccCounts[c]||0)+1; });
        const dxccSorted = Object.entries(dxccCounts).sort((a,b)=>b[1]-a[1]).slice(0,8);

        const modeCounts = {};
        currentQSOs.forEach(q => { const m = q.MODE||''; if(m) modeCounts[m]=(modeCounts[m]||0)+1; });
        const modesSorted = Object.entries(modeCounts).sort((a,b)=>b[1]-a[1]).slice(0,6);

        // ── Pre-load flag images for countries section ───────────────────────
        const flagImgs = {};
        if (inclDXCC && dxccSorted.length) {
            await Promise.all(dxccSorted.map(([c]) => {
                const iso = DXCC_MAP[c.toUpperCase()];
                if (!iso) return Promise.resolve();
                return new Promise(resolve => {
                    const img = new Image();
                    img.crossOrigin = 'anonymous';
                    img.onload  = () => { flagImgs[c] = img; resolve(); };
                    img.onerror = () => resolve();
                    img.src = `https://flagcdn.com/w40/${iso}.png`;
                });
            }));
        }

        // ── Shared drawing helpers (used by both 2D and 3D side panel) ──────
        const PAD  = 18;
        const LINE = 20;
        const GAP  = 14;
        const HEAD = 28;
        const PW   = 260;

        const drawLegend = (ctx, lxL, outH) => {
            let cy = PAD;

            const drawHeading = (txt) => {
                ctx.font = `700 10px "JetBrains Mono", monospace`;
                ctx.fillStyle = cAcc;
                ctx.fillText(txt.toUpperCase(), lxL + PAD, cy + 10);
                cy += HEAD;
                ctx.strokeStyle = cBrd; ctx.lineWidth = 0.5;
                ctx.beginPath(); ctx.moveTo(lxL + PAD, cy - 4); ctx.lineTo(lxL + PW - PAD, cy - 4); ctx.stroke();
            };
            const drawRow = (label, value, valColor) => {
                ctx.font = `400 10px "DM Sans", sans-serif`; ctx.fillStyle = cMuted;
                ctx.fillText(label, lxL + PAD, cy + 11);
                ctx.font = `700 10px "JetBrains Mono", monospace`; ctx.fillStyle = valColor || cText;
                const vw = ctx.measureText(value).width;
                ctx.fillText(value, lxL + PW - PAD - vw, cy + 11);
                cy += LINE;
            };
            const drawBar = (label, value, max, color) => {
                ctx.font = `400 9px "JetBrains Mono", monospace`; ctx.fillStyle = cMuted;
                ctx.fillText(label, lxL + PAD, cy + 10);
                const bx = lxL + PAD + 54, bmw = PW - PAD * 2 - 54 - 28;
                const bw = Math.max(2, (value / max) * bmw);
                ctx.fillStyle = color + '33';
                ctx.beginPath(); if (ctx.roundRect) ctx.roundRect(bx, cy+3, bmw, 10, 2); else ctx.rect(bx,cy+3,bmw,10); ctx.fill();
                ctx.fillStyle = color;
                ctx.beginPath(); if (ctx.roundRect) ctx.roundRect(bx, cy+3, bw, 10, 2); else ctx.rect(bx,cy+3,bw,10); ctx.fill();
                ctx.font = `700 9px "JetBrains Mono", monospace`; ctx.fillStyle = cText;
                const vw = ctx.measureText(String(value)).width;
                ctx.fillText(String(value), lxL + PW - PAD - vw, cy + 10);
                cy += LINE;
            };

            if (inclCallsign) {
                drawHeading('Station');
                ctx.font = `700 14px "JetBrains Mono", monospace`; ctx.fillStyle = cAcc;
                ctx.fillText(call, lxL + PAD, cy + 13); cy += LINE;
                if (grid) { ctx.font = `400 10px "JetBrains Mono", monospace`; ctx.fillStyle = cMuted; ctx.fillText(grid, lxL + PAD, cy + 11); cy += LINE; }
                cy += GAP;
            }
            if (inclStats) {
                drawHeading('Statistics');
                drawRow('Total QSOs', String(totalQSOs), cAcc);
                drawRow('DXCC Entities', String(dCount), cAcc);
                drawRow('Bands Used', String(bCount));
                drawRow('Modes Used', String(mCount));
                cy += GAP;
            }
            if (inclBands && bandsSorted.length) {
                drawHeading('Bands');
                const bMax = bandsSorted[0][1];
                bandsSorted.forEach(([b, n]) => drawBar(b, n, bMax, BAND_COLORS[b] || cAcc));
                cy += GAP;
            }
            if (inclDXCC && dxccSorted.length) {
                drawHeading('Countries Worked');
                const dMax = dxccSorted[0][1];
                dxccSorted.forEach(([c, n]) => {
                    const flagImg = flagImgs[c];
                    if (flagImg) {
                        const FW = 20, FH = 13;
                        ctx.save();
                        ctx.beginPath();
                        if (ctx.roundRect) ctx.roundRect(lxL + PAD, cy + 2, FW, FH, 2); else ctx.rect(lxL + PAD, cy + 2, FW, FH);
                        ctx.clip();
                        ctx.drawImage(flagImg, lxL + PAD, cy + 2, FW, FH);
                        ctx.restore();
                        const nameX = lxL + PAD + FW + 4;
                        const nameLabel = _ctryAbbr(c);
                        ctx.font = `400 9px "JetBrains Mono", monospace`; ctx.fillStyle = cMuted;
                        ctx.fillText(nameLabel, nameX, cy + 10);
                        const bx = lxL + PAD + FW + 4 + 48, bmw = PW - PAD * 2 - FW - 4 - 48 - 28;
                        const bw = Math.max(2, (n / dMax) * bmw);
                        ctx.fillStyle = cAcc + '33';
                        ctx.beginPath(); if (ctx.roundRect) ctx.roundRect(bx, cy+3, bmw, 10, 2); else ctx.rect(bx,cy+3,bmw,10); ctx.fill();
                        ctx.fillStyle = cAcc;
                        ctx.beginPath(); if (ctx.roundRect) ctx.roundRect(bx, cy+3, bw, 10, 2); else ctx.rect(bx,cy+3,bw,10); ctx.fill();
                        ctx.font = `700 9px "JetBrains Mono", monospace`; ctx.fillStyle = cText;
                        const vw = ctx.measureText(String(n)).width;
                        ctx.fillText(String(n), lxL + PW - PAD - vw, cy + 10);
                        cy += LINE;
                    } else {
                        drawBar(_ctryAbbr(c), n, dMax, cAcc);
                    }
                });
                cy += GAP;
            }
            if (inclModes && modesSorted.length) {
                drawHeading('Modes');
                const mMax = modesSorted[0][1];
                modesSorted.forEach(([m, n]) => drawBar(m, n, mMax, '#a78bfa'));
                cy += GAP;
            }

            ctx.font = `400 8px "JetBrains Mono", monospace`; ctx.fillStyle = cMuted + '88';
            ctx.fillText('polarplot.net', PAD, outH - 8);
        };

        const download = (canvas) => {
            const link = document.createElement('a');
            link.download = `polarlog-${call}-${new Date().toISOString().slice(0,10)}.png`;
            link.href = canvas.toDataURL('image/png');
            link.click();
        };

        if (globeVisible && globeInstance) {
            // ════════════════════════════════════════════════════════════════
            // GLOBE MODE — WebGL + HTML dots, side legend panel same as 2D
            // ════════════════════════════════════════════════════════════════

            const savedPov = globeInstance.pointOfView();
            const globeEl  = document.getElementById('globe-container');

            // Veil hides camera movement from user while we reposition for capture
            const _veil = document.createElement('div');
            _veil.style.cssText = `position:fixed;inset:0;z-index:9999997;pointer-events:none;background:${cBg};`;
            document.body.appendChild(_veil);

            if (!cameraView) {
                globeInstance.resumeAnimation();
                globeInstance.pointOfView({ lat: 20, lng: 0, altitude: 2.5 }, 0);
                await new Promise(r => setTimeout(r, 180)); // let globe.gl reposition HTML dots
            }
            // Freeze the globe so damping doesn't drift during capture
            globeInstance.pauseAnimation();
            await new Promise(r => requestAnimationFrame(r)); // flush last frame

            status.textContent = 'Capturing globe…';
            globeInstance.renderer().render(globeInstance.scene(), globeInstance.camera());
            const glCanvas = globeInstance.renderer().domElement;

            // WebGL renderer runs at pixelRatio=1 (CSS pixels), so scale up to
            // match html2canvas HiDPI output — gives the legend the same height as 2D
            const mapW = glCanvas.width  * scale;
            const mapH = glCanvas.height * scale;

            status.textContent = 'Capturing dots…';
            const dotsCanvas = await html2canvas(globeEl, {
                useCORS: true, allowTaint: true,
                backgroundColor: null,
                width: globeEl.offsetWidth, height: globeEl.offsetHeight,
                scale,
                logging: false,
                ignoreElements: el => el.id === 'globe-arc-overlay'
            });

            // Restore camera, remove veil, then resume so user can interact
            if (!cameraView) {
                globeInstance.pointOfView(savedPov, 0);
                globeInstance.renderer().render(globeInstance.scene(), globeInstance.camera());
            }
            document.body.removeChild(_veil);
            globeInstance.resumeAnimation();
            setTimeout(() => globeInstance.pauseAnimation(), 800);

            const outW = mapW + PW * scale;
            const outH = mapH;
            const out  = document.createElement('canvas');
            out.width  = outW;
            out.height = outH;
            const ctx  = out.getContext('2d');

            // Globe (WebGL stretched to HiDPI size) + dots layer
            ctx.fillStyle = cBg;
            ctx.fillRect(0, 0, outW, outH);
            ctx.drawImage(glCanvas, 0, 0, mapW, mapH);
            ctx.drawImage(dotsCanvas, 0, 0, mapW, mapH);

            // Legend panel — same as 2D
            ctx.fillStyle = cSurf;
            ctx.fillRect(mapW, 0, PW * scale, outH);
            ctx.strokeStyle = cBrd; ctx.lineWidth = scale;
            ctx.beginPath(); ctx.moveTo(mapW, 0); ctx.lineTo(mapW, outH); ctx.stroke();

            ctx.save();
            ctx.scale(scale, scale);
            drawLegend(ctx, mapW / scale, outH / scale);
            ctx.restore();

            status.textContent = 'Saving…';
            download(out);

        } else {
            // ════════════════════════════════════════════════════════════════
            // 2D MAP MODE — side legend panel
            // ════════════════════════════════════════════════════════════════

            if (!cameraView) {
                mapEngine.map.setView([20, 0], 2);
                await new Promise(r => setTimeout(r, 900));
            }

            status.textContent = 'Capturing map…';
            const mapEl = document.getElementById('map');
            const mapCanvas = await html2canvas(mapEl, {
                useCORS: true, allowTaint: true,
                backgroundColor: cBg,
                scale,
                logging: false
            });

            const mapW = mapCanvas.width;
            const mapH = mapCanvas.height;

            // outH matches the map exactly — legend scrolls within the same height
            const outW = mapW + PW * scale;
            const outH = mapH;
            const out  = document.createElement('canvas');
            out.width  = outW;
            out.height = outH;
            const ctx  = out.getContext('2d');

            ctx.fillStyle = cBg;
            ctx.fillRect(0, 0, outW, outH);
            ctx.drawImage(mapCanvas, 0, 0, mapW, mapH);

            ctx.fillStyle = cSurf;
            ctx.fillRect(mapW, 0, PW * scale, outH);
            ctx.strokeStyle = cBrd; ctx.lineWidth = scale;
            ctx.beginPath(); ctx.moveTo(mapW, 0); ctx.lineTo(mapW, outH); ctx.stroke();

            ctx.save();
            ctx.scale(scale, scale);
            drawLegend(ctx, mapW / scale, outH / scale);
            ctx.restore();

            status.textContent = 'Saving…';
            download(out);
        }

        modal.style.display = 'none';
    } catch (err) {
        console.error('Screenshot failed:', err);
        status.textContent = 'Export failed: ' + err.message;
    } finally {
        if (btnSave) btnSave.disabled = false;
    }
}

// ─── 3D Globe ────────────────────────────────────────────────────────────────

function toggleGlobe() {
    const mapEl    = document.getElementById('map');
    const globeEl  = document.getElementById('globe-container');
    globeVisible   = !globeVisible;
    
    document.body.classList.toggle('globe-active', globeVisible);

    if (globeVisible) {
        mapEl.style.display   = 'none';
        globeEl.classList.add('active');
        document.getElementById('overlay-picker')?.classList.remove('visible');
        // Dismiss 2D contact cards and any open popup
        mapEngine.map.closePopup();
        document.getElementById('history-panel')?.classList.remove('visible');

        // Always enforce paths off + clustering on when entering globe
        const chkPaths    = document.getElementById('chk-paths');
        const chkClusters = document.getElementById('chk-clusters');
        if (chkPaths && chkPaths.checked) {
            chkPaths.checked = false;
            chkPaths.dispatchEvent(new Event('change'));
        }
        const chkPathHoverGlobe = document.getElementById('chk-path-hover');
        if (chkPathHoverGlobe && chkPathHoverGlobe.checked) {
            chkPathHoverGlobe.checked = false;
            chkPathHoverGlobe.dispatchEvent(new Event('change'));
        }
        if (currentQSOs.length && chkClusters && !chkClusters.checked) {
            chkClusters.checked = true;
            chkClusters.dispatchEvent(new Event('change'));
        }

        if (typeof showTacticalToast === 'function') {
            if (!localStorage.getItem('polarlog_cluster_toast_shown')) {
                showTacticalToast('<b>Cluster Mode</b> is highly recommended for optimal performance when using the 3D Globe with large datasets.', 6000);
                localStorage.setItem('polarlog_cluster_toast_shown', '1');
            }
        }

        if (!globeInitialized) {
            initGlobe(globeEl);
            globeInitialized = true;

            // Wire globe-specific buttons after the bar exists
            document.getElementById('globe-btn-arcs')?.addEventListener('click', function() {
                const chk = document.getElementById('chk-paths');
                if (chk) { chk.checked = !chk.checked; chk.dispatchEvent(new Event('change')); }
            });
            document.getElementById('globe-btn-toggle')?.addEventListener('click', toggleGlobe);
            document.getElementById('globe-btn-daynight')?.addEventListener('click', function() {
                globeDayMode = !globeDayMode;
                const url = globeDayMode
                    ? 'https://unpkg.com/three-globe@2/example/img/earth-blue-marble.jpg'
                    : 'https://unpkg.com/three-globe@2/example/img/earth-night.jpg';
                globeInstance?.globeImageUrl(url);
                forceGlobeRender();
            });
            document.getElementById('globe-btn-fpv')?.addEventListener('click', function() {
                globeFPVMode ? exitGlobeFPV() : enterGlobeFPV();
            });
        } else {
            globeInstance.width(globeEl.offsetWidth).height(globeEl.offsetHeight);
            updateGlobeData();
        }
    } else {
        globeEl.classList.remove('active');
        mapEl.style.display = '';
        mapEngine.map.invalidateSize();
        document.getElementById('overlay-picker')?.classList.remove('visible');
        // Dismiss 3D globe popup and contact cards
        hideGlobePopup();
        document.getElementById('history-panel')?.classList.remove('visible');
    }
}

function showGlobeArcLoading() {
    const stages = [
        { pct: 8,  msg: 'Collecting contact coordinates...' },
        { pct: 20, msg: 'Calculating great-circle trajectories...' },
        { pct: 34, msg: 'Projecting arcs onto sphere surface...' },
        { pct: 48, msg: 'Resolving geodesic path geometry...' },
        { pct: 60, msg: 'Mapping signal propagation routes...' },
        { pct: 72, msg: 'Binding arc data to renderer...' },
        { pct: 83, msg: 'Optimising arc resolution...' },
        { pct: 93, msg: 'Uploading geometry to GPU...' },
        { pct: 100, msg: 'Contact paths ready.' },
    ];

    const bar = document.getElementById('loading-progress-bar');
    if (bar) { bar.style.transition = 'none'; bar.style.width = '0%'; }

    updateLoadingStatus(true, stages[0].msg, 0);

    const interval = 7000 / stages.length;
    stages.forEach((stage, i) => {
        setTimeout(() => updateLoadingStatus(true, stage.msg, stage.pct), i * interval);
    });

    setTimeout(() => {
        updateLoadingStatus(false);
        showTacticalToast('Contact lines may re-render on zoom — this is normal.', 6000);
    }, 7000);
}

function forceGlobeRender() {
    if (!globeInstance) return;
    let frames = 0;
    const kick = () => {
        globeInstance.renderer().render(globeInstance.scene(), globeInstance.camera());
        if (++frames < 20) requestAnimationFrame(kick);
    };
    requestAnimationFrame(kick);
}

function initGlobe(el) {
    if (!window.Globe) { console.warn('Globe.gl not loaded'); return; }

    const cur3DId = localStorage.getItem('polarlog_3d_overlay') || 'globe-day';
    const activePreset = OVERLAY_PRESETS.find(p => p.id === cur3DId) || OVERLAY_PRESETS.find(p => p.view === '3d');
    
    // Default to the texture defined in the context-aware preset
    const globeImg = activePreset ? activePreset.texture : 'https://unpkg.com/three-globe@2/example/img/earth-blue-marble.jpg';

    const bgImg = 'https://unpkg.com/three-globe@2/example/img/night-sky.png';

    globeInstance = Globe({
        rendererConfig: {
            antialias: false,
            powerPreference: 'high-performance',
            precision: 'mediump', // Optimized for integrated graphics stability
            stencil: false,       // Save memory overhead
            preserveDrawingBuffer: true // Needed for PNG screenshot export
        }
    })(el)
        .width(el.offsetWidth)
        .height(el.offsetHeight)
        .globeImageUrl(globeImg)
        .backgroundImageUrl(bgImg)
        .showAtmosphere(false)
        .onPointClick((point, event) => {
            if (!point.isHome) showGlobePopup(point, event.clientX, event.clientY);
        })
        .onGlobeClick(() => { if (Date.now() - _globePopupTs > 120) hideGlobePopup(); })
        .onArcClick((arc, event) => {
            if (!arc) return;
            const contact = _globeContactList.find(c => c.call === arc.label);
            if (contact) showGlobePopup(
                { ...contact, clusterSize: 1, qsoData: contact.qsos },
                event.clientX, event.clientY
            );
        })
        .onArcHover((arc) => {
            const tooltip = document.getElementById('path-distance-tooltip');
            if (!tooltip) return;
            if (!document.getElementById('chk-path-hover')?.checked) return;
            if (arc) {
                const toRad = d => d * Math.PI / 180;
                const dlat = toRad(arc.endLat - arc.startLat);
                const dlon = toRad(arc.endLng - arc.startLng);
                const a = Math.sin(dlat/2)**2 + Math.cos(toRad(arc.startLat)) * Math.cos(toRad(arc.endLat)) * Math.sin(dlon/2)**2;
                const distKm = 2 * 6371 * Math.asin(Math.sqrt(a));
                const kmEl = document.getElementById('path-distance-km');
                const miEl = document.getElementById('path-distance-mi');
                if (kmEl) kmEl.textContent = distKm.toFixed(0) + ' km';
                if (miEl) miEl.textContent = '/ ' + (distKm * 0.621371).toFixed(0) + ' mi';
                tooltip.style.display = 'block';
            } else {
                tooltip.style.display = 'none';
            }
        });

    el.addEventListener('mousemove', (e) => {
        const tooltip = document.getElementById('path-distance-tooltip');
        if (tooltip && tooltip.style.display === 'block') {
            tooltip.style.left = (e.clientX + 14) + 'px';
            tooltip.style.top  = (e.clientY - 10) + 'px';
        }
    });

    globeInstance.controls().enableDamping   = true;
    globeInstance.controls().dampingFactor   = 0.08;
    globeInstance.controls().rotateSpeed     = 0.6;
    globeInstance.controls().minDistance     = 101; 
    globeInstance.controls().maxDistance     = 450;

    // Fixed pixel ratio — no per-frame resize calls
    globeInstance.renderer().setPixelRatio(1);

    // Pause Globe.gl render loop when idle — CSS animations keep running on the
    // compositor so dots still pulse, but Globe.gl stops recalculating HTML element
    // transforms every frame → near-zero overhead when not dragging
    let _idleTimer;
    const _ctrl = globeInstance.controls();
    _ctrl.addEventListener('start', () => {
        clearTimeout(_idleTimer);
        globeInstance.resumeAnimation();
    });
    _ctrl.addEventListener('end', () => {
        // Don't set idle timer here — damping keeps firing 'change' after release,
        // so we let the change listener handle the pause once motion truly stops
    });

    // Re-cluster on zoom + reset idle timer on every change (covers damping deceleration)
    let _lastCellDeg = null;
    let _zoomDebounce;
    globeInstance.controls().addEventListener('change', () => {
        clearTimeout(_idleTimer);
        clearTimeout(_zoomDebounce);
        _idleTimer = setTimeout(() => globeInstance.pauseAnimation(), 800);
        _zoomDebounce = setTimeout(() => {
            const alt = globeInstance.pointOfView().altitude;
            const cell = alt > 3 ? 6 : alt > 1.5 ? 4 : alt > 0.8 ? 2 : alt > 0.3 ? 1 : alt > 0.15 ? 0.5 : 0;
            if (cell !== _lastCellDeg) { _lastCellDeg = cell; updateGlobeDots(); }
        }, 200);

        // Track + fade popup as globe orbits
        if (_globePopupGeoPoint) {
            const popup = document.getElementById('globe-popup');
            if (popup && popup.style.display !== 'none') {
                if (!_isGlobePointVisible(_globePopupGeoPoint.lat, _globePopupGeoPoint.lng)) {
                    popup.style.opacity = '0';
                    setTimeout(() => { hideGlobePopup(); }, 260);
                } else {
                    const pos = _globeProject(_globePopupGeoPoint.lat, _globePopupGeoPoint.lng);
                    if (pos) {
                        const W = 240, pad = 12;
                        let x = pos.x + 14;
                        let y = pos.y - 20;
                        if (x + W > window.innerWidth - pad) x = pos.x - W - 14;
                        if (y + 180 > window.innerHeight - pad) y = window.innerHeight - 180 - pad;
                        if (y < pad) y = pad;
                        popup.style.left = x + 'px';
                        popup.style.top  = y + 'px';
                    }
                }
            }
        }
    });

    // ── GL-based Point Interactions ──────────────────────────────────────────
    globeInstance
        .onPointClick((point, event) => {
            if (!point.isHome) showGlobePopup(point, event.clientX, event.clientY);
        });
    
    // Trackpad / Scroll Lock — prevent whole page from zooming
    // CAPTURE: TRUE allows the globe to zoom even if the mouse is over HTML dots
    el.addEventListener('wheel', e => {
        if (globeVisible) e.preventDefault();
    }, { passive: false, capture: true });


    updateGlobeData();

    // Fly to home on first load
    const hLat = parseFloat(document.getElementById('my-lat')?.value) || 0;
    const hLon = parseFloat(document.getElementById('my-lon')?.value) || 0;
    if (hLat || hLon) globeInstance.pointOfView({ lat: hLat, lng: hLon, altitude: 2.2 }, 1200);
}

function hexAlpha(hex, a) {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return `rgba(${r},${g},${b},${a})`;
}

// Globe dot clustering — cell size shrinks as user zooms in so clusters break apart
function buildGlobeDots(contactList, cellDeg = 4) {
    const CELL = cellDeg;
    const grid = {};
    contactList.forEach(c => {
        const key = `${Math.round(c.lat / CELL) * CELL},${Math.round(c.lng / CELL) * CELL}`;
        if (!grid[key]) grid[key] = { latSum: 0, lngSum: 0, totalQSOs: 0, stations: 0, bands: {}, items: [] };
        const g = grid[key];
        g.latSum += c.lat; g.lngSum += c.lng;
        g.totalQSOs += c.count; g.stations++;
        g.bands[c.band] = (g.bands[c.band] || 0) + c.count;
        g.items.push(c);
    });
    const cells = Object.values(grid).map(cell => {
        const n = cell.stations;
        const topBand = Object.entries(cell.bands).sort((a, b) => b[1] - a[1])[0]?.[0] || '';
        const single = n === 1 ? cell.items[0] : null;
        return {
            lat: cell.latSum / n, lng: cell.lngSum / n,
            color: BAND_COLORS[topBand] || '#38bdf8',
            clusterSize: n, count: cell.totalQSOs, band: topBand,
            qsoData: single?.qsos || null,
            call: single?.call || null, country: single?.country || null
        };
    });
    const clusters    = cells.filter(c => c.clusterSize > 1).sort((a, b) => b.count - a.count).slice(0, 200);
    const individuals = cells.filter(c => c.clusterSize === 1);
    return [...clusters, ...individuals];
}


// ── Shared contact cache — rebuilt by updateGlobeData, read by dots/arcs ─────
let _globeContactList = [];
let _globeHLat = 0, _globeHLon = 0, _globeHasHome = false;
let _globePopupTs = 0;
let _globePopupGeoPoint = null; // { lat, lng } of currently open popup contact

function _rebuildGlobeContacts() {
    const homeLoc = mapEngine?.homeLocation;
    _globeHLat = homeLoc?.[0] || 0;
    _globeHLon = homeLoc?.[1] || 0;
    _globeHasHome = !!(_globeHLat || _globeHLon);
    const contacts = {};
    currentQSOs.forEach(q => {
        if (!q.LAT || !q.LON) return;
        if (searchQuery && !q.CALL.toUpperCase().startsWith(searchQuery)) return;
        if (selectedDXCC && (q.COUNTRY || q.DXCC) !== selectedDXCC) return;
        if (!activeBands.has(q.BAND?.toUpperCase())) return;
        if (!contacts[q.CALL]) contacts[q.CALL] = {
            lat: parseFloat(q.LAT), lng: parseFloat(q.LON),
            call: q.CALL, country: q.COUNTRY || q.DXCC || '',
            band: q.BAND?.toUpperCase() || '', count: 0, qsos: []
        };
        contacts[q.CALL].count++;
        contacts[q.CALL].qsos.push(q);
    });
    _globeContactList = Object.values(contacts);
}

// Rebuilds only the HTML dots — called on zoom change and cluster toggle
function updateGlobeDots() {
    if (!globeInstance || !_globeContactList.length) return;

    const alt = globeInstance.pointOfView().altitude;
    const isFiltered = !!(searchQuery || selectedDXCC);
    const cellDeg = isFiltered ? 0 : (alt > 3 ? 6 : alt > 1.5 ? 4 : alt > 0.8 ? 2 : alt > 0.3 ? 1 : alt > 0.15 ? 0.5 : 0);
    const clusteringOn = !isFiltered && (document.getElementById('chk-clusters')?.checked ?? true);

    const rawContacts = _globeContactList.map(c => ({
        lat: c.lat, lng: c.lng, color: BAND_COLORS[c.band] || '#38bdf8',
        clusterSize: 1, count: c.count, band: c.band,
        qsoData: c.qsos, call: c.call, country: c.country
    }));
    const dotList = (!clusteringOn || cellDeg === 0)
        ? rawContacts
        : buildGlobeDots(_globeContactList, cellDeg);

    globeInstance.pointsData([]);
    const homeEntry = _globeHasHome ? [{ lat: _globeHLat, lng: _globeHLon, isHome: true }] : [];
    globeInstance
        .htmlElementsData([...homeEntry, ...dotList])
        .htmlElement(d => {
            const el = document.createElement('div');
            if (d.isHome) {
                el.className = 'globe-qth-dot';
            } else {
                const color = d.color || '#38bdf8';
                const isCluster = d.clusterSize > 1;
                const size = isCluster ? Math.min(30, 10 + d.clusterSize * 1.4) : 8;
                const num  = isCluster ? d.clusterSize : d.count > 1 ? d.count : null;

                el.className = 'globe-contact-dot';
                el.style.cssText = `width:${size}px;height:${size}px;background:${color};box-shadow:0 0 ${isCluster ? 9 : 5}px ${color}bb;`;

                if (num) {
                    const lbl = document.createElement('span');
                    lbl.className = 'globe-dot-count';
                    lbl.textContent = num > 99 ? '99+' : num;
                    el.appendChild(lbl);
                }

                el.addEventListener('click', e => {
                    e.stopPropagation();
                    showGlobePopup(d, e.clientX, e.clientY);
                });

                el.addEventListener('wheel', e => {
                    e.preventDefault();
                    globeInstance?.renderer().domElement.dispatchEvent(new WheelEvent('wheel', {
                        deltaX: e.deltaX, deltaY: e.deltaY, deltaZ: e.deltaZ,
                        deltaMode: e.deltaMode, ctrlKey: e.ctrlKey,
                        bubbles: true, cancelable: true
                    }));
                }, { passive: false });
            }
            return el;
        })
        .htmlLat(d => d.lat)
        .htmlLng(d => d.lng);
}

// Rebuilds only arcs — called on paths toggle only, never on zoom
function updateGlobeArcs() {
    if (!globeInstance) return;
    const arcsOn = document.getElementById('chk-paths')?.checked ?? false;
    if (_globeHasHome && arcsOn) {
        const arcs = _globeContactList.map(c => ({
            startLat: _globeHLat, startLng: _globeHLon,
            endLat: c.lat, endLng: c.lng,
            color: hexAlpha(BAND_COLORS[c.band] || '#38bdf8', 0.55),
            label: c.call
        }));
        globeInstance
            .arcsData(arcs)
            .arcStartLat(d => d.startLat).arcStartLng(d => d.startLng)
            .arcEndLat(d => d.endLat).arcEndLng(d => d.endLng)
            .arcColor(d => d.color)
            .arcAltitudeAutoScale(0.32).arcStroke(0.7).arcResolution(16)
            .arcDashLength(1).arcDashGap(0).arcDashAnimateTime(0)
            .arcLabel(d => d.label);
    } else {
        globeInstance.arcsData([]);
    }
    requestAnimationFrame(() => requestAnimationFrame(() => globeInstance.renderer().render(globeInstance.scene(), globeInstance.camera())));
}

function updateGlobeData() {
    if (!globeInstance || !currentQSOs.length) return;
    globeInstance.resumeAnimation();
    _rebuildGlobeContacts();
    updateGlobeDots();
    updateGlobeArcs();
}

// Projects a globe lat/lng to screen coordinates using the camera matrices.
// Uses globe.gl's own polar2Cartesian convention:
//   phi   = PI * (0.5 - lat/180)
//   theta = 2*PI * (0.25 - lng/360)
//   x = R*sin(phi)*cos(theta), y = R*cos(phi), z = R*sin(phi)*sin(theta)
function _globeProject(lat, lng) {
    if (!globeInstance) return null;
    // Use built-in if available (globe.gl >= 2.26)
    if (typeof globeInstance.getScreenCoords === 'function') {
        const s = globeInstance.getScreenCoords(lat, lng, 0);
        if (!s) return null;
        const rect = globeInstance.renderer().domElement.getBoundingClientRect();
        return { x: s.x + rect.left, y: s.y + rect.top };
    }
    const R = 100;
    const phi   = Math.PI * (0.5 - lat / 180);
    const theta = 2 * Math.PI * (0.25 - lng / 360);
    const x3 = R * Math.sin(phi) * Math.cos(theta);
    const y3 = R * Math.cos(phi);
    const z3 = R * Math.sin(phi) * Math.sin(theta);
    const v = globeInstance.camera().matrixWorldInverse.elements;
    const p = globeInstance.camera().projectionMatrix.elements;
    const cx = v[0]*x3 + v[4]*y3 + v[8]*z3  + v[12];
    const cy = v[1]*x3 + v[5]*y3 + v[9]*z3  + v[13];
    const cz = v[2]*x3 + v[6]*y3 + v[10]*z3 + v[14];
    const cw = v[3]*x3 + v[7]*y3 + v[11]*z3 + v[15];
    const clipX = p[0]*cx + p[4]*cy + p[8]*cz  + p[12]*cw;
    const clipY = p[1]*cx + p[5]*cy + p[9]*cz  + p[13]*cw;
    const clipW = p[3]*cx + p[7]*cy + p[11]*cz + p[15]*cw;
    if (Math.abs(clipW) < 1e-10) return null;
    const rect = globeInstance.renderer().domElement.getBoundingClientRect();
    return {
        x: (clipX / clipW + 1) / 2 * rect.width  + rect.left,
        y: (-clipY / clipW + 1) / 2 * rect.height + rect.top
    };
}

// ─── Globe Popup ─────────────────────────────────────────────────────────────

function showGlobePopup(point, clientX, clientY) {
    const popup   = document.getElementById('globe-popup');
    const inner   = document.getElementById('globe-popup-inner');
    if (!popup || !inner) return;

    const homeLoc = mapEngine?.homeLocation;
    const hLat = homeLoc?.[0] || 0;
    const hLon = homeLoc?.[1] || 0;

    if (point.clusterSize > 1 && !point.qsoData) {
        // Fly into cluster — pick next finer zoom tier
        hideGlobePopup();
        const curAlt = globeInstance.pointOfView().altitude;
        const targetAlt = curAlt > 3 ? 2.0
            : curAlt > 1.5 ? 0.9
            : curAlt > 0.8 ? 0.4
            : curAlt > 0.3 ? 0.18
            : curAlt > 0.15 ? 0.08
            : 0.04;
        globeInstance.resumeAnimation();
        globeInstance.pointOfView({ lat: point.lat, lng: point.lng, altitude: targetAlt }, 1200);
        setTimeout(() => { _rebuildGlobeContacts(); updateGlobeDots(); }, 1300); // arcs stay intact
        return;
    } else {
        // Single station card — resolve full QSO history
        const qsoHistory = point.qsoData?.length
            ? point.qsoData
            : currentQSOs.filter(q => q.CALL === (point.call || ''));
        const qso     = qsoHistory[0] || {};
        const call    = point.call || qso.CALL || 'N/A';
        const country = point.country || qso.COUNTRY || qso.DXCC || 'Unknown';
        const band    = (point.band || qso.BAND || 'N/A').toUpperCase();
        const mode    = qso.MODE || 'N/A';
        const bandColor = BAND_COLORS[band] || 'var(--acc)';
        const iso     = DXCC_MAP[(country).toUpperCase()] || getISOFromCallsign(call);
        const flagHtml = iso ? buildFlagImg(iso, country, 40, 'width:100%;height:100%;object-fit:cover;border-radius:2px;') : '📡';

        let distStr = '';
        if (hLat && hLon && qso.LAT && qso.LON)
            distStr = `${calculateDistance(hLat, hLon, parseFloat(qso.LAT), parseFloat(qso.LON), currentUnits).toFixed(0)} ${currentUnits}`;

        const formatDate = raw => (!raw || raw.length < 8) ? null
            : `${raw.slice(6,8)}-${['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC'][+raw.slice(4,6)-1]||'?'}-${raw.slice(0,4)}`;
        const formatTime = raw => (!raw || raw.length < 4) ? '' : ` ${raw.slice(0,2)}:${raw.slice(2,4)}z`;
        const lastDate = formatDate(qso.QSO_DATE);
        const lastTime = lastDate ? formatTime(qso.TIME_ON) : '';

        inner.innerHTML = `
          <div class="globe-popup-header">
            <div class="globe-popup-flag">${flagHtml}</div>
            <div>
              <div class="globe-popup-call" style="color:${bandColor}">${qrzLink(call, call)}</div>
              <div class="globe-popup-country">${country}</div>
            </div>
          </div>
          <div class="globe-popup-body">
            ${distStr ? `<div class="globe-popup-row"><span>Range</span><span class="globe-popup-val" style="color:${bandColor};font-weight:700;">${distStr}</span></div>` : ''}
            <div class="globe-popup-row"><span>Band</span><span class="globe-popup-val" style="color:${bandColor};font-weight:600;">${band}</span></div>
            <div class="globe-popup-row"><span>Mode</span><span class="globe-popup-val">${mode}</span></div>
            <div class="globe-popup-row"><span>Grid</span><span class="globe-popup-val">${qso.GRIDSQUARE || 'N/A'}</span></div>
            ${lastDate ? `<div class="globe-popup-row"><span>Last QSO</span><span class="globe-popup-val">${lastDate}${lastTime}</span></div>` : ''}
            <div class="globe-popup-row"><span>QSOs</span><span class="globe-popup-val" style="color:${bandColor};font-weight:700;">${qsoHistory.length}</span></div>
          </div>
          <div style="padding:4px 14px 12px;">
            <button class="globe-popup-hist-btn" style="width:100%;padding:7px;background:color-mix(in srgb,${bandColor},transparent 88%);border:1px solid ${bandColor};color:${bandColor};border-radius:4px;cursor:pointer;font-family:var(--font-mono);font-size:0.72rem;font-weight:600;">📜 Show All QSOs</button>
          </div>`;

        inner.querySelector('.globe-popup-hist-btn').addEventListener('click', () => {
            hideGlobePopup();
            showHistoryPanel(qsoHistory);
        });
    }

    _globePopupTs = Date.now();
    _globePopupGeoPoint = { lat: point.lat, lng: point.lng };
    popup.style.opacity = '1';
    popup.style.display = 'block';
    popup.style.zIndex  = '2147483647'; // Force on top
    
    // Position near click, keep within viewport
    const W = 240, pad = 12;
    let x = clientX + 14;
    let y = clientY - 20;
    if (x + W > window.innerWidth - pad) x = clientX - W - 14;
    if (y + 180 > window.innerHeight - pad) y = window.innerHeight - 180 - pad;
    if (y < pad) y = pad;

    popup.style.left    = x + 'px';
    popup.style.top     = y + 'px';
    popup.style.display = 'block';
}

function hideGlobePopup() {
    const popup = document.getElementById('globe-popup');
    if (popup) popup.style.display = 'none';
    _globePopupGeoPoint = null;
}

// Returns true if the lat/lng point is on the visible hemisphere facing the camera
function _isGlobePointVisible(lat, lng) {
    if (!globeInstance) return true;
    const phi   = (90 - lat) * Math.PI / 180;
    const theta = (lng + 180) * Math.PI / 180;
    const px = -Math.sin(phi) * Math.cos(theta);
    const py =  Math.cos(phi);
    const pz =  Math.sin(phi) * Math.sin(theta);
    const cam = globeInstance.camera().position;
    return (px * cam.x + py * cam.y + pz * cam.z) > 0;
}

// ─── Tactical Advisory ───────────────────────────────────────────────────────

let toastTimeout = null;
function showTacticalToast(msg, duration = 6000) {
    const toast = document.getElementById('tactical-toast');
    const msgEl = document.getElementById('tactical-toast-msg');
    if (!toast || !msgEl) return;

    if (toastTimeout) clearTimeout(toastTimeout);
    
    msgEl.innerHTML = msg;
    toast.classList.add('active');
    
    toastTimeout = setTimeout(() => {
        toast.classList.remove('active');
    }, duration);
}

// ─── Globe FPV ───────────────────────────────────────────────────────────────

function enterGlobeFPV() {
    if (!globeInstance) return;
    const homeLoc = mapEngine?.homeLocation;
    const hLat = homeLoc?.[0] || 0;
    const hLon = homeLoc?.[1] || 0;

    globeFPVMode = true;
    globePreFPVPov = globeInstance.pointOfView();
    hideGlobePopup();

    // Lock zoom to surface level (globe radius ≈ 100 scene units)
    const ctrl = globeInstance.controls();
    ctrl._fpvMinDist = ctrl.minDistance;
    ctrl._fpvMaxDist = ctrl.maxDistance;
    ctrl.minDistance = 101.5;
    ctrl.maxDistance = 101.5;

    // High quality while in FPV
    globeInstance.renderer().setPixelRatio(Math.min(window.devicePixelRatio, 3));

    globeInstance.pointOfView({ lat: hLat || 0, lng: hLon || 0, altitude: 0.015 }, 1400);

    document.getElementById('globe-btn-fpv')?.classList.add('active');
    document.getElementById('globe-fpv-hint').style.display = 'block';
}

function exitGlobeFPV() {
    if (!globeInstance) return;
    globeFPVMode = false;

    const ctrl = globeInstance.controls();
    if (ctrl._fpvMinDist !== undefined) {
        ctrl.minDistance = ctrl._fpvMinDist;
        ctrl.maxDistance = ctrl._fpvMaxDist;
    }

    globeInstance.renderer().setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
    globeInstance.pointOfView(globePreFPVPov || { altitude: 2.2 }, 1200);

    document.getElementById('globe-btn-fpv')?.classList.remove('active');
    document.getElementById('globe-fpv-hint').style.display = 'none';
}

// ─── Stats Panels ────────────────────────────────────────────────────────────

function openStatsPanel(type) {
    if (!currentQSOs.length) return;
    document.querySelectorAll('.stats-modal.visible').forEach(p => p.classList.remove('visible'));
    const panel = document.getElementById(`panel-${type}`);
    const content = document.getElementById(`panel-${type}-content`);
    if (!panel || !content) return;
    const renders = { total: renderTotalPanel, dxcc: renderDXCCPanel, bands: renderBandsPanel, modes: renderModesPanel };
    renders[type]?.(content);
    panel.classList.add('visible');
    document.getElementById('stats-backdrop').classList.add('visible');
}

function closeStatsPanels() {
    document.querySelectorAll('.stats-modal.visible').forEach(p => p.classList.remove('visible'));
    document.getElementById('stats-backdrop').classList.remove('visible');
}

function renderTotalPanel(container) {
    const groups = {};
    currentQSOs.forEach(q => {
        if (!groups[q.CALL]) groups[q.CALL] = {
            call: q.CALL, country: q.COUNTRY || q.DXCC || '',
            band: q.BAND || '--', mode: q.MODE || '--',
            count: 0, lastDate: '', lastTime: ''
        };
        groups[q.CALL].count++;
        if ((q.QSO_DATE || '') > groups[q.CALL].lastDate) {
            groups[q.CALL].lastDate = q.QSO_DATE || '';
            groups[q.CALL].lastTime = q.TIME_ON || '';
        }
    });

    const data = Object.values(groups);
    data.sort((a, b) => {
        const av = a[totalSortCol], bv = b[totalSortCol];
        if (totalSortCol === 'count') return (bv - av) * totalSortDir;
        if (typeof av === 'string') return av.localeCompare(bv) * totalSortDir;
        return (av - bv) * totalSortDir;
    });

    const arrow = col => totalSortCol === col
        ? `<span class="sort-arrow">${totalSortDir === 1 ? '↑' : '↓'}</span>` : '';

    const formatDate = raw => (!raw || raw.length < 8) ? '--'
        : `${raw.slice(6,8)}-${['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC'][+raw.slice(4,6)-1]||'?'}-${raw.slice(0,4)}`;
    const formatTime = raw => (!raw || raw.length < 4) ? '' : `${raw.slice(0,2)}:${raw.slice(2,4)}z`;

    const rows = data.map(s => {
        const iso = (DXCC_MAP[(s.country || '').toUpperCase()] || getISOFromCallsign(s.call) || '').toLowerCase();
        const flagHtml = buildFlagImg(iso, s.country, 40, 'height:13px;border-radius:2px;vertical-align:middle;margin-right:5px;', "this.onerror=null;this.style.display='none';");
        const bandColor = BAND_COLORS[s.band?.toUpperCase()] || 'var(--acc)';
        return `<tr>
            <td style="color:var(--acc);font-weight:bold;">${qrzLink(s.call, s.call)}</td>
            <td>${flagHtml}${s.country || ISO_TO_NAME[iso] || ''}</td>
            <td style="color:${bandColor};font-weight:bold;">${s.band}</td>
            <td>${s.mode}</td>
            <td>${formatDate(s.lastDate)}${s.lastTime ? `<br><span style="font-size:0.7em;color:var(--muted);">${formatTime(s.lastTime)}</span>` : ''}</td>
            <td>${s.count > 1 ? `<span style="color:var(--acc);font-weight:bold;">×${s.count}</span>` : '1'}</td>
        </tr>`;
    }).join('');

    container.innerHTML = `<div style="overflow-y:auto;max-height:62vh;">
        <table class="stats-table">
            <thead><tr>
                <th data-sort="call">Callsign${arrow('call')}</th>
                <th data-sort="country">Country${arrow('country')}</th>
                <th data-sort="band">Band${arrow('band')}</th>
                <th data-sort="mode">Mode${arrow('mode')}</th>
                <th data-sort="lastDate">Last QSO${arrow('lastDate')}</th>
                <th data-sort="count">QSOs${arrow('count')}</th>
            </tr></thead>
            <tbody>${rows}</tbody>
        </table>
    </div>`;

    container.querySelectorAll('th[data-sort]').forEach(th => {
        th.addEventListener('click', () => {
            const col = th.dataset.sort;
            if (totalSortCol === col) {
                const defaultDir = (col === 'count' || col === 'lastDate') ? -1 : 1;
                if (totalSortDir === -defaultDir) { totalSortCol = 'count'; totalSortDir = -1; }
                else { totalSortDir *= -1; }
            } else {
                totalSortCol = col;
                totalSortDir = (col === 'count' || col === 'lastDate') ? -1 : 1;
            }
            renderTotalPanel(container);
        });
    });
}

function renderDXCCPanel(container) {
    const counts = {};
    const sampleCall = {};
    currentQSOs.forEach(q => {
        const key = q.COUNTRY || q.DXCC || 'Unknown';
        counts[key] = (counts[key] || 0) + 1;
        if (!sampleCall[key]) sampleCall[key] = q.CALL || '';
    });
    const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]);
    const max = sorted[0]?.[1] || 1;
    const rows = sorted.map(([country, count]) => {
        const iso = (DXCC_MAP[country.toUpperCase()] || getISOFromCallsign(sampleCall[country]) || '').toLowerCase();
        const pct = (count / max * 100).toFixed(1);
        const flag = iso
            ? buildFlagImg(iso, country, 40, 'width:30px;height:21px;object-fit:cover;border-radius:3px;flex-shrink:0;', "this.onerror=null;this.style.display='none';")
            : `<div style="width:30px;height:21px;background:var(--brd);border-radius:3px;flex-shrink:0;"></div>`;
        return `<div class="stats-row">
            ${flag}
            <span style="flex:1;font-size:0.78rem;font-family:var(--font-mono);">${country}</span>
            <div class="stats-bar-track"><div class="stats-bar-fill" style="width:${pct}%;background:var(--acc);"></div></div>
            <span style="color:var(--acc);font-family:var(--font-mono);font-size:0.75rem;min-width:32px;text-align:right;font-weight:bold;">${count}</span>
        </div>`;
    }).join('');
    container.innerHTML = `<div style="overflow-y:auto;max-height:62vh;">${rows}</div>`;
}

function renderBandsPanel(container) {
    const counts = {};
    currentQSOs.forEach(q => {
        const band = q.BAND?.toUpperCase() || 'UNKNOWN';
        counts[band] = (counts[band] || 0) + 1;
    });
    const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]);
    const max = sorted[0]?.[1] || 1;
    const rows = sorted.map(([band, count]) => {
        const color = BAND_COLORS[band] || 'var(--acc)';
        const pct = (count / max * 100).toFixed(1);
        return `<div class="stats-row">
            <div style="width:12px;height:12px;border-radius:50%;background:${color};box-shadow:0 0 8px ${color};flex-shrink:0;"></div>
            <span style="font-family:var(--font-mono);font-size:0.82rem;font-weight:bold;color:${color};min-width:68px;">${band}</span>
            <div class="stats-bar-track"><div class="stats-bar-fill" style="width:${pct}%;background:${color};"></div></div>
            <span style="color:var(--acc);font-family:var(--font-mono);font-size:0.75rem;min-width:32px;text-align:right;font-weight:bold;">${count}</span>
        </div>`;
    }).join('');
    container.innerHTML = `<div style="overflow-y:auto;max-height:62vh;">${rows}</div>`;
}

function renderModesPanel(container) {
    const counts = {};
    currentQSOs.forEach(q => {
        const mode = q.MODE || 'UNKNOWN';
        counts[mode] = (counts[mode] || 0) + 1;
    });
    const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]);
    const max = sorted[0]?.[1] || 1;
    const rows = sorted.map(([mode, count]) => {
        const pct = (count / max * 100).toFixed(1);
        return `<div class="stats-row">
            <span style="font-family:var(--font-mono);font-size:0.82rem;font-weight:bold;color:var(--text);min-width:80px;">${mode}</span>
            <div class="stats-bar-track"><div class="stats-bar-fill" style="width:${pct}%;background:var(--acc);"></div></div>
            <span style="color:var(--acc);font-family:var(--font-mono);font-size:0.75rem;min-width:32px;text-align:right;font-weight:bold;">${count}</span>
        </div>`;
    }).join('');
    container.innerHTML = `<div style="overflow-y:auto;max-height:62vh;">${rows}</div>`;
}

let _processQSOsTimer = null;
let _pathsDirty = true; // when true, next _doProcessQSOs will rebuild 2D paths from scratch
function processQSOs(qsos, shouldFitBounds = false, rebuildPaths = false) {
    if (!mapEngine) return;
    if (rebuildPaths) _pathsDirty = true;
    clearTimeout(_processQSOsTimer);
    _processQSOsTimer = setTimeout(() => _doProcessQSOs(qsos, shouldFitBounds), 0);
}
function _doProcessQSOs(qsos, shouldFitBounds) {
    if (!mapEngine) return;
    const doPaths = _pathsDirty;
    // Always clear markers so old ones never persist
    mapEngine.clear();
    if (doPaths) {
        mapEngine.clearPaths();
        _pathsDirty = false;
    }
    // Only rebuild paths into the layer when flagged dirty
    mapEngine._skipPathBuild = !doPaths;
    const filtered = qsos.filter(q => {
        const mSearch = !searchQuery || q.CALL.toUpperCase().startsWith(searchQuery);
        const mDXCC = !selectedDXCC || (q.COUNTRY || q.DXCC) === selectedDXCC;
        const mBand = activeBands.has(q.BAND?.toUpperCase());
        return mSearch && mDXCC && mBand;
    });
    const groups = {};
    filtered.forEach(q => {
        const key = `${q.CALL}-${q.GRIDSQUARE || Number(q.LAT).toFixed(3)}`;
        if (!groups[key]) groups[key] = [];
        groups[key].push(q);
    });
    const hLat = parseFloat(document.getElementById('my-lat').value) || 0;
    const hLon = parseFloat(document.getElementById('my-lon').value) || 0;
    Object.values(groups).forEach(history => {
        const latest = history[0];
        if (latest.LAT && latest.LON) {
            let distStr = '';
            if (hLat && hLon) distStr = `${calculateDistance(hLat, hLon, parseFloat(latest.LAT), parseFloat(latest.LON), currentUnits).toFixed(0)} ${currentUnits}`;
            const iso = DXCC_MAP[(latest.COUNTRY || '').toUpperCase()]
                || getISOFromCallsign(latest.CALL)
                || DXCC_MAP[latest.DXCC]
                || getISOFromCoords(parseFloat(latest.LAT), parseFloat(latest.LON));
            const cName = latest.COUNTRY || latest.DXCC || ISO_TO_NAME[iso] || 'Unknown Station';
            const flagHtml = iso ? buildFlagImg(iso, cName, 160, 'width:100%;height:100%;object-fit:cover;border-radius:2px;', "this.onerror=null;this.src='';this.parentElement.innerHTML='📡';") : '📡';
            mapEngine.plotQSO(history, BAND_COLORS[latest.BAND?.toUpperCase()] || '#38bdf8', { tactical: { dist: distStr, flagHtml, name: cName } });
        }
    });
    if (shouldFitBounds) mapEngine.fitBounds();
    if (typeof isResolving !== 'undefined' && isResolving) return;
    if (globeVisible && globeInstance) updateGlobeData();
    updateLoadingStatus(false);
}

function showHistoryPanel(history) {
    const latest = history[0];
    const homeLoc = mapEngine?.homeLocation;
    const hLat = homeLoc?.[0] || parseFloat(document.getElementById('my-lat').value) || 0;
    const hLon = homeLoc?.[1] || parseFloat(document.getElementById('my-lon').value) || 0;
    document.getElementById('hist-call').innerHTML = qrzLink(latest.CALL, latest.CALL);
    document.getElementById('hist-total').textContent = history.length;
    const loc = latest.COUNTRY || latest.DXCC || '';
    const locEl = document.getElementById('hist-location');
    if (locEl) locEl.textContent = loc || 'Biography Vault';
    const distEl = document.getElementById('hist-dist');
    if (distEl && hLat && hLon && latest.LAT && latest.LON)
        distEl.textContent = `${calculateDistance(hLat, hLon, parseFloat(latest.LAT), parseFloat(latest.LON), currentUnits).toFixed(0)} ${currentUnits}`;
    else if (distEl) distEl.textContent = 'N/A';
    const formatDate = (raw) => { if (!raw || raw.length !== 8) return raw; return `${raw.substring(6,8)}-${['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC'][parseInt(raw.substring(4,6))-1] || '??'}-${raw.substring(0,4)}`; };
    document.getElementById('qso-history-body').innerHTML = history.slice(0, 100).map(q => {
        let distStr = '--'; if (q.LAT && q.LON && hLat && hLon) distStr = `${calculateDistance(hLat, hLon, parseFloat(q.LAT), parseFloat(q.LON), currentUnits).toFixed(0)} ${currentUnits}`;
        return `<tr style="border-bottom: 1px solid var(--brd2);"><td style="padding: 8px; font-size: 0.75rem;">${formatDate(q.QSO_DATE)}</td><td style="padding: 8px; font-weight: bold; color: ${BAND_COLORS[q.BAND?.toUpperCase()] || 'var(--acc)'};">${q.BAND} / ${q.MODE}</td><td style="padding: 8px;">${q.RST_SENT || '--'}</td><td style="padding: 8px; color: var(--acc);">${distStr}</td></tr>`;
    }).join('');
    document.getElementById('history-panel').classList.add('visible');
}

function updateLoadingStatus(act, msg = '', per = 0) {
    const o = document.getElementById('loading-overlay'); if (!o) return;
    o.classList.toggle('active', act);
    if (msg) document.getElementById('loading-status').textContent = msg;
    if (per) document.getElementById('loading-progress-bar').style.width = per + '%';
}

function maidenheadToCoords(grid) {
    if (!grid || grid.length < 4) return null;
    grid = grid.toUpperCase();
    const lon = (grid.charCodeAt(0) - 65) * 20 - 180 + (parseInt(grid[2]) * 2) + (grid.length >= 6 ? (grid.charCodeAt(4) - 65) * (2/24) + (1/24) : 1);
    const lat = (grid.charCodeAt(1) - 65) * 10 - 90 + parseInt(grid[3]) + (grid.length >= 6 ? (grid.charCodeAt(5) - 65) * (1/24) + (0.5/24) : 0.5);
    return { lat, lon };
}
