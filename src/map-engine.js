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
        iconCreateFunction: this.createClusterIcon
    }).addTo(this.map);

    this.paths = L.layerGroup(); // Initialize hidden by default
    this.standaloneMarkers = L.layerGroup();
    this.pathsVisible = false;

    this.clustersEnabled = true;

    // Add Zoom Control at bottom right
    this.homeLocation = null;
    this.homeMarker = null;
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

      const icon = L.divIcon({
          className: 'beacon-pulse',
          html: '<div class="home-beacon" style="width: 10px; height: 10px;"></div>',
          iconSize: [24, 24],
          iconAnchor: [12, 12]
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
    const cName = tactical.name || latest.COUNTRY || latest.DXCC || 'Unknown Country';
    const flagHtml = tactical.flagHtml || '📡';
    
    let rangeRow = '';
    if (tactical.dist) {
      rangeRow = `
        <div class="scard-row" style="display: flex; justify-content: space-between; font-size: 0.8rem; margin-bottom: 4px;">
          <span style="opacity: 0.5;">Range:</span>
          <span style="font-family: var(--font-mono); color: var(--acc); font-weight: bold;">${tactical.dist}</span>
        </div>
      `;
    }

    const popupContent = `
      <div class="station-card">
        <div class="scard-header" style="display: flex; align-items: center; gap: 10px; margin-bottom: 10px;">
          <div class="scard-icon" style="width: 32px; height: 24px; display: flex; align-items: center; justify-content: center; background: rgba(255,255,255,0.05); border-radius: 4px; overflow: hidden; border: 1px solid rgba(255,255,255,0.1);">
            ${flagHtml}
          </div>
          <div>
            <div class="scard-call" style="font-size: 1.2rem; font-weight: bold; color: var(--acc);">${latest.CALL}</div>
            <div class="scard-loc" style="font-size: 0.7rem; opacity: 0.6;">${cName}</div>
          </div>
        </div>
        <div class="scard-body" style="padding: 10px 0; border-top: 1px solid var(--brd); margin-top: 5px;">
          ${rangeRow}
          <div class="scard-row" style="display: flex; justify-content: space-between; font-size: 0.8rem; margin-bottom: 4px;">
            <span style="opacity: 0.5;">Grid:</span>
            <span style="font-family: var(--font-mono);">${latest.GRIDSQUARE || 'N/A'}</span>
          </div>
          <div class="scard-row" style="display: flex; justify-content: space-between; font-size: 0.8rem; margin-bottom: 4px;">
            <span style="opacity: 0.5;">Band:</span>
            <span style="font-family: var(--font-mono);">${latest.BAND || 'N/A'}</span>
          </div>
          <div class="scard-row" style="display: flex; justify-content: space-between; font-size: 0.8rem;">
            <span style="opacity: 0.5;">Contacts:</span>
            <span style="font-family: var(--font-mono); color: var(--acc); font-weight: bold;">${historyCount}</span>
          </div>
        </div>
        <button class="scard-btn btn-show-history" style="margin-top: 10px; width: 100%; padding: 8px; background: rgba(56, 189, 248, 0.1); border: 1px solid var(--acc); color: var(--acc); border-radius: 4px; cursor: pointer; font-family: var(--font-mono); font-size: 0.75rem;">
          📜 Show All QSOs
        </button>
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
    clusterMarker.bindPopup(popupContent);
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
    standaloneMarker.bindPopup(popupContent);
    this.standaloneMarkers.addLayer(standaloneMarker);

    // Interactive Trigger
    const onMarkerClick = (e) => {
        this.map.fire('stationclick', { data: e.target.options.stationData });
    };

    clusterMarker.on('click', onMarkerClick);
    standaloneMarker.on('click', onMarkerClick);

    // Draw Great Circle Path — only compute geometry when paths are actually visible
    if (this.homeLocation && this.pathsVisible) {
        this.addPath(this.homeLocation, [lat, lon], color);
    }
  }

  /**
   * Add a Geodesic (Great Circle) path between two points
   */
  addPath(start, end, color = '#38bdf8') {
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

      const path = L.geodesic([start, end], {
          weight: 1.5,
          opacity: 0.4,
          color: color,
          steps: 50,
          wrap: true
      });
      
      this.paths.addLayer(path);
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
   * Clear all markers and paths
   */
  clear() {
    this.markers.clearLayers();
    this.standaloneMarkers.clearLayers();
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
