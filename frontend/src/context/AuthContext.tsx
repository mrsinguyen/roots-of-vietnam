import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import type { Role } from '@roots/shared';
import { api, ApiError } from '../lib/api';

interface CurrentUser {
  id: string;
  username: string;
  role: Role;
}

interface AuthState {
  user: CurrentUser | null;
  loading: boolean;
  login: (username: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  refresh: () => Promise<void>;
}

const AuthCtx = createContext<AuthState | null>(null);
const STORAGE_KEY = 'roots.user.v1';

function readCached(): CurrentUser | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as CurrentUser) : null;
  } catch {
    return null;
  }
}

function writeCached(user: CurrentUser | null): void {
  try {
    if (user) localStorage.setItem(STORAGE_KEY, JSON.stringify(user));
    else localStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore: private mode etc.
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUserState] = useState<CurrentUser | null>(() => readCached());
  const [loading, setLoading] = useState(true);

  function setUser(next: CurrentUser | null): void {
    setUserState(next);
    writeCached(next);
  }

  async function refresh(): Promise<void> {
    try {
      const me = await api.me();
      setUser(me.user);
    } catch (err) {
      // Only clear cached user on an explicit 401 from the server. Network errors and
      // 5xx (e.g. dev proxy returning 500 because backend is down) keep the cached user,
      // so offline reloads still pass the auth guard.
      if (err instanceof ApiError && err.status === 401) {
        setUser(null);
      }
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void refresh();
  }, []);

  async function login(username: string, password: string): Promise<void> {
    const res = await api.login({ username, password });
    setUser(res.user);
  }
  async function logout(): Promise<void> {
    try {
      await api.logout();
    } finally {
      setUser(null);
    }
  }

  return (
    <AuthCtx.Provider value={{ user, loading, login, logout, refresh }}>
      {children}
    </AuthCtx.Provider>
  );
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthCtx);
  if (!ctx) throw new Error('useAuth must be inside AuthProvider');
  return ctx;
}

export function hasRole(user: CurrentUser | null, ...roles: Role[]): boolean {
  return !!user && roles.includes(user.role);
}
