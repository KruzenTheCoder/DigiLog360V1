import type { ReactNode } from 'react';
import { getIcon } from '@/lib/icons';
import { cn } from '@/lib/utils';

type Tone = 'brand' | 'green' | 'amber' | 'red' | 'sky' | 'violet' | 'slate';

// Saturated banner gradient + matching subtle card background. The card body
// is tonal (very faint tint) so the section reads as a single unit without
// fighting the page background in dark mode.
const TONES: Record<Tone, { bar: string; ring: string }> = {
  brand:  { bar: 'from-[#667eea] to-[#764ba2]', ring: 'ring-[#667eea]/15' },
  green:  { bar: 'from-emerald-500 to-teal-600', ring: 'ring-emerald-500/15' },
  amber:  { bar: 'from-amber-500 to-orange-600', ring: 'ring-amber-500/15' },
  red:    { bar: 'from-rose-500 to-red-600', ring: 'ring-rose-500/15' },
  sky:    { bar: 'from-sky-500 to-blue-600', ring: 'ring-sky-500/15' },
  violet: { bar: 'from-violet-500 to-purple-600', ring: 'ring-violet-500/15' },
  slate:  { bar: 'from-slate-600 to-slate-800', ring: 'ring-slate-500/15' },
};

/**
 * Section wrapper with a saturated gradient banner header and a soft card
 * body underneath. Matches the legacy "Performance Dashboard" visual rhythm
 * where every section has its own coloured header bar.
 */
export function GradientSection({
  title, subtitle, icon, tone = 'brand', actions, children, className,
}: {
  title: string;
  subtitle?: string;
  icon?: string;
  tone?: Tone;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  const C = icon ? getIcon(icon, 'LayoutDashboard') : null;
  const t = TONES[tone];
  return (
    <section className={cn('overflow-hidden rounded-2xl border bg-[hsl(var(--surface))] shadow-sm ring-1', t.ring, className)}>
      <header className={cn('flex items-center justify-between gap-3 bg-gradient-to-r px-5 py-3 text-white shadow-sm', t.bar)}>
        <div className="flex min-w-0 items-center gap-2">
          {C && <C className="h-5 w-5 shrink-0 opacity-90" />}
          <div className="min-w-0">
            <h2 className="truncate text-sm font-bold tracking-wide">{title}</h2>
            {subtitle && <p className="truncate text-[11px] text-white/85">{subtitle}</p>}
          </div>
        </div>
        {actions && <div className="shrink-0">{actions}</div>}
      </header>
      <div className="p-5">{children}</div>
    </section>
  );
}
