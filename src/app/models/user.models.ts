export type UserRole = 'user' | 'admin';

export interface UserRead {
  id: number;
  username: string;
  role: UserRole;
  is_active: boolean;
  created_at: string;
}

export interface UserCreatePayload {
  username: string;
  password: string;
  role: UserRole;
}

export interface UserUpdatePayload {
  username?: string | null;
  password?: string | null;
  role?: UserRole | null;
  is_active?: boolean | null;
}
