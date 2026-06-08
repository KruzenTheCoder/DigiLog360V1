// Key register — show all site keys, current holder, hand-over / return.

import { useCallback, useMemo, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, RefreshControl, Alert,
} from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import { Field, Button } from '@/components/ui';
import { Sheet, EmptyState, SkeletonRow, useToast, ListRow } from '@/components/primitives';
import { theme, spacing, radius, type } from '@/lib/theme';

interface Key {
  id: string; code: string; label: string;
  is_active: boolean; site_id: string | null;
}
interface Handover {
  id: number; key_id: string;
  taken_by: string; taken_by_id_num: string | null;
  taken_at: string; returned_at: string | null;
  taken_from_name: string | null; returned_to_name: string | null;
}

export default function KeysScreen() {
  const router = useRouter();
  const { profile } = useAuth();
  const toast = useToast();
  const [keys, setKeys] = useState<Key[]>([]);
  const [handovers, setHandovers] = useState<Handover[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [target, setTarget] = useState<Key | null>(null);

  const load = useCallback(async () => {
    if (!profile?.site_id) {
      setKeys([]); setHandovers([]); setLoading(false);
      return;
    }
    setLoading(true);
    const [keysRes, hRes] = await Promise.all([
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (supabase as any).from('keys').select('*').eq('site_id', profile.site_id).order('code'),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (supabase as any).from('key_handovers').select('*').order('taken_at', { ascending: false }).limit(200),
    ]);
    setKeys((keysRes.data ?? []) as Key[]);
    setHandovers((hRes.data ?? []) as Handover[]);
    setLoading(false);
  }, [profile?.site_id]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const openByKey = useMemo(() => {
    const m = new Map<string, Handover>();
    handovers.forEach((h) => {
      if (!h.returned_at && !m.has(h.key_id)) m.set(h.key_id, h);
    });
    return m;
  }, [handovers]);

  async function returnKey(h: Handover, key: Key) {
    Alert.alert('Return key', `Mark ${key.code} (${key.label}) as returned?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Return', onPress: async () => {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const { error } = await (supabase as any).from('key_handovers').update({
            returned_at: new Date().toISOString(),
            returned_to: profile?.id,
            returned_to_name: profile?.full_name ?? profile?.email ?? null,
          }).eq('id', h.id);
          if (error) toast.show(error.message, 'error');
          else { toast.show('Key returned', 'ok'); load(); }
        },
      },
    ]);
  }

  const out = keys.filter((k) => openByKey.has(k.id));
  const avail = keys.filter((k) => !openByKey.has(k.id) && k.is_active);

  return (
    <View style={{ flex: 1, backgroundColor: theme.bg }}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.headerBtn}>
          <Ionicons name="chevron-back" size={26} color={theme.text} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={type.h2}>Key Register</Text>
          <Text style={[type.muted, { marginTop: 2 }]}>
            {out.length} out · {avail.length} available
          </Text>
        </View>
      </View>

      <ScrollView
        contentContainerStyle={{ paddingBottom: 24 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await load(); setRefreshing(false); }} tintColor={theme.brand} />}
      >
        {loading ? (
          <View style={{ paddingHorizontal: spacing.lg }}>
            <SkeletonRow /><SkeletonRow /><SkeletonRow />
          </View>
        ) : keys.length === 0 ? (
          <EmptyState
            icon="key-outline"
            title="No keys registered"
            hint="Ask your admin to add keys in the web console."
          />
        ) : (
          <>
            {/* ----- out ----- */}
            {out.length > 0 && (
              <>
                <Text style={styles.section}>Currently out</Text>
                {out.map((k) => {
                  const h = openByKey.get(k.id)!;
                  return (
                    <ListRow
                      key={k.id}
                      icon="key"
                      title={`${k.code} · ${k.label}`}
                      subtitle={`Held by ${h.taken_by} since ${new Date(h.taken_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`}
                      tint={theme.warning}
                      right={
                        <TouchableOpacity onPress={() => returnKey(h, k)} style={styles.returnBtn}>
                          <Ionicons name="arrow-undo" size={14} color="#fff" />
                          <Text style={styles.returnBtnText}>Return</Text>
                        </TouchableOpacity>
                      }
                    />
                  );
                })}
              </>
            )}

            {/* ----- available ----- */}
            <Text style={styles.section}>Available</Text>
            {avail.map((k) => (
              <ListRow
                key={k.id}
                icon="key-outline"
                title={`${k.code} · ${k.label}`}
                tint={theme.success}
                right={
                  <TouchableOpacity onPress={() => setTarget(k)} style={styles.handOverBtn}>
                    <Text style={styles.handOverBtnText}>Hand over</Text>
                    <Ionicons name="chevron-forward" size={14} color={theme.brand} />
                  </TouchableOpacity>
                }
              />
            ))}
          </>
        )}
      </ScrollView>

      <HandoverSheet
        target={target} onClose={() => setTarget(null)}
        currentUserId={profile?.id ?? ''}
        currentUserName={profile?.full_name ?? profile?.email ?? 'Gate Guard'}
        onDone={() => { setTarget(null); load(); toast.show('Key handed over', 'ok'); }}
      />
      <toast.ToastView />
    </View>
  );
}

function HandoverSheet({
  target, onClose, currentUserId, currentUserName, onDone,
}: {
  target: Key | null; onClose: () => void;
  currentUserId: string; currentUserName: string; onDone: () => void;
}) {
  const [takenBy, setTakenBy] = useState('');
  const [idNum, setIdNum] = useState('');
  const [busy, setBusy] = useState(false);

  async function save() {
    if (!takenBy.trim() || !target) return;
    setBusy(true);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (supabase as any).from('key_handovers').insert({
      key_id: target.id,
      taken_by: takenBy.trim(),
      taken_by_id_num: idNum || null,
      taken_from: currentUserId,
      taken_from_name: currentUserName,
    });
    setBusy(false);
    if (error) Alert.alert('Could not hand over', error.message);
    else { setTakenBy(''); setIdNum(''); onDone(); }
  }

  return (
    <Sheet visible={!!target} onClose={onClose} title={target ? `${target.code} · ${target.label}` : 'Hand over key'}>
      <Field label="Taken by *" value={takenBy} onChangeText={setTakenBy} placeholder="Name of recipient" />
      <Field label="ID / Employee number" value={idNum} onChangeText={setIdNum} placeholder="Optional" />
      <View style={{ height: spacing.sm }} />
      <Button title="Hand Over" onPress={save} loading={busy}
        icon={<Ionicons name="key" size={18} color="#fff" />} />
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

  returnBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: theme.brand,
    paddingHorizontal: 12, paddingVertical: 7, borderRadius: radius.pill,
  },
  returnBtnText: { color: '#fff', fontWeight: '700', fontSize: 12 },
  handOverBtn: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  handOverBtnText: { color: theme.brand, fontWeight: '700', fontSize: 12 },
});
