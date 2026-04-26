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
  private initialSwitches:  number[] = [];
  private initialRouters:   number[] = [];
  private initialFirewalls: number[] = [];

  detailTab: 'switches' | 'routers' | 'firewalls' = 'switches';
  addTab:    'switches' | 'routers' | 'firewalls' = 'switches';

  showPassword       = signal(false);
  showEnablePassword = signal(false);

  get isEdit(): boolean { return !!this.editData?.id; }

  constructor(private api: ApiService, public auth: AuthService) {}

  // ─────────────────────────────────────────────────────────────
  // Cycle de vie
  // ─────────────────────────────────────────────────────────────
  ngOnChanges(ch: SimpleChanges): void {
    if (ch['type'] || ch['editData']) {
      this.error.set('');
      this.success.set('');
      this.showPassword.set(false);
      this.showEnablePassword.set(false);

      // Réinitialiser les sélections et le fichier uploadé
      this.selectedSwitchesIds  = [];
      this.selectedRoutersIds   = [];
      this.selectedFirewallsIds = [];

      if (this.editData) {
        this.form = { ...this.editData, password: '', enable_password: '' };

        // Normalisation du statut (legacy boolean → string)
        if (this.form['status'] !== undefined) {
          this.form['status'] = this.normalizeStatus(this.form['status']);
        }

        // Pré-remplir les associations d'équipements si édition d'un site
        if (this.type === 'site') {
          this.selectedSwitchesIds  = this.allSwitches.filter(eq => eq.site_id === this.editData.id).map(eq => eq.id);
          this.selectedRoutersIds   = this.allRouters.filter(eq => eq.site_id  === this.editData.id).map(eq => eq.id);
          this.selectedFirewallsIds = this.allFirewalls.filter(eq => eq.site_id === this.editData.id).map(eq => eq.id);

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

  // ─────────────────────────────────────────────────────────────
  // Helpers
  // ─────────────────────────────────────────────────────────────
  private normalizeStatus(value: any): string {
    if (value === true  || value === 1)                            return 'active';
    if (value === false || value === 0)                            return 'danger';
    if (typeof value === 'string' && value.trim() !== '')          return value;
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

  // ─────────────────────────────────────────────────────────────
  // Upload fichier de configuration
  // ─────────────────────────────────────────────────────────────
  onConfigFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file  = input.files?.[0];
    if (!file) return;

    this.form['config_filename'] = file.name;

    const reader = new FileReader();
    reader.onload = () => {
      const content = String(reader.result ?? '');

      // Aperçu limité à 2 000 caractères dans le modal
      this.form['config_preview'] = content.length > 2000
        ? content.substring(0, 2000) + '\n… (tronqué pour l\'aperçu)'
        : content;

      // Stockage dans le champ métier selon le type d'équipement
      if      (this.type === 'switch')   this.form['port_config']       = content;
      else if (this.type === 'router')   this.form['interfaces_config'] = content;
      else if (this.type === 'firewall') this.form['configuration']     = content;
    };
    reader.readAsText(file);

    // Permet de re-sélectionner le même fichier
    input.value = '';
  }

  clearConfigFile(): void {
    this.form['config_filename'] = '';
    this.form['config_preview']  = '';
    if      (this.type === 'switch')   this.form['port_config']       = '';
    else if (this.type === 'router')   this.form['interfaces_config'] = '';
    else if (this.type === 'firewall') this.form['configuration']     = '';
  }

  // Libellé du champ de configuration selon le type
  configFieldLabel(): string {
    if (this.type === 'switch')   return 'Configuration des ports';
    if (this.type === 'router')   return 'Configuration des interfaces';
    if (this.type === 'firewall') return 'Politiques de sécurité';
    return 'Configuration';
  }

  // Vérifie si un fichier est déjà chargé (édition)
  existingConfigContent(): string {
    if (this.type === 'switch')   return this.form['port_config']       || '';
    if (this.type === 'router')   return this.form['interfaces_config'] || '';
    if (this.type === 'firewall') return this.form['configuration']     || '';
    return '';
  }

  // ─────────────────────────────────────────────────────────────
  // Sauvegarde
  // ─────────────────────────────────────────────────────────────
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

    // Garantie finale : status toujours une string avant envoi
    if (cleaned['status'] !== undefined) {
      cleaned['status'] = this.normalizeStatus(cleaned['status']);
    }

    const mainOp  = this.isEdit ? this.updateCall(cleaned) : this.createCall(cleaned);
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
      },
    });
  }

  // ─────────────────────────────────────────────────────────────
  // Associations d'équipements (site)
  // ─────────────────────────────────────────────────────────────
  private saveEquipmentAssociations() {
    const siteId = this.editData.id;
    const tasks:  any[] = [];

    const findRouter   = (id: number) => this.allRouters.find(r  => r.id === id);
    const findSwitch   = (id: number) => this.allSwitches.find(s => s.id === id);
    const findFirewall = (id: number) => this.allFirewalls.find(f => f.id === id);

    // ── Ajouts ──
    const addedSwitches  = this.selectedSwitchesIds.filter(id  => !this.initialSwitches.includes(id));
    const addedRouters   = this.selectedRoutersIds.filter(id   => !this.initialRouters.includes(id));
    const addedFirewalls = this.selectedFirewallsIds.filter(id => !this.initialFirewalls.includes(id));

    addedSwitches.forEach(id => {
      const eq = findSwitch(id);
      if (eq) { const p = { ...eq, site_id: siteId }; delete (p as any).site; tasks.push(this.api.updateSwitch(id, p)); }
    });
    addedRouters.forEach(id => {
      const eq = findRouter(id);
      if (eq) { const p = { ...eq, site_id: siteId }; delete (p as any).site; tasks.push(this.api.updateRouter(id, p)); }
    });
    addedFirewalls.forEach(id => {
      const eq = findFirewall(id);
      if (eq) { const p = { ...eq, site_id: siteId }; delete (p as any).site; tasks.push(this.api.updateFirewall(id, p)); }
    });

    // ── Dissociations ──
    const removedSwitches  = this.initialSwitches.filter(id  => !this.selectedSwitchesIds.includes(id));
    const removedRouters   = this.initialRouters.filter(id   => !this.selectedRoutersIds.includes(id));
    const removedFirewalls = this.initialFirewalls.filter(id => !this.selectedFirewallsIds.includes(id));

    removedSwitches.forEach(id => {
      const eq = findSwitch(id);
      if (eq) { const p = { ...eq, site_id: undefined }; delete (p as any).site; tasks.push(this.api.updateSwitch(id, p)); }
    });
    removedRouters.forEach(id => {
      const eq = findRouter(id);
      if (eq) { const p = { ...eq, site_id: undefined }; delete (p as any).site; tasks.push(this.api.updateRouter(id, p)); }
    });
    removedFirewalls.forEach(id => {
      const eq = findFirewall(id);
      if (eq) { const p = { ...eq, site_id: undefined }; delete (p as any).site; tasks.push(this.api.updateFirewall(id, p)); }
    });

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

  // ─────────────────────────────────────────────────────────────
  // Gestion des équipements associés (site)
  // ─────────────────────────────────────────────────────────────
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
    const ids        = this.getSelectedIds(type);
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
    if (type === 'switches') return this.selectedSwitchesIds;
    if (type === 'routers')  return this.selectedRoutersIds;
    return this.selectedFirewallsIds;
  }
  private getAssociated(type: 'switches' | 'routers' | 'firewalls'): any[] {
    if (type === 'switches') return this.associatedSwitches();
    if (type === 'routers')  return this.associatedRouters();
    return this.associatedFirewalls();
  }
  private removeId(type: 'switches' | 'routers' | 'firewalls', id: number): void {
    if (type === 'switches')  this.selectedSwitchesIds  = this.selectedSwitchesIds.filter(x  => x !== id);
    if (type === 'routers')   this.selectedRoutersIds   = this.selectedRoutersIds.filter(x   => x !== id);
    if (type === 'firewalls') this.selectedFirewallsIds = this.selectedFirewallsIds.filter(x => x !== id);
  }

  // ─────────────────────────────────────────────────────────────
  // Nettoyage du formulaire avant envoi
  // ─────────────────────────────────────────────────────────────
  private cleanForm(): Record<string, any> {
    const EXCLUDED = new Set([
      'site', 'user', 'configuration_histories',
      'config_filename', 'config_preview',   // champs UI uniquement
    ]);
    const cleaned = Object.fromEntries(
      Object.entries(this.form).filter(([key, v]) => {
        if (EXCLUDED.has(key) || key.startsWith('__')) return false;
        return v !== '' && v !== null && v !== undefined;
      })
    );
    if (cleaned['site_id'] !== undefined) {
      cleaned['site_id'] = Number(cleaned['site_id']);
    }
    return cleaned;
  }
}