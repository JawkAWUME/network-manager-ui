import { Component, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { AuthService } from '../../../core/services/auth.service';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  templateUrl: './login.html',
  styleUrls: ['./login.css'],
})
export class LoginComponent {
  email = '';
  password = '';
  remember = false;
  loading = signal(false);
  error = signal('');
  showPassword = signal(false);
  successMessage = signal('');

  currentYear = new Date().getFullYear();

  constructor(
    private auth: AuthService,
    private router: Router
  ) {
    // Récupérer le message de succès depuis l'état de navigation (ex: après inscription)
    const navigation = this.router.getCurrentNavigation();
    const state = navigation?.extras.state as { success?: string };
    if (state?.success) {
      this.successMessage.set(state.success);
    }
  }

  togglePassword(): void {
    this.showPassword.set(!this.showPassword());
  }

  onLogin(): void {
    if (!this.email || !this.password) {
      this.error.set('Veuillez remplir tous les champs.');
      return;
    }

    this.loading.set(true);
    this.error.set('');

    this.auth.login({ email: this.email, password: this.password }).subscribe({
      next: (response) => {
        // Le token est géré dans le service (stockage localStorage, etc.)
        this.router.navigate(['/dashboard']);
      },
      error: (err) => {
        const message = err.error?.message || err.message || 'Identifiants incorrects.';
        this.error.set(message);
        this.loading.set(false);
      },
    });
  }
}