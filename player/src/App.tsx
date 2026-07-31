import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { AuthProvider, useAuth } from './core/AuthContext';
import { MusicProvider } from './core/MusicContext';
import { CastProvider } from './core/CastContext';
import { SettingsProvider } from './core/SettingsContext';
import { CompanionProvider } from './core/CompanionContext';
import { SkinProvider } from './core/SkinContext';

import Login from './features/auth/Login';
import PlayerView from './features/player/PlayerView';
import LibraryView from './features/library/LibraryView';
import SettingsView from './features/settings/SettingsView';
import SearchView from './features/search/SearchView';
import FavoritesView from './features/favorites/FavoritesView';
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

  useKeyboardShortcuts();
  useMediaSession();

  if (!isLoggedIn) return <Login />;

  const showMiniPlayer = location.pathname !== '/player';

  return (
    <div className="min-h-screen bg-surface text-on-surface font-body">
      <Sidebar />
      <MobileBottomNav />

      {showMiniPlayer && <MiniPlayer />}

      <main className="md:ml-64 pb-32 md:pb-20 min-h-screen">
        <ErrorBoundary>
          <Routes>
            <Route path="/" element={<Navigate to="/player" replace />} />
            <Route path="/player" element={<PlayerView />} />
            <Route path="/library/albums/:albumSlug/:albumId" element={<LibraryView />} />
            <Route path="/library/artists/:artistSlug/:artistId" element={<LibraryView />} />
            <Route path="/library/playlists/:playlistSlug/:playlistId" element={<LibraryView />} />
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
