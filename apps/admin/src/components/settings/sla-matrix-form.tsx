'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, RotateCcw } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { SEVERITY_LABELS, SEVERITY_COLORS, type SeverityLevel } from '@digilog/shared';

interface Row {
  severity: SeverityLevel;
  resolve_hours: number;
  update_minutes: number;
  is_override: boolean;
}

export function SlaMatrixForm({ initial }: { initial: Row[] }) {
  const router = useRouter();
  const [rows, setRows] = useState<Row[]>(initial);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  function patch(severity: SeverityLevel, key: 'resolve_hours' | 'update_minutes', value: number) {
    setRows((prev) => prev.map((r) => (r.severity === severity ? { ...r, [key]: value, is_override: true } : r)));
  }

  async function save() {
    setBusy(true); setMessage(null);
    const supabase = createClient();
    for (const r of rows) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (supabase as any).from('org_sla_overrides').upsert(
        { severity: r.severity, resolve_hours: r.resolve_hours, update_minutes: r.update_minutes },
        { onConflict: 'org_id,severity' },
      );
    }
    setBusy(false);
    setMessage('Saved. Live SLAs use the new values immediately.');
    router.refresh();
  }

  async function resetOne(severity: SeverityLevel) {
    const supabase = createClient();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabase as any).from('org_sla_overrides').delete().eq('severity', severity);
    router.refresh();
  }

  return (
    <Card>
      <CardHeader><CardTitle>SLA matrix</CardTitle></CardHeader>
      <CardContent>
        <div className="space-y-3">
          {rows.map((r) => (
            <div key={r.severity} className="flex flex-wrap items-end gap-3 rounded-lg border p-3">
              <div className="w-24">
                <Badge color={SEVERITY_COLORS[r.severity]}>{SEVERITY_LABELS[r.severity]}</Badge>
                {r.is_override && (
                  <p className="mt-1 text-[10px] uppercase tracking-wide text-brand">Override</p>
                )}
              </div>
              <div className="flex-1 min-w-[120px]">
                <label className="text-xs text-[hsl(var(--muted))]">Resolve within (hours)</label>
                <Input
                  type="number" min={1} value={r.resolve_hours}
                  onChange={(e) => patch(r.severity, 'resolve_hours', Number(e.target.value))}
                />
              </div>
              <div className="flex-1 min-w-[120px]">
                <label className="text-xs text-[hsl(var(--muted))]">Update every (minutes)</label>
                <Input
                  type="number" min={1} value={r.update_minutes}
                  onChange={(e) => patch(r.severity, 'update_minutes', Number(e.target.value))}
                />
              </div>
              {r.is_override && (
                <Button size="sm" variant="ghost" onClick={() => resetOne(r.severity)} title="Reset to default">
                  <RotateCcw className="h-4 w-4" />
                </Button>
              )}
            </div>
          ))}
        </div>
        {message && <p className="mt-3 text-sm text-green-600">{message}</p>}
        <div className="mt-4 flex justify-end">
          <Button onClick={save} disabled={busy}>
            {busy && <Loader2 className="h-4 w-4 animate-spin" />} Save SLA matrix
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
