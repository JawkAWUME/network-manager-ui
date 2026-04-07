import { HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { AuthService } from '../services/auth.service';

// ✅ Fonctionnel (compatible withInterceptors dans app.config.ts)
// ❌ L'ancienne version class-based (implements HttpInterceptor) ne fonctionnait
//    pas avec provideHttpClient(withInterceptors([...])) → token jamais envoyé → 401
export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const token = inject(AuthService).getToken();
  if (token) {
    req = req.clone({
      setHeaders: { Authorization: `Bearer ${token}` },
    });
  }
  return next(req);
};