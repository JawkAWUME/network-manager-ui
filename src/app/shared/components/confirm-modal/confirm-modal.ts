import { Component, Input, Output, EventEmitter, signal } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-confirm-modal',
  standalone: true,
  imports: [CommonModule],
  template: `
@if (visible) {
<div class="modal-overlay" (click)="cancel.emit()">
  <div class="modal-box" (click)="$event.stopPropagation()">
    <!-- Header rouge -->
    <div class="modal-header-danger">
      <div class="modal-header-left">
        <div class="modal-icon">
          <i class="fas fa-trash-alt"></i>
        </div>
        <h3>Confirmer la suppression</h3>
      </div>
      <button class="modal-close" (click)="cancel.emit()">
        <i class="fas fa-times"></i>
      </button>
    </div>

    <!-- Body -->
    <div class="modal-body">
      <div class="warning-icon">
        <i class="fas fa-exclamation-triangle"></i>
      </div>
      <p class="confirm-question">
        Êtes-vous sûr de vouloir supprimer
        <strong>{{ message }}</strong>
      </p>
      <div class="warning-box">
        <i class="fas fa-exclamation-circle"></i>
        <span>Cette action est <strong>irréversible</strong>. Toutes les données associées seront perdues.</span>
      </div>
    </div>

    <!-- Footer -->
    <div class="modal-footer">
      <button class="btn btn-outline" (click)="cancel.emit()">
        <i class="fas fa-times"></i> Annuler
      </button>
      <button class="btn btn-danger" (click)="confirm.emit()" [disabled]="loading()">
        @if (loading()) {
          <span class="spinner-sm"></span> Suppression…
        } @else {
          <i class="fas fa-trash-alt"></i> Supprimer définitivement
        }
      </button>
    </div>
  </div>
</div>
}
  `,
  styles: [`
    .modal-overlay {
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      background: rgba(0, 0, 0, 0.65);
      z-index: 1100;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 16px;
      animation: fadeIn 0.2s ease;
    }
    .modal-box {
      background: white;
      border-radius: var(--border-radius-lg, 16px);
      width: 100%;
      max-width: 480px;
      box-shadow: 0 25px 60px rgba(0, 0, 0, 0.35);
      animation: fadeIn 0.2s ease;
      overflow: hidden;
    }
    .modal-header-danger {
      padding: 20px 24px;
      display: flex;
      justify-content: space-between;
      align-items: center;
      background: linear-gradient(135deg, #dc2626, #b91c1c);
      color: white;
      border-radius: 16px 16px 0 0;
    }
    .modal-header-left {
      display: flex;
      align-items: center;
      gap: 12px;
    }
    .modal-icon {
      width: 38px;
      height: 38px;
      background: rgba(255, 255, 255, 0.2);
      border-radius: 9px;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 1.15rem;
    }
    .modal-header-danger h3 {
      margin: 0;
      font-size: 1.1rem;
      font-weight: 700;
    }
    .modal-close {
      background: rgba(255, 255, 255, 0.15);
      border: none;
      color: white;
      width: 34px;
      height: 34px;
      border-radius: 8px;
      cursor: pointer;
      font-size: 1rem;
      transition: background 0.2s;
    }
    .modal-close:hover {
      background: rgba(255, 255, 255, 0.3);
    }
    .modal-body {
      padding: 28px 24px;
      text-align: center;
    }
    .warning-icon {
      width: 64px;
      height: 64px;
      background: #fee2e2;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      margin: 0 auto 20px;
      font-size: 1.8rem;
      color: #dc2626;
    }
    .confirm-question {
      font-size: 1rem;
      color: #374151;
      margin: 0 0 16px;
    }
    .confirm-question strong {
      color: #111827;
      font-weight: 700;
    }
    .warning-box {
      background: #fef2f2;
      border: 1px solid #fecaca;
      border-radius: 8px;
      padding: 10px 14px;
      display: flex;
      align-items: center;
      gap: 8px;
      text-align: left;
    }
    .warning-box i {
      color: #dc2626;
      flex-shrink: 0;
    }
    .warning-box span {
      font-size: 0.82rem;
      color: #991b1b;
    }
    .modal-footer {
      padding: 16px 24px;
      border-top: 1px solid #f3f4f6;
      display: flex;
      justify-content: flex-end;
      gap: 10px;
      background: #f9fafb;
      border-radius: 0 0 16px 16px;
    }
    .btn {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      padding: 8px 16px;
      border: none;
      border-radius: 12px;
      font-weight: 600;
      cursor: pointer;
      transition: all 0.2s;
      font-size: 0.9rem;
    }
    .btn-outline {
      background: transparent;
      border: 2px solid #e2e8f0;
      color: #1e293b;
    }
    .btn-outline:hover {
      background: #f8fafc;
      border-color: #0ea5e9;
      color: #0ea5e9;
    }
    .btn-danger {
      background: linear-gradient(135deg, #dc2626, #b91c1c);
      color: white;
    }
    .btn-danger:hover:not(:disabled) {
      background: linear-gradient(135deg, #b91c1c, #991b1b);
      transform: translateY(-1px);
    }
    .btn-danger:disabled {
      opacity: 0.7;
      cursor: not-allowed;
    }
    .spinner-sm {
      width: 16px;
      height: 16px;
      border: 2px solid rgba(255, 255, 255, 0.4);
      border-top-color: white;
      border-radius: 50%;
      animation: spin 0.7s linear infinite;
      display: inline-block;
    }
    @keyframes spin {
      0% { transform: rotate(0deg); }
      100% { transform: rotate(360deg); }
    }
    @keyframes fadeIn {
      from { opacity: 0; }
      to { opacity: 1; }
    }
  `],
})
export class ConfirmModalComponent {
  @Input() visible = false;
  @Input() message = '';
  @Input() loading = signal(false);
  @Output() confirm = new EventEmitter<void>();
  @Output() cancel = new EventEmitter<void>();
}