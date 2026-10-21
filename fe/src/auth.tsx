import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { api, setUnauthorizedHandler, type User } from './api';

interface AuthState {
  user: User | null;
  loading: boolean;
  login: (identifier: string, password: string) => Promise<User>;
  logout: () => Promise<void>;
  refresh: () => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();
  const location = useLocation();
  const signedIn = useRef(false);
  signedIn.current = !!user;
  const here = useRef(location.pathname);
  here.current = location.pathname;

  // sys-004: a protected call answered 401 (session expired, account locked or deleted) signs the user out.
  // Guests are left alone, and concurrent 401s redirect only once.
  useEffect(
    () =>
      setUnauthorizedHandler(() => {
        if (!signedIn.current) return;
        signedIn.current = false;
        setUser(null);
        navigate('/login', { replace: true, state: { from: here.current, expired: true } });
      }),
    [navigate],
  );

  const refresh = useCallback(async () => {
    try {
      const { user } = await api<{ user: User }>('/auth/me');
      setUser(user);
    } catch {
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const login = async (identifier: string, password: string) => {
    const { user } = await api<{ user: User }>('/auth/login', { body: { identifier, password } });
    setUser(user);
    return user;
  };

  const logout = async () => {
    await api('/auth/logout', { method: 'POST' });
    setUser(null);
  };

  return <AuthContext.Provider value={{ user, loading, login, logout, refresh }}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth outside AuthProvider');
  return ctx;
}

/** Where each role lands after login (sec-001). */
export function homeFor(user: Pick<User, 'role'>) {
  if (user.role === 'admin') return '/admin/users';
  if (user.role === 'staff') return '/staff/statistics';
  return '/dashboard';
}

export const can = (user: User | null, permission: string) => !!user?.permissions?.includes(permission);

export function RequireAuth({ children, permission }: { children: ReactNode; permission?: string }) {
  const { user, loading } = useAuth();
  const location = useLocation();
  if (loading) return <p className="muted">Loading...</p>;
  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  if (permission && !can(user, permission)) {
    return (
      <div className="card narrow" data-testid="not-allowed">
        <h1>Not allowed</h1>
        <p className="muted">Your account does not have access to this page.</p>
      </div>
    );
  }
  return <>{children}</>;
}
