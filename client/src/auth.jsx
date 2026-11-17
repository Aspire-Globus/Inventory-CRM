import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { api, getToken, setToken } from './api.js';
import { tw } from './components/tw.js';

const AuthCtx = createContext(null);
export const useAuth = () => useContext(AuthCtx);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [ready, setReady] = useState(false);

  // Restore session from the saved token
  useEffect(() => {
    if (!getToken()) return setReady(true);
    api.me().then(setUser).catch(() => setToken(null)).finally(() => setReady(true));
  }, []);

  // Keep role / permissions fresh: an admin may change them while this user is logged in.
  // Re-check every 30 s, when the tab gets focus again, and right after any "no permission" (403) answer.
  useEffect(() => {
    if (!user) return;
    const refresh = () => {
      if (!getToken()) return;
      api.me().then((fresh) => {
        setUser((cur) => {
          if (!cur) return cur;
          const key = (u) => `${u.role}|${u.status}|${(u.effectivePermissions || []).slice().sort().join(',')}`;
          return key(cur) === key(fresh) ? cur : fresh; // only re-render when something changed
        });
      }).catch(() => {});
    };
    const timer = setInterval(refresh, 30000);
    const onFocus = () => document.visibilityState === 'visible' && refresh();
    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onFocus);
    window.addEventListener('auth:refresh', refresh);
    return () => {
      clearInterval(timer);
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onFocus);
      window.removeEventListener('auth:refresh', refresh);
    };
  }, [Boolean(user)]);

  // Any 401 from the API logs the user out
  useEffect(() => {
    const onLogout = () => setUser(null);
    window.addEventListener('auth:logout', onLogout);
    return () => window.removeEventListener('auth:logout', onLogout);
  }, []);

  const login = useCallback(async (email, password) => {
    const { token, user } = await api.login({ email, password });
    setToken(token);
    setUser(user);
    return user;
  }, []);

  const logout = useCallback(() => {
    setToken(null);
    setUser(null);
  }, []);

  // Permissions come from the server (Administrators have all of them).
  const isAdmin = user?.role === 'Admin';
  const can = (perm) => Boolean(user) && (isAdmin || (user.effectivePermissions || user.permissions || []).includes(perm));
  const value = { user, setUser, ready, login, logout, isAdmin, can };
  return <AuthCtx.Provider value={value}>{children}</AuthCtx.Provider>;
}

// Wrap routes that need a login; pass adminOnly for admin pages
export function RequireAuth({ children, adminOnly, perm }) {
  const { user, ready, isAdmin, can } = useAuth();
  const location = useLocation();
  if (!ready) return <div className={tw.loading}>Loading…</div>;
  if (!user) return <Navigate to="/login" replace state={{ from: location }} />;
  if ((adminOnly && !isAdmin) || (perm && !can(perm))) return <Navigate to="/" replace />;
  return children;
}
