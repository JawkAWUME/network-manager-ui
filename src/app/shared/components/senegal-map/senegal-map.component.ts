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
    const sources = [
      'https://raw.githubusercontent.com/dreampnx/senegal-geojson/main/senegal_regions.geojson',
      'https://raw.githubusercontent.com/giulioscibilia/senegal-administrative-boundaries/main/regions.geojson',
      'assets/geojson/senegal-regions.geojson',
    ];

    this.tryFetch(sources, 0);
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

    this.map.fitBounds(this.geoJsonLayer.getBounds(), { padding: [24, 24] });
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
    const name = props['NAME_1'] || props['admin1Name'] || props['name'] || props['NAME'] || '';
    return (
      this.REGION_MAP[name] ||
      name.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, '-')
    );
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
    // (inchangé, pour la lisibilité je le laisse comme dans votre code)
    const regions = [ /* ... */ ] as any;
    return {
      type: 'FeatureCollection',
      features: regions.map((r: any) => ({
        type: 'Feature',
        properties: { NAME_1: r.n, id: r.id },
        geometry: { type: 'Polygon', coordinates: r.c },
      })),
    };
  }
}