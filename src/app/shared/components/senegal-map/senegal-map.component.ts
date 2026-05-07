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

  // UI state
  loadingGeoJson = signal(false);
  geoJsonStep = signal<string>('idle');
  geoJsonError = signal<string | null>(null);
  selectedRegionName = signal<string | null>(null);
  selectedRegionId = signal<string | null>(null);
  panelOpen = signal(false);

  private map!: L.Map;
  private geoJsonLayer!: L.GeoJSON;
  private selectedLayer: L.Layer | null = null;
  private sitesMarkersLayer = L.featureGroup();
  private mapReady = false; // ← indicateur de disponibilité de la carte

  // Styles
  private getColor(count: number): string {
    if (count === 0) return '#f0f4f8';
    if (count <= 2) return '#b2dfdb';
    if (count <= 5) return '#4db6ac';
    return '#00796b';
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

  ngAfterViewInit(): void {
    this.initMap();
    this.loadGeoJson();
  }

  ngOnDestroy(): void {
    this.map?.remove();
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['sites']) {
      console.log('[DEBUG] sites input changed, length =', this.sites.length);
      // Reconstruire l'index des régions et rafraîchir le style
      if (this.geoJsonLayer) {
        this.rebuildIndex();
        this.geoJsonLayer.setStyle((f) => this.defaultStyle(f as any));
      }
      // Toujours tenter la mise à jour des marqueurs
      this.updateSiteMarkers();
    }
  }

  private initMap(): void {
    this.map = L.map('senegal-map', {
      center: [14.5, -14.5],
      zoom: 6,
      maxBounds: L.latLngBounds([10.5, -18], [17, -10.5]),
      maxBoundsViscosity: 0.85,
    });

    L.tileLayer(
      'https://{s}.basemaps.cartocdn.com/light_nolabels/{z}/{x}/{y}{r}.png',
      { attribution: '&copy; OpenStreetMap contributors' }
    ).addTo(this.map);

    this.sitesMarkersLayer.addTo(this.map);
    this.mapReady = true;
    console.log('[DEBUG] map initialized');
    // Si des sites sont déjà arrivés, on les affiche tout de suite
    this.updateSiteMarkers();
  }

  // ── Marqueurs de sites ─────────────────────────────
  private updateSiteMarkers(): void {
    if (!this.mapReady) {
      console.warn('[DEBUG] map not ready yet, markers update postponed');
      return;
    }

    console.log('[DEBUG] updating markers, total sites in input:', this.sites.length);
    this.sitesMarkersLayer.clearLayers();
    let placed = 0;
    let missingCoords = 0;

    for (const site of this.sites) {
      if (!site.latitude || !site.longitude) {
        missingCoords++;
        console.warn('[DEBUG] missing coords for site', site.name);
        continue;
      }

      const totalEquipments =
        (site.firewalls_count ?? 0) +
        (site.routers_count ?? 0) +
        (site.switches_count ?? 0);

      const icon = L.divIcon({
        className: 'site-marker',
        html: `<div class="marker-pin">
                 <span class="marker-count">${totalEquipments}</span>
               </div>`,
        iconSize: [36, 36],
        iconAnchor: [18, 34],
        popupAnchor: [0, -34],
      });

      const marker = L.marker([site.latitude, site.longitude], { icon })
        .bindTooltip(site.name, { direction: 'top', offset: [0, -25] });

      marker.on('click', () => {
        console.log('[DEBUG] marker clicked -> siteSelected emit', site);
        this.siteSelected.emit(site);
      });

      this.sitesMarkersLayer.addLayer(marker);
      placed++;
    }

    console.log(`[DEBUG] markers placed: ${placed} / missing coords: ${missingCoords}`);

    if (placed > 0) {
      const bounds = this.sitesMarkersLayer.getBounds();
      if (bounds.isValid() && !this.map.getBounds().contains(bounds)) {
        this.map.fitBounds(bounds, { padding: [50, 50], maxZoom: 12 });
      }
    } else {
      console.warn('[DEBUG] no markers added – check Site.latitude / Site.longitude in API response');
    }
  }

  // ── GeoJSON loading ─────────────────────────────
  private async loadGeoJson(): Promise<void> {
    try {
      this.loadingGeoJson.set(true);
      this.geoJsonStep.set('Chargement GeoJSON...');

      const response = await fetch('assets/geojson/senegal-regions.geojson');
      if (!response.ok) throw new Error(`HTTP ${response.status}`);

      const data = await response.json();
      this.renderGeoJson(data);
    } catch (err: any) {
      this.geoJsonError.set(err.message);
    } finally {
      this.loadingGeoJson.set(false);
    }
  }

  private renderGeoJson(data: GeoJSON.FeatureCollection): void {
    this.geoJsonLayer = L.geoJSON(data, {
      style: (f) => this.defaultStyle(f as any),
      onEachFeature: (feature, layer) => this.bindFeatureEvents(feature, layer),
    }).addTo(this.map);

    const bounds = this.geoJsonLayer.getBounds();
    if (bounds.isValid()) {
      this.map.fitBounds(bounds, { padding: [20, 20] });
    }

    this.rebuildIndex();
    // Mise à jour des marqueurs après le chargement du GeoJSON
    this.updateSiteMarkers();
  }

  // ── Region logic ─────────────────────────────────
  private normalize(value: string): string {
    return (value || '')
      .toLowerCase()
      .trim()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-zA-Z0-9\s-]/g, '')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-');
  }

  private getRegionId(props: Record<string, any>): string {
    const raw = props['adm1_name'] || props['NAME_1'] || '';
    return this.normalize(raw);
  }

  private extractRegion(site: Site): string {
    const raw = site.city || site.address || '';
    const norm = this.normalize(raw);

    if (norm.includes('dakar')) return 'dakar';
    if (norm.includes('thies')) return 'thies';
    if (norm.includes('diourbel')) return 'diourbel';
    if (norm.includes('fatick')) return 'fatick';
    if (norm.includes('kaffrine')) return 'kaffrine';
    if (norm.includes('kaolack')) return 'kaolack';
    if (norm.includes('louga')) return 'louga';
    if (norm.includes('matam')) return 'matam';
    if (norm.includes('kedougou')) return 'kedougou';
    if (norm.includes('kolda')) return 'kolda';
    if (norm.includes('sedhiou')) return 'sedhiou';
    if (norm.includes('ziguinchor')) return 'ziguinchor';
    if (norm.includes('saint-louis')) return 'saint-louis';

    return norm;
  }

  private sitesByRegion = new Map<string, Site[]>();

  private rebuildIndex(): void {
    this.sitesByRegion.clear();
    for (const site of this.sites) {
      const region = this.extractRegion(site);
      if (!region) continue;
      if (!this.sitesByRegion.has(region)) {
        this.sitesByRegion.set(region, []);
      }
      this.sitesByRegion.get(region)!.push(site);
    }
  }

  getSitesInRegion(regionId: string | null): Site[] {
    if (!regionId) return [];
    return this.sitesByRegion.get(this.normalize(regionId)) ?? [];
  }

  // ── GeoJSON styles & events ─────────────────────
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

  private bindFeatureEvents(feature: GeoJSON.Feature, layer: L.Layer): void {
    const props = feature.properties as any;
    const name = props['adm1_name'] || props['NAME_1'] || '';
    const rid = this.getRegionId(props);

    (layer as L.Path).bindTooltip(name, { sticky: true });

    layer.on({
      mouseover: (e) => (e.target as L.Path).setStyle(this.hoverStyle),
      mouseout: (e) => this.geoJsonLayer.resetStyle(e.target),
      click: (e) => {
        this.selectedLayer = e.target;
        (e.target as L.Path).setStyle(this.selectedStyle).bringToFront();
        this.selectedRegionName.set(name);
        this.selectedRegionId.set(rid);
        this.panelOpen.set(true);
      },
    });
  }

  // ── Panel actions ───────────────────────────────
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
}