/**
 * Google Cast provider — uses the Web Sender SDK directly from the browser.
 *
 * No proxy needed. Works with Chromecast, Nest Audio/Hub, Google TV,
 * and any device with Google Cast built-in.
 *
 * The SDK is loaded via a script tag in index.html. We use the
 * Default Media Receiver so no app registration is required.
 *
 * Flow:
 * 1. User clicks cast button → CastContext shows device picker
 * 2. User selects a device → CastSession established
 * 3. We call session.loadMedia() with the Navidrome stream URL
 * 4. The Cast device streams directly from Navidrome
 * 5. Controls go through the RemotePlayerController
 */

import type { CastProvider, CastTarget } from './types';

// Augment window for the Cast SDK
declare global {
  interface Window {
    __onGCastApiAvailable?: (isAvailable: boolean) => void;
    chrome?: any;
    cast?: any;
  }
}

const DEFAULT_MEDIA_RECEIVER_APP_ID = 'CC1AD845'; // chrome.cast.media.DEFAULT_MEDIA_RECEIVER_APP_ID

let initialized = false;
let sessionAvailable = false;
let currentSession: any = null;
let stateCallback: ((state: { connected: boolean; target: CastTarget | null }) => void) | null = null;

function initCast(): void {
  if (initialized) return;
  const cast = window.cast;
  const chrome = window.chrome;
  // SDK not fully loaded yet — wait for the loader callback
  if (!cast?.framework || !chrome?.cast) return;

  sessionAvailable = true;

  cast.framework.CastContext.getInstance().setOptions({
    receiverApplicationId: DEFAULT_MEDIA_RECEIVER_APP_ID,
    autoJoinPolicy: chrome.cast.AutoJoinPolicy.ORIGIN_SCOPED,
  });

  // Listen for session state changes
  cast.framework.CastContext.getInstance().addEventListener(
    cast.framework.CastContextEventType.SESSION_STATE_CHANGED,
    (event: any) => {
      const session = event.session;
      switch (event.sessionState) {
        case cast.framework.SessionState.SESSION_STARTED:
          currentSession = session;
          const target: CastTarget = {
            id: session.getCastDevice()?.deviceId || 'cast',
            name: session.getCastDevice()?.friendlyName || 'Google Cast Device',
            type: 'other',
          };
          stateCallback?.({ connected: true, target });
          break;
        case cast.framework.SessionState.SESSION_ENDED:
        case cast.framework.SessionState.SESSION_RESUMED:
          currentSession = null;
          stateCallback?.({ connected: false, target: null });
          break;
      }
    }
  );

  // Listen for device availability
  cast.framework.CastContext.getInstance().addEventListener(
    cast.framework.CastContextEventType.CAST_STATE_CHANGED,
    (_event: any) => {
      // NOT_VISIBLE → devices available, show cast button
      // NO_DEVICES_AVAILABLE → no cast devices
    }
  );

  initialized = true;
}

function ensureInitialized(): Promise<void> {
  return new Promise((resolve) => {
    if (initialized && sessionAvailable) {
      resolve();
      return;
    }

    // SDK may already be loaded (loader callback fired before we registered ours)
    initCast();
    if (initialized) {
      resolve();
      return;
    }

    window.__onGCastApiAvailable = (isAvailable: boolean) => {
      if (!isAvailable) {
        resolve();
        return;
      }
      initCast();
      resolve();
    };
  });
}

// Load the SDK script if not already present
function loadSdk() {
  if (document.getElementById('google-cast-sdk')) return;
  const script = document.createElement('script');
  script.id = 'google-cast-sdk';
  script.src = 'https://www.gstatic.com/cv/js/sender/v1/cast_sender.js?loadCastFramework=1';
  script.async = true;
  script.crossOrigin = 'anonymous';
  document.head.appendChild(script);
}

loadSdk();
ensureInitialized();

export const googleCastProvider: CastProvider = {
  name: 'google-cast',

  async discover(): Promise<CastTarget[]> {
    // Google Cast doesn't expose a device list before connecting.
    // The native cast button (google-cast-launcher) handles device picker UI.
    // We return an empty list — the CastButton component will render the
    // native <google-cast-launcher> element for Google Cast.
    return [];
  },

  async connect(_target: CastTarget): Promise<void> {
    // For Google Cast, we use the native device picker, not connectTo().
    // This is triggered by the google-cast-launcher button element.
    throw new Error('Google Cast uses the native picker — use the cast button element');
  },

  disconnect(): void {
    if (currentSession) {
      currentSession.endSession(true);
      currentSession = null;
    }
    stateCallback?.({ connected: false, target: null });
  },

  cast(streamUrl: string, metadata?: { title: string; artist: string }): void {
    if (!currentSession) return;

    const chrome = window.chrome;
    // Determine content type from URL or default to audio/mpeg
    // Navidrome may serve m4a, flac, ogg, mp3 etc.
    let contentType = 'audio/mpeg';
    if (streamUrl.includes('suffix=m4a') || streamUrl.includes('.m4a')) {
      contentType = 'audio/mp4';
    } else if (streamUrl.includes('suffix=flac') || streamUrl.includes('.flac')) {
      contentType = 'audio/flac';
    } else if (streamUrl.includes('suffix=ogg') || streamUrl.includes('.ogg')) {
      contentType = 'audio/ogg';
    }

    const mediaInfo = new chrome.cast.media.MediaInfo(streamUrl, contentType);
    if (metadata) {
      mediaInfo.metadata = new chrome.cast.media.MusicTrackMediaMetadata();
      mediaInfo.metadata.title = metadata.title;
      mediaInfo.metadata.artist = metadata.artist;
    }

    const request = new chrome.cast.media.LoadRequest(mediaInfo);
    currentSession.loadMedia(request).then(
      () => {},
      (err: any) => console.error('[GoogleCast] loadMedia failed:', err),
    );
  },

  getStatus(): { connected: boolean; target: CastTarget | null } {
    if (!currentSession) return { connected: false, target: null };
    const device = currentSession.getCastDevice?.();
    return {
      connected: true,
      target: device
        ? { id: device.deviceId || 'cast', name: device.friendlyName || 'Cast Device', type: 'other' }
        : { id: 'cast', name: 'Cast Device', type: 'other' },
    };
  },

  onStateChange(cb: (state: { connected: boolean; target: CastTarget | null }) => void): () => void {
    stateCallback = cb;
    return () => { stateCallback = null; };
  },
};

/**
 * Programmatically request a cast session.
 * Opens Chrome's native cast device picker dialog.
 */
export async function requestGoogleCastSession(): Promise<void> {
  await ensureInitialized();
  if (!sessionAvailable) return;
  const ctx = window.cast.framework.CastContext.getInstance();
  await ctx.requestSession();
}

/**
 * Check if the Google Cast SDK is available (Chrome/Edge only).
 */
export function isGoogleCastAvailable(): boolean {
  return sessionAvailable || !!(window as any).cast?.framework;
}

/**
 * Create the native Google Cast button element.
 * This renders Google's official cast button with device picker.
 */
/**
 * Pause/resume/stop on the current Cast session.
 */
export const googleCastControls = {
  pause() {
    if (!currentSession) return;
    const media = currentSession.getMediaSession?.();
    if (media) media.pause(null);
  },

  resume() {
    if (!currentSession) return;
    const media = currentSession.getMediaSession?.();
    if (media) media.play(null);
  },

  stop() {
    if (!currentSession) return;
    const media = currentSession.getMediaSession?.();
    if (media) media.stop(null);
  },

  seek(seconds: number) {
    if (!currentSession) return;
    const media = currentSession.getMediaSession?.();
    if (!media) return;
    const newRequest = new (window.chrome).cast.media.SeekRequest();
    newRequest.currentTime = seconds;
    media.seek(newRequest);
  },

  setVolume(volume: number) {
    if (!currentSession) return;
    // Volume on the receiver device (0-1)
    currentSession.setVolume(volume).catch(() => {});
  },
};
