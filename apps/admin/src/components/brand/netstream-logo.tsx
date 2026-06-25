import { cn } from '@/lib/utils';

/**
 * Netstream Integrated Solutions wordmark.
 *
 * SVG reproduction of the parent-company logo from the legacy app:
 * a red heartbeat-pulse line above the "OUR DNA | YOUR FOOTPRINT" tagline,
 * the bold NETSTREAM wordmark, and the INTEGRATED SOLUTIONS sub-line.
 *
 * Vector-only so it stays sharp at any size and inherits the app font.
 * Use a `text-*` className or pass `height` to scale.
 */
export function NetstreamLogo({
  className,
  onDark = false,
  height = 36,
}: {
  className?: string;
  onDark?: boolean;
  height?: number;
}) {
  // 240 × 60 viewBox keeps roughly the same proportions as the legacy block.
  const red = '#e30613';
  const text = onDark ? '#ffffff' : '#1a1a1a';
  const sub = onDark ? '#ffffffcc' : '#4a4a4a';

  return (
    <svg
      viewBox="0 0 240 60"
      role="img"
      aria-label="Netstream Integrated Solutions"
      className={cn('select-none', className)}
      style={{ height, width: 'auto' }}
    >
      {/* Heartbeat pulse — runs across the very top of the block */}
      <path
        d="M2 14 L40 14 L48 6 L56 22 L64 10 L72 14 L240 14"
        fill="none"
        stroke={red}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />

      {/* Tagline */}
      <text
        x="78"
        y="13"
        fontSize="6"
        fontWeight="600"
        letterSpacing="1"
        fill={sub}
        fontFamily="var(--font-sans, system-ui, sans-serif)"
      >
        OUR DNA | YOUR FOOTPRINT
      </text>

      {/* NETSTREAM wordmark — bold, slightly condensed */}
      <text
        x="2"
        y="38"
        fontSize="22"
        fontWeight="900"
        letterSpacing="0.5"
        fill={red}
        fontFamily="var(--font-sans, system-ui, sans-serif)"
      >
        NETSTREAM
      </text>

      {/* Sub-line */}
      <text
        x="2"
        y="52"
        fontSize="8"
        fontWeight="700"
        letterSpacing="3"
        fill={text}
        fontFamily="var(--font-sans, system-ui, sans-serif)"
      >
        INTEGRATED SOLUTIONS
      </text>
    </svg>
  );
}
