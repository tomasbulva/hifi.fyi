import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { useEffect, useRef, useState } from 'react';
import { AuthProvider, useAuth } from './core/AuthContext';
import { MusicProvider } from './core/MusicContext';
import { CastProvider } from './core/CastContext';
import { SettingsProvider } from './core/SettingsContext';
import { CompanionProvider, useCompanion } from './core/CompanionContext';
import { SkinProvider } from './core/SkinContext';

import Login from './features/auth/Login';
import PlayerView from './features/player/PlayerView';
import LibraryView from './features/library/LibraryView';
import SettingsView from './features/settings/SettingsView';
import SearchView from './features/search/SearchView';
import FavoritesView from './features/favorites/FavoritesView';
import SmartPlaylistView from './features/playlists/SmartPlaylistView';
import Sidebar from './components/Sidebar';
import MobileBottomNav from './components/MobileBottomNav';
import MiniPlayer from './components/MiniPlayer';
import { ErrorBoundary } from './components/ErrorBoundary';
import { ToastProvider } from './components/Toast';
import { useKeyboardShortcuts } from './hooks/useKeyboardShortcuts';
import { useMediaSession } from './hooks/useMediaSession';

function PlayerApp() {
  const { isLoggedIn } = useAuth();
  const location = useLocation();
  const { scanStatus } = useCompanion();
  const [scanBanner, setScanBanner] = useState<string | null>(null);
  const wasScanning = useRef(false);

  useKeyboardShortcuts();
  useMediaSession();

  // Global scan status banner — visible on every page, not just Library
  useEffect(() => {
    if (!scanStatus) return;
    if (scanStatus.scanning) {
      const total = scanStatus.total_songs || 1;
      const pct = Math.round((scanStatus.progress / total) * 100);
      setScanBanner(`Scanning library… ${pct}% (${scanStatus.progress}/${scanStatus.total_songs || '?'} songs)`);
      wasScanning.current = true;
    } else if (wasScanning.current) {
      setScanBanner(`Scan complete: ${scanStatus.total_songs || '?'} songs indexed`);
      wasScanning.current = false;
      // Auto-dismiss after 5s
      setTimeout(() => setScanBanner(null), 5000);
    }
  }, [scanStatus?.scanning, scanStatus?.progress, scanStatus?.total_songs]);

  if (!isLoggedIn) return <Login />;

  const showMiniPlayer = location.pathname !== '/player';

  return (
    <div className="min-h-screen bg-surface text-on-surface font-body">
      <Sidebar />
      <MobileBottomNav />

      {showMiniPlayer && <MiniPlayer />}

      {/* Global scan status banner */}
      {scanBanner && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 px-4 py-2 rounded-full text-xs font-bold shadow-lg animate-in"
          style={{ background: 'rgba(208,188,255,0.95)', color: '#1A0A2E' }}>
          {scanBanner}
        </div>
      )}

      <main className="md:ml-64 pb-32 md:pb-20 min-h-screen">
        <ErrorBoundary>
          <Routes>
            <Route path="/" element={<Navigate to="/player" replace />} />
            <Route path="/player" element={<PlayerView />} />
            <Route path="/library/albums/:albumSlug/:albumId" element={<LibraryView />} />
            <Route path="/library/artists/:artistSlug/:artistId" element={<LibraryView />} />
            <Route path="/library/playlists/:playlistSlug/:playlistId" element={<LibraryView />} />
            <Route path="/smart/:kind/:id" element={<SmartPlaylistView />} />
            <Route path="/library/:tab" element={<LibraryView />} />
            <Route path="/library" element={<LibraryView />} />
            <Route path="/search" element={<SearchView />} />
            <Route path="/favorites" element={<FavoritesView />} />
            <Route path="/settings" element={
              <div className="pt-12">
                <SettingsView />
              </div>
            } />
            <Route path="*" element={<Navigate to="/player" replace />} />
          </Routes>
        </ErrorBoundary>
      </main>
    </div>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <SettingsProvider>
          <MusicProvider>
            <CastProvider>
              <CompanionProvider>
                <SkinProvider>
                  <ToastProvider>
                    <PlayerApp />
                  </ToastProvider>
                </SkinProvider>
              </CompanionProvider>
            </CastProvider>
          </MusicProvider>
        </SettingsProvider>
      </AuthProvider>
    </BrowserRouter>
  );
}
