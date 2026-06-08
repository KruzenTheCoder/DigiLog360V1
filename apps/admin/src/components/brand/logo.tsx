import { cn } from '@/lib/utils';

/**
 * DigiLog360 wordmark.
 *
 * Renders the brand as gradient-clipped text — a metallic blue "DigiLog" and a
 * brushed-silver "360" — so it stays razor sharp at any size and inherits the
 * app font. No raster asset required.
 *
 * Size is driven by font-size: pass a Tailwind text-* class (e.g. `text-2xl`)
 * via `className`. Use `onDark` on the gradient/dark brand panels so the
 * wordmark lightens enough to read against them.
 */
export function Logo({
  className,
  onDark = false,
}: {
  className?: string;
  onDark?: boolean;
}) {
  return (
    <span
      className={cn(
        'inline-flex select-none items-baseline font-extrabold leading-none tracking-tight',
        className,
      )}
      aria-label="DigiLog360"
      role="img"
    >
      <span
        className={cn(
          'bg-clip-text text-transparent',
          onDark
            ? 'bg-gradient-to-b from-[#d6ecff] via-[#7fc1f0] to-[#3f86d6]'
            : 'bg-gradient-to-b from-[#7fc1f0] via-[#2f6fb0] to-[#173f73]',
        )}
      >
        DigiLog
      </span>
      <span
        className={cn(
          'bg-clip-text text-transparent',
          onDark
            ? 'bg-gradient-to-b from-white via-[#cfd8e2] to-[#9aa6b2]'
            : 'bg-gradient-to-b from-[#eef2f6] via-[#aab4bf] to-[#788490]',
        )}
      >
        360
      </span>
    </span>
  );
}
