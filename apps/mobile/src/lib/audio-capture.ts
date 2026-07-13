// Thin wrapper over expo-av audio recording for the Log Occurrence voice-note
// feature. Kept UI-agnostic so the screen just calls start/stop and gets back a
// local uri + base64 (base64 lets a clip survive in the offline queue, exactly
// like photos). No new native modules — expo-av is already in the build.
import { Audio } from 'expo-av';

export interface CapturedClip {
  uri: string;
  base64: string;
  durationMs: number;
}

export interface ActiveRecording {
  recording: Audio.Recording;
  startedAt: number;
}

/** Ask for the mic, configure the audio session, and begin recording.
 *  Returns null if permission was denied. */
export async function startRecording(): Promise<ActiveRecording | null> {
  const perm = await Audio.requestPermissionsAsync();
  if (!perm.granted) return null;
  await Audio.setAudioModeAsync({ allowsRecordingIOS: true, playsInSilentModeIOS: true });
  const { recording } = await Audio.Recording.createAsync(
    Audio.RecordingOptionsPresets.HIGH_QUALITY,
  );
  return { recording, startedAt: Date.now() };
}

/** Stop the recording and return the clip (local uri + base64 + duration). */
export async function stopRecording(active: ActiveRecording): Promise<CapturedClip> {
  await active.recording.stopAndUnloadAsync();
  // Release the recording audio route so playback works afterwards.
  await Audio.setAudioModeAsync({ allowsRecordingIOS: false }).catch(() => {});
  const uri = active.recording.getURI();
  if (!uri) throw new Error('Recording produced no file');
  const base64 = await uriToBase64(uri);
  return { uri, base64, durationMs: Date.now() - active.startedAt };
}

/** Read a local file URI into a base64 string (no data: prefix). */
async function uriToBase64(uri: string): Promise<string> {
  const resp = await fetch(uri);
  const blob = await resp.blob();
  return await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error ?? new Error('Failed to read clip'));
    reader.onloadend = () => {
      const result = String(reader.result ?? '');
      const comma = result.indexOf(',');
      resolve(comma >= 0 ? result.slice(comma + 1) : result);
    };
    reader.readAsDataURL(blob);
  });
}

/** Format a duration in ms as m:ss for the UI. */
export function formatDuration(ms: number | null | undefined): string {
  if (!ms || ms < 0) return '0:00';
  const total = Math.round(ms / 1000);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}
