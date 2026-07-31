import React, { createContext, useContext, useState, useCallback } from 'react';

interface Settings {
  navidromeUrl: string;
  sonosProxyUrl: string;
  sonosProxyApiKey: string;
  persistQueue: boolean;
  companionUrl: string;
  companionApiKey: string;
}

interface SettingsContextValue {
  settings: Settings;
  updateSettings: (partial: Partial<Settings>) => void;
}

const STORAGE_KEY = 'hifi_settings';

const defaultSettings: Settings = {
  navidromeUrl: '',
  sonosProxyUrl: '',
  sonosProxyApiKey: '',
  persistQueue: true,
  companionUrl: '',
  companionApiKey: '',
};

const SettingsContext = createContext<SettingsContextValue | null>(null);

export function SettingsProvider({ children }: { children: React.ReactNode }) {
  const [settings, setSettings] = useState<Settings>(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) return { ...defaultSettings, ...JSON.parse(raw) };
    } catch {}
    return defaultSettings;
  });

  const updateSettings = useCallback((partial: Partial<Settings>) => {
    setSettings(prev => {
      const next = { ...prev, ...partial };
      try { localStorage.setItem(STORAGE_KEY, JSON.stringify(next)); } catch {}
      return next;
    });
  }, []);

  return (
    <SettingsContext.Provider value={{ settings, updateSettings }}>
      {children}
    </SettingsContext.Provider>
  );
}

export function useSettings() {
  const ctx = useContext(SettingsContext);
  if (!ctx) throw new Error('useSettings must be inside SettingsProvider');
  return ctx;
}
