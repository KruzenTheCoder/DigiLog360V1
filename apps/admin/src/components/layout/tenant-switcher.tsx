'use client';

// Header tenant picker, super users only.
//
// A super user's RLS policy spans every organisation, which is what makes
// cross-tenant administration possible — and also what makes an unfiltered
// page show two companies' people mixed together. This makes the choice
// explicit and sticky, so "whose data am I looking at" is always answerable.

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Building2, Check, ChevronDown, Loader2 } from 'lucide-react';

interface Org { id: string; name: string }

export function TenantSwitcher({
  orgs, activeId, allowAll = false,
}: {
  orgs: Org[];
  /** null / 'all' means every tenant at once. */
  activeId: string | null;
  allowAll?: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  const active = orgs.find((o) => o.id === activeId);
  const label = activeId === 'all' ? 'All tenants' : (active?.name ?? 'Select tenant');

  function choose(id: string) {
    // A year is right for a preference this sticky; it is not sensitive, and
    // the server still checks the caller may see that tenant.
    document.cookie = `digilog_active_org=${id}; path=/; max-age=31536000; samesite=lax`;
    setOpen(false);
    startTransition(() => router.refresh());
  }

  if (orgs.length <= 1 && !allowAll) return null;

  return (
    <div className="relative hidden sm:block">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1.5 rounded-full bg-white/15 px-3 py-1 text-sm font-medium text-white backdrop-blur-sm transition hover:bg-white/25"
        title="Which organisation you are viewing"
      >
        {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Building2 className="h-4 w-4" />}
        <span className="max-w-[10rem] truncate">{label}</span>
        <ChevronDown className="h-3.5 w-3.5 opacity-70" />
      </button>

      {open && (
        <>
          {/* Click-away. Rendered as a sibling so it cannot swallow the menu. */}
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute right-0 z-50 mt-1 min-w-[14rem] overflow-hidden rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--background))] py-1 shadow-lg">
            <p className="px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-[hsl(var(--muted))]">
              Viewing as
            </p>
            {orgs.map((o) => (
              <button
                key={o.id}
                type="button"
                onClick={() => choose(o.id)}
                className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm hover:bg-[hsl(var(--surface))]"
              >
                <span className="truncate">{o.name}</span>
                {o.id === activeId && <Check className="h-4 w-4 shrink-0 text-[hsl(var(--brand))]" />}
              </button>
            ))}
            {allowAll && (
              <>
                <div className="my-1 border-t" />
                <button
                  type="button"
                  onClick={() => choose('all')}
                  className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm hover:bg-[hsl(var(--surface))]"
                >
                  <span>All tenants</span>
                  {activeId === 'all' && <Check className="h-4 w-4 shrink-0 text-[hsl(var(--brand))]" />}
                </button>
              </>
            )}
          </div>
        </>
      )}
    </div>
  );
}
