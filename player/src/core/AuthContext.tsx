import React, { createContext, useContext, useState, useCallback, useEffect } from 'react';
import { configure as configureApi, ping } from './api';

interface AuthState {
  isLoggedIn: boolean;
  serverUrl: string;
  username: string;
  error: string | null;
}

interface AuthContextValue extends AuthState {
  login: (serverUrl: string, username: string, password: string) => Promise<boolean>;
  logout: () => void;
  reconnect: () => Promise<boolean>;
}

const STORAGE_KEY = 'hifi_auth';

// Password is stored per-tab-session in a module variable.
// It is NOT persisted to any storage — sessionStorage holds { serverUrl, username } only.
// This prevents XSS from stealing the password while allowing auto-login on page refresh.
let cachedPassword = '';

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<AuthState>({
    isLoggedIn: false,
    serverUrl: '',
    username: '',
    error: null,
  });

  // Try auto-login on mount — check if we have a saved password in this session
  useEffect(() => {
    let cancelled = false;
    try {
      const raw = sessionStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const { serverUrl, username, password } = JSON.parse(raw);
      if (!password) return;
      cachedPassword = password;
      // First: ensure server-side proxy points at the right Navidrome URL
      if (serverUrl && serverUrl.trim()) {
        fetch('/api/proxy-config', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ navidromeUrl: serverUrl.trim() }),
        }).catch(() => {}).finally(() => {
          if (cancelled) return;
          configureApi(serverUrl, username, cachedPassword);
          ping().then(ok => {
            if (cancelled) return;
            if (ok) {
              setState({ isLoggedIn: true, serverUrl, username, error: null });
            } else {
              cachedPassword = '';
              sessionStorage.removeItem(STORAGE_KEY);
            }
          }).catch(() => {
            cachedPassword = '';
            sessionStorage.removeItem(STORAGE_KEY);
          });
        });
      } else {
        // No server URL — use relative /rest (unified server)
        configureApi('', username, cachedPassword);
        ping().then(ok => {
          if (cancelled) return;
          if (ok) {
            setState({ isLoggedIn: true, serverUrl: '', username, error: null });
          } else {
            cachedPassword = '';
            sessionStorage.removeItem(STORAGE_KEY);
          }
        }).catch(() => {
          cachedPassword = '';
          sessionStorage.removeItem(STORAGE_KEY);
        });
      }
    } catch { /* no saved creds */ }
    return () => { cancelled = true; };
  }, []);

  const login = useCallback(async (serverUrl: string, username: string, password: string): Promise<boolean> => {
    try {
      configureApi(serverUrl, username, password);
      const ok = await ping();
      if (ok) {
        cachedPassword = password;
        // sessionStorage persists across page refresh in same tab, cleared on tab close.
        // Password is NOT exposed to other tabs (sessionStorage is tab-scoped).
        sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ serverUrl, username, password }));
        setState({ isLoggedIn: true, serverUrl, username, error: null });
        return true;
      } else {
        setState(s => ({ ...s, error: 'Connection failed. Check your URL and credentials.' }));
        return false;
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      setState(s => ({ ...s, error: msg }));
      return false;
    }
  }, []);

  const logout = useCallback(() => {
    cachedPassword = '';
    sessionStorage.removeItem(STORAGE_KEY);
    // Clear persisted playback state — old track/queue won't exist on a different server
    localStorage.removeItem('hifi_queue');
    localStorage.removeItem('hifi_last_track');
    localStorage.removeItem('hifi_codec_info');
    // Dispatch event so MusicContext can stop the engine and clear state
    window.dispatchEvent(new Event('hifi:logout'));
    setState({ isLoggedIn: false, serverUrl: '', username: '', error: null });
  }, []);

  const reconnect = useCallback(async (): Promise<boolean> => {
    try {
      const ok = await ping();
      if (ok) {
        setState(s => ({ ...s, error: null }));
        return true;
      } else {
        setState(s => ({ ...s, error: 'Reconnection failed. Check your URL.' }));
        return false;
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      setState(s => ({ ...s, error: msg }));
      return false;
    }
  }, []);

  return (
    <AuthContext.Provider value={{ ...state, login, logout, reconnect }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be inside AuthProvider');
  return ctx;
}
