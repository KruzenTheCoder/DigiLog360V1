'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import * as Icons from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { cn, initials } from '@/lib/utils';
import { visibleSections } from './nav-config';
import { Logo } from '@/components/brand/logo';
import { NetstreamLogo } from '@/components/brand/netstream-logo';
import { TaskAssignmentToast } from '@/components/tasks/task-assignment-toast';
import { invalidateCache } from '@/lib/use-cached-query';
import { BRAND, ROLE_LABELS, type Profile } from '@digilog/shared';

function Icon({ name, className }: { name: string; className?: string }) {
  const C = (Icons as unknown as Record<string, React.ComponentType<{ className?: string }>>)[name]
    ?? Icons.Circle;
  return <C className={className} />;
}

export function AppShell({
  profile, siteName, children, capabilities = [],
  showNetstreamLogo = true, netstreamLogoUrl = null, siteCount = 0,
}: {
  profile: Profile;
  siteName: string | null;
  children: React.ReactNode;
  /** Capability keys the user holds. `['*']` means super_user (everything). */
  capabilities?: string[];
  /** Per-org toggle from organizations.show_netstream_logo. */
  showNetstreamLogo?: boolean;
  /** Optional uploaded override (from organizations.netstream_logo_url). */
  netstreamLogoUrl?: string | null;
  /** Number of sites assigned (0 = unscoped / all sites). */
  siteCount?: number;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [dark, setDark] = useState(false);
  const [unread, setUnread] = useState(0);
  const caps = new Set<string>(capabilities);
  const roleList = Array.isArray(profile.roles) && profile.roles.length > 0
    ? profile.roles
    : [profile.role];
  const sections = visibleSections(roleList, caps);

  // Admin / Manager / Control Room navigate from the /menu hub (full card
  // grid), so the sidebar is redundant for them. Hide it when the user holds
  // any of those roles — even alongside another non-super role (e.g. a control
  // room operator who is also a supervisor). The super_user keeps the sidebar
  // since it's the platform-wide admin surface.
  const SIDEBARLESS_ROLES = ['admin', 'manager', 'control_room'];
  const hideSidebar =
    !roleList.includes('super_user') &&
    roleList.some((r) => SIDEBARLESS_ROLES.includes(r));

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
    // Drop the client-side data cache so the next user never sees the
    // previous user's cached rows.
    invalidateCache();
    await createClient().auth.signOut();
    router.replace('/login');
    router.refresh();
  }

  return (
    <div className="flex min-h-screen">
      {!hideSidebar && (
      <>
      {/* Sidebar */}
      <aside
        className={cn(
          'fixed inset-y-0 left-0 z-40 w-64 transform border-r bg-[hsl(var(--surface))] transition-transform lg:static lg:translate-x-0',
          open ? 'translate-x-0' : '-translate-x-full',
        )}
      >
        <Link href="/menu" className="flex h-16 items-center border-b px-5" aria-label={`${BRAND.name} home`}>
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
      </>
      )}

      {/* Main */}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-20 flex h-16 items-center justify-between gap-4 bg-brand-gradient px-4 shadow-md lg:px-6 relative">
          {hideSidebar ? (
            <Link href="/menu" className="flex items-center" aria-label={`${BRAND.name} home`}>
              <Logo className="text-xl" onDark />
            </Link>
          ) : (
            <button className="lg:hidden text-white" onClick={() => setOpen(true)} aria-label="Open menu">
              <Icons.Menu className="h-6 w-6" />
            </button>
          )}

          {/* Netstream logo — true-centered in the header bar. `absolute`
              avoids competing with the surrounding flex items for spacing,
              and `pointer-events-none` lets clicks fall through to whatever
              sits under the centre (typically dead space). Hidden on small
              screens where the bar is already tight, and on per-org request
              via the super_user toggle at /super/branding. */}
          {showNetstreamLogo && (
            <div className="pointer-events-none absolute left-1/2 top-1/2 hidden -translate-x-1/2 -translate-y-1/2 md:block">
              {netstreamLogoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={netstreamLogoUrl}
                  alt="Netstream"
                  className="h-10 w-auto object-contain"
                />
              ) : (
                <NetstreamLogo height={40} onDark />
              )}
            </div>
          )}


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
              onClick={() => router.push('/menu')}
              icon={<Icons.Home className="h-5 w-5" />}
              label="Home (menu)"
              active={pathname === '/menu'}
            />
          </div>

          <div
            className="hidden items-center gap-1.5 rounded-full bg-white/15 px-3 py-1 text-sm font-medium text-white backdrop-blur-sm sm:flex"
            title={siteCount > 1 ? `Assigned to ${siteCount} sites` : undefined}
          >
            <Icons.MapPin className="h-4 w-4" />
            {siteName ?? 'All sites'}
            {siteCount > 1 && (
              <span className="rounded-full bg-white/25 px-1.5 text-[10px] font-bold">{siteCount}</span>
            )}
          </div>
          <div className="ml-auto flex items-center gap-2">
            <Link
              href="/notifications"
              className="relative rounded-lg p-2 text-white hover:bg-white/15"
              aria-label="Notifications"
              title="Notifications"
            >
              <Icons.Bell className="h-5 w-5" />
              {unread > 0 && (
                <span className="absolute -top-0.5 -right-0.5 flex h-4 min-w-[1rem] items-center justify-center rounded-full bg-red-600 px-1 text-[10px] font-bold text-white ring-2 ring-white/30">
                  {unread > 99 ? '99+' : unread}
                </span>
              )}
            </Link>
            <button onClick={toggleTheme} className="rounded-lg p-2 text-white hover:bg-white/15" aria-label="Toggle theme">
              {dark ? <Icons.Sun className="h-5 w-5" /> : <Icons.Moon className="h-5 w-5" />}
            </button>
            <div className="flex items-center gap-2 rounded-lg border border-white/25 bg-white/10 px-2 py-1.5 backdrop-blur-sm">
              <div className="flex h-7 w-7 items-center justify-center rounded-full bg-white text-xs font-semibold text-brand">
                {initials(profile.full_name || profile.email)}
              </div>
              <div className="hidden text-left sm:block">
                <p className="text-xs font-medium leading-tight text-white">{profile.full_name ?? profile.email}</p>
                <p className="text-[10px] text-white/75">{ROLE_LABELS[profile.role]}</p>
              </div>
            </div>
            <button onClick={signOut} className="rounded-lg p-2 text-white hover:bg-white/15" aria-label="Sign out" title="Sign out">
              <Icons.LogOut className="h-5 w-5" />
            </button>
          </div>
        </header>

        <main className="flex-1 p-4 lg:p-6 animate-fade-in">{children}</main>
      </div>

      {/* Realtime task-assignment toast — listens for INSERT/UPDATE on
          tasks where assigned_to = me and shows a corner popup with
          Open / Dismiss actions. Mounted at the root of the app so it
          works on every authenticated page. */}
      <TaskAssignmentToast userId={profile.id} userName={profile.full_name ?? profile.email ?? 'You'} />
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
          ? 'bg-white/25 text-white'
          : 'text-white/80 hover:bg-white/15 hover:text-white',
      )}
    >
      {icon}
    </button>
  );
}
