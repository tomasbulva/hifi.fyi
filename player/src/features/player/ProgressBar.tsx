import { useMusic } from '../../core/MusicContext';
import { formatTime } from '../../core/format';

export default function ProgressBar() {
  const { playback, seek } = useMusic();
  const { progress, duration, buffered } = playback;

  const bufferedPct = duration > 0 ? (buffered / duration) * 100 : 0;
  const progressPct = duration > 0 ? (progress / duration) * 100 : 0;

  return (
    <div className="w-full">
      <div className="relative flex h-3.5 cursor-pointer items-center">
        {/* Track background */}
        <div className="absolute left-0 right-0 top-1/2 h-1.5 -translate-y-1/2 rounded-full" style={{ background: 'var(--color-progress-bg)' }} />
        {/* Buffered */}
        <div
          className="absolute left-0 top-1/2 h-1.5 -translate-y-1/2 rounded-full pointer-events-none"
          style={{ width: `${Math.min(bufferedPct, 100)}%`, background: 'var(--color-progress-buffered)' }}
        />
        {/* Progress fill */}
        <div
          className="absolute left-0 top-1/2 h-1.5 -translate-y-1/2 rounded-full pointer-events-none transition-[width] duration-100"
          style={{ width: `${Math.min(progressPct, 100)}%`, background: 'var(--color-progress-fill)' }}
        />
        {/* Transparent range input on top for interaction */}
        <input
          type="range"
          min={0}
          max={duration || 0}
          step={0.1}
          value={progress}
          onChange={e => seek(Number(e.target.value))}
          className="absolute left-0 top-0 h-3.5 w-full cursor-pointer opacity-0 m-0"
        />
      </div>
      <div className="mt-1 flex justify-between text-small font-mono" style={{ color: 'var(--color-text-muted)' }}>
        <span>{formatTime(progress)}</span>
        <span>{formatTime(duration)}</span>
      </div>
    </div>
  );
}
