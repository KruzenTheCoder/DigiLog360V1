import { getIcon } from '@/lib/icons';
import { cn } from '@/lib/utils';
import { Card } from '@/components/ui/card';

export function StatCard({
  label, value, icon, hint, tone = 'default',
}: {
  label: string;
  value: string | number;
  icon: string;
  hint?: string;
  tone?: 'default' | 'danger' | 'warning' | 'success' | 'brand';
}) {
  const C = getIcon(icon, 'Activity');

  const tones: Record<string, string> = {
    default: 'text-slate-500 bg-slate-100 dark:bg-slate-800',
    danger: 'text-red-600 bg-red-100 dark:bg-red-950/50',
    warning: 'text-amber-600 bg-amber-100 dark:bg-amber-950/50',
    success: 'text-green-600 bg-green-100 dark:bg-green-950/50',
    brand: 'text-brand bg-brand/10',
  };

  return (
    <Card className="p-4">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm text-[hsl(var(--muted))]">{label}</p>
          <p className="mt-1 text-2xl font-bold">{value}</p>
          {hint && <p className="mt-1 text-xs text-[hsl(var(--muted))]">{hint}</p>}
        </div>
        <div className={cn('rounded-lg p-2', tones[tone])}>
          <C className="h-5 w-5" />
        </div>
      </div>
    </Card>
  );
}
