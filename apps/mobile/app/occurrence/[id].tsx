import { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Image, TouchableOpacity } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '@/lib/supabase';
import { Badge, Muted } from '@/components/ui';
import { theme, spacing, radius } from '@/lib/theme';
import {
  SEVERITY_COLORS, SEVERITY_LABELS, STATUS_COLORS, STATUS_LABELS, STORAGE_BUCKET,
  type Occurrence, type OccurrenceUpdate, type OccurrenceImage,
} from '@digilog/shared';

export default function OccurrenceDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const [occ, setOcc] = useState<Occurrence | null>(null);
  const [updates, setUpdates] = useState<OccurrenceUpdate[]>([]);
  const [imageUrls, setImageUrls] = useState<string[]>([]);

  useEffect(() => {
    (async () => {
      const { data: o } = await supabase.from('occurrences').select('*').eq('id', Number(id)).single();
      setOcc(o as Occurrence);
      const { data: u } = await supabase.from('occurrence_updates').select('*')
        .eq('occurrence_id', Number(id)).order('created_at', { ascending: false });
      setUpdates((u ?? []) as OccurrenceUpdate[]);
      const { data: imgs } = await supabase.from('occurrence_images').select('*').eq('occurrence_id', Number(id));
      const paths = ((imgs ?? []) as OccurrenceImage[]).map((i) => i.storage_path);
      if (paths.length) {
        const { data: signed } = await supabase.storage.from(STORAGE_BUCKET).createSignedUrls(paths, 3600);
        setImageUrls((signed ?? []).map((s) => s.signedUrl).filter(Boolean) as string[]);
      }
    })();
  }, [id]);

  if (!occ) return <View style={{ flex: 1, backgroundColor: theme.bg }} />;

  return (
    <ScrollView style={{ flex: 1, backgroundColor: theme.bg }} contentContainerStyle={{ padding: spacing.lg, paddingTop: spacing.xl * 2 }}>
      <TouchableOpacity onPress={() => router.back()} style={{ marginBottom: spacing.md }}>
        <Ionicons name="chevron-back" size={26} color={theme.text} />
      </TouchableOpacity>

      <Text style={styles.ob}>{occ.ob_number}</Text>
      <View style={{ flexDirection: 'row', gap: 6, marginTop: 6 }}>
        <Badge label={SEVERITY_LABELS[occ.severity]} color={SEVERITY_COLORS[occ.severity]} />
        <Badge label={STATUS_LABELS[occ.status]} color={STATUS_COLORS[occ.status]} />
      </View>

      <View style={styles.card}>
        <Detail label="Type" value={occ.occurrence_type} />
        <Detail label="Site" value={occ.site_name ?? '—'} />
        <Detail label="Incident" value={new Date(occ.incident_at).toLocaleString()} />
        <Detail label="Logged" value={new Date(occ.created_at).toLocaleString()} />
      </View>

      <Text style={styles.section}>Description</Text>
      <Text style={styles.body}>{occ.description}</Text>

      {imageUrls.length > 0 && (
        <>
          <Text style={styles.section}>Photos</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            {imageUrls.map((u, i) => <Image key={i} source={{ uri: u }} style={styles.photo} />)}
          </ScrollView>
        </>
      )}

      <Text style={styles.section}>Updates</Text>
      {updates.length === 0 ? <Muted>No updates yet.</Muted> : updates.map((u) => (
        <View key={u.id} style={styles.update}>
          <Badge label={STATUS_LABELS[u.status]} color={STATUS_COLORS[u.status]} />
          <Text style={styles.body}>{u.notes}</Text>
          <Text style={styles.date}>{u.updated_by_name} · {new Date(u.created_at).toLocaleString()}</Text>
        </View>
      ))}
      <View style={{ height: 40 }} />
    </ScrollView>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.detailRow}>
      <Text style={styles.detailLabel}>{label}</Text>
      <Text style={styles.detailValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  ob: { color: theme.text, fontSize: 26, fontWeight: '800' },
  card: { backgroundColor: theme.surface, borderRadius: radius.lg, padding: spacing.lg, marginTop: spacing.lg, borderWidth: 1, borderColor: theme.border },
  detailRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 6 },
  detailLabel: { color: theme.textMuted, fontSize: 13 },
  detailValue: { color: theme.text, fontSize: 13, fontWeight: '600', flexShrink: 1, textAlign: 'right' },
  section: { color: theme.text, fontSize: 16, fontWeight: '700', marginTop: spacing.lg, marginBottom: spacing.sm },
  body: { color: theme.text, fontSize: 14, lineHeight: 20 },
  photo: { width: 120, height: 120, borderRadius: radius.md, marginRight: 10 },
  update: { backgroundColor: theme.surface, borderRadius: radius.md, padding: spacing.md, marginBottom: spacing.sm, borderWidth: 1, borderColor: theme.border, gap: 6 },
  date: { color: theme.textMuted, fontSize: 11 },
});
