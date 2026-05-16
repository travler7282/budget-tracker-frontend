import { Component, computed, inject } from '@angular/core';
import { Router, RouterLink, RouterOutlet } from '@angular/router';

import { AuthService } from './services/auth.service';

@Component({
  selector: 'app-root',
  imports: [RouterLink, RouterOutlet],
  template: `
    <header class="app-header">
      <h1 routerLink="/dashboard">Budget Tracker</h1>
      <nav>
        @if (isAuthenticated()) {
          <a routerLink="/dashboard">Dashboard</a>
          <a routerLink="/planner">Planner</a>
          @if (isAdmin()) {
            <a routerLink="/admin/users">Users</a>
          }
          <button type="button" class="logout-btn" (click)="logout()">Logout</button>
        } @else {
          <a routerLink="/login">Login</a>
        }
      </nav>
    </header>
    <main class="app-main">
      <router-outlet />
    </main>
  `,
  styleUrl: './app.scss',
})
export class App {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  readonly isAuthenticated = computed(() => this.auth.isAuthenticated());
  readonly isAdmin = computed(() => this.auth.isAdmin());

  constructor() {
    this.auth.bootstrapSession();
  }

  logout(): void {
    this.auth.logout();
    void this.router.navigate(['/login']);
  }
}
