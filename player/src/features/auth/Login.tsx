import { useState, type FormEvent } from 'react';
import { useAuth } from '../../core/AuthContext';

export default function Login() {
  const { setup, login, setupDone, loading, error } = useAuth();
  const [view, setView] = useState<'checking' | 'onboarding' | 'login'>('checking');

  // Onboarding fields
  const [navidromeUrl, setNavidromeUrl] = useState('');
  const [navidromeUsername, setNavidromeUsername] = useState('');
  const [navidromePassword, setNavidromePassword] = useState('');
  const [appPassword, setAppPassword] = useState('');
  const [appPasswordConfirm, setAppPasswordConfirm] = useState('');

  // Login-only fields
  const [loginPassword, setLoginPassword] = useState('');

  const [busy, setBusy] = useState(false);
  const [localError, setLocalError] = useState('');

  // Once loading finishes, pick the right view
  if (view === 'checking' && !loading) {
    setView(setupDone ? 'login' : 'onboarding');
  }
  // If we become logged in while on this page, AuthContext will unmount us (parent shows PlayerApp)

  async function handleSetup(e: FormEvent) {
    e.preventDefault();
    if (appPassword !== appPasswordConfirm) {
      setLocalError('Passwords do not match');
      return;
    }
    if (appPassword.length < 4) {
      setLocalError('App password must be at least 4 characters');
      return;
    }
    setBusy(true);
    setLocalError('');
    try {
      const ok = await setup(navidromeUrl, navidromeUsername, navidromePassword, appPassword);
      if (!ok) setLocalError(error || 'Setup failed');
    } finally {
      setBusy(false);
    }
  }

  async function handleLogin(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setLocalError('');
    try {
      const ok = await login(loginPassword);
      if (!ok) setLocalError(error || 'Invalid password');
    } finally {
      setBusy(false);
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-[100dvh] items-center justify-center" style={{ background: 'var(--color-background)' }}>
        <span className="material-symbols-outlined animate-spin text-3xl" style={{ color: 'var(--color-primary)', opacity: 0.6 }}>
          progress_activity
        </span>
      </div>
    );
  }

  const displayError = localError || error;

  return (
    <div className="relative flex flex-col min-h-[100dvh] items-center justify-center p-6 overflow-hidden"
         style={{ background: 'var(--color-background)' }}>
      {/* Decorative background glows */}
      <div className="pointer-events-none absolute top-[20%] left-1/2 -translate-x-1/2 w-[768px] h-[768px] rounded-full blur-3xl"
           style={{ background: 'var(--color-primary)', opacity: 0.10 }} />
      <div className="pointer-events-none absolute bottom-[20%] left-1/2 -translate-x-1/2 w-[768px] h-[768px] rounded-full blur-3xl"
           style={{ background: 'var(--color-secondary)', opacity: 0.05 }} />

      <form
        onSubmit={view === 'onboarding' ? handleSetup : handleLogin}
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
             style={{ background: 'linear-gradient(90deg, transparent, var(--color-primary) 50%, transparent)', opacity: 0.3 }} />

        {/* Logo */}
        <div className="flex flex-col items-center mt-2 mb-2">
          <h1 className="text-4xl font-bold tracking-tight" style={{ color: 'var(--color-primary)', margin: 0 }}>
            hifi
          </h1>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] mt-1"
             style={{ color: 'var(--color-on-surface-variant)', opacity: 0.8 }}>
            {view === 'onboarding' ? 'Welcome — Set Up Your Server' : 'Sign In'}
          </p>
        </div>

        {/* Error banner */}
        {displayError && (
          <div className="flex items-start gap-3 rounded-lg p-4"
               style={{ background: 'rgba(147, 0, 10, 0.10)', border: '1px solid rgba(255, 180, 171, 0.30)' }}>
            <span className="material-symbols-outlined text-xl flex-shrink-0 mt-0.5" style={{ color: '#FFB4AB' }}>error</span>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold" style={{ color: '#FFB4AB' }}>Error</p>
              <p className="text-xs mt-0.5" style={{ color: '#FFB4AB', opacity: 0.8 }}>{displayError}</p>
            </div>
          </div>
        )}

        {/* ── Onboarding view ── */}
        {view === 'onboarding' && (
          <>
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium" style={{ color: 'var(--color-on-surface-variant)' }}>Navidrome Server URL</label>
              <div className="relative">
                <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-xl"
                      style={{ color: 'var(--color-on-surface-variant)', opacity: 0.6 }}>dns</span>
                <input type="url" value={navidromeUrl} onChange={e => setNavidromeUrl(e.target.value)}
                       className="w-full rounded-lg pl-10 pr-3 py-3 text-sm outline-none" autoFocus
                       style={{ background: 'var(--color-surface)', border: '1px solid rgba(255, 255, 255, 0.08)', color: 'var(--color-on-surface)' }}
                       placeholder="https://music.hifi.fyi" required />
              </div>
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium" style={{ color: 'var(--color-on-surface-variant)' }}>Navidrome Username</label>
              <div className="relative">
                <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-xl"
                      style={{ color: 'var(--color-on-surface-variant)', opacity: 0.6 }}>person</span>
                <input type="text" value={navidromeUsername} onChange={e => setNavidromeUsername(e.target.value)}
                       className="w-full rounded-lg pl-10 pr-3 py-3 text-sm outline-none"
                       style={{ background: 'var(--color-surface)', border: '1px solid rgba(255, 255, 255, 0.08)', color: 'var(--color-on-surface)' }}
                       placeholder="keef" required />
              </div>
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium" style={{ color: 'var(--color-on-surface-variant)' }}>Navidrome Password</label>
              <div className="relative">
                <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-xl"
                      style={{ color: 'var(--color-on-surface-variant)', opacity: 0.6 }}>vpn_key</span>
                <input type="password" value={navidromePassword} onChange={e => setNavidromePassword(e.target.value)}
                       className="w-full rounded-lg pl-10 pr-3 py-3 text-sm outline-none"
                       style={{ background: 'var(--color-surface)', border: '1px solid rgba(255, 255, 255, 0.08)', color: 'var(--color-on-surface)' }}
                       placeholder="••••••••" required />
              </div>
            </div>
            <hr style={{ borderColor: 'rgba(255,255,255,0.05)' }} />
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium" style={{ color: 'var(--color-on-surface-variant)' }}>
                App Password
                <span className="ml-1 opacity-50">— used for future logins (not your Navidrome password)</span>
              </label>
              <input type="password" value={appPassword} onChange={e => setAppPassword(e.target.value)}
                     className="w-full rounded-lg px-3 py-3 text-sm outline-none"
                     style={{ background: 'var(--color-surface)', border: '1px solid rgba(255, 255, 255, 0.08)', color: 'var(--color-on-surface)' }}
                     placeholder="Choose a password for hifi" required minLength={4} />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium" style={{ color: 'var(--color-on-surface-variant)' }}>Confirm App Password</label>
              <input type="password" value={appPasswordConfirm} onChange={e => setAppPasswordConfirm(e.target.value)}
                     className="w-full rounded-lg px-3 py-3 text-sm outline-none"
                     style={{ background: 'var(--color-surface)', border: '1px solid rgba(255, 255, 255, 0.08)', color: 'var(--color-on-surface)' }}
                     placeholder="Same password again" required minLength={4} />
            </div>
            <button type="submit" disabled={busy}
                    className="w-full rounded-lg py-3 text-sm font-semibold flex items-center justify-center gap-2 transition-all hover:opacity-90 active:scale-[0.98] cursor-pointer disabled:cursor-not-allowed disabled:opacity-50"
                    style={{ background: 'var(--color-primary)', color: '#3C0091', minHeight: '50px' }}>
              {busy ? 'Setting up…' : 'Connect & Create Account'}
            </button>
            <button type="button" onClick={() => setView('login')}
                    className="text-xs underline cursor-pointer self-center mt-1"
                    style={{ color: 'var(--color-on-surface-variant)', opacity: 0.6 }}>
              I already have an account
            </button>
          </>
        )}

        {/* ── Login view ── */}
        {view === 'login' && (
          <>
            <p className="text-xs text-center" style={{ color: 'var(--color-on-surface-variant)', opacity: 0.6 }}>
              Enter your app password to unlock hifi
            </p>
            <div className="flex flex-col gap-1.5">
              <div className="relative">
                <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-xl"
                      style={{ color: 'var(--color-on-surface-variant)', opacity: 0.6 }}>lock</span>
                <input type="password" value={loginPassword} onChange={e => setLoginPassword(e.target.value)}
                       className="w-full rounded-lg pl-10 pr-3 py-3 text-sm outline-none" autoFocus
                       style={{ background: 'var(--color-surface)', border: '1px solid rgba(255, 255, 255, 0.08)', color: 'var(--color-on-surface)' }}
                       placeholder="App password" required />
              </div>
            </div>
            <button type="submit" disabled={busy}
                    className="w-full rounded-lg py-3 text-sm font-semibold flex items-center justify-center gap-2 transition-all hover:opacity-90 active:scale-[0.98] cursor-pointer disabled:cursor-not-allowed disabled:opacity-50"
                    style={{ background: 'var(--color-primary)', color: '#3C0091', minHeight: '50px' }}>
              {busy ? 'Signing in…' : 'Sign In'}
            </button>
            <button type="button" onClick={() => setView('onboarding')}
                    className="text-xs underline cursor-pointer self-center"
                    style={{ color: 'var(--color-on-surface-variant)', opacity: 0.6 }}>
              Reconfigure server
            </button>
          </>
        )}
      </form>

      <p className="text-center text-xs mt-8" style={{ color: 'var(--color-on-surface-variant)', opacity: 0.6, marginTop: '32px' }}>
        Your Navidrome credentials are stored encrypted on the server.
      </p>
    </div>
  );
}