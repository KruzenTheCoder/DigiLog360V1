'use client';

import { useEffect, useState } from 'react';
import { MicOff } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { VOICE_NOTES_BUCKET, type OccurrenceVoiceNote } from '@digilog/shared';
import { formatDateTime } from '@/lib/utils';

function fmt(ms: number | null): string {
  if (!ms || ms < 0) return '';
  const total = Math.round(ms / 1000);
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
}

export function VoiceNoteGallery({ notes }: { notes: OccurrenceVoiceNote[] }) {
  const [urls, setUrls] = useState<Record<number, string>>({});

  useEffect(() => {
    if (notes.length === 0) return;
    const supabase = createClient();
    supabase.storage
      .from(VOICE_NOTES_BUCKET)
      .createSignedUrls(notes.map((n) => n.storage_path), 3600)
      .then(({ data }) => {
        if (!data) return;
        const map: Record<number, string> = {};
        data.forEach((d, idx) => { if (d.signedUrl) map[notes[idx].id] = d.signedUrl; });
        setUrls(map);
      });
  }, [notes]);

  if (notes.length === 0) {
    return (
      <div className="flex items-center gap-2 text-sm text-[hsl(var(--muted))]">
        <MicOff className="h-4 w-4" /> No voice notes attached.
      </div>
    );
  }

  return (
    <ul className="space-y-2">
      {notes.map((n, i) => (
        <li key={n.id} className="flex flex-wrap items-center gap-3 rounded-lg border bg-[hsl(var(--surface-alt))] px-3 py-2">
          <span className="shrink-0 text-sm font-medium">Voice note {i + 1}</span>
          {urls[n.id] ? (
            <audio controls src={urls[n.id]} className="h-8 min-w-0 flex-1" />
          ) : (
            <span className="flex-1 text-xs text-[hsl(var(--muted))]">Loading…</span>
          )}
          {n.duration_ms ? <span className="shrink-0 text-xs tabular-nums text-[hsl(var(--muted))]">{fmt(n.duration_ms)}</span> : null}
          <span className="shrink-0 text-xs text-[hsl(var(--muted))]">
            {n.recorded_by_name ?? 'Unknown'} · {formatDateTime(n.created_at)}
          </span>
        </li>
      ))}
    </ul>
  );
}
