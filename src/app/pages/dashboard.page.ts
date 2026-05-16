import { CommonModule } from '@angular/common';
import { Component, inject, signal } from '@angular/core';
import { Router } from '@angular/router';

import { CurrentUser } from '../models/auth.models';
import { AuthService } from '../services/auth.service';

@Component({
  standalone: true,
  selector: 'app-dashboard-page',
  imports: [CommonModule],
  templateUrl: './dashboard.page.html',
  styleUrl: './dashboard.page.scss',
})
export class DashboardPageComponent {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  readonly loading = signal(true);
  readonly error = signal<string | null>(null);
  readonly user = signal<CurrentUser | null>(null);

  constructor() {
    this.auth.getCurrentUser().subscribe({
      next: (user) => {
        this.user.set(user);
        this.loading.set(false);
      },
      error: () => {
        this.error.set('Could not load your profile. Please sign in again.');
        this.loading.set(false);
      },
    });
  }

  logout(): void {
    this.auth.logout();
    void this.router.navigate(['/login']);
  }
}
