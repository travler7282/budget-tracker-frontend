import { Component } from '@angular/core';
import { RouterLink, RouterOutlet } from '@angular/router';

@Component({
  selector: 'app-root',
  imports: [RouterLink, RouterOutlet],
  template: `
    <header class="app-header">
      <h1>Budget Tracker</h1>
      <nav>
        <a routerLink="/dashboard">Dashboard</a>
        <a routerLink="/login">Login</a>
      </nav>
    </header>
    <main class="app-main">
      <router-outlet />
    </main>
  `,
  styleUrl: './app.scss',
})
export class App {
  protected readonly title = 'budget-tracker-frontend';
}
