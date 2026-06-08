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

import { useCallback, useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, Image, Alert,
} from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { useAuth } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import { uploadOccurrenceImage } from '@/lib/storage';
import { enqueueOccurrence, isOnline, flushQueue, pendingCount, clearQueue, inspectQueue } from '@/lib/offline-queue';
import { Button, Field } from '@/components/ui';
import { useToast, SectionTitle, Sheet, haptic } from '@/components/primitives';
import { theme, spacing, radius, type } from '@/lib/theme';
import {
  SEVERITIES, SEVERITY_LABELS, SEVERITY_COLORS,
  mergeIncidentCategories, mergeIncidentSubcategories, mergeIncidentTypes,
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

  // 3-level cascading classification.
  const [category, setCategory] = useState('');
  const [subcategory, setSubcategory] = useState('');
  const [occurrenceType, setOccurrenceType] = useState('');

  // Which picker sheet is open (null = closed).
  const [pickerOpen, setPickerOpen] = useState<null | 'category' | 'subcategory' | 'type'>(null);

  const [severity, setSeverity] = useState<SeverityLevel>('medium');
  const [description, setDescription] = useState('');
  const [photos, setPhotos] = useState<{ uri: string; base64: string }[]>([]);
  const [saving, setSaving] = useState(false);
  const [pending, setPending] = useState(0);

  // Cascaded option lists — built-in taxonomy + active org-custom at every
  // level. Recompute whenever the upstream selection changes.
  const categoryOptions = mergeIncidentCategories(orgCategories);
  const subcategoryOptions = mergeIncidentSubcategories(category, orgSubcategories);
  const typeOptions = mergeIncidentTypes(category, subcategory, orgTypes);

  useFocusEffect(useCallback(() => {
    setSaving(false);
    pendingCount().then(setPending);
  }, []));

  // Load site name + the org's custom taxonomy (categories, sub-categories,
  // types). All three tables are queried in parallel; each is a no-op fallback
  // if its table isn't deployed yet.
  useEffect(() => {
    if (!profile?.site_id) { setSiteName(null); }
    else {
      supabase.from('sites').select('name').eq('id', profile.site_id).maybeSingle()
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
  // Submit
  // ----------------------------------------------------------------------
  function resetForm() {
    setCategory(''); setSubcategory(''); setOccurrenceType('');
    setDescription(''); setPhotos([]); setSeverity('medium');
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
      site_id: profile.site_id ?? null,
      site_name: siteName,
      logged_by: profile.id,
      logged_by_name: profile.full_name ?? profile.email,
      status: 'open' as const,
    };

    const online = await isOnline();

    if (!online) {
      await enqueueOccurrence({
        occurrence, photos: photos.map((p) => ({ base64: p.base64 })),
      });
      const left = await pendingCount();
      setPending(left);
      setSaving(false);
      resetForm();
      toast.show(`Saved offline · ${left} waiting to sync`, 'info');
      return;
    }

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

      setSaving(false);
      resetForm();
      haptic('success');
      toast.show(`${occ.ob_number} logged`, 'ok');

      // Opportunistically drain the queue.
      flushQueue().then((r) => setPending(r.remaining));

      // Navigate to detail so the user sees their submission landed.
      setTimeout(() => router.push(`/occurrence/${occ.id}`), 300);
    } catch (e) {
      // Network died mid-request → queue for retry.
      await enqueueOccurrence({
        occurrence, photos: photos.map((p) => ({ base64: p.base64 })),
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
});
