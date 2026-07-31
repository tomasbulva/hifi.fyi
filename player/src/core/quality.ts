export const LOSSLESS_FORMATS = ['flac', 'wav', 'alac', 'aiff', 'ape', 'wv', 'dsf', 'dff'];

export const TIER_STYLES: Record<string, string> = {
  cd:       'bg-secondary/15 text-secondary border-secondary/20',
  hires:    'bg-primary/15 text-primary border-primary/20',
  lossless: 'bg-secondary/10 text-secondary border-secondary/15',
  high:     'bg-tertiary/15 text-tertiary border-tertiary/20',
  standard: 'bg-white/5 text-on-surface-variant border-white/10',
  low:      'bg-error/10 text-error border-error/15',
};

export function getQualityTier(song: { suffix?: string; bitRate?: number }): { label: string; tier: 'cd' | 'hires' | 'lossless' | 'high' | 'standard' | 'low'; lossless: boolean } {
  const suffix = (song.suffix ?? '').toLowerCase();
  if (!suffix) return { label: '', tier: 'standard', lossless: false };
  const lossless = LOSSLESS_FORMATS.includes(suffix);
  const bitRate = song.bitRate ?? 0;

  if (lossless) {
    if (bitRate > 1411) return { label: `${suffix.toUpperCase()} • Hi-Res`, tier: 'hires', lossless: true };
    if (bitRate === 0 || bitRate >= 1400) return { label: `${suffix.toUpperCase()} • CD Quality`, tier: 'cd', lossless: true };
    return { label: `${suffix.toUpperCase()} • Lossless`, tier: 'lossless', lossless: true };
  }

  if (suffix === 'mp3') {
    if (bitRate >= 320) return { label: `MP3 • High Quality`, tier: 'high', lossless: false };
    if (bitRate >= 190) return { label: `MP3 • Standard`, tier: 'standard', lossless: false };
    return { label: `MP3 • Low`, tier: 'low', lossless: false };
  }
  if (suffix === 'ogg' || suffix === 'opus') {
    if (bitRate >= 256) return { label: `${suffix.toUpperCase()} • High Quality`, tier: 'high', lossless: false };
    return { label: `${suffix.toUpperCase()} • Standard`, tier: 'standard', lossless: false };
  }
  if (suffix === 'aac' || suffix === 'm4a') {
    if (bitRate >= 256) return { label: `AAC • High Quality`, tier: 'high', lossless: false };
    return { label: `AAC • Standard`, tier: 'standard', lossless: false };
  }
  if (bitRate >= 256) return { label: `${suffix.toUpperCase()} • High Quality`, tier: 'high', lossless: false };
  if (bitRate > 0) return { label: `${suffix.toUpperCase()} • ${bitRate}kbps`, tier: 'standard', lossless: false };
  return { label: `${suffix.toUpperCase()}`, tier: 'standard', lossless: false };
}
