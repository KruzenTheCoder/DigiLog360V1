'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input, Textarea, Select, Label } from '@/components/ui/input';
import {
  OCCURRENCE_STATUSES, STATUS_LABELS, SEVERITY_LABELS,
  type Occurrence, type OccurrenceReport, type Profile, type OccurrenceStatus,
} from '@digilog/shared';
import { formatDateTime } from '@/lib/utils';

const EMERGENCY_SERVICE_OPTIONS = ['-- None --', 'Police', 'Fire', 'Medical', 'Private Security', 'Other'] as const;
const CCTV_STATUS_OPTIONS = ['', 'Available', 'Unavailable', 'Pending Review'] as const;
const SECURE_OPTIONS = [
  { value: '', label: '-- Select Status --' },
  { value: 'yes', label: 'Yes' },
  { value: 'no', label: 'No' },
] as const;

export function ReportForm({
  occurrence,
  profile,
  existingReport,
}: {
  occurrence: Occurrence;
  profile: Profile;
  existingReport?: OccurrenceReport | null;
}) {
  const router = useRouter();
  const [form, setForm] = useState<Record<string, string>>({
    description: existingReport?.description ?? occurrence.description ?? '',
    all_areas_secure:
      existingReport?.all_areas_secure === true ? 'yes'
        : existingReport?.all_areas_secure === false ? 'no'
          : '',
    personnel: existingReport?.personnel ?? '',
    responding_officer: existingReport?.responding_officer ?? '',
    emergency_services: existingReport?.emergency_services ?? '',
    external_case: existingReport?.external_case ?? '',
    cctv: existingReport?.cctv ?? '',
    property_damage: existingReport?.property_damage ?? '',
    immediate_actions: existingReport?.immediate_actions ?? '',
    next_steps: existingReport?.next_steps ?? '',
  });
  const [status, setStatus] = useState<OccurrenceStatus>(existingReport?.status ?? 'open');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const set = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.description.trim()) { setError('Incident description is required.'); return; }
    setSaving(true); setError(null);
    const supabase = createClient();

    const { error: upErr } = await supabase.from('occurrence_reports').upsert({
      occurrence_id: occurrence.id,
      ob_number: occurrence.ob_number,
      severity: occurrence.severity,
      occurrence_type: occurrence.occurrence_type,
      incident_at: occurrence.incident_at,
      location: occurrence.site_name,
      reported_by: occurrence.logged_by_name,
      all_areas_secure:
        form.all_areas_secure === 'yes' ? true
          : form.all_areas_secure === 'no' ? false
            : null,
      description: form.description.trim(),
      personnel: form.personnel || null,
      responding_officer: form.responding_officer || null,
      emergency_services: form.emergency_services || null,
      external_case: form.external_case || null,
      cctv: form.cctv || null,
      cctv_times: existingReport?.cctv_times ?? null,
      property_damage: form.property_damage || null,
      immediate_actions: form.immediate_actions || null,
      next_steps: form.next_steps || null,
      created_by: profile.id,
      created_by_name: profile.full_name ?? profile.email,
      status,
    }, { onConflict: 'occurrence_id' });

    if (upErr) { setError(upErr.message); setSaving(false); return; }

    // Reflect the status onto the occurrence and stamp an SLA update.
    await supabase.from('occurrences')
      .update({ status, last_sla_update_at: new Date().toISOString() })
      .eq('id', occurrence.id);

    setSaving(false);
    router.push(`/occurrences/${occurrence.id}`);
    router.refresh();
  }

  return (
    <Card>
      <CardContent className="pt-5">
        <form onSubmit={submit} className="space-y-4">
          <div className="rounded-lg bg-slate-50 p-3 text-sm dark:bg-slate-800/50">
            <span className="font-semibold">{occurrence.ob_number}</span> · {occurrence.occurrence_type} ·{' '}
            {occurrence.site_name} · Reported by {occurrence.logged_by_name}
          </div>

          <section className="space-y-4 rounded-xl border p-4">
            <div>
              <h3 className="text-base font-semibold">Basic Incident Information</h3>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <Label>Occurrence Type</Label>
                <Input value={occurrence.occurrence_type ?? ''} readOnly className="bg-slate-50 dark:bg-slate-900" />
              </div>
              <div>
                <Label>All Areas Secure</Label>
                <Select value={form.all_areas_secure} onChange={(e) => set('all_areas_secure', e.target.value)}>
                  {SECURE_OPTIONS.map((opt) => <option key={opt.label} value={opt.value}>{opt.label}</option>)}
                </Select>
              </div>
              <div>
                <Label>Severity Level</Label>
                <Input value={SEVERITY_LABELS[occurrence.severity]} readOnly className="bg-slate-50 dark:bg-slate-900" />
              </div>
              <div>
                <Label>Incident Date &amp; Time</Label>
                <Input value={formatDateTime(occurrence.incident_at)} readOnly className="bg-slate-50 dark:bg-slate-900" />
              </div>
              <div>
                <Label>Location/Site</Label>
                <Input value={occurrence.site_name ?? ''} readOnly className="bg-slate-50 dark:bg-slate-900" />
              </div>
              <div>
                <Label>Reported By</Label>
                <Input value={occurrence.logged_by_name ?? ''} readOnly className="bg-slate-50 dark:bg-slate-900" />
              </div>
            </div>
          </section>

          <section className="space-y-4 rounded-xl border p-4">
            <div>
              <h3 className="text-base font-semibold">Incident Details &amp; Narrative</h3>
            </div>
            <div>
              <Label>Incident Description *</Label>
              <Textarea
                value={form.description}
                onChange={(e) => set('description', e.target.value)}
                className="min-h-[140px]"
                required
              />
            </div>
            <div>
              <Label>Personnel</Label>
              <Textarea
                value={form.personnel}
                onChange={(e) => set('personnel', e.target.value)}
                className="min-h-[96px]"
                placeholder="Names and roles of personnel involved"
              />
            </div>
            <div>
              <Label>Responding Officer</Label>
              <Input
                value={form.responding_officer}
                onChange={(e) => set('responding_officer', e.target.value)}
                placeholder="Enter officer name"
              />
            </div>
          </section>

          <section className="space-y-4 rounded-xl border p-4">
            <div>
              <h3 className="text-base font-semibold">Emergency Response &amp; External Services</h3>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <Label>Emergency Service Type</Label>
                <Select value={form.emergency_services} onChange={(e) => set('emergency_services', e.target.value)}>
                  {EMERGENCY_SERVICE_OPTIONS.map((opt) => <option key={opt} value={opt === '-- None --' ? '' : opt}>{opt}</option>)}
                </Select>
              </div>
              <div>
                <Label>External Case</Label>
                <Input
                  value={form.external_case}
                  onChange={(e) => set('external_case', e.target.value)}
                  placeholder="e.g., CAS-2024-1234, Case Number, Reference Number"
                />
                <p className="mt-1 text-xs text-[hsl(var(--muted))]">External case/reference number if applicable</p>
              </div>
            </div>
          </section>

          <section className="space-y-4 rounded-xl border p-4">
            <div>
              <h3 className="text-base font-semibold">Evidence &amp; Documentation</h3>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <Label>CCTV Status</Label>
                <Select value={form.cctv} onChange={(e) => set('cctv', e.target.value)}>
                  <option value="">-- Select Status --</option>
                  {CCTV_STATUS_OPTIONS.filter(Boolean).map((opt) => <option key={opt} value={opt}>{opt}</option>)}
                </Select>
              </div>
              <div className="sm:col-span-2">
                <Label>Property Damage</Label>
                <Textarea
                  value={form.property_damage}
                  onChange={(e) => set('property_damage', e.target.value)}
                  className="min-h-[96px]"
                  placeholder="Describe any property damage, estimated value, affected items"
                />
              </div>
            </div>
          </section>

          <section className="space-y-4 rounded-xl border p-4">
            <div>
              <h3 className="text-base font-semibold">Actions &amp; Resolution</h3>
            </div>
            <div>
              <Label>Immediate Actions</Label>
              <Textarea
                value={form.immediate_actions}
                onChange={(e) => set('immediate_actions', e.target.value)}
                className="min-h-[96px]"
                placeholder="What immediate actions were taken? Who was notified?"
              />
            </div>
            <div>
              <Label>Next Steps</Label>
              <Textarea
                value={form.next_steps}
                onChange={(e) => set('next_steps', e.target.value)}
                className="min-h-[96px]"
                placeholder="What are the next steps? Follow-up required?"
              />
            </div>
          </section>

          <section className="space-y-4 rounded-xl border p-4">
            <div>
              <h3 className="text-base font-semibold">Report Status</h3>
            </div>
            <div className="sm:w-1/2">
              <Label>Status</Label>
              <Select value={status} onChange={(e) => setStatus(e.target.value as OccurrenceStatus)}>
                {OCCURRENCE_STATUSES.map((s) => <option key={s} value={s}>{STATUS_LABELS[s]}</option>)}
              </Select>
            </div>
          </section>

          {error && <p className="text-sm text-red-600">{error}</p>}
          <div className="flex justify-end">
            <Button type="submit" disabled={saving}>
              {saving && <Loader2 className="h-4 w-4 animate-spin" />}{existingReport ? 'Update Report' : 'Save Report'}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
