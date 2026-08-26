import { useState, useEffect } from 'react';
import { useSettings } from '../../core/SettingsContext';
import { useAuth } from '../../core/AuthContext';
import { reloadProxyUrl, getProxyUrl } from '../../core/sonosProvider';
import { reconfigureFromSettings } from '../../core/api';
import { useToast } from '../../components/Toast';
import { reloadCompanionSettings } from '../../core/companionClient';

export default function SettingsView() {
  const { settings, updateSettings } = useSettings();
  const { username, serverUrl, logout, reconnect } = useAuth();
  const toast = useToast();
  const [navidromeUrl, setNavidromeUrl] = useState('');
  const [sonosProxyUrl, setSonosProxyUrl] = useState('');
  const [sonosProxyApiKey, setSonosProxyApiKey] = useState('');
  const [persistQueue, setPersistQueue] = useState(true);
  const [companionUrl, setCompanionUrl] = useState('');
  const [companionApiKey, setCompanionApiKey] = useState('');
  const [saved, setSaved] = useState(false);

  // Load current values
  useEffect(() => {
    setNavidromeUrl(settings.navidromeUrl || serverUrl || '');
    setSonosProxyUrl(settings.sonosProxyUrl || getProxyUrl());
    setSonosProxyApiKey(settings.sonosProxyApiKey || '');
    setPersistQueue(settings.persistQueue !== false);
    setCompanionUrl(settings.companionUrl || '');
    setCompanionApiKey(settings.companionApiKey || '');
  }, [settings, serverUrl]);

  async function handleSave() {
    updateSettings({ navidromeUrl, sonosProxyUrl, sonosProxyApiKey, persistQueue, companionUrl, companionApiKey });
    reloadProxyUrl();
    // Update the server-side proxy target so /rest routes to the new Navidrome URL
    if (navidromeUrl && navidromeUrl.trim()) {
      try {
        await fetch('/api/proxy-config', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ navidromeUrl: navidromeUrl.trim() }),
        });
      } catch { /* server might not be running */ }
    }
    // Reconfigure API client with new Navidrome URL
    reconfigureFromSettings(navidromeUrl);
    // Reload companion settings
    reloadCompanionSettings();
    setSaved(true);
    // Verify the new connection works
    if (navidromeUrl && navidromeUrl.trim() && navidromeUrl !== serverUrl) {
      const ok = await reconnect();
      if (ok) {
        toast.show(`Connected to ${navidromeUrl}`);
      } else {
        toast.show('Could not connect — check URL and try logging out and back in');
      }
    }
    setTimeout(() => setSaved(false), 2000);
  }

  function handleResetProxy() {
    const defaultUrl = `http://${window.location.hostname}:4321`;
    setSonosProxyUrl(defaultUrl);
  }

  return (
    <div className="w-full">
      <div className="mx-auto max-w-2xl px-6 py-8">
        <h1 className="mb-6 text-xl font-bold" style={{ color: 'var(--color-text)' }}>
          Configuration
        </h1>

        {/* Connection section */}
        <section className="mb-8">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider" style={{ color: 'var(--color-text-muted)' }}>
            Connection
          </h2>

          <div className="space-y-4 rounded-md border border-border bg-surface p-4">
            {/* Navidrome URL */}
            <div>
              <label className="mb-1 block text-small font-medium" style={{ color: 'var(--color-text)' }}>
                Navidrome Server URL
              </label>
              <input
                type="url"
                value={navidromeUrl}
                onChange={e => setNavidromeUrl(e.target.value)}
                placeholder="https://music.example.com or http://192.168.1.100:4533"
                className="w-full rounded-sm border border-border bg-background px-3 py-2 text-small"
                style={{ color: 'var(--color-text)' }}
              />
              <p className="mt-1 text-xs" style={{ color: 'var(--color-text-muted)' }}>
                The URL of your Navidome instance. Currently connected to: <code>{serverUrl || '—'}</code>
              </p>
            </div>

            {/* Sonos Proxy URL */}
            <div>
              <label className="mb-1 block text-small font-medium" style={{ color: 'var(--color-text)' }}>
                Sonos Proxy URL
              </label>
              <div className="flex gap-2">
                <input
                  type="url"
                  value={sonosProxyUrl}
                  onChange={e => setSonosProxyUrl(e.target.value)}
                  placeholder="http://192.168.1.100:4321"
                  className="flex-1 rounded-sm border border-border bg-background px-3 py-2 text-small"
                  style={{ color: 'var(--color-text)' }}
                />
                <button
                  onClick={handleResetProxy}
                  className="rounded-sm border border-border px-3 py-2 text-small cursor-pointer whitespace-nowrap"
                  style={{ background: 'none', color: 'var(--color-text-secondary)' }}
                >
                  Reset
                </button>
              </div>
              <p className="mt-1 text-xs" style={{ color: 'var(--color-text-muted)' }}>
                URL of the Sonos cast proxy. Must be on the same network as your Sonos speakers. Defaults to <code>{`http://<player-host>:4321`}</code>.
              </p>
            </div>

            {/* Sonos Proxy API Key */}
            <div>
              <label className="mb-1 block text-small font-medium" style={{ color: 'var(--color-text)' }}>
                Proxy API Key
              </label>
              <input
                type="text"
                value={sonosProxyApiKey}
                onChange={e => setSonosProxyApiKey(e.target.value)}
                placeholder="(optional shared secret)"
                className="w-full rounded-sm border border-border bg-background px-3 py-2 text-small font-mono"
                style={{ color: 'var(--color-text)' }}
              />
              <p className="mt-1 text-xs" style={{ color: 'var(--color-text-muted)' }}>
                Shared secret between player and proxy. Set the same value in <code>PROXY_API_KEY</code> on the proxy. Leave empty for no auth.
              </p>
            </div>
          </div>
        </section>

        {/* Playback section */}
        <section className="mb-8">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider" style={{ color: 'var(--color-text-muted)' }}>
            Playback
          </h2>
          <div className="rounded-md border border-border bg-surface p-4">
            <label className="flex items-center justify-between cursor-pointer">
              <div>
                <span className="block text-small font-medium" style={{ color: 'var(--color-text)' }}>
                  Remember Queue
                </span>
                <span className="block text-xs mt-0.5" style={{ color: 'var(--color-text-muted)' }}>
                  Save the current queue and last played song. Restores on next visit.
                </span>
              </div>
              <button
                onClick={() => setPersistQueue(!persistQueue)}
                className={`relative w-10 h-5 rounded-full transition-colors border-none cursor-pointer flex-shrink-0 ${persistQueue ? 'bg-primary' : 'bg-on-surface-variant/30'}`}
              >
                <span
                  className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white shadow-sm transition-transform ${persistQueue ? 'translate-x-5' : 'translate-x-0'}`}
                />
              </button>
            </label>
          </div>
          <div className="mt-4 pt-4" style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}>
            <div className="flex items-center justify-between py-3">
              <div>
                <span className="text-sm font-semibold" style={{ color: 'var(--color-text)' }}>Keep Playing</span>
                <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>Automatically suggest next song when queue ends</p>
              </div>
              <button
                onClick={() => updateSettings({ autoplay: !settings.autoplay })}
                className="w-12 h-6 rounded-full border-none cursor-pointer transition-colors"
                style={{ background: settings.autoplay ? 'var(--color-primary)' : 'rgba(255,255,255,0.1)' }}
              >
                <div className="w-5 h-5 rounded-full bg-white transition-transform"
                  style={{ transform: settings.autoplay ? 'translateX(24px)' : 'translateX(2px)' }} />
              </button>
            </div>
          </div>
        </section>

        {/* Smart Features section */}
        <section className="mb-8">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider" style={{ color: 'var(--color-text-muted)' }}>
            Smart Features
          </h2>
          <div className="rounded-md border border-border bg-surface p-4 space-y-4">
            <div>
              <label className="mb-1 block text-small font-medium" style={{ color: 'var(--color-text)' }}>
                Companion Service URL
              </label>
              <input
                type="url"
                value={companionUrl}
                onChange={e => setCompanionUrl(e.target.value)}
                placeholder="http://192.168.1.100:4322"
                className="w-full rounded-sm border border-border bg-background px-3 py-2 text-small"
                style={{ color: 'var(--color-text)' }}
              />
              <p className="mt-1 text-xs" style={{ color: 'var(--color-text-muted)' }}>
                URL of the hifi companion service. Provides smart playlists, hot tracks, and radio mode. Leave empty to disable.
              </p>
            </div>
            <div>
              <label className="mb-1 block text-small font-medium" style={{ color: 'var(--color-text)' }}>
                Companion API Key
              </label>
              <input
                type="text"
                value={companionApiKey}
                onChange={e => setCompanionApiKey(e.target.value)}
                placeholder="(optional shared secret)"
                className="w-full rounded-sm border border-border bg-background px-3 py-2 text-small font-mono"
                style={{ color: 'var(--color-text)' }}
              />
              <p className="mt-1 text-xs" style={{ color: 'var(--color-text-muted)' }}>
                Shared secret between player and companion. Set the same value in <code>PROXY_API_KEY</code> on the companion. Leave empty for no auth.
              </p>
            </div>
          </div>
        </section>

        {/* Profile section */}
        <section className="mb-8">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider" style={{ color: 'var(--color-text-muted)' }}>
            Profile
          </h2>
          <div className="rounded-md border border-border bg-surface p-4">
            <div className="flex items-center gap-4">
              <div
                className="flex h-12 w-12 items-center justify-center rounded-full text-lg font-bold"
                style={{ background: 'var(--color-primary)', color: '#fff' }}
              >
                {username?.[0]?.toUpperCase() || '?'}
              </div>
              <div>
                <div className="text-small font-semibold" style={{ color: 'var(--color-text)' }}>
                  {username || '—'}
                </div>
                <div className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
                  Connected to Navidome
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* About section */}
        <section className="mb-8">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider" style={{ color: 'var(--color-text-muted)' }}>
            About
          </h2>
          <div className="rounded-md border border-border bg-surface p-4">
            <div className="text-small" style={{ color: 'var(--color-text)' }}>
              <span className="font-mono font-bold" style={{ color: 'var(--color-primary)' }}>hifi</span> — web music player for Navidrome
            </div>
            <div className="mt-1 text-xs" style={{ color: 'var(--color-text-muted)' }}>
              Built with React, Web Audio API, and the Subsonic API.
            </div>
          </div>
        </section>

        {/* Save / Logout */}
        <div className="flex items-center gap-3">
          <button
            onClick={handleSave}
            className="rounded-sm px-4 py-2 text-small font-semibold border-none cursor-pointer"
            style={{ background: 'var(--color-primary)', color: '#fff' }}
          >
            {saved ? '✓ Saved' : 'Save Settings'}
          </button>
          <button
            onClick={logout}
            className="rounded-sm border border-border px-4 py-2 text-small cursor-pointer"
            style={{ background: 'none', color: 'var(--color-error)' }}
          >
            Logout
          </button>
        </div>
      </div>
    </div>
  );
}
