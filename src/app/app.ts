import { NgOptimizedImage } from '@angular/common';
import { Component, inject } from '@angular/core';
import { Router, RouterLink, RouterOutlet } from '@angular/router';

import { AuthService } from './services/auth.service';

@Component({
  selector: 'app-root',
  imports: [RouterLink, RouterOutlet, NgOptimizedImage],
  template: `
    <header class="app-header">
      <h1 routerLink="/dashboard">
        <img
          ngSrc="favicon.svg"
          width="22"
          height="22"
          alt=""
          aria-hidden="true"
          class="brand-icon"
        />
        <span>Budget Tracker</span>
      </h1>
      @if (!isLoginRoute()) {
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
      }
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
  readonly isAuthenticated = () => this.auth.isAuthenticated();
  readonly isAdmin = () => this.auth.isAdmin();
  readonly isLoginRoute = () => this.router.url.startsWith('/login');

  constructor() {
    this.auth.bootstrapSession();
  }

  logout(): void {
    this.auth.logout();
    void this.router.navigate(['/login']);
  }
}
