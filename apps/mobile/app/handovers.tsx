// Shift handover inbox + new-handover form.
// Outgoing guard files a handover; incoming guard acknowledges. Signature
// captured for the audit trail.

import { useCallback, useRef, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, RefreshControl, Alert,
} from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import { Button, Field } from '@/components/ui';
import { Sheet, EmptyState, SkeletonRow, useToast, ListRow, SectionTitle } from '@/components/primitives';
import { SignatureCanvas, type SignatureCanvasHandle } from '@/components/signature-canvas';
import { theme, spacing, type } from '@/lib/theme';

interface Handover {
  id: number;
  site_id: string | null;
  outgoing_name: string | null;
  incoming_name: string | null;
  outgoing_user_id: string | null;
  incoming_user_id: string | null;
  occurred_at: string;
  summary: string;
  open_issues: string | null;
  acknowledged_at: string | null;
}

export default function HandoversScreen() {
  const router = useRouter();
  const { profile } = useAuth();
  const toast = useToast();
  const [items, setItems] = useState<Handover[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [newOpen, setNewOpen] = useState(false);

  const load = useCallback(async () => {
    if (!profile) return;
    setLoading(true);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data } = await (supabase as any).from('shift_handovers').select('*')
      .order('occurred_at', { ascending: false }).limit(100);
    setItems((data ?? []) as Handover[]);
    setLoading(false);
  }, [profile]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  async function acknowledge(h: Handover) {
    if (!profile) return;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (supabase as any).from('shift_handovers').update({
      acknowledged_at: new Date().toISOString(),
      incoming_user_id: profile.id,
      incoming_name: profile.full_name ?? profile.email ?? null,
    }).eq('id', h.id);
    if (error) toast.show(error.message, 'error');
    else { toast.show('Handover acknowledged', 'ok'); load(); }
  }

  const inbox = items.filter((h) => !h.acknowledged_at);
  const history = items.filter((h) => h.acknowledged_at);

  return (
    <View style={{ flex: 1, backgroundColor: theme.bg }}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.headerBtn}>
          <Ionicons name="chevron-back" size={26} color={theme.text} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={type.h2}>Shift Handovers</Text>
          <Text style={[type.muted, { marginTop: 2 }]}>
            {inbox.length} waiting · {history.length} acknowledged
          </Text>
        </View>
        <TouchableOpacity onPress={() => setNewOpen(true)} style={styles.headerBtn}>
          <Ionicons name="create-outline" size={22} color={theme.brand} />
        </TouchableOpacity>
      </View>

      <ScrollView
        contentContainerStyle={{ paddingBottom: 80 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await load(); setRefreshing(false); }} tintColor={theme.brand} />}
      >
        {loading ? (
          <View style={{ paddingHorizontal: spacing.lg }}>
            <SkeletonRow /><SkeletonRow />
          </View>
        ) : items.length === 0 ? (
          <EmptyState
            icon="document-text-outline"
            title="No handovers yet"
            hint="File one at the end of your shift to brief the next team."
            action={{ label: 'New handover', onPress: () => setNewOpen(true) }}
          />
        ) : (
          <>
            {inbox.length > 0 && (
              <>
                <Text style={styles.section}>Waiting on you</Text>
                {inbox.map((h) => (
                  <View key={h.id} style={styles.card}>
                    <View style={styles.cardHeader}>
                      <View>
                        <Text style={styles.cardFrom}>From {h.outgoing_name ?? 'previous shift'}</Text>
                        <Text style={styles.cardWhen}>{new Date(h.occurred_at).toLocaleString()}</Text>
                      </View>
                      <View style={styles.unreadPill}><Text style={styles.unreadPillText}>NEW</Text></View>
                    </View>
                    <Text style={styles.cardBody}>{h.summary}</Text>
                    {h.open_issues && (
                      <View style={styles.issuesBox}>
                        <Text style={styles.issuesLabel}>Open issues</Text>
                        <Text style={styles.cardBody}>{h.open_issues}</Text>
                      </View>
                    )}
                    <Button title="Acknowledge" onPress={() => acknowledge(h)}
                      icon={<Ionicons name="checkmark-circle" size={18} color="#fff" />} />
                  </View>
                ))}
              </>
            )}

            {history.length > 0 && (
              <>
                <SectionTitle>History</SectionTitle>
                {history.slice(0, 15).map((h) => (
                  <ListRow
                    key={h.id}
                    icon="checkmark-done"
                    title={`From ${h.outgoing_name ?? '—'}`}
                    subtitle={new Date(h.occurred_at).toLocaleString()}
                    tint={theme.success}
                  />
                ))}
              </>
            )}
          </>
        )}
      </ScrollView>

      <NewHandoverSheet
        visible={newOpen} onClose={() => setNewOpen(false)}
        siteId={profile?.site_id ?? null}
        currentUserId={profile?.id ?? ''}
        currentUserName={profile?.full_name ?? profile?.email ?? 'Guard'}
        onDone={() => { setNewOpen(false); load(); toast.show('Handover filed', 'ok'); }}
      />
      <toast.ToastView />
    </View>
  );
}

function NewHandoverSheet({
  visible, onClose, siteId, currentUserId, currentUserName, onDone,
}: {
  visible: boolean; onClose: () => void;
  siteId: string | null; currentUserId: string; currentUserName: string;
  onDone: () => void;
}) {
  const [summary, setSummary] = useState('');
  const [openIssues, setOpenIssues] = useState('');
  const [busy, setBusy] = useState(false);
  const sigRef = useRef<SignatureCanvasHandle>(null);

  async function save() {
    if (!summary.trim()) { Alert.alert('Summary required'); return; }
    setBusy(true);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (supabase as any).from('shift_handovers').insert({
      site_id: siteId,
      outgoing_user_id: currentUserId,
      outgoing_name: currentUserName,
      summary: summary.trim(),
      open_issues: openIssues.trim() || null,
    });
    setBusy(false);
    if (error) Alert.alert('Could not file handover', error.message);
    else { setSummary(''); setOpenIssues(''); sigRef.current?.clear(); onDone(); }
  }

  return (
    <Sheet visible={visible} onClose={onClose} title="File handover">
      <Field label="Summary *" value={summary} onChangeText={setSummary}
        multiline numberOfLines={3} placeholder="What happened during your shift?"
        style={{ minHeight: 70, textAlignVertical: 'top' }} />
      <Field label="Open issues" value={openIssues} onChangeText={setOpenIssues}
        multiline numberOfLines={3} placeholder="Anything outstanding the next team must follow up?"
        style={{ minHeight: 70, textAlignVertical: 'top' }} />
      <Text style={[type.label, { marginBottom: 6 }]}>Sign</Text>
      <SignatureCanvas ref={sigRef} height={150} />
      <View style={{ height: spacing.md }} />
      <Button title="File Handover" onPress={save} loading={busy}
        icon={<Ionicons name="document-text" size={18} color="#fff" />} />
    </Sheet>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingHorizontal: spacing.lg, paddingTop: spacing.xl * 2, paddingBottom: spacing.md,
  },
  headerBtn: { padding: 6 },

  section: {
    ...type.caption, paddingHorizontal: spacing.lg,
    marginTop: spacing.md, marginBottom: spacing.sm,
  },

  card: {
    backgroundColor: theme.surface, borderColor: theme.border, borderWidth: 1,
    borderRadius: 16, padding: spacing.lg, marginHorizontal: spacing.lg, marginBottom: spacing.md,
    gap: spacing.md,
  },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  cardFrom: { ...type.h3 },
  cardWhen: { ...type.muted, marginTop: 2 },
  cardBody: { ...type.body },
  unreadPill: {
    backgroundColor: theme.brand, paddingHorizontal: 8, paddingVertical: 2, borderRadius: 999,
  },
  unreadPillText: { color: '#fff', fontWeight: '800', fontSize: 10 },

  issuesBox: {
    backgroundColor: theme.surfaceAlt, padding: spacing.md,
    borderRadius: 12, borderLeftWidth: 3, borderLeftColor: theme.warning,
  },
  issuesLabel: { ...type.caption, color: theme.warning, marginBottom: 4 },
});
