import { Component, Input, Output, EventEmitter, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Site } from '../../models';

interface Region {
  id: string;
  name: string;
  path: string;
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
  
  /**
   * Coordonnées SVG approximatives basées sur la géographie réelle du Sénégal
   * Projection simplifiée des frontières administratives
   */
  regions: Region[] = [
    {
      id: 'saint-louis',
      name: 'Saint-Louis',
      // Nord-Ouest, incluant le delta du fleuve Sénégal
      path: 'M 100,150 L 180,145 L 240,155 L 280,175 L 280,200 L 240,210 L 180,205 L 140,195 L 100,180 Z'
    },
    {
      id: 'louga',
      name: 'Louga',
      // Centre-Nord
      path: 'M 180,205 L 240,210 L 280,200 L 320,200 L 350,215 L 350,250 L 320,265 L 280,260 L 240,250 L 200,245 Z'
    },
    {
      id: 'matam',
      name: 'Matam',
      // Nord-Est, le long du fleuve Sénégal
      path: 'M 380,160 L 480,155 L 580,145 L 620,150 L 650,180 L 650,220 L 600,235 L 520,240 L 450,230 L 380,210 Z'
    },
    {
      id: 'dakar',
      name: 'Dakar',
      // Presqu'île du Cap-Vert (petite région)
      path: 'M 100,240 L 120,238 L 145,245 L 160,260 L 165,280 L 155,295 L 135,300 L 115,290 L 105,270 Z'
    },
    {
      id: 'thies',
      name: 'Thiès',
      // Ouest-Centre
      path: 'M 145,245 L 200,245 L 240,250 L 270,260 L 280,280 L 270,300 L 240,310 L 200,305 L 160,295 L 145,280 Z'
    },
    {
      id: 'diourbel',
      name: 'Diourbel',
      // Centre
      path: 'M 280,200 L 320,200 L 350,215 L 380,210 L 400,220 L 410,245 L 400,270 L 370,280 L 340,275 L 310,270 L 280,260 Z'
    },
    {
      id: 'fatick',
      name: 'Fatick',
      // Centre-Ouest, zone du Sine-Saloum
      path: 'M 160,295 L 200,305 L 240,310 L 270,320 L 280,345 L 270,370 L 240,380 L 200,375 L 170,360 L 150,340 Z'
    },
    {
      id: 'kaolack',
      name: 'Kaolack',
      // Centre
      path: 'M 270,300 L 310,295 L 340,295 L 370,305 L 390,325 L 385,355 L 360,370 L 320,375 L 280,365 L 270,340 Z'
    },
    {
      id: 'kaffrine',
      name: 'Kaffrine',
      // Centre-Est
      path: 'M 370,280 L 410,270 L 450,265 L 490,275 L 510,295 L 505,325 L 480,345 L 440,350 L 400,345 L 370,330 Z'
    },
    {
      id: 'tambacounda',
      name: 'Tambacounda',
      // Est (la plus grande région)
      path: 'M 450,230 L 520,240 L 600,235 L 650,250 L 650,320 L 620,360 L 580,385 L 530,390 L 490,375 L 460,350 L 450,310 Z'
    },
    {
      id: 'kedougou',
      name: 'Kédougou',
      // Sud-Est
      path: 'M 490,375 L 530,390 L 580,395 L 620,410 L 650,440 L 645,480 L 620,510 L 580,525 L 530,520 L 490,500 L 470,465 L 475,420 Z'
    },
    {
      id: 'kolda',
      name: 'Kolda',
      // Sud-Centre
      path: 'M 360,370 L 400,375 L 440,385 L 475,400 L 490,430 L 485,465 L 460,490 L 420,500 L 380,495 L 340,480 L 320,450 Z'
    },
    {
      id: 'sedhiou',
      name: 'Sédhiou',
      // Sud-Ouest
      path: 'M 240,380 L 280,385 L 320,395 L 340,415 L 345,450 L 330,480 L 300,500 L 260,505 L 230,490 L 210,460 L 215,425 Z'
    },
    {
      id: 'ziguinchor',
      name: 'Ziguinchor',
      // Casamance (enclave entre Gambie et Guinée-Bissau)
      path: 'M 150,450 L 210,460 L 230,480 L 250,505 L 260,530 L 240,550 L 200,555 L 160,540 L 130,515 L 120,485 Z'
    }
  ];

  getSitesInRegion(regionId: string): Site[] {
    return this.sites.filter(site => {
      // Mapping ville/région basé sur les données réelles
      const cityToRegion: Record<string, string> = {
        // Saint-Louis
        'saint-louis': 'saint-louis',
        'saint louis': 'saint-louis',
        'dagana': 'saint-louis',
        'podor': 'saint-louis',
        
        // Louga
        'louga': 'louga',
        'kébémer': 'louga',
        'kebemer': 'louga',
        'linguère': 'louga',
        'linguere': 'louga',
        
        // Matam
        'matam': 'matam',
        'kanel': 'matam',
        'ranérou': 'matam',
        'ranerou': 'matam',
        
        // Dakar
        'dakar': 'dakar',
        'pikine': 'dakar',
        'guédiawaye': 'dakar',
        'guediawaye': 'dakar',
        'rufisque': 'dakar',
        
        // Thiès
        'thies': 'thies',
        'thiès': 'thies',
        'tivaouane': 'thies',
        'mbour': 'thies',
        
        // Diourbel
        'diourbel': 'diourbel',
        'bambey': 'diourbel',
        'mbacké': 'diourbel',
        'mbacke': 'diourbel',
        'touba': 'diourbel',
        
        // Fatick
        'fatick': 'fatick',
        'foundiougne': 'fatick',
        'gossas': 'fatick',
        
        // Kaolack
        'kaolack': 'kaolack',
        'nioro du rip': 'kaolack',
        'guinguinéo': 'kaolack',
        'guinguineo': 'kaolack',
        
        // Kaffrine
        'kaffrine': 'kaffrine',
        'birkelane': 'kaffrine',
        'koungheul': 'kaffrine',
        'malem-hodar': 'kaffrine',
        
        // Tambacounda
        'tambacounda': 'tambacounda',
        'bakel': 'tambacounda',
        'goudiry': 'tambacounda',
        'koumpentoum': 'tambacounda',
        
        // Kédougou
        'kedougou': 'kedougou',
        'kédougou': 'kedougou',
        'saraya': 'kedougou',
        'salémata': 'kedougou',
        'salemata': 'kedougou',
        
        // Kolda
        'kolda': 'kolda',
        'vélingara': 'kolda',
        'velingara': 'kolda',
        'médina yoro foulah': 'kolda',
        
        // Sédhiou
        'sedhiou': 'sedhiou',
        'sédhiou': 'sedhiou',
        'goudomp': 'sedhiou',
        'bounkiling': 'sedhiou',
        
        // Ziguinchor
        'ziguinchor': 'ziguinchor',
        'bignona': 'ziguinchor',
        'oussouye': 'ziguinchor'
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

  getRegionName(regionId: string): string {
    const region = this.regions.find(r => r.id === regionId);
    return region?.name || regionId;
  }
}