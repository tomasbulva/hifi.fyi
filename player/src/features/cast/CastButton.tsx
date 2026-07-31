import { useState, useEffect } from 'react';
import { useCast } from '../../core/CastContext';
import { useMusic } from '../../core/MusicContext';
import { googleCastProvider, requestGoogleCastSession } from '../../core/googleCastProvider';
import { sonosProvider } from '../../core/sonosProvider';
import type { CastTarget } from '../../core/types';

export default function CastButton() {
  const { isCasting, currentTarget, setProvider, connectTo, disconnect, hasGoogleCast, sonosTargets } = useCast();
  const { setCastTarget } = useMusic();
  const [open, setOpen] = useState(false);

  // Register Google Cast provider state changes
  useEffect(() => {
    if (!hasGoogleCast) return;

    setProvider(googleCastProvider);

    googleCastProvider.onStateChange(st => {
      if (st.connected && st.target) {
        setCastTarget(st.target);
        (googleCastProvider as any)._currentTarget = st.target;
      } else if (!st.connected) {
        setCastTarget(null);
      }
    });
  }, [hasGoogleCast, setCastTarget, setProvider]);

  async function handleGoogleCastClick() {
    setOpen(false);
    // Opens Chrome's native cast device picker
    await requestGoogleCastSession();
  }

  async function handleSonosConnect(target: CastTarget) {
    // Set the Sonos provider in CastContext so state tracking works
    setProvider(sonosProvider);
    // Connect via CastContext (updates isCasting, currentTarget)
    await connectTo(target);
    // Also set in MusicContext so playback routing works
    setCastTarget(target);
    setOpen(false);
  }

  function handleDisconnect() {
    disconnect();
    setCastTarget(null);
    setOpen(false);
  }

  const showCastIcon = isCasting || hasGoogleCast || sonosTargets.length > 0;

  return (
    <div className="relative inline-block">
      {/* Main cast button */}
      <button
        onClick={() => setOpen(o => !o)}
        className="flex items-center gap-0.5 rounded-sm p-2 text-xl border-none cursor-pointer"
        style={{
          background: 'none',
          color: isCasting ? 'var(--color-cast-active)' : 'var(--color-cast-idle)',
          display: showCastIcon ? 'flex' : 'none',
        }}
        title={isCasting ? `Casting to ${currentTarget?.name}` : 'Cast'}
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M2 8V6a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-6" />
          <path d="M2 12h2a8 8 0 0 1 8 8v2" />
          <path d="M2 16h2a4 4 0 0 1 4 4v2" />
          <line x1="2" y1="20" x2="2.01" y2="20" />
        </svg>
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-[99]" onClick={() => setOpen(false)} />

          <div className="absolute right-0 top-full mt-1 min-w-[240px] rounded-md border border-border bg-surface p-1 z-[100]">
            {/* This Device */}
            <button
              onClick={handleDisconnect}
              className="block w-full rounded-sm px-3 py-2 text-left text-small border-none cursor-pointer"
              style={{
                background: !isCasting ? 'var(--color-surface-active)' : 'transparent',
                color: 'var(--color-text)',
              }}
            >
              🔊 This Device
              {!isCasting && ' ✓'}
            </button>

            {/* Google Cast section */}
            {hasGoogleCast && (
              <div className="mt-1 border-t border-border pt-1">
                <div className="px-3 py-1 text-[10px] uppercase tracking-wider" style={{ color: 'var(--color-text-muted)' }}>
                  Google Cast
                </div>
                <button
                  onClick={handleGoogleCastClick}
                  className="flex w-full items-center gap-2 rounded-sm px-3 py-2 text-left border-none cursor-pointer hover:bg-white/5"
                  style={{
                    background: isCasting && currentTarget?.type === 'other' ? 'var(--color-surface-active)' : 'transparent',
                    color: 'var(--color-text)',
                  }}
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: 0.7 }}>
                    <path d="M2 8V6a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-6" />
                    <path d="M2 12h2a8 8 0 0 1 8 8v2" />
                    <path d="M2 16h2a4 4 0 0 1 4 4v2" />
                    <line x1="2" y1="20" x2="2.01" y2="20" />
                  </svg>
                  <span className="text-small">
                    Chromecast / Nest / Google TV
                  </span>
                  {isCasting && currentTarget?.type === 'other' && ' ✓'}
                </button>
              </div>
            )}

            {/* Sonos section (only if proxy is running) */}
            {sonosTargets.length > 0 && (
              <div className="mt-1 border-t border-border pt-1">
                <div className="px-3 py-1 text-[10px] uppercase tracking-wider" style={{ color: 'var(--color-text-muted)' }}>
                  Sonos Speakers
                </div>
                {sonosTargets.map(t => (
                  <button
                    key={t.id}
                    onClick={() => handleSonosConnect(t)}
                    className="block w-full rounded-sm px-3 py-2 text-left text-small border-none cursor-pointer"
                    style={{
                      background: isCasting && currentTarget?.id === t.id ? 'var(--color-surface-active)' : 'transparent',
                      color: 'var(--color-text)',
                    }}
                  >
                    {t.name}
                    {isCasting && currentTarget?.id === t.id && ' ✓'}
                  </button>
                ))}
              </div>
            )}

            {/* No devices available */}
            {!hasGoogleCast && sonosTargets.length === 0 && (
              <div className="mt-1 border-t border-border pt-1">
                <div className="px-3 py-2 text-small" style={{ color: 'var(--color-text-muted)' }}>
                  No cast devices found.
                  Google Cast works in Chrome/Edge.
                  For Sonos, run the cast proxy on port 4321.
                </div>
              </div>
            )}

            {/* Disconnect */}
            {isCasting && (
              <button
                onClick={handleDisconnect}
                className="mt-1 block w-full border-t border-border rounded-sm px-3 py-2 text-left text-small border-none cursor-pointer"
                style={{ background: 'transparent', color: 'var(--color-error)' }}
              >
                Stop Casting
              </button>
            )}
          </div>
        </>
      )}
    </div>
  );
}
