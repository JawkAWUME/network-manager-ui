import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ToastService } from '../../../core/services/toast.service';

@Component({
  selector: 'app-toast',
  standalone: true,
  imports: [CommonModule],
  template: `
@if (toast.toast().show) {
  <div class="toast-container">
    <div class="toast toast-{{ toast.toast().type }}">
      <i class="fas" [ngClass]="{
        'fa-check-circle':        toast.toast().type === 'success',
        'fa-exclamation-circle':  toast.toast().type === 'danger',
        'fa-info-circle':         toast.toast().type === 'info',
        'fa-exclamation-triangle':toast.toast().type === 'warning'
      }"></i>
      {{ toast.toast().message }}
    </div>
  </div>
}
  `,
})
export class ToastComponent {
  toast = inject(ToastService);
}
