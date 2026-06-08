'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import * as Icons from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { cn, initials } from '@/lib/utils';
import { visibleSections } from './nav-config';
import { Logo } from '@/components/brand/logo';
import { BRAND, ROLE_LABELS, type Profile } from '@digilog/shared';

function Icon({ name, className }: { name: string; className?: string }) {
  const C = (Icons as unknown as Record<string, React.ComponentType<{ className?: string }>>)[name]
    ?? Icons.Circle;
  return <C className={className} />;
}

export function AppShell({
  profile, siteName, children, capabilities = [],
}: {
  profile: Profile;
  siteName: string | null;
  children: React.ReactNode;
  /** Capability keys the user holds. `['*']` means super_user (everything). */
  capabilities?: string[];
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [dark, setDark] = useState(false);
  const [unread, setUnread] = useState(0);
  const caps = new Set<string>(capabilities);
  const sections = visibleSections(
    Array.isArray(profile.roles) && profile.roles.length > 0
      ? profile.roles
      : profile.role,
    caps,
  );

  // Restore persisted theme on mount. Uses prefers-color-scheme as default
  // before any user choice has been saved.
  useEffect(() => {
    try {
      const stored = window.localStorage.getItem('digilog.theme');
      const initial = stored === 'dark'
        ? true
        : stored === 'light'
          ? false
          : window.matchMedia('(prefers-color-scheme: dark)').matches;
      setDark(initial);
      document.documentElement.classList.toggle('dark', initial);
    } catch { /* ssr or restricted storage — fine */ }
  }, []);

  // Live unread-notifications counter.
  useEffect(() => {
    const supabase = createClient();
    let cancelled = false;
    async function load() {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { count } = await (supabase as any)
        .from('notifications')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', profile.id)
        .is('read_at', null);
      if (!cancelled) setUnread(count ?? 0);
    }
    load();
    const channel = supabase
      .channel('notif-bell')
      .on('postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'notifications', filter: `user_id=eq.${profile.id}` },
        () => setUnread((u) => u + 1))
      .subscribe();
    return () => { cancelled = true; supabase.removeChannel(channel); };
  }, [profile.id]);

  function toggleTheme() {
    const next = !dark;
    setDark(next);
    document.documentElement.classList.toggle('dark', next);
    try { window.localStorage.setItem('digilog.theme', next ? 'dark' : 'light'); } catch { /* */ }
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
        <Link href="/dashboard" className="flex h-16 items-center border-b px-5" aria-label={`${BRAND.name} home`}>
          <Logo className="text-2xl" />
        </Link>
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

          {/* History navigation — Back / Forward / Home. Mirrors the browser
              chrome inside the app so users don't have to reach for the
              window controls in kiosk/full-screen deployments. */}
          <div className="flex items-center gap-0.5">
            <NavBtn
              onClick={() => router.back()}
              icon={<Icons.ArrowLeft className="h-5 w-5" />}
              label="Back"
            />
            <NavBtn
              onClick={() => router.forward()}
              icon={<Icons.ArrowRight className="h-5 w-5" />}
              label="Forward"
            />
            <NavBtn
              onClick={() => router.push('/dashboard')}
              icon={<Icons.Home className="h-5 w-5" />}
              label="Home (dashboard)"
              active={pathname === '/dashboard'}
            />
          </div>

          <div className="hidden items-center gap-2 text-sm text-[hsl(var(--muted))] sm:flex">
            <Icons.MapPin className="h-4 w-4" />
            {siteName ?? 'All sites'}
          </div>
          <div className="ml-auto flex items-center gap-2">
            <Link
              href="/notifications"
              className="relative rounded-lg p-2 hover:bg-slate-100 dark:hover:bg-slate-800"
              aria-label="Notifications"
              title="Notifications"
            >
              <Icons.Bell className="h-5 w-5" />
              {unread > 0 && (
                <span className="absolute -top-0.5 -right-0.5 flex h-4 min-w-[1rem] items-center justify-center rounded-full bg-red-600 px-1 text-[10px] font-bold text-white">
                  {unread > 99 ? '99+' : unread}
                </span>
              )}
            </Link>
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

// ---------------------------------------------------------------------------
// NavBtn — pill-shaped icon button used for header history navigation.
// Includes a tooltip-quality `title` and accessible label, and a visible
// `active` state for the Home button when you're already on the dashboard.
// ---------------------------------------------------------------------------
function NavBtn({
  icon, label, onClick, active,
}: {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
  active?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className={cn(
        'rounded-lg p-2 transition-colors',
        active
          ? 'bg-brand/15 text-brand'
          : 'text-[hsl(var(--muted))] hover:bg-slate-100 hover:text-[hsl(var(--foreground))] dark:hover:bg-slate-800',
      )}
    >
      {icon}
    </button>
  );
}
