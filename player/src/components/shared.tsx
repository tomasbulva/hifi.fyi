import { LOSSLESS_FORMATS } from '../core/quality';
import type { SubsonicSong } from '../core/types';

// Animated equalizer bars for currently playing track
export function PlayingBars({ animated = true }: { animated?: boolean }) {
  return (
    <div className={`flex items-end gap-[1px] h-3 ${animated ? '' : 'opacity-40'}`}>
      <div className="w-0.5 rounded-full" style={{ height: '40%', background: '#D0BCFF', animation: animated ? 'eq-bar-1 0.8s ease-in-out infinite' : 'none' }} />
      <div className="w-0.5 rounded-full" style={{ height: '80%', background: '#D0BCFF', animation: animated ? 'eq-bar-2 0.7s ease-in-out infinite' : 'none' }} />
      <div className="w-0.5 rounded-full" style={{ height: '60%', background: '#D0BCFF', animation: animated ? 'eq-bar-3 0.9s ease-in-out infinite' : 'none' }} />
      <div className="w-0.5 rounded-full" style={{ height: '90%', background: '#D0BCFF', animation: animated ? 'eq-bar-4 0.6s ease-in-out infinite' : 'none' }} />
    </div>
  );
}

// Codec quality pill
export function CodecPill({ song }: { song: SubsonicSong }) {
  const suffix = (song.suffix ?? '').toLowerCase();
  if (!suffix) return null;
  const bitRate = song.bitRate ?? 0;
  const lossless = LOSSLESS_FORMATS.includes(suffix);
  const isHiRes = lossless && bitRate >= 2304;
  return (
    <span
      className="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase ml-2"
      style={{
        background: isHiRes ? 'rgba(68, 226, 205, 0.12)' : lossless ? 'rgba(208, 188, 255, 0.1)' : 'rgba(255,255,255,0.05)',
        color: isHiRes ? '#44E2CD' : '#CBC3D7',
        border: `1px solid ${isHiRes ? 'rgba(68,226,205,0.25)' : lossless ? 'rgba(208,188,255,0.15)' : 'rgba(255,255,255,0.08)'}`,
      }}
    >
      {isHiRes ? 'HI-RES' : lossless ? 'LOSSLESS' : suffix.toUpperCase()}{!lossless && bitRate ? ` ${bitRate}` : ''}
    </span>
  );
}
