// Tasks — inbox of items assigned to ME, with status update sheet.
//
// Anyone can be assigned a task (guards, supervisors). Reviewers can also
// create tasks for others; for now the mobile app focuses on "do my tasks".

import { useCallback, useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity, RefreshControl, Alert,
} from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import { Badge, Button, Field } from '@/components/ui';
import {
  Sheet, EmptyState, SkeletonRow, useToast, SectionTitle,
} from '@/components/primitives';
import { theme, spacing, radius, type } from '@/lib/theme';
import {
  TASK_STATUSES, TASK_STATUS_LABELS, TASK_STATUS_COLORS,
  TASK_PRIORITY_LABELS, TASK_PRIORITY_COLORS,
  type Task, type TaskStatus,
} from '@digilog/shared';

export default function TasksScreen() {
  const router = useRouter();
  const { profile } = useAuth();
  const toast = useToast();

  const [items, setItems] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [target, setTarget] = useState<Task | null>(null);

  const load = useCallback(async () => {
    if (!profile) return;
    setLoading(true);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data } = await (supabase as any).from('tasks').select('*')
      .eq('assigned_to', profile.id)
      .order('status', { ascending: true })
      .order('due_at', { ascending: true, nullsFirst: false })
      .limit(200);
    setItems((data ?? []) as Task[]);
    setLoading(false);
  }, [profile]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  // Realtime: tasks assigned to me or status changing.
  useEffect(() => {
    if (!profile) return;
    const ch = supabase
      .channel(`tasks-mine-${profile.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'tasks', filter: `assigned_to=eq.${profile.id}` }, () => load())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [profile, load]);

  const now = Date.now();
  const open = items.filter((t) => t.status !== 'done' && t.status !== 'cancelled');
  const done = items.filter((t) => t.status === 'done' || t.status === 'cancelled');
  const overdue = open.filter((t) => t.due_at && new Date(t.due_at).getTime() < now);

  return (
    <View style={{ flex: 1, backgroundColor: theme.bg }}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.headerBtn}>
          <Ionicons name="chevron-back" size={26} color={theme.text} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={type.h2}>My Tasks</Text>
          <Text style={[type.muted, { marginTop: 2 }]}>
            {open.length} open · {overdue.length} overdue · {done.length} closed
          </Text>
        </View>
      </View>

      <FlatList
        data={[...open, ...done]}
        keyExtractor={(t) => String(t.id)}
        contentContainerStyle={{ padding: spacing.lg, paddingBottom: 80 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await load(); setRefreshing(false); }} tintColor={theme.brand} />}
        ListEmptyComponent={
          loading ? (
            <View><SkeletonRow /><SkeletonRow /><SkeletonRow /></View>
          ) : (
            <EmptyState icon="checkmark-done-circle-outline"
              title="No tasks assigned"
              hint="When a supervisor or manager assigns you something, it shows up here." />
          )
        }
        renderItem={({ item }) => {
          const overdueRow = item.due_at
            && new Date(item.due_at).getTime() < now
            && item.status !== 'done' && item.status !== 'cancelled';
          return (
            <TouchableOpacity
              onPress={() => setTarget(item)}
              activeOpacity={0.85}
              style={[styles.card, overdueRow && styles.overdueCard]}
            >
              <View style={styles.cardTop}>
                <Text style={styles.cardTitle} numberOfLines={2}>{item.title}</Text>
                <Badge label={TASK_PRIORITY_LABELS[item.priority]} color={TASK_PRIORITY_COLORS[item.priority]} />
              </View>
              {item.description && (
                <Text style={styles.cardDesc} numberOfLines={2}>{item.description}</Text>
              )}
              <View style={styles.cardFooter}>
                <Badge label={TASK_STATUS_LABELS[item.status]} color={TASK_STATUS_COLORS[item.status]} />
                <Text style={[styles.cardMeta, overdueRow && { color: theme.danger, fontWeight: '700' }]}>
                  {item.due_at
                    ? (overdueRow ? 'Overdue · ' : 'Due ') + new Date(item.due_at).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
                    : 'No due date'}
                </Text>
              </View>
              {item.ob_number && (
                <Text style={styles.linkOb}>Linked to {item.ob_number}</Text>
              )}
            </TouchableOpacity>
          );
        }}
      />

      <UpdateSheet
        target={target} onClose={() => setTarget(null)}
        currentUserId={profile?.id ?? ''}
        currentUserName={profile?.full_name ?? profile?.email ?? 'User'}
        onDone={() => { setTarget(null); load(); toast.show('Task updated', 'ok'); }}
      />

      <toast.ToastView />
    </View>
  );
}

function UpdateSheet({
  target, onClose, currentUserId, currentUserName, onDone,
}: {
  target: Task | null; onClose: () => void;
  currentUserId: string; currentUserName: string; onDone: () => void;
}) {
  const [status, setStatus] = useState<TaskStatus>(target?.status ?? 'open');
  const [notes, setNotes] = useState('');
  const [completionNotes, setCompletionNotes] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (target) { setStatus(target.status); setNotes(''); setCompletionNotes(''); }
  }, [target]);

  async function save() {
    if (!target) return;
    if (status === target.status && !notes.trim()) {
      Alert.alert('Nothing to post', 'Change the status or add a note.');
      return;
    }
    setBusy(true);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error: uErr } = await (supabase as any).from('task_updates').insert({
      task_id: target.id,
      previous_status: target.status,
      new_status: status,
      notes: notes.trim() || null,
      updated_by: currentUserId,
      updated_by_name: currentUserName,
    });
    if (!uErr) {
      const patch: Record<string, unknown> = { status };
      if ((status === 'done' || status === 'cancelled') && completionNotes.trim()) {
        patch.completion_notes = completionNotes.trim();
      }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (supabase as any).from('tasks').update(patch).eq('id', target.id);
    }

    setBusy(false);
    if (!uErr) onDone();
    else Alert.alert('Could not save', uErr.message);
  }

  if (!target) return null;
  return (
    <Sheet visible={!!target} onClose={onClose} title={target.title}>
      {target.description && (
        <Text style={[type.bodySm, { color: theme.textMuted, marginBottom: spacing.md }]}>
          {target.description}
        </Text>
      )}

      <SectionTitle>New status</SectionTitle>
      <View style={styles.statusRow}>
        {TASK_STATUSES.map((s: TaskStatus) => (
          <TouchableOpacity
            key={s}
            onPress={() => setStatus(s)}
            style={[
              styles.statusChip,
              status === s && { backgroundColor: TASK_STATUS_COLORS[s] + '33', borderColor: TASK_STATUS_COLORS[s] },
            ]}
          >
            <Text style={[styles.statusChipText, status === s && { color: TASK_STATUS_COLORS[s], fontWeight: '700' }]}>
              {TASK_STATUS_LABELS[s]}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <Field
        label="Notes"
        value={notes}
        onChangeText={setNotes}
        multiline numberOfLines={4}
        placeholder="What did you do? What's blocking?"
        style={{ minHeight: 80, textAlignVertical: 'top' }}
      />

      {(status === 'done' || status === 'cancelled') && (
        <Field
          label="Completion summary (saved on the task)"
          value={completionNotes}
          onChangeText={setCompletionNotes}
          placeholder="Short outcome — was it fixed? Were goods recovered?"
        />
      )}

      <Button title="Post update" onPress={save} loading={busy}
        icon={<Ionicons name="send" size={18} color="#fff" />} />
    </Sheet>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingHorizontal: spacing.lg, paddingTop: spacing.xl * 2, paddingBottom: spacing.md,
  },
  headerBtn: { padding: 6 },

  card: {
    backgroundColor: theme.surface, borderColor: theme.border, borderWidth: 1,
    borderRadius: 14, padding: spacing.md, marginBottom: spacing.sm,
  },
  overdueCard: { borderColor: theme.danger, backgroundColor: theme.dangerTint },
  cardTop: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 },
  cardTitle: { color: theme.text, fontWeight: '700', fontSize: 15, flex: 1 },
  cardDesc: { color: theme.textMuted, fontSize: 13, marginTop: 4 },
  cardFooter: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 8 },
  cardMeta: { color: theme.textMuted, fontSize: 12 },
  linkOb: { color: theme.brand, fontSize: 11, marginTop: 4 },

  statusRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: spacing.md },
  statusChip: {
    paddingHorizontal: 12, paddingVertical: 7, borderRadius: 999,
    borderWidth: 1, borderColor: theme.border, backgroundColor: theme.surfaceAlt,
  },
  statusChipText: { color: theme.textMuted, fontSize: 12 },
});
