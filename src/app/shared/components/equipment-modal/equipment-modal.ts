import {
  Component, Input, Output, EventEmitter,
  signal, OnChanges, SimpleChanges,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { forkJoin, of } from 'rxjs';
import { ApiService } from '../../../core/services/api.service';
import { AuthService } from '../../../core/services/auth.service';
import { Firewall, Router, Site, Switch } from '../../../shared/models';

export type ModalType = 'firewall' | 'router' | 'switch' | 'site' | 'user' | null;

@Component({
  selector: 'app-equipment-modal',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './equipment-modal.html',
  styleUrls: ['./equipment-modal.css'],
})
export class EquipmentModalComponent implements OnChanges {
  @Input() type: ModalType = null;
  @Input() editData: any = null;
  @Input() sites: Site[] = [];
  @Input() allFirewalls: Firewall[] = [];
  @Input() allRouters: Router[] = [];
  @Input() allSwitches: Switch[] = [];
  @Output() close  = new EventEmitter<void>();
  @Output() saved  = new EventEmitter<void>();

  form: Record<string, any> = {};
  loading = signal(false);
  error   = signal('');
  success = signal('');

  selectedSwitchesIds:  number[] = [];
  selectedRoutersIds:   number[] = [];
  selectedFirewallsIds: number[] = [];
  lastAdded: { name: string; type: string } | null = null;

  // État initial pour détecter les changements d'associations
  private initialSwitches: number[] = [];
  private initialRouters: number[] = [];
  private initialFirewalls: number[] = [];

  detailTab: 'switches' | 'routers' | 'firewalls' = 'switches';
  addTab:    'switches' | 'routers' | 'firewalls' = 'switches';

  showPassword       = signal(false);
  showEnablePassword = signal(false);

  get isEdit(): boolean { return !!this.editData?.id; }

  constructor(private api: ApiService, public auth: AuthService) {}

  ngOnChanges(ch: SimpleChanges): void {
    if (ch['type'] || ch['editData']) {
      this.error.set('');
      this.success.set('');
      this.showPassword.set(false);
      this.showEnablePassword.set(false);

      // Réinitialiser les sélections
      this.selectedSwitchesIds  = [];
      this.selectedRoutersIds   = [];
      this.selectedFirewallsIds = [];

      if (this.editData) {
        // Copie des données existantes
        this.form = { ...this.editData, password: '', enable_password: '' };

        // Normalisation du statut
        if (this.form['status'] !== undefined) {
          this.form['status'] = this.normalizeStatus(this.form['status']);
        }

        // Si on édite un site, on pré-remplit les sélections d'équipements associés
        if (this.type === 'site') {
          this.selectedSwitchesIds  = this.allSwitches.filter(eq => eq.site_id === this.editData.id).map(eq => eq.id);
          this.selectedRoutersIds   = this.allRouters.filter(eq => eq.site_id === this.editData.id).map(eq => eq.id);
          this.selectedFirewallsIds = this.allFirewalls.filter(eq => eq.site_id === this.editData.id).map(eq => eq.id);

          // Sauvegarde de l'état initial pour comparer plus tard
          this.initialSwitches  = [...this.selectedSwitchesIds];
          this.initialRouters   = [...this.selectedRoutersIds];
          this.initialFirewalls = [...this.selectedFirewallsIds];
        }
      } else {
        // Création : valeurs par défaut
        const defaultForm: Record<string, any> = {};
        if (this.type === 'user') {
          defaultForm['is_active'] = true;
          defaultForm['role']      = 'agent';
        } else {
          defaultForm['status'] = 'active';
        }
        this.form = defaultForm;
      }
    }
  }

  private normalizeStatus(value: any): string {
    if (value === true  || value === 1)    return 'active';
    if (value === false || value === 0)    return 'danger';
    if (typeof value === 'string' && value.trim() !== '') return value;
    return 'active';
  }

  headerIcon(): string {
    return {
      firewall: 'fa-fire', router: 'fa-route', switch: 'fa-exchange-alt',
      site: 'fa-building', user: 'fa-user',
    }[this.type!] ?? 'fa-server';
  }

  typeLabel(): string {
    return {
      firewall: 'Firewall', router: 'Routeur', switch: 'Switch',
      site: 'Site', user: 'Utilisateur',
    }[this.type!] ?? '';
  }

  onOverlayClick(e: MouseEvent): void {
    if ((e.target as HTMLElement).classList.contains('modal-overlay')) this.close.emit();
  }

  togglePasswordVisibility():       void { this.showPassword.set(!this.showPassword()); }
  toggleEnablePasswordVisibility(): void { this.showEnablePassword.set(!this.showEnablePassword()); }

  onSave(): void {
    if (!this.form['name'] && this.type !== 'user') {
      this.error.set('Le champ Nom est requis.');
      return;
    }
    if (this.type === 'user' && !this.form['name']) {
      this.error.set('Le champ Nom complet est requis.');
      return;
    }

    this.loading.set(true);
    this.error.set('');
    this.success.set('');

    const cleaned = this.cleanForm();

    if (cleaned['status'] !== undefined) {
      cleaned['status'] = this.normalizeStatus(cleaned['status']);
    }

    // Opération principale (création ou mise à jour de l'entité)
    const mainOp = this.isEdit ? this.updateCall(cleaned) : this.createCall(cleaned);

    // Si c'est un site en édition, on doit également sauvegarder les associations d'équipements
    const equipOp = (this.type === 'site' && this.isEdit) ? this.saveEquipmentAssociations() : of(null);

    forkJoin([mainOp, equipOp]).subscribe({
      next: () => {
        this.success.set('Opération réussie');
        this.loading.set(false);
        this.saved.emit();
      },
      error: (err) => {
        this.error.set(err?.error?.message || 'Une erreur est survenue');
        this.loading.set(false);
      }
    });
  }

  private saveEquipmentAssociations() {
    const siteId = this.editData.id;
    const tasks: any[] = [];

    // Ajouts (sélectionnés mais pas dans l'état initial)
    const addedSwitches  = this.selectedSwitchesIds.filter(id => !this.initialSwitches.includes(id));
    const addedRouters   = this.selectedRoutersIds.filter(id => !this.initialRouters.includes(id));
    const addedFirewalls = this.selectedFirewallsIds.filter(id => !this.initialFirewalls.includes(id));

    addedSwitches.forEach(id => tasks.push(this.api.updateSwitch(id, { site_id: siteId })));
    addedRouters.forEach(id  => tasks.push(this.api.updateRouter(id, { site_id: siteId })));
    addedFirewalls.forEach(id => tasks.push(this.api.updateFirewall(id, { site_id: siteId })));

    // Dissociations (présentes dans l'état initial mais plus sélectionnées)
    const removedSwitches  = this.initialSwitches.filter(id => !this.selectedSwitchesIds.includes(id));
    const removedRouters   = this.initialRouters.filter(id => !this.selectedRoutersIds.includes(id));
    const removedFirewalls = this.initialFirewalls.filter(id => !this.selectedFirewallsIds.includes(id));

    removedSwitches.forEach(id => tasks.push(this.api.updateSwitch(id, { site_id: undefined })));
    removedRouters.forEach(id  => tasks.push(this.api.updateRouter(id, { site_id: undefined })));
    removedFirewalls.forEach(id => tasks.push(this.api.updateFirewall(id, { site_id: undefined })));

    return tasks.length ? forkJoin(tasks) : of(null);
  }

  private createCall(data: any) {
    switch (this.type) {
      case 'firewall': return this.api.createFirewall(data);
      case 'router':   return this.api.createRouter(data);
      case 'switch':   return this.api.createSwitch(data);
      case 'site':     return this.api.createSite(data);
      case 'user':     return this.api.createUser(data);
      default: throw new Error('type inconnu');
    }
  }

  private updateCall(data: any) {
    const id = this.editData.id;
    switch (this.type) {
      case 'firewall': return this.api.updateFirewall(id, data);
      case 'router':   return this.api.updateRouter(id, data);
      case 'switch':   return this.api.updateSwitch(id, data);
      case 'site':     return this.api.updateSite(id, data);
      case 'user':     return this.api.updateUser(id, data);
      default: throw new Error('type inconnu');
    }
  }

  // ── Gestion des équipements associés à un site ──────────────────────
  associatedSwitches(): Switch[] {
    const ids = new Set(this.selectedSwitchesIds);
    return this.allSwitches.filter(eq => eq.site_id === this.editData?.id || ids.has(eq.id));
  }
  associatedRouters(): Router[] {
    const ids = new Set(this.selectedRoutersIds);
    return this.allRouters.filter(eq => eq.site_id === this.editData?.id || ids.has(eq.id));
  }
  associatedFirewalls(): Firewall[] {
    const ids = new Set(this.selectedFirewallsIds);
    return this.allFirewalls.filter(eq => eq.site_id === this.editData?.id || ids.has(eq.id));
  }

  availableSwitches(): Switch[] {
    const associated = new Set(this.associatedSwitches().map(e => e.id));
    return this.allSwitches.filter(e => !associated.has(e.id));
  }
  availableRouters(): Router[] {
    const associated = new Set(this.associatedRouters().map(e => e.id));
    return this.allRouters.filter(e => !associated.has(e.id));
  }
  availableFirewalls(): Firewall[] {
    const associated = new Set(this.associatedFirewalls().map(e => e.id));
    return this.allFirewalls.filter(e => !associated.has(e.id));
  }

  totalAssociated(): number {
    return this.associatedSwitches().length + this.associatedRouters().length + this.associatedFirewalls().length;
  }

  toggleEquipment(type: 'switches' | 'routers' | 'firewalls', id: number, name: string): void {
    const ids       = this.getSelectedIds(type);
    const associated = new Set(this.getAssociated(type).map(e => e.id));
    if (associated.has(id)) {
      this.removeId(type, id);
      this.lastAdded = null;
      return;
    }
    if (!ids.includes(id)) {
      ids.push(id);
      this.lastAdded = { name, type };
    }
  }

  private getSelectedIds(type: 'switches' | 'routers' | 'firewalls'): number[] {
    if (type === 'switches')  return this.selectedSwitchesIds;
    if (type === 'routers')   return this.selectedRoutersIds;
    return this.selectedFirewallsIds;
  }
  private getAssociated(type: 'switches' | 'routers' | 'firewalls'): any[] {
    if (type === 'switches')  return this.associatedSwitches();
    if (type === 'routers')   return this.associatedRouters();
    return this.associatedFirewalls();
  }
  private removeId(type: 'switches' | 'routers' | 'firewalls', id: number): void {
    if (type === 'switches')  this.selectedSwitchesIds  = this.selectedSwitchesIds.filter(x => x !== id);
    if (type === 'routers')   this.selectedRoutersIds   = this.selectedRoutersIds.filter(x => x !== id);
    if (type === 'firewalls') this.selectedFirewallsIds = this.selectedFirewallsIds.filter(x => x !== id);
  }

  private cleanForm(): Record<string, any> {
    const cleaned = Object.fromEntries(
      Object.entries(this.form)
        .filter(([key, v]) => {
          // Exclure les clés de relations et les valeurs vides/nulles
          if (key === 'site' || key === 'user' || key === 'configuration_histories' || key.startsWith('__')) {
            return false;
          }
          return v !== '' && v !== null && v !== undefined;
        })
    );
    // Convertir site_id en nombre si présent
    if (cleaned['site_id'] !== undefined) {
      cleaned['site_id'] = Number(cleaned['site_id']);
    }
    return cleaned;
  }
}