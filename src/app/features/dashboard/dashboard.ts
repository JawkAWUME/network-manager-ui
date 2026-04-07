import { Component, OnInit, AfterViewInit, OnDestroy, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router as AngularRouter } from '@angular/router';
import { ApiService } from '../../core/services/api.service';
import { AuthService } from '../../core/services/auth.service';
import { EquipmentModalComponent, ModalType } from '../../shared/components/equipment-modal/equipment-modal';
import { ConfirmModalComponent } from '../../shared/components/confirm-modal/confirm-modal';
import { ToastComponent } from '../../shared/components/toast/toast';
import {
  DashboardKpis,
  Firewall,
  Router,
  Site,
  Switch,
  User,
} from '../../shared/models';

type Tab = 'dashboard' | 'firewalls' | 'routers' | 'switches' | 'sites' | 'users' | 'profile';

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [CommonModule, FormsModule, EquipmentModalComponent, ConfirmModalComponent, ToastComponent],
  templateUrl: './dashboard.html',
})
export class DashboardComponent implements OnInit, AfterViewInit, OnDestroy {
  private api = inject(ApiService);
  public auth = inject(AuthService);
  private router = inject(AngularRouter);

  get allFirewalls(): Firewall[] { return this.firewalls(); }
  get allRouters(): Router[] { return this.routers(); }
  get allSwitches(): Switch[] { return this.switches(); }

  activeTab = signal<Tab>('dashboard');
  kpis = signal<DashboardKpis | null>(null);
  firewalls = signal<Firewall[]>([]);
  routers = signal<Router[]>([]);
  switches = signal<Switch[]>([]);
  sites = signal<Site[]>([]);
  users = signal<User[]>([]);
  loadingTab = signal(false);
  userMenuOpen = signal(false);

  filterFw = { search: '', status: '', site: '' };
  filterRt = { search: '', status: '', site: '' };
  filterSw = { search: '', status: '', site: '' };
  filterSite = { search: '' };

  modalType = signal<ModalType>(null);
  modalEdit = signal<any>(null);
  confirmVisible = false;
  confirmMsg = '';
  confirmAction: (() => void) | null = null;
  confirmLoading = signal(false);

  modalSiteEquipmentList: any[] = [];
  modalSiteEquipmentType: string | null = null;
  modalSiteEquipmentTitle = '';
  userToToggle: User | null = null;
  deleteTarget: { type: string; id: number; name: string; label: string } | null = null;

  private charts: any[] = [];

  showSiteEquipmentModal = false;

  showPortsModal = false;
  modalTitlePorts = '';
  currentSwitchForPorts: Switch | null = null;
  portConfigData = '';

  showInterfacesModal = false;
  modalTitleInterfaces = '';
  currentRouterForInterfaces: Router | null = null;
  interfacesConfigData = '';

  showPoliciesModal = false;
  modalTitlePolicies = '';
  currentFirewallForPolicies: Firewall | null = null;
  securityPoliciesData = '';

  showViewModal = false;
  currentViewItem: any = null;
  currentViewType = '';

  get filteredFirewalls(): Firewall[] {
    return this.firewalls().filter(
      f =>
        (!this.filterFw.search ||
          `${f.name} ${f.model} ${f.ip_nms} ${f.ip_service} ${f.site}`.toLowerCase().includes(this.filterFw.search.toLowerCase())) &&
        (!this.filterFw.status || f.status === this.filterFw.status) &&
        (!this.filterFw.site || f.site === this.filterFw.site),
    );
  }

  get filteredRouters(): Router[] {
    return this.routers().filter(
      r =>
        (!this.filterRt.search ||
          `${r.name} ${r.model} ${r.ip_nms} ${r.site}`.toLowerCase().includes(this.filterRt.search.toLowerCase())) &&
        (!this.filterRt.status || r.status === this.filterRt.status) &&
        (!this.filterRt.site || r.site === this.filterRt.site),
    );
  }

  get filteredSwitches(): Switch[] {
    return this.switches().filter(
      s =>
        (!this.filterSw.search ||
          `${s.name} ${s.model} ${s.ip_nms} ${s.site}`.toLowerCase().includes(this.filterSw.search.toLowerCase())) &&
        (!this.filterSw.status || s.status === this.filterSw.status) &&
        (!this.filterSw.site || s.site === this.filterSw.site),
    );
  }

  get filteredSites(): Site[] {
    return this.sites().filter(
      s =>
        !this.filterSite.search ||
        `${s.name} ${s.city} ${s.country} ${s.code}`.toLowerCase().includes(this.filterSite.search.toLowerCase()),
    );
  }

  get sitesWithCounts(): Site[] {
    const sites = this.sites();
    const firewalls = this.firewalls();
    const routers = this.routers();
    const switches = this.switches();

    return sites.map(site => ({
        ...site,
        firewalls_count: firewalls.filter(fw => fw.site_id === site.id).length,
        routers_count: routers.filter(rt => rt.site_id === site.id).length,
        switches_count: switches.filter(sw => sw.site_id === site.id).length,
    }));
}

  get filteredSitesWithCounts(): Site[] {
      const sites = this.sitesWithCounts;
      return sites.filter(s =>
          !this.filterSite.search ||
          `${s.name} ${s.city} ${s.country} ${s.code}`.toLowerCase().includes(this.filterSite.search.toLowerCase())
      );
  }

  get totalDevices(): number {
    const k = this.kpis();
    if (!k) return 0;
    return k.kpis.firewalls.total + k.kpis.routers.total + k.kpis.switches.total;
  }

  get userTotals() {
    const list = this.users();
    return {
      total: list.length,
      active: list.filter(u => u.is_active).length,
      admins: list.filter(u => u.role === 'admin').length,
      agents: list.filter(u => u.role === 'agent').length,
      viewers: list.filter(u => u.role === 'viewer').length,
    };
  }

  ngOnInit(): void {
    this.loadAll();
  }

  ngAfterViewInit(): void {
    setTimeout(() => this.buildCharts(), 300);
  }

  ngOnDestroy(): void {
    this.charts.forEach(c => c?.destroy());
  }

  loadAll(): void {
    this.api.getDashboard().subscribe(r => this.kpis.set(r.data));
    this.api.getFirewalls({ limit: 200 }).subscribe(r => this.firewalls.set(r.data));
    this.api.getRouters({ limit: 200 }).subscribe(r => this.routers.set(r.data));
    this.api.getSwitches({ limit: 200 }).subscribe(r => this.switches.set(r.data));
    this.api.getSites({ limit: 200 }).subscribe(r => this.sites.set(r.data));
    this.api.getUsers().subscribe(r => this.users.set(r.data));
  }

  setTab(tab: Tab): void {
    this.activeTab.set(tab);
    if (tab === 'dashboard') {
      setTimeout(() => this.buildCharts(), 200);
    }
  }

  openCreate(type: ModalType): void {
    this.modalEdit.set(null);
    this.modalType.set(type);
  }

  openEdit(type: ModalType, item: any): void {
    this.modalEdit.set(item);
    this.modalType.set(type);
  }

  openViewItemEdit(): void {
    const currentType = this.currentViewType as ModalType;
    this.openEdit(currentType, this.currentViewItem);
    this.closeViewModal();
  }

  closeModal(): void {
    this.modalType.set(null);
    this.modalEdit.set(null);
  }

  onSaved(): void {
    this.closeModal();
    this.loadAll();
  }

  openConfirmDelete(msg: string, action: () => void): void {
    this.confirmMsg = msg;
    this.confirmAction = action;
    this.confirmVisible = true;
  }

  onConfirmDelete(): void {
    if (!this.confirmAction) return;
    this.confirmLoading.set(true);
    this.confirmAction();
  }

  closeConfirm(): void {
    this.confirmVisible = false;
    this.confirmLoading.set(false);
  }

  deleteFirewall(fw: Firewall): void {
    this.openConfirmDelete(`Supprimer le firewall « ${fw.name} » ?`, () => {
      this.api.deleteFirewall(fw.id).subscribe({
        next: () => {
          this.closeConfirm();
          this.loadAll();
        },
        error: () => this.closeConfirm(),
      });
    });
  }

  deleteRouter(r: Router): void {
    this.openConfirmDelete(`Supprimer le routeur « ${r.name} » ?`, () => {
      this.api.deleteRouter(r.id).subscribe({
        next: () => {
          this.closeConfirm();
          this.loadAll();
        },
        error: () => this.closeConfirm(),
      });
    });
  }

  deleteSwitch(sw: Switch): void {
    this.openConfirmDelete(`Supprimer le switch « ${sw.name} » ?`, () => {
      this.api.deleteSwitch(sw.id).subscribe({
        next: () => {
          this.closeConfirm();
          this.loadAll();
        },
        error: () => this.closeConfirm(),
      });
    });
  }

  deleteSite(site: Site): void {
    this.openConfirmDelete(`Supprimer le site « ${site.name} » ?`, () => {
      this.api.deleteSite(site.id).subscribe({
        next: () => {
          this.closeConfirm();
          this.loadAll();
        },
        error: () => this.closeConfirm(),
      });
    });
  }

  deleteUser(user: User): void {
    this.openConfirmDelete(`Supprimer l'utilisateur « ${user.name} » ?`, () => {
      this.api.deleteUser(user.id).subscribe({
        next: () => {
          this.closeConfirm();
          this.loadAll();
        },
        error: () => this.closeConfirm(),
      });
    });
  }

  toggleUserStatus(user: User): void {
    this.api.toggleUserStatus(user.id).subscribe(() => this.loadAll());
  }

  logout(): void {
    this.auth.logout();
  }

  exportFirewalls(): void {
    this.api.exportFirewalls();
  }

  exportRouters(): void {
    this.api.exportRouters();
  }

  exportSwitches(): void {
    this.api.exportSwitches();
  }

  exportSites(): void {
    this.api.exportSites();
  }

  buildCharts(): void {
    this.charts.forEach(c => c?.destroy());
    this.charts = [];

    const k = this.kpis();
    const pieCanvas = document.getElementById('deviceDistributionChart') as HTMLCanvasElement | null;
    if (pieCanvas && k) {
        this.charts.push(
            new (window as any).Chart(pieCanvas, {
                type: 'doughnut',
                data: {
                    labels: ['Firewalls', 'Routeurs', 'Switches'],
                    datasets: [
                        {
                            data: [k.kpis.firewalls.total, k.kpis.routers.total, k.kpis.switches.total],
                            backgroundColor: ['#ef4444', '#3b82f6', '#10b981'],
                            borderWidth: 0,
                        },
                    ],
                },
                options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'bottom' } } },
            }),
        );
    }

    const barCanvas = document.getElementById('availabilityChart') as HTMLCanvasElement | null;
    if (barCanvas && k) {
        const days = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'];
        this.charts.push(
            new (window as any).Chart(barCanvas, {
                type: 'bar',
                data: {
                    labels: days,
                    datasets: [
                        { label: 'Actifs', data: days.map(() => Math.round(85 + Math.random() * 14)), backgroundColor: '#10b981' },
                        { label: 'Inactifs', data: days.map(() => Math.round(1 + Math.random() * 10)), backgroundColor: '#ef4444' },
                    ],
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: { legend: { position: 'bottom' } },
                    scales: { x: { stacked: true }, y: { stacked: true } },
                },
            }),
        );
    }

    // Graphique "Charge des équipements"
    const loadCanvas = document.getElementById('loadChart') as HTMLCanvasElement | null;
    if (loadCanvas) {
        // Utilisez des données réelles si disponibles, sinon des données statiques
        const heures = ['00:00', '04:00', '08:00', '12:00', '16:00', '20:00'];
        // Exemple de données statiques (vous pouvez les remplacer par des données calculées)
        const firewallsLoad = [45, 48, 62, 68, 55, 50];
        const routersLoad = [60, 58, 72, 78, 65, 62];
        const switchesLoad = [40, 42, 55, 58, 48, 45];

        this.charts.push(
            new (window as any).Chart(loadCanvas, {
                type: 'line',
                data: {
                    labels: heures,
                    datasets: [
                        { label: 'Firewalls', data: firewallsLoad, borderColor: '#ef4444', backgroundColor: 'rgba(239,68,68,.1)', borderWidth: 2, tension: 0.4, fill: true },
                        { label: 'Routeurs', data: routersLoad, borderColor: '#10b981', backgroundColor: 'rgba(16,185,129,.1)', borderWidth: 2, tension: 0.4, fill: true },
                        { label: 'Switches', data: switchesLoad, borderColor: '#0ea5e9', backgroundColor: 'rgba(14,165,233,.1)', borderWidth: 2, tension: 0.4, fill: true },
                    ],
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    scales: {
                        y: {
                            beginAtZero: true,
                            max: 100,
                            ticks: { callback: (v: any) => v + '%' },
                        },
                    },
                },
            }),
        );
    } else {
        console.warn('Canvas #loadChart introuvable');
    }
}

  roleLabel(role: string): string {
    return { admin: 'Administrateur', agent: 'Agent', viewer: 'Lecteur' }[role] ?? role;
  }

  roleClass(role: string): string {
    return { admin: 'status-danger', agent: 'status-warning', viewer: 'status-info' }[role] ?? '';
  }

  avatarBg(role: string): string {
    return role === 'admin'
      ? 'radial-gradient(circle at 30% 30%,#ef4444,#b91c1c)'
      : role === 'agent'
        ? 'radial-gradient(circle at 30% 30%,#f59e0b,#b45309)'
        : 'radial-gradient(circle at 30% 30%,#3b82f6,#1e40af)';
  }

  isCurrentUser(u: User): boolean {
    return u.id === this.auth.currentUser()?.id;
  }

  showSiteEquipment(siteId: number, type: 'firewall' | 'router' | 'switch'): void {
    const site = this.sites().find(s => s.id === siteId);
    if (!site) return;

    let list: any[] = [];
    if (type === 'firewall') list = this.firewalls().filter(eq => eq.site_id === siteId);
    else if (type === 'router') list = this.routers().filter(eq => eq.site_id === siteId);
    else list = this.switches().filter(eq => eq.site_id === siteId);

    this.modalSiteEquipmentList = list;
    this.modalSiteEquipmentType = type;
    const typeLabel = { firewall: 'Firewalls', router: 'Routeurs', switch: 'Switchs' }[type];
    this.modalSiteEquipmentTitle = `${site.name} – ${typeLabel}`;
    this.showSiteEquipmentModal = true;
  }

  closeSiteEquipmentModal(): void {
    this.showSiteEquipmentModal = false;
  }

  configurePorts(switchId: number): void {
    const sw = this.switches().find(s => s.id === switchId);
    if (!sw) return;

    this.modalTitlePorts = `Configuration des ports : ${sw.name}`;
    this.currentSwitchForPorts = sw;
    this.portConfigData = '';
    this.showPortsModal = true;
  }

  handlePortConfigFile(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
      this.portConfigData = String(reader.result ?? '');
    };
    reader.readAsText(file);
  }

  savePortConfiguration(): void {
    if (!this.currentSwitchForPorts) return;
    this.api.updateSwitchPorts(this.currentSwitchForPorts.id, this.portConfigData).subscribe({
      next: () => {
        this.showPortsModal = false;
        this.loadAll();
      },
      error: () => alert('Erreur lors de la mise à jour des ports'),
    });
  }

  updateInterfaces(routerId: number): void {
    const rt = this.routers().find(r => r.id === routerId);
    if (!rt) return;

    this.modalTitleInterfaces = `Configuration des interfaces : ${rt.name}`;
    this.currentRouterForInterfaces = rt;
    this.interfacesConfigData = '';
    this.showInterfacesModal = true;
  }

  handleRouterConfigFile(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
      this.interfacesConfigData = String(reader.result ?? '');
    };
    reader.readAsText(file);
  }

  saveInterfacesUpdate(): void {
    if (!this.currentRouterForInterfaces) return;
    this.api.updateRouterInterfaces(this.currentRouterForInterfaces.id, this.interfacesConfigData).subscribe({
      next: () => {
        this.showInterfacesModal = false;
        this.loadAll();
      },
      error: () => alert('Erreur lors de la mise à jour des interfaces'),
    });
  }

  updateSecurityPolicies(firewallId: number): void {
    const fw = this.firewalls().find(f => f.id === firewallId);
    if (!fw) return;

    this.modalTitlePolicies = `Politiques de sécurité : ${fw.name}`;
    this.currentFirewallForPolicies = fw;
    this.securityPoliciesData = '';
    this.showPoliciesModal = true;
  }

  handlePoliciesFile(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
      this.securityPoliciesData = String(reader.result ?? '');
    };
    reader.readAsText(file);
  }

  saveSecurityPolicies(): void {
    if (!this.currentFirewallForPolicies) return;
    this.api.updateFirewallPolicies(this.currentFirewallForPolicies.id, this.securityPoliciesData).subscribe({
      next: () => {
        this.showPoliciesModal = false;
        this.loadAll();
      },
      error: () => alert('Erreur lors de la mise à jour des politiques'),
    });
  }

  editUser(user: User): void {
    this.modalEdit.set(user);
    this.modalType.set('user');
  }

  editCurrentUserProfile(): void {
    const currentUser = this.auth.currentUser();
    if (!currentUser) return;

    this.editUser({
      id: currentUser.id,
      name: currentUser.name,
      email: currentUser.email,
      role: currentUser.role,
      department: currentUser.department ?? '',
      phone: '',
      is_active: currentUser.is_active ?? true,
    });
  }

  viewItem(type: string, id: number): void {
    let item: any = null;
    if (type === 'sites') item = this.sites().find(s => s.id === id);
    else if (type === 'firewalls') item = this.firewalls().find(f => f.id === id);
    else if (type === 'routers') item = this.routers().find(r => r.id === id);
    else if (type === 'switches') item = this.switches().find(s => s.id === id);

    if (!item) return;

    this.currentViewItem = item;
    this.currentViewType = type.slice(0, -1);
    this.showViewModal = true;
  }

  closeViewModal(): void {
    this.showViewModal = false;
  }

  getEquipmentIcon(type: string): string {
    return { firewall: 'fa-fire', router: 'fa-route', switch: 'fa-exchange-alt', site: 'fa-building' }[type] || 'fa-server';
  }

  formatDate(dateString?: string): string {
    if (!dateString) return 'N/A';

    try {
      const d = new Date(dateString);
      const diff = Date.now() - d.getTime();
      const mins = Math.floor(diff / 60000);
      const hrs = Math.floor(diff / 3600000);
      const days = Math.floor(diff / 86400000);

      if (mins < 1) return "À l'instant";
      if (mins < 60) return `Il y a ${mins} min`;
      if (hrs < 24) return `Il y a ${hrs}h`;
      if (days < 7) return `Il y a ${days}j`;

      return d.toLocaleDateString('fr-FR', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      return 'N/A';
    }
  }

  getLastAccessUser(equipment: any): string {
    return equipment.last_access_user || equipment.username || equipment.access_logs?.[0]?.user?.name || 'Aucun accès';
  }

  portUsagePct(sw: Switch): number {
    return sw.ports_total ? Math.round(((sw.ports_used ?? 0) / sw.ports_total) * 100) : 0;
  }

  portBarColor(sw: Switch): string {
    const p = this.portUsagePct(sw);
    return p > 85 ? '#ef4444' : p > 65 ? '#f59e0b' : '#10b981';
  }
}
