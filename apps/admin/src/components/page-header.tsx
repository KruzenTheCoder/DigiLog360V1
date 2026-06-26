'use client';

import * as Icons from 'lucide-react';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';

// Path → default icon. Lets every page get a sensible icon for free even
// when the page doesn't pass one explicitly. Pass `icon=null` to suppress.
const PATH_ICON: Record<string, string> = {
  '/menu': 'LayoutGrid',
  '/dashboard': 'LayoutDashboard',
  '/occurrences': 'Radio',
  '/occurrences/all': 'ClipboardList',
  '/occurrences/new': 'PlusCircle',
  '/occurrences/history': 'Archive',
  '/my-queue': 'Inbox',
  '/tasks': 'CheckCircle',
  '/reports': 'FileText',
  '/reports/new': 'FilePlus',
  '/patrols': 'Footprints',
  '/patrols/schedules': 'CalendarClock',
  '/checkpoints': 'MapPin',
  '/team': 'Users',
  '/visitors': 'LogIn',
  '/keys': 'KeyRound',
  '/shifts': 'Clock',
  '/guards-map': 'Map',
  '/notifications': 'Bell',
  '/manager/acknowledgements': 'CheckSquare',
  '/manager/reviewed': 'History',
  '/manager/staff-reports': 'BarChart3',
  '/users': 'UserCog',
  '/sites': 'Building2',
  '/settings/organization': 'Settings',
  '/settings/sla': 'Gauge',
  '/settings/types': 'Tags',
  '/settings/notifications': 'BellRing',
  '/settings/security': 'ShieldCheck',
  '/settings/webhooks': 'Webhook',
  '/settings/api-tokens': 'Key',
  '/settings/audit': 'ScrollText',
  '/my-access': 'KeySquare',
  '/super/organizations': 'Building',
  '/super/users': 'Users2',
  '/super/health': 'Activity',
  '/super/permissions': 'SlidersHorizontal',
  '/super/branding': 'Palette',
  '/super/assignees': 'UserCheck',
  '/super/form-builder': 'FormInput',
};

function resolveIconName(pathname: string, override?: string | null): string | null {
  if (override === null) return null;          // explicit suppression
  if (typeof override === 'string') return override;
  // Walk path segments from longest to shortest for nested routes.
  const segments = pathname.split('/').filter(Boolean);
  while (segments.length) {
    const key = '/' + segments.join('/');
    if (PATH_ICON[key]) return PATH_ICON[key];
    segments.pop();
  }
  return 'LayoutDashboard';
}

/**
 * PageHeader — purple-gradient banner with auto-picked icon.
 *
 * Pass `icon="IconName"` to override the path-based default, or `icon={null}`
 * to suppress the icon entirely. The banner uses the brand gradient (matches
 * the mobile guard portal header from the screenshots) so every page reads
 * as part of the same product.
 */
export function PageHeader({
  title, description, action, icon, className,
}: {
  title: string;
  description?: string;
  action?: React.ReactNode;
  icon?: string | null;
  className?: string;
}) {
  const path = usePathname();
  const iconName = resolveIconName(path ?? '/', icon);
  const I = iconName
    ? ((Icons as unknown as Record<string, React.ComponentType<{ className?: string }>>)[iconName] ?? Icons.LayoutDashboard)
    : null;

  return (
    <div
      className={cn(
        'mb-6 overflow-hidden rounded-2xl bg-brand-gradient p-6 text-white shadow-lg',
        className,
      )}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          {I && (
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-white/15 backdrop-blur-sm">
              <I className="h-6 w-6 text-white" />
            </div>
          )}
          <div className="min-w-0">
            <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
            {description && <p className="mt-1 text-sm text-white/85">{description}</p>}
          </div>
        </div>
        {action && <div className="shrink-0">{action}</div>}
      </div>
    </div>
  );
}

