import { Injectable, signal } from '@angular/core';

export interface Toast { message: string; type: 'success' | 'danger' | 'info' | 'warning'; }

@Injectable({ providedIn: 'root' })
export class ToastService {
  toast = signal<Toast & { show: boolean }>({ show: false, message: '', type: 'info' });

  show(message: string, type: Toast['type'] = 'success'): void {
    this.toast.set({ show: true, message, type });
    setTimeout(() => this.toast.set({ show: false, message: '', type: 'info' }), 3500);
  }
}
