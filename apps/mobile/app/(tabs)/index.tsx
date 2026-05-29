import { useCallback, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, RefreshControl } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import { Card, Badge } from '@/components/ui';
import { theme, spacing, radius } from '@/lib/theme';
import { ROLE_LABELS } from '@digilog/shared';

export default function Home() {
  const { profile, signOut } = useAuth();
  const router = useRouter();
  const [stats, setStats] = useState({ open: 0, today: 0, activePatrol: false });
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    if (!profile) return;
    const startOfDay = new Date(); startOfDay.setHours(0, 0, 0, 0);
    const [{ count: open }, { count: today }, { data: patrol }] = await Promise.all([
      supabase.from('occurrences').select('id', { count: 'exact', head: true })
        .eq('logged_by', profile.id).not('status', 'in', '(resolved,closed)'),
      supabase.from('occurrences').select('id', { count: 'exact', head: true })
        .eq('logged_by', profile.id).gte('created_at', startOfDay.toISOString()),
      supabase.from('patrols').select('id').eq('guard_id', profile.id).eq('status', 'active').maybeSingle(),
    ]);
    setStats({ open: open ?? 0, today: today ?? 0, activePatrol: !!patrol });
  }, [profile]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const onRefresh = async () => { setRefreshing(true); await load(); setRefreshing(false); };

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: theme.bg }}
      contentContainerStyle={{ padding: spacing.lg, paddingTop: spacing.xl * 2 }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.brand} />}
    >
      <View style={styles.header}>
        <View>
          <Text style={styles.greeting}>Hi, {profile?.full_name?.split(' ')[0] ?? 'Guard'}</Text>
          <Text style={styles.role}>{profile ? ROLE_LABELS[profile.role] : ''}</Text>
        </View>
        <TouchableOpacity onPress={signOut} style={styles.signout}>
          <Ionicons name="log-out-outline" size={22} color={theme.textMuted} />
        </TouchableOpacity>
      </View>

      {stats.activePatrol && (
        <TouchableOpacity onPress={() => router.push('/(tabs)/patrol')}>
          <Card style={{ borderColor: theme.brand, flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            <Ionicons name="walk" size={28} color={theme.brand} />
            <View style={{ flex: 1 }}>
              <Text style={styles.cardTitle}>Patrol in progress</Text>
              <Text style={styles.muted}>Tap to view and scan checkpoints</Text>
            </View>
            <Badge label="Active" color={theme.success} />
          </Card>
        </TouchableOpacity>
      )}

      <View style={styles.statRow}>
        <Card style={styles.stat}>
          <Text style={styles.statNum}>{stats.open}</Text>
          <Text style={styles.muted}>My open</Text>
        </Card>
        <Card style={styles.stat}>
          <Text style={styles.statNum}>{stats.today}</Text>
          <Text style={styles.muted}>Logged today</Text>
        </Card>
      </View>

      <Text style={styles.section}>Quick Actions</Text>
      <View style={styles.actions}>
        <Action icon="add-circle" label="Log Occurrence" onPress={() => router.push('/(tabs)/new')} />
        <Action icon="walk" label="Patrol" onPress={() => router.push('/(tabs)/patrol')} />
        <Action icon="qr-code" label="Scan" onPress={() => router.push('/scan')} />
        <Action icon="list" label="My Logs" onPress={() => router.push('/(tabs)/logs')} />
      </View>
    </ScrollView>
  );
}

function Action({ icon, label, onPress }: { icon: any; label: string; onPress: () => void }) {
  return (
    <TouchableOpacity style={styles.action} onPress={onPress} activeOpacity={0.8}>
      <View style={styles.actionIcon}><Ionicons name={icon} size={26} color={theme.brand} /></View>
      <Text style={styles.actionLabel}>{label}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.lg },
  greeting: { color: theme.text, fontSize: 26, fontWeight: '800' },
  role: { color: theme.textMuted, fontSize: 14, marginTop: 2 },
  signout: { padding: 8 },
  cardTitle: { color: theme.text, fontWeight: '700', fontSize: 15 },
  muted: { color: theme.textMuted, fontSize: 13 },
  statRow: { flexDirection: 'row', gap: spacing.md },
  stat: { flex: 1, alignItems: 'center' },
  statNum: { color: theme.text, fontSize: 32, fontWeight: '800' },
  section: { color: theme.text, fontSize: 17, fontWeight: '700', marginTop: spacing.md, marginBottom: spacing.sm },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md },
  action: { width: '47%', backgroundColor: theme.surface, borderRadius: radius.lg, padding: spacing.lg, alignItems: 'center', borderWidth: 1, borderColor: theme.border },
  actionIcon: { width: 52, height: 52, borderRadius: 16, backgroundColor: theme.brand + '22', alignItems: 'center', justifyContent: 'center', marginBottom: 8 },
  actionLabel: { color: theme.text, fontWeight: '600', fontSize: 14 },
});
