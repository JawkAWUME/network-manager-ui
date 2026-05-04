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

  /** Mapping nom de région → identifiant interne */
  private readonly REGION_MAP: Record<string, string> = {
    'Saint-Louis': 'saint-louis',
    Louga: 'louga',
    Matam: 'matam',
    Dakar: 'dakar',
    Thiès: 'thies',
    Diourbel: 'diourbel',
    Fatick: 'fatick',
    Kaolack: 'kaolack',
    Kaffrine: 'kaffrine',
    Tambacounda: 'tambacounda',
    Kédougou: 'kedougou',
    Kolda: 'kolda',
    Sédhiou: 'sedhiou',
    Ziguinchor: 'ziguinchor',
  };

  /** Mapping ville → région (fallback si site.region absent) */
  private readonly CITY_TO_REGION: Record<string, string> = {
    'saint-louis': 'saint-louis', 'saint louis': 'saint-louis', dagana: 'saint-louis', podor: 'saint-louis',
    louga: 'louga', 'kébémer': 'louga', kebemer: 'louga', 'linguère': 'louga', linguere: 'louga',
    matam: 'matam', kanel: 'matam', 'ranérou': 'matam', ranerou: 'matam',
    dakar: 'dakar', pikine: 'dakar', 'guédiawaye': 'dakar', guediawaye: 'dakar', rufisque: 'dakar',
    thies: 'thies', 'thiès': 'thies', tivaouane: 'thies', mbour: 'thies',
    diourbel: 'diourbel', bambey: 'diourbel', 'mbacké': 'diourbel', mbacke: 'diourbel', touba: 'diourbel',
    fatick: 'fatick', foundiougne: 'fatick', gossas: 'fatick',
    kaolack: 'kaolack', 'nioro du rip': 'kaolack', 'guinguinéo': 'kaolack', guinguineo: 'kaolack',
    kaffrine: 'kaffrine', birkelane: 'kaffrine', koungheul: 'kaffrine', 'malem-hodar': 'kaffrine',
    tambacounda: 'tambacounda', bakel: 'tambacounda', goudiry: 'tambacounda', koumpentoum: 'tambacounda',
    kedougou: 'kedougou', 'kédougou': 'kedougou', saraya: 'kedougou', 'salémata': 'kedougou', salemata: 'kedougou',
    kolda: 'kolda', 'vélingara': 'kolda', velingara: 'kolda', 'médina yoro foulah': 'kolda',
    sedhiou: 'sedhiou', 'sédhiou': 'sedhiou', goudomp: 'sedhiou', bounkiling: 'sedhiou',
    ziguinchor: 'ziguinchor', bignona: 'ziguinchor', oussouye: 'ziguinchor',
  };

  // ─── Couleurs choroplèthe ──────────────────────────────────────────────────

  private getColor(count: number): string {
    if (count === 0) return '#dce8f5';
    if (count <= 2) return '#a8d5b5';
    if (count <= 5) return '#3aaa62';
    return '#1c6e3d';
  }

  // ✅ Correction du type de retour : utilise désormais L.PathOptions (compatible Leaflet)
  private defaultStyle(feature: GeoJSON.Feature): L.PathOptions {
    const rid = this.getRegionId(feature.properties as Record<string, string>);
    const n = this.getSitesInRegion(rid).length;
    return {
      fillColor: this.getColor(n),
      fillOpacity: 0.72,
      weight: 2,
      color: '#003087',
      dashArray: undefined, // => OK pour L.PathOptions
    };
  }

  // ✅ Ces styles sont maintenant de type L.PathOptions
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

  // ─── Lifecycle ─────────────────────────────────────────────────────────────

  ngAfterViewInit(): void {
    this.initMap();
    this.loadGeoJson();
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['sites'] && !changes['sites'].firstChange && this.geoJsonLayer) {
      this.geoJsonLayer.setStyle((f) => this.defaultStyle(f as GeoJSON.Feature));
    }
  }

  ngOnDestroy(): void {
    this.map?.remove();
  }

  // ─── Initialisation de la carte ────────────────────────────────────────────

  private initMap(): void {
    this.map = L.map('senegal-map', {
      center: [14.5, 14.5],
      zoom: 6,
      zoomControl: true,
      attributionControl: true,
    });

    L.tileLayer('https://{s}.basemaps.cartocdn.com/light_nolabels/{z}/{x}/{y}{r}.png', {
      attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> © <a href="https://carto.com">CARTO</a>',
      maxZoom: 18,
    }).addTo(this.map);
  }

  // ─── Chargement GeoJSON avec fallback ─────────────────────────────────────
private loadGeoJson(): void {
  fetch('assets/geojson/senegal-regions.geojson')
    .then(r => r.json())
    .then(data => this.renderGeoJson(data))
    .catch(() => this.renderGeoJson(this.buildFallbackGeoJson()));
}

  private tryFetch(sources: string[], index: number): void {
    if (index >= sources.length) {
      console.warn('Toutes les sources GeoJSON ont échoué, chargement du fallback intégré.');
      this.renderGeoJson(this.buildFallbackGeoJson());
      return;
    }

    fetch(sources[index])
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((data) => this.renderGeoJson(data))
      .catch(() => this.tryFetch(sources, index + 1));
  }

  // ─── Rendu des polygones ───────────────────────────────────────────────────

  private renderGeoJson(data: GeoJSON.FeatureCollection): void {
    this.geoJsonLayer = L.geoJSON(data, {
      style: (f) => this.defaultStyle(f as GeoJSON.Feature),
      onEachFeature: (feature, layer) => this.bindFeatureEvents(feature, layer),
    }).addTo(this.map);
const bounds = this.geoJsonLayer.getBounds();

if (bounds.isValid()) {
  this.map.fitBounds(bounds, { padding: [24, 24] });
}
  }

  private bindFeatureEvents(feature: GeoJSON.Feature, layer: L.Layer): void {
    const props = feature.properties as Record<string, string>;
    const name = props['NAME_1'] || props['admin1Name'] || props['name'] || props['NAME'] || '';
    const rid = this.getRegionId(props);
    const n = this.getSitesInRegion(rid).length;

    (layer as L.Path).bindTooltip(
      `<strong>${name}</strong><br>${n} site${n !== 1 ? 's' : ''}`,
      { className: 'senegal-tooltip', sticky: true, direction: 'top', offset: [0, -4] }
    );

    layer.on({
      mouseover: (e) => {
        const l = e.target as L.Path;
        if (l !== this.selectedLayer) l.setStyle(this.hoverStyle);
      },
      mouseout: (e) => {
        const l = e.target as L.Path;
        if (l !== this.selectedLayer) this.geoJsonLayer.resetStyle(l);
      },
      click: (e) => {
        L.DomEvent.stopPropagation(e);
        if (this.selectedLayer && this.selectedLayer !== e.target) {
          this.geoJsonLayer.resetStyle(this.selectedLayer as L.Path);
        }
        this.selectedLayer = e.target;
        (e.target as L.Path).setStyle(this.selectedStyle);
        (e.target as L.Path).bringToFront();
        this.selectedRegionName.set(name);
        this.selectedRegionId.set(rid);
        this.panelOpen.set(true);
      },
    });
  }

  // ─── Données ───────────────────────────────────────────────────────────────

  private getRegionId(props: Record<string, string>): string {
  const name = props['NAME_1'] || props['admin1Name'] || props['region'] || '';
  return this.REGION_MAP[name] || name.toLowerCase().replace(/\s+/g, '-');
}

  getSitesInRegion(regionId: string): Site[] {
    return this.sites.filter((site) => {
      if (site.region) return site.region.toLowerCase() === regionId;
      const city = (site.city || '').toLowerCase().trim();
      return this.CITY_TO_REGION[city] === regionId;
    });
  }

  // ─── Actions panel ─────────────────────────────────────────────────────────

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

  // ─── GeoJSON de secours (approximatif) ────────────────────────────────────

  private buildFallbackGeoJson(): GeoJSON.FeatureCollection {
  const regions: { n: string; c: number[][][] }[] = [
    { n: 'Dakar',         c: [[[-17.53,14.60],[-17.13,14.84],[-17.27,14.84],[-17.44,14.75],[-17.53,14.60]]] },
    { n: 'Thiès',         c: [[[-17.13,14.84],[-16.50,15.10],[-16.10,14.95],[-15.90,14.80],[-16.10,14.50],[-16.77,14.50],[-17.13,14.84]]] },
    { n: 'Saint-Louis',   c: [[[-17.00,16.55],[-14.70,16.55],[-14.70,15.80],[-15.20,15.20],[-15.70,15.00],[-16.50,15.10],[-17.00,15.50],[-17.00,16.55]]] },
    { n: 'Louga',         c: [[[-17.00,15.50],[-16.50,15.10],[-15.70,15.00],[-15.20,15.20],[-14.70,15.00],[-14.90,14.60],[-15.50,14.40],[-16.10,14.50],[-16.50,15.10],[-17.00,15.50]]] },
    { n: 'Matam',         c: [[[-15.20,15.80],[-13.30,15.60],[-13.00,15.30],[-13.30,14.80],[-14.20,14.70],[-14.70,15.00],[-15.20,15.20],[-14.70,15.80],[-15.20,15.80]]] },
    { n: 'Diourbel',      c: [[[-16.10,14.50],[-15.50,14.40],[-15.10,14.20],[-15.30,13.90],[-15.90,14.00],[-16.10,14.20],[-16.10,14.50]]] },
    { n: 'Fatick',        c: [[[-16.77,14.50],[-16.10,14.50],[-16.10,14.20],[-15.90,14.00],[-15.30,13.90],[-15.10,14.20],[-15.50,14.40],[-16.10,14.50],[-16.77,14.50]]] },
    { n: 'Kaolack',       c: [[[-16.10,14.20],[-15.90,14.00],[-15.10,14.20],[-14.80,14.00],[-14.80,13.70],[-15.50,13.60],[-16.00,13.80],[-16.10,14.20]]] },
    { n: 'Kaffrine',      c: [[[-15.10,14.20],[-14.80,14.00],[-14.30,13.80],[-13.70,13.90],[-13.50,13.60],[-14.00,13.40],[-14.80,13.50],[-15.50,13.60],[-14.80,14.00],[-15.10,14.20]]] },
    { n: 'Tambacounda',   c: [[[-14.20,14.70],[-13.30,14.80],[-13.00,14.50],[-12.30,14.00],[-12.30,13.40],[-13.20,13.00],[-13.50,13.60],[-13.70,13.90],[-14.30,13.80],[-14.80,14.00],[-14.80,13.50],[-14.20,14.70]]] },
    { n: 'Kédougou',      c: [[[-13.20,13.00],[-12.30,13.40],[-11.80,12.70],[-12.20,12.10],[-13.00,12.10],[-13.50,12.60],[-13.20,13.00]]] },
    { n: 'Kolda',         c: [[[-14.80,13.50],[-14.00,13.40],[-13.50,12.60],[-13.00,12.10],[-13.80,11.90],[-15.00,12.30],[-15.30,12.80],[-15.00,13.20],[-14.80,13.50]]] },
    { n: 'Sédhiou',       c: [[[-16.00,13.80],[-15.50,13.60],[-14.80,13.50],[-15.00,13.20],[-15.30,12.80],[-15.80,12.80],[-16.30,13.10],[-16.40,13.60],[-16.00,13.80]]] },
    { n: 'Ziguinchor',    c: [[[-16.40,13.10],[-15.80,12.80],[-15.30,12.80],[-15.00,12.30],[-15.40,11.90],[-16.10,12.00],[-16.70,12.60],[-16.40,13.10]]] },
  ];

  return {
    type: 'FeatureCollection',
    features: regions.map(r => ({
      type: 'Feature',
      properties: { NAME_1: r.n },
      geometry: { type: 'Polygon', coordinates: r.c },
    })),
  };
}
}