export interface TokenResponse {
  access_token: string;
  token_type: string;
  expires_in_seconds: number;
}

export interface CurrentUser {
  id: number;
  username: string;
  role: string;
  is_active: boolean;
  created_at: string;
}
