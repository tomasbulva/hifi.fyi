import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import {
  getHotTrackIds,
  checkCompanionHealth,
  getCompanionStatus,
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


const CompanionContext = createContext<CompanionContextValue | null>(null);

export function CompanionProvider({ children }: { children: React.ReactNode }) {
  const [enabled, setEnabled] = useState(false);
  const [hotTrackIds, setHotTrackIds] = useState<Set<string>>(new Set());
  const [scanStatus, setScanStatus] = useState<CompanionContextValue['scanStatus']>(null);

  // Companion API is always at /api (same origin), no configurable URL needed.
  const checkAndInit = useCallback(async () => {
    const ok = await checkCompanionHealth();
    return ok;
  }, []);

  useEffect(() => {
    checkAndInit().then(ok => {
      if (ok) {
        setEnabled(true);
        getHotTrackIds().then(ids => setHotTrackIds(ids));
        getCompanionStatus().then(status => setScanStatus(status));
      } else {
        setEnabled(false);
      }
    });
  }, [checkAndInit]);

  // Retry health check when not enabled — covers CompanionProvider mounting
  // before the server is ready. Backs off 5s→60s instead of a fixed 5s timer
  // that ran forever (with console spam every tick) on companion-less setups.
  useEffect(() => {
    if (enabled) return;
    let attempt = 0;
    let timerId: ReturnType<typeof setTimeout> | undefined;
    const tryOnce = async () => {
      attempt++;
      const ok = await checkAndInit();
      if (ok) {
        setEnabled(true);
        getHotTrackIds().then(ids => setHotTrackIds(ids));
        getCompanionStatus().then(status => setScanStatus(status));
        return;
      }
      const delay = Math.min(5000 * attempt, 60000);
      timerId = setTimeout(tryOnce, delay);
    };
    tryOnce();
    return () => { if (timerId) clearTimeout(timerId); };
  }, [enabled, checkAndInit]);

  // Poll scan status while companion is enabled. Fast (3s) only while a scan
  // is actually running; 30s otherwise — it used to poll every 3s around the
  // clock and setScanStatus churned the tree every tick.
  useEffect(() => {
    if (!enabled) return;
    const scanning = !!scanStatus?.scanning;
    const pollInterval = setInterval(() => {
      getCompanionStatus().then(status => {
        if (!status) return;
        setScanStatus(prev => {
          if (prev && prev.scanning === status.scanning &&
              prev.progress === status.progress &&
              prev.total_songs === status.total_songs) return prev; // no churn
          return status;
        });
      }).catch(() => {});
    }, scanning ? 3000 : 30000);
    return () => clearInterval(pollInterval);
  }, [enabled, scanStatus?.scanning]);

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
