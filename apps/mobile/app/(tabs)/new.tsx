import { useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, Image, Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { useAuth } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import { uploadOccurrenceImage } from '@/lib/storage';
import { Button, Field, H1 } from '@/components/ui';
import { theme, spacing, radius } from '@/lib/theme';
import {
  OCCURRENCE_TYPES, SEVERITIES, SEVERITY_LABELS, SEVERITY_COLORS,
  type SeverityLevel, type Site,
} from '@digilog/shared';

export default function NewOccurrence() {
  const { profile } = useAuth();
  const [type, setType] = useState('');
  const [severity, setSeverity] = useState<SeverityLevel>('medium');
  const [description, setDescription] = useState('');
  const [sites, setSites] = useState<Site[]>([]);
  const [siteId, setSiteId] = useState(profile?.site_id ?? '');
  const [photos, setPhotos] = useState<{ uri: string; base64: string }[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    // Guards may only log for their assigned site (enforced by RLS); offer just that.
    let q = supabase.from('sites').select('*').eq('is_active', true).order('name');
    if (profile?.site_id) q = q.eq('id', profile.site_id);
    q.then(({ data }) => { if (data) setSites(data as Site[]); });
  }, [profile?.site_id]);

  async function addPhoto() {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) { Alert.alert('Camera permission needed'); return; }
    const res = await ImagePicker.launchCameraAsync({ quality: 0.5, base64: true });
    if (!res.canceled && res.assets[0]?.base64) {
      setPhotos((p) => [...p, { uri: res.assets[0].uri, base64: res.assets[0].base64! }]);
    }
  }

  async function submit() {
    if (!type || !description.trim()) { Alert.alert('Please choose a type and add a description.'); return; }
    if (!profile) return;
    setSaving(true);
    try {
      const siteName = sites.find((s) => s.id === siteId)?.name ?? null;
      const { data: occ, error } = await supabase.from('occurrences').insert({
        occurrence_type: type, severity, description: description.trim(),
        incident_at: new Date().toISOString(), site_id: siteId || null, site_name: siteName,
        logged_by: profile.id, logged_by_name: profile.full_name ?? profile.email, status: 'open',
      }).select('id, ob_number').single();
      if (error) throw error;

      for (const photo of photos) {
        try {
          const path = await uploadOccurrenceImage(photo.base64, occ!.ob_number ?? `OB${occ!.id}`);
          await supabase.from('occurrence_images').insert({
            occurrence_id: occ!.id, ob_number: occ!.ob_number, storage_path: path,
            captured_by: profile.id, captured_by_name: profile.full_name ?? profile.email,
          });
        } catch { /* skip a failed photo, keep the occurrence */ }
      }

      Alert.alert('Logged', `Occurrence ${occ?.ob_number} recorded.`);
      setType(''); setDescription(''); setPhotos([]); setSeverity('medium');
    } catch (e: any) {
      Alert.alert('Error', e.message ?? 'Could not log occurrence.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <ScrollView style={{ flex: 1, backgroundColor: theme.bg }} contentContainerStyle={{ padding: spacing.lg, paddingTop: spacing.xl * 2 }}>
      <H1>Log Occurrence</H1>
      <View style={{ height: spacing.lg }} />

      <Text style={styles.label}>Type</Text>
      <View style={styles.chips}>
        {OCCURRENCE_TYPES.map((t) => (
          <Chip key={t} label={t} active={type === t} onPress={() => setType(t)} />
        ))}
      </View>

      <Text style={styles.label}>Severity</Text>
      <View style={styles.chips}>
        {SEVERITIES.map((s) => (
          <Chip key={s} label={SEVERITY_LABELS[s]} active={severity === s}
            color={SEVERITY_COLORS[s]} onPress={() => setSeverity(s)} />
        ))}
      </View>

      {sites.length > 0 && (
        <>
          <Text style={styles.label}>Site</Text>
          <View style={styles.chips}>
            {sites.map((s) => (
              <Chip key={s.id} label={s.name} active={siteId === s.id} onPress={() => setSiteId(s.id)} />
            ))}
          </View>
        </>
      )}

      <View style={{ marginTop: spacing.md }}>
        <Field label="Description" value={description} onChangeText={setDescription}
          placeholder="Describe what happened…" multiline numberOfLines={5}
          style={{ minHeight: 110, textAlignVertical: 'top' }} />
      </View>

      <Text style={styles.label}>Photos</Text>
      <View style={styles.photoRow}>
        {photos.map((p, i) => (
          <View key={i} style={styles.photoWrap}>
            <Image source={{ uri: p.uri }} style={styles.photo} />
            <TouchableOpacity style={styles.remove} onPress={() => setPhotos((arr) => arr.filter((_, idx) => idx !== i))}>
              <Ionicons name="close" size={14} color="#fff" />
            </TouchableOpacity>
          </View>
        ))}
        <TouchableOpacity style={styles.addPhoto} onPress={addPhoto}>
          <Ionicons name="camera" size={26} color={theme.brand} />
        </TouchableOpacity>
      </View>

      <View style={{ height: spacing.lg }} />
      <Button title="Log Occurrence" onPress={submit} loading={saving}
        icon={<Ionicons name="checkmark-circle" size={18} color="#fff" />} />
      <View style={{ height: 40 }} />
    </ScrollView>
  );
}

function Chip({ label, active, color, onPress }: { label: string; active: boolean; color?: string; onPress: () => void }) {
  const c = color ?? theme.brand;
  return (
    <TouchableOpacity onPress={onPress}
      style={[styles.chip, active && { backgroundColor: c + '26', borderColor: c }]}>
      <Text style={[styles.chipText, active && { color: c, fontWeight: '700' }]}>{label}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  label: { color: theme.textMuted, fontSize: 13, fontWeight: '600', marginBottom: 8, marginTop: 4 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: spacing.sm },
  chip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 999, borderWidth: 1, borderColor: theme.border, backgroundColor: theme.surface },
  chipText: { color: theme.textMuted, fontSize: 13 },
  photoRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  photoWrap: { position: 'relative' },
  photo: { width: 72, height: 72, borderRadius: radius.md },
  remove: { position: 'absolute', top: -6, right: -6, backgroundColor: theme.danger, borderRadius: 999, width: 22, height: 22, alignItems: 'center', justifyContent: 'center' },
  addPhoto: { width: 72, height: 72, borderRadius: radius.md, borderWidth: 1, borderColor: theme.border, borderStyle: 'dashed', alignItems: 'center', justifyContent: 'center', backgroundColor: theme.surface },
});
