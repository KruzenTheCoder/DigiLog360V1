import { useCallback, useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity, RefreshControl,
} from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import { H1, Muted, Badge } from '@/components/ui';
import { theme, spacing, radius } from '@/lib/theme';

interface NotificationRow {
  id: number;
  kind: string;
  title: string;
  body: string | null;
  data: Record<string, unknown> | null;
  read_at: string | null;
  created_at: string;
}

const KIND_ICON: Record<string, keyof typeof Ionicons.glyphMap> = {
  'sla.breach': 'alert-circle',
  'sla.update_due': 'time',
  'manager.acknowledged': 'shield-checkmark',
  'manager.escalated': 'arrow-up-circle',
  'manager.rejected': 'close-circle',
  'occurrence.assigned': 'flag',
  'patrol.late': 'walk',
  'handover.waiting': 'document-text',
  system: 'notifications',
};
const KIND_COLOR: Record<string, string> = {
  'sla.breach': '#dc2626',
  'sla.update_due': '#ea580c',
  'manager.acknowledged': '#16a34a',
  'manager.escalated': '#ea580c',
  'manager.rejected': '#dc2626',
  'occurrence.assigned': '#3b82f6',
  'patrol.late': '#dc2626',
  'handover.waiting': '#8b5cf6',
  system: theme.brand,
};

export default function Inbox() {
  const router = useRouter();
  const { profile } = useAuth();
  const [items, setItems] = useState<NotificationRow[]>([]);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    if (!profile) return;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data } = await (supabase as any)
      .from('notifications')
      .select('*')
      .eq('user_id', profile.id)
      .order('created_at', { ascending: false })
      .limit(100);
    setItems((data ?? []) as NotificationRow[]);
  }, [profile]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  useEffect(() => {
    if (!profile) return;
    const channel = supabase
      .channel('inbox-realtime')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'notifications' }, () => load())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [profile, load]);

  const onRefresh = async () => { setRefreshing(true); await load(); setRefreshing(false); };

  async function open(n: NotificationRow) {
    if (!n.read_at) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (supabase as any).from('notifications').update({ read_at: new Date().toISOString() }).eq('id', n.id);
    }
    const occId = (n.data as { occurrence_id?: number } | null)?.occurrence_id;
    if (occId) router.push(`/occurrence/${occId}`);
    else load();
  }

  async function markAllRead() {
    if (!profile) return;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabase as any).from('notifications').update({ read_at: new Date().toISOString() })
      .eq('user_id', profile.id).is('read_at', null);
    load();
  }

  return (
    <View style={{ flex: 1, backgroundColor: theme.bg, paddingTop: spacing.xl * 2 }}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <Ionicons name="chevron-back" size={26} color={theme.text} />
        </TouchableOpacity>
        <H1>Inbox</H1>
        <TouchableOpacity onPress={markAllRead}>
          <Ionicons name="checkmark-done" size={22} color={theme.textMuted} />
        </TouchableOpacity>
      </View>

      <FlatList
        data={items}
        keyExtractor={(i) => String(i.id)}
        contentContainerStyle={{ padding: spacing.lg }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.brand} />}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Ionicons name="mail-open-outline" size={48} color={theme.textMuted} />
            <Muted>No notifications.</Muted>
          </View>
        }
        renderItem={({ item }) => {
          const icon = KIND_ICON[item.kind] ?? 'notifications';
          const color = KIND_COLOR[item.kind] ?? theme.brand;
          return (
            <TouchableOpacity
              style={[styles.card, !item.read_at && { borderColor: color }]}
              activeOpacity={0.8}
              onPress={() => open(item)}
            >
              <View style={[styles.icon, { backgroundColor: color + '22' }]}>
                <Ionicons name={icon} size={22} color={color} />
              </View>
              <View style={{ flex: 1, minWidth: 0 }}>
                <View style={styles.titleRow}>
                  <Text style={styles.title} numberOfLines={1}>{item.title}</Text>
                  {!item.read_at && <Badge label="New" color={color} />}
                </View>
                {item.body && <Text style={styles.body} numberOfLines={2}>{item.body}</Text>}
                <Text style={styles.date}>{new Date(item.created_at).toLocaleString()}</Text>
              </View>
            </TouchableOpacity>
          );
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: spacing.lg, marginBottom: spacing.md,
  },
  card: {
    flexDirection: 'row', gap: spacing.md, backgroundColor: theme.surface,
    borderRadius: radius.lg, padding: spacing.md, marginBottom: spacing.sm,
    borderWidth: 1, borderColor: theme.border,
  },
  icon: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  title: { color: theme.text, fontWeight: '700', fontSize: 14, flexShrink: 1 },
  body: { color: theme.textMuted, fontSize: 13, marginTop: 2 },
  date: { color: theme.textMuted, fontSize: 11, marginTop: 4 },
  empty: { alignItems: 'center', gap: spacing.md, paddingTop: 80 },
});
