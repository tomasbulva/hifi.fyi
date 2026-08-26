import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import {
  getHotTrackIds,
  reloadCompanionSettings,
  checkCompanionHealth,
  getCompanionStatus,
  getCompanionUrl,
  triggerScan,
  getSmartPlaylist,
  getRadioTracks,
  getNextRecommendation,
  getSongRating,
} from './companionClient';
import type { SubsonicSong } from './types';
import type { SongRating } from './companionClient';

interface CompanionContextValue {
  enabled: boolean;
  hotTrackIds: Set<string>;
  scanStatus: { scanning: boolean; total_songs: number; progress: number; last_scan: string } | null;
  refreshHotTracks: () => Promise<void>;
  refreshStatus: () => Promise<void>;
  getRating: (songId: string) => Promise<SongRating | null>;
  startScan: () => Promise<void>;
  getPlaylist: (params: { mood?: string; era?: string; topRated?: boolean; limit?: number }) => Promise<SubsonicSong[]>;
  getRadio: (seed: string, limit?: number) => Promise<SubsonicSong[]>;
  getNext: (currentSongId: string) => Promise<SubsonicSong | null>;
}

import { useSettings } from './SettingsContext';

const CompanionContext = createContext<CompanionContextValue | null>(null);

export function CompanionProvider({ children }: { children: React.ReactNode }) {
  const { settings } = useSettings();
  const [enabled, setEnabled] = useState(false);
  const [hotTrackIds, setHotTrackIds] = useState<Set<string>>(new Set());
  const [scanStatus, setScanStatus] = useState<CompanionContextValue['scanStatus']>(null);

  // Re-check companion whenever settings or auth change
  // Settings change triggers dependency. For auth/login transitions,
  // we rely on retry below since the provider mounts before login.
  const checkAndInit = useCallback(async () => {
    reloadCompanionSettings();
    const url = getCompanionUrl();
    if (!url) return false;
    const ok = await checkCompanionHealth();
    return ok;
  }, []);

  useEffect(() => {
    console.log('[companion] init effect firing, settings changed');
    checkAndInit().then(ok => {
      console.log('[companion] initial health check:', ok);
      if (ok) {
        setEnabled(true);
        getHotTrackIds().then(ids => setHotTrackIds(ids));
        getCompanionStatus().then(status => {
          console.log('[companion] initial status:', JSON.stringify(status));
          setScanStatus(status);
        });
      } else {
        setEnabled(false);
      }
    });
  }, [settings.companionUrl, settings.companionApiKey, checkAndInit]);

  // Retry health check every 5s when not enabled — covers the case where
  // CompanionProvider mounts before the server is ready (e.g. before login)
  useEffect(() => {
    if (enabled) return;
    console.log('[companion] retry loop active (enabled=false), checking every 5s');
    const retryTimer = setInterval(() => {
      console.log('[companion] retrying health check...');
      checkAndInit().then(ok => {
        console.log('[companion] retry health result:', ok);
        if (ok) {
          setEnabled(true);
          getHotTrackIds().then(ids => setHotTrackIds(ids));
          getCompanionStatus().then(status => setScanStatus(status));
        }
      });
    }, 5000);
    return () => clearInterval(retryTimer);
  }, [enabled, checkAndInit]);

  // Poll scan status while companion is enabled (separate from init to avoid race)
  useEffect(() => {
    if (!enabled) return;
    console.log('[companion] polling started, fetching status immediately');
    // Fetch immediately
    getCompanionStatus().then(status => {
      console.log('[companion] immediate status:', JSON.stringify(status));
      if (status) setScanStatus(status);
    }).catch(e => console.log('[companion] immediate status error:', e));
    const pollInterval = setInterval(() => {
      getCompanionStatus().then(status => {
        if (status) setScanStatus(status);
      }).catch(() => {});
    }, 3000);
    return () => { console.log('[companion] polling stopped'); clearInterval(pollInterval); };
  }, [enabled]);

  const refreshHotTracks = useCallback(async () => {
    if (!enabled) return;
    const ids = await getHotTrackIds();
    setHotTrackIds(ids);
  }, [enabled]);

  const refreshStatus = useCallback(async () => {
    if (!enabled) return;
    const status = await getCompanionStatus();
    setScanStatus(status);
  }, [enabled]);

  const startScan = useCallback(async () => {
    if (!enabled) return;
    await triggerScan();
    // Poll status for a bit
    const poll = setInterval(async () => {
      const status = await getCompanionStatus();
      setScanStatus(status);
      if (status && !status.scanning) {
        clearInterval(poll);
        refreshHotTracks();
      }
    }, 3000);
    setTimeout(() => clearInterval(poll), 120000); // Safety timeout
  }, [enabled, refreshHotTracks]);

  const getPlaylist = useCallback(async (params: { mood?: string; era?: string; topRated?: boolean; limit?: number }) => {
    if (!enabled) return [];
    return getSmartPlaylist(params);
  }, [enabled]);

  const getRadio = useCallback(async (seed: string, limit?: number) => {
    if (!enabled) return [];
    return getRadioTracks(seed, limit);
  }, [enabled]);

  const getNext = useCallback(async (currentSongId: string) => {
    if (!enabled) return null;
    return getNextRecommendation(currentSongId);
  }, [enabled]);

  const getRating = useCallback(async (songId: string) => {
    if (!enabled) return null;
    return getSongRating(songId);
  }, [enabled]);

  return (
    <CompanionContext.Provider value={{
      enabled,
      hotTrackIds,
      scanStatus,
      refreshHotTracks,
      refreshStatus,
      getRating,
      startScan,
      getPlaylist,
      getRadio,
      getNext,
    }}>
      {children}
    </CompanionContext.Provider>
  );
}

export function useCompanion() {
  const ctx = useContext(CompanionContext);
  if (!ctx) throw new Error('useCompanion must be inside CompanionProvider');
  return ctx;
}
