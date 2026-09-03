import React, { createContext, useContext, useState, useCallback, useRef, useEffect } from 'react';
import type { CastProvider, CastTarget, CastState } from './types';
import { isGoogleCastAvailable } from './googleCastProvider';
import { getProxyUrl } from './sonosProvider';
import { reportError } from './errorReport';

interface CastContextValue extends CastState {
  setProvider: (provider: CastProvider | null) => void;
  connectTo: (target: CastTarget) => Promise<void>;
  disconnect: () => void;
  hasGoogleCast: boolean;
  hasSonos: boolean;
  sonosTargets: CastTarget[];
}

const CastContext = createContext<CastContextValue | null>(null);

export function CastProvider({ children }: { children: React.ReactNode }) {
  const providerRef = useRef<CastProvider | null>(null);
  const [state, setState] = useState<CastState>({
    provider: null,
    isCasting: false,
    currentTarget: { id: 'browser', name: 'This Device', type: 'browser' },
    availableTargets: [],
    error: null,
  });
  const [hasGoogleCast, setHasGoogleCast] = useState(false);
  const [sonosTargets, setSonosTargets] = useState<CastTarget[]>([]);

  // Register Google Cast provider (works directly, no proxy)
  useEffect(() => {
    // Google Cast SDK loads async — check periodically
    const checkInterval = setInterval(() => {
      if (isGoogleCastAvailable()) {
        setHasGoogleCast(true);
        clearInterval(checkInterval);
      }
    }, 1000);

    // Attempt Sonos discovery via proxy (optional, fails silently if no proxy)
    // Uses exponential backoff: starts at 5s, doubles on failure, caps at 60s
    let backoffMs = 5000;
    const MAX_BACKOFF = 60000;
    let timerId: ReturnType<typeof setTimeout> | undefined;

    const discoverSonos = async () => {
      const proxyUrl = getProxyUrl();
      try {
        const res = await fetch(`${proxyUrl}/discover`, {
          signal: AbortSignal.timeout(10000),
        });
        if (res.ok) {
          const data = await res.json();
          const targets = (data.speakers ?? []).map((s: any) => ({
            id: s.id || s.coordinatorIp,
            name: s.name,
            type: 'sonos' as const,
            ip: s.coordinatorIp,
            members: s.members,
          }));
          setSonosTargets(targets);
          backoffMs = 30000; // Reset to normal 30s poll on success
        } else {
          backoffMs = Math.min(backoffMs * 2, MAX_BACKOFF);
        }
      } catch {
        backoffMs = Math.min(backoffMs * 2, MAX_BACKOFF);
      }
      timerId = setTimeout(discoverSonos, backoffMs);
    };
    discoverSonos();

    return () => {
      clearInterval(checkInterval);
      clearTimeout(timerId);
    };
  }, []);

  const setProvider = useCallback((provider: CastProvider | null) => {
    if (providerRef.current && providerRef.current !== provider) {
      providerRef.current.disconnect();
    }
    providerRef.current = provider;

    if (provider) {
      provider.onStateChange(st => {
        setState(prev => ({
          ...prev,
          isCasting: st.connected,
          currentTarget: st.target ?? prev.currentTarget,
        }));
      });
    } else {
      setState(prev => ({
        ...prev,
        isCasting: false,
        currentTarget: { id: 'browser', name: 'This Device', type: 'browser' },
      }));
    }
  }, []);

  const connectTo = useCallback(async (target: CastTarget) => {
    if (!providerRef.current) return;
    try {
      await providerRef.current.connect(target);
      (providerRef.current as any)._currentTarget = target;
      setState(prev => ({
        ...prev,
        currentTarget: target,
        isCasting: true,
        error: null,
      }));
    } catch (err) {
      reportError(err, { source: 'cast.connect', target: target.name, targetType: target.type });
      setState(prev => ({ ...prev, error: `Failed to connect: ${err}` }));
    }
  }, []);

  const disconnect = useCallback(() => {
    if (providerRef.current) {
      providerRef.current.disconnect();
    }
    (providerRef.current as any)._currentTarget = null;
    setState(prev => ({
      ...prev,
      isCasting: false,
      currentTarget: { id: 'browser', name: 'This Device', type: 'browser' },
    }));
  }, []);

  return (
    <CastContext.Provider value={{
      ...state,
      setProvider,
      connectTo,
      disconnect,
      hasGoogleCast,
      hasSonos: sonosTargets.length > 0,
      sonosTargets,
    }}>
      {children}
    </CastContext.Provider>
  );
}

export function useCast() {
  const ctx = useContext(CastContext);
  if (!ctx) throw new Error('useCast must be inside CastProvider');
  return ctx;
}
