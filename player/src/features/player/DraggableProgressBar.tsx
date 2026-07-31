import { useState, useRef, useCallback } from 'react';
import { formatTime } from '../../core/format';

interface DraggableProgressBarProps {
  progress: number;
  duration: number;
  buffered: number;
  onSeek: (seconds: number) => void;
}

export function DraggableProgressBar({ progress, duration, buffered, onSeek }: DraggableProgressBarProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [dragPosition, setDragPosition] = useState(0);
  const [hoverPosition, setHoverPosition] = useState<number | null>(null);
  const barRef = useRef<HTMLDivElement>(null);

  const pct = duration > 0 ? Math.min((progress / duration) * 100, 100) : 0;
  const bufferedPct = duration > 0 ? Math.min((buffered / duration) * 100, 100) : 0;
  const displayPct = isDragging ? Math.min((dragPosition / duration) * 100, 100) : pct;
  const displayTime = isDragging ? dragPosition : progress;

  const getPositionFromEvent = useCallback((clientX: number) => {
    const bar = barRef.current;
    if (!bar || duration === 0) return 0;
    const rect = bar.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    return ratio * duration;
  }, [duration]);

  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    e.preventDefault();
    const pos = getPositionFromEvent(e.clientX);
    setIsDragging(true);
    setDragPosition(pos);
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  }, [getPositionFromEvent]);

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    if (isDragging) {
      setDragPosition(getPositionFromEvent(e.clientX));
    } else {
      setHoverPosition(getPositionFromEvent(e.clientX));
    }
  }, [isDragging, getPositionFromEvent]);

  const handlePointerUp = useCallback((e: React.PointerEvent) => {
    if (isDragging) {
      onSeek(dragPosition);
      setIsDragging(false);
    }
    (e.target as HTMLElement).releasePointerCapture(e.pointerId);
  }, [isDragging, dragPosition, onSeek]);

  const handlePointerLeave = useCallback(() => {
    if (!isDragging) setHoverPosition(null);
  }, [isDragging]);

  return (
    <div className="w-full max-w-lg space-y-1">
      <div
        ref={barRef}
        className="relative h-1.5 rounded-full cursor-pointer group"
        style={{ background: 'rgba(255,255,255,0.08)', touchAction: 'none' }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerLeave={handlePointerLeave}
      >
        {/* Buffered */}
        <div
          className="absolute top-0 left-0 h-full rounded-full"
          style={{ width: `${bufferedPct}%`, background: 'rgba(255,255,255,0.12)' }}
        />
        {/* Progress */}
        <div
          className={`absolute top-0 left-0 h-full rounded-full transition-all ${isDragging ? '' : 'duration-300'}`}
          style={{ width: `${displayPct}%`, background: '#D0BCFF' }}
        />
        {/* Drag thumb */}
        <div
          className={`absolute top-1/2 w-3 h-3 rounded-full -translate-y-1/2 -translate-x-1/2 transition-opacity ${isDragging || hoverPosition !== null ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`}
          style={{ left: `${displayPct}%`, background: '#D0BCFF', boxShadow: '0 0 12px rgba(208,188,255,0.5)' }}
        />
        {/* Hover preview */}
        {hoverPosition !== null && !isDragging && (
          <div
            className="absolute -top-7 px-1.5 py-0.5 rounded text-[10px] font-mono pointer-events-none -translate-x-1/2"
            style={{ left: `${(hoverPosition / duration) * 100}%`, background: 'rgba(0,0,0,0.8)', color: '#E5E2E1' }}
          >
            {formatTime(hoverPosition)}
          </div>
        )}
      </div>
      <div className="flex justify-between text-[10px] font-mono" style={{ color: '#CBC3D7' }}>
        <span>{formatTime(displayTime)}</span>
        <span>{formatTime(duration)}</span>
      </div>
    </div>
  );
}
