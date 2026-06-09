import * as Icons from 'lucide-react';
import { SEVERITIES, SEVERITY_LABELS, type SeverityLevel } from '@digilog/shared';

// Per-severity presentation: icon + the soft tonal surface used behind the
// count. Colours echo SEVERITY_COLORS but are softened for large fills.
const META: Record<SeverityLevel, { icon: string; ring: string; bg: string; fg: string }> = {
  critical: { icon: 'OctagonAlert', ring: 'ring-red-200 dark:ring-red-900/50', bg: 'bg-red-50 dark:bg-red-950/30', fg: 'text-red-600' },
  high: { icon: 'AlertTriangle', ring: 'ring-orange-200 dark:ring-orange-900/50', bg: 'bg-orange-50 dark:bg-orange-950/30', fg: 'text-orange-600' },
  medium: { icon: 'AlertCircle', ring: 'ring-amber-200 dark:ring-amber-900/50', bg: 'bg-amber-50 dark:bg-amber-950/30', fg: 'text-amber-600' },
  low: { icon: 'Info', ring: 'ring-sky-200 dark:ring-sky-900/50', bg: 'bg-sky-50 dark:bg-sky-950/30', fg: 'text-sky-600' },
};

/** Four big tonal tiles showing the count of incidents at each severity. */
export function SeverityCards({ counts }: { counts: Record<SeverityLevel, number> }) {
  return (
    <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
      {SEVERITIES.map((key) => {
        const m = META[key];
        const C = (Icons as unknown as Record<string, React.ComponentType<{ className?: string }>>)[m.icon]
          ?? Icons.Circle;
        return (
          <div
            key={key}
            className={`flex flex-col items-center rounded-2xl ${m.bg} p-5 text-center ring-1 ${m.ring}`}
          >
            <div className={`mb-2 flex h-11 w-11 items-center justify-center rounded-full bg-white/70 ${m.fg} dark:bg-white/10`}>
              <C className="h-6 w-6" />
            </div>
            <p className="text-3xl font-extrabold text-[hsl(var(--foreground))]">{counts[key]}</p>
            <p className="mt-0.5 text-[11px] font-semibold uppercase tracking-wider text-[hsl(var(--muted))]">
              {SEVERITY_LABELS[key]}
            </p>
          </div>
        );
      })}
    </div>
  );
}
