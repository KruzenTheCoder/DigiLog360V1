import { useCallback, useState } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, RefreshControl } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { useAuth } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import { Badge, H1, Muted } from '@/components/ui';
import { theme, spacing, radius } from '@/lib/theme';
import {
  SEVERITY_COLORS, SEVERITY_LABELS, STATUS_COLORS, STATUS_LABELS, type Occurrence,
} from '@digilog/shared';

export default function MyLogs() {
  const { profile } = useAuth();
  const router = useRouter();
  const [items, setItems] = useState<Occurrence[]>([]);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    if (!profile) return;
    const { data } = await supabase.from('occurrences').select('*')
      .eq('logged_by', profile.id).order('created_at', { ascending: false }).limit(100);
    setItems((data ?? []) as Occurrence[]);
  }, [profile]);

  useFocusEffect(useCallback(() => { load(); }, [load]));
  const onRefresh = async () => { setRefreshing(true); await load(); setRefreshing(false); };

  return (
    <View style={{ flex: 1, backgroundColor: theme.bg, paddingTop: spacing.xl * 2 }}>
      <View style={{ paddingHorizontal: spacing.lg, marginBottom: spacing.md }}>
        <H1>My Logs</H1>
      </View>
      <FlatList
        data={items}
        keyExtractor={(i) => String(i.id)}
        contentContainerStyle={{ padding: spacing.lg, paddingTop: 0 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.brand} />}
        ListEmptyComponent={<Muted>No occurrences logged yet.</Muted>}
        renderItem={({ item }) => (
          <TouchableOpacity onPress={() => router.push(`/occurrence/${item.id}`)} activeOpacity={0.8}>
            <View style={styles.card}>
              <View style={styles.row}>
                <Text style={styles.ob}>{item.ob_number}</Text>
                <View style={styles.badges}>
                  <Badge label={SEVERITY_LABELS[item.severity]} color={SEVERITY_COLORS[item.severity]} />
                  <Badge label={STATUS_LABELS[item.status]} color={STATUS_COLORS[item.status]} />
                </View>
              </View>
              <Text style={styles.type}>{item.occurrence_type}</Text>
              <Text style={styles.desc} numberOfLines={2}>{item.description}</Text>
              <Text style={styles.date}>{new Date(item.incident_at).toLocaleString()}</Text>
            </View>
          </TouchableOpacity>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: theme.surface, borderRadius: radius.lg, padding: spacing.lg, marginBottom: spacing.md, borderWidth: 1, borderColor: theme.border },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  ob: { color: theme.brand, fontWeight: '800', fontSize: 15 },
  badges: { flexDirection: 'row', gap: 6 },
  type: { color: theme.text, fontWeight: '600', marginTop: 6 },
  desc: { color: theme.textMuted, marginTop: 2, fontSize: 13 },
  date: { color: theme.textMuted, fontSize: 11, marginTop: 6 },
});
