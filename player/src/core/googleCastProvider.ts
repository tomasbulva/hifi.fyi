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

import type { CastProvider, CastTarget, CastQueueItem, CastPlayMode, CastMediaState } from './types';

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
// Receiver-owns-queue support: media update listeners + id→song map for the
// queue we pushed (receiver itemIds are 1-based and match our push order).
let mediaUpdateCallback: ((state: CastMediaState) => void) | null = null;
let watchedMedia: any = null;
let castQueueSongIds: string[] = [];

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

function detectContentType(streamUrl: string): string {
  let contentType = 'audio/mpeg';
  if (streamUrl.includes('suffix=m4a') || streamUrl.includes('.m4a')) {
    contentType = 'audio/mp4';
  } else if (streamUrl.includes('suffix=flac') || streamUrl.includes('.flac')) {
    contentType = 'audio/flac';
  } else if (streamUrl.includes('suffix=ogg') || streamUrl.includes('.ogg')) {
    contentType = 'audio/ogg';
  }
  return contentType;
}

function makeMediaInfo(item: CastQueueItem): any {
  const chrome = window.chrome;
  const mediaInfo = new chrome.cast.media.MediaInfo(item.streamUrl, detectContentType(item.streamUrl));
  mediaInfo.metadata = new chrome.cast.media.MusicTrackMediaMetadata();
  mediaInfo.metadata.title = item.title;
  mediaInfo.metadata.artist = item.artist;
  return mediaInfo;
}

function watchMedia(media: any) {
  if (!media || media === watchedMedia) return;
  watchedMedia = media;
  media.addUpdateListener?.((isAlive: boolean) => {
    if (!isAlive || !mediaUpdateCallback) return;
    const state: CastMediaState = {
      playerState: media.playerState || 'IDLE',
      position: media.getEstimatedTime?.() ?? 0,
      queueItemId: media.currentItemId,
    };
    mediaUpdateCallback(state);
  });
}

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
    const mediaInfo = new chrome.cast.media.MediaInfo(streamUrl, detectContentType(streamUrl));
    if (metadata) {
      mediaInfo.metadata = new chrome.cast.media.MusicTrackMediaMetadata();
      mediaInfo.metadata.title = metadata.title;
      mediaInfo.metadata.artist = metadata.artist;
    }

    const request = new chrome.cast.media.LoadRequest(mediaInfo);
    currentSession.loadMedia(request).then(
      (media: any) => watchMedia(media),
      (err: any) => console.error('[GoogleCast] loadMedia failed:', err),
    );
  },

  /**
   * Push the whole queue as receiver-side QueueData. The receiver advances
   * tracks itself — the sender can be closed without stopping playback.
   */
  castQueue(items: CastQueueItem[], startIndex: number, playMode?: CastPlayMode): void {
    if (!currentSession) return;
    const chrome = window.chrome;

    castQueueSongIds = items.map(i => i.id);
    const queueItems = items.map(item => {
      const qi = new chrome.cast.media.QueueItem(makeMediaInfo(item));
      qi.preloadTime = 20; // receiver starts buffering the next track early
      return qi;
    });

    const repeatMap: Record<string, any> = {
      NORMAL: chrome.cast.media.RepeatMode.REPEAT_OFF,
      REPEAT_ALL: chrome.cast.media.RepeatMode.REPEAT_ALL,
      REPEAT_ONE: chrome.cast.media.RepeatMode.REPEAT_ONE,
    };

    const queueData = new chrome.cast.media.QueueData(queueItems);
    queueData.startIndex = startIndex;
    queueData.repeatMode = repeatMap[playMode ?? 'NORMAL'] ?? chrome.cast.media.RepeatMode.REPEAT_OFF;

    const first = items[startIndex] ?? items[0];
    const request = new chrome.cast.media.LoadRequest(makeMediaInfo(first));
    request.queueData = queueData;

    currentSession.loadMedia(request).then(
      (media: any) => watchMedia(media),
      (err: any) => console.error('[GoogleCast] queue load failed:', err),
    );
  },

  onMediaUpdate(cb: (state: CastMediaState) => void): () => void {
    mediaUpdateCallback = cb;
    return () => { mediaUpdateCallback = null; };
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

  /** Map a receiver queueItemId to the song id we pushed at that position */
  songIdForItem(queueItemId?: number): string | null {
    if (!queueItemId || queueItemId < 1) return null;
    return castQueueSongIds[queueItemId - 1] ?? null;
  },

  /** Append tracks to the receiver's queue (Keep Playing / queue additions) */
  queueAppend(items: CastQueueItem[]) {
    if (!currentSession) return;
    const media = currentSession.getMediaSession?.();
    if (!media) return;
    const chrome = window.chrome;
    const queueItems = items.map(item => {
      const qi = new chrome.cast.media.QueueItem(makeMediaInfo(item));
      return qi;
    });
    castQueueSongIds = [...castQueueSongIds, ...items.map(i => i.id)];
    const req = new chrome.cast.media.QueueInsertItemsRequest(queueItems);
    media.queueInsertItems(req);
  },

  next() {
    jumpToQueueItem(+1);
  },

  prev() {
    jumpToQueueItem(-1);
  },
};

function jumpToQueueItem(offset: number) {
  if (!currentSession) return;
  const media = currentSession.getMediaSession?.();
  if (!media?.items?.length) return;
  const idx = media.items.findIndex((it: any) => it.itemId === media.currentItemId);
  const next = media.items[idx + offset];
  if (idx !== -1 && next) media.queueJumpToItem(next.itemId);
}
