/**
 * AudioEngine — wraps <audio> element + Web Audio API for visualization.
 * Not React — plain class, exposed via useAudioEngine hook.
 */

import { getStreamUrl } from './api';
import type { SubsonicSong, CodecInfo } from './types';

export type EngineEvent = 'play' | 'pause' | 'timeupdate' | 'ended' | 'error' | 'loadedmetadata';

export interface EngineState {
  isPlaying: boolean;
  currentTrack: SubsonicSong | null;
  progress: number;
  duration: number;
  buffered: number;
  volume: number;
}

export class AudioEngine {
  private audio: HTMLAudioElement;
  private audioCtx: AudioContext | null = null;
  private source: MediaElementAudioSourceNode | null = null;
  private analyser: AnalyserNode | null = null;
  private listeners = new Map<string, Set<() => void>>();
  private _state: EngineState;

  constructor() {
    this.audio = new Audio();
    this.audio.crossOrigin = 'anonymous';
    this.audio.volume = 0.8;

    this._state = {
      isPlaying: false,
      currentTrack: null,
      progress: 0,
      duration: 0,
      buffered: 0,
      volume: 0.8,
    };

    // Wire native events
    this.audio.addEventListener('play', () => {
      this._state.isPlaying = true;
      this.emit('play');
    });
    this.audio.addEventListener('pause', () => {
      this._state.isPlaying = false;
      this.emit('pause');
    });
    this.audio.addEventListener('ended', () => this.emit('ended'));
    this.audio.addEventListener('error', () => this.emit('error'));
    this.audio.addEventListener('loadedmetadata', () => {
      this._state.duration = this.audio.duration || 0;
      this.emit('loadedmetadata');
    });
    this.audio.addEventListener('timeupdate', () => {
      this._state.progress = this.audio.currentTime;
      this._state.duration = this.audio.duration || this._state.duration;

      // Track buffered
      if (this.audio.buffered.length > 0) {
        this._state.buffered = this.audio.buffered.end(this.audio.buffered.length - 1);
      }
      this.emit('timeupdate');
    });
  }

  get state(): EngineState {
    return { ...this._state };
  }

  // ---- AudioContext (lazy, for visualization) ----

  getAnalyser(): AnalyserNode | null {
    if (this.analyser) return this.analyser;

    try {
      this.audioCtx = new AudioContext();
      this.source = this.audioCtx.createMediaElementSource(this.audio);
      this.analyser = this.audioCtx.createAnalyser();
      this.analyser.fftSize = 2048;
      this.analyser.smoothingTimeConstant = 0.8;
      this.source.connect(this.analyser);
      this.analyser.connect(this.audioCtx.destination);
      return this.analyser;
    } catch {
      return null;
    }
  }

  resumeAudioContext() {
    if (this.audioCtx?.state === 'suspended') {
      this.audioCtx.resume();
    }
  }

  // ---- Playback ----

  play(track: SubsonicSong, seekTo?: number) {
    this.resumeAudioContext();

    if (this._state.currentTrack?.id !== track.id) {
      this._state.currentTrack = track;
      // Build stream URL just in time
      const url = getStreamUrl(track.id);
      this.audio.src = url;
    }

    if (seekTo !== undefined) {
      this.audio.currentTime = seekTo;
    }

    this.audio.play().catch(() => {
      // Autoplay blocked — will retry on user interaction
    });
  }

  resume() {
    this.resumeAudioContext();
    this.audio.play().catch(() => {});
  }

  pause() {
    this.audio.pause();
  }

  seek(seconds: number) {
    this.audio.currentTime = Math.max(0, Math.min(seconds, this.audio.duration || 0));
    this._state.progress = this.audio.currentTime;
  }

  setVolume(v: number) {
    const clamped = Math.max(0, Math.min(1, v));
    this.audio.volume = clamped;
    this._state.volume = clamped;
  }

  stop() {
    this.audio.pause();
    this.audio.src = '';
    this._state.currentTrack = null;
    this._state.isPlaying = false;
    this._state.progress = 0;
    this._state.duration = 0;
  }

  // ---- Codec info ----

  getCodecInfo(): CodecInfo | null {
    const track = this._state.currentTrack;
    if (!track) return null;

    const suffix = (track.suffix ?? '').toLowerCase();
    const losslessFormats = ['flac', 'wav', 'alac', 'aiff', 'ape', 'wv', 'dsf', 'dff'];
    const lossless = losslessFormats.includes(suffix);

    return {
      codec: suffix || '?',
      bitRate: track.bitRate ?? 0,
      sampleRate: undefined, // browser doesn't expose this easily
      lossless,
    };
  }

  // ---- Event system ----

  on(event: EngineEvent, cb: () => void) {
    if (!this.listeners.has(event)) this.listeners.set(event, new Set());
    this.listeners.get(event)!.add(cb);
    return () => this.listeners.get(event)?.delete(cb);
  }

  private emit(event: EngineEvent) {
    this.listeners.get(event)?.forEach(cb => cb());
  }

  destroy() {
    this.stop();
    this.source?.disconnect();
    this.analyser?.disconnect();
    this.audioCtx?.close();
    this.listeners.clear();
  }
}

// Singleton
let engine: AudioEngine | null = null;
export function getAudioEngine(): AudioEngine {
  if (!engine) engine = new AudioEngine();
  return engine;
}
