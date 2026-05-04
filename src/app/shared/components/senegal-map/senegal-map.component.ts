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

  selectedRegionName = signal<string | null>(null);
  selectedRegionId = signal<string | null>(null);
  panelOpen = signal(false);

  private map!: L.Map;
  private geoJsonLayer!: L.GeoJSON;
  private selectedLayer: L.Layer | null = null;
  private debugLabelsLayer = L.layerGroup();

  // ─────────────────────────────
  // DEBUG MODE
  // ─────────────────────────────
  private readonly DEBUG = true;
  private readonly DEBUG_OVERLAY = true;

  private log(...args: any[]): void {
    if (this.DEBUG) console.log('[MAP]', ...args);
  }

  private warn(...args: any[]): void {
    if (this.DEBUG) console.warn('[MAP]', ...args);
  }

  // ─────────────────────────────
  // NORMALISATION
  // ─────────────────────────────
  private normalize(value: string): string {
    return (value || '')
      .toLowerCase()
      .trim()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '');
  }

  // ─────────────────────────────
  // REGIONS
  // ─────────────────────────────
  private readonly REGION_ALIASES: Record<string, string> = {
    dakar: 'dakar',
    thies: 'thies',
    thiès: 'thies',
    'saint louis': 'saint-louis',
    'saint-louis': 'saint-louis',
    louga: 'louga',
    matam: 'matam',
    diourbel: 'diourbel',
    fatick: 'fatick',
    kaolack: 'kaolack',
    kaffrine: 'kaffrine',
    tambacounda: 'tambacounda',
    kedougou: 'kedougou',
    kolda: 'kolda',
    sedhiou: 'sedhiou',
    ziguinchor: 'ziguinchor',
  };

  // ─────────────────────────────
  // COULEURS
  // ─────────────────────────────
  private getColor(count: number): string {
    if (count === 0) return '#dce8f5';
    if (count <= 2) return '#a8d5b5';
    if (count <= 5) return '#3aaa62';
    return '#1c6e3d';
  }

  private hoverStyle: L.PathOptions = {
    fillOpacity: 0.9,
    weight: 3,
    color: '#e05a00',
  };

  private selectedStyle: L.PathOptions = {
    weight: 3,
    color: '#cc1a1a',
    fillOpacity: 0.92,
  };

  // ─────────────────────────────
  // INIT
  // ─────────────────────────────
  ngAfterViewInit(): void {
    this.initMap();
    this.loadGeoJson();
  }

  ngOnDestroy(): void {
    this.map?.remove();
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['sites']) {
      this.rebuildIndex();

      if (this.geoJsonLayer) {
        this.geoJsonLayer.setStyle((f) => this.defaultStyle(f as any));
        this.renderDebugOverlay();
      }
    }
  }

  // ─────────────────────────────
  // MAP
  // ─────────────────────────────
  private initMap(): void {
    this.map = L.map('senegal-map', {
      center: [14.5, 14.5],
      zoom: 6,
      maxBounds: L.latLngBounds([10.5, -18], [17, -10.5]),
      maxBoundsViscosity: 0.85,
    });

    L.tileLayer(
      'https://{s}.basemaps.cartocdn.com/light_nolabels/{z}/{x}/{y}{r}.png'
    ).addTo(this.map);

    this.createDebugPanel();
  }

  // ─────────────────────────────
  // GEOJSON
  // ─────────────────────────────
  private loadGeoJson(): void {
    fetch('assets/geojson/senegal-regions.geojson')
      .then((r) => r.json())
      .then((data) => this.renderGeoJson(data))
      .catch(() => this.renderGeoJson({ type: 'FeatureCollection', features: [] }));
  }

  private renderGeoJson(data: GeoJSON.FeatureCollection): void {
    this.log('GeoJSON loaded:', data.features.length);

    this.geoJsonLayer = L.geoJSON(data, {
      style: (f) => this.defaultStyle(f as any),
      onEachFeature: (feature, layer) =>
        this.bindFeatureEvents(feature, layer),
    }).addTo(this.map);

    const bounds = this.geoJsonLayer.getBounds();
    if (bounds.isValid()) this.map.fitBounds(bounds);

    this.renderDebugOverlay();
    this.detectMismatches();
  }

  // ─────────────────────────────
  // REGION LOGIC
  // ─────────────────────────────
  private getRegionId(props: Record<string, string>): string {
    const raw =
      props['NAME_1'] ||
      props['admin1Name'] ||
      props['region'] ||
      '';

    const norm = this.normalize(raw);
    return this.REGION_ALIASES[norm] || norm.replace(/\s+/g, '-');
  }

  private extractRegion(site: Site): string {
    const raw =
      (site as any).region ||
      site.city ||
      site.address ||
      '';

    const norm = this.normalize(raw);
    return this.REGION_ALIASES[norm] || norm;
  }

  // ─────────────────────────────
  // INDEX
  // ─────────────────────────────
  private sitesByRegion = new Map<string, Site[]>();

  private rebuildIndex(): void {
    this.sitesByRegion.clear();

    for (const site of this.sites) {
      const region = this.extractRegion(site);

      if (!this.sitesByRegion.has(region)) {
        this.sitesByRegion.set(region, []);
      }

      this.sitesByRegion.get(region)!.push(site);
    }

    this.log('Index:', this.sitesByRegion);
  }

  getSitesInRegion(regionId: string | null): Site[] {
    if (!regionId) return [];
    return this.sitesByRegion.get(this.normalize(regionId)) ?? [];
  }

  // ─────────────────────────────
  // STYLE
  // ─────────────────────────────
  private defaultStyle(feature: GeoJSON.Feature): L.PathOptions {
    const rid = this.getRegionId(feature.properties as any);
    const count = this.getSitesInRegion(rid).length;

    return {
      fillColor: this.getColor(count),
      fillOpacity: 0.72,
      weight: 2,
      color: '#003087',
    };
  }

  // ─────────────────────────────
  // EVENTS
  // ─────────────────────────────
  private bindFeatureEvents(feature: GeoJSON.Feature, layer: L.Layer): void {
    const props = feature.properties as any;
    const name = props['NAME_1'] || props['admin1Name'] || '';
    const rid = this.getRegionId(props);

    (layer as L.Path).bindTooltip(name, { sticky: true });

    layer.on({
      mouseover: (e) =>
        (e.target as L.Path).setStyle(this.hoverStyle),

      mouseout: (e) =>
        this.geoJsonLayer.resetStyle(e.target),

      click: (e) => {
        this.selectedLayer = e.target;

        (e.target as L.Path).setStyle(this.selectedStyle);
        (e.target as L.Path).bringToFront();

        this.selectedRegionName.set(name);
        this.selectedRegionId.set(rid);
        this.panelOpen.set(true);
      },
    });
  }

  // ─────────────────────────────
  // OVERLAY DEBUG
  // ─────────────────────────────
  private renderDebugOverlay(): void {
    if (!this.DEBUG_OVERLAY) return;

    this.debugLabelsLayer.clearLayers();

    this.geoJsonLayer.eachLayer((layer: any) => {
      const props = layer.feature?.properties;
      if (!props) return;

      const rid = this.getRegionId(props);
      const count = this.getSitesInRegion(rid).length;

      const center = layer.getBounds().getCenter();

      const marker = L.marker(center, {
        icon: L.divIcon({
          className: '',
          html: `
            <div style="background:#111;color:#0f0;padding:4px 6px;
            border-radius:6px;font-size:11px;">
              ${rid}: ${count}
            </div>
          `,
        }),
      });

      this.debugLabelsLayer.addLayer(marker);
    });

    this.debugLabelsLayer.addTo(this.map);
  }

  // ─────────────────────────────
  // DEBUG PANEL
  // ─────────────────────────────
  private createDebugPanel(): void {
    if (!this.DEBUG) return;

    const control = new L.Control({ position: 'bottomright' });

    control.onAdd = () => {
      const div = L.DomUtil.create('div');

      div.innerHTML = `
        <div style="background:#000;color:#0f0;padding:10px;font-size:12px;">
          <b>DEBUG MAP</b><br/>
          Sites: ${this.sites.length}<br/>
          Regions: ${this.sitesByRegion.size}
        </div>
      `;

      return div;
    };

    control.addTo(this.map);
  }

  // ─────────────────────────────
  // MISMATCH DETECTOR
  // ─────────────────────────────
  private detectMismatches(): void {
    const geoRegions = new Set<string>();

    this.geoJsonLayer.eachLayer((layer: any) => {
      const props = layer.feature?.properties;
      if (!props) return;

      geoRegions.add(this.getRegionId(props));
    });

    const backendRegions = new Set(this.sitesByRegion.keys());

    const missingInBackend = [...geoRegions].filter(r => !backendRegions.has(r));
    const missingInGeo = [...backendRegions].filter(r => !geoRegions.has(r));

    this.warn('Mismatch:', { missingInBackend, missingInGeo });
  }

  // ─────────────────────────────
  // PANEL
  // ─────────────────────────────
  closePanel(): void {
    this.panelOpen.set(false);

    if (this.selectedLayer) {
      this.geoJsonLayer.resetStyle(this.selectedLayer as L.Path);
      this.selectedLayer = null;
    }
  }

  onSiteClick(site: Site, event: Event): void {
    event.stopPropagation();
    this.siteSelected.emit(site);
  }

  // ─────────────────────────────
  // FALLBACK
  // ─────────────────────────────
  private buildFallbackGeoJson(): GeoJSON.FeatureCollection {
    return { type: 'FeatureCollection', features: [] };
  }
}