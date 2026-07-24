// Supervisor team view: who's on shift / patrol at this site, with
// quick contact + ability to end a stray patrol remotely.

import { useCallback, useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, RefreshControl, Alert, Linking,
} from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import { Badge } from '@/components/ui';
import { EmptyState, SkeletonRow, useToast, SectionTitle, ListRow } from '@/components/primitives';
import { theme, spacing, type } from '@/lib/theme';
import { ROLE_LABELS, hasAnyRole, profileSiteIds, type AppRole } from '@digilog/shared';

interface Member {
  id: string; full_name: string | null; email: string | null; phone: string | null;
  role: AppRole; is_active: boolean;
}
interface Shift { id: string; user_id: string; user_name: string | null; started_at: string }
interface Patrol { id: number; guard_id: string | null; guard_name: string; started_at: string; route_id: string | null }

export default function TeamScreen() {
  const router = useRouter();
  const { profile } = useAuth();
  const toast = useToast();

  useEffect(() => {
    if (profile && !hasAnyRole(profile, ['supervisor', 'manager', 'control_room', 'admin', 'super_user'])) {
      router.replace('/(tabs)');
    }
  }, [profile, router]);
  const [members, setMembers] = useState<Member[]>([]);
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [patrols, setPatrols] = useState<Patrol[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    const mySites = profileSiteIds(profile);
    if (mySites.length === 0) { setLoading(false); return; }
    setLoading(true);
    const [mRes, sRes, pRes] = await Promise.all([
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (supabase as any).from('profiles').select('id, full_name, email, phone, role, is_active')
        .in('site_id', mySites)
        .in('role', ['guard', 'supervisor']).order('full_name'),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (supabase as any).from('shifts').select('id, user_id, user_name, started_at')
        .in('site_id', mySites).is('ended_at', null),
      supabase.from('patrols').select('id, guard_id, guard_name, started_at, route_id')
        .in('site_id', mySites).eq('status', 'active'),
    ]);
    setMembers((mRes.data ?? []) as Member[]);
    setShifts((sRes.data ?? []) as Shift[]);
    setPatrols((pRes.data ?? []) as Patrol[]);
    setLoading(false);
  }, [profile]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const onShiftIds = new Set(shifts.map((s) => s.user_id));
  const onPatrolIds = new Set(patrols.map((p) => p.guard_id).filter(Boolean) as string[]);

  async function endPatrol(p: Patrol) {
    Alert.alert('End patrol', `End ${p.guard_name}'s patrol remotely?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'End', style: 'destructive', onPress: async () => {
          const ts = new Date().toISOString();
          await supabase.from('patrols')
            .update({ status: 'completed', ended_at: ts })
            .eq('id', p.id);
          toast.show('Patrol ended', 'ok');
          load();
        },
      },
    ]);
  }

  return (
    <View style={{ flex: 1, backgroundColor: theme.bg }}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.headerBtn}>
          <Ionicons name="chevron-back" size={26} color={theme.text} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={type.h2}>Team</Text>
          <Text style={[type.muted, { marginTop: 2 }]}>
            {shifts.length} on shift · {patrols.length} on patrol
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
        ) : members.length === 0 ? (
          <EmptyState icon="people-outline" title="No field staff at this site" />
        ) : (
          <>
            {/* ----- on patrol ----- */}
            {patrols.length > 0 && (
              <>
                <SectionTitle>On patrol</SectionTitle>
                {patrols.map((p) => (
                  <ListRow
                    key={p.id}
                    icon="walk"
                    tint={theme.success}
                    title={p.guard_name}
                    subtitle={`Started ${new Date(p.started_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`}
                    right={
                      <TouchableOpacity onPress={() => endPatrol(p)} style={styles.endBtn}>
                        <Ionicons name="stop-circle" size={14} color="#fff" />
                        <Text style={styles.endBtnText}>End</Text>
                      </TouchableOpacity>
                    }
                  />
                ))}
              </>
            )}

            {/* ----- all members ----- */}
            <SectionTitle>All members</SectionTitle>
            {members.map((m) => {
              const onShift = onShiftIds.has(m.id);
              const onPatrol = onPatrolIds.has(m.id);
              const badge = !m.is_active ? { label: 'Inactive', color: theme.textFaint }
                : onPatrol ? { label: 'On patrol', color: theme.success }
                : onShift ? { label: 'On shift', color: theme.brand }
                : { label: 'Off', color: theme.textFaint };

              return (
                <ListRow
                  key={m.id}
                  icon="person-circle"
                  title={m.full_name ?? m.email ?? '—'}
                  subtitle={`${ROLE_LABELS[m.role]}${m.phone ? ` · ${m.phone}` : ''}`}
                  tint={onPatrol ? theme.success : onShift ? theme.brand : theme.textFaint}
                  right={
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                      <Badge label={badge.label} color={badge.color} />
                      {m.phone && (
                        <TouchableOpacity onPress={() => Linking.openURL(`tel:${m.phone}`)} style={styles.callBtn}>
                          <Ionicons name="call" size={14} color={theme.brand} />
                        </TouchableOpacity>
                      )}
                    </View>
                  }
                />
              );
            })}
          </>
        )}
      </ScrollView>
      <toast.ToastView />
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingHorizontal: spacing.lg, paddingTop: spacing.xl * 2, paddingBottom: spacing.md,
  },
  headerBtn: { padding: 6 },

  endBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: theme.danger,
    paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999,
  },
  endBtnText: { color: '#fff', fontWeight: '700', fontSize: 11 },

  callBtn: {
    width: 32, height: 32, borderRadius: 16,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: theme.brand + '22',
  },
});
