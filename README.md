<img width="3093" height="1080" alt="polarplot" src="https://github.com/user-attachments/assets/618dd639-6027-4974-b59e-8dea3173c6e8" />

---

Polarplot is a browser-based ADIF log visualizer for amateur radio operators. Drop in your log file, set your home location, and watch every QSO you've ever made render as an interactive dot on a world map, or a spinning 3D globe. Filter by band, drill into contact history, resolve missing coordinates from QRZ, and export a screenshot worth framing. Designed & Created by M7PXZ.

Live at **[https://polarplot.net](https://polarplot.net)**

Live demo: **[Showcase Video](https://www.youtube.com/watch?v=MATlVQjMNnM)**

---

## Features

<br><br>
  
### 📂 Log Import

<img src="https://github.com/user-attachments/assets/1c413ead-72a0-49d8-be61-1aacf6e97491" width="779" height="461">

- Drag-and-drop or file-select any standard **ADIF** file (`.adi`, `.adif`)
- Parses in a **dedicated Web Worker** — the UI never freezes, even on logs with thousands of QSOs
- Chunked streaming parse with live progress indicator
- Compatible with all major logging software: **WSJTX**, **WSJT-X**, **Log4OM**, **HAMRS**, **JS8Call**, **DXKeeper**, and any other ADIF-compliant exporter
- Optional **QRZ Logbook** import — pull your entire online logbook directly via the QRZ API


---
<br><br>


### 🗺️ 2D Map

<img src="https://github.com/user-attachments/assets/385c1208-764c-41b0-98e6-08deefbed7d0" width="779" height="461">
  
- **Interactive Leaflet map** with five switchable base layers:
  - Dark Matter (CartoDB) — clean tactical dark theme
  - Arctic White (CartoDB) — high contrast light theme
  - Open Streets (OpenStreetMap)
  - **Satellite** — Esri ArcGIS World Imagery (Maxar/Airbus composite)
  - **Topographic** — Esri ArcGIS World Topo
  <br><br>
- **Marker clustering** — thousands of contacts render instantly; clusters drill down on click
- Toggle between clustered and standalone (canvas-accelerated) marker modes
- **Great circle paths** — geodesic lines from your home QTH to every contact, rendered once and cached (no re-render on zoom or filter changes)
- Path distance tooltip on hover (km / mi)
- Animated **home beacon** that scales with zoom level
- `preferCanvas: true` for hardware-accelerated marker rendering


---
<br><br>


### 🌍 3D Globe

<img src="https://github.com/user-attachments/assets/76a4304b-3ac1-4ce4-ac43-3ce532268573" width="779" height="461">
  
- Powered by **Globe.gl** (Three.js WebGL)
- Switch between **Day** (Blue Marble NASA texture) and **Night** (city lights texture) views
- **Contact arcs** — animated geodesic lines flying from your QTH to every worked station
- **FPV Mode** — first-person perspective, locks your home location to the bottom of the globe
- Smooth camera controls with inertia and damping
- Click any contact dot or arc for the full station popup


---
<br><br>


### 🔥 Signal Heatmap

[PHOTO PLACEHOLDER]

- **Heat Intensity Rendering** — Visualizes signal strength using a color gradient from deep blue (weak) to blazing red (extremely strong)
- **Automatic Scaling** — Supports both FT8/FT4 SNR (-30 to +20dB) and standard Voice/CW RS (11 to 59) reports
- **Sent vs Received Mode** — Toggle the map live to see how *well* you were heard versus how *well* you were hearing others
- **Location Calibration** — Intelligent deduplication ensures that high-density cities show their **best** signal quality rather than just summing up station density
- **Recency Filter** — Heatmap data is pulled from the most recent QSO at each location to reveal current propagation trends


---
<br><br>


### 📋 Contact Cards & Popups

<img src="https://github.com/user-attachments/assets/e28c781d-ace7-445e-b43e-aef4fa39c0fa" width="779" height="461">
  
- Every callsign is a **clickable QRZ hyperlink** — one click opens the station's QRZ page in a new tab
- Shows: callsign, country + flag, band, mode, grid square, last QSO date/time, total QSO count
- **Full QSO history** panel — see every individual contact with that station, sorted by date
- Popups work identically in 2D map view, 3D globe view, and the stats panel


---
<br><br>

### 📡 Band Filtering

<img src="https://github.com/user-attachments/assets/1ed47bad-8252-4445-a437-76e575d5eefc" width="779" height="461">
  
- Per-band toggle chips for every amateur band (160m → 70cm and beyond)
- Each band has a unique accent color carried through markers, paths, arcs, and popups
- Band filter state persists across sessions via localStorage


---
<br><br>


### 📊 Stats Panel — All Contacts

<img src="https://github.com/user-attachments/assets/dfa942f3-f7ef-4995-94d2-f64b37156ba9" width="779" height="461">

- Sortable table of every unique callsign worked
- Columns: callsign, country (flag + name), band, mode, last QSO date, QSO count
- Full-text search across callsigns, countries, bands, and modes
- Country names resolved from callsign prefix when not present in the log (covers WSJTX-style logs)

---
<br><br>


### 🔍 QRZ Integration

<img src="https://github.com/user-attachments/assets/cb39705c-8b7c-4eaf-8e05-a1a53c339248" width="779" height="461">
  
- **RESOLVE MISSING / LOCATION DATA** — for contacts where your ADIF has no coordinates or grid square, Polarplot batch-queries QRZ to fill in lat/lon and country
- Falls back gracefully: QRZ lat/lon → grid square decode → skips if still unresolvable
- Session key caching — logs in once, reuses the session key for the entire batch
- Dedicated Cloudflare Worker proxy — no activation needed, works out of the box for all users
- Callsign deduplication — each unique station queried once, result applied to all matching QSOs
- Portable callsign support — /QRP, /P, /MM and other suffixes stripped before lookup so all variants resolve correctly


---
<br><br>

### 📍 Location Input

<img src="https://github.com/user-attachments/assets/72a8c9e4-62b9-4136-bf5a-0a784c086643" width="779" height="461">
  
- Set home QTH by **Maidenhead grid square** or **manual lat/lon**
- Auto-resolves your own callsign via QRZ to pre-fill home coordinates
- Home location persists in localStorage


---
<br><br>


### 🎨 Themes & Customization

<img src="https://github.com/user-attachments/assets/ef539e9a-5ee8-4e18-b148-ed7edda214bc" width="779" height="461">
  
- Multiple UI color themes selectable from the settings panel
- Accent color propagates to markers, paths, arcs, cluster icons, and popup highlights
- All preferences (theme, bands, units, map layer, clusters, paths) persist in localStorage


---
<br><br>


### 📸 Screenshot Export

<img width="779" height="461" alt="polarlog-M7PXZ-2026-04-04 (1)" src="https://github.com/user-attachments/assets/9d73a463-099d-4277-8eed-21af15a497e0" />

- Capture the current 2D map **or** 3D globe as a PNG
- Globe animation is paused and locked before capture — no motion blur or drift
- Options: full current view, or snap globe to your home QTH before capture
- Rendered at screen resolution via html2canvas (2D) and WebGL canvas capture (3D)


---
<br><br>

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

### 🔧 ADIF Parser
- Handles both spec-compliant multi-line ADIF and single-line WSJTX-style records
- Regex field extraction: `<FIELD:length>value` with optional type specifier
- Strips `<EOH>` headers, splits on `<EOR>` boundaries
- Runs in a dedicated `Worker` thread — parse of 10,000+ QSOs completes without blocking the UI

### 📌 Coordinate Resolution Pipeline
1. `LAT` / `LON` fields in ADIF (decimal or NSEW degree-minute format)
2. `GRIDSQUARE` → Maidenhead decode (4-char or 6-char precision)
3. QRZ XML lookup (requires API key)
4. Skip — contact plotted only when coordinates are available

### 〰️ Great Circle Paths
- Implemented via **Leaflet.Geodesic** — true great circle arcs, not straight lines
- Paths built once on first enable, then cached — zoom, cluster toggles, and band filters do not trigger a rebuild
- `_pathsDirty` flag controls when a full rebuild is needed (new log, new home location, resolve complete)
- `mapEngine.clear()` clears markers only; `mapEngine.clearPaths()` is called separately when dirty

### 🌐 Globe Arcs
- Three.js `QuadraticBezierCurve3` via Globe.gl arc layer
- Arc color inherits band color from the contact's band field
- Arcs rebuild independently from marker updates — cluster zoom-in does not trigger arc rebuild
- FPV mode repositions camera to home QTH coordinates at low altitude

### 🔵 Clustering
- `L.markerClusterGroup` with `chunkedLoading: true` and custom styled cluster icons
- Parallel layer system: cluster markers (SVG divIcon) for clustered mode, CircleMarkers for standalone mode
- Switching modes swaps layers without rebuilding marker data

### 🏳️ DXCC / Flag Resolution
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
3. Hit **Resolve Missing / Location Data** — the built-in Cloudflare proxy handles the rest, no setup required

---

Built for HAM radio operators, by HAM radio operators.
