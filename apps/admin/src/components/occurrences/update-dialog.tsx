'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Loader2, FileText } from 'lucide-react';
import { Dialog } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea, Select, Label } from '@/components/ui/input';
import { createClient } from '@/lib/supabase/client';
import { OCCURRENCE_STATUSES, STATUS_LABELS, type Profile, type OccurrenceStatus } from '@digilog/shared';

const TERMINAL_STATUSES: OccurrenceStatus[] = ['resolved', 'closed'];

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
  // Whether this occurrence has a saved report. We block transitions into
  // 'resolved' / 'closed' until one exists — control-room policy.
  const [hasReport, setHasReport] = useState<boolean | null>(null);

  // Re-check report state every time the dialog opens for a new occurrence.
  useEffect(() => {
    if (!occurrence || !open) { setHasReport(null); return; }
    const supabase = createClient();
    supabase
      .from('occurrence_reports')
      .select('id', { count: 'exact', head: true })
      .eq('occurrence_id', occurrence.id)
      .then(({ count }) => setHasReport((count ?? 0) > 0));
  }, [occurrence, open]);

  const wantsTerminal = TERMINAL_STATUSES.includes(status);
  const blockedByMissingReport = wantsTerminal && hasReport === false;

  async function submit() {
    if (!occurrence || !notes.trim()) { setError('Update notes are required.'); return; }
    if (blockedByMissingReport) {
      setError('A report is required before this occurrence can be closed or resolved.');
      return;
    }
    setSaving(true);
    setError(null);
    const supabase = createClient();
    const name = profile.full_name ?? profile.email ?? 'Control Room';

    if (!profile.org_id) {
      setError('Your profile has no organisation assigned — contact a super-user.');
      setSaving(false);
      return;
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error: insErr } = await (supabase as any).from('occurrence_updates').insert({
      org_id: profile.org_id,
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

        {blockedByMissingReport && occurrence && (
          <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm dark:border-amber-900 dark:bg-amber-950/40">
            <p className="font-semibold text-amber-800 dark:text-amber-200">
              No report on file
            </p>
            <p className="mt-1 text-amber-700 dark:text-amber-300">
              A control-room report is required before this occurrence can be marked
              <strong> {STATUS_LABELS[status].toLowerCase()}</strong>. Fill one out first,
              then come back here to finalise the status.
            </p>
            <Link
              href={`/reports/new?occurrence=${occurrence.id}`}
              className="mt-2 inline-flex items-center gap-1 text-sm font-semibold text-amber-900 underline dark:text-amber-100"
            >
              <FileText className="h-4 w-4" /> Open report form
            </Link>
          </div>
        )}

        <div>
          <Label>Update Notes</Label>
          <Textarea value={notes} onChange={(e) => setNotes(e.target.value)}
            placeholder="Describe the action taken or current state…" />
        </div>
        {error && <p className="text-sm text-red-600">{error}</p>}
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button onClick={submit} disabled={saving || blockedByMissingReport}>
            {saving && <Loader2 className="h-4 w-4 animate-spin" />} Record Update
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
