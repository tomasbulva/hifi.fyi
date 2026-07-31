// ── Subsonic API types (subset we need) ──

export interface SubsonicSong {
  id: string;
  parent?: string;
  title: string;
  artist?: string;
  album?: string;
  albumId?: string;
  track?: number;
  year?: number;
  duration?: number;
  size?: number;
  suffix?: string;
  bitRate?: number;
  contentType?: string;
  coverArt?: string;
  starred?: string;
  userRating?: number;
  playCount?: number;
  genre?: string;
}

export interface SubsonicAlbum {
  id: string;
  name: string;
  artist?: string;
  artistId?: string;
  coverArt?: string;
  songCount?: number;
  duration?: number;
  year?: number;
  genre?: string;
  song?: SubsonicSong[];
}

export interface SubsonicResponse {
  'subsonic-response': {
    status: string;
    error?: { code: number; message: string };
    [key: string]: any;
  };
}
