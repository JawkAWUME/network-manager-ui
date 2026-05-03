import { Component, Input, Output, EventEmitter, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Site } from '../../models';

interface Region {
  id: string;
  name: string;
  path: string;
  coordinates: { x: number; y: number };
}

@Component({
  selector: 'app-senegal-map',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './senegal-map.component.html',
  styleUrls: ['./senegal-map.component.css']
})
export class SenegalMapComponent {
  @Input() sites: Site[] = [];
  @Output() siteSelected = new EventEmitter<Site>();
  
  selectedRegion = signal<string | null>(null);
  hoveredRegion = signal<string | null>(null);
  
  // Définition des 14 régions du Sénégal avec leurs coordonnées approximatives
  regions: Region[] = [
    {
      id: 'dakar',
      name: 'Dakar',
      path: 'M 180,280 L 185,275 L 190,280 L 195,285 L 190,290 L 185,288 Z',
      coordinates: { x: 188, y: 283 }
    },
    {
      id: 'thies',
      name: 'Thiès',
      path: 'M 195,285 L 200,275 L 220,270 L 230,275 L 235,285 L 225,295 L 210,298 L 200,295 Z',
      coordinates: { x: 215, y: 285 }
    },
    {
      id: 'diourbel',
      name: 'Diourbel',
      path: 'M 235,285 L 245,275 L 270,270 L 280,280 L 275,295 L 260,300 L 240,298 Z',
      coordinates: { x: 255, y: 285 }
    },
    {
      id: 'fatick',
      name: 'Fatick',
      path: 'M 225,295 L 235,300 L 245,315 L 240,330 L 220,335 L 210,325 L 215,310 Z',
      coordinates: { x: 230, y: 318 }
    },
    {
      id: 'kaolack',
      name: 'Kaolack',
      path: 'M 240,298 L 260,300 L 275,310 L 280,325 L 270,340 L 250,345 L 240,330 Z',
      coordinates: { x: 260, y: 320 }
    },
    {
      id: 'kaffrine',
      name: 'Kaffrine',
      path: 'M 275,295 L 290,290 L 310,295 L 320,310 L 315,330 L 295,335 L 280,325 Z',
      coordinates: { x: 300, y: 315 }
    },
    {
      id: 'louga',
      name: 'Louga',
      path: 'M 230,230 L 250,220 L 280,215 L 300,225 L 305,245 L 290,260 L 270,265 L 245,260 Z',
      coordinates: { x: 270, y: 240 }
    },
    {
      id: 'matam',
      name: 'Matam',
      path: 'M 420,180 L 450,175 L 475,185 L 485,205 L 475,225 L 450,230 L 425,220 Z',
      coordinates: { x: 455, y: 205 }
    },
    {
      id: 'saint-louis',
      name: 'Saint-Louis',
      path: 'M 250,150 L 270,140 L 300,145 L 320,160 L 315,180 L 290,190 L 265,185 Z',
      coordinates: { x: 285, y: 165 }
    },
    {
      id: 'tambacounda',
      name: 'Tambacounda',
      path: 'M 380,240 L 420,235 L 460,245 L 480,265 L 475,290 L 445,300 L 410,295 L 385,280 Z',
      coordinates: { x: 430, y: 270 }
    },
    {
      id: 'kedougou',
      name: 'Kédougou',
      path: 'M 445,300 L 475,305 L 500,320 L 510,345 L 500,370 L 470,375 L 445,360 L 440,335 Z',
      coordinates: { x: 475, y: 340 }
    },
    {
      id: 'kolda',
      name: 'Kolda',
      path: 'M 315,330 L 345,335 L 375,350 L 385,370 L 375,390 L 345,395 L 320,385 L 310,365 Z',
      coordinates: { x: 350, y: 365 }
    },
    {
      id: 'sedhiou',
      name: 'Sédhiou',
      path: 'M 270,340 L 295,345 L 315,360 L 320,385 L 310,405 L 280,410 L 260,395 L 255,370 Z',
      coordinates: { x: 290, y: 375 }
    },
    {
      id: 'ziguinchor',
      name: 'Ziguinchor',
      path: 'M 220,385 L 245,390 L 270,405 L 275,425 L 265,445 L 240,450 L 215,440 L 210,420 Z',
      coordinates: { x: 245, y: 420 }
    }
  ];

  getSitesInRegion(regionId: string): Site[] {
    return this.sites.filter(site => {
      // Logique de mapping région/site basée sur la ville ou une propriété region
      const cityToRegion: Record<string, string> = {
        'dakar': 'dakar',
        'thies': 'thies',
        'thiès': 'thies',
        'saint-louis': 'saint-louis',
        'kaolack': 'kaolack',
        'ziguinchor': 'ziguinchor',
        'louga': 'louga',
        'matam': 'matam',
        'fatick': 'fatick',
        'kaffrine': 'kaffrine',
        'kolda': 'kolda',
        'tambacounda': 'tambacounda',
        'kedougou': 'kedougou',
        'kédougou': 'kedougou',
        'sedhiou': 'sedhiou',
        'sédhiou': 'sedhiou',
        'diourbel': 'diourbel'
      };
      
      const siteCity = (site.city || '').toLowerCase().trim();
      return cityToRegion[siteCity] === regionId;
    });
  }

  onRegionClick(region: Region): void {
    const currentSelected = this.selectedRegion();
    if (currentSelected === region.id) {
      this.selectedRegion.set(null);
    } else {
      this.selectedRegion.set(region.id);
    }
  }

  onRegionHover(regionId: string | null): void {
    this.hoveredRegion.set(regionId);
  }

  onSiteClick(site: Site, event: Event): void {
    event.stopPropagation();
    this.siteSelected.emit(site);
  }

  getRegionClass(regionId: string): string {
    const sitesCount = this.getSitesInRegion(regionId).length;
    if (sitesCount === 0) return 'region-empty';
    if (sitesCount <= 2) return 'region-low';
    if (sitesCount <= 5) return 'region-medium';
    return 'region-high';
  }
}