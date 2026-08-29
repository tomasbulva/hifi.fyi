import React, { createContext, useContext, useState, useCallback, useEffect } from 'react';
import { configure as configureApi, ping } from './api';

interface AuthState {
  /** True when the session cookie is valid and the user can access the player. */
  isLoggedIn: boolean;
  /** True after first-time setup has been completed (app_config exists in DB). */
  setupDone: boolean;
  /** Navidrome username (from the session). */
  username: string;
  /** Loading is true while the initial session check is in-flight. */
  loading: boolean;
  error: string | null;
}

interface AuthContextValue extends AuthState {
  /** Navidrome username (from the session). */
  username: string;
  /** First-time onboarding: store Navidrome credentials + app credentials on the server. */
  setup: (navidromeUrl: string, navidromeUsername: string, navidromePassword: string, appUsername: string, appPassword: string) => Promise<boolean>;
  /** Login with hifi username + password. */
  login: (appUsername: string, appPassword: string) => Promise<boolean>;
  /** Clear the session cookie and stop playback. */
  logout: () => void;
}

// Navidrome credentials returned by /api/auth/session — stored in memory only,
// used by api.ts to compute Subsonic auth tokens for /rest proxy requests.
// Exported so api.ts can read them without re-fetching.
let memNavidromeUser = '';
let memNavidromePass = '';

export function getNavidromeCreds(): { username: string; password: string } {
  return { username: memNavidromeUser, password: memNavidromePass };
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<AuthState>({
    isLoggedIn: false,
    setupDone: false,
    username: '',
    loading: true,
    error: null,
  });

  // On mount: check if we have a valid session cookie
  useEffect(() => {
    let cancelled = false;
    fetch('/api/auth/session', { credentials: 'same-origin' })
      .then(res => res.json())
      .then((data: { loggedIn: boolean; setup: boolean; navidromeUsername?: string; navidromePassword?: string }) => {
        if (cancelled) return;
        if (data.loggedIn && data.navidromeUsername && data.navidromePassword) {
          memNavidromeUser = data.navidromeUsername;
          memNavidromePass = data.navidromePassword;
          configureApi('', data.navidromeUsername, data.navidromePassword);
          // Verify the Navidrome connection works
          ping().then(ok => {
            if (cancelled) return;
            if (ok) {
              setState({ isLoggedIn: true, username: memNavidromeUser, setupDone: true, loading: false, error: null });
            } else {
              // Session is valid but Navidrome is unreachable (server might be down)
              setState({ isLoggedIn: true, username: memNavidromeUser, setupDone: true, loading: false, error: null });
            }
          }).catch(() => {
            if (cancelled) return;
            setState({ isLoggedIn: true, username: memNavidromeUser, setupDone: true, loading: false, error: null });
          });
        } else {
          setState({ isLoggedIn: false, setupDone: data.setup, username: '', loading: false, error: null });
        }
      })
      .catch(() => {
        if (!cancelled) setState({ isLoggedIn: false, setupDone: false, username: '', loading: false, error: 'Server unreachable' });
      });
    return () => { cancelled = true; };
  }, []);

  const setup = useCallback(async (navidromeUrl: string, navidromeUsername: string, navidromePassword: string, appUsername: string, appPassword: string): Promise<boolean> => {
    try {
      const res = await fetch('/api/auth/setup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ navidromeUrl, navidromeUsername, navidromePassword, appUsername, appPassword }),
      });
      const data = await res.json();
      if (!res.ok) {
        setState(s => ({ ...s, error: data.error || 'Setup failed', loading: false }));
        return false;
      }
      memNavidromeUser = navidromeUsername;
      memNavidromePass = navidromePassword;
      configureApi('', navidromeUsername, navidromePassword);
      setState({ isLoggedIn: true, username: appUsername, setupDone: true, loading: false, error: null });
      return true;
    } catch {
      setState(s => ({ ...s, error: 'Server unreachable', loading: false }));
      return false;
    }
  }, []);

  const login = useCallback(async (appUsername: string, appPassword: string): Promise<boolean> => {
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ appUsername, appPassword }),
      });
      const data = await res.json();
      if (!res.ok) {
        setState(s => ({ ...s, error: data.error || 'Invalid username or password', loading: false }));
        return false;
      }
      // Re-fetch session to get Navidrome credentials
      const sessionRes = await fetch('/api/auth/session', { credentials: 'same-origin' });
      const sessionData = await sessionRes.json();
      if (sessionData.navidromeUsername && sessionData.navidromePassword) {
        memNavidromeUser = sessionData.navidromeUsername;
        memNavidromePass = sessionData.navidromePassword;
        configureApi('', sessionData.navidromeUsername, sessionData.navidromePassword);
      }
      setState({ isLoggedIn: true, username: sessionData.appUsername || memNavidromeUser, setupDone: true, loading: false, error: null });
      return true;
    } catch {
      setState(s => ({ ...s, error: 'Server unreachable', loading: false }));
      return false;
    }
  }, []);

  const logout = useCallback(() => {
    fetch('/api/auth/logout', { method: 'POST' }).catch(() => {});
    memNavidromeUser = '';
    memNavidromePass = '';
    // Clear persisted playback state
    localStorage.removeItem('hifi_queue');
    localStorage.removeItem('hifi_last_track');
    localStorage.removeItem('hifi_codec_info');
    // Dispatch event so MusicContext can stop the engine and clear state
    window.dispatchEvent(new Event('hifi:logout'));
    setState({ isLoggedIn: false, setupDone: true, username: '', loading: false, error: null });
  }, []);

  return (
    <AuthContext.Provider value={{ ...state, setup, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be inside AuthProvider');
  return ctx;
}