import 'leaflet.geodesic';
import 'leaflet.markercluster';
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

    // Add Dark Matter tiles (sleek tactical look)
    this.tileLayer = L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
      maxZoom: 19,
      updateWhenIdle: false,
      updateWhenZooming: true,
      keepBuffer: 6,
      noWrap: false
    }).addTo(this.map);

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

    this.clustersEnabled = true;

    // Add Zoom Control at bottom right
    this.homeLocation = null;
    this.homeMarker = null;

    this.map.on('zoomend', () => {
      if (this.homeMarker) this.updateHomeMarker();
    });
  }

  setTileLayer(url, options = {}) {
    if (this.tileLayer) this.map.removeLayer(this.tileLayer);
    this.tileLayer = L.tileLayer(url, {
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
          zIndexOffset: 1000 
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
        this.addPath(this.homeLocation, [lat, lon], color, Array.isArray(qso) ? qso : [qso], popupContent);
    }
  }

  /**
   * Add a Geodesic (Great Circle) path between two points
   */
  addPath(start, end, color = '#38bdf8', stationData = null, popupHtml = null) {
      if (!L.geodesic) {
          console.warn('Leaflet.Geodesic not loaded, falling back to polyline');
          const path = L.polyline([start, end], {
              color: color,
              weight: 1.5,
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
          weight: 1.5,
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
      
      if (enabled) {
          if (this.map.hasLayer(this.standaloneMarkers)) this.map.removeLayer(this.standaloneMarkers);
          if (!this.map.hasLayer(this.markers)) this.map.addLayer(this.markers);
      } else {
          if (this.map.hasLayer(this.markers)) this.map.removeLayer(this.markers);
          if (!this.map.hasLayer(this.standaloneMarkers)) this.map.addLayer(this.standaloneMarkers);
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
          html: `<div style="background: var(--acc-glow); border: 2px solid var(--acc); color: var(--text); border-radius: 50%; width: 35px; height: 35px; display: flex; align-items: center; justify-content: center; font-weight: bold; font-family: var(--font-mono); box-shadow: 0 0 10px var(--acc-glow);">
                  ${childCount}
                </div>`,
          className: 'custom-cluster',
          iconSize: L.point(35, 35)
      });
  }

  /**
   * Auto-fit map to markers
   */
  fitBounds() {
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

        this.map.setView(homeLatLng, Math.min(zoom, 10), {
            animate: true,
            duration: 1.0
        });
    } else if (this.homeLocation) {
        this.map.setView(this.homeLocation, 4, { animate: true });
    }
  }
}
