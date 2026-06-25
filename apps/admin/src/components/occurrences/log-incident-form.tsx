'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input, Textarea, Select, Label } from '@/components/ui/input';
import { OcrDropzone } from './ocr-dropzone';
import {
  SEVERITIES, SEVERITY_LABELS, SLA_CONFIG, ROLE_LABELS,
  mergeIncidentCategories, mergeIncidentSubcategories, mergeIncidentTypes,
  type Profile, type Site, type SeverityLevel, type AppRole,
  type OrgIncidentType, type OrgIncidentCategory, type OrgIncidentSubcategory,
} from '@digilog/shared';

// Special-case subcategory + type used by the "Log management reports"
// capability. Picking the subcategory locks the type to MGMT_REPORT_TYPE so
// reviewers know it's a management report at a glance.
const MGMT_REPORT_SUBCATEGORY = 'Management Reports';
const MGMT_REPORT_TYPE = 'Reports';

interface Assignee { id: string; name: string; role: string }

export function LogIncidentForm({
  profile, sites, reporters, assignees = [],
  canAssign = false, canLogManagementReport = false,
}: {
  profile: Profile;
  sites: Site[];
  reporters: { id: string; name: string }[];
  assignees?: Assignee[];
  canAssign?: boolean;
  canLogManagementReport?: boolean;
}) {
  const router = useRouter();
  const [category, setCategory] = useState('');
  const [subcategory, setSubcategory] = useState('');
  const [type, setType] = useState('');
  const [severity, setSeverity] = useState<SeverityLevel>('medium');
  const [description, setDescription] = useState('');
  const [incidentAt, setIncidentAt] = useState(() => new Date().toISOString().slice(0, 16));
  const [siteId, setSiteId] = useState(profile.site_id ?? '');
  const [reportedBy, setReportedBy] = useState(profile.full_name ?? profile.email ?? '');
  const [assignedTo, setAssignedTo] = useState<string>('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [orgTypes, setOrgTypes] = useState<OrgIncidentType[]>([]);
  const [orgCategories, setOrgCategories] = useState<OrgIncidentCategory[]>([]);
  const [orgSubcategories, setOrgSubcategories] = useState<OrgIncidentSubcategory[]>([]);

  // Load the org's custom taxonomy (categories + sub-categories + types).
  useEffect(() => {
    const supabase = createClient();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sb: any = supabase;
    sb.from('org_occurrence_types').select('name, category, subcategory, is_active, sort_order')
      .then(({ data }: { data: OrgIncidentType[] | null }) => setOrgTypes(data ?? []));
    sb.from('org_incident_categories').select('name, is_active, sort_order')
      .then(({ data }: { data: OrgIncidentCategory[] | null }) => setOrgCategories(data ?? []));
    sb.from('org_incident_subcategories').select('category, name, is_active, sort_order')
      .then(({ data }: { data: OrgIncidentSubcategory[] | null }) => setOrgSubcategories(data ?? []));
  }, []);

  const categoryOptions = mergeIncidentCategories(orgCategories);

  // Subcategory list — built-in + org custom + (optionally) "Management
  // Reports" injected for users with the dedicated capability. The shortcut
  // is offered under EVERY category so the user can pair it with whatever
  // category fits their report.
  const subcategoryOptions = useMemo(() => {
    const base = mergeIncidentSubcategories(category, orgSubcategories);
    if (!canLogManagementReport || !category) return base;
    if (base.some((s) => s.toLowerCase() === MGMT_REPORT_SUBCATEGORY.toLowerCase())) return base;
    return [...base, MGMT_REPORT_SUBCATEGORY];
  }, [category, orgSubcategories, canLogManagementReport]);

  // Type list — built-in + org custom. When the user picked the management-
  // report shortcut, lock the list to just "Reports" so the field is unambiguous.
  const typeOptions = useMemo(() => {
    if (subcategory === MGMT_REPORT_SUBCATEGORY) return [MGMT_REPORT_TYPE];
    return mergeIncidentTypes(category, subcategory, orgTypes);
  }, [category, subcategory, orgTypes]);

  const isMgmtReport = subcategory === MGMT_REPORT_SUBCATEGORY;

  // Reset downstream selections whenever an upstream choice changes so we
  // never submit a stale (category, subcategory, type) combination.
  function onCategoryChange(c: string) {
    setCategory(c);
    setSubcategory('');
    setType('');
  }
  function onSubcategoryChange(s: string) {
    setSubcategory(s);
    // Auto-select the only valid type for the management-report shortcut.
    setType(s === MGMT_REPORT_SUBCATEGORY ? MGMT_REPORT_TYPE : '');
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null); setOk(null);
    if (!category) { setError('Pick a category.'); return; }
    if (!subcategory) { setError('Pick a sub-category.'); return; }
    if (!type) { setError('Pick the specific type.'); return; }
    if (!description || !incidentAt) { setError('Fill in all required fields.'); return; }
    setSaving(true);

    const supabase = createClient();
    const siteName = sites.find((s) => s.id === siteId)?.name ?? null;
    const assignee = assignees.find((a) => a.id === assignedTo) ?? null;

    const insertPayload: Record<string, unknown> = {
      occurrence_type: type,
      category,
      subcategory,
      severity,
      description: description.trim(),
      incident_at: new Date(incidentAt).toISOString(),
      site_id: siteId || null,
      site_name: siteName,
      logged_by: profile.id,
      logged_by_name: reportedBy || profile.full_name || profile.email,
      status: 'open',
    };
    if (assignee) {
      insertPayload.assigned_to = assignee.id;
      insertPayload.assigned_to_name = assignee.name;
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error: insErr } = await (supabase as any)
      .from('occurrences')
      .insert(insertPayload)
      .select('ob_number')
      .single();

    setSaving(false);
    if (insErr) { setError(insErr.message); return; }
    setOk(`Occurrence ${data?.ob_number} logged successfully.`);
    setCategory(''); setSubcategory(''); setType(''); setDescription(''); setAssignedTo('');
    router.refresh();
  }

  const sla = SLA_CONFIG[severity];

  return (
    <Card>
      <CardContent className="pt-5">
        <form onSubmit={submit} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-3">
            <div>
              <Label>Category *</Label>
              <Select value={category} onChange={(e) => onCategoryChange(e.target.value)} required>
                <option value="">Select…</option>
                {categoryOptions.map((c) => <option key={c} value={c}>{c}</option>)}
              </Select>
            </div>
            <div>
              <Label>Sub-category *</Label>
              <Select
                value={subcategory}
                onChange={(e) => onSubcategoryChange(e.target.value)}
                disabled={!category}
                required
              >
                <option value="">{category ? 'Select…' : 'Pick a category first'}</option>
                {subcategoryOptions.map((s) => <option key={s} value={s}>{s}</option>)}
              </Select>
            </div>
            <div>
              <Label>Specific Type *{isMgmtReport && ' (locked)'}</Label>
              <Select
                value={type}
                onChange={(e) => setType(e.target.value)}
                disabled={!subcategory || isMgmtReport}
                required
              >
                <option value="">{subcategory ? 'Select…' : 'Pick a sub-category first'}</option>
                {typeOptions.map((t) => <option key={t} value={t}>{t}</option>)}
              </Select>
            </div>
          </div>

          <div>
            <Label>Severity *</Label>
            <Select value={severity} onChange={(e) => setSeverity(e.target.value as SeverityLevel)}>
              {SEVERITIES.map((s) => <option key={s} value={s}>{SEVERITY_LABELS[s]}</option>)}
            </Select>
          </div>

          <div className="rounded-lg bg-brand/5 px-3 py-2 text-xs text-brand">
            SLA: resolve within <strong>{sla.resolveHours}h</strong>, update every{' '}
            <strong>{sla.updateIntervalMinutes >= 60 ? `${sla.updateIntervalMinutes / 60}h` : `${sla.updateIntervalMinutes}m`}</strong>.
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <Label>Site *</Label>
              <Select value={siteId} onChange={(e) => setSiteId(e.target.value)} required>
                <option value="">Select site…</option>
                {sites.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </Select>
            </div>
            <div>
              <Label>Incident Date &amp; Time *</Label>
              <Input type="datetime-local" value={incidentAt} onChange={(e) => setIncidentAt(e.target.value)} required />
            </div>
          </div>

          <div className={canAssign ? 'grid gap-4 sm:grid-cols-2' : ''}>
            <div>
              <Label>Reported By</Label>
              {reporters.length > 0 ? (
                <Select value={reportedBy} onChange={(e) => setReportedBy(e.target.value)}>
                  <option value={profile.full_name ?? profile.email ?? ''}>{profile.full_name ?? profile.email} (me)</option>
                  {reporters.map((r) => <option key={r.id} value={r.name}>{r.name}</option>)}
                </Select>
              ) : (
                <Input value={reportedBy} onChange={(e) => setReportedBy(e.target.value)} />
              )}
            </div>

            {canAssign && (
              <div>
                <Label>Assign To</Label>
                <Select value={assignedTo} onChange={(e) => setAssignedTo(e.target.value)}>
                  <option value="">— Unassigned —</option>
                  {assignees.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name} · {ROLE_LABELS[a.role as AppRole] ?? a.role}
                    </option>
                  ))}
                </Select>
                {assignees.length === 0 && (
                  <p className="mt-1 text-xs text-[hsl(var(--muted))]">No assignable users in scope.</p>
                )}
              </div>
            )}
          </div>

          <div>
            <Label>Description *</Label>
            <Textarea value={description} onChange={(e) => setDescription(e.target.value)}
              placeholder="Describe what happened…" className="min-h-[120px]" required />
            <div className="mt-2">
              <OcrDropzone
                onText={(text) => setDescription((d) => d ? `${d}\n\n${text}` : text)}
              />
            </div>
          </div>

          {error && <p className="text-sm text-red-600">{error}</p>}
          {ok && <p className="rounded-lg bg-green-50 px-3 py-2 text-sm text-green-700 dark:bg-green-950/40 dark:text-green-300">{ok}</p>}

          <div className="flex justify-end">
            <Button type="submit" disabled={saving}>
              {saving && <Loader2 className="h-4 w-4 animate-spin" />} Log Occurrence
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
