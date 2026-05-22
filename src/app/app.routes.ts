import { Routes } from '@angular/router';
import { adminGuard } from './guards/admin.guard';
import { authGuard } from './guards/auth.guard';
import { DashboardPageComponent } from './pages/dashboard.page';
import { LoginPageComponent } from './pages/login.page';
import { PlannerPageComponent } from './pages/planner.page';
import { UsersAdminPageComponent } from './pages/users-admin.page';

export const routes: Routes = [
  { path: '', pathMatch: 'full', redirectTo: 'dashboard' },
  { path: 'login', component: LoginPageComponent },
  { path: 'dashboard', component: DashboardPageComponent, canActivate: [authGuard] },
  { path: 'planner', component: PlannerPageComponent },
  { path: 'admin/users', component: UsersAdminPageComponent, canActivate: [adminGuard] },
  { path: '**', redirectTo: 'dashboard' },
];
