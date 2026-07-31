import { useMusic } from '../../core/MusicContext';
import { getQualityTier, TIER_STYLES } from '../../core/quality';

/** Large badge for the now-playing track — reads codecInfo from MusicContext. */
export default function QualityBadge() {
  const { codecInfo } = useMusic();
  if (!codecInfo) return null;

  const { codec, bitRate, lossless } = codecInfo;
  const { label, tier } = getQualityTier({ suffix: codec, bitRate });

  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-3 py-0.5 text-[11px] font-semibold uppercase tracking-wide font-mono-ui border ${TIER_STYLES[tier]}`}
    >
      {lossless && '◆ '}{label}
    </span>
  );
}

/** Compact badge for queue rows — accepts a song object directly. */
export function SongQualityBadge({ song }: { song: { suffix?: string; bitRate?: number } }) {
  const { label, tier, lossless } = getQualityTier(song);
  if (!label) return null;

  return (
    <span
      className={`inline-flex flex-shrink-0 items-center gap-0.5 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase font-mono-ui border ${TIER_STYLES[tier]}`}
    >
      {lossless && '◆ '}{label}
    </span>
  );
}
