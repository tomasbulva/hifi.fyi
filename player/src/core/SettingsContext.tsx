import React, { createContext, useContext, useState, useCallback, useEffect, useRef } from 'react';
import { useAuth } from './AuthContext';

export interface Settings {
  sonosProxyUrl: string;
  sonosProxyApiKey: string;
  persistQueue: boolean;
  autoplay: boolean;
  smartPlaylists: boolean;
}

interface SettingsContextValue {
  settings: Settings;
  updateSettings: (partial: Partial<Settings>) => void;
  /** True while the initial server sync has not finished. */
  loading: boolean;
}

const STORAGE_KEY = 'hifi_settings';

const defaultSettings: Settings = {
  sonosProxyUrl: '',
  sonosProxyApiKey: '',
  persistQueue: true,
  autoplay: true,
  smartPlaylists: true,
};

const SettingsContext = createContext<SettingsContextValue | null>(null);

function readLocal(): Partial<Settings> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch {}
  return {};
}

export function SettingsProvider({ children }: { children: React.ReactNode }) {
  const { isLoggedIn } = useAuth();
  const [settings, setSettings] = useState<Settings>(() => ({ ...defaultSettings, ...readLocal() }));
  const [loading, setLoading] = useState(isLoggedIn);
  // Latest settings value for the sync effect without re-triggering it.
  const settingsRef = useRef(settings);
  settingsRef.current = settings;

  // On login, sync from the server. Server is the source of truth when it
  // has settings; if the server is empty but this device has local values
  // (pre-existing install), push them up so the account gets seeded.
  useEffect(() => {
    if (!isLoggedIn) return;
    let cancelled = false;
    setLoading(true);
    (async () => {
      try {
        const res = await fetch('/api/settings', { credentials: 'include' });
        if (!res.ok) return;
        const server = await res.json();
        if (cancelled || typeof server !== 'object' || server === null) return;
        const hasServerSettings = Object.keys(server).length > 0;
        if (hasServerSettings) {
          setSettings(prev => ({ ...prev, ...server }));
        } else {
          const local = settingsRef.current;
          if (JSON.stringify(local) !== JSON.stringify(defaultSettings)) {
            await fetch('/api/settings', {
              method: 'PUT',
              credentials: 'include',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(local),
            });
          }
        }
      } catch {
        // Offline / server unreachable — keep local values.
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [isLoggedIn]);

  const updateSettings = useCallback((partial: Partial<Settings>) => {
    setSettings(prev => {
      const next = { ...prev, ...partial };
      try { localStorage.setItem(STORAGE_KEY, JSON.stringify(next)); } catch {}
      // Persist to the server account (fire-and-forget; localStorage stays
      // the offline fallback).
      fetch('/api/settings', {
        method: 'PUT',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(next),
      }).catch(() => {});
      return next;
    });
  }, []);

  return (
    <SettingsContext.Provider value={{ settings, updateSettings, loading }}>
      {children}
    </SettingsContext.Provider>
  );
}

export function useSettings() {
  const ctx = useContext(SettingsContext);
  if (!ctx) throw new Error('useSettings must be inside SettingsProvider');
  return ctx;
}
