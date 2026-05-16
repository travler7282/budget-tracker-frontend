import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';

import { environment } from '../../environments/environment';
import { UserCreatePayload, UserRead, UserUpdatePayload } from '../models/user.models';

@Injectable({ providedIn: 'root' })
export class UsersService {
  private readonly http = inject(HttpClient);
  private readonly usersUrl = `${environment.apiBaseUrl}/auth/users`;
  private readonly registerUrl = `${environment.apiBaseUrl}/auth/register`;

  listUsers(): Observable<UserRead[]> {
    return this.http.get<UserRead[]>(this.usersUrl);
  }

  createUser(payload: UserCreatePayload): Observable<UserRead> {
    return this.http.post<UserRead>(this.registerUrl, payload);
  }

  updateUser(userId: number, payload: UserUpdatePayload): Observable<UserRead> {
    return this.http.patch<UserRead>(`${this.usersUrl}/${userId}`, payload);
  }

  deleteUser(userId: number): Observable<void> {
    return this.http.delete<void>(`${this.usersUrl}/${userId}`);
  }
}
