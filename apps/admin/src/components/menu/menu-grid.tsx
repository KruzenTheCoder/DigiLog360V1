import Link from 'next/link';
import { Icon } from '@/lib/icons';
import type { NavSection } from '@/components/layout/nav-config';

// Accent colours cycled across the action cards — echoes the multi-coloured
// left borders in the role menus.
const ACCENTS = [
  '#2563eb', '#0ea5e9', '#6366f1', '#8b5cf6',
  '#ec4899', '#f59e0b', '#10b981', '#ef4444',
  '#14b8a6', '#7c3aed', '#0891b2', '#d97706',
];

// One-line descriptions per destination, keyed by href, to give each card the
// "title + subtitle" layout from the reference menus. Falls back to a generic
// line when an href isn't listed.
const DESCRIPTIONS: Record<string, string> = {
  '/dashboard': 'View operational KPIs and trends.',
  '/occurrences': 'View and filter live occurrences.',
  // '/menu' deliberately omitted — it's the landing hub, not a destination.
  '/notifications': 'Alerts and messages addressed to you.',
  '/occurrences/all': 'Browse every occurrence on record.',
  '/occurrences/new': 'Log a new occurrence.',
  '/reports': 'Search, view and export occurrence reports.',
  '/occurrences/history': 'View and filter past occurrences.',
  '/my-queue': 'Occurrences assigned to you.',
  '/patrols': 'Monitor active and recent patrols.',
  '/checkpoints': 'Manage patrol checkpoints and tags.',
  '/team': 'See who is on duty right now.',
  '/visitors': 'Sign visitors in and out at the gate.',
  '/keys': 'Issue and return keys from the register.',
  '/shifts': 'Review shift coverage and clock records.',
  '/patrols/schedules': 'Plan and assign patrol routes.',
  '/guards-map': 'Track guard positions on a live map.',
  '/manager/acknowledgements': 'Review occurrences, acknowledge and sign off.',
  '/manager/reviewed': 'View the logs of occurrences you have reviewed.',
  '/manager/staff-reports': 'Hero KPIs, severity, SLA & per-role rankings.',
  '/users': 'Add, edit and deactivate users.',
  '/sites': 'Manage sites and locations.',
  '/settings/organization': 'Branding and organisation details.',
  '/settings/sla': 'Configure SLA targets per severity.',
  '/settings/types': 'Manage occurrence types.',
  '/my-access': 'See the roles and permissions you hold.',
  '/settings/notifications': 'Choose what you get notified about.',
  '/settings/security': 'Manage two-factor authentication.',
  '/settings/webhooks': 'Send events to external systems.',
  '/settings/api-tokens': 'Issue API tokens for integrations.',
  '/settings/audit': 'Review the security audit trail.',
  '/super/organizations': 'Create and manage organisations.',
  '/super/users': 'Manage users across every organisation.',
  '/super/health': 'Platform health and diagnostics.',
  '/super/permissions': 'Toggle what each role can see and do.',
  '/super/branding': 'Toggle the parent-company logo per organisation.',
  '/super/mobile-layout': 'Control the mobile bottom bar and home cards per role.',
  '/super/assignees': 'Choose who appears in the Assign-to dropdown.',
  '/super/form-builder': 'Toggle which sections show on the Log Occurrence form.',
};

/** Renders the user's permitted nav sections as a grid of accent action cards. */
export function MenuGrid({ sections }: { sections: NavSection[] }) {
  let idx = 0;
  return (
    <div className="space-y-7">
      {sections.map((section) => (
        <div key={section.title}>
          <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-[hsl(var(--muted))]">
            {section.title}
          </h2>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {section.items.map((item) => {
              const color = ACCENTS[idx++ % ACCENTS.length];
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  prefetch={item.href.startsWith('/tasks') ? false : undefined}
                  className="group relative flex items-start gap-3 overflow-hidden rounded-xl border bg-[hsl(var(--surface))] p-4 pl-5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
                >
                  <span className="absolute inset-y-0 left-0 w-1.5" style={{ background: color }} />
                  <span className="rounded-lg p-2" style={{ background: `${color}1a`, color }}>
                    <Icon name={item.icon} className="h-5 w-5" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold leading-tight">{item.label}</p>
                    <p className="mt-0.5 text-xs text-[hsl(var(--muted))]">
                      {DESCRIPTIONS[item.href] ?? 'Open'}
                    </p>
                  </div>
                  <Icon name="ChevronRight" className="h-4 w-4 self-center text-[hsl(var(--muted))] opacity-0 transition group-hover:opacity-100" />
                </Link>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
