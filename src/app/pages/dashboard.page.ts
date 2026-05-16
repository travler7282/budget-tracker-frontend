import { CommonModule } from '@angular/common';
import { Component, inject, signal } from '@angular/core';
import { Router } from '@angular/router';

import { CurrentUser } from '../models/auth.models';
import { BudgetSummary } from '../models/budget.models';
import { AuthService } from '../services/auth.service';
import { BudgetService } from '../services/budget.service';

@Component({
  standalone: true,
  selector: 'app-dashboard-page',
  imports: [CommonModule],
  templateUrl: './dashboard.page.html',
  styleUrl: './dashboard.page.scss',
})
export class DashboardPageComponent {
  private readonly auth = inject(AuthService);
  private readonly budget = inject(BudgetService);
  private readonly router = inject(Router);

  readonly loading = signal(true);
  readonly error = signal<string | null>(null);
  readonly user = signal<CurrentUser | null>(null);
  readonly summary = signal<BudgetSummary[]>([]);

  constructor() {
    this.auth.getCurrentUser().subscribe({
      next: (user) => {
        this.user.set(user);
        this.auth.currentUser.set(user);
        this.loading.set(false);
      },
      error: () => {
        this.error.set('Could not load your profile. Please sign in again.');
        this.loading.set(false);
      },
    });

    this.budget.getSummary().subscribe({
      next: (rows) => this.summary.set(rows),
      error: () => this.summary.set([]),
    });
  }

  logout(): void {
    this.auth.logout();
    void this.router.navigate(['/login']);
  }

  gotoPlanner(): void {
    void this.router.navigate(['/planner']);
  }

  gotoAdminUsers(): void {
    void this.router.navigate(['/admin/users']);
  }
}
