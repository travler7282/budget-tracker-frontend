import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Injectable, inject, signal } from '@angular/core';
import { Observable, tap } from 'rxjs';

import { environment } from '../../environments/environment';
import { CurrentUser, TokenResponse } from '../models/auth.models';

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly http = inject(HttpClient);
  private readonly tokenKey = 'budget_tracker_access_token';
  private readonly tokenUrl = `${environment.apiBaseUrl}/auth/token`;
  private readonly meUrl = `${environment.apiBaseUrl}/auth/me`;
  readonly currentUser = signal<CurrentUser | null>(null);

  login(username: string, password: string): Observable<TokenResponse> {
    const body = new URLSearchParams({
      username,
      password,
      grant_type: 'password',
    }).toString();

    return this.http
      .post<TokenResponse>(this.tokenUrl, body, {
        headers: new HttpHeaders({ 'Content-Type': 'application/x-www-form-urlencoded' }),
      })
      .pipe(tap((token) => this.setToken(token.access_token)));
  }

  getCurrentUser(): Observable<CurrentUser> {
    return this.http.get<CurrentUser>(this.meUrl).pipe(tap((user) => this.currentUser.set(user)));
  }

  bootstrapSession(): void {
    if (!this.getToken()) {
      this.currentUser.set(null);
      return;
    }

    this.getCurrentUser().subscribe({
      error: () => this.logout(),
    });
  }

  isAuthenticated(): boolean {
    return Boolean(this.getToken());
  }

  getToken(): string | null {
    return localStorage.getItem(this.tokenKey);
  }

  setToken(token: string): void {
    localStorage.setItem(this.tokenKey, token);
  }

  logout(): void {
    localStorage.removeItem(this.tokenKey);
    this.currentUser.set(null);
  }

  getRole(): string | null {
    const token = this.getToken();
    if (!token) {
      return null;
    }

    try {
      const payload = JSON.parse(atob(token.split('.')[1])) as { role?: string };
      return payload.role ?? null;
    } catch {
      return null;
    }
  }

  isAdmin(): boolean {
    return this.currentUser()?.role === 'admin' || this.getRole() === 'admin';
  }
}
