'use client';

import { useEffect, useRef, useState } from 'react';
import { Mic, Square, Trash2 } from 'lucide-react';

export interface VoiceClip {
  id: string;
  blob: Blob;
  url: string;       // object URL for local preview playback
  durationMs: number;
  ext: string;       // 'webm' | 'mp4' | 'm4a' …
}

const MAX_CLIPS = 5;

function fmt(ms: number): string {
  const total = Math.round(ms / 1000);
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
}

/** Record short voice notes in the browser via MediaRecorder and hand the
 *  captured clips back to the parent. No native anything — works on any
 *  modern browser. Mirrors the "add a photo" affordance on the mobile app. */
export function VoiceNoteRecorder({
  clips, onChange,
}: {
  clips: VoiceClip[];
  onChange: (next: VoiceClip[]) => void;
}) {
  const [recording, setRecording] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const startedAtRef = useRef(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Clean up any live stream / timer on unmount.
  useEffect(() => {
    return () => {
      timerRef.current && clearInterval(timerRef.current);
      streamRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  async function start() {
    setError(null);
    if (clips.length >= MAX_CLIPS) { setError(`Up to ${MAX_CLIPS} voice notes.`); return; }
    // getUserMedia only exists in a secure context (HTTPS or localhost). On a
    // plain-HTTP page navigator.mediaDevices is undefined — tell the user why.
    if (typeof window !== 'undefined' && window.isSecureContext === false) {
      setError('Recording needs a secure connection (https://). Open the console over HTTPS to record.');
      return;
    }
    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
      setError('Recording is not supported in this browser.');
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const mr = new MediaRecorder(stream);
      chunksRef.current = [];
      mr.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data); };
      mr.onstop = () => {
        const type = mr.mimeType || 'audio/webm';
        const blob = new Blob(chunksRef.current, { type });
        const durationMs = Date.now() - startedAtRef.current;
        streamRef.current?.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
        if (durationMs >= 700) {
          const ext = type.includes('mp4') || type.includes('m4a') ? 'mp4'
            : type.includes('ogg') ? 'ogg' : 'webm';
          onChange([
            ...clips,
            { id: crypto.randomUUID(), blob, url: URL.createObjectURL(blob), durationMs, ext },
          ].slice(0, MAX_CLIPS));
        }
      };
      startedAtRef.current = Date.now();
      mr.start();
      recorderRef.current = mr;
      setRecording(true);
      setElapsed(0);
      timerRef.current = setInterval(() => setElapsed(Date.now() - startedAtRef.current), 250);
    } catch (e) {
      const name = e instanceof Error ? e.name : '';
      if (name === 'NotAllowedError' || name === 'SecurityError') {
        setError('Microphone blocked. Allow mic access for this site in your browser, then try again.');
      } else if (name === 'NotFoundError' || name === 'OverconstrainedError') {
        setError('No microphone found on this device.');
      } else if (name === 'NotReadableError') {
        setError('Microphone is in use by another app. Close it and try again.');
      } else {
        setError('Could not start recording.');
      }
    }
  }

  function stop() {
    timerRef.current && clearInterval(timerRef.current);
    timerRef.current = null;
    recorderRef.current?.stop();
    recorderRef.current = null;
    setRecording(false);
  }

  function remove(id: string) {
    const gone = clips.find((c) => c.id === id);
    if (gone) URL.revokeObjectURL(gone.url);
    onChange(clips.filter((c) => c.id !== id));
  }

  return (
    <div className="space-y-2">
      {clips.map((c, i) => (
        <div key={c.id} className="flex items-center gap-3 rounded-lg border bg-[hsl(var(--surface-alt))] px-3 py-2">
          <span className="shrink-0 text-sm font-medium">Voice note {i + 1}</span>
          <audio controls src={c.url} className="h-8 min-w-0 flex-1" />
          <span className="shrink-0 text-xs tabular-nums text-[hsl(var(--muted))]">{fmt(c.durationMs)}</span>
          <button type="button" onClick={() => remove(c.id)} className="shrink-0 text-red-500 hover:text-red-600" aria-label="Remove voice note">
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      ))}

      {clips.length < MAX_CLIPS && (
        <button
          type="button"
          onClick={recording ? stop : start}
          className={`flex w-full items-center justify-center gap-2 rounded-lg border border-dashed px-4 py-3 text-sm font-semibold transition ${
            recording
              ? 'border-red-500 bg-red-500 text-white'
              : 'border-brand text-brand hover:bg-brand/5'
          }`}
        >
          {recording ? <Square className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
          {recording ? `Recording… ${fmt(elapsed)} · click to stop` : 'Record voice note'}
        </button>
      )}

      {error && <p className="text-xs text-red-500">{error}</p>}
    </div>
  );
}
