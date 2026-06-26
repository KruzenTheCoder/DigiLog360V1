'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Download, Search, Calendar, User, Filter, RotateCcw, X } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { PageHeader } from '@/components/page-header';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Table, THead, TBody, TR, TH, TD } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
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
      const { data } = await (supabase as any)
        .from('audit_log')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(1000);
      
      setRows((data ?? []) as AuditRow[]);
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
        `