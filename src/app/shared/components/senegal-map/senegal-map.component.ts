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

  // ── UI signals ─────────────────────────────────────────────
  selectedRegionName = signal<string | null>(null);
  selectedRegionId   = signal<string | null>(null);
  panelOpen          = signal(false);

  // ── Leaflet internals ──────────────────────────────────────
  private map!: L.Map;
  private geoJsonLayer!: L.GeoJSON;
  private selectedLayer: L.Layer | null = null;
  private markersLayer = L.featureGroup();
  private mapReady = false;

  // ── Index region → sites ───────────────────────────────────
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
      this.rebuildIndex();
      if (this.geoJsonLayer) {
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

      // Debug : log la première feature pour voir les propriétés
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
      style: f => this.defaultStyle(f as any),
      onEachFeature: (feature, layer) => this.bindFeatureEvents(feature, layer),
    }).addTo(this.map);

    const bounds = this.geoJsonLayer.getBounds();
    if (bounds.isValid()) {
      this.map.fitBounds(bounds, { padding: [20, 20] });
    }

    this.rebuildIndex();
    this.geoJsonLayer.setStyle(f => this.defaultStyle(f as any));
    this.updateMarkers();
  }

  // =========================================================
  // NORMALISATION
  // =========================================================
  private normalize(value: string): string {
    return (value || '')
      .toLowerCase()
      .trim()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9\s-]/g, '')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-');
  }

  private getRegionId(props: Record<string, any>): string {
    // Adapte selon ce que ton GeoJSON retourne réellement
    const raw =
      props['adm1_name'] ||
      props['NAME_1']    ||
      props['name']      ||
      props['NAME']      ||
      '';
    if (!raw) console.warn('[MAP] GeoJSON feature has no name prop:', props);
    return this.normalize(raw);
  }

  private extractRegionFromSite(site: Site): string {
    // Priorité : champ region > city > address
    const raw = (site as any).region || site.city || site.address || '';
    const norm = this.normalize(raw);

    // Table de correspondance explicite pour absorber les variations d'encodage
    const ALIASES: Record<string, string> = {
      dakar:          'dakar',
      thies:          'thies',
      'saint-louis':  'saint-louis',
      'saint-louis-':  'saint-louis',
      louga:          'louga',
      matam:          'matam',
      diourbel:       'diourbel',
      fatick:         'fatick',
      kaolack:        'kaolack',
      kaffrine:       'kaffrine',
      tambacounda:    'tambacounda',
      kedougou:       'kedougou',
      kolda:          'kolda',
      sedhiou:        'sedhiou',
      ziguinchor:     'ziguinchor',
    };

    // Cherche si norm contient une clé connue
    for (const [key, canonical] of Object.entries(ALIASES)) {
      if (norm.includes(key)) return canonical;
    }
    return norm;
  }

  // =========================================================
  // INDEX
  // =========================================================
  private rebuildIndex(): void {
    this.sitesByRegion.clear();
    for (const site of this.sites) {
      const region = this.extractRegionFromSite(site);
      if (!region) continue;
      if (!this.sitesByRegion.has(region)) {
        this.sitesByRegion.set(region, []);
      }
      this.sitesByRegion.get(region)!.push(site);
    }
    console.log('[MAP] index:', this.sitesByRegion);
  }

  getSitesInRegion(regionId: string | null): Site[] {
    if (!regionId) return [];
    return this.sitesByRegion.get(this.normalize(regionId)) ?? [];
  }

  // =========================================================
  // STYLE RÉGIONS
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
  // EVENTS RÉGIONS
  // =========================================================
  private bindFeatureEvents(feature: GeoJSON.Feature, layer: L.Layer): void {
    const props = feature.properties as any;
    const name  = props['adm1_name'] || props['NAME_1'] || props['name'] || '';
    const rid   = this.getRegionId(props);

    (layer as L.Path).bindTooltip(name, { permanent : true, opacity: 1 , direction: 'center', className: 'region-label'}, );

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
        // Remettre l'ancien sélectionné
        if (this.selectedLayer && this.selectedLayer !== e.target) {
          this.geoJsonLayer.resetStyle(this.selectedLayer as L.Path);
        }
        this.selectedLayer = e.target;
        (e.target as L.Path).setStyle(this.selectedStyle).bringToFront();

        this.selectedRegionName.set(name);
        this.selectedRegionId.set(rid);
        this.panelOpen.set(true);
      },
    });
  }

  // =========================================================
  // MARQUEURS SITES — ancrage précis via iconSize:[0,0]
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

    // Couleur du point selon densité
    const dotColor =
      total >= 6 ? '#ef4444' :
      total >= 3 ? '#f59e0b' :
      total >  0 ? '#22c55e' : '#64748b';

    // ---- Icône simple : juste un point rond ----
    const markerIcon = L.divIcon({
      className: '',
      html: `<div style="
        width: 14px;
        height: 14px;
        background: ${dotColor};
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

    // ---- Popup : réplique de l’ancienne bulle (sans tige ni point) ----
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
        <!-- Indicateur de densité (coin haut-droit) -->
        <div style="
          position: absolute;
          top: -5px;
          right: -5px;
          width: 11px;
          height: 11px;
          background: ${dotColor};
          border: 2px solid #0f1f3d;
          border-radius: 50%;
        "></div>

        <!-- Flèche (pointe vers le bas, pour le popup) -->
        <div style="
          position: absolute;
          bottom: -6px;
          left: 50%;
          transform: translateX(-50%);
          width: 0;
          height: 0;
          border-left: 6px solid transparent;
          border-right: 6px solid transparent;
          border-top: 6px solid rgba(59,130,246,0.5);
        "></div>
        <div style="
          position: absolute;
          bottom: -5px;
          left: 50%;
          transform: translateX(-50%);
          width: 0;
          height: 0;
          border-left: 5px solid transparent;
          border-right: 5px solid transparent;
          border-top: 5px solid #0f1f3d;
        "></div>

        <!-- Nom du site -->
        <div style="
          font-size: 9.5px;
          font-weight: 700;
          text-align: center;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
          margin-bottom: 4px;
        ">${site.name}</div>

        <!-- Badges équipements -->
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

    // On bind le popup
    marker.bindPopup(popupHtml, {
      closeButton: false,
      autoClose: true,
      className: 'site-popup',        // tu peux ajouter des styles pour enlever les marges par défaut
      offset: L.point(0, -6),         // petit ajustement vertical si nécessaire
    });

    // Émission au clic (pour la modale du dashboard)
    marker.on('click', () => this.siteSelected.emit(site));

    this.markersLayer.addLayer(marker);
    placed++;
  }

  console.log(`[MAP] markers placed: ${placed}`);
}

  /*
   * MARQUEUR — tout le CSS est INLINE.
   * Les styles du composant Angular (.css) ne s'appliquent PAS
   * aux divIcon Leaflet (hors shadow DOM du composant).
   */
  

  // =========================================================
  // PANEL ACTIONS
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