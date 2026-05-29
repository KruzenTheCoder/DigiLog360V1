'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input, Textarea, Select, Label } from '@/components/ui/input';
import { OCCURRENCE_STATUSES, STATUS_LABELS, type Occurrence, type Profile, type OccurrenceStatus } from '@digilog/shared';

const FIELDS: { key: string; label: string; area?: boolean }[] = [
  { key: 'personnel', label: 'Personnel Involved' },
  { key: 'responding_officer', label: 'Responding Officer' },
  { key: 'emergency_services', label: 'Emergency Services' },
  { key: 'external_case', label: 'External Case Number' },
  { key: 'cctv', label: 'CCTV Available' },
  { key: 'cctv_times', label: 'CCTV Times' },
  { key: 'property_damage', label: 'Property Damage' },
];

export function ReportForm({ occurrence, profile }: { occurrence: Occurrence; profile: Profile }) {
  const router = useRouter();
  const [form, setForm] = useState<Record<string, string>>({
    description: occurrence.description ?? '',
    personnel: '', responding_officer: '', emergency_services: '', external_case: '',
    cctv: '', cctv_times: '', property_damage: '', immediate_actions: '', next_steps: '',
  });
  const [status, setStatus] = useState<OccurrenceStatus>('in_progress');
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
      description: form.description.trim(),
      personnel: form.personnel || null,
      responding_officer: form.responding_officer || null,
      emergency_services: form.emergency_services || null,
      external_case: form.external_case || null,
      cctv: form.cctv || null,
      cctv_times: form.cctv_times || null,
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

          <div>
            <Label>Incident Description *</Label>
            <Textarea value={form.description} onChange={(e) => set('description', e.target.value)} className="min-h-[120px]" required />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            {FIELDS.map((f) => (
              <div key={f.key}>
                <Label>{f.label}</Label>
                <Input value={form[f.key]} onChange={(e) => set(f.key, e.target.value)} />
              </div>
            ))}
          </div>

          <div>
            <Label>Immediate Actions Taken</Label>
            <Textarea value={form.immediate_actions} onChange={(e) => set('immediate_actions', e.target.value)} />
          </div>
          <div>
            <Label>Next Steps / Follow-up</Label>
            <Textarea value={form.next_steps} onChange={(e) => set('next_steps', e.target.value)} />
          </div>

          <div className="sm:w-1/2">
            <Label>Report Status</Label>
            <Select value={status} onChange={(e) => setStatus(e.target.value as OccurrenceStatus)}>
              {OCCURRENCE_STATUSES.map((s) => <option key={s} value={s}>{STATUS_LABELS[s]}</option>)}
            </Select>
          </div>

          {error && <p className="text-sm text-red-600">{error}</p>}
          <div className="flex justify-end">
            <Button type="submit" disabled={saving}>
              {saving && <Loader2 className="h-4 w-4 animate-spin" />} Save Report
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
