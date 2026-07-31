import { useRef, useEffect, useCallback } from 'react';
import { useMusic } from '../../core/MusicContext';
import { useSkin } from '../../core/SkinContext';

export type VizMode = 'bars' | 'waveform' | 'particles';

interface VisualizationViewProps {
  mode: VizMode;
  onModeChange: (mode: VizMode) => void;
}

export default function VisualizationView({ mode, onModeChange }: VisualizationViewProps) {
  const { engine, playback } = useMusic();
  const { activeSkin } = useSkin();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef = useRef<number>(0);

  const tokens = activeSkin?.manifest.tokens.visualization ?? {};
  const barColor = (tokens.barColor as string) ?? '#6366f1';
  const waveformColor = (tokens.waveformColor as string) ?? '#818cf8';
  const particleColor = (tokens.particleColor as string) ?? '#a78bfa';
  const fftSize = Number(tokens.fftSize) || 2048;
  const smoothing = Number(tokens.smoothingTimeConstant) || 0.8;

  useEffect(() => {
    const analyser = engine.getAnalyser();
    if (!analyser) return;
    analyser.fftSize = fftSize;
    analyser.smoothingTimeConstant = smoothing;
  }, [engine, fftSize, smoothing]);

  const renderBars = useCallback((analyser: AnalyserNode, ctx: CanvasRenderingContext2D, w: number, h: number) => {
    const bufferLength = analyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);
    analyser.getByteFrequencyData(dataArray);

    ctx.clearRect(0, 0, w, h);

    const barCount = 64;
    const barWidth = (w / barCount) * 0.8;
    const gap = (w / barCount) * 0.2;
    const step = Math.floor(bufferLength / barCount);

    for (let i = 0; i < barCount; i++) {
      const value = dataArray[i * step] / 255;
      const barHeight = value * h * 0.9;
      const x = i * (barWidth + gap);
      const y = h - barHeight;

      const gradient = ctx.createLinearGradient(x, y, x, h);
      gradient.addColorStop(0, barColor);
      gradient.addColorStop(1, `${barColor}44`);

      ctx.fillStyle = gradient;
      ctx.beginPath();
      ctx.roundRect(x, y, barWidth, barHeight, 4);
      ctx.fill();
    }
  }, [barColor]);

  const renderWaveform = useCallback((analyser: AnalyserNode, ctx: CanvasRenderingContext2D, w: number, h: number) => {
    const bufferLength = analyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);
    analyser.getByteTimeDomainData(dataArray);

    ctx.fillStyle = 'var(--color-background)';
    ctx.fillRect(0, 0, w, h);

    ctx.lineWidth = 2;
    ctx.strokeStyle = waveformColor;
    ctx.beginPath();

    const sliceWidth = w / bufferLength;
    let x = 0;

    for (let i = 0; i < bufferLength; i++) {
      const v = dataArray[i] / 128;
      const y = (v * h) / 2;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
      x += sliceWidth;
    }

    ctx.lineTo(w, h / 2);
    ctx.stroke();

    ctx.strokeStyle = `${waveformColor}44`;
    ctx.beginPath();
    x = 0;
    for (let i = 0; i < bufferLength; i++) {
      const v = dataArray[i] / 128;
      const y = h - (v * h) / 2;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
      x += sliceWidth;
    }
    ctx.stroke();
  }, [waveformColor]);

  const renderParticles = useCallback((analyser: AnalyserNode, ctx: CanvasRenderingContext2D, w: number, h: number) => {
    const bufferLength = analyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);
    analyser.getByteFrequencyData(dataArray);

    ctx.fillStyle = 'rgba(10, 10, 15, 0.3)';
    ctx.fillRect(0, 0, w, h);

    const avg = dataArray.reduce((a, b) => a + b, 0) / bufferLength / 255;
    const particleCount = Math.floor(20 + avg * 60);

    for (let i = 0; i < particleCount; i++) {
      const band = Math.floor(Math.random() * bufferLength);
      const amp = dataArray[band] / 255;
      const angle = (band / bufferLength) * Math.PI * 2;
      const radius = 50 + amp * (Math.min(w, h) * 0.4);

      const px = w / 2 + Math.cos(angle) * radius;
      const py = h / 2 + Math.sin(angle) * radius;
      const size = 1 + amp * 6;

      ctx.fillStyle = particleColor;
      ctx.globalAlpha = 0.4 + amp * 0.6;
      ctx.beginPath();
      ctx.arc(px, py, size, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
    }
  }, [particleColor]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const analyser = engine.getAnalyser();
    if (!analyser) return;

    const render = () => {
      const w = canvas.width;
      const h = canvas.height;

      switch (mode) {
        case 'bars': renderBars(analyser, ctx, w, h); break;
        case 'waveform': renderWaveform(analyser, ctx, w, h); break;
        case 'particles': renderParticles(analyser, ctx, w, h); break;
      }

      rafRef.current = requestAnimationFrame(render);
    };

    render();

    return () => cancelAnimationFrame(rafRef.current);
  }, [engine, mode, renderBars, renderWaveform, renderParticles]);

  // Resize
  useEffect(() => {
    const onResize = () => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const parent = canvas.parentElement!;
      canvas.width = parent.clientWidth * (window.devicePixelRatio || 1);
      canvas.height = parent.clientHeight * (window.devicePixelRatio || 1);
      canvas.style.width = `${parent.clientWidth}px`;
      canvas.style.height = `${parent.clientHeight}px`;
    };
    onResize();
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  const modes: VizMode[] = ['bars', 'waveform', 'particles'];
  const currentIndex = modes.indexOf(mode);

  if (!playback.isPlaying) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-4 text-base" style={{ color: 'var(--color-text-muted)' }}>
        <div className="text-5xl">🎵</div>
        <p>Play something to see the visualization</p>
      </div>
    );
  }

  return (
    <div className="group relative h-full w-full">
      <canvas ref={canvasRef} className="h-full w-full" />

      {/* Dots indicator — stays inside the square, overlaying the canvas */}
      <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex gap-2">
        {modes.map((m, i) => (
          <button
            key={m}
            onClick={(e) => { e.stopPropagation(); onModeChange(m); }}
            className="border-none cursor-pointer bg-transparent p-0 flex items-center justify-center"
            aria-label={`${m} visualization`}
          >
            <span
              className="block rounded-full transition-all"
              style={{
                width: 8,
                height: 8,
                background: i === currentIndex ? '#fff' : 'transparent',
                border: i === currentIndex ? '2px solid #fff' : '2px solid rgba(255,255,255,0.5)',
              }}
            />
          </button>
        ))}
      </div>
    </div>
  );
}
