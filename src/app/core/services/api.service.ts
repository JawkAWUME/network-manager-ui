import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environment/environment';
import {
  ApiList, ApiSingle, ApiMessage, DashboardKpis,
  Firewall, Router, Switch, Site, User, PendingChange,
} from '../../shared/models';

@Injectable({ providedIn: 'root' })
export class ApiService {
  private base = environment.apiUrl;

  constructor(private http: HttpClient) {}

  // ── Dashboard ────────────────────────────────────────────────────────
  getDashboard(): Observable<{ success: boolean; data: DashboardKpis }> {
    return this.http.get<any>(`${this.base}/dashboard`);
  }

  // ── Firewalls ────────────────────────────────────────────────────────
  getFirewalls(params: Record<string, any> = {}): Observable<ApiList<Firewall>> {
    return this.http.get<ApiList<Firewall>>(`${this.base}/firewalls/list`, { params: this.clean(params) });
  }
  getFirewall(id: number): Observable<ApiSingle<Firewall>> {
    return this.http.get<ApiSingle<Firewall>>(`${this.base}/firewalls/${id}`);
  }
  createFirewall(data: Partial<Firewall>): Observable<ApiMessage> {
    return this.http.post<ApiMessage>(`${this.base}/firewalls`, data);
  }
  updateFirewall(id: number, data: Partial<Firewall>): Observable<ApiMessage> {
    return this.http.put<ApiMessage>(`${this.base}/firewalls/${id}`, data);
  }
  deleteFirewall(id: number): Observable<ApiMessage> {
    return this.http.delete<ApiMessage>(`${this.base}/firewalls/${id}`);
  }
  testFirewallConnectivity(id: number): Observable<ApiMessage> {
    return this.http.post<ApiMessage>(`${this.base}/firewalls/${id}/test-connectivity`, {});
  }
  getFirewallStats(): Observable<any> {
    return this.http.get<any>(`${this.base}/firewalls/statistics`);
  }

  // ── Routers ──────────────────────────────────────────────────────────
  getRouters(params: Record<string, any> = {}): Observable<ApiList<Router>> {
    return this.http.get<ApiList<Router>>(`${this.base}/routers`, { params: this.clean(params) });
  }
  getRouter(id: number): Observable<ApiSingle<Router>> {
    return this.http.get<ApiSingle<Router>>(`${this.base}/routers/${id}`);
  }
  createRouter(data: Partial<Router>): Observable<ApiMessage> {
    return this.http.post<ApiMessage>(`${this.base}/routers`, data);
  }
  updateRouter(id: number, data: Partial<Router>): Observable<ApiMessage> {
    return this.http.put<ApiMessage>(`${this.base}/routers/${id}`, data);
  }
  deleteRouter(id: number): Observable<ApiMessage> {
    return this.http.delete<ApiMessage>(`${this.base}/routers/${id}`);
  }
  testRouterConnectivity(id: number): Observable<ApiMessage> {
    return this.http.post<ApiMessage>(`${this.base}/routers/${id}/test-connectivity`, {});
  }

  // ── Switches ─────────────────────────────────────────────────────────
  getSwitches(params: Record<string, any> = {}): Observable<ApiList<Switch>> {
    return this.http.get<ApiList<Switch>>(`${this.base}/switches`, { params: this.clean(params) });
  }
  getSwitch(id: number): Observable<ApiSingle<Switch>> {
    return this.http.get<ApiSingle<Switch>>(`${this.base}/switches/${id}`);
  }
  createSwitch(data: Partial<Switch>): Observable<ApiMessage> {
    return this.http.post<ApiMessage>(`${this.base}/switches`, data);
  }
  updateSwitch(id: number, data: Partial<Switch>): Observable<ApiMessage> {
    return this.http.put<ApiMessage>(`${this.base}/switches/${id}`, data);
  }
  deleteSwitch(id: number): Observable<ApiMessage> {
    return this.http.delete<ApiMessage>(`${this.base}/switches/${id}`);
  }
  testSwitchConnectivity(id: number): Observable<ApiMessage> {
    return this.http.get<ApiMessage>(`${this.base}/switches/${id}/test-connectivity`);
  }

  // ── Sites ────────────────────────────────────────────────────────────
  getSites(params: Record<string, any> = {}): Observable<ApiList<Site>> {
    return this.http.get<ApiList<Site>>(`${this.base}/sites/list`, { params: this.clean(params) });
  }
  getSite(id: number): Observable<ApiSingle<Site>> {
    return this.http.get<ApiSingle<Site>>(`${this.base}/sites/${id}`);
  }
  createSite(data: Partial<Site>): Observable<ApiMessage> {
    return this.http.post<ApiMessage>(`${this.base}/sites`, data);
  }
  updateSite(id: number, data: Partial<Site>): Observable<ApiMessage> {
    return this.http.put<ApiMessage>(`${this.base}/sites/${id}`, data);
  }
  deleteSite(id: number): Observable<ApiMessage> {
    return this.http.delete<ApiMessage>(`${this.base}/sites/${id}`);
  }

  // ── Users ────────────────────────────────────────────────────────────
  getUsers(): Observable<ApiList<User>> {
    return this.http.get<ApiList<User>>(`${this.base}/users`);
  }
  createUser(data: Partial<User> & { password: string }): Observable<ApiMessage> {
    return this.http.post<ApiMessage>(`${this.base}/users`, data);
  }
  updateUser(id: number, data: Partial<User>): Observable<ApiMessage> {
    return this.http.put<ApiMessage>(`${this.base}/users/${id}`, data);
  }
  deleteUser(id: number): Observable<ApiMessage> {
    return this.http.delete<ApiMessage>(`${this.base}/users/${id}`);
  }
  toggleUserStatus(id: number): Observable<ApiMessage> {
    return this.http.patch<ApiMessage>(`${this.base}/users/${id}/toggle-status`, {});
  }

  // ── Exports ──────────────────────────────────────────────────────────
  exportFirewalls(): void  { window.open(`${this.base}/firewalls/export`); }
  exportRouters(): void    { window.open(`${this.base}/routers/export`); }
  exportSwitches(): void   { window.open(`${this.base}/switches/export`); }
  exportSites(): void      { window.open(`${this.base}/sites/export`); }

  private clean(params: Record<string, any>): Record<string, string> {
    return Object.fromEntries(
      Object.entries(params).filter(([, v]) => v !== '' && v !== null && v !== undefined)
        .map(([k, v]) => [k, String(v)])
    );
  }

    // Dans ApiService
  updateSwitchPorts(id: number, configuration: string): Observable<ApiMessage> {
    return this.http.post<ApiMessage>(`${this.base}/switches/${id}/port-configuration`, { configuration });
  }

  updateRouterInterfaces(id: number, interfacesConfig: string): Observable<ApiMessage> {
    return this.http.post<ApiMessage>(`${this.base}/routers/${id}/update-interfaces`, { interfacesConfig });
  }

  updateFirewallPolicies(id: number, policies: string): Observable<ApiMessage> {
    return this.http.post<ApiMessage>(`${this.base}/firewalls/${id}/update-security-policies`, { policies });
  }

  getPendingChanges(): Observable<ApiList<PendingChange>> {
  return this.http.get<ApiList<PendingChange>>(`${this.base}/admin/pending-changes`);
}
approveChange(id: number): Observable<ApiMessage> {
  return this.http.post<ApiMessage>(`${this.base}/admin/pending-changes/${id}/approve`, {});
}
rejectChange(id: number, reason: string): Observable<ApiMessage> {
  return this.http.post<ApiMessage>(`${this.base}/admin/pending-changes/${id}/reject`, { reason });
}
}
