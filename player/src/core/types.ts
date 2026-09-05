// All Subsonic API types, app types, and skin types.

// ---- Subsonic API types ----

export interface SubsonicArtist {
  id: string;
  name: string;
  coverArt?: string;
  artistImageUrl?: string;
  albumCount?: number;
  starred?: string;
}

export interface SubsonicAlbum {
  id: string;
  name: string;
  artist?: string;
  artistId?: string;
  coverArt?: string;
  songCount?: number;
  duration?: number;
  created?: string;
  year?: number;
  genre?: string;
  starred?: string;
}

export interface SubsonicSong {
  id: string;
  parent?: string;         // album id
  album?: string;
  title: string;
  artist?: string;
  track?: number;
  discNumber?: number;
  duration?: number;       // seconds
  size?: number;           // bytes
  suffix?: string;         // mp3, flac, ogg, aac, etc.
  bitRate?: number;        // kbps
  contentType?: string;
  path?: string;
  coverArt?: string;       // album's coverArt id
  starred?: string;
  albumId?: string;
  artistId?: string;
  userRating?: number;     // 0-5 (Navidrome)
  playCount?: number;      // Navidrome plays
}

/** Per-artist aggregate stats from the companion (/api/artists-extended). */
export interface ArtistStats {
  artist: string;
  song_count: number;
  album_count: number;
  total_plays: number;
  starred_count: number;
  avg_rating: number | null;
  last_played: string | null;
  cover_art: string | null;
  golden_year: number | null;
  best_unplayed: number;
}

export interface SubsonicPlaylist {
  id: string;
  name: string;
  comment?: string;
  owner?: string;
  public?: boolean;
  songCount?: number;
  duration?: number;
  created?: string;
  changed?: string;
  coverArt?: string;
}

export interface SubsonicRadioStation {
  id: string;
  name: string;
  streamUrl: string;
  homePageUrl?: string;
}

export type AlbumListType = 'random' | 'newest' | 'frequent' | 'recent' | 'starred' | 'highest' | 'alphabeticalByName' | 'alphabeticalByArtist';

// ---- App types ----

export type ViewName = 'player' | 'library' | 'visualization' | 'settings';

export interface QueueItem {
  song: SubsonicSong;
  queuedAt: number; // Date.now()
}

export interface PlaybackState {
  isPlaying: boolean;
  currentTrack: SubsonicSong | null;
  progress: number;         // seconds
  duration: number;         // seconds
  buffered: number;         // seconds
  volume: number;           // 0-1
  shuffle: boolean;
  repeat: 'off' | 'one' | 'all';
}

export interface CodecInfo {
  codec: string;            // mp3, flac, ogg, etc.
  bitRate: number;          // kbps
  sampleRate?: number;      // Hz
  lossless: boolean;        // flac, wav, alac = true
}

export interface CastTarget {
  id: string;
  name: string;
  type: 'browser' | 'sonos' | 'other';
  ip?: string;          // For Sonos: coordinator IP
  members?: { uuid: string; roomName: string; invisible?: boolean }[];
}

export interface CastState {
  provider: CastProvider | null;
  isCasting: boolean;
  currentTarget: CastTarget | null;
  availableTargets: CastTarget[];
  error: string | null;
}

export interface CastProvider {
  name: string;
  discover(): Promise<CastTarget[]>;
  connect(target: CastTarget): Promise<void>;
  disconnect(): void;
  cast(streamUrl: string, metadata?: { title: string; artist: string }): void;
  getStatus(): { connected: boolean; target: CastTarget | null };
  onStateChange(cb: (state: { connected: boolean; target: CastTarget | null }) => void): () => void;
}

// ---- Skin types ----

export interface SkinTokens {
  colors: Record<string, string>;
  fonts: Record<string, string>;
  sizing: Record<string, string>;
  visualization: Record<string, string | number>;
}

export interface SkinManifest {
  name: string;
  version: string;
  author: string;
  description: string;
  prefersCarMode?: boolean;
  tokens: SkinTokens;
  components?: Record<string, string>;  // component name → "default" | custom component name
}

export interface Skin {
  id: string;
  manifest: SkinManifest;
  cssUrl: string;
  previewUrl?: string;
}
