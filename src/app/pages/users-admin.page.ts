import { CommonModule, DatePipe } from '@angular/common';
import { Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';

import { UserRead } from '../models/user.models';
import { AuthService } from '../services/auth.service';
import { UsersService } from '../services/users.service';

@Component({
  standalone: true,
  selector: 'app-users-admin-page',
  imports: [CommonModule, ReactiveFormsModule, DatePipe],
  templateUrl: './users-admin.page.html',
  styleUrl: './users-admin.page.scss',
})
export class UsersAdminPageComponent {
  private readonly usersService = inject(UsersService);
  private readonly auth = inject(AuthService);
  private readonly fb = inject(FormBuilder);

  readonly users = signal<UserRead[]>([]);
  readonly loading = signal(false);
  readonly error = signal<string | null>(null);
  readonly editingUserId = signal<number | null>(null);

  readonly createForm = this.fb.nonNullable.group({
    username: ['', [Validators.required, Validators.minLength(3)]],
    password: ['', [Validators.required, Validators.minLength(8)]],
    role: ['user' as 'user' | 'admin', Validators.required],
  });

  readonly editForm = this.fb.nonNullable.group({
    username: ['', [Validators.required, Validators.minLength(3)]],
    password: [''],
    role: ['user' as 'user' | 'admin', Validators.required],
    is_active: [true],
  });

  constructor() {
    this.loadUsers();
  }

  loadUsers(): void {
    this.loading.set(true);
    this.error.set(null);
    this.usersService.listUsers().subscribe({
      next: (users) => {
        this.users.set(users);
        this.loading.set(false);
      },
      error: () => {
        this.error.set('Could not load users.');
        this.loading.set(false);
      },
    });
  }

  createUser(): void {
    if (this.createForm.invalid) {
      return;
    }

    this.usersService.createUser(this.createForm.getRawValue()).subscribe({
      next: () => {
        this.createForm.reset({ username: '', password: '', role: 'user' });
        this.loadUsers();
      },
      error: () => this.error.set('Unable to create user. Username may already exist.'),
    });
  }

  beginEdit(user: UserRead): void {
    this.editingUserId.set(user.id);
    this.editForm.reset({
      username: user.username,
      password: '',
      role: user.role,
      is_active: user.is_active,
    });
  }

  cancelEdit(): void {
    this.editingUserId.set(null);
  }

  saveUser(): void {
    if (this.editForm.invalid || !this.editingUserId()) {
      return;
    }

    const payload = this.editForm.getRawValue();
    this.usersService
      .updateUser(this.editingUserId()!, {
        username: payload.username,
        password: payload.password || null,
        role: payload.role,
        is_active: payload.is_active,
      })
      .subscribe({
        next: () => {
          this.editingUserId.set(null);
          this.loadUsers();
          this.auth.bootstrapSession();
        },
        error: () => this.error.set('Unable to update user.'),
      });
  }

  deleteUser(user: UserRead): void {
    if (!confirm(`Delete user \"${user.username}\"?`)) {
      return;
    }

    this.usersService.deleteUser(user.id).subscribe({
      next: () => this.loadUsers(),
      error: () => this.error.set('Unable to delete user.'),
    });
  }

  isCurrentUser(user: UserRead): boolean {
    return this.auth.currentUser()?.id === user.id;
  }
}
