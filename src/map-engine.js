import 'leaflet.geodesic';
import { tileUrl, tileAttribution } from './map-tiles.js';
import 'leaflet.markercluster';
import './leaflet-heat.js';
import 'leaflet.markercluster/dist/MarkerCluster.css';
import 'leaflet.markercluster/dist/MarkerCluster.Default.css';

export class MapEngine {
  constructor(elementId) {
    this.map = L.map(elementId, {
      zoomControl: false,
      attributionControl: false,
      preferCanvas: true,
      minZoom: 2,
      worldCopyJump: true,
      maxBounds: [[-85, -Infinity], [85, Infinity]],
      maxBoundsViscosity: 1.0
    }).setView([20, 0], 2);

    // Small credit line, required by the CARTO / OpenStreetMap / Esri tile terms
    L.control.attribution({ position: 'bottomleft', prefix: false }).addTo(this.map);

    // Initialize Tiles
    this.tileLayer = null;
    this.setTileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png');

    // Initialize Cluster Group
    this.markers = L.markerClusterGroup({
        chunkedLoading: true,
        maxClusterRadius: 50,
        spiderfyOnMaxZoom: true,
        showCoverageOnHover: false,
        zoomToBoundsOnClick: true,    // TACTICAL DRILL-DOWN: Click to zoom in
        animate: true,
        iconCreateFunction: this.createClusterIcon
    }).addTo(this.map);

    this.paths = L.layerGroup(); // Initialize hidden by default
    this.standaloneMarkers = L.layerGroup();
    this.pathsVisible = false;
    this.pathHoverEnabled = false;
    this.heatLayer = null;
    this.heatVisible = false;

    this.clustersEnabled = true;
    this.markersVisible = true;

    // Add Zoom Control at bottom right
    this.homeLocation = null;
    this.homeMarker = null;

    // Near the poles the map can't pan any further north (maxBounds), so a popup above a
    // high-latitude dot gets cut off. When there's no room above, open it below the dot.
    this.map.on('popupopen', (e) => this._placePopup(e.popup));
    this.map.on('popupclose', (e) => {
      const el = e.popup.getElement();
      if (el?.classList.contains('popup-below')) {
        el.classList.remove('popup-below');
        e.popup.options.offset = e.popup._defaultOffset;
      }
    });

    this.map.on('zoomend', () => {
      if (this.homeMarker) this.updateHomeMarker();
      if (this._heatPoints) this._rebuildHeat();
    });
  }

  _placePopup(popup) {
    const el = popup.getElement();
    if (!el || el.classList.contains('popup-below')) return;
    const mapTop = this.map.getContainer().getBoundingClientRect().top;
    if (el.getBoundingClientRect().top >= mapTop + 8) return;
    // Leaflet anchors a popup's bottom edge to the point; push it down by its own height
    // plus room for the dot and the (flipped) tip
    popup._defaultOffset = popup.options.offset;
    popup.options.offset = L.point(0, el.offsetHeight + 49);
    el.classList.add('popup-below');
    popup.update();
  }

  setTileLayer(url, options = {}) {
    if (this.tileLayer) this.map.removeLayer(this.tileLayer);
    this.tileBaseUrl = url; // un-keyed URL, so other maps can reuse the same style
    this.tileLayer = L.tileLayer(tileUrl(url), {
      attribution: tileAttribution(url),
      maxZoom: 19,
      updateWhenIdle: false,
      updateWhenZooming: true,
      keepBuffer: 6,
      noWrap: false,
      ...options
    }).addTo(this.map);
    this.tileLayer.bringToBack();
  }

  setHomeLocation(lat, lon) {
    this.homeLocation = [parseFloat(lat), parseFloat(lon)];
    this.updateHomeMarker();
  }

  updateHomeMarker() {
      if (!this.homeLocation) return;
      
      if (this.homeMarker) {
          this.map.removeLayer(this.homeMarker);
      }

      const zoom = this.map.getZoom();
      const dotSize = Math.round(Math.max(10, Math.min(28, 10 + (zoom - 2) * 1.5)));
      const wrapSize = dotSize + 14;
      const icon = L.divIcon({
          className: 'beacon-pulse',
          html: `<div class="home-beacon" style="width:${dotSize}px;height:${dotSize}px;"></div>`,
          iconSize: [wrapSize, wrapSize],
          iconAnchor: [wrapSize / 2, wrapSize / 2]
      });

      this.homeMarker = L.marker(this.homeLocation, { 
          icon: icon,
          zIndexOffset: 9999
      }).addTo(this.map);

      this.homeMarker.on('click', () => {
          this.map.fire('homeclick');
      });
  }

  /**
   * Plot a single QSO on the map
   * @param {Object} qso 
   * @param {string} color (Optional) Hex color for markers/paths
   * @param {Object} options (Optional) Tactical options like flag ISO and distance
   */
  plotQSO(qso, color = '#38bdf8', options = {}) {
    const latest = Array.isArray(qso) ? qso[0] : qso;
    const historyCount = Array.isArray(qso) ? qso.length : 1;
    const lat = parseFloat(latest.LAT);
    const lon = parseFloat(latest.LON);
    const weight = options.weight || (options.tactical ? 3.5 : 1.5);

    const tactical = options.tactical || {};
    const cName    = tactical.name || latest.COUNTRY || latest.DXCC || 'Unknown Country';
    const flagHtml = tactical.flagHtml || '📡';
    const band     = latest.BAND || 'N/A';
    const mode     = latest.MODE || 'N/A';

    const _months  = ['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC'];
    const _fd      = raw => (!raw || raw.length < 8) ? null
        : `${raw.slice(6,8)}-${_months[+raw.slice(4,6)-1]||'?'}-${raw.slice(0,4)}`;
    const _ft      = raw => (!raw || raw.length < 4) ? '' : ` ${raw.slice(0,2)}:${raw.slice(2,4)}`;
    const lastDate = _fd(latest.QSO_DATE);
    const lastTime = lastDate ? _ft(latest.TIME_ON) : '';

    const popupContent = `
      <div class="globe-popup-header" style="position:relative;">
        <div class="globe-popup-flag">${flagHtml}</div>
        <div>
          <div class="globe-popup-call" style="color:${color}"><a href="https://www.qrz.com/db/${encodeURIComponent(latest.CALL)}" target="_blank" rel="noopener" style="color:inherit;text-decoration:none;">${latest.CALL}</a></div>
          <div class="globe-popup-country">${cName}</div>
        </div>
      </div>
      <div class="globe-popup-body">
        ${tactical.dist ? `<div class="globe-popup-row"><span>Range</span><span class="globe-popup-val" style="color:${color};font-weight:700;">${tactical.dist}</span></div>` : ''}
        <div class="globe-popup-row"><span>Band</span><span class="globe-popup-val" style="color:${color};font-weight:600;">${band}</span></div>
        <div class="globe-popup-row"><span>Mode</span><span class="globe-popup-val">${mode}</span></div>
        <div class="globe-popup-row"><span>Grid</span><span class="globe-popup-val">${latest.GRIDSQUARE || 'N/A'}</span></div>
        <div class="globe-popup-row"><span>Signal</span><span class="globe-popup-val">S: ${latest.RST_SENT || '--'} / R: ${latest.RST_RCVD || '--'}</span></div>
        ${lastDate ? `<div class="globe-popup-row"><span>Last QSO</span><span class="globe-popup-val">${lastDate}${lastTime}</span></div>` : ''}
        <div class="globe-popup-row"><span>QSOs</span><span class="globe-popup-val" style="color:${color};font-weight:700;">${historyCount}</span></div>
      </div>
      <div style="padding:4px 14px 12px;">
        <button class="scard-btn btn-show-history" style="width:100%;padding:7px;background:color-mix(in srgb,${color},transparent 88%);border:1px solid ${color};color:${color};border-radius:4px;cursor:pointer;font-family:var(--font-mono);font-size:0.72rem;font-weight:600;">📜 Show All QSOs</button>
      </div>
    `;

    // The standard Studio Dot Icon
    const dotIcon = L.divIcon({
        className: 'studio-dot-icon',
        html: `<div style="background: ${color}; border: 1px solid #fff; border-radius: 50%; width: 10px; height: 10px; box-shadow: 0 0 5px ${color};"></div>`,
        iconSize: [10, 10],
        iconAnchor: [5, 5]
    });

    // Create the cluster version (Marker-based for clustering)
    const clusterMarker = L.marker([lat, lon], { 
      icon: dotIcon,
      stationData: Array.isArray(qso) ? qso : [qso]
    });
    clusterMarker.bindPopup(() => popupContent);
    this.markers.addLayer(clusterMarker);

    // 2. The standalone version (CircleMarker-based for Native Canvas speed)
    const standaloneMarker = L.circleMarker([lat, lon], {
      radius: 6,
      fillColor: color,
      color: '#fff',
      weight: 1,
      opacity: 1,
      fillOpacity: 0.8,
      stationData: Array.isArray(qso) ? qso : [qso]
    });
    standaloneMarker.bindPopup(() => popupContent);
    this.standaloneMarkers.addLayer(standaloneMarker);

    // Interactive Trigger
    const onMarkerClick = (e) => {
        this.map.fire('stationclick', { data: e.target.options.stationData });
    };

    clusterMarker.on('click', onMarkerClick);
    standaloneMarker.on('click', onMarkerClick);

    // Draw Great Circle Path — only when visible and not a markers-only refresh
    if (this.homeLocation && this.pathsVisible && !this._skipPathBuild) {
        this.addPath(this.homeLocation, [lat, lon], color, Array.isArray(qso) ? qso : [qso], popupContent, weight);
    }
  }

  /**
   * Add a Geodesic (Great Circle) path between two points
   */
  addPath(start, end, color = '#38bdf8', stationData = null, popupHtml = null, weight = 1.5) {
      if (!L.geodesic) {
          console.warn('Leaflet.Geodesic not loaded, falling back to polyline');
          const path = L.polyline([start, end], {
              color: color,
              weight: weight,
              opacity: 0.3,
              dashArray: '5, 5'
          });
          this.paths.addLayer(path);
          return;
      }

      // Haversine distance in km
      const toRad = d => d * Math.PI / 180;
      const dlat = toRad(end[0] - start[0]);
      const dlon = toRad(end[1] - start[1]);
      const a = Math.sin(dlat/2)**2 + Math.cos(toRad(start[0])) * Math.cos(toRad(end[0])) * Math.sin(dlon/2)**2;
      const distKm = 2 * 6371 * Math.asin(Math.sqrt(a));
      const distMi = distKm * 0.621371;

      const path = L.geodesic([start, end], {
          weight: weight,
          opacity: 0.4,
          color: color,
          steps: 24,
          wrap: true
      });

      const tooltip = document.getElementById('path-distance-tooltip');
      path.on('mouseover', () => {
          if (!this.pathHoverEnabled || !tooltip) return;
          const kmEl = document.getElementById('path-distance-km');
          const miEl = document.getElementById('path-distance-mi');
          if (kmEl) kmEl.textContent = distKm.toFixed(0) + ' km';
          if (miEl) miEl.textContent = '/ ' + distMi.toFixed(0) + ' mi';
          tooltip.style.display = 'block';
      });
      path.on('mousemove', (e) => {
          if (!this.pathHoverEnabled || !tooltip) return;
          tooltip.style.left = (e.originalEvent.clientX + 14) + 'px';
          tooltip.style.top  = (e.originalEvent.clientY - 10) + 'px';
      });
      path.on('mouseout', () => {
          if (tooltip) tooltip.style.display = 'none';
      });

      if (stationData && popupHtml) {
          path.on('click', (e) => {
              if (tooltip) tooltip.style.display = 'none';
              const pop = L.popup({ className: 'leaflet-popup', maxWidth: 260 })
                  .setLatLng(e.latlng)
                  .setContent(popupHtml);
              pop._stationData = stationData;
              pop.openOn(this.map);
          });
      }

      this.paths.addLayer(path);
  }

  setPathHoverEnabled(val) {
      this.pathHoverEnabled = val;
  }

  /**
   * Toggle path visibility
   */
  setPathsVisible(visible) {
      this.pathsVisible = visible;
      if (visible) {
          this.map.addLayer(this.paths);
      } else {
          this.map.removeLayer(this.paths);
      }
  }

  /**
   * Toggle clustering
   */
  setClustersEnabled(enabled) {
      this.clustersEnabled = enabled;
      if (!this.markersVisible) return;

      if (enabled) {
          if (this.map.hasLayer(this.standaloneMarkers)) this.map.removeLayer(this.standaloneMarkers);
          if (!this.map.hasLayer(this.markers)) this.map.addLayer(this.markers);
      } else {
          if (this.map.hasLayer(this.markers)) this.map.removeLayer(this.markers);
          if (!this.map.hasLayer(this.standaloneMarkers)) this.map.addLayer(this.standaloneMarkers);
      }
  }

  /**
   * Show / hide all QSO dots (clustered or standalone)
   */
  setMarkersVisible(visible) {
      this.markersVisible = visible;
      if (visible) {
          this.setClustersEnabled(this.clustersEnabled);
      } else {
          if (this.map.hasLayer(this.markers)) this.map.removeLayer(this.markers);
          if (this.map.hasLayer(this.standaloneMarkers)) this.map.removeLayer(this.standaloneMarkers);
      }
  }

  /**
   * Clear markers only — paths are managed separately via clearPaths()
   */
  clear() {
    this.markers.clearLayers();
    this.standaloneMarkers.clearLayers();
  }

  /**
   * Clear paths layer only
   */
  clearPaths() {
    this.paths.clearLayers();
  }

  /**
   * Custom stylized cluster icon
   */
  createClusterIcon(cluster) {
      const childCount = cluster.getChildCount();
      return L.divIcon({
          html: `<div style="background: var(--acc-glow); border: 2px solid var(--acc); color: #ffffff; border-radius: 50%; width: 35px; height: 35px; display: flex; align-items: center; justify-content: center; font-weight: bold; font-family: var(--font-mono); box-shadow: 0 0 10px var(--acc-glow);">
                  ${childCount}
                </div>`,
          className: 'custom-cluster',
          iconSize: L.point(35, 35)
      });
  }

  /**
   * Auto-fit map to markers
   */
  setHeatmapData(points) {
    this._heatPoints = points || [];
    this._rebuildHeat();
  }

  _rebuildHeat() {
    if (this.heatLayer) { this.map.removeLayer(this.heatLayer); this.heatLayer = null; }
    if (!this._heatPoints || !this._heatPoints.length) { this.heatVisible = false; return; }
    const zoom = this.map.getZoom();

    // Aggregate at every zoom level — cell size matched to heat radius so blobs from
    // separate cells can't overlap and accumulate into false hotspots.
    // Without this, two adjacent strong contacts look much hotter than one identical contact.
    // No aggregation — _buildHeatPoints already gives exactly one point per visible dot.
    // Passing all points at every zoom level ensures every individual contact always
    // has a heat blob, including as clusters break apart when zooming in.
    const points = this._heatPoints;

    // High max zoomed out = cool/subtle. Low max zoomed in = warm/vivid.
    const max = Math.max(0.6, 4.2 - zoom * 0.3);

    // Dynamic Layering: At max zoom out, heatmap is on top. As you zoom in, dots are on top.
    const insertBefore = zoom > 3;

    this.heatLayer = L.heatLayer(points, {
        radius: 26, blur: 18, maxZoom: 6, max, pane: 'overlayPane', insertBefore,
        gradient: { 0.0: '#00bfff', 0.38: '#00ff88', 0.62: '#ffff00', 0.82: '#ff8800', 1.0: '#ff6000' }
    });
    if (this.heatVisible) this.heatLayer.addTo(this.map);
  }

  setHeatmapVisible(visible) {
    this.heatVisible = visible;
    if (!this.heatLayer) return;
    if (visible) this.heatLayer.addTo(this.map);
    else this.map.removeLayer(this.heatLayer);
  }

  setPathsVisible(visible) {
    this.pathsVisible = visible;
    if (!this.paths) return;
    if (visible) this.paths.addTo(this.map);
    else this.map.removeLayer(this.paths);
  }

  /**
   * Maidenhead grid square overlay (Wavelog-style worked / confirmed map).
   * cells: [{ grid: 'IO91', confirmed: bool, qsos: n, calls: [...] }]
   * Drawn in its own pane beneath the contact dots so markers stay clickable.
   */
  setGridSquares(cells, onClick = null) {
    if (!this.map.getPane('gridPane')) {
      const pane = this.map.createPane('gridPane');
      pane.style.zIndex = 350;
      pane.style.pointerEvents = 'none';
      this._gridRenderer = L.canvas({ pane: 'gridPane', padding: 0.5 });
    }
    if (this.gridLayer) { this.map.removeLayer(this.gridLayer); this.gridLayer = null; }
    this._gridCells = new Map((cells || []).map(c => [c.grid, c]));
    this._gridOnClick = onClick;
    this._bindGridEvents();
    if (!cells || !cells.length) { this._setGridHover(null); return; }

    this.gridLayer = L.layerGroup();
    cells.forEach(c => {
      const lon = (c.grid.charCodeAt(0) - 65) * 20 - 180 + parseInt(c.grid[2]) * 2;
      const lat = (c.grid.charCodeAt(1) - 65) * 10 - 90 + parseInt(c.grid[3]);
      const color = c.confirmed ? '#22c55e' : '#f59e0b';
      L.rectangle([[lat, lon], [lat + 1, lon + 2]], {
        renderer: this._gridRenderer, pane: 'gridPane', interactive: false,
        color, weight: 1, opacity: 0.7, fillColor: color, fillOpacity: 0.28
      }).addTo(this.gridLayer);
    });
    this.gridLayer.addTo(this.map);
  }

  // The overlayPane canvas (paths / heatmap) sits above gridPane and swallows pointer
  // events, so hit-testing is done from map-level events instead. Leaflet only fires
  // these when no marker or path consumed the event, so dots and paths still win.
  _bindGridEvents() {
    if (this._gridEventsBound) return;
    this._gridEventsBound = true;
    const gridAt = (latlng) => {
      const lon = ((latlng.lng + 180) % 360 + 360) % 360;
      const lat = latlng.lat + 90;
      if (lat < 0 || lat >= 180) return null;
      const name = String.fromCharCode(65 + Math.floor(lon / 20), 65 + Math.floor(lat / 10))
        + Math.floor((lon % 20) / 2) + Math.floor(lat % 10);
      return this._gridCells?.get(name) || null;
    };
    this.map.on('click', e => {
      const cell = gridAt(e.latlng);
      if (cell && this._gridOnClick) this._gridOnClick(cell.grid);
    });
    this.map.on('mousemove', e => this._setGridHover(gridAt(e.latlng)));
    this.map.on('mouseout', () => this._setGridHover(null));
  }

  _setGridHover(cell) {
    this.map.getContainer().style.cursor = cell ? 'pointer' : '';
  }

  /**
   * Maidenhead lines + labels for every field/square, worked or not.
   * Canvas tiles so the whole world can be labelled cheaply:
   *   zoom <= 3 → fields (IO) · zoom 4 → square lines, field labels · zoom >= 5 → square labels (IO91)
   */
  setGridLabelsVisible(visible) {
    if (!visible) {
      if (this.gridLabels) { this.map.removeLayer(this.gridLabels); this.gridLabels = null; }
      return;
    }
    if (this.gridLabels) return;
    if (!this.map.getPane('gridLabelPane')) {
      const pane = this.map.createPane('gridLabelPane');
      pane.style.zIndex = 360;
      pane.style.pointerEvents = 'none';
    }
    const A = 65;
    const fieldName = (lat, lon) => String.fromCharCode(A + Math.floor((lon + 180) / 20), A + Math.floor((lat + 90) / 10));
    const squareName = (lat, lon) => fieldName(lat, lon) + Math.floor(((lon + 180) % 20) / 2) + Math.floor((lat + 90) % 10);

    const GridLabels = L.GridLayer.extend({
      createTile(coords) {
        const size = this.getTileSize();
        const dpr = window.devicePixelRatio || 1;
        const tile = document.createElement('canvas');
        tile.width = size.x * dpr; tile.height = size.y * dpr;
        tile.style.width = size.x + 'px'; tile.style.height = size.y + 'px';
        const ctx = tile.getContext('2d');
        ctx.scale(dpr, dpr);

        const z = coords.z, map = this._map;
        const nw = coords.scaleBy(size);
        const px = (lat, lon) => map.project([lat, lon], z).subtract(nw);
        const tl = map.unproject(nw, z), br = map.unproject(nw.add(size), z);
        const squares = z >= 4;
        const lonStep = squares ? 2 : 20, latStep = squares ? 1 : 10;
        const clampLat = v => Math.max(-85, Math.min(85, v));

        // Iterate one cell beyond the tile so labels straddling a tile edge are drawn on both sides
        const lonStart = Math.floor((tl.lng + 180) / lonStep) * lonStep - 180 - lonStep;
        const latStart = Math.floor((br.lat + 90) / latStep) * latStep - 90 - latStep;
        const lonEnd = br.lng + lonStep, latEnd = tl.lat + latStep;

        // Lines
        for (let lon = lonStart; lon <= lonEnd; lon += lonStep) {
          const isField = (lon + 180) % 20 === 0;
          const x = Math.round(px(0, lon).x) + 0.5;
          ctx.strokeStyle = isField ? 'rgba(148,163,184,0.55)' : 'rgba(148,163,184,0.22)';
          ctx.lineWidth = isField && squares ? 1.5 : 1;
          ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, size.y); ctx.stroke();
        }
        for (let lat = latStart; lat <= latEnd; lat += latStep) {
          if (lat < -85 || lat > 85) continue;
          const isField = (lat + 90) % 10 === 0;
          const y = Math.round(px(lat, 0).y) + 0.5;
          ctx.strokeStyle = isField ? 'rgba(148,163,184,0.55)' : 'rgba(148,163,184,0.22)';
          ctx.lineWidth = isField && squares ? 1.5 : 1;
          ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(size.x, y); ctx.stroke();
        }

        // Labels
        const squareLabels = z >= 5;
        const lblLon = squareLabels ? 2 : 20, lblLat = squareLabels ? 1 : 10;
        const lLonStart = Math.floor((tl.lng + 180) / lblLon) * lblLon - 180 - lblLon;
        const lLatStart = Math.floor((br.lat + 90) / lblLat) * lblLat - 90 - lblLat;
        ctx.font = `700 ${squareLabels ? (z >= 7 ? 13 : 11) : 13}px "JetBrains Mono", monospace`;
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.lineJoin = 'round'; ctx.lineWidth = 3;
        ctx.strokeStyle = 'rgba(0,0,0,0.6)';
        ctx.fillStyle = 'rgba(226,232,240,0.85)';
        for (let lon = lLonStart; lon <= br.lng + lblLon; lon += lblLon) {
          if (lon < -180 || lon >= 180) continue;
          for (let lat = lLatStart; lat <= tl.lat + lblLat; lat += lblLat) {
            if (lat < -90 || lat >= 90) continue;
            const cLat = clampLat(lat + lblLat / 2);
            const p = px(cLat, lon + lblLon / 2);
            const txt = squareLabels ? squareName(lat, lon) : fieldName(lat, lon);
            ctx.strokeText(txt, p.x, p.y);
            ctx.fillText(txt, p.x, p.y);
          }
        }
        return tile;
      }
    });
    this.gridLabels = new GridLabels({ pane: 'gridLabelPane', updateWhenZooming: false, keepBuffer: 2 }).addTo(this.map);
  }

  invalidateSize() {
      if (this.map) this.map.invalidateSize({ animate: true });
  }

  fitBounds(customPoints = null, options = {}) {
    // 1. Specific framing (e.g. POTA One-by-One)
    if (customPoints) {
        const bounds = L.latLngBounds(customPoints);
        this.map.fitBounds(bounds, { 
            paddingTopLeft: options.paddingTopLeft || [50, 50],
            paddingBottomRight: options.paddingBottomRight || [50, 50],
            animate: options.animate !== false, 
            duration: 1.2,
            maxZoom: options.maxZoom || 18
        });
        return;
    }

    // 2. Global Autocenter
    const layers = this.markers.getLayers();
    if (layers.length > 0 && this.homeLocation) {
        // Find furthest marker from home
        const homeLatLng = L.latLng(this.homeLocation);
        let maxDist = 0;
        let furthestPoint = null;

        layers.forEach(m => {
            const d = homeLatLng.distanceTo(m.getLatLng());
            if (d > maxDist) {
                maxDist = d;
                furthestPoint = m.getLatLng();
            }
        });

        // Create a symmetric bounds around home
        // We calculate the offset and create a box that keeps home in the center
        const latDiff = Math.abs(homeLatLng.lat - furthestPoint.lat);
        const lngDiff = Math.abs(homeLatLng.lng - furthestPoint.lng);
        
        const southWest = L.latLng(homeLatLng.lat - latDiff, homeLatLng.lng - lngDiff);
        const northEast = L.latLng(homeLatLng.lat + latDiff, homeLatLng.lng + lngDiff);
        const bounds = L.latLngBounds(southWest, northEast);
        const zoom = this.map.getBoundsZoom(bounds);

        this.map.setView(homeLatLng, zoom, {
            animate: true,
            duration: 1.0
        });
    } else if (this.homeLocation) {
        this.map.setView(this.homeLocation, 4, { animate: true });
    }
  }
}
