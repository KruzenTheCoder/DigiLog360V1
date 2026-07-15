import { getIcon } from '@/lib/icons';
import { cn } from '@/lib/utils';

type HeroTone = 'red' | 'blue' | 'green' | 'violet';

const TONES: Record<HeroTone, string> = {
  red: 'from-[#f0506e] to-[#d4314f]',
  blue: 'from-[#3b82f6] to-[#2563c9]',
  green: 'from-[#10b981] to-[#059467]',
  violet: 'from-[#7c5cff] to-[#5b3fd6]',
};

/**
 * Large gradient KPI tile for the top row of the dashboard — bold value on a
 * saturated brand-coloured panel, with an icon chip and a footer badge for the
 * trend / target line.
 */
export function HeroKpi({
  tone, icon, label, sublabel, value, footer, href,
}: {
  tone: HeroTone;
  icon: string;
  label: string;
  sublabel?: string;
  value: string | number;
  footer?: React.ReactNode;
  /** When set, the whole tile becomes a link to this occurrence-list view. */
  href?: string;
}) {
  const C = getIcon(icon, 'Activity');
  const Wrapper = href ? 'a' : 'div';

  return (
    <Wrapper
      {...(href ? { href } : {})}
      className={cn(
        'relative overflow-hidden rounded-2xl bg-gradient-to-br p-5 text-white shadow-lg',
        href && 'block transition hover:-translate-y-0.5 hover:shadow-xl focus-visible:outline focus-visible:outline-2 focus-visible:outline-white/60',
        TONES[tone],
      )}
    >
      {/* soft decorative glow */}
      <div className="pointer-events-none absolute -right-6 -top-8 h-28 w-28 rounded-full bg-white/10" />
      <div className="flex items-start justify-between">
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-white/85">{label}</p>
          {sublabel && <p className="text-xs text-white/70">{sublabel}</p>}
        </div>
        <div className="rounded-xl bg-white/15 p-2 backdrop-blur-sm">
          <C className="h-5 w-5" />
        </div>
      </div>

      <p className="mt-3 text-4xl font-extrabold leading-none tracking-tight">{value}</p>

      {footer && (
        <div className="mt-3 inline-flex items-center gap-1 rounded-full bg-black/15 px-2.5 py-1 text-xs font-medium">
          {footer}
        </div>
      )}
    </Wrapper>
  );
}
