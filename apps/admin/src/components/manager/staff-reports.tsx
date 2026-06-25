'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter, usePathname } from 'next/navigation';
import { Download, Filter } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select, Label } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Table, THead, TBody, TR, TH, TD } from '@/components/ui/table';
import { toCsv, downloadCsv } from '@/lib/csv';
import { ROLE_LABELS, type AppRole } from '@digilog/shared';

interface UserStats {
  user_id: string;
  full_name: string | null;
  email: string | null;
  role: AppRole;
  roles: AppRole[];
  site_name: string | null;
  occurrences: number;
  occurrences_open: number;
  occurrences_closed: number;
  patrols: number;
  patrol_minutes: number;
  scans: number;
  shifts: number;
  shift_minutes: number;
  acknowledgements: number;
  tasks_open: number;
  tasks_done: number;
  // Allow toCsv's Record<string, unknown> signature.
  [key: string]: unknown;
}

export function StaffReports({
  rows, roleFilter, days, roles,
}: {
  rows: UserStats[];
  roleFilter: AppRole | 'all';
  days: number;
  roles: AppRole[];
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [sortBy, setSortBy] = useState<keyof UserStats>('full_name');

  function setQuery(next: Record<string, string>) {
    const params = new URLSearchParams();
    if (next.role && next.role !== 'all') params.set('role', next.role);
    if (next.days) params.set('days', next.days);
    router.push(params.toString() ? `${pathname}?${params.toString()}` : pathname);
  }

  // Group totals by role for the strip above the table.
  const byRole = new Map<AppRole, UserStats[]>();
  for (const r of rows) {
    // Group by EACH role the user holds, so multi-role staff appear in both rolls.
    for (const role of r.roles) {
      if (!byRole.has(role)) byRole.set(role, []);
      byRole.get(role)!.push(r);
    }
  }

  const sorted = [...rows].sort((a, b) => {
    const av = a[sortBy] ?? 0;
    const bv = b[sortBy] ?? 0;
    if (typeof av === 'number' && typeof bv === 'number') return bv - av;
    return String(av ?? '').localeCompare(String(bv ?? ''));
  });

  function exportCsv() {
    const csv = toCsv(sorted, [
      { key: 'full_name', header: 'Name' },
      { key: 'email', header: 'Email' },
      { key: 'role', header: 'Primary role' },
      { key: 'roles', header: 'All roles', format: (v) => (v as AppRole[]).join('+') },
      { key: 'site_name', header: 'Site' },
      { key: 'occurrences', header: 'Occurrences logged' },
      { key: 'occurrences_open', header: 'Open' },
      { key: 'occurrences_closed', header: 'Closed' },
      { key: 'patrols', header: 'Patrols' },
      { key: 'patrol_minutes', header: 'Patrol minutes' },
      { key: 'scans', header: 'Checkpoint scans' },
      { key: 'shifts', header: 'Shifts' },
      { key: 'shift_minutes', header: 'Shift minutes' },
      { key: 'acknowledgements', header: 'Manager acknowledgements' },
      { key: 'tasks_open', header: 'Tasks open' },
      { key: 'tasks_done', header: 'Tasks done' },
    ]);
    downloadCsv(`staff-report-${roleFilter}-${days}d-${new Date().toISOString().slice(0, 10)}.csv`, csv);
  }

  return (
    <>
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <Label className="flex items-center gap-1 text-xs"><Filter className="h-3 w-3" /> Role</Label>
            <Select value={roleFilter} onChange={(e) => setQuery({ role: e.target.value, days: String(days) })}>
              <option value="all">All roles</option>
              {roles.map((r) => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
            </Select>
          </div>
          <div>
            <Label className="text-xs">Period</Label>
            <Select value={String(days)} onChange={(e) => setQuery({ role: roleFilter, days: e.target.value })}>
              <option value="7">Last 7 days</option>
              <option value="30">Last 30 days</option>
              <option value="60">Last 60 days</option>
              <option value="90">Last 90 days</option>
              <option value="180">Last 6 months</option>
              <option value="365">Last year</option>
            </Select>
          </div>
        </div>
        <Button variant="secondary" onClick={exportCsv}>
          <Download className="h-4 w-4" /> Export CSV
        </Button>
      </div>

      {/* ----- per-role totals strip ----- */}
      <div className="mb-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        {roles.map((role) => {
          const list = byRole.get(role) ?? [];
          if (list.length === 0 && roleFilter !== role) return null;
          const totalOcc = list.reduce((s, r) => s + r.occurrences, 0);
          const totalPatrols = list.reduce((s, r) => s + r.patrols, 0);
          const totalShiftH = list.reduce((s, r) => s + r.shift_minutes, 0) / 60;
          return (
            <Card key={role} className="p-3">
              <div className="flex items-center gap-2">
                <Badge color={ROLE_COLOR[role]}>{ROLE_LABELS[role]}</Badge>
                <span className="text-xs text-[hsl(var(--muted))]">{list.length} people</span>
              </div>
              <div className="mt-2 grid grid-cols-3 gap-1 text-center">
                <Mini label="Occ" value={totalOcc} />
                <Mini label="Patrols" value={totalPatrols} />
                <Mini label="Hours" value={Math.round(totalShiftH * 10) / 10} />
              </div>
            </Card>
          );
        })}
      </div>

      {/* ----- table ----- */}
      <Card className="p-4">
        <div className="mb-2 flex items-center justify-between">
          <p className="text-xs text-[hsl(var(--muted))]">
            {rows.length} {rows.length === 1 ? 'user' : 'users'}
          </p>
          <div className="flex items-center gap-2 text-xs">
            <span className="text-[hsl(var(--muted))]">Sort by</span>
            <Select value={String(sortBy)} onChange={(e) => setSortBy(e.target.value as keyof UserStats)} className="w-auto">
              <option value="full_name">Name</option>
              <option value="occurrences">Occurrences logged</option>
              <option value="patrols">Patrols</option>
              <option value="scans">Scans</option>
              <option value="shift_minutes">Shift hours</option>
              <option value="acknowledgements">Acknowledgements</option>
              <option value="tasks_open">Open tasks</option>
            </Select>
          </div>
        </div>

        <Table>
          <THead>
            <TR>
              <TH>Name</TH><TH>Role</TH><TH>Site</TH>
              <TH>Occ</TH><TH>Open / Closed</TH>
              <TH>Patrols</TH><TH>Scans</TH>
              <TH>Shifts (h)</TH>
              <TH>Acks</TH><TH>Tasks</TH>
            </TR>
          </THead>
          <TBody>
            {sorted.map((r) => (
              <TR key={r.user_id}>
                <TD>
                  <div className="font-medium">{r.full_name ?? '—'}</div>
                  <div className="text-[11px] text-[hsl(var(--muted))]">{r.email}</div>
                </TD>
                <TD>
                  <div className="flex flex-wrap gap-1">
                    {r.roles.map((role, idx) => (
                      <Badge key={role} color={idx === 0 ? '#667eea' : '#8b5cf6'}>
                        {ROLE_LABELS[role]}
                      </Badge>
                    ))}
                  </div>
                </TD>
                <TD className="text-sm">{r.site_name ?? '—'}</TD>
                <TD className="font-semibold">{r.occurrences}</TD>
                <TD className="text-xs">
                  <span className="text-amber-600">{r.occurrences_open}</span>
                  {' / '}
                  <span className="text-green-700">{r.occurrences_closed}</span>
                </TD>
                <TD>{r.patrols}</TD>
                <TD>{r.scans}</TD>
                <TD>{Math.round((r.shift_minutes / 60) * 10) / 10}</TD>
                <TD>{r.acknowledgements}</TD>
                <TD className="text-xs">
                  <span className="text-blue-600">{r.tasks_open}</span>
                  {' / '}
                  <span className="text-green-700">{r.tasks_done}</span>
                </TD>
              </TR>
            ))}
            {sorted.length === 0 && (
              <TR><TD colSpan={10} className="py-8 text-center text-[hsl(var(--muted))]">
                No users in scope. Try a different role or period.
              </TD></TR>
            )}
          </TBody>
        </Table>

        <p className="mt-3 text-xs text-[hsl(var(--muted))]">
          Click a name (coming soon) for a per-user activity timeline. Counts include all activity inside the selected window.
        </p>
      </Card>
    </>
  );
}

const ROLE_COLOR: Record<AppRole, string> = {
  super_user: '#dc2626',
  admin: '#8b5cf6',
  manager: '#667eea',
  control_room: '#0ea5e9',
  supervisor: '#14b8a6',
  guard: '#16a34a',
};

function Mini({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <div className="text-base font-bold">{value}</div>
      <div className="text-[10px] uppercase text-[hsl(var(--muted))]">{label}</div>
    </div>
  );
}

// keep Link import used
void Link;
