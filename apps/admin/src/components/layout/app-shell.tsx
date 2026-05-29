'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import * as Icons from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { cn, initials } from '@/lib/utils';
import { visibleSections } from './nav-config';
import { BRAND, ROLE_LABELS, type Profile } from '@digilog/shared';

function Icon({ name, className }: { name: string; className?: string }) {
  const C = (Icons as unknown as Record<string, React.ComponentType<{ className?: string }>>)[name]
    ?? Icons.Circle;
  return <C className={className} />;
}

export function AppShell({
  profile, siteName, children,
}: { profile: Profile; siteName: string | null; children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [dark, setDark] = useState(false);
  const sections = visibleSections(profile.role);

  function toggleTheme() {
    const next = !dark;
    setDark(next);
    document.documentElement.classList.toggle('dark', next);
  }

  async function signOut() {
    await createClient().auth.signOut();
    router.replace('/login');
    router.refresh();
  }

  return (
    <div className="flex min-h-screen">
      {/* Sidebar */}
      <aside
        className={cn(
          'fixed inset-y-0 left-0 z-40 w-64 transform border-r bg-[hsl(var(--surface))] transition-transform lg:static lg:translate-x-0',
          open ? 'translate-x-0' : '-translate-x-full',
        )}
      >
        <div className="flex h-16 items-center gap-2 border-b px-5 text-brand">
          <Icons.ShieldCheck className="h-7 w-7" />
          <span className="text-lg font-bold tracking-tight">{BRAND.name}</span>
        </div>
        <nav className="flex h-[calc(100vh-4rem)] flex-col gap-5 overflow-y-auto scrollbar-thin p-3">
          {sections.map((section) => (
            <div key={section.title}>
              <p className="px-2 pb-1 text-[10px] font-semibold uppercase tracking-wider text-[hsl(var(--muted))]">
                {section.title}
              </p>
              <div className="space-y-0.5">
                {section.items.map((item) => {
                  const active = pathname === item.href || pathname.startsWith(item.href + '/');
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      onClick={() => setOpen(false)}
                      className={cn(
                        'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition',
                        active
                          ? 'bg-brand/10 text-brand'
                          : 'text-[hsl(var(--foreground))] hover:bg-slate-100 dark:hover:bg-slate-800',
                      )}
                    >
                      <Icon name={item.icon} className="h-4 w-4 shrink-0" />
                      {item.label}
                    </Link>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>
      </aside>

      {open && (
        <div className="fixed inset-0 z-30 bg-black/40 lg:hidden" onClick={() => setOpen(false)} />
      )}

      {/* Main */}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-20 flex h-16 items-center justify-between gap-4 border-b bg-[hsl(var(--surface))]/80 px-4 backdrop-blur lg:px-6">
          <button className="lg:hidden" onClick={() => setOpen(true)} aria-label="Open menu">
            <Icons.Menu className="h-6 w-6" />
          </button>
          <div className="hidden items-center gap-2 text-sm text-[hsl(var(--muted))] sm:flex">
            <Icons.MapPin className="h-4 w-4" />
            {siteName ?? 'All sites'}
          </div>
          <div className="ml-auto flex items-center gap-2">
            <button onClick={toggleTheme} className="rounded-lg p-2 hover:bg-slate-100 dark:hover:bg-slate-800" aria-label="Toggle theme">
              {dark ? <Icons.Sun className="h-5 w-5" /> : <Icons.Moon className="h-5 w-5" />}
            </button>
            <div className="flex items-center gap-2 rounded-lg border px-2 py-1.5">
              <div className="flex h-7 w-7 items-center justify-center rounded-full bg-brand-gradient text-xs font-semibold text-white">
                {initials(profile.full_name || profile.email)}
              </div>
              <div className="hidden text-left sm:block">
                <p className="text-xs font-medium leading-tight">{profile.full_name ?? profile.email}</p>
                <p className="text-[10px] text-[hsl(var(--muted))]">{ROLE_LABELS[profile.role]}</p>
              </div>
            </div>
            <button onClick={signOut} className="rounded-lg p-2 hover:bg-slate-100 dark:hover:bg-slate-800" aria-label="Sign out" title="Sign out">
              <Icons.LogOut className="h-5 w-5" />
            </button>
          </div>
        </header>

        <main className="flex-1 p-4 lg:p-6 animate-fade-in">{children}</main>
      </div>
    </div>
  );
}
