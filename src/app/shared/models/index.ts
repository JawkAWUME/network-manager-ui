// ── Auth ──────────────────────────────────────────────────────────────
export interface LoginRequest  { email: string; password: string; }
export interface RegisterRequest { name: string; email: string; password: string; role: string; department?: string; phone?: string; }
export interface AuthResponse  { token: string; user: UserInfo; }

export interface UserInfo {
  id: number; name: string; email: string; role: 'admin' | 'agent' | 'viewer';
  department?: string; is_active?: boolean;
}

// ── User ──────────────────────────────────────────────────────────────
export interface User {
  id: number; name: string; email: string; role: string;
  department?: string; phone?: string; is_active: boolean;
  created_at?: string; updated_at?: string;
}

// ── Site ──────────────────────────────────────────────────────────────
export interface Site {
  id: number; name: string; code?: string; address?: string;
  city?: string; country?: string; postal_code?: string;
  phone?: string; technical_contact?: string; technical_email?: string;
  description?: string; status?: string; capacity?: number; notes?: string;
  latitude?: number; longitude?: number;
  firewalls_count?: number; routers_count?: number; switches_count?: number;
  created_at?: string; updated_at?: string;
}

// ── Firewall ──────────────────────────────────────────────────────────
export interface Firewall {
  id: number; name: string; site?: string; site_id?: number;
  brand?: string; model?: string; firewall_type?: string;
  ip_nms?: string; ip_service?: string; vlan_nms?: number; vlan_service?: number;
  username?: string; firmware_version?: string;
  security_policies_count?: number; cpu?: number; memory?: number;
  high_availability?: boolean; monitoring_enabled?: boolean;
  serial_number?: string; asset_tag?: string; notes?: string;
  status: 'active' | 'danger'; last_backup?: string;
  updated_at?: string;
}

// ── Router ────────────────────────────────────────────────────────────
export interface Router {
  id: number; name: string; site?: string; site_id?: number;
  brand?: string; model?: string;
  ip_nms?: string; ip_service?: string; vlan_nms?: number; vlan_service?: number;
  username?: string; operating_system?: string;
  interfaces_count?: number; interfaces_up_count?: number;
  routing_protocols?: string[];
  serial_number?: string; asset_tag?: string; notes?: string;
  status: 'active' | 'danger'; last_backup?: string;
  updated_at?: string;
}

// ── Switch ────────────────────────────────────────────────────────────
export interface Switch {
  id: number; name: string; site?: string; site_id?: number;
  brand?: string; model?: string; firmware_version?: string;
  ip_nms?: string; ip_service?: string; vlan_nms?: number; vlan_service?: number;
  username?: string;
  ports_total?: number; ports_used?: number;
  serial_number?: string; asset_tag?: string; notes?: string;
  status: 'active' | 'warning' | 'danger'; last_backup?: string;
  updated_at?: string;
}

// ── Dashboard KPIs ────────────────────────────────────────────────────
export interface DashboardKpis {
  kpis: {
    firewalls: { total: number; active: number; inactive: number };
    routers:   { total: number; active: number; inactive: number };
    switches:  { total: number; active: number; inactive: number };
    sites:     { total: number };
    users:     { total: number };
  };
  backup_alerts: { firewalls: number; routers: number; switches: number; total: number };
  charts: { firewalls_by_brand: any[]; routers_by_brand: any[]; };
}

// ── API response wrappers ─────────────────────────────────────────────
export interface ApiList<T> { success: boolean; data: T[]; total: number; timestamp?: string; }
export interface ApiSingle<T> { success: boolean; data: T; timestamp?: string; }
export interface ApiMessage { success: boolean; message: string; data?: any; }

// ── Filter states ─────────────────────────────────────────────────────
export interface FilterState {
  search: string; status: string; site: string; brand?: string;
}
