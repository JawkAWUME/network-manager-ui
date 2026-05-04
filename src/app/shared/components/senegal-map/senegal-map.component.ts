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

export interface Site {
  id: number;
  name: string;
  city?: string;
  address?: string;
  region?: string;
  firewalls_count?: number;
  routers_count?: number;
  switches_count?: number;
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

  selectedRegionName = signal<string | null>(null);
  selectedRegionId = signal<string | null>(null);
  panelOpen = signal(false);

  private map!: L.Map;
  private geoJsonLayer!: L.GeoJSON;
  private selectedLayer: L.Layer | null = null;

  // ─────────────────────────────────────────────
  // NORMALISATION
  // ─────────────────────────────────────────────
  private normalize(value: string): string {
    return (value || '')
      .toLowerCase()
      .trim()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '');
  }

  // ─────────────────────────────────────────────
  // REGIONS CANONIQUES
  // ─────────────────────────────────────────────
  private readonly REGION_ALIASES: Record<string, string> = {
    'dakar': 'dakar',
    'thies': 'thies',
    'thiès': 'thies',
    'saint louis': 'saint-louis',
    'saint-louis': 'saint-louis',
    'louga': 'louga',
    'matam': 'matam',
    'diourbel': 'diourbel',
    'fatick': 'fatick',
    'kaolack': 'kaolack',
    'kaffrine': 'kaffrine',
    'tambacounda': 'tambacounda',
    'kedougou': 'kedougou',
    'kolda': 'kolda',
    'sedhiou': 'sedhiou',
    'ziguinchor': 'ziguinchor',
  };

  // ─────────────────────────────────────────────
  // COULEURS
  // ─────────────────────────────────────────────
  private getColor(count: number): string {
    if (count === 0) return '#dce8f5';
    if (count <= 2) return '#a8d5b5';
    if (count <= 5) return '#3aaa62';
    return '#1c6e3d';
  }

  private defaultStyle(feature: GeoJSON.Feature): L.PathOptions {
    const rid = this.getRegionId(feature.properties as any);
    const n = this.getSitesInRegion(rid).length;

    return {
      fillColor: this.getColor(n),
      fillOpacity: 0.72,
      weight: 2,
      color: '#003087',
    };
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

  // ─────────────────────────────────────────────
  // LIFECYCLE
  // ─────────────────────────────────────────────
  ngAfterViewInit(): void {
    this.initMap();
    this.loadGeoJson();
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['sites']) {
      this.rebuildIndex();
      if (this.geoJsonLayer) {
        this.geoJsonLayer.setStyle((f) => this.defaultStyle(f as any));
      }
    }
  }

  ngOnDestroy(): void {
    this.map?.remove();
  }

  // ─────────────────────────────────────────────
  // MAP INIT
  // ─────────────────────────────────────────────
  private initMap(): void {
    this.map = L.map('senegal-map', {
      center: [14.5, 14.5],
      zoom: 6,
    });

    L.tileLayer(
      'https://{s}.basemaps.cartocdn.com/light_nolabels/{z}/{x}/{y}{r}.png'
    ).addTo(this.map);
  }

  // ─────────────────────────────────────────────
  // GEOJSON
  // ─────────────────────────────────────────────
  private loadGeoJson(): void {
    fetch('assets/geojson/senegal-regions.geojson')
      .then((r) => r.json())
      .then((data) => this.renderGeoJson(data))
      .catch(() => this.renderGeoJson(this.buildFallbackGeoJson()));
  }

  private renderGeoJson(data: GeoJSON.FeatureCollection): void {
    this.geoJsonLayer = L.geoJSON(data, {
      style: (f) => this.defaultStyle(f as any),
      onEachFeature: (feature, layer) =>
        this.bindFeatureEvents(feature, layer),
    }).addTo(this.map);

    const bounds = this.geoJsonLayer.getBounds();
    if (bounds.isValid()) this.map.fitBounds(bounds);
  }

  // ─────────────────────────────────────────────
  // REGION ID
  // ─────────────────────────────────────────────
  private getRegionId(props: Record<string, string>): string {
    const raw =
      props['NAME_1'] ||
      props['admin1Name'] ||
      props['region'] ||
      '';

    const norm = this.normalize(raw);

    return this.REGION_ALIASES[norm] || norm.replace(/\s+/g, '-');
  }

  // ─────────────────────────────────────────────
  // INDEXATION PERFORMANTE
  // ─────────────────────────────────────────────
  private sitesByRegion = new Map<string, Site[]>();

  private rebuildIndex(): void {
    this.sitesByRegion.clear();

    for (const site of this.sites) {
      const raw = site.region || site.city || site.address || '';
      const norm = this.normalize(raw);
      const region = this.REGION_ALIASES[norm] || norm;

      if (!this.sitesByRegion.has(region)) {
        this.sitesByRegion.set(region, []);
      }

      this.sitesByRegion.get(region)!.push(site);
    }
  }

  getSitesInRegion(regionId: string): Site[] {
    return this.sitesByRegion.get(this.normalize(regionId)) || [];
  }

  // ─────────────────────────────────────────────
  // EVENTS MAP
  // ─────────────────────────────────────────────
  private bindFeatureEvents(feature: GeoJSON.Feature, layer: L.Layer): void {
    const props = feature.properties as any;
    const name = props['NAME_1'] || props['admin1Name'] || '';
    const rid = this.getRegionId(props);

    (layer as L.Path).bindTooltip(name, { sticky: true });

    layer.on({
      mouseover: (e) => (e.target as L.Path).setStyle(this.hoverStyle),
      mouseout: (e) => this.geoJsonLayer.resetStyle(e.target),
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

  // ─────────────────────────────────────────────
  // PANEL ACTIONS
  // ─────────────────────────────────────────────
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

  // ─────────────────────────────────────────────
  // FALLBACK GEOJSON
  // ─────────────────────────────────────────────
  private buildFallbackGeoJson(): GeoJSON.FeatureCollection {
    return {
      type: 'FeatureCollection',
      features: [],
    };
  }
}