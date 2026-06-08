// Transcribe an audio file via OpenAI Whisper.
//
// Body:
//   { occurrence_id?: number, storage_path: string, language?: string }
//
// The audio must already be uploaded to `occurrence-voice-notes/<org>/<ob>/<uuid>.m4a`.
// The function downloads it via service role, posts to Whisper, attaches the
// transcription back to the occurrence as a comment (if occurrence_id) or
// returns it to the caller.
//
// Requires OPENAI_API_KEY env var. No-op (returns 501) if unset.
import { corsHeaders, json } from '../_shared/cors.ts';
import { serviceClient, requireUser } from '../_shared/auth.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  const apiKey = Deno.env.get('OPENAI_API_KEY');
  if (!apiKey) return json({ error: 'OPENAI_API_KEY not configured' }, 501);

  const admin = serviceClient();
  const result = await requireUser(req, admin);
  if (result.error) return json({ error: result.error }, 401);

  let body: { occurrence_id?: number; storage_path?: string; language?: string };
  try { body = await req.json(); } catch { return json({ error: 'Invalid JSON' }, 400); }
  if (!body.storage_path) return json({ error: 'storage_path required' }, 400);

  // Download the audio.
  const { data: file, error: dlErr } = await admin.storage
    .from('occurrence-voice-notes')
    .download(body.storage_path);
  if (dlErr || !file) return json({ error: dlErr?.message ?? 'download failed' }, 400);

  const form = new FormData();
  form.append('file', file, body.storage_path.split('/').pop() ?? 'audio.m4a');
  form.append('model', 'whisper-1');
  if (body.language) form.append('language', body.language);

  const resp = await fetch('https://api.openai.com/v1/audio/transcriptions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}` },
    body: form,
  });
  const payload = await resp.json().catch(() => ({}));
  if (!resp.ok) return json({ error: 'OpenAI error', details: payload }, 502);

  const transcript = String(payload.text ?? '').trim();
  if (!transcript) return json({ error: 'Empty transcript' }, 502);

  // Optionally attach as a comment on the occurrence.
  if (body.occurrence_id) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (admin as any).from('occurrence_comments').insert({
      occurrence_id: body.occurrence_id,
      author_id: result.profile?.id ?? null,
      author_name: result.profile?.full_name ?? result.profile?.email ?? 'Voice note',
      body: `🎙️ Voice note: ${transcript}`,
    });

    await admin.rpc('log_audit_event', {
      _action: 'voice.transcribed',
      _actor_id: result.profile?.id,
      _org_id: result.profile?.org_id,
      _target_table: 'occurrences',
      _target_id: String(body.occurrence_id),
      _summary: `Voice note transcribed (${transcript.length} chars)`,
    }).catch(() => {});
  }

  return json({ ok: true, text: transcript });
});
