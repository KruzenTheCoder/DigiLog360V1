import { redirect } from 'next/navigation';
import { AlertTriangle } from 'lucide-react';
import { createClient } from '@/lib/supabase/server';
import { requireProfile, isSuperUser } from '@/lib/auth';
import { PageHeader } from '@/components/page-header';
import { ManagementReportToggleForm } from '@/components/super/management-report-toggle-form';
import type { AppRole } from '@digilog/shared';

export const dynamic = 'force-dynamic';

interface ProfileRow {
  id: string;
  full_name: string | null;
  email: string | null;
  role: AppRole;
  roles: AppRole[] | null;
  job_title: string | null;
  site_id: string | null;
  can_log_management_report: boolean;
  is_active: boolean;
}

export default async function ManagementReportsPage() {
  const profile = await requireProfile();
  if (!isSuperUser(profile)) redirect('/dashboard');

  const supabase = await createClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sb: any = supabase;

  // Try the full query first. If it errors (most likely because
  // `can_log_management_report` or `job_title` haven't been added to the schema
  // yet), fall back to the base columns and synthesise sensible defaults so the
  // page still renders with a friendly banner instead of a hard 500.
  const FULL_COLS = 'id, full_name, email, role, roles, job_title, site_id, can_log_management_report, is_active';
  const BASE_COLS = 'id, full_name, email, role, roles, site_id, is_active';

  let rows: ProfileRow[] = [];
  let schemaMissing: string | null = null;

  // Sites lookup is independent of the profiles query — start it now so it
  // runs in parallel rather than after.
  const sitesPromise = (async () => {
    const { data } = await sb.from('sites').select('id, name');
    return (data ?? []) as Array<{ id: string; name: string }>;
  })();

  const { data: full, error: fullErr } = await sb
    .from('profiles')
    .select(FULL_COLS)
    .order('full_name', { ascending: true, nullsFirst: false });

  if (!fullErr) {
    rows = (full ?? []) as ProfileRow[];
  } else {
    // Retry with the safe column subset; synthesise the new fields.
    const { data: base, error: baseErr } = await sb
      .from('profiles')
      .select(BASE_COLS)
      .order('full_name', { ascending: true, nullsFirst: false });
    if (baseErr) {
      schemaMissing = `Profiles query failed: ${baseErr.message}`;
    } else {
      schemaMissing = fullErr.message;
      rows = ((base ?? []) as Array<Omit<ProfileRow, 'job_title' | 'can_log_management_report'>>).map((r) => ({
        ...r,
        job_title: null,
        can_log_management_report: false,
      }));
    }
  }

  const sites = await sitesPromise;
  // Plain object — server-to-client props must be serialisable. Passing a
  // function (a siteName lookup helper) trips the RSC boundary.
  const siteNames: Record<string, string> = {};
  for (const s of sites) {
    siteNames[s.id] = s.name;
  }

  return (
    <>
      <PageHeader
        title="Management Reports Access"
        description='Pick which users see the "Management Reports" option when logging an occurrence. This toggle is the single control — turning a user off hides the option for them, turning it on shows it. New users start off.'
      />

      {schemaMissing && (
        <div className="mb-4 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200">
          <p className="flex items-center gap-2 font-semibold">
            <AlertTriangle className="h-4 w-4" /> Schema not fully applied
          </p>
          <p className="mt-1">
            The <code className="font-mono">can_log_management_report</code> column isn&apos;t in the database yet, so
            toggles on this page won&apos;t persist. Paste the SQL below into <strong>Supabase → SQL Editor</strong>,
            then reload.
          </p>
          <pre className="mt-2 overflow-x-auto rounded bg-black/10 px-3 py-2 text-[11px] dark:bg-black/30">{`alter table public.profiles add column if not exists can_log_management_report boolean not null default false;
create index if not exists idx_profiles_can_log_management_report on public.profiles (can_log_management_report) where can_log_management_report = true;`}</pre>
          <p className="mt-1 text-[11px] opacity-75">Driver detail: {schemaMissing}</p>
        </div>
      )}

      <ManagementReportToggleForm rows={rows} siteNames={siteNames} />
    </>
  );
}
