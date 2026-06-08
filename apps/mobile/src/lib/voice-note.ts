// Record an audio clip, upload it to Supabase Storage, and hand it to the
// transcribe-audio edge function. Returns the recognised text + the storage
// path so the UI can attach both to the in-progress occurrence.
import { Audio } from 'expo-av';
import { supabase } from './supabase';

export interface VoiceNoteResult {
  storagePath: string;
  transcript: string;
}

export async function recordOnce(): Promise<Audio.Recording | null> {
  const perm = await Audio.requestPermissionsAsync();
  if (!perm.granted) return null;
  await Audio.setAudioModeAsync({ allowsRecordingIOS: true, playsInSilentModeIOS: true });
  const { recording } = await Audio.Recording.createAsync(
    Audio.RecordingOptionsPresets.HIGH_QUALITY,
  );
  return recording;
}

export async function finishAndTranscribe(opts: {
  recording: Audio.Recording;
  orgSlug: string;
  obNumber: string | null;
  occurrenceId?: number;
}): Promise<VoiceNoteResult> {
  await opts.recording.stopAndUnloadAsync();
  const uri = opts.recording.getURI();
  if (!uri) throw new Error('No recording URI');

  // Read file → blob
  const resp = await fetch(uri);
  const blob = await resp.blob();

  const path = `${opts.orgSlug}/${opts.obNumber ?? 'unattached'}/${Date.now()}.m4a`;
  const { error: upErr } = await supabase.storage
    .from('occurrence-voice-notes')
    .upload(path, blob, { contentType: 'audio/m4a', upsert: false });
  if (upErr) throw upErr;

  const { data, error: fnErr } = await supabase.functions.invoke<{ text: string; error?: string }>(
    'transcribe-audio',
    { body: { storage_path: path, occurrence_id: opts.occurrenceId } },
  );
  if (fnErr) throw fnErr;
  if (!data?.text) throw new Error(data?.error ?? 'Empty transcript');

  return { storagePath: path, transcript: data.text };
}
