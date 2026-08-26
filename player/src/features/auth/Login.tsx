import { useState, useEffect, type FormEvent } from 'react';
import { useAuth } from '../../core/AuthContext';

export default function Login() {
  const { login, error } = useAuth();
  const [serverUrl, setServerUrl] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [banRemaining, setBanRemaining] = useState<number | null>(null);
  const [permaBanned, setPermaBanned] = useState(false);

  // Check ban status on mount + poll every second when banned
  useEffect(() => {
    let interval: ReturnType<typeof setInterval>;

    async function checkBan() {
      try {
        const res = await fetch('/api/auth/ban-status');
        const data = await res.json();
        if (data.banned) {
          setPermaBanned(data.permanent);
          setBanRemaining(data.remaining);
        } else {
          setPermaBanned(false);
          setBanRemaining(null);
        }
      } catch {
        // Server unreachable — don't block login
      }
    }

    checkBan();
    interval = setInterval(checkBan, 1000);
    return () => clearInterval(interval);
  }, []);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (banRemaining !== null || permaBanned) return;
    setLoading(true);
    try {
      // First: configure the server-side proxy to point at the Navidrome URL
      if (serverUrl && serverUrl.trim()) {
        try {
          await fetch('/api/proxy-config', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ navidromeUrl: serverUrl.trim() }),
          });
        } catch { /* server might not be running in dev — Vite proxy handles it */ }
      }
      const success = await login(serverUrl, username, password);
      if (success) {
        // Clear server-side attempt counter
        fetch('/api/auth/success', { method: 'POST' }).catch(() => {});
      } else {
        // Report failed attempt to server
        try {
          const res = await fetch('/api/auth/failed', { method: 'POST' });
          const data = await res.json();
          if (data.banned) {
            if (data.permanent) {
              setPermaBanned(true);
            } else {
              setBanRemaining(Math.ceil((data.duration || 0) / 1000));
            }
          }
        } catch {
          // Server unreachable — can't track
        }
      }
    } finally {
      setLoading(false);
    }
  }

  const isBanned = permaBanned || (banRemaining !== null && banRemaining > 0);

  return (
    <div className="relative flex flex-col min-h-[100dvh] items-center justify-center p-6 overflow-hidden"
         style={{ background: 'var(--color-background)' }}>
      {/* Decorative background glows */}
      <div className="pointer-events-none absolute top-[20%] left-1/2 -translate-x-1/2 w-[768px] h-[768px] rounded-full blur-3xl"
           style={{ background: 'var(--color-primary)', opacity: 0.10 }} />
      <div className="pointer-events-none absolute bottom-[20%] left-1/2 -translate-x-1/2 w-[768px] h-[768px] rounded-full blur-3xl"
           style={{ background: 'var(--color-secondary)', opacity: 0.05 }} />

      <form
        onSubmit={handleSubmit}
        className="relative flex w-full max-w-[384px] flex-col rounded-xl p-8 gap-6"
        style={{
          background: 'rgba(32, 31, 31, 0.30)',
          backdropFilter: 'blur(20px)',
          WebkitBackdropFilter: 'blur(20px)',
          border: '1px solid rgba(255, 255, 255, 0.10)',
          boxShadow: '0 8px 32px rgba(0, 0, 0, 0.4)',
        }}
      >
        {/* Top gradient line */}
        <div className="absolute top-0 left-0 right-0 h-px rounded-t-xl"
             style={{
               background: 'linear-gradient(90deg, transparent, var(--color-primary) 50%, transparent)',
               opacity: 0.3,
             }} />

        {/* Logo */}
        <div className="flex flex-col items-center mt-2 mb-2">
          <h1 className="text-4xl font-bold tracking-tight" style={{ color: 'var(--color-primary)', margin: 0 }}>
            hifi
          </h1>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] mt-1"
             style={{ color: 'var(--color-on-surface-variant)', opacity: 0.8 }}>
            Audiophile Grade
          </p>
        </div>

        {/* Error banner */}
        {error && !isBanned && (
          <div className="flex items-start gap-3 rounded-lg p-4"
               style={{
                 background: 'rgba(147, 0, 10, 0.10)',
                 border: '1px solid rgba(255, 180, 171, 0.30)',
                 backdropFilter: 'blur(8px)',
               }}>
            <span className="material-symbols-outlined text-xl flex-shrink-0 mt-0.5"
                  style={{ color: '#FFB4AB' }}>
              error
            </span>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold" style={{ color: '#FFB4AB' }}>Authentication Failed</p>
              <p className="text-xs mt-0.5" style={{ color: '#FFB4AB', opacity: 0.8 }}>
                {error}
              </p>
            </div>
          </div>
        )}

        {/* Permanent ban — locked forever, no countdown */}
        {permaBanned ? (
          <div className="flex flex-col items-center gap-4 py-8">
            <span className="material-symbols-outlined text-5xl" style={{ color: '#FFB4AB' }}>
              block
            </span>
            <p className="text-base font-semibold text-center" style={{ color: 'var(--color-on-surface)' }}>
              Permanently Banned
            </p>
            <p className="text-sm text-center" style={{ color: 'var(--color-on-surface-variant)' }}>
              This IP has been permanently banned due to too many failed login attempts.
            </p>
          </div>
        ) : banRemaining !== null && banRemaining > 0 ? (
          <div className="flex flex-col items-center gap-4 py-8">
            <span className="material-symbols-outlined text-5xl" style={{ color: '#FFB4AB' }}>
              lock
            </span>
            <p className="text-base font-semibold text-center" style={{ color: 'var(--color-on-surface)' }}>
              Too many failed attempts
            </p>
            <p className="text-sm" style={{ color: 'var(--color-on-surface-variant)' }}>
              Try again in {banRemaining}s
            </p>
          </div>
        ) : (
          <>
            {/* Server URL */}
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium" style={{ color: 'var(--color-on-surface-variant)' }}>
                Server URL
              </label>
              <div className="relative">
                <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-xl"
                      style={{ color: 'var(--color-on-surface-variant)', opacity: 0.6 }}>
                  dns
                </span>
                <input
                  type="url"
                  value={serverUrl}
                  onChange={e => setServerUrl(e.target.value)}
                  className="w-full rounded-lg pl-10 pr-3 py-3 text-sm outline-none transition-colors"
                  style={{
                    background: 'var(--color-surface)',
                    border: '1px solid rgba(255, 255, 255, 0.08)',
                    color: 'var(--color-on-surface)',
                  }}
                  placeholder="https://music.example.com (leave empty for same-origin)"
                  autoFocus
                />
              </div>
            </div>

            {/* Username */}
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium" style={{ color: 'var(--color-on-surface-variant)' }}>
                Username
              </label>
              <div className="relative">
                <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-xl"
                      style={{ color: 'var(--color-on-surface-variant)', opacity: 0.6 }}>
                  person
                </span>
                <input
                  type="text"
                  value={username}
                  onChange={e => setUsername(e.target.value)}
                  className="w-full rounded-lg pl-10 pr-3 py-3 text-sm outline-none transition-colors"
                  style={{
                    background: 'var(--color-surface)',
                    border: '1px solid rgba(255, 255, 255, 0.08)',
                    color: 'var(--color-on-surface)',
                  }}
                  placeholder="Keith Richards"
                />
              </div>
            </div>

            {/* Password */}
            <div className="flex flex-col gap-1.5">
              <div className="flex items-center justify-between">
                <label className="text-xs font-medium" style={{ color: 'var(--color-on-surface-variant)' }}>
                  Password
                </label>
              </div>
              <div className="relative">
                <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-xl"
                      style={{ color: 'var(--color-on-surface-variant)', opacity: 0.6 }}>
                  lock
                </span>
                <input
                  type="password"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  className="w-full rounded-lg pl-10 pr-3 py-3 text-sm outline-none transition-colors"
                  style={{
                    background: 'var(--color-surface)',
                    border: error
                      ? '1px solid rgba(255, 180, 171, 0.4)'
                      : '1px solid rgba(255, 255, 255, 0.08)',
                    color: 'var(--color-on-surface)',
                    boxShadow: error ? '0 0 0 2px rgba(255, 180, 171, 0.15)' : 'none',
                  }}
                  placeholder="••••••••"
                />
              </div>
            </div>

            {/* Sign In button */}
            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-lg py-3 text-sm font-semibold flex items-center justify-center gap-2 transition-all hover:opacity-90 active:scale-[0.98] cursor-pointer disabled:cursor-not-allowed disabled:opacity-50"
              style={{
                background: 'var(--color-primary)',
                color: '#3C0091',
                minHeight: '50px',
              }}
            >
              {loading ? 'Connecting...' : 'Sign In'}
              {!loading && (
                <span className="material-symbols-outlined text-lg">login</span>
              )}
            </button>
          </>
        )}

      </form>

      {/* Footer */}
      <p className="text-center text-xs mt-8" style={{ color: 'var(--color-on-surface-variant)', opacity: 0.6, marginTop: '32px' }}>
        No account? Go away!
      </p>
    </div>
  );
}
