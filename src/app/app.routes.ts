import { Routes } from '@angular/router';
import { authGuard } from './guards/auth.guard';
import { DashboardPageComponent } from './pages/dashboard.page';
import { LoginPageComponent } from './pages/login.page';

export const routes: Routes = [
  { path: '', pathMatch: 'full', redirectTo: 'dashboard' },
  { path: 'login', component: LoginPageComponent },
  { path: 'dashboard', component: DashboardPageComponent, canActivate: [authGuard] },
  { path: '**', redirectTo: 'dashboard' },
];
