// Occurrence detail.
//
// Anyone can view their own / their site's occurrence (RLS enforces).
// Reviewers (supervisor / manager / control_room / admin / super_user) get
// a sticky "Update status" action + a comment thread.

import { useCallback, useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, Image, TouchableOpacity, RefreshControl,
} from 'react-native';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/auth';
import { Badge, Button, Field } from '@/components/ui';
import { Sheet, useToast, SectionTitle, Skeleton } from '@/components/primitives';
import { theme, spacing, radius, type } from '@/lib/theme';
import {
  SEVERITY_COLORS, SEVERITY_LABELS, STATUS_COLORS, STATUS_LABELS, STORAGE_BUCKET,
  OCCURRENCE_STATUSES,
  hasAnyRole,
  type Occurrence, type OccurrenceUpdate, type OccurrenceImage,
  type OccurrenceStatus,
} from '@digilog/shared';

interface Comment {
  id: number;
  author_id: string | null;
  author_name: string | null;
  body: string;
  created_at: string;
}

export default function OccurrenceDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const toast = useToast();
  const { profile } = useAuth();

  const [occ, setOcc] = useState<Occurrence | null>(null);
  const [updates, setUpdates] = useState<OccurrenceUpdate[]>([]);
  const [comments, setComments] = useState<Comment[]>([]);
  const [imageUrls, setImageUrls] = useState<string[]>([]);

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Sheets
  const [statusSheetOpen, setStatusSheetOpen] = useState(false);
  const [commentSheetOpen, setCommentSheetOpen] = useState(false);

  const canUpdate = !!profile && hasAnyRole(profile, [
    'supervisor', 'admin', 'manager', 'control_room', 'super_user',
  ]);

  const load = useCallback(async () => {
    setLoading(true);
    const occId = Number(id);
    const [oRes, uRes, iRes, cRes] = await Promise.all([
      supabase.from('occurrences').select('*').eq('id', occId).maybeSingle(),
      supabase.from('occurrence_updates').select('*').eq('occurrence_id', occId)
        .order('created_at', { ascending: false }),
      supabase.from('occurrence_images').select('*').eq('occurrence_id', occId),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (supabase as any).from('occurrence_comments').select('id, author_id, author_name, body, created_at')
        .eq('occurrence_id', occId).order('created_at', { ascending: true })
        .then((r: { data: Comment[] | null }) => r, () => ({ data: [] })),
    ]);
    setOcc(oRes.data as Occurrence | null);
    setUpdates((uRes.data ?? []) as OccurrenceUpdate[]);
    setComments(((cRes as { data: Comment[] | null })?.data ?? []) as Comment[]);

    const paths = ((iRes.data ?? []) as OccurrenceImage[]).map((i) => i.storage_path);
    if (paths.length) {
      const { data: signed } = await supabase.storage.from(STORAGE_BUCKET).createSignedUrls(paths, 3600);
      setImageUrls((signed ?? []).map((s) => s.signedUrl).filter(Boolean) as string[]);
    } else {
      setImageUrls([]);
    }
    setLoading(false);
  }, [id]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  // Realtime — pick up status updates and new comments while open.
  useEffect(() => {
    const occId = Number(id);
    const ch = supabase
      .channel(`occ-${occId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'occurrences', filter: `id=eq.${occId}` }, () => load())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'occurrence_updates', filter: `occurrence_id=eq.${occId}` }, () => load())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'occurrence_comments', filter: `occurrence_id=eq.${occId}` }, () => load())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [id, load]);

  return (
    <View style={{ flex: 1, backgroundColor: theme.bg }}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.headerBtn}>
          <Ionicons name="chevron-back" size={26} color={theme.text} />
        </TouchableOpacity>
        {occ && (
          <View style={{ flex: 1 }}>
            <Text style={[type.h2]}>{occ.ob_number}</Text>
            <Text style={[type.muted, { marginTop: 2 }]}>{occ.occurrence_type}</Text>
          </View>
        )}
      </View>

      <ScrollView
        contentContainerStyle={{ padding: spacing.lg, paddingTop: 0, paddingBottom: 120 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await load(); setRefreshing(false); }} tintColor={theme.brand} />}
      >
        {loading && !occ ? (
          <>
            <Skeleton width="60%" height={28} />
            <View style={{ height: 8 }} />
            <Skeleton width="40%" height={14} />
            <View style={{ height: 24 }} />
            <Skeleton width="100%" height={120} />
          </>
        ) : !occ ? (
          <View style={{ alignItems: 'center', paddingTop: 80 }}>
            <Ionicons name="alert-circle-outline" size={48} color={theme.textMuted} />
            <Text style={[type.muted, { marginTop: 12 }]}>Occurrence not found</Text>
          </View>
        ) : (
          <>
            <View style={{ flexDirection: 'row', gap: 6, marginTop: 6 }}>
              <Badge label={SEVERITY_LABELS[occ.severity]} color={SEVERITY_COLORS[occ.severity]} />
              <Badge label={STATUS_LABELS[occ.status]} color={STATUS_COLORS[occ.status]} />
            </View>

            <View style={styles.card}>
              <DetailRow label="Site" value={occ.site_name ?? '—'} />
              <DetailRow label="Incident" value={new Date(occ.incident_at).toLocaleString()} />
              <DetailRow label="Logged" value={new Date(occ.created_at).toLocaleString()} />
              <DetailRow label="By" value={occ.logged_by_name ?? '—'} />
            </View>

            <SectionTitle>Description</SectionTitle>
            <Text style={type.body}>{occ.description}</Text>

            {imageUrls.length > 0 && (
              <>
                <SectionTitle right={<Text style={[type.muted, { fontSize: 11 }]}>{imageUrls.length}</Text>}>Photos</SectionTitle>
                <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                  {imageUrls.map((u, i) => (
                    <Image key={i} source={{ uri: u }} style={styles.photo} />
                  ))}
                </ScrollView>
              </>
            )}

            <SectionTitle
              right={canUpdate ? (
                <TouchableOpacity onPress={() => setCommentSheetOpen(true)} hitSlop={10}>
                  <Ionicons name="add-circle-outline" size={20} color={theme.brand} />
                </TouchableOpacity>
              ) : undefined}
            >Comments · {comments.length}</SectionTitle>
            {comments.length === 0 ? (
              <Text style={type.muted}>No comments yet.</Text>
            ) : comments.map((c) => (
              <View key={c.id} style={styles.comment}>
                <Text style={styles.commentAuthor}>{c.author_name ?? 'Unknown'}</Text>
                <Text style={type.bodySm}>{c.body}</Text>
                <Text style={styles.commentDate}>{new Date(c.created_at).toLocaleString()}</Text>
              </View>
            ))}

            <SectionTitle>Updates · {updates.length}</SectionTitle>
            {updates.length === 0 ? (
              <Text style={type.muted}>No status updates yet.</Text>
            ) : updates.map((u) => (
              <View key={u.id} style={styles.update}>
                <Badge label={STATUS_LABELS[u.status]} color={STATUS_COLORS[u.status]} />
                <Text style={type.bodySm}>{u.notes}</Text>
                <Text style={styles.updateDate}>
                  {u.updated_by_name ?? 'Unknown'} · {new Date(u.created_at).toLocaleString()}
                </Text>
              </View>
            ))}
          </>
        )}
      </ScrollView>

      {/* Sticky action bar */}
      {occ && canUpdate && (
        <View style={styles.actionBar}>
          <Button
            title="Update status"
            onPress={() => setStatusSheetOpen(true)}
            icon={<Ionicons name="refresh" size={18} color="#fff" />}
          />
        </View>
      )}

      {occ && (
        <>
          <UpdateStatusSheet
            visible={statusSheetOpen} onClose={() => setStatusSheetOpen(false)}
            occurrence={occ}
            currentUserId={profile?.id ?? ''}
            currentUserName={profile?.full_name ?? profile?.email ?? 'User'}
            onDone={() => { setStatusSheetOpen(false); load(); toast.show('Status updated', 'ok'); }}
          />
          <AddCommentSheet
            visible={commentSheetOpen} onClose={() => setCommentSheetOpen(false)}
            occurrenceId={occ.id}
            obNumber={occ.ob_number}
            currentUserId={profile?.id ?? ''}
            currentUserName={profile?.full_name ?? profile?.email ?? 'User'}
            onDone={() => { setCommentSheetOpen(false); load(); toast.show('Comment posted', 'ok'); }}
          />
        </>
      )}

      <toast.ToastView />
    </View>
  );
}

// ---------------------------------------------------------------------------
function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.detailRow}>
      <Text style={styles.detailLabel}>{label}</Text>
      <Text style={styles.detailValue} numberOfLines={2}>{value}</Text>
    </View>
  );
}

function UpdateStatusSheet({
  visible, onClose, occurrence, currentUserId, currentUserName, onDone,
}: {
  visible: boolean; onClose: () => void;
  occurrence: Occurrence;
  currentUserId: string; currentUserName: string;
  onDone: () => void;
}) {
  const [status, setStatus] = useState<OccurrenceStatus>(occurrence.status);
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (visible) {
      setStatus(occurrence.status);
      setNotes('');
    }
  }, [visible, occurrence.status]);

  async function save() {
    if (!notes.trim()) return;
    setBusy(true);
    const ts = new Date().toISOString();
    const { error: uErr } = await supabase.from('occurrence_updates').insert({
      occurrence_id: occurrence.id, ob_number: occurrence.ob_number,
      notes: notes.trim(), status,
      updated_by: currentUserId, updated_by_name: currentUserName,
    });
    if (!uErr) {
      await supabase.from('occurrences')
        .update({ status, last_sla_update_at: ts })
        .eq('id', occurrence.id);
    }
    setBusy(false);
    if (!uErr) onDone();
  }

  return (
    <Sheet visible={visible} onClose={onClose} title="Update status">
      <Text style={[type.label, { marginBottom: 6 }]}>New status</Text>
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
      <View style={{ height: spacing.sm }} />
      <Field
        label="Notes *"
        value={notes}
        onChangeText={setNotes}
        multiline numberOfLines={4}
        placeholder="What changed? What did you do?"
        style={{ minHeight: 90, textAlignVertical: 'top' }}
      />
      <Button
        title="Post Update"
        onPress={save}
        loading={busy}
        disabled={!notes.trim()}
        icon={<Ionicons name="send" size={18} color="#fff" />}
      />
    </Sheet>
  );
}

function AddCommentSheet({
  visible, onClose, occurrenceId, obNumber, currentUserId, currentUserName, onDone,
}: {
  visible: boolean; onClose: () => void;
  occurrenceId: number; obNumber: string | null;
  currentUserId: string; currentUserName: string;
  onDone: () => void;
}) {
  const [body, setBody] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => { if (visible) setBody(''); }, [visible]);

  async function save() {
    if (!body.trim()) return;
    setBusy(true);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (supabase as any).from('occurrence_comments').insert({
      occurrence_id: occurrenceId, ob_number: obNumber,
      author_id: currentUserId, author_name: currentUserName,
      body: body.trim(),
    });
    setBusy(false);
    if (!error) onDone();
  }

  return (
    <Sheet visible={visible} onClose={onClose} title="Add comment">
      <Field
        label=""
        value={body}
        onChangeText={setBody}
        multiline numberOfLines={5}
        placeholder="Share details, ask a question, or flag something"
        style={{ minHeight: 110, textAlignVertical: 'top' }}
      />
      <Button
        title="Post"
        onPress={save}
        loading={busy}
        disabled={!body.trim()}
        icon={<Ionicons name="chatbubble-ellipses" size={18} color="#fff" />}
      />
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
    borderRadius: radius.lg, padding: spacing.md, marginTop: spacing.md,
  },
  detailRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 5, gap: 12 },
  detailLabel: { color: theme.textMuted, fontSize: 12 },
  detailValue: { color: theme.text, fontSize: 13, fontWeight: '600', flexShrink: 1, textAlign: 'right' },

  photo: { width: 130, height: 130, borderRadius: radius.md, marginRight: 10 },

  comment: {
    backgroundColor: theme.surfaceAlt, borderRadius: radius.md,
    padding: spacing.md, marginBottom: spacing.sm,
  },
  commentAuthor: { color: theme.text, fontSize: 12, fontWeight: '700', marginBottom: 4 },
  commentDate: { color: theme.textFaint, fontSize: 10, marginTop: 6 },

  update: {
    backgroundColor: theme.surface, borderRadius: radius.md, padding: spacing.md,
    marginBottom: spacing.sm, borderWidth: 1, borderColor: theme.border, gap: 6,
  },
  updateDate: { color: theme.textMuted, fontSize: 11 },

  actionBar: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    backgroundColor: theme.surface,
    borderTopWidth: 1, borderTopColor: theme.border,
    padding: spacing.md,
  },

  statusRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: spacing.sm },
  statusChip: {
    paddingHorizontal: 12, paddingVertical: 7, borderRadius: 999,
    borderWidth: 1, borderColor: theme.border, backgroundColor: theme.surfaceAlt,
  },
  statusChipText: { color: theme.textMuted, fontSize: 12 },
});
