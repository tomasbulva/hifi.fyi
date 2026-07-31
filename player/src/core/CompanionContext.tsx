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

  // Re-check companion whenever settings change
  useEffect(() => {
    reloadCompanionSettings();
    const url = getCompanionUrl();
    if (!url) {
      setEnabled(false);
      return;
    }

    let cancelled = false;
    checkCompanionHealth().then(ok => {
      if (cancelled) return;
      setEnabled(ok);
      if (ok) {
        getHotTrackIds().then(ids => { if (!cancelled) setHotTrackIds(ids); });
        getCompanionStatus().then(status => { if (!cancelled) setScanStatus(status); });
      }
    });

    return () => { cancelled = true; };
  }, [settings.companionUrl, settings.companionApiKey]);

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
