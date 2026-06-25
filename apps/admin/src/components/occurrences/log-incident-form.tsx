'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  AlertCircle, AlertTriangle, CheckCircle2, ClipboardList, FileText,
  Info, Loader2, MapPin, RotateCcw, Send, ShieldAlert, UserPlus,
} from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { Button } from '@/components/ui/button';
import { Input, Textarea, Select, Label } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { GradientSection } from '@/components/ui/gradient-section';
import { OcrDropzone } from './ocr-dropzone';
import {
  SEVERITIES, SEVERITY_LABELS, SEVERITY_COLORS, SLA_CONFIG, ROLE_LABELS,
  mergeIncidentCategories, mergeIncidentSubcategories, mergeIncidentTypes,
  type Profile, type Site, type SeverityLevel, type AppRole,
  type OrgIncidentType, type OrgIncidentCategory, type OrgIncidentSubcategory,
} from '@digilog/shared';

// Special-case subcategory + type used by the "Log management reports"
// capability. Picking the subcategory locks the type to MGMT_REPORT_TYPE so
// reviewers know it's a management report at a glance.
const MGMT_REPORT_SUBCATEGORY = 'Management Reports';
const MGMT_REPORT_TYPE = 'Reports';

interface Assignee { id: string; name: string; role: string; jobTitle?: string | null }

const EMERGENCY_OPTIONS = ['Police', 'Fire', 'Medical', 'Private Security', 'Other'] as const;

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
  // Live "now" — ticks every second. Used both as the visible running clock
  // (so users see the system recording the time as it happens) and as the
  // value stamped onto the record at submit. Admins can manually back-date
  // an incident via the override field; everyone else is locked to "now".
  const [now, setNow] = useState(() => new Date());
  const [override, setOverride] = useState<string>('');
  const canBackdate = profile.role === 'admin' || profile.role === 'super_user';
  const [siteId, setSiteId] = useState(profile.site_id ?? '');
  const [reportedBy, setReportedBy] = useState(profile.full_name ?? profile.email ?? '');
  const [assignedTo, setAssignedTo] = useState<string>('');
  // Operational details — all optional, mirroring legacy occurrence fields
  // so reviewers can answer "was it active?", "what CCTV exists?", "who was
  // dispatched?" without opening a separate report.
  const [statusIndicator, setStatusIndicator] = useState<'' | 'active' | 'inactive'>('');
  const [cctvAvailable, setCctvAvailable] = useState<boolean | null>(null);
  const [cctvTimes, setCctvTimes] = useState('');
  const [emergencyServices, setEmergencyServices] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [orgTypes, setOrgTypes] = useState<OrgIncidentType[]>([]);
  const [orgCategories, setOrgCategories] = useState<OrgIncidentCategory[]>([]);
  const [orgSubcategories, setOrgSubcategories] = useState<OrgIncidentSubcategory[]>([]);

  // Tick the running clock every second so the displayed "incident time" is
  // always the real now-time. Stops re-rendering the whole tree by isolating
  // the dependency to a single setNow call.
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

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
  const subcategoryOptions = useMemo(() => {
    const base = mergeIncidentSubcategories(category, orgSubcategories);
    if (!canLogManagementReport || !category) return base;
    if (base.some((s) => s.toLowerCase() === MGMT_REPORT_SUBCATEGORY.toLowerCase())) return base;
    return [...base, MGMT_REPORT_SUBCATEGORY];
  }, [category, orgSubcategories, canLogManagementReport]);
  const typeOptions = useMemo(() => {
    if (subcategory === MGMT_REPORT_SUBCATEGORY) return [MGMT_REPORT_TYPE];
    return mergeIncidentTypes(category, subcategory, orgTypes);
  }, [category, subcategory, orgTypes]);
  const isMgmtReport = subcategory === MGMT_REPORT_SUBCATEGORY;

  function onCategoryChange(c: string) { setCategory(c); setSubcategory(''); setType(''); }
  function onSubcategoryChange(s: string) {
    setSubcategory(s);
    setType(s === MGMT_REPORT_SUBCATEGORY ? MGMT_REPORT_TYPE : '');
  }

  function reset() {
    setCategory(''); setSubcategory(''); setType(''); setDescription('');
    setSeverity('medium'); setAssignedTo('');
    setOverride('');
    setStatusIndicator(''); setCctvAvailable(null); setCctvTimes('');
    setEmergencyServices([]);
    setOk(null); setError(null);
  }

  function toggleEmergency(s: string) {
    setEmergencyServices((cur) => cur.includes(s) ? cur.filter((x) => x !== s) : [...cur, s]);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null); setOk(null);
    if (!category) { setError('Pick a category.'); return; }
    if (!subcategory) { setError('Pick a sub-category.'); return; }
    if (!type) { setError('Pick the specific type.'); return; }
    if (!description) { setError('Fill in all required fields.'); return; }
    setSaving(true);

    // Stamp the incident time at the exact moment Submit fires (or use the
    // admin's back-dated override). This is the spec from the user — the
    // running clock locks in only when the user commits.
    const incidentAt = (canBackdate && override)
      ? new Date(override).toISOString()
      : new Date().toISOString();

    const supabase = createClient();
    const siteName = sites.find((s) => s.id === siteId)?.name ?? null;
    const assignee = assignees.find((a) => a.id === assignedTo) ?? null;

    const insertPayload: Record<string, unknown> = {
      occurrence_type: type,
      category,
      subcategory,
      severity,
      description: description.trim(),
      incident_at: incidentAt,
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
    // Operational details — only attach the ones the user actually answered.
    if (statusIndicator) insertPayload.status_indicator = statusIndicator;
    if (cctvAvailable !== null) insertPayload.cctv_available = cctvAvailable;
    if (cctvTimes.trim()) insertPayload.cctv_times = cctvTimes.trim();
    if (emergencyServices.length) insertPayload.emergency_services = emergencyServices;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error: insErr } = await (supabase as any)
      .from('occurrences')
      .insert(insertPayload)
      .select('ob_number')
      .single();

    setSaving(false);
    if (insErr) { setError(insErr.message); return; }
    setOk(`Occurrence ${data?.ob_number} logged successfully.`);
    reset();
    router.refresh();
  }

  const sla = SLA_CONFIG[severity];
  const selectedSite = sites.find((s) => s.id === siteId) ?? null;
  const selectedAssignee = assignees.find((a) => a.id === assignedTo) ?? null;
  const charCount = description.length;
  // Progress is informational only — the submit button is no longer gated on
  // it. The "needs 10 chars" rule was overly strict for quick management-
  // report logs where the title + classification carry most of the meaning.
  const progressPct = (() => {
    let done = 0;
    const total = 5;
    if (category) done++;
    if (subcategory) done++;
    if (type) done++;
    if (siteId) done++;
    if (description.trim().length > 0) done++;
    return Math.round((done / total) * 100);
  })();

  return (
    <form onSubmit={submit} className="grid grid-cols-1 gap-5 lg:grid-cols-3 xl:grid-cols-12">
      {/* ─────────────── MAIN COLUMN ─────────────── */}
      <div className="space-y-5 lg:col-span-2 xl:col-span-8">

        {/* 1. Classification */}
        <GradientSection title="Incident Classification" icon="ClipboardList" tone="brand"
          subtitle="What happened and how urgent is it?">
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
              <Select value={subcategory} onChange={(e) => onSubcategoryChange(e.target.value)} disabled={!category} required>
                <option value="">{category ? 'Select…' : 'Pick a category first'}</option>
                {subcategoryOptions.map((s) => <option key={s} value={s}>{s}</option>)}
              </Select>
            </div>
            <div>
              <Label>Specific Type *{isMgmtReport && ' (locked)'}</Label>
              <Select value={type} onChange={(e) => setType(e.target.value)} disabled={!subcategory || isMgmtReport} required>
                <option value="">{subcategory ? 'Select…' : 'Pick a sub-category first'}</option>
                {typeOptions.map((t) => <option key={t} value={t}>{t}</option>)}
              </Select>
            </div>
          </div>

          {/* Severity as a touch-friendly chip row, not a select — lets users
              compare options at a glance and matches mobile UX. */}
          <div className="mt-5">
            <Label>Severity *</Label>
            <div className="mt-1 grid grid-cols-2 gap-2 sm:grid-cols-4">
              {SEVERITIES.map((s) => {
                const on = severity === s;
                const color = SEVERITY_COLORS[s];
                return (
                  <button
                    key={s}
                    type="button"
                    onClick={() => setSeverity(s)}
                    className="flex items-center justify-center gap-2 rounded-xl border-2 p-3 text-sm font-semibold transition"
                    style={on
                      ? { background: color, borderColor: color, color: '#fff', boxShadow: `0 4px 14px ${color}55` }
                      : { borderColor: `${color}55`, color }}
                  >
                    <span className="h-2 w-2 rounded-full" style={{ background: on ? '#fff' : color }} />
                    {SEVERITY_LABELS[s]}
                  </button>
                );
              })}
            </div>
          </div>
        </GradientSection>

        {/* 2. When & Where */}
        <GradientSection title="When & Where" icon="MapPin" tone="sky"
          subtitle="Site of the incident and incident time">
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
              {/* Read-only running clock for non-admins. Admins get the
                  back-date override below. */}
              <div className="flex h-10 items-center gap-2 rounded-lg border bg-slate-50 px-3 font-mono text-sm dark:bg-slate-900">
                <span className="relative flex h-2 w-2">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                  <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
                </span>
                {now.toLocaleString([], { dateStyle: 'medium', timeStyle: 'medium' })}
              </div>
              <p className="mt-1 text-[11px] text-[hsl(var(--muted))]">
                Recorded the moment you click <strong>Log Occurrence</strong>.
              </p>
              {canBackdate && (
                <div className="mt-2">
                  <Label className="text-xs">Admin: back-date (optional)</Label>
                  <Input
                    type="datetime-local"
                    value={override}
                    onChange={(e) => setOverride(e.target.value)}
                    max={new Date().toISOString().slice(0, 16)}
                  />
                </div>
              )}
            </div>
            <div className="sm:col-span-2">
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
          </div>
        </GradientSection>

        {/* 3. Description + OCR */}
        <GradientSection title="Description & Evidence" icon="FileText" tone="violet"
          subtitle="Tell the story — OCR a handwritten report, paste it in, or type it out">
          <div>
            <Label>Description *</Label>
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What happened? Who was involved? What did you do?"
              className="min-h-[180px]"
              required
            />
            <div className="mt-1 flex items-center justify-between text-[11px] text-[hsl(var(--muted))]">
              <span>{charCount} characters</span>
              <span>{charCount === 0 ? 'Required.' : 'OCR a written note above or type directly — both work.'}</span>
            </div>
            <div className="mt-4">
              <OcrDropzone onText={(text) => setDescription((d) => d ? `${d}\n\n${text}` : text)} />
            </div>
          </div>
        </GradientSection>

        {/* 4. Operational details — CCTV, status, emergency services. All
            optional. Mirrors the legacy occurrence fields so reviewers have
            the operational picture without opening a separate report. */}
        <GradientSection
          title="Operational details (optional)"
          icon="Radio"
          tone="amber"
          subtitle="CCTV, on-scene status, emergency services dispatched"
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <Label>Site status at the time</Label>
              <Select value={statusIndicator} onChange={(e) => setStatusIndicator(e.target.value as '' | 'active' | 'inactive')}>
                <option value="">— Not recorded —</option>
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
              </Select>
            </div>
            <div>
              <Label>CCTV available?</Label>
              <div className="mt-1 grid grid-cols-3 gap-2">
                {[
                  { val: null, label: '—' },
                  { val: true, label: 'Yes' },
                  { val: false, label: 'No' },
                ].map((opt) => {
                  const on = cctvAvailable === opt.val;
                  return (
                    <button
                      key={String(opt.val)}
                      type="button"
                      onClick={() => setCctvAvailable(opt.val)}
                      className={`rounded-lg border-2 px-3 py-2 text-sm font-semibold transition ${
                        on
                          ? 'border-amber-500 bg-amber-100 text-amber-800 dark:bg-amber-950/40 dark:text-amber-200'
                          : 'border-[hsl(var(--border))] text-[hsl(var(--muted))] hover:border-amber-200'
                      }`}
                    >
                      {opt.label}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          {cctvAvailable && (
            <div className="mt-4">
              <Label>CCTV time window</Label>
              <Input
                value={cctvTimes}
                onChange={(e) => setCctvTimes(e.target.value)}
                placeholder="e.g. 14:32 – 14:58, camera 03 (gate)"
              />
            </div>
          )}

          <div className="mt-4">
            <Label>Emergency services on scene</Label>
            <div className="mt-1 flex flex-wrap gap-2">
              {EMERGENCY_OPTIONS.map((s) => {
                const on = emergencyServices.includes(s);
                return (
                  <button
                    key={s}
                    type="button"
                    onClick={() => toggleEmergency(s)}
                    className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition ${
                      on
                        ? 'border-red-500 bg-red-100 text-red-800 dark:bg-red-950/40 dark:text-red-200'
                        : 'border-[hsl(var(--border))] text-[hsl(var(--muted))] hover:border-red-300'
                    }`}
                  >
                    {on ? '✓ ' : ''}{s}
                  </button>
                );
              })}
            </div>
            {emergencyServices.length === 0 && (
              <p className="mt-1 text-[11px] text-[hsl(var(--muted))]">Tap any that attended. Leave blank if none.</p>
            )}
          </div>
        </GradientSection>

        {/* 5. Assignment — only renders when the caller has the capability */}
        {canAssign && (
          <GradientSection title="Assignment (optional)" icon="UserPlus" tone="green"
            subtitle="Hand this incident to a specific person on duty">
            <div>
              <Label>Assign To</Label>
              <Select value={assignedTo} onChange={(e) => setAssignedTo(e.target.value)}>
                <option value="">— Leave unassigned —</option>
                {assignees.map((a) => (
                  <option key={a.id} value={a.id}>
                    {/* Job title sits between name and role so the line reads
                        "Name · Job title · Role" — matches Udeen's spec. */}
                    {a.name}{a.jobTitle ? ` · ${a.jobTitle}` : ''} · {ROLE_LABELS[a.role as AppRole] ?? a.role}
                  </option>
                ))}
              </Select>
              {assignees.length === 0 && (
                <p className="mt-1 text-xs text-[hsl(var(--muted))]">No assignable users in scope.</p>
              )}
              {selectedAssignee && (
                <div className="mt-3 flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-300">
                  <CheckCircle2 className="h-4 w-4 shrink-0" />
                  Will be assigned to <strong>{selectedAssignee.name}</strong>
                  <Badge color="#16a34a">{ROLE_LABELS[selectedAssignee.role as AppRole] ?? selectedAssignee.role}</Badge>
                </div>
              )}
            </div>
          </GradientSection>
        )}

        {/* Inline messages */}
        {error && (
          <div className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}
        {ok && (
          <div className="flex items-start gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-300">
            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{ok}</span>
          </div>
        )}
      </div>

      {/* ─────────────── CONTEXT SIDEBAR ─────────────── */}
      <aside className="space-y-4 lg:col-span-1 xl:col-span-4">
        <div className="lg:sticky lg:top-20 space-y-4">

          {/* Form progress */}
          <div className="rounded-2xl border bg-[hsl(var(--surface))] p-5 shadow-sm">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-sm font-semibold">Form readiness</h3>
              <Badge color={progressPct === 100 ? '#16a34a' : '#667eea'}>{progressPct}%</Badge>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
              <div
                className="h-full rounded-full transition-all"
                style={{
                  width: `${progressPct}%`,
                  background: progressPct === 100
                    ? 'linear-gradient(90deg, #10b981, #16a34a)'
                    : 'linear-gradient(90deg, #667eea, #764ba2)',
                }}
              />
            </div>
            <p className="mt-2 text-[11px] text-[hsl(var(--muted))]">
              Five required parts: category, sub-category, type, site, description.
            </p>
          </div>

          {/* Live SLA preview */}
          <div
            className="overflow-hidden rounded-2xl text-white shadow-lg"
            style={{ background: `linear-gradient(135deg, ${SEVERITY_COLORS[severity]} 0%, ${SEVERITY_COLORS[severity]}cc 100%)` }}
          >
            <div className="p-5">
              <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-white/85">
                <ShieldAlert className="h-4 w-4" />
                SLA preview · {SEVERITY_LABELS[severity]}
              </div>
              <div className="mt-3 grid grid-cols-2 gap-3">
                <div>
                  <p className="text-3xl font-extrabold leading-none">{sla.resolveHours}h</p>
                  <p className="mt-1 text-[11px] uppercase tracking-wider text-white/80">Resolve within</p>
                </div>
                <div>
                  <p className="text-3xl font-extrabold leading-none">
                    {sla.updateIntervalMinutes >= 60 ? `${sla.updateIntervalMinutes / 60}h` : `${sla.updateIntervalMinutes}m`}
                  </p>
                  <p className="mt-1 text-[11px] uppercase tracking-wider text-white/80">Update every</p>
                </div>
              </div>
            </div>
          </div>

          {/* Live summary preview */}
          <div className="rounded-2xl border bg-[hsl(var(--surface))] p-5 shadow-sm">
            <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold">
              <ClipboardList className="h-4 w-4 text-brand" /> Summary
            </h3>
            <dl className="space-y-2 text-sm">
              <SummaryRow label="Classification" value={
                category && subcategory && type
                  ? <span>{category} <span className="text-[hsl(var(--muted))]">·</span> {subcategory} <span className="text-[hsl(var(--muted))]">·</span> <strong>{type}</strong></span>
                  : <em className="text-[hsl(var(--muted))]">Pick category → sub-category → type</em>
              } />
              <SummaryRow
                label="Severity"
                value={<Badge color={SEVERITY_COLORS[severity]}>{SEVERITY_LABELS[severity]}</Badge>}
              />
              <SummaryRow label="Site" value={
                selectedSite
                  ? <span className="inline-flex items-center gap-1"><MapPin className="h-3.5 w-3.5 text-sky-500" />{selectedSite.name}</span>
                  : <em className="text-[hsl(var(--muted))]">Select a site</em>
              } />
              <SummaryRow label="Incident time" value={
                <span className="font-mono">
                  {(canBackdate && override
                    ? new Date(override)
                    : now
                  ).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })}
                </span>
              } />
              <SummaryRow label="Reported by" value={reportedBy || '—'} />
              {canAssign && (
                <SummaryRow
                  label="Assigned to"
                  value={selectedAssignee
                    ? <span>{selectedAssignee.name}</span>
                    : <em className="text-[hsl(var(--muted))]">Unassigned</em>}
                />
              )}
            </dl>
          </div>

          {/* Helpful tips */}
          <div className="rounded-2xl border border-sky-200 bg-sky-50 p-4 text-xs text-sky-900 dark:border-sky-900 dark:bg-sky-950/30 dark:text-sky-200">
            <div className="mb-1 flex items-center gap-1.5 font-semibold">
              <Info className="h-4 w-4" /> Tips
            </div>
            <ul className="space-y-1 pl-5 list-disc marker:text-sky-500">
              <li>Use Critical / High only for genuine safety events — they shorten SLAs.</li>
              <li>OCR a written report to fast-track typing.</li>
              {canLogManagementReport && (
                <li>Pick the <strong>Management Reports</strong> sub-category for monthly write-ups.</li>
              )}
              {canAssign && <li>Assigning routes a push notification to the recipient.</li>}
            </ul>
          </div>
        </div>
      </aside>

      {/* ─────────────── STICKY ACTION BAR ─────────────── */}
      <div className="-mx-4 mt-2 lg:col-span-3 xl:col-span-12 lg:-mx-6">
        <div className="sticky bottom-0 z-10 border-t bg-[hsl(var(--surface))]/95 px-4 py-3 backdrop-blur lg:px-6">
          <div className="mx-auto flex max-w-[1600px] flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2 text-xs text-[hsl(var(--muted))]">
              {progressPct < 100 ? (
                <>
                  <AlertTriangle className="h-4 w-4 text-amber-500" />
                  {5 - Math.round(progressPct / 20)} field{5 - Math.round(progressPct / 20) === 1 ? '' : 's'} remaining
                </>
              ) : (
                <>
                  <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                  Ready to log
                </>
              )}
            </div>
            <div className="flex items-center gap-2">
              <Button type="button" variant="secondary" onClick={reset} disabled={saving}>
                <RotateCcw className="h-4 w-4" /> Reset
              </Button>
              <Button type="submit" disabled={saving}>
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                Log Occurrence
              </Button>
            </div>
          </div>
        </div>
      </div>
    </form>
  );
}

function SummaryRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3 text-sm">
      <dt className="shrink-0 text-[11px] font-semibold uppercase tracking-wider text-[hsl(var(--muted))]">{label}</dt>
      <dd className="min-w-0 text-right">{value}</dd>
    </div>
  );
}
