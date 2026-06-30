'use client';

import { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { Download, Search, Calendar, User, Filter, RotateCcw, X } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { PageHeader } from '@/components/page-header';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { GradientSection } from '@/components/ui/gradient-section';
import { Button } from '@/components/ui/button';
import { Input, Label } from '@/components/ui/input';
import { Table, THead, TBody, TR, TH, TD } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { usePagedRows, Pager } from '@/components/ui/pager';
import { ROLE_LABELS, type AppRole } from '@digilog/shared';
import { formatDateTime } from '@/lib/utils';

interface AuditRow {
  id: number;
  org_id: string | null;
  actor_id: string | null;
  actor_name: string | null;
  actor_role: AppRole | null;
  action: string;
  target_table: string | null;
  target_id: string | null;
  summary: string | null;
  metadata: Record<string, unknown> | null;
  ip_address: string | null;
  created_at: string;
}

const AUDIT_BATCH_SIZE = 1000;

const ACTION_COLORS: Record<string, string> = {
  'user.create': '#16a34a',
  'user.update': '#3b82f6',
  'user.delete': '#dc2626',
  'pin.lockout': '#dc2626',
  'pin.admin_reset': '#ea580c',
  'pin.self_change': '#16a34a',
  'auth.pin_login': '#16a34a',
  'profile.update': '#3b82f6',
  'profile.create': '#16a34a',
  'org.create': '#16a34a',
  'org.suspend': '#dc2626',
  'org.activate': '#16a34a',
  'org.plan_change': '#8b5cf6',
  'task.create': '#16a34a',
  'task.assign': '#3b82f6',
  'task.complete': '#16a34a',
  'patrol.start': '#16a34a',
  'patrol.end': '#dc2626',
  'occurrence.create': '#16a34a',
  'occurrence.update': '#3b82f6',
  'occurrence.close': '#8b5cf6',
};

const ACTION_OPTIONS = [
  { value: '', label: 'All Actions' },
  { value: 'user.create', label: 'User Created' },
  { value: 'user.update', label: 'User Updated' },
  { value: 'user.delete', label: 'User Deleted' },
  { value: 'profile.update', label: 'Profile Updated' },
  { value: 'pin.lockout', label: 'PIN Lockout' },
  { value: 'pin.admin_reset', label: 'PIN Admin Reset' },
  { value: 'org.create', label: 'Organization Created' },
  { value: 'org.suspend', label: 'Organization Suspended' },
  { value: 'org.activate', label: 'Organization Activated' },
  { value: 'task.create', label: 'Task Created' },
  { value: 'task.assign', label: 'Task Assigned' },
  { value: 'patrol.start', label: 'Patrol Started' },
  { value: 'patrol.end', label: 'Patrol Ended' },
  { value: 'occurrence.create', label: 'Occurrence Created' },
  { value: 'occurrence.update', label: 'Occurrence Updated' },
];

function colorFor(action: string): string {
  return ACTION_COLORS[action] ?? '#64748b';
}

export default function AuditLogPage() {
  const router = useRouter();
  const [rows, setRows] = useState<AuditRow[]>([]);
  const [loading, setLoading] = useState(true);
  
  // Filters
  const [search, setSearch] = useState('');
  const [actionFilter, setActionFilter] = useState('');
  const [actorFilter, setActorFilter] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  // Fetch data
  useEffect(() => {
    async function load() {
      const supabase = createClient();
      const allRows: AuditRow[] = [];
      let from = 0;

      while (true) {
        const { data, error } = await (supabase as any)
          .from('audit_log')
          // Lean column set — the heavy `metadata` jsonb isn't shown in the
          // table, and skipping it keeps the (potentially 10k+ row) payload small.
          .select('id, created_at, action, actor_id, actor_name, actor_role, summary, target_table, target_id, ip_address')
          .order('created_at', { ascending: false })
          .range(from, from + AUDIT_BATCH_SIZE - 1);

        if (error) {
          console.error('Failed to load audit log batch', error);
          break;
        }

        const batch = (data ?? []) as AuditRow[];
        allRows.push(...batch);

        if (batch.length < AUDIT_BATCH_SIZE) break;
        from += AUDIT_BATCH_SIZE;
      }

      setRows(allRows);
      setLoading(false);
    }
    load();
  }, []);

  // Get unique actors for filter
  const uniqueActors = useMemo(() => {
    const actors = new Map<string, string>();
    rows.forEach(r => {
      if (r.actor_id && r.actor_name) {
        actors.set(r.actor_id, r.actor_name);
      }
    });
    return Array.from(actors.entries()).sort((a, b) => a[1].localeCompare(b[1]));
  }, [rows]);

  // Apply filters
  const filteredRows = useMemo(() => {
    return rows.filter(r => {
      // Search filter
      if (search) {
        const hay = `${r.action} ${r.actor_name} ${r.summary} ${r.target_table} ${r.target_id}`.toLowerCase();
        if (!hay.includes(search.toLowerCase())) return false;
      }
      
      // Action filter
      if (actionFilter && r.action !== actionFilter) return false;
      
      // Actor filter
      if (actorFilter && r.actor_id !== actorFilter) return false;
      
      // Date range
      const rowDate = new Date(r.created_at);
      if (dateFrom && rowDate < new Date(dateFrom)) return false;
      if (dateTo && rowDate > new Date(dateTo + 'T23:59:59')) return false;
      
      return true;
    });
  }, [rows, search, actionFilter, actorFilter, dateFrom, dateTo]);

  // Paginate the filtered set so the DOM only ever holds one page (renders fast
  // even with 10k+ rows loaded).
  const pg = usePagedRows(filteredRows, 50);
  // Jump back to page 1 whenever a filter changes.
  useEffect(() => {
    pg.setPage(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, actionFilter, actorFilter, dateFrom, dateTo]);

  // Clear all filters
  function clearFilters() {
    setSearch('');
    setActionFilter('');
    setActorFilter('');
    setDateFrom('');
    setDateTo('');
  }

  // Export to CSV
  function exportCSV() {
    const headers = ['When', 'Action', 'Actor', 'Role', 'Summary', 'Target', 'IP'];
    const csv = [
      headers.join(','),
      ...filteredRows.map(r => [
        new Date(r.created_at).toISOString(),
        r.action,
        r.actor_name || '—',
        r.actor_role || '—',
        `"${(r.summary || '').replace(/"/g, '""')}"`,
        r.target_table ? `${r.target_table}#${r.target_id?.slice(0, 8) || '?'}` : '—',
        r.ip_address || '—'
      ].join(','))
    ].join('\n');
    
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `audit-log-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    window.URL.revokeObjectURL(url);
  }

  return (
    <>
      <PageHeader
        title="Audit Log"
        description="Immutable record of sensitive actions — user creation, role changes, PIN resets, org changes."
      />

      {/* Filters */}
      <Card className="mb-4 p-4">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <div>
            <Label className="flex items-center gap-2">
              <Search className="h-4 w-4" />
              Search
            </Label>
            <Input
              placeholder="Search actions, actors, summaries..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="mt-1"
            />
          </div>
          <div>
            <Label className="flex items-center gap-2">
              <Filter className="h-4 w-4" />
              Action
            </Label>
            <select
              value={actionFilter}
              onChange={(e) => setActionFilter(e.target.value)}
              className="w-full mt-1 h-10 rounded-md border border-input bg-background px-3 text-sm"
            >
              {ACTION_OPTIONS.map(opt => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </div>
          <div>
            <Label className="flex items-center gap-2">
              <User className="h-4 w-4" />
              Actor
            </Label>
            <select
              value={actorFilter}
              onChange={(e) => setActorFilter(e.target.value)}
              className="w-full mt-1 h-10 rounded-md border border-input bg-background px-3 text-sm"
            >
              <option value="">All Actors</option>
              {uniqueActors.map(([id, name]) => (
                <option key={id} value={id}>{name}</option>
              ))}
            </select>
          </div>
          <div className="flex gap-2">
            <div className="flex-1">
              <Label className="flex items-center gap-2">
                <Calendar className="h-4 w-4" />
                From
              </Label>
              <Input
                type="date"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
                className="mt-1"
              />
            </div>
            <div className="flex-1">
              <Label className="flex items-center gap-2">
                <Calendar className="h-4 w-4" />
                To
              </Label>
              <Input
                type="date"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
                className="mt-1"
              />
            </div>
          </div>
        </div>
        <div className="flex justify-between items-center mt-4 pt-4 border-t">
          <span className="text-sm text-muted-foreground">
            {loading ? 'Loading audit log…' : `Showing ${filteredRows.length} of ${rows.length} entries`}
          </span>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={clearFilters}>
              <RotateCcw className="h-4 w-4 mr-2" />
              Clear
            </Button>
            <Button variant="outline" size="sm" onClick={exportCSV}>
              <Download className="h-4 w-4 mr-2" />
              Export CSV
            </Button>
          </div>
        </div>
      </Card>

      <GradientSection title="Audit Trail" subtitle="Immutable record of sensitive actions" icon="ScrollText" tone="slate">
        <Table>
          <THead>
            <TR>
              <TH>When</TH>
              <TH>Action</TH>
              <TH>Actor</TH>
              <TH>Summary</TH>
              <TH>Target</TH>
              <TH>IP</TH>
            </TR>
          </THead>
          <TBody>
            {loading && (
              <TR><TD colSpan={6} className="py-8 text-center text-muted-foreground">
                Loading audit log…
              </TD></TR>
            )}
            {pg.pageRows.map((r) => {
              const c = colorFor(r.action);
              return (
              <TR
                key={r.id}
                style={{
                  borderLeft: `5px solid ${c}`,
                  background: `linear-gradient(90deg, ${c}33 0%, ${c}14 100%)`,
                }}
              >
                <TD className="whitespace-nowrap text-xs text-muted-foreground">
                  {formatDateTime(r.created_at)}
                </TD>
                <TD>
                  <Badge style={{ backgroundColor: colorFor(r.action) }}>{r.action}</Badge>
                </TD>
                <TD>
                  <div className="text-sm">{r.actor_name ?? '—'}</div>
                  {r.actor_role && (
                    <div className="text-[11px] text-muted-foreground">
                      {ROLE_LABELS[r.actor_role]}
                    </div>
                  )}
                </TD>
                <TD className="max-w-md text-sm">{r.summary ?? '—'}</TD>
                <TD className="text-xs">
                  {r.target_table ? `${r.target_table}#${r.target_id?.slice(0, 8) ?? '?'}` : '—'}
                </TD>
                <TD className="font-mono text-xs">{r.ip_address ?? '—'}</TD>
              </TR>
              );
            })}
            {!loading && filteredRows.length === 0 && (
              <TR><TD colSpan={6} className="py-8 text-center text-muted-foreground">
                No audit events recorded.
              </TD></TR>
            )}
          </TBody>
        </Table>
        <Pager {...pg} />
      </GradientSection>
    </>
  );
}
