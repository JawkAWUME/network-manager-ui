import { Component, Input, Output, EventEmitter, signal, OnChanges, SimpleChanges } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../../../core/services/api.service';
import { AuthService } from '../../../core/services/auth.service';
import { Firewall, Router, Site, Switch } from '../../../shared/models';

export type ModalType = 'firewall' | 'router' | 'switch' | 'site' | 'user' | null;

@Component({
  selector: 'app-equipment-modal',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: "./equipment-modal.html",
  styleUrls: ["./equipment-modal.css"],
})
export class EquipmentModalComponent implements OnChanges {
  @Input() type: ModalType = null;
  @Input() editData: any = null;
  @Input() sites: Site[] = [];

  @Input() allFirewalls: Firewall[] = [];
  @Input() allRouters: Router[] = [];
  @Input() allSwitches: Switch[] = [];
  @Output() close   = new EventEmitter<void>();
  @Output() saved   = new EventEmitter<void>();

  form: Record<string, any> = {};
  loading = signal(false);
  error   = signal('');
  success = signal('');

  selectedSwitchesIds: number[] = [];
  selectedRoutersIds: number[] = [];
  selectedFirewallsIds: number[] = [];
  lastAdded: { name: string; type: string } | null = null;

  detailTab: 'switches' | 'routers' | 'firewalls' = 'switches';
  addTab: 'switches' | 'routers' | 'firewalls' = 'switches';

  // Contrôle de la visibilité des mots de passe
  showPassword = signal(false);
  showEnablePassword = signal(false);

  get isEdit(): boolean { return !!this.editData?.id; }

  constructor(private api: ApiService, public auth: AuthService) {}

  ngOnChanges(ch: SimpleChanges): void {
    if (ch['type'] || ch['editData']) {
      this.error.set('');
      this.success.set('');
      // Réinitialiser les toggles
      this.showPassword.set(false);
      this.showEnablePassword.set(false);
      if (this.editData) {
        // Copie des données existantes
        this.form = { ...this.editData, password: '', enable_password: '' };
        // S'assurer que status reste une chaîne (backend attend une chaîne)
        if (this.form['status'] !== undefined && typeof this.form['status'] !== 'string') {
          this.form['status'] = this.form['status'] ? 'active' : 'inactive';
        }
      } else {
        // Création : valeurs par défaut
        const defaultForm: Record<string, any> = {};
        if (this.type === 'site') {
          defaultForm['status'] = 'active';   // chaîne de caractères
        } else if (this.type === 'user') {
          defaultForm['is_active'] = true;
        } else {
          // Équipements : le select fournira 'active' par défaut si on ne met rien
          defaultForm['status'] = 'active';
        }
        this.form = defaultForm;
      }
    }
  }

  headerIcon(): string {
    return { firewall: 'fa-fire', router: 'fa-route', switch: 'fa-exchange-alt', site: 'fa-building', user: 'fa-user' }[this.type!] ?? 'fa-server';
  }

  typeLabel(): string {
    return { firewall: 'Firewall', router: 'Routeur', switch: 'Switch', site: 'Site', user: 'Utilisateur' }[this.type!] ?? '';
  }

  onOverlayClick(e: MouseEvent): void {
    if ((e.target as HTMLElement).classList.contains('modal-overlay')) this.close.emit();
  }

  togglePasswordVisibility(): void {
    this.showPassword.set(!this.showPassword());
  }

  toggleEnablePasswordVisibility(): void {
    this.showEnablePassword.set(!this.showEnablePassword());
  }

  // equipment-modal.component.ts (extrait de onSave)
onSave(): void {
  if (!this.form['name']) {
    this.error.set('Le champ Nom est requis.');
    return;
  }
  this.loading.set(true);
  this.error.set('');
  this.success.set('');

  const cleanedData = this.cleanForm();
  // ✅ Aucune conversion de status – on envoie la chaîne telle quelle

  const obs = this.isEdit ? this.updateCall(cleanedData) : this.createCall(cleanedData);
  obs.subscribe({
    next: (res: any) => {
      if (res.pending_id) {
        const msg = this.isEdit
          ? 'Modification soumise à validation. Un administrateur doit l’approuver.'
          : 'Demande de création soumise à validation. Un administrateur doit l’approuver.';
        this.success.set(msg);
      } else {
        this.success.set('Opération réussie !');
      }
      setTimeout(() => {
        this.saved.emit(res);
        this.close.emit();
      }, 800);
      this.loading.set(false);
    },
    error: (e) => {
      this.error.set(e.error?.message ?? 'Une erreur est survenue.');
      this.loading.set(false);
    },
  });
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

  associatedSwitches(): Switch[] {
    const selectedIds = new Set(this.selectedSwitchesIds);
    return this.allSwitches.filter((equipment) => {
      const siteId = equipment.site_id ?? null;
      return siteId === this.editData?.id || selectedIds.has(equipment.id);
    });
  }

  associatedRouters(): Router[] {
    const selectedIds = new Set(this.selectedRoutersIds);
    return this.allRouters.filter((equipment) => {
      const siteId = equipment.site_id ?? null;
      return siteId === this.editData?.id || selectedIds.has(equipment.id);
    });
  }

  associatedFirewalls(): Firewall[] {
    const selectedIds = new Set(this.selectedFirewallsIds);
    return this.allFirewalls.filter((equipment) => {
      const siteId = equipment.site_id ?? null;
      return siteId === this.editData?.id || selectedIds.has(equipment.id);
    });
  }

  availableSwitches(): Switch[] {
    const associatedIds = new Set(this.associatedSwitches().map((equipment) => equipment.id));
    return this.allSwitches.filter((equipment) => !associatedIds.has(equipment.id));
  }

  availableRouters(): Router[] {
    const associatedIds = new Set(this.associatedRouters().map((equipment) => equipment.id));
    return this.allRouters.filter((equipment) => !associatedIds.has(equipment.id));
  }

  availableFirewalls(): Firewall[] {
    const associatedIds = new Set(this.associatedFirewalls().map((equipment) => equipment.id));
    return this.allFirewalls.filter((equipment) => !associatedIds.has(equipment.id));
  }

  totalAssociated(): number {
    return this.associatedSwitches().length + this.associatedRouters().length + this.associatedFirewalls().length;
  }

  toggleEquipment(type: 'switches' | 'routers' | 'firewalls', equipmentId: number, equipmentName: string): void {
    const selectedIds = this.getSelectedIdsByType(type);
    const associatedIds = new Set(this.getAssociatedByType(type).map((equipment) => equipment.id));
    const isCurrentlyAssociated = associatedIds.has(equipmentId);

    if (isCurrentlyAssociated) {
      this.removeSelectedEquipment(type, equipmentId);
      this.lastAdded = null;
      return;
    }

    if (!selectedIds.includes(equipmentId)) {
      selectedIds.push(equipmentId);
      this.lastAdded = { name: equipmentName, type };
    }
  }

  private getSelectedIdsByType(type: 'switches' | 'routers' | 'firewalls'): number[] {
    switch (type) {
      case 'switches': return this.selectedSwitchesIds;
      case 'routers':  return this.selectedRoutersIds;
      case 'firewalls':return this.selectedFirewallsIds;
    }
  }

  private getAssociatedByType(type: 'switches' | 'routers' | 'firewalls'): Array<Switch | Router | Firewall> {
    switch (type) {
      case 'switches': return this.associatedSwitches();
      case 'routers':  return this.associatedRouters();
      case 'firewalls':return this.associatedFirewalls();
    }
  }

  private removeSelectedEquipment(type: 'switches' | 'routers' | 'firewalls', equipmentId: number): void {
    switch (type) {
      case 'switches':
        this.selectedSwitchesIds = this.selectedSwitchesIds.filter((id) => id !== equipmentId);
        break;
      case 'routers':
        this.selectedRoutersIds = this.selectedRoutersIds.filter((id) => id !== equipmentId);
        break;
      case 'firewalls':
        this.selectedFirewallsIds = this.selectedFirewallsIds.filter((id) => id !== equipmentId);
        break;
    }
  }

  private cleanForm(): Record<string, any> {
    const cleaned: Record<string, any> = {};
    for (const [key, value] of Object.entries(this.form)) {
      if (value !== '' && value !== null && value !== undefined) {
        cleaned[key] = value;
      }
    }
    return cleaned;
  }
}