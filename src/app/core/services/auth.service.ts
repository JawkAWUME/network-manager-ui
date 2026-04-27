import { Injectable, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Router } from '@angular/router';
import { Observable, tap } from 'rxjs';
import { environment } from '../../environment/environment';
import { AuthResponse, LoginRequest, RegisterRequest, UserInfo } from '../../shared/models';

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly TOKEN_KEY = 'netconfig_token';
  private readonly USER_KEY  = 'netconfig_user';

  currentUser = signal<UserInfo | null>(this.loadUser());

  constructor(private http: HttpClient, private router: Router) {}

  login(dto: LoginRequest): Observable<AuthResponse> {
    return this.http.post<AuthResponse>(`${environment.apiUrl}/auth/login`, dto).pipe(
      tap(res => this.persist(res))
    );
  }

  register(dto: RegisterRequest): Observable<AuthResponse> {
    return this.http.post<AuthResponse>(`${environment.apiUrl}/auth/register`, dto).pipe(
      tap(res => this.persist(res))
    );
  }

 logout(): void {
  localStorage.removeItem(this.TOKEN_KEY);
  localStorage.removeItem(this.USER_KEY);
  this.currentUser.set(null);
  this.router.navigate(['/login']).then(() => {
    window.location.reload(); // recharge complète pour repartir de zéro
  });
}

  getToken(): string | null {
    return localStorage.getItem(this.TOKEN_KEY);
  }

  isLoggedIn(): boolean {
    return !!this.getToken();
  }

  isAdmin(): boolean   { return this.currentUser()?.role === 'admin'; }
  isViewer(): boolean  { return this.currentUser()?.role === 'viewer'; }
  canEdit(): boolean   { return ['admin', 'agent'].includes(this.currentUser()?.role ?? ''); }

  private persist(res: AuthResponse): void {
    const payload = res as any;
    const token = payload.data?.token ?? payload.token;
    const user  = payload.data?.user  ?? payload.user;
    localStorage.setItem(this.TOKEN_KEY, token);
    localStorage.setItem(this.USER_KEY,  JSON.stringify(user));
    this.currentUser.set(user);
  }

  private loadUser(): UserInfo | null {
    try { return JSON.parse(localStorage.getItem(this.USER_KEY) ?? 'null'); }
    catch { return null; }
  }
}
