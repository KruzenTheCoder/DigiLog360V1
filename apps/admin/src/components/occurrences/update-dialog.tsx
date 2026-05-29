'use client';

import { useState } from 'react';
import { Loader2 } from 'lucide-react';
import { Dialog } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea, Select, Label } from '@/components/ui/input';
import { createClient } from '@/lib/supabase/client';
import { OCCURRENCE_STATUSES, STATUS_LABELS, type Profile, type OccurrenceStatus } from '@digilog/shared';

export function UpdateOccurrenceDialog({
  open, onClose, occurrence, profile, onDone,
}: {
  open: boolean;
  onClose: () => void;
  occurrence: { id: number; ob_number: string | null; status: OccurrenceStatus } | null;
  profile: Profile;
  onDone?: () => void;
}) {
  const [notes, setNotes] = useState('');
  const [status, setStatus] = useState<OccurrenceStatus>(occurrence?.status ?? 'in_progress');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    if (!occurrence || !notes.trim()) { setError('Update notes are required.'); return; }
    setSaving(true);
    setError(null);
    const supabase = createClient();
    const name = profile.full_name ?? profile.email ?? 'Control Room';

    const { error: insErr } = await supabase.from('occurrence_updates').insert({
      occurrence_id: occurrence.id,
      ob_number: occurrence.ob_number,
      notes: notes.trim(),
      status,
      updated_by: profile.id,
      updated_by_name: name,
    });
    if (insErr) { setError(insErr.message); setSaving(false); return; }

    const { error: updErr } = await supabase.from('occurrences')
      .update({ status, last_sla_update_at: new Date().toISOString() })
      .eq('id', occurrence.id);
    if (updErr) { setError(updErr.message); setSaving(false); return; }

    setSaving(false);
    setNotes('');
    onClose();
    onDone?.();
  }

  return (
    <Dialog open={open} onClose={onClose} title={`Update ${occurrence?.ob_number ?? ''}`}>
      <div className="space-y-4">
        <div>
          <Label>Status</Label>
          <Select value={status} onChange={(e) => setStatus(e.target.value as OccurrenceStatus)}>
            {OCCURRENCE_STATUSES.map((s) => <option key={s} value={s}>{STATUS_LABELS[s]}</option>)}
          </Select>
        </div>
        <div>
          <Label>Update Notes</Label>
          <Textarea value={notes} onChange={(e) => setNotes(e.target.value)}
            placeholder="Describe the action taken or current state…" />
        </div>
        {error && <p className="text-sm text-red-600">{error}</p>}
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button onClick={submit} disabled={saving}>
            {saving && <Loader2 className="h-4 w-4 animate-spin" />} Record Update
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
