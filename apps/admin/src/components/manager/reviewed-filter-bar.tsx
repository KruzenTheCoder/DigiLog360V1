'use client';

import { useRouter, usePathname, useSearchParams } from 'next/navigation';
import { User, Users, UserCheck } from 'lucide-react';
import { Select, Label } from '@/components/ui/input';

interface Reviewer { id: string; name: string }

/**
 * Tabbed switcher above the Reviewed Logs table:
 *   • My Reviewed Logs (just my acks)
 *   • By Person (pick a specific reviewer)
 *   • All (everyone)
 *
 * Drives the URL ?scope=mine|by|all&reviewer=ID so the server page can
 * filter at query time and the selection survives reloads.
 */
export function ReviewedFilterBar({
  scope, reviewerId, reviewers, currentUserName,
}: {
  scope: 'mine' | 'by' | 'all';
  reviewerId: string | null;
  reviewers: Reviewer[];
  currentUserName: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const search = useSearchParams();

  function go(next: { scope?: typeof scope; reviewer?: string | null }) {
    const params = new URLSearchParams(search.toString());
    if (next.scope) params.set('scope', next.scope);
    if (next.reviewer === null) params.delete('reviewer');
    else if (next.reviewer) params.set('reviewer', next.reviewer);
    router.push(`${pathname}?${params.toString()}`);
  }

  const tabs = [
    { key: 'mine' as const, label: 'My Reviewed Logs', icon: User },
    { key: 'by' as const,   label: 'By Person',         icon: UserCheck },
    { key: 'all' as const,  label: 'All Logs',          icon: Users },
  ];

  return (
    <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
      <div role="tablist" aria-label="Reviewed logs scope" className="inline-flex items-center gap-1 rounded-xl border bg-[hsl(var(--surface))] p-1 shadow-sm">
        {tabs.map((t) => {
          const Icon = t.icon;
          const active = scope === t.key;
          return (
            <button
              key={t.key}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => go({ scope: t.key, reviewer: t.key === 'by' ? reviewerId : null })}
              className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-semibold transition ${
                active
                  ? 'bg-brand text-white shadow-sm'
                  : 'text-[hsl(var(--muted))] hover:bg-slate-100 dark:hover:bg-slate-800'
              }`}
            >
              <Icon className="h-4 w-4" /> {t.label}
            </button>
          );
        })}
      </div>

      {scope === 'by' && (
        <div className="min-w-[220px]">
          <Label className="text-xs">Reviewer</Label>
          <Select
            value={reviewerId ?? ''}
            onChange={(e) => go({ reviewer: e.target.value || null })}
          >
            <option value="">— Pick a reviewer —</option>
            {reviewers.map((r) => (
              <option key={r.id} value={r.id}>{r.name}</option>
            ))}
          </Select>
        </div>
      )}

      {scope === 'mine' && (
        <p className="text-xs text-[hsl(var(--muted))]">
          Showing only acknowledgements signed by <strong>{currentUserName}</strong>.
        </p>
      )}
    </div>
  );
}
