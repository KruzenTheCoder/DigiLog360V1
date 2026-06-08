'use client';

import { useEffect, useState } from 'react';
import { Loader2, MessageSquarePlus, Pencil, Trash2 } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/input';
import { formatDateTime } from '@/lib/utils';
import { initials } from '@/lib/utils';
import type { OccurrenceComment } from '@digilog/shared';

interface ThreadProps {
  occurrenceId: number;
  obNumber: string | null;
  initial: OccurrenceComment[];
  authorId: string;
  authorName: string;
}

export function CommentsThread({ occurrenceId, obNumber, initial, authorId, authorName }: ThreadProps) {
  const [items, setItems] = useState<OccurrenceComment[]>(initial);
  const [body, setBody] = useState('');
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState<{ id: number; body: string } | null>(null);

  useEffect(() => {
    const supabase = createClient();
    const ch = supabase
      .channel(`occ-comments-${occurrenceId}`)
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'occurrence_comments', filter: `occurrence_id=eq.${occurrenceId}` },
        async () => {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const { data } = await (supabase as any)
            .from('occurrence_comments').select('*')
            .eq('occurrence_id', occurrenceId)
            .order('created_at', { ascending: true });
          setItems((data ?? []) as OccurrenceComment[]);
        })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [occurrenceId]);

  async function add() {
    if (!body.trim()) return;
    setBusy(true);
    const supabase = createClient();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (supabase as any).from('occurrence_comments').insert({
      occurrence_id: occurrenceId, ob_number: obNumber,
      author_id: authorId, author_name: authorName, body: body.trim(),
    });
    setBusy(false);
    if (error) { alert(error.message); return; }
    setBody('');
  }

  async function saveEdit() {
    if (!editing) return;
    const supabase = createClient();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabase as any).from('occurrence_comments')
      .update({ body: editing.body, edited_at: new Date().toISOString() })
      .eq('id', editing.id);
    setEditing(null);
  }

  async function remove(id: number) {
    if (!confirm('Delete this comment?')) return;
    const supabase = createClient();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabase as any).from('occurrence_comments').delete().eq('id', id);
  }

  return (
    <Card className="p-5">
      <div className="mb-3 flex items-center gap-2 text-sm font-semibold">
        <MessageSquarePlus className="h-4 w-4 text-brand" />
        Discussion ({items.length})
      </div>

      {items.length === 0 ? (
        <p className="text-sm text-[hsl(var(--muted))]">No comments yet — start the conversation.</p>
      ) : (
        <div className="space-y-3">
          {items.map((c) => {
            const mine = c.author_id === authorId;
            const isEditing = editing?.id === c.id;
            return (
              <div key={c.id} className="flex gap-3 rounded-md border bg-slate-50/50 p-3 dark:bg-slate-900/40">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand-gradient text-xs font-bold text-white">
                  {initials(c.author_name ?? '?')}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline justify-between gap-2">
                    <p className="text-sm font-semibold">{c.author_name ?? 'Unknown'}</p>
                    <p className="text-[11px] text-[hsl(var(--muted))]">
                      {formatDateTime(c.created_at)}
                      {c.edited_at && <span className="ml-1 italic">(edited)</span>}
                    </p>
                  </div>
                  {isEditing ? (
                    <>
                      <Textarea
                        value={editing!.body}
                        onChange={(e) => setEditing({ id: c.id, body: e.target.value })}
                        className="mt-1 min-h-[80px]"
                      />
                      <div className="mt-2 flex gap-2">
                        <Button size="sm" onClick={saveEdit}>Save</Button>
                        <Button size="sm" variant="secondary" onClick={() => setEditing(null)}>Cancel</Button>
                      </div>
                    </>
                  ) : (
                    <p className="mt-1 whitespace-pre-wrap text-sm">{c.body}</p>
                  )}
                  {mine && !isEditing && (
                    <div className="mt-1 flex gap-1">
                      <Button variant="ghost" size="icon" onClick={() => setEditing({ id: c.id, body: c.body })} title="Edit">
                        <Pencil className="h-3 w-3" />
                      </Button>
                      <Button variant="ghost" size="icon" onClick={() => remove(c.id)} title="Delete">
                        <Trash2 className="h-3 w-3 text-red-600" />
                      </Button>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <div className="mt-4">
        <Textarea
          placeholder="Add a comment…"
          value={body}
          onChange={(e) => setBody(e.target.value)}
          className="min-h-[70px]"
        />
        <div className="mt-2 flex justify-end">
          <Button onClick={add} disabled={busy || !body.trim()}>
            {busy && <Loader2 className="h-4 w-4 animate-spin" />} Post Comment
          </Button>
        </div>
      </div>
    </Card>
  );
}
