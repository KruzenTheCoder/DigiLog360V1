// Log new occurrence. Designed to be done in 15 seconds from camera-in-hand:
//
//   1. Pick a type chip          (org-custom + built-in)
//   2. Set severity               (default: medium)
//   3. Snap a photo or two        (camera + library)
//   4. Tap "Log"
//
// Site is auto-filled from profile (most guards work at one site).
// On submit: success toast + navigate to the new occurrence detail.
// On network failure: gracefully fall back to the offline queue.

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, Image, Alert,
} from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { Audio } from 'expo-av';
import { useAuth } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import { uploadOccurrenceImage, uploadVoiceNote } from '@/lib/storage';
import {
  startRecording, stopRecording, formatDuration,
  type ActiveRecording, type CapturedClip,
} from '@/lib/audio-capture';
import { enqueueOccurrence, isOnline, flushQueue, pendingCount, clearQueue, inspectQueue } from '@/lib/offline-queue';
import { Button, Field } from '@/components/ui';
import { useToast, SectionTitle, Sheet, haptic } from '@/components/primitives';
import { theme, spacing, radius, type } from '@/lib/theme';
import {
  SEVERITIES, SEVERITY_LABELS, SEVERITY_COLORS,
  mergeIncidentCategories, mergeIncidentSubcategories, mergeIncidentTypes,
  profileSiteIds,
  type SeverityLevel,
  type OrgIncidentType, type OrgIncidentCategory, type OrgIncidentSubcategory,
} from '@digilog/shared';

export default function NewOccurrence() {
  const router = useRouter();
  const { profile } = useAuth();
  const toast = useToast();

  const [siteName, setSiteName] = useState<string | null>(null);
  const [orgTypes, setOrgTypes] = useState<OrgIncidentType[]>([]);
  const [orgCategories, setOrgCategories] = useState<OrgIncidentCategory[]>([]);
  const [orgSubcategories, setOrgSubcategories] = useState<OrgIncidentSubcategory[]>([]);
  // Org "forked" its taxonomy → pickers use ONLY the org rows (renamed/disabled).
  const [taxonomyCustomized, setTaxonomyCustomized] = useState(false);

  // 3-level cascading classification.
  const [category, setCategory] = useState('');
  const [subcategory, setSubcategory] = useState('');
  const [occurrenceType, setOccurrenceType] = useState('');

  // Which picker sheet is open (null = closed).
  const [pickerOpen, setPickerOpen] = useState<null | 'category' | 'subcategory' | 'type'>(null);

  const [severity, setSeverity] = useState<SeverityLevel>('medium');
  const [description, setDescription] = useState('');
  const [photos, setPhotos] = useState<{ uri: string; base64: string }[]>([]);
  const [voiceNotes, setVoiceNotes] = useState<CapturedClip[]>([]);
  const [recording, setRecording] = useState<ActiveRecording | null>(null);
  const [recElapsed, setRecElapsed] = useState(0);
  const [saving, setSaving] = useState(false);
  const [pending, setPending] = useState(0);

  // Cascaded option lists — built-in taxonomy + active org-custom at every
  // level. Recompute whenever the upstream selection changes.
  const mergeOpts = { customized: taxonomyCustomized };
  const categoryOptions = mergeIncidentCategories(orgCategories, mergeOpts);
  const subcategoryOptions = mergeIncidentSubcategories(category, orgSubcategories, mergeOpts);
  const typeOptions = mergeIncidentTypes(category, subcategory, orgTypes, mergeOpts);

  useFocusEffect(useCallback(() => {
    setSaving(false);
    pendingCount().then(setPending);
  }, []));

  // Load site name + the org's custom taxonomy (categories, sub-categories,
  // types). All three tables are queried in parallel; each is a no-op fallback
  // if its table isn't deployed yet.
  useEffect(() => {
    // Use the same effective site the insert will use — a multi-site guard can
    // have a null legacy site_id while being assigned via site_ids[], and
    // reading only site_id showed "No site assigned" and logged with no site.
    const effectiveSiteId = profile?.site_id ?? profileSiteIds(profile)[0] ?? null;
    if (!effectiveSiteId) { setSiteName(null); }
    else {
      supabase.from('sites').select('name').eq('id', effectiveSiteId).maybeSingle()
        .then(({ data }) => setSiteName(data?.name ?? null));
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sb: any = supabase;
    sb.from('org_occurrence_types').select('name, category, subcategory, is_active, sort_order')
      .then(({ data }: { data: OrgIncidentType[] | null }) => setOrgTypes(data ?? []))
      .catch(() => {});
    sb.from('org_incident_categories').select('name, is_active, sort_order')
      .then(({ data }: { data: OrgIncidentCategory[] | null }) => setOrgCategories(data ?? []))
      .catch(() => {});
    sb.from('org_incident_subcategories').select('category, name, is_active, sort_order')
      .then(({ data }: { data: OrgIncidentSubcategory[] | null }) => setOrgSubcategories(data ?? []))
      .catch(() => {});
    sb.from('organizations').select('taxonomy_customized').maybeSingle()
      .then(({ data }: { data: { taxonomy_customized: boolean } | null }) => setTaxonomyCustomized(Boolean(data?.taxonomy_customized)))
      .catch(() => {});
  }, [profile]);

  // Cascading reset rules — if the user changes a higher level, blank out the
  // lower levels so we never submit a stale combination.
  function selectCategory(c: string) {
    setCategory(c);
    setSubcategory('');
    setOccurrenceType('');
    setPickerOpen(null);
  }
  function selectSubcategory(s: string) {
    setSubcategory(s);
    setOccurrenceType('');
    setPickerOpen(null);
  }
  function selectType(t: string) {
    setOccurrenceType(t);
    setPickerOpen(null);
  }

  // ----------------------------------------------------------------------
  // Photos
  // ----------------------------------------------------------------------
  async function snapPhoto() {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) {
      Alert.alert('Camera permission needed', 'Enable camera access in Settings to attach photos.');
      return;
    }
    const res = await ImagePicker.launchCameraAsync({ quality: 0.5, base64: true });
    if (!res.canceled && res.assets[0]?.base64) {
      setPhotos((p) => [...p, { uri: res.assets[0].uri, base64: res.assets[0].base64! }]);
    }
  }
  async function pickFromLibrary() {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      Alert.alert('Library permission needed');
      return;
    }
    const res = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.5, base64: true, allowsMultipleSelection: true, selectionLimit: 6 - photos.length,
    });
    if (!res.canceled) {
      const next = res.assets
        .filter((a) => a.base64)
        .map((a) => ({ uri: a.uri, base64: a.base64! }));
      setPhotos((p) => [...p, ...next].slice(0, 6));
    }
  }
  function removePhoto(idx: number) {
    setPhotos((arr) => arr.filter((_, i) => i !== idx));
  }

  // ----------------------------------------------------------------------
  // Voice notes — record natively via expo-av, attach like a photo.
  // ----------------------------------------------------------------------
  // Tick the elapsed timer while recording.
  useEffect(() => {
    if (!recording) return;
    const iv = setInterval(() => setRecElapsed(Date.now() - recording.startedAt), 250);
    return () => clearInterval(iv);
  }, [recording]);

  async function toggleRecord() {
    if (recording) {
      // Stop + attach.
      try {
        const active = recording;
        setRecording(null);
        setRecElapsed(0);
        const clip = await stopRecording(active);
        // Ignore accidental sub-second taps.
        if (clip.durationMs >= 700) {
          setVoiceNotes((v) => [...v, clip].slice(0, 5));
        }
      } catch (e) {
        toast.show(e instanceof Error ? e.message : 'Recording failed', 'error');
      }
      return;
    }
    if (voiceNotes.length >= 5) { toast.show('Up to 5 voice notes', 'error'); return; }
    const active = await startRecording();
    if (!active) {
      Alert.alert('Microphone permission needed', 'Enable microphone access in Settings to record voice notes.');
      return;
    }
    setRecElapsed(0);
    setRecording(active);
  }

  function removeVoiceNote(idx: number) {
    setVoiceNotes((arr) => arr.filter((_, i) => i !== idx));
  }

  // ----------------------------------------------------------------------
  // Submit
  // ----------------------------------------------------------------------
  function resetForm() {
    setCategory(''); setSubcategory(''); setOccurrenceType('');
    setDescription(''); setPhotos([]); setVoiceNotes([]); setSeverity('medium');
  }

  async function submit() {
    if (!category) { toast.show('Pick a category first', 'error'); return; }
    if (!subcategory) { toast.show('Pick a sub-category', 'error'); return; }
    if (!occurrenceType) { toast.show('Pick the specific type', 'error'); return; }
    if (!description.trim()) { toast.show('Describe what happened', 'error'); return; }
    if (!profile) return;
    setSaving(true);

    const occurrence = {
      occurrence_type: occurrenceType,
      category,
      subcategory,
      severity,
      description: description.trim(),
      incident_at: new Date().toISOString(),
      // Same effective-site rule as the site-name lookup above, so an
      // occurrence never lands with a null site for a user who does have one
      // (which would hide it from every site-filtered list).
      site_id: profile.site_id ?? profileSiteIds(profile)[0] ?? null,
      site_name: siteName,
      logged_by: profile.id,
      logged_by_name: profile.full_name ?? profile.email,
      status: 'open' as const,
    };

    // NOTE: we deliberately do NOT pre-check connectivity here. NetInfo's
    // reachability probe reports false on plenty of working networks (filtered
    // WiFi, captive portals, some carriers), which made every log queue as
    // "pending sync" even with a good connection — and flushQueue used the same
    // check, so the queue could never drain. Just attempt the insert: success is
    // proof of connectivity, and only a genuine network failure queues.
    try {
      const { data: occ, error } = await supabase
        .from('occurrences').insert(occurrence)
        .select('id, ob_number').single();
      if (error) throw error;

      // Upload photos in parallel; ignore individual failures so the
      // occurrence itself is still saved.
      if (photos.length > 0) {
        await Promise.allSettled(photos.map(async (photo) => {
          const path = await uploadOccurrenceImage(photo.base64, occ.ob_number ?? `OB${occ.id}`);
          await supabase.from('occurrence_images').insert({
            occurrence_id: occ.id, ob_number: occ.ob_number, storage_path: path,
            captured_by: profile.id, captured_by_name: profile.full_name ?? profile.email,
          });
        }));
      }

      // Upload voice notes the same way — a failed clip never blocks the log.
      if (voiceNotes.length > 0) {
        await Promise.allSettled(voiceNotes.map(async (vn) => {
          const path = await uploadVoiceNote(vn.base64, occ.ob_number ?? `OB${occ.id}`);
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          await (supabase as any).from('occurrence_voice_notes').insert({
            occurrence_id: occ.id, ob_number: occ.ob_number, storage_path: path,
            duration_ms: vn.durationMs,
            recorded_by: profile.id, recorded_by_name: profile.full_name ?? profile.email,
          });
        }));
      }

      setSaving(false);
      resetForm();
      haptic('success');
      toast.show(`${occ.ob_number} logged`, 'ok');

      // Opportunistically drain the queue.
      flushQueue().then((r) => setPending(r.remaining));

      // Navigate to detail so the user sees their submission landed.
      setTimeout(() => router.push(`/occurrence/${occ.id}`), 300);
    } catch (e) {
      // Only a NETWORK failure should queue. A rejection from the server
      // (RLS violation, constraint, bad column) will fail identically on every
      // retry, so queueing it hid a real error behind a permanent "pending
      // sync" and the operator never learned what was wrong. Postgres errors
      // carry a SQLSTATE code; fetch failures do not.
      const err = e as { code?: string; message?: string; details?: string };
      const isServerRejection = typeof err?.code === 'string' && /^[0-9A-Z]{5}$/.test(err.code);

      if (isServerRejection) {
        setSaving(false);
        haptic('error');
        const why = err.code === '42501'
          ? 'you do not have permission to log at this site'
          : (err.message ?? 'rejected by the server');
        // Keep the form populated so the operator can correct and resubmit.
        toast.show(`Not logged — ${why}`, 'error');
        return;
      }

      // Genuine network failure → queue for retry.
      await enqueueOccurrence({
        occurrence,
        photos: photos.map((p) => ({ base64: p.base64 })),
        voiceNotes: voiceNotes.map((v) => ({ base64: v.base64, durationMs: v.durationMs })),
      });
      const left = await pendingCount();
      setPending(left);
      setSaving(false);
      resetForm();
      haptic('error');
      toast.show(
        `Saved for retry · ${left} waiting (${e instanceof Error ? e.message : 'no network'})`,
        'info',
      );
    }
  }

  return (
    <View style={{ flex: 1, backgroundColor: theme.bg }}>
      <ScrollView
        contentContainerStyle={{ padding: spacing.lg, paddingTop: spacing.xl * 2, paddingBottom: 80 }}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <Text style={type.display}>Log occurrence</Text>
        <Text style={[type.muted, { marginTop: 6, marginBottom: spacing.lg }]}>
          {siteName ? `Site: ${siteName}` : 'No site assigned to your profile'}
        </Text>

        {pending > 0 && (
          <TouchableOpacity
            style={styles.queueBanner}
            activeOpacity={0.7}
            onPress={async () => {
              const info = await inspectQueue();
              const ageMin = info.oldest_queued_at
                ? Math.round((Date.now() - new Date(info.oldest_queued_at).getTime()) / 60000)
                : 0;
              const errLine = info.last_error
                ? `\n\nLast error:\n${info.last_error}`
                : '';
              Alert.alert(
                `${info.count} pending sync`,
                `Oldest: ${ageMin} min ago · ${info.total_attempts} retry attempts so far.${errLine}\n\n` +
                'Retry now to try uploading. Clear pending if these are stuck and you don\'t need them.',
                [
                  { text: 'Cancel', style: 'cancel' },
                  {
                    text: 'Retry now',
                    onPress: async () => {
                      const online = await isOnline();
                      if (!online) {
                        toast.show('Still offline', 'error');
                        return;
                      }
                      const r = await flushQueue();
                      setPending(r.remaining);
                      if (r.flushed > 0) toast.show(`Synced ${r.flushed}`, 'ok');
                      else if (r.remaining > 0) toast.show(`${r.remaining} still failing — try Clear pending`, 'error');
                    },
                  },
                  {
                    text: 'Clear pending',
                    style: 'destructive',
                    onPress: async () => {
                      await clearQueue();
                      setPending(0);
                      toast.show('Queue cleared', 'ok');
                    },
                  },
                ],
              );
            }}
          >
            <Ionicons name="cloud-offline-outline" size={18} color={theme.brand} />
            <Text style={styles.queueText}>
              {pending} pending sync · tap to retry or clear
            </Text>
            <Ionicons name="chevron-forward" size={16} color={theme.textMuted} />
          </TouchableOpacity>
        )}

        <SectionTitle>Category</SectionTitle>
        <PickerRow
          value={category}
          placeholder="Choose category"
          onPress={() => setPickerOpen('category')}
        />

        <SectionTitle>Sub-category</SectionTitle>
        <PickerRow
          value={subcategory}
          placeholder={category ? 'Choose sub-category' : 'Pick a category first'}
          onPress={() => category && setPickerOpen('subcategory')}
          disabled={!category}
        />

        <SectionTitle>Specific type</SectionTitle>
        <PickerRow
          value={occurrenceType}
          placeholder={subcategory ? 'Choose type' : 'Pick a sub-category first'}
          onPress={() => subcategory && setPickerOpen('type')}
          disabled={!subcategory}
        />

        <SectionTitle>Severity</SectionTitle>
        <View style={styles.chips}>
          {SEVERITIES.map((s) => (
            <Chip
              key={s}
              label={SEVERITY_LABELS[s]}
              active={severity === s}
              color={SEVERITY_COLORS[s]}
              onPress={() => setSeverity(s)}
            />
          ))}
        </View>

        <SectionTitle>Description</SectionTitle>
        <Field
          label=""
          value={description}
          onChangeText={setDescription}
          placeholder="What happened? Where? Who was involved?"
          multiline numberOfLines={5}
          style={{ minHeight: 120, textAlignVertical: 'top' }}
        />

        <SectionTitle right={
          photos.length > 0 ? (
            <Text style={{ color: theme.textMuted, fontSize: 12 }}>{photos.length}/6</Text>
          ) : undefined
        }>Photos (optional)</SectionTitle>
        <View style={styles.photoRow}>
          {photos.map((p, i) => (
            <View key={i} style={styles.photoWrap}>
              <Image source={{ uri: p.uri }} style={styles.photo} />
              <TouchableOpacity style={styles.remove} onPress={() => removePhoto(i)}>
                <Ionicons name="close" size={14} color="#fff" />
              </TouchableOpacity>
            </View>
          ))}
          {photos.length < 6 && (
            <>
              <TouchableOpacity style={styles.addPhoto} onPress={snapPhoto}>
                <Ionicons name="camera" size={22} color={theme.brand} />
                <Text style={styles.addPhotoLabel}>Camera</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.addPhoto} onPress={pickFromLibrary}>
                <Ionicons name="images" size={22} color={theme.brand} />
                <Text style={styles.addPhotoLabel}>Library</Text>
              </TouchableOpacity>
            </>
          )}
        </View>

        <SectionTitle right={
          voiceNotes.length > 0 ? (
            <Text style={{ color: theme.textMuted, fontSize: 12 }}>{voiceNotes.length}/5</Text>
          ) : undefined
        }>Voice notes (optional)</SectionTitle>

        {voiceNotes.map((v, i) => (
          <View key={v.uri} style={styles.vnRow}>
            <VoiceNotePreview uri={v.uri} />
            <Text style={styles.vnDuration}>{formatDuration(v.durationMs)}</Text>
            <TouchableOpacity onPress={() => removeVoiceNote(i)} hitSlop={8} style={styles.vnRemove}>
              <Ionicons name="trash-outline" size={18} color={theme.danger} />
            </TouchableOpacity>
          </View>
        ))}

        {voiceNotes.length < 5 && (
          <TouchableOpacity
            style={[styles.recordBtn, recording && styles.recordBtnActive]}
            onPress={toggleRecord}
            activeOpacity={0.8}
          >
            <Ionicons
              name={recording ? 'stop' : 'mic'}
              size={20}
              color={recording ? '#fff' : theme.brand}
            />
            <Text style={[styles.recordLabel, recording && { color: '#fff' }]}>
              {recording ? `Recording… ${formatDuration(recElapsed)} · tap to stop` : 'Record voice note'}
            </Text>
          </TouchableOpacity>
        )}

        <View style={{ height: spacing.xl }} />
        <Button
          title="Log Occurrence"
          onPress={submit}
          loading={saving}
          icon={<Ionicons name="checkmark-circle" size={18} color="#fff" />}
        />
      </ScrollView>

      {/* ----- cascading picker sheets ----- */}
      <Sheet
        visible={pickerOpen === 'category'}
        onClose={() => setPickerOpen(null)}
        title="Category"
      >
        <PickerOptionList
          options={categoryOptions}
          selected={category}
          onPick={selectCategory}
        />
      </Sheet>

      <Sheet
        visible={pickerOpen === 'subcategory'}
        onClose={() => setPickerOpen(null)}
        title={category || 'Sub-category'}
      >
        <PickerOptionList
          options={subcategoryOptions}
          selected={subcategory}
          onPick={selectSubcategory}
        />
      </Sheet>

      <Sheet
        visible={pickerOpen === 'type'}
        onClose={() => setPickerOpen(null)}
        title={subcategory || 'Specific type'}
      >
        <PickerOptionList
          options={typeOptions}
          selected={occurrenceType}
          onPick={selectType}
        />
      </Sheet>

      <toast.ToastView />
    </View>
  );
}

// ---------------------------------------------------------------------------
// PickerRow — a dropdown-looking touchable that displays the current value
// (or placeholder) and a chevron. Opens a Sheet on tap.
// ---------------------------------------------------------------------------
function PickerRow({
  value, placeholder, onPress, disabled,
}: {
  value: string; placeholder: string; onPress: () => void; disabled?: boolean;
}) {
  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={disabled}
      activeOpacity={0.7}
      style={[styles.picker, disabled && styles.pickerDisabled]}
    >
      <Text
        style={[
          styles.pickerValue,
          !value && styles.pickerPlaceholder,
        ]}
        numberOfLines={1}
      >
        {value || placeholder}
      </Text>
      <Ionicons
        name="chevron-down"
        size={18}
        color={disabled ? theme.textFaint : theme.textMuted}
      />
    </TouchableOpacity>
  );
}

// ---------------------------------------------------------------------------
// PickerOptionList — list of options shown inside a Sheet. Tap to select.
// ---------------------------------------------------------------------------
function PickerOptionList({
  options, selected, onPick,
}: {
  options: string[]; selected: string; onPick: (v: string) => void;
}) {
  return (
    <View>
      {options.map((opt) => {
        const active = opt === selected;
        return (
          <TouchableOpacity
            key={opt}
            onPress={() => onPick(opt)}
            activeOpacity={0.7}
            style={[styles.option, active && styles.optionActive]}
          >
            <Text style={[styles.optionText, active && styles.optionTextActive]}>
              {opt}
            </Text>
            {active && (
              <Ionicons name="checkmark-circle" size={20} color={theme.brand} />
            )}
          </TouchableOpacity>
        );
      })}
      {options.length === 0 && (
        <Text style={{ color: theme.textMuted, padding: spacing.md, textAlign: 'center' }}>
          No options available.
        </Text>
      )}
    </View>
  );
}

function Chip({ label, active, color, onPress }: {
  label: string; active: boolean; color?: string; onPress: () => void;
}) {
  const c = color ?? theme.brand;
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.7}
      style={[styles.chip, active && { backgroundColor: c + '26', borderColor: c }]}
    >
      <Text style={[styles.chipText, active && { color: c, fontWeight: '700' }]}>{label}</Text>
    </TouchableOpacity>
  );
}

// ---------------------------------------------------------------------------
// VoiceNotePreview — play/stop a just-recorded local clip before submitting.
// ---------------------------------------------------------------------------
function VoiceNotePreview({ uri }: { uri: string }) {
  const [playing, setPlaying] = useState(false);
  const soundRef = useRef<Audio.Sound | null>(null);

  useEffect(() => {
    return () => { soundRef.current?.unloadAsync().catch(() => {}); };
  }, []);

  async function toggle() {
    try {
      if (playing) {
        await soundRef.current?.stopAsync();
        setPlaying(false);
        return;
      }
      if (!soundRef.current) {
        const { sound } = await Audio.Sound.createAsync({ uri }, undefined, (status) => {
          if (status.isLoaded && status.didJustFinish) setPlaying(false);
        });
        soundRef.current = sound;
      }
      await soundRef.current.replayAsync();
      setPlaying(true);
    } catch {
      setPlaying(false);
    }
  }

  return (
    <TouchableOpacity onPress={toggle} style={styles.vnPlay} activeOpacity={0.7}>
      <Ionicons name={playing ? 'stop' : 'play'} size={18} color={theme.brand} />
      <Text style={styles.vnPlayLabel}>{playing ? 'Playing…' : 'Play'}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  queueBanner: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: theme.brand + '14', borderColor: theme.brand,
    borderWidth: 1, borderRadius: 12, padding: 10, marginBottom: spacing.md,
  },
  queueText: { color: theme.brand, fontWeight: '600', fontSize: 13, flex: 1 },

  picker: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: theme.surfaceAlt, borderColor: theme.border, borderWidth: 1,
    borderRadius: radius.md, paddingHorizontal: 14, paddingVertical: 14,
    marginBottom: spacing.sm,
  },
  pickerDisabled: { opacity: 0.5 },
  pickerValue: { flex: 1, color: theme.text, fontSize: 15, fontWeight: '600' },
  pickerPlaceholder: { color: theme.textMuted, fontWeight: '400' },

  option: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: theme.surface, borderColor: theme.border, borderWidth: 1,
    borderRadius: radius.md, paddingHorizontal: 14, paddingVertical: 14,
    marginBottom: 8,
  },
  optionActive: { borderColor: theme.brand, backgroundColor: theme.brandTint },
  optionText: { color: theme.text, fontSize: 14, fontWeight: '600', flex: 1, marginRight: 8 },
  optionTextActive: { color: theme.brand, fontWeight: '700' },

  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    paddingHorizontal: 14, paddingVertical: 8, borderRadius: 999,
    borderWidth: 1, borderColor: theme.border, backgroundColor: theme.surface,
  },
  chipText: { color: theme.textMuted, fontSize: 13 },

  photoRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  photoWrap: { position: 'relative' },
  photo: { width: 84, height: 84, borderRadius: radius.md },
  remove: {
    position: 'absolute', top: -6, right: -6,
    backgroundColor: theme.danger, borderRadius: 999,
    width: 22, height: 22, alignItems: 'center', justifyContent: 'center',
  },
  addPhoto: {
    width: 84, height: 84, borderRadius: radius.md,
    borderWidth: 1, borderColor: theme.border, borderStyle: 'dashed',
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: theme.surface,
    gap: 4,
  },
  addPhotoLabel: { color: theme.textMuted, fontSize: 10, fontWeight: '600' },

  vnRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: theme.surface, borderColor: theme.border, borderWidth: 1,
    borderRadius: radius.md, paddingHorizontal: 12, paddingVertical: 10,
    marginBottom: spacing.sm,
  },
  vnPlay: { flexDirection: 'row', alignItems: 'center', gap: 6, flex: 1 },
  vnPlayLabel: { color: theme.brand, fontSize: 14, fontWeight: '600' },
  vnDuration: { color: theme.textMuted, fontSize: 12, fontVariant: ['tabular-nums'] },
  vnRemove: { padding: 4 },

  recordBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    borderWidth: 1, borderColor: theme.brand, borderStyle: 'dashed',
    borderRadius: radius.md, paddingVertical: 14,
    backgroundColor: theme.surface,
  },
  recordBtnActive: { backgroundColor: theme.danger, borderColor: theme.danger, borderStyle: 'solid' },
  recordLabel: { color: theme.brand, fontSize: 14, fontWeight: '700' },
});
