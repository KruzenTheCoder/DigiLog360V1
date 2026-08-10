// Supervisor's live SLA board for their site.
// Shows open occurrences with SLA state, lets the supervisor tap any of them
// to update status via a bottom sheet (no need to navigate away).

import { useCallback, useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, RefreshControl, Alert,
} from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import { profileSiteIds } from '@digilog/shared';
import { Badge, Field, Button } from '@/components/ui';
import {
  Sheet, EmptyState, SkeletonRow, useToast, SectionTitle,
} from '@/components/primitives';
import { theme, spacing, radius, type } from '@/lib/theme';
import {
  SEVERITY_COLORS, SEVERITY_LABELS, STATUS_COLORS, STATUS_LABELS,
  OCCURRENCE_STATUSES, hasAnyRole,
  type LiveOccurrence, type OccurrenceStatus,
} from '@digilog/shared';

export default function SupervisorBoard() {
  const router = useRouter();
  const { profile } = useAuth();
  const toast = useToast();

  // Guard: this surface is for supervisors and up only.
  useEffect(() => {
    if (profile && !hasAnyRole(profile, ['supervisor', 'manager', 'control_room', 'admin', 'super_user'])) {
      router.replace('/(tabs)');
    }
  }, [profile, router]);
  const [items, setItems] = useState<LiveOccurrence[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [target, setTarget] = useState<LiveOccurrence | null>(null);

  const load = useCallback(async () => {
    const mySites = profileSiteIds(profile);
    if (mySites.length === 0) {
      setItems([]); setLoading(false);
      return;
    }
    setLoading(true);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data } = await (supabase as any).from('occurrences_live').select('*')
      .in('site_id', mySites).order('incident_at', { ascending: false });
    setItems((data ?? []) as LiveOccurrence[]);
    setLoading(false);
  }, [profile]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  // Realtime updates from any occurrence row at my site(s).
  useEffect(() => {
    const mySites = profileSiteIds(profile);
    if (mySites.length === 0) return;
    const ch = supabase
      .channel(`supervisor-board-${mySites.join('-')}`)
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'occurrences',
        filter: `site_id=in.(${mySites.join(',')})`,
      }, () => load())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [profile, load]);

  const breached = items.filter((o) => o.is_sla_breached);
  const due = items.filter((o) => o.is_sla_update_due && !o.is_sla_breached);
  const onTrack = items.filter((o) => !o.is_sla_breached && !o.is_sla_update_due);

  return (
    <View style={{ flex: 1, backgroundColor: theme.bg }}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.headerBtn}>
          <Ionicons name="chevron-back" size={26} color={theme.text} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={type.h2}>Site Board</Text>
          <Text style={[type.muted, { marginTop: 2 }]}>Live SLA · {items.length} open</Text>
        </View>
      </View>

      <ScrollView
        contentContainerStyle={{ paddingBottom: 24 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await load(); setRefreshing(false); }} tintColor={theme.brand} />}
      >
        {/* ----- SLA strip ----- */}
        <View style={styles.statsRow}>
          <Stat label="Breached" value={breached.length} tint={theme.danger} />
          <Stat label="Update due" value={due.length} tint={theme.warning} />
          <Stat label="On track" value={onTrack.length} tint={theme.success} />
        </View>

        {loading ? (
          <View style={{ paddingHorizontal: spacing.lg }}>
            <SkeletonRow /><SkeletonRow /><SkeletonRow />
          </View>
        ) : items.length === 0 ? (
          <EmptyState
            icon="shield-checkmark-outline"
            title="All clear"
            hint="No open occurrences at your site."
          />
        ) : (
          <>
            {breached.length > 0 && (
              <>
                <SectionTitle>Breached SLA</SectionTitle>
                {breached.map((o) => (
                  <OccCard key={o.id} occ={o} onPress={() => setTarget(o)} highlight="danger" />
                ))}
              </>
            )}
            {due.length > 0 && (
              <>
                <SectionTitle>Update due</SectionTitle>
                {due.map((o) => (
                  <OccCard key={o.id} occ={o} onPress={() => setTarget(o)} highlight="warning" />
                ))}
              </>
            )}
            {onTrack.length > 0 && (
              <>
                <SectionTitle>On track</SectionTitle>
                {onTrack.map((o) => (
                  <OccCard key={o.id} occ={o} onPress={() => setTarget(o)} />
                ))}
              </>
            )}
          </>
        )}
      </ScrollView>

      <UpdateSheet
        target={target}
        onClose={() => setTarget(null)}
        userId={profile?.id ?? ''}
        userName={profile?.full_name ?? profile?.email ?? 'Supervisor'}
        onDone={() => { setTarget(null); load(); toast.show('Updated', 'ok'); }}
      />
      <toast.ToastView />
    </View>
  );
}

// ---------------------------------------------------------------------------
function Stat({ label, value, tint }: { label: string; value: number; tint: string }) {
  return (
    <View style={[styles.statCard, { borderColor: tint + '40' }]}>
      <Text style={[styles.statValue, { color: tint }]}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

function OccCard({
  occ, onPress, highlight,
}: { occ: LiveOccurrence; onPress: () => void; highlight?: 'danger' | 'warning' }) {
  const borderColor = highlight === 'danger' ? theme.danger
    : highlight === 'warning' ? theme.warning
    : theme.border;
  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.85}>
      <View style={[styles.occCard, { borderColor }]}>
        <View style={styles.occHeader}>
          <Text style={styles.occOb}>{occ.ob_number}</Text>
          <View style={{ flexDirection: 'row', gap: 4 }}>
            <Badge label={SEVERITY_LABELS[occ.severity]} color={SEVERITY_COLORS[occ.severity]} />
            <Badge label={STATUS_LABELS[occ.status]} color={STATUS_COLORS[occ.status]} />
          </View>
        </View>
        <Text style={styles.occType}>{occ.occurrence_type}</Text>
        <Text style={styles.occDesc} numberOfLines={2}>{occ.description}</Text>
        <View style={styles.occFooter}>
          <Text style={styles.occMeta}>{occ.logged_by_name ?? '—'}</Text>
          <Text style={[styles.occMeta, highlight === 'danger' && { color: theme.danger, fontWeight: '700' }]}>
            {occ.minutes_remaining == null
              ? '—'
              : occ.minutes_remaining < 0
                ? `${Math.abs(Math.round(occ.minutes_remaining))}m overdue`
                : `${Math.round(occ.minutes_remaining)}m left`}
          </Text>
        </View>
      </View>
    </TouchableOpacity>
  );
}

function UpdateSheet({
  target, onClose, userId, userName, onDone,
}: {
  target: LiveOccurrence | null; onClose: () => void;
  userId: string; userName: string; onDone: () => void;
}) {
  const [status, setStatus] = useState<OccurrenceStatus>('in_progress');
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (target) { setStatus(target.status); setNotes(''); }
  }, [target]);

  async function save() {
    if (!target || !notes.trim()) { Alert.alert('Notes required'); return; }
    setBusy(true);
    const ts = new Date().toISOString();
    await supabase.from('occurrence_updates').insert({
      occurrence_id: target.id, ob_number: target.ob_number,
      notes: notes.trim(), status,
      updated_by: userId, updated_by_name: userName,
    });
    await supabase.from('occurrences')
      .update({ status, last_sla_update_at: ts })
      .eq('id', target.id);
    // Fire-and-forget: flush the email outbox so the assigned reviewer's
    // update email goes out immediately (cron catches it otherwise).
    void supabase.functions.invoke('task-alerts', { body: {} }).catch(() => {});
    setBusy(false);
    onDone();
  }

  return (
    <Sheet visible={!!target} onClose={onClose}
      title={target ? `Update ${target.ob_number}` : 'Update'}>
      {target && (
        <>
          <View style={styles.preview}>
            <Text style={[type.h3, { marginBottom: 4 }]}>{target.occurrence_type}</Text>
            <Text style={[type.bodySm, { color: theme.textMuted }]}>{target.description}</Text>
          </View>

          <Text style={[type.label, { marginTop: spacing.md, marginBottom: 6 }]}>New status</Text>
          <View style={styles.statusRow}>
            {OCCURRENCE_STATUSES.map((s) => (
              <TouchableOpacity
                key={s}
                onPress={() => setStatus(s)}
                style={[
                  styles.statusChip,
                  status === s && { backgroundColor: STATUS_COLORS[s] + '33', borderColor: STATUS_COLORS[s] },
                ]}
              >
                <Text style={[styles.statusChipText, status === s && { color: STATUS_COLORS[s], fontWeight: '700' }]}>
                  {STATUS_LABELS[s]}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          <Field label="Update notes *" value={notes} onChangeText={setNotes}
            multiline numberOfLines={4} placeholder="What changed?"
            style={{ minHeight: 80, textAlignVertical: 'top' }} />

          <Button title="Post Update" onPress={save} loading={busy}
            icon={<Ionicons name="send" size={18} color="#fff" />} />
        </>
      )}
    </Sheet>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingHorizontal: spacing.lg, paddingTop: spacing.xl * 2, paddingBottom: spacing.md,
  },
  headerBtn: { padding: 6 },

  statsRow: { flexDirection: 'row', gap: spacing.sm, padding: spacing.lg, paddingTop: 0 },
  statCard: {
    flex: 1, backgroundColor: theme.surface, borderWidth: 1,
    borderRadius: radius.lg, padding: spacing.md, alignItems: 'center',
  },
  statValue: { fontSize: 24, fontWeight: '800' },
  statLabel: { color: theme.textMuted, fontSize: 11, marginTop: 2 },

  occCard: {
    backgroundColor: theme.surface, borderWidth: 1,
    borderRadius: 16, padding: spacing.lg, marginHorizontal: spacing.lg, marginBottom: spacing.sm,
  },
  occHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  occOb: { color: theme.text, fontWeight: '800', fontSize: 15 },
  occType: { color: theme.text, fontWeight: '600', marginTop: 6 },
  occDesc: { color: theme.textMuted, fontSize: 13, marginTop: 2 },
  occFooter: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    marginTop: spacing.sm,
  },
  occMeta: { color: theme.textMuted, fontSize: 11 },

  preview: { backgroundColor: theme.surfaceAlt, padding: spacing.md, borderRadius: 12 },

  statusRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: spacing.md },
  statusChip: {
    paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999,
    borderWidth: 1, borderColor: theme.border, backgroundColor: theme.surfaceAlt,
  },
  statusChipText: { color: theme.textMuted, fontSize: 12 },
});
