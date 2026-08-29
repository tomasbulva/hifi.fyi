import { useState, type FormEvent } from 'react';
import { useAuth } from '../../core/AuthContext';

export default function Login() {
  const { setup, login, setupDone, loading, error } = useAuth();
  const [view, setView] = useState<'checking' | 'onboarding' | 'login'>('checking');

  // Onboarding fields
  const [navidromeUrl, setNavidromeUrl] = useState('');
  const [navidromeUsername, setNavidromeUsername] = useState('');
  const [navidromePassword, setNavidromePassword] = useState('');
  const [appUsername, setAppUsername] = useState('');
  const [appPassword, setAppPassword] = useState('');
  const [appPasswordConfirm, setAppPasswordConfirm] = useState('');

  // Login fields
  const [loginUsername, setLoginUsername] = useState('');
  const [loginPassword, setLoginPassword] = useState('');

  const [busy, setBusy] = useState(false);

  // Wait for initial session check
  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center" style={{ background: 'var(--color-bg)' }}>
        <div className="flex flex-col items-center gap-4">
          <div className="w-8 h-8 border-2 border-t-transparent rounded-full animate-spin" style={{ borderColor: 'var(--color-primary)', borderTopColor: 'transparent' }} />
          <span className="text-sm" style={{ color: 'var(--color-text-muted)' }}>Loading…</span>
        </div>
      </div>
    );
  }

  // Pick initial view based on setup state
  if (view === 'checking') {
    setView(setupDone ? 'login' : 'onboarding');
    return null;
  }

  async function handleSetup(e: FormEvent) {
    e.preventDefault();
    if (appPassword !== appPasswordConfirm) {
      return;
    }
    setBusy(true);
    try {
      await setup(navidromeUrl, navidromeUsername, navidromePassword, appUsername, appPassword);
    } finally {
      setBusy(false);
    }
  }

  async function handleLogin(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await login(loginUsername, loginPassword);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex h-screen items-center justify-center p-4" style={{ background: 'var(--color-bg)' }}>
      <div className="flex flex-col items-center w-full max-w-sm">
        {/* Logo */}
        <div className="mb-8 text-center">
          <h1 className="text-4xl font-black tracking-tight mb-1 font-mono" style={{ color: 'var(--color-primary)' }}>
            hifi
          </h1>
          <p className="text-xs tracking-widest uppercase" style={{ color: 'var(--color-text-muted)', letterSpacing: '0.3em' }}>
            Navidrome Player
          </p>
        </div>

        <form onSubmit={view === 'onboarding' ? handleSetup : handleLogin}
              className="flex flex-col gap-4 w-full p-6 rounded-xl shadow-lg"
              style={{ background: 'var(--color-surface)' }}>

          {/* ── Onboarding view ── */}
          {view === 'onboarding' && (
            <>
              <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
                Connect to your Navidrome server and create a hifi account.
              </p>

              <div className="flex flex-col gap-3">
                <div className="pt-3 pb-1 border-b border-border">
                  <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--color-text-muted)' }}>
                    Navidrome server
                  </span>
                </div>
                <input type="url" value={navidromeUrl} onChange={e => setNavidromeUrl(e.target.value)}
                       placeholder="Navidrome URL (e.g. http://localhost:4533)"
                       className="rounded-sm border border-border bg-background px-3 py-2.5 text-sm"
                       style={{ color: 'var(--color-text)' }} />

                <div className="flex gap-3">
                  <input type="text" value={navidromeUsername} onChange={e => setNavidromeUsername(e.target.value)}
                         placeholder="Username"
                         className="flex-1 rounded-sm border border-border bg-background px-3 py-2.5 text-sm"
                         style={{ color: 'var(--color-text)' }} />
                  <input type="password" value={navidromePassword} onChange={e => setNavidromePassword(e.target.value)}
                         placeholder="Password"
                         className="flex-1 rounded-sm border border-border bg-background px-3 py-2.5 text-sm"
                         style={{ color: 'var(--color-text)' }} />
                </div>

                <div className="pt-3 pb-1 border-b border-border">
                  <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--color-text-muted)' }}>
                    Your hifi account
                  </span>
                </div>
                <input type="text" value={appUsername} onChange={e => setAppUsername(e.target.value)}
                       placeholder="Username (e.g. your name)"
                       className="rounded-sm border border-border bg-background px-3 py-2.5 text-sm"
                       style={{ color: 'var(--color-text)' }} />

                <input type="password" value={appPassword} onChange={e => setAppPassword(e.target.value)}
                       placeholder="Create a password"
                       className="rounded-sm border border-border bg-background px-3 py-2.5 text-sm"
                       style={{ color: 'var(--color-text)' }} />
                <input type="password" value={appPasswordConfirm} onChange={e => setAppPasswordConfirm(e.target.value)}
                       placeholder="Confirm password"
                       className={`rounded-sm border bg-background px-3 py-2.5 text-sm ${appPasswordConfirm && appPassword !== appPasswordConfirm ? 'border-red-500' : 'border-border'}`}
                       style={{ color: 'var(--color-text)' }} />
              </div>

              {error && (
                <div className="rounded-sm bg-red-500/10 border border-red-500/30 px-3 py-2 text-xs" style={{ color: '#f44336' }}>
                  {error}
                </div>
              )}

              <button type="submit" disabled={busy}
                      className="w-full rounded-lg py-3 text-sm font-semibold flex items-center justify-center gap-2 transition-all hover:opacity-90 active:scale-[0.98] cursor-pointer disabled:cursor-not-allowed disabled:opacity-50"
                      style={{ background: 'var(--color-primary)', color: '#fff', minHeight: '50px' }}>
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
                Sign in to your hifi account
              </p>
              <div className="flex flex-col gap-3">
                <input type="text" value={loginUsername} onChange={e => setLoginUsername(e.target.value)}
                       placeholder="Username"
                       className="rounded-sm border border-border bg-background px-3 py-2.5 text-sm"
                       style={{ color: 'var(--color-text)' }} />
                <input type="password" value={loginPassword} onChange={e => setLoginPassword(e.target.value)}
                       placeholder="Password"
                       className="rounded-sm border border-border bg-background px-3 py-2.5 text-sm"
                       style={{ color: 'var(--color-text)' }} />
              </div>

              {error && (
                <div className="rounded-sm bg-red-500/10 border border-red-500/30 px-3 py-2 text-xs" style={{ color: '#f44336' }}>
                  {error}
                </div>
              )}

              <button type="submit" disabled={busy}
                      className="w-full rounded-lg py-3 text-sm font-semibold flex items-center justify-center gap-2 transition-all hover:opacity-90 active:scale-[0.98] cursor-pointer disabled:cursor-not-allowed disabled:opacity-50"
                      style={{ background: 'var(--color-primary)', color: '#fff', minHeight: '50px' }}>
                {busy ? 'Signing in…' : 'Sign In'}
              </button>

              <button type="button" onClick={() => setView('onboarding')}
                      className="text-xs underline cursor-pointer self-center mt-1"
                      style={{ color: 'var(--color-on-surface-variant)', opacity: 0.6 }}>
                Reconfigure server
              </button>
            </>
          )}
        </form>
      </div>
    </div>
  );
}