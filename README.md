# POLARPLOT

**Ham Radio Contact Visualizer**

Polarplot is a browser-based ADIF log visualizer for amateur radio operators. Drop in your log file, set your home location, and watch every QSO you've ever made render as an interactive dot on a world map — or a spinning 3D globe. Filter by band, drill into contact history, resolve missing coordinates from QRZ, and export a screenshot worth framing.

Live at **[polarplot.net](https://polarplot.net)**

---

## Features

### Log Import
- Drag-and-drop or file-select any standard **ADIF** file (`.adi`, `.adif`)
- Parses in a **dedicated Web Worker** — the UI never freezes, even on logs with thousands of QSOs
- Chunked streaming parse with live progress indicator
- Compatible with all major logging software: **WSJTX**, **WSJT-X**, **Log4OM**, **HAMRS**, **JS8Call**, **DXKeeper**, and any other ADIF-compliant exporter
- Optional **QRZ Logbook** import — pull your entire online logbook directly via the QRZ API

### 2D Map
- **Interactive Leaflet map** with five switchable base layers:
  - Dark Matter (CartoDB) — clean tactical dark theme
  - Arctic White (CartoDB) — high contrast light theme
  - Open Streets (OpenStreetMap)
  - **Satellite** — Esri ArcGIS World Imagery (Maxar/Airbus composite)
  - **Topographic** — Esri ArcGIS World Topo
- **Marker clustering** — thousands of contacts render instantly; clusters drill down on click
- Toggle between clustered and standalone (canvas-accelerated) marker modes
- **Great circle paths** — geodesic lines from your home QTH to every contact, rendered once and cached (no re-render on zoom or filter changes)
- Path distance tooltip on hover (km / mi)
- Animated **home beacon** that scales with zoom level
- `preferCanvas: true` for hardware-accelerated marker rendering

### 3D Globe
- Powered by **Globe.gl** (Three.js WebGL)
- Switch between **Day** (Blue Marble NASA texture) and **Night** (city lights texture) views
- **Contact arcs** — animated geodesic lines flying from your QTH to every worked station
- **FPV Mode** — first-person perspective, locks your home location to the bottom of the globe
- Smooth camera controls with inertia and damping
- Click any contact dot or arc for the full station popup

### Contact Cards & Popups
- Every callsign is a **clickable QRZ hyperlink** — one click opens the station's QRZ page in a new tab
- Shows: callsign, country + flag, band, mode, grid square, last QSO date/time, total QSO count
- **Full QSO history** panel — see every individual contact with that station, sorted by date
- Popups work identically in 2D map view, 3D globe view, and the stats panel

### Band Filtering
- Per-band toggle chips for every amateur band (160m → 70cm and beyond)
- Each band has a unique accent color carried through markers, paths, arcs, and popups
- Band filter state persists across sessions via localStorage

### Stats Panel — All Contacts
- Sortable table of every unique callsign worked
- Columns: callsign, country (flag + name), band, mode, last QSO date, QSO count
- Full-text search across callsigns, countries, bands, and modes
- Country names resolved from callsign prefix when not present in the log (covers WSJTX-style logs)

### QRZ Integration
- **RESOLVE MISSING / LOCATION DATA** — for contacts where your ADIF has no coordinates or grid square, Polarplot batch-queries QRZ to fill in lat/lon and country
- Falls back gracefully: QRZ lat/lon → grid square decode → skips if still unresolvable
- Session key caching — logs in once, reuses the session key for the entire batch
- CORS proxy support for environments that need it

### Location Input
- Set home QTH by **Maidenhead grid square** or **manual lat/lon**
- Auto-resolves your own callsign via QRZ to pre-fill home coordinates
- Home location persists in localStorage

### Themes & Customization
- Multiple UI color themes selectable from the settings panel
- Accent color propagates to markers, paths, arcs, cluster icons, and popup highlights
- All preferences (theme, bands, units, map layer, clusters, paths) persist in localStorage

### Screenshot Export
- Capture the current 2D map **or** 3D globe as a PNG
- Globe animation is paused and locked before capture — no motion blur or drift
- Options: full current view, or snap globe to your home QTH before capture
- Rendered at screen resolution via html2canvas (2D) and WebGL canvas capture (3D)

---

## Technical Stack

| Layer | Technology |
|---|---|
| Build | **Vite** (ES modules, HMR) |
| Map | **Leaflet.js** + Leaflet.Geodesic + Leaflet.MarkerCluster |
| Globe | **Globe.gl** (Three.js / WebGL) |
| ADIF Parsing | **Web Worker** (non-blocking, chunked) |
| Coordinate Lookup | **QRZ XML API** + **QRZ Logbook API** |
| Tile Layers | CartoDB, OpenStreetMap, Esri ArcGIS |
| Fonts | JetBrains Mono, DM Sans (Google Fonts) |
| Screenshots | html2canvas + native WebGL canvas |
| Persistence | localStorage (no backend, no account required) |

### ADIF Parser
- Handles both spec-compliant multi-line ADIF and single-line WSJTX-style records
- Regex field extraction: `<FIELD:length>value` with optional type specifier
- Strips `<EOH>` headers, splits on `<EOR>` boundaries
- Runs in a dedicated `Worker` thread — parse of 10,000+ QSOs completes without blocking the UI

### Coordinate Resolution Pipeline
1. `LAT` / `LON` fields in ADIF (decimal or NSEW degree-minute format)
2. `GRIDSQUARE` → Maidenhead decode (4-char or 6-char precision)
3. QRZ XML lookup (requires API key)
4. Skip — contact plotted only when coordinates are available

### Great Circle Paths
- Implemented via **Leaflet.Geodesic** — true great circle arcs, not straight lines
- Paths built once on first enable, then cached — zoom, cluster toggles, and band filters do not trigger a rebuild
- `_pathsDirty` flag controls when a full rebuild is needed (new log, new home location, resolve complete)
- `mapEngine.clear()` clears markers only; `mapEngine.clearPaths()` is called separately when dirty

### Globe Arcs
- Three.js `QuadraticBezierCurve3` via Globe.gl arc layer
- Arc color inherits band color from the contact's band field
- Arcs rebuild independently from marker updates — cluster zoom-in does not trigger arc rebuild
- FPV mode repositions camera to home QTH coordinates at low altitude

### Clustering
- `L.markerClusterGroup` with `chunkedLoading: true` and custom styled cluster icons
- Parallel layer system: cluster markers (SVG divIcon) for clustered mode, CircleMarkers for standalone mode
- Switching modes swaps layers without rebuilding marker data

### DXCC / Flag Resolution
- ~430-entry prefix lookup table mapping callsign prefixes → ISO 3166-1 alpha-2 codes
- Covers standard prefixes, special event prefixes, and common exceptions
- Country name fallback via `ISO_TO_NAME` map when ADIF `COUNTRY` field is absent

---

## Getting Started

```bash
git clone https://github.com/your-username/polarplot.git
cd polarplot
npm install
npm run dev
```

Open `http://localhost:5173` in your browser.

### Build for production
```bash
npm run build
```

Output goes to `dist/` — deploy anywhere that serves static files.

---

## QRZ Setup (Optional)

To use coordinate resolution and logbook import:

1. Get a QRZ XML Data subscription at [qrz.com](https://www.qrz.com/page/xml_data.html)
2. Open Polarplot settings → enter your QRZ username, password, and API key
3. If running locally without a backend, set a CORS proxy (e.g. `https://cors-anywhere.herokuapp.com/`)

---

## License

MIT
