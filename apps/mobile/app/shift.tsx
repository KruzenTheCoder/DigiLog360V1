// My Shift — clock in / out with a live elapsed counter, optional handover
// note. Lists recent shifts with computed durations.

import { useCallback, useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, Alert, TextInput, RefreshControl,
} from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import { Card, Button, Badge } from '@/components/ui';
import { useToast, SectionTitle, EmptyState, ListRow } from '@/components/primitives';
import { theme, spacing, radius, type } from '@/lib/theme';

interface OpenShift {
  id: string;
  started_at: string;
  site_name: string | null;
}
interface RecentShift {
  id: string;
  started_at: string;
  ended_at: string | null;
  duration_minutes: number | null;
  notes: string | null;
}

export default function ShiftScreen() {
  const router = useRouter();
  const toast = useToast();
  const { profile } = useAuth();

  const [open, setOpen] = useState<OpenShift | null>(null);
  const [recent, setRecent] = useState<RecentShift[]>([]);
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [siteName, setSiteName] = useState<string | null>(null);

  // Live ticker — re-render once per minute so the elapsed counter updates.
  const [, setTick] = useState(0);
  useEffect(() => {
    if (!open) return;
    const id = setInterval(() => setTick((t) => t + 1), 30_000);
    return () => clearInterval(id);
  }, [open]);

  const load = useCallback(async () => {
    if (!profile) return;
    // Site name (used when starting a new shift)
    if (profile.site_id && !siteName) {
      supabase.from('sites').select('name').eq('id', profile.site_id).maybeSingle()
        .then(({ data }) => setSiteName(data?.name ?? null));
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: openRow } = await (supabase as any).from('shifts')
      .select('id, started_at, site_name')
      .eq('user_id', profile.id).is('ended_at', null).maybeSingle();
    setOpen(openRow as OpenShift | null);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: r } = await (supabase as any).from('shifts')
      .select('id, started_at, ended_at, duration_minutes, notes')
      .eq('user_id', profile.id)
      .order('started_at', { ascending: false })
      .limit(20);
    setRecent((r ?? []) as RecentShift[]);
  }, [profile, siteName]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  async function clockIn() {
    if (!profile) return;
    setBusy(true);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (supabase as any).from('shifts').insert({
      user_id: profile.id,
      user_name: profile.full_name ?? profile.email ?? null,
      site_id: profile.site_id,
      site_name: siteName,
    });
    setBusy(false);
    if (error) { toast.show(error.message, 'error'); return; }
    toast.show('Clocked in', 'ok');
    load();
  }

  async function clockOut() {
    if (!open) return;
    const trimmed = notes.trim();
    Alert.alert(
      'End shift',
      trimmed
        ? `Clock out with your closing note?`
        : 'Clock out now? You can still add closing notes.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'End', style: 'destructive', onPress: async () => {
            setBusy(true);
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const { error } = await (supabase as any).from('shifts').update({
              ended_at: new Date().toISOString(),
              notes: trimmed || null,
            }).eq('id', open.id);
            setBusy(false);
            if (error) { toast.show(error.message, 'error'); return; }
            setNotes('');
            toast.show('Clocked out', 'ok');
            load();
          },
        },
      ],
    );
  }

  const minutesOnShift = open
    ? Math.floor((Date.now() - new Date(open.started_at).getTime()) / 60000)
    : 0;
  const hours = Math.floor(minutesOnShift / 60);
  const mins = minutesOnShift % 60;

  return (
    <View style={{ flex: 1, backgroundColor: theme.bg }}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.headerBtn}>
          <Ionicons name="chevron-back" size={26} color={theme.text} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={type.h2}>My Shift</Text>
          {siteName && <Text style={[type.muted, { marginTop: 2 }]}>{siteName}</Text>}
        </View>
      </View>

      <ScrollView
        contentContainerStyle={{ padding: spacing.lg, paddingTop: spacing.sm, paddingBottom: 80 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await load(); setRefreshing(false); }} tintColor={theme.brand} />}
      >
        {open ? (
          <Card style={{ borderColor: theme.success, backgroundColor: theme.successTint }}>
            <View style={styles.shiftTopRow}>
              <View style={styles.liveDot} />
              <Text style={styles.statusTitle}>On shift</Text>
              <View style={{ flex: 1 }} />
              <Badge label="Live" color={theme.success} />
            </View>
            <Text style={styles.duration}>{hours}h {mins}m</Text>
            <Text style={[type.muted, { marginTop: 2 }]}>
              Started {new Date(open.started_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </Text>

            <View style={{ height: spacing.md }} />
            <Text style={styles.label}>Closing notes (optional)</Text>
            <TextInput
              value={notes}
              onChangeText={setNotes}
              multiline numberOfLines={3}
              placeholder="Anything the next guard should know?"
              placeholderTextColor={theme.textMuted}
              style={styles.notes}
            />
            <View style={{ height: spacing.md }} />
            <Button title="Clock Out" variant="danger" loading={busy} onPress={clockOut}
              icon={<Ionicons name="log-out" size={18} color="#fff" />} />
          </Card>
        ) : (
          <Card>
            <Text style={styles.statusTitle}>Not on shift</Text>
            <Text style={[type.muted, { marginTop: 4, marginBottom: spacing.md }]}>
              Tap below to start tracking your time at {siteName ?? 'your site'}.
            </Text>
            <Button title="Clock In" loading={busy} onPress={clockIn}
              icon={<Ionicons name="log-in" size={18} color="#fff" />} />
          </Card>
        )}

        <SectionTitle right={<Text style={[type.muted, { fontSize: 11 }]}>{recent.length}</Text>}>Recent shifts</SectionTitle>
        {recent.length === 0 ? (
          <EmptyState icon="time-outline" title="No shifts yet" hint="Your first one will appear here." />
        ) : (
          recent.map((r) => (
            <ListRow
              key={r.id}
              icon={r.ended_at ? 'checkmark-circle' : 'play-circle'}
              tint={r.ended_at ? theme.success : theme.brand}
              title={formatShiftDate(r.started_at)}
              subtitle={r.ended_at
                ? `${(r.duration_minutes ?? 0).toFixed(0)} min${r.notes ? ' · ' + r.notes.slice(0, 40) : ''}`
                : 'Still active'}
            />
          ))
        )}
      </ScrollView>

      <toast.ToastView />
    </View>
  );
}

function formatShiftDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString([], { weekday: 'short', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingHorizontal: spacing.lg, paddingTop: spacing.xl * 2, paddingBottom: spacing.md,
  },
  headerBtn: { padding: 6 },

  shiftTopRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  liveDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: theme.success },
  statusTitle: { color: theme.text, fontSize: 18, fontWeight: '800' },
  duration: { color: theme.text, fontSize: 36, fontWeight: '800', marginTop: 6, letterSpacing: -0.5 },

  label: { color: theme.textMuted, fontSize: 12, fontWeight: '600', marginBottom: 6 },
  notes: {
    backgroundColor: theme.surfaceAlt, color: theme.text, padding: 12,
    borderRadius: radius.md, borderWidth: 1, borderColor: theme.border,
    minHeight: 80, textAlignVertical: 'top',
  },
});
