// Handles JWT caching for single sign-on.

const TOKEN_KEY = 'adfel_session_token';

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string): void {
  localStorage.setItem(TOKEN_KEY, token);
}

export function clearToken(): void {
  localStorage.removeItem(TOKEN_KEY);
}

export function authHeaders(): Record<string, string> {
  const token = getToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export interface CallbackResult {
  token?: string;
  error?: string;
}

export function captureCallbackToken(): CallbackResult {
  if (!window.location.pathname.startsWith('/auth/callback')) return {};
  const params = new URLSearchParams(window.location.search);
  const token = params.get('token');
  const error = params.get('error');
  if (token) {
    setToken(token);
    window.history.replaceState({}, '', '/');
    return { token };
  }
  if (error) {
    window.history.replaceState({}, '', '/');
    return { error };
  }
  return {};
}

export interface MeResponse {
  id: string;
  email: string;
  name: string;
  role: 'admin' | 'instructor' | 'student';
}

export async function fetchMe(): Promise<MeResponse | null> {
  const backend = import.meta.env.VITE_BACKEND_URL;
  if (!backend) return null;
  try {
    const res = await fetch(`${backend}/api/v1/auth/me`, {
      headers: authHeaders(),
    });
    if (!res.ok) {
      if (res.status === 401) clearToken();
      return null;
    }
    return await res.json() as MeResponse;
  } catch {
    return null;
  }
}
