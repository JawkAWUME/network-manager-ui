import {
  Component,
  Input,
  Output,
  EventEmitter,
  AfterViewInit,
  OnDestroy,
  OnChanges,
  SimpleChanges,
  signal,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import * as L from 'leaflet';
import { Site } from '../../models';

// ── Feature GeoJSON indexée pour le point-in-polygon ──────────
interface RegionFeature {
  id:      string;            // nom normalisé (clé de l'index)
  name:    string;            // nom affiché dans l'UI
  bounds:  L.LatLngBounds;   // bounding-box pour le pré-filtre rapide
  layer:   L.Layer;
  feature: GeoJSON.Feature;  // géométrie brute pour le ray-casting
}

@Component({
  selector: 'app-senegal-map',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './senegal-map.component.html',
  styleUrls: ['./senegal-map.component.css'],
})
export class SenegalMapComponent implements AfterViewInit, OnDestroy, OnChanges {

  @Input() sites: Site[] = [];
  @Output() siteSelected = new EventEmitter<Site>();

  // ── UI signals ──────────────────────────────────────────────
  selectedRegionName = signal<string | null>(null);
  selectedRegionId   = signal<string | null>(null);
  panelOpen          = signal(false);

  // ── Leaflet internals ───────────────────────────────────────
  private map!: L.Map;
  private geoJsonLayer!: L.GeoJSON;
  private selectedLayer: L.Layer | null = null;
  private markersLayer  = L.featureGroup();
  private mapReady      = false;

  // ── Registre des features GeoJSON (rempli après chargement) ─
  private regionFeatures: RegionFeature[] = [];

  // ── Index final region-id → liste de sites ──────────────────
  private sitesByRegion = new Map<string, Site[]>();

  // =========================================================
  // LIFECYCLE
  // =========================================================
  ngAfterViewInit(): void {
    this.initMap();
    this.loadGeoJson();
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['sites']) {
      // Index recalculable seulement si le GeoJSON est chargé
      if (this.regionFeatures.length > 0) {
        this.rebuildIndex();
        this.geoJsonLayer.setStyle(f => this.defaultStyle(f as any));
      }
      this.updateMarkers();
    }
  }

  ngOnDestroy(): void {
    this.map?.remove();
  }

  // =========================================================
  // MAP INIT
  // =========================================================
  private initMap(): void {
    this.map = L.map('senegal-map', {
      center: [14.5, -14.5],
      zoom: 7,
      minZoom: 6,
      maxZoom: 14,
      zoomControl: true,
      maxBounds: L.latLngBounds([10.5, -18], [17, -10.5]),
      maxBoundsViscosity: 1.0,
    });

    L.tileLayer(
      'https://{s}.basemaps.cartocdn.com/dark_nolabels/{z}/{x}/{y}{r}.png',
      { attribution: '&copy; OpenStreetMap contributors &copy; CARTO' }
    ).addTo(this.map);

    this.markersLayer.addTo(this.map);
    this.mapReady = true;
  }

  // =========================================================
  // GEOJSON
  // =========================================================
  private async loadGeoJson(): Promise<void> {
    try {
      const res = await fetch('assets/geojson/senegal-regions.geojson');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();

      if (data.features?.length) {
        console.log('[MAP] GeoJSON props sample:', data.features[0].properties);
      }

      this.renderGeoJson(data);
    } catch (err: any) {
      console.error('[MAP] GeoJSON load error:', err.message);
    }
  }

  private renderGeoJson(data: GeoJSON.FeatureCollection): void {
    this.geoJsonLayer = L.geoJSON(data, {
      style:         f => this.defaultStyle(f as any),
      onEachFeature: (feature, layer) => this.registerRegion(feature, layer),
    }).addTo(this.map);

    const bounds = this.geoJsonLayer.getBounds();
    if (bounds.isValid()) {
      this.map.fitBounds(bounds, { padding: [20, 20] });
    }

    // regionFeatures est maintenant rempli → on peut indexer les sites
    this.rebuildIndex();
    this.geoJsonLayer.setStyle(f => this.defaultStyle(f as any));
    this.updateMarkers();
  }

  // =========================================================
  // ENREGISTREMENT RÉGION + EVENTS
  // =========================================================
  private registerRegion(feature: GeoJSON.Feature, layer: L.Layer): void {
    const props = feature.properties as any;
    const name  = props['adm1_name'] || props['NAME_1'] || props['name'] || props['NAME'] || '';
    const id    = this.normalize(name);

    if (!name) {
      console.warn('[MAP] Feature GeoJSON sans nom de région:', props);
      return;
    }

    this.regionFeatures.push({
      id,
      name,
      bounds:  (layer as L.Polygon).getBounds(),
      layer,
      feature,
    });

    (layer as L.Path).bindTooltip(name, {
      sticky:    true,
      opacity:   1,
      className: 'region-label',
    });

    layer.on({
      mouseover: e => {
        if (this.selectedLayer !== e.target) {
          (e.target as L.Path).setStyle(this.hoverStyle);
        }
      },
      mouseout: e => {
        if (this.selectedLayer !== e.target) {
          this.geoJsonLayer.resetStyle(e.target);
        }
      },
      click: e => {
        if (this.selectedLayer && this.selectedLayer !== e.target) {
          this.geoJsonLayer.resetStyle(this.selectedLayer as L.Path);
        }
        this.selectedLayer = e.target;
        (e.target as L.Path).setStyle(this.selectedStyle).bringToFront();
        this.selectedRegionName.set(name);
        this.selectedRegionId.set(id);
        this.panelOpen.set(true);
      },
    });
  }

  // =========================================================
  // NORMALISATION
  // =========================================================
  private normalize(value: string): string {
    return (value || '')
      .toLowerCase()
      .trim()
      .replace(/[\u2010-\u2015\u2212\u2011]/g, '-')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9\s-]/g, '')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-');
  }

  private getRegionId(props: Record<string, any>): string {
    const raw =
      props['adm1_name'] ||
      props['NAME_1']    ||
      props['name']      ||
      props['NAME']      ||
      '';
    return this.normalize(raw);
  }

  // =========================================================
  // POINT-IN-POLYGON (ray-casting)
  // Détermine dans quelle région se trouve un point GPS.
  // =========================================================

  /**
   * Cherche la région contenant (lat, lng).
   * Étape 1 : pré-filtre par bounding-box (O(1) par région).
   * Étape 2 : ray-casting exact sur le polygone GeoJSON.
   */
  private detectRegionByCoords(lat: number, lng: number): string | null {
    const point = L.latLng(lat, lng);

    for (const rf of this.regionFeatures) {
      if (!rf.bounds.contains(point)) continue;           // pré-filtre rapide
      if (this.pointInFeature(lng, lat, rf.feature)) {   // test précis
        return rf.id;
      }
    }

    console.warn(`[MAP] (${lat}, ${lng}) hors de toute région connue`);
    return null;
  }

  /** Dispatch Polygon / MultiPolygon */
  private pointInFeature(x: number, y: number, feature: GeoJSON.Feature): boolean {
    const geom = feature.geometry;
    if (geom.type === 'Polygon') {
      return this.pointInPolygon(x, y, geom.coordinates);
    }
    if (geom.type === 'MultiPolygon') {
      return geom.coordinates.some(poly => this.pointInPolygon(x, y, poly));
    }
    return false;
  }

  /**
   * GeoJSON : coordinates = [outerRing, ...holeRings]
   * Chaque ring = [[lng, lat], ...]  (longitude EN PREMIER dans GeoJSON)
   * x = longitude, y = latitude
   */
  private pointInPolygon(x: number, y: number, rings: number[][][]): boolean {
    if (!this.raycast(x, y, rings[0])) return false;   // hors de l'anneau extérieur
    for (let i = 1; i < rings.length; i++) {
      if (this.raycast(x, y, rings[i])) return false;  // dans un trou → dehors
    }
    return true;
  }

  /** Algorithme ray-casting classique */
  private raycast(x: number, y: number, ring: number[][]): boolean {
    let inside = false;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const xi = ring[i][0], yi = ring[i][1];
      const xj = ring[j][0], yj = ring[j][1];
      const intersect = (yi > y) !== (yj > y)
        && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi;
      if (intersect) inside = !inside;
    }
    return inside;
  }

  // =========================================================
  // INDEX region → sites
  // Priorité 1 : coordonnées GPS  (point-in-polygon)
  // Priorité 2 : fallback textuel (champ region / city)
  // =========================================================
  private rebuildIndex(): void {
    this.sitesByRegion.clear();

    for (const site of this.sites) {
      let regionId: string | null = null;

      // Priorité 1 — GPS
      if (site.latitude && site.longitude) {
        regionId = this.detectRegionByCoords(site.latitude, site.longitude);
      }

      // Priorité 2 — texte (fallback si pas de coords ou hors carte)
      if (!regionId) {
        regionId = this.extractRegionFromText(
          (site as any).region || site.city || site.address || ''
        );
      }

      if (!regionId) {
        console.warn('[MAP] Site sans région détectable:', site.name);
        continue;
      }

      if (!this.sitesByRegion.has(regionId)) {
        this.sitesByRegion.set(regionId, []);
      }
      this.sitesByRegion.get(regionId)!.push(site);
    }

    console.log('[MAP] index (GPS-based):', this.sitesByRegion);
  }

  /** Fallback textuel — utilisé uniquement si le site n'a pas de coordonnées */
  private extractRegionFromText(raw: string): string | null {
    const norm = this.normalize(raw);
    if (!norm) return null;

    const ALIASES: Record<string, string> = {
      dakar:         'dakar',
      thies:         'thies',
      'saint-louis': 'saint-louis',
      saintlouis:    'saint-louis',
      louga:         'louga',
      matam:         'matam',
      diourbel:      'diourbel',
      fatick:        'fatick',
      kaolack:       'kaolack',
      kaffrine:      'kaffrine',
      tambacounda:   'tambacounda',
      kedougou:      'kedougou',
      kolda:         'kolda',
      sedhiou:       'sedhiou',
      ziguinchor:    'ziguinchor',
    };

    for (const [key, canonical] of Object.entries(ALIASES)) {
      if (norm.includes(key)) return canonical;
    }
    return norm || null;
  }

  getSitesInRegion(regionId: string | null): Site[] {
    if (!regionId) return [];
    return this.sitesByRegion.get(this.normalize(regionId)) ?? [];
  }

  // =========================================================
  // STYLES RÉGIONS
  // =========================================================
  private getRegionColor(count: number): string {
    if (count === 0) return '#1d2d44';
    if (count <= 2) return '#166534';
    if (count <= 5) return '#b45309';
    return '#991b1b';
  }

  private defaultStyle(feature: GeoJSON.Feature): L.PathOptions {
    const rid   = this.getRegionId(feature.properties as any);
    const count = this.getSitesInRegion(rid).length;
    return {
      fillColor:   this.getRegionColor(count),
      fillOpacity: 0.6,
      weight:      1.5,
      color:       '#3b82f6',
    };
  }

  private hoverStyle: L.PathOptions = {
    fillOpacity: 0.85,
    weight:      2.5,
    color:       '#f97316',
  };

  private selectedStyle: L.PathOptions = {
    fillOpacity: 0.9,
    weight:      2.5,
    color:       '#ef4444',
  };

  // =========================================================
  // MARQUEURS
  // =========================================================
private updateMarkers(): void {
  if (!this.mapReady) return;
  this.markersLayer.clearLayers();

  let placed = 0;

  for (const site of this.sites) {
    if (!site.latitude || !site.longitude) continue;

    const fw    = site.firewalls_count ?? 0;
    const rt    = site.routers_count   ?? 0;
    const sw    = site.switches_count  ?? 0;
    const total = fw + rt + sw;

    // Couleur pour l'indicateur de densité dans le popup (inchangée)
    const densityColor =
      total >= 6 ? '#ef4444' :
      total >= 3 ? '#f59e0b' :
      total >  0 ? '#22c55e' : '#64748b';

    // Tous les marqueurs sont en vert fixe
    const markerColor = '#22c55e';

    // Icône simple : un point rond vert
    const markerIcon = L.divIcon({
      className: '',
      html: `<div style="
        width: 14px;
        height: 14px;
        background: ${markerColor};
        border: 2px solid #fff;
        border-radius: 50%;
        box-shadow: 0 0 0 3px rgba(0,0,0,0.25);
      "></div>`,
      iconSize:   [14, 14],
      iconAnchor: [7, 7],
      popupAnchor: [0, -10],
    });

    const marker = L.marker([site.latitude, site.longitude], {
      icon: markerIcon,
      riseOnHover: true,
      bubblingMouseEvents: false,
    });

    // Popup : l'indicateur de densité garde sa couleur d'origine
    const popupHtml = `
      <div style="
        background: #0f1f3d;
        border: 1px solid rgba(59,130,246,0.5);
        border-radius: 10px;
        padding: 7px 9px 6px;
        font-family: system-ui, -apple-system, sans-serif;
        color: #f1f5f9;
        position: relative;
        min-width: 124px;
      ">
        <div style="
          position: absolute;
          top: -5px;
          right: -5px;
          width: 11px;
          height: 11px;
          background: ${densityColor};
          border: 2px solid #0f1f3d;
          border-radius: 50%;
        "></div>
        <div style="
          position: absolute;
          bottom: -6px;
          left: 50%;
          transform: translateX(-50%);
          width: 0; height: 0;
          border-left: 6px solid transparent;
          border-right: 6px solid transparent;
          border-top: 6px solid rgba(59,130,246,0.5);
        "></div>
        <div style="
          position: absolute;
          bottom: -5px;
          left: 50%;
          transform: translateX(-50%);
          width: 0; height: 0;
          border-left: 5px solid transparent;
          border-right: 5px solid transparent;
          border-top: 5px solid #0f1f3d;
        "></div>

        <div style="
          font-size: 9.5px;
          font-weight: 700;
          text-align: center;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
          margin-bottom: 4px;
        ">${site.name}</div>

        <div style="display: flex; justify-content: center; gap: 4px;">
          <span style="
            font-size: 8px; font-weight: 700;
            padding: 1px 5px; border-radius: 3px;
            background: rgba(239,68,68,0.2);
            color: #fca5a5;
          ">${fw} FW</span>
          <span style="
            font-size: 8px; font-weight: 700;
            padding: 1px 5px; border-radius: 3px;
            background: rgba(59,130,246,0.2);
            color: #93c5fd;
          ">${rt} RT</span>
          <span style="
            font-size: 8px; font-weight: 700;
            padding: 1px 5px; border-radius: 3px;
            background: rgba(34,197,94,0.2);
            color: #86efac;
          ">${sw} SW</span>
        </div>
      </div>
    `;

    marker.bindPopup(popupHtml, {
      closeButton: false,
      autoClose: true,
      className: 'site-popup',
      offset: L.point(0, -6),
    });

    marker.on('click', () => this.siteSelected.emit(site));
    this.markersLayer.addLayer(marker);
    placed++;
  }

  console.log(`[MAP] markers placed: ${placed}`);
}
  /** CSS inline obligatoire — les divIcon sont hors du scope Angular */
  // private buildMarkerHtml(
  //   name: string,
  //   fw: number, rt: number, sw: number,
  //   dotColor: string
  // ): string {
  //   const label = name.length > 15 ? name.slice(0, 13) + '…' : name;
  //   return `
  //     <div style="position:relative;width:0;height:0;pointer-events:none">
  //       <div style="position:absolute;left:-1px;top:0;width:2px;height:20px;
  //                   background:#1e40af;border-radius:0 0 1px 1px"></div>
  //       <div style="position:absolute;left:-5px;top:16px;width:10px;height:10px;
  //                   background:#1e40af;border:2px solid #fff;border-radius:50%;
  //                   box-shadow:0 0 0 3px rgba(30,64,175,0.25)"></div>
  //       <div style="position:absolute;left:-62px;top:-62px;width:124px;
  //                   background:#0f1f3d;border:1px solid rgba(59,130,246,0.5);
  //                   border-radius:10px;padding:7px 9px 6px;pointer-events:auto;
  //                   cursor:pointer;box-shadow:0 4px 16px rgba(0,0,0,0.45)">
  //         <div style="position:absolute;top:-5px;right:-5px;width:11px;height:11px;
  //                     background:${dotColor};border:2px solid #0f1f3d;border-radius:50%"></div>
  //         <div style="position:absolute;bottom:-6px;left:50%;transform:translateX(-50%);
  //                     width:0;height:0;border-left:6px solid transparent;
  //                     border-right:6px solid transparent;
  //                     border-top:6px solid rgba(59,130,246,0.5)"></div>
  //         <div style="position:absolute;bottom:-5px;left:50%;transform:translateX(-50%);
  //                     width:0;height:0;border-left:5px solid transparent;
  //                     border-right:5px solid transparent;
  //                     border-top:5px solid #0f1f3d"></div>
  //         <div style="font-size:9.5px;font-weight:700;color:#f1f5f9;text-align:center;
  //                     white-space:nowrap;overflow:hidden;text-overflow:ellipsis;
  //                     font-family:system-ui,-apple-system,sans-serif;
  //                     margin-bottom:4px">${label}</div>
  //         <div style="display:flex;justify-content:center;gap:4px">
  //           <span style="font-size:8px;font-weight:700;padding:1px 5px;border-radius:3px;
  //                        background:rgba(239,68,68,0.2);color:#fca5a5;
  //                        font-family:system-ui,-apple-system,sans-serif">${fw} FW</span>
  //           <span style="font-size:8px;font-weight:700;padding:1px 5px;border-radius:3px;
  //                        background:rgba(59,130,246,0.2);color:#93c5fd;
  //                        font-family:system-ui,-apple-system,sans-serif">${rt} RT</span>
  //           <span style="font-size:8px;font-weight:700;padding:1px 5px;border-radius:3px;
  //                        background:rgba(34,197,94,0.2);color:#86efac;
  //                        font-family:system-ui,-apple-system,sans-serif">${sw} SW</span>
  //         </div>
  //       </div>
  //     </div>`;
  // }

  // =========================================================
  // PANEL
  // =========================================================
  closePanel(): void {
    this.panelOpen.set(false);
    this.selectedRegionName.set(null);
    this.selectedRegionId.set(null);
    if (this.selectedLayer) {
      this.geoJsonLayer.resetStyle(this.selectedLayer as L.Path);
      this.selectedLayer = null;
    }
  }

  onSiteClick(site: Site, event: Event): void {
    event.stopPropagation();
    this.siteSelected.emit(site);
  }
}