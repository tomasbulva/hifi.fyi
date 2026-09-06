import { useState, useEffect } from 'react';
import { useCast } from '../../core/CastContext';
import { useMusic } from '../../core/MusicContext';
import { googleCastProvider, requestGoogleCastSession } from '../../core/googleCastProvider';
import { sonosProvider } from '../../core/sonosProvider';
import type { CastTarget } from '../../core/types';

interface CastButtonProps {
  /** 'up' opens the dropdown above the button (for bottom bars like the MiniPlayer). */
  direction?: 'up' | 'down';
}

const itemClass =
  'block w-full rounded-sm px-3 py-2 text-left text-small border-none cursor-pointer hover:bg-white/5';

function itemStyle(active: boolean): React.CSSProperties {
  return { background: active ? 'var(--color-surface-active)' : 'transparent', color: 'var(--color-text)' };
}

export default function CastButton({ direction = 'down' }: CastButtonProps) {
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

  const googleActive = isCasting && currentTarget?.type === 'other';
  const sonosActive = (id: string) => isCasting && currentTarget?.id === id;

  return (
    <div className="relative inline-block">
      {/* Main cast button */}
      <button
        onClick={() => setOpen(o => !o)}
        className="flex items-center gap-0.5 rounded-sm p-2 text-xl border-none cursor-pointer"
        style={{
          background: 'none',
          color: isCasting ? 'var(--color-cast-active)' : 'var(--color-cast-idle)',
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

          {/* Flat dropdown: every entry is the same size, no icons, no section headers */}
          <div
            className={`absolute right-0 min-w-[240px] rounded-md border border-border bg-surface p-1 z-[100] max-md:fixed max-md:inset-x-3 max-md:bottom-3 max-md:top-auto max-md:min-w-0 max-md:rounded-xl max-md:p-2 ${
              direction === 'up' ? 'bottom-full mb-1' : 'top-full mt-1'
            }`}
          >
            <button onClick={handleDisconnect} className={itemClass} style={itemStyle(!isCasting)}>
              This Device{!isCasting && ' ✓'}
            </button>

            {hasGoogleCast && (
              <button onClick={handleGoogleCastClick} className={itemClass} style={itemStyle(googleActive)}>
                Google Cast device…{googleActive && ' ✓'}
              </button>
            )}

            {sonosTargets.map(t => (
              <button key={t.id} onClick={() => handleSonosConnect(t)} className={itemClass} style={itemStyle(sonosActive(t.id))}>
                Sonos - {t.name}
                {sonosActive(t.id) && ' ✓'}
              </button>
            ))}

            {!hasGoogleCast && sonosTargets.length === 0 && (
              <div className="px-3 py-2 text-small" style={{ color: 'var(--color-text-muted)' }}>
                No cast devices found. Google Cast works in Chrome/Edge; Sonos needs the cast proxy.
              </div>
            )}

            {isCasting && (
              <button
                onClick={handleDisconnect}
                className={itemClass}
                style={{ background: 'transparent', color: 'var(--color-error)' }}
              >
                Stop casting
              </button>
            )}
          </div>
        </>
      )}
    </div>
  );
}
