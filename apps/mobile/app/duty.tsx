// Duty — a simple On Patrol / Off Patrol toggle, like an on-duty/off-duty
// switch. This is the quick way to go on/off patrol without the full Patrol
// screen (routes, checkpoints, scanning). Starting here logs an ad-hoc patrol;
// the Patrol tab is still there for route-based patrols + checkpoint scans.

import { useCallback, useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, RefreshControl, Alert, TouchableOpacity,
} from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import Svg, { Defs, LinearGradient as SvgGradient, Stop, Rect } from 'react-native-svg';
import { useAuth } from '@/lib/auth';
import { getActivePatrol, startPatrol, endPatrol } from '@/lib/patrol';
import { startLocationReporting, stopLocationReporting } from '@/lib/location-reporter';
import { useToast } from '@/components/primitives';
import { theme, spacing, radius, type } from '@/lib/theme';
import type { Patrol } from '@digilog/shared';

export default function DutyScreen() {
  const router = useRouter();
  const toast = useToast();
  const { profile, can } = useAuth();

  const [patrol, setPatrol] = useState<Patrol | null>(null);
  const [busy, setBusy] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [, setTick] = useState(0);

  const onDuty = !!patrol;

  const load = useCallback(async () => {
    if (!profile) return;
    setPatrol(await getActivePatrol(profile.id));
  }, [profile]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  // Live elapsed ticker while on duty.
  useEffect(() => {
    if (!onDuty) return;
    const id = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(id);
  }, [onDuty]);

  // Report location only while on patrol.
  useEffect(() => {
    if (!profile || !patrol) { stopLocationReporting(); return; }
    let cancel: (() => void) | null = null;
    startLocationReporting({
      guardId: profile.id,
      guardName: profile.full_name ?? profile.email ?? null,
      siteId: profile.site_id ?? null,
      onlyWhileOnPatrol: true,
    }).then((c) => { cancel = c; });
    return () => { if (cancel) cancel(); stopLocationReporting(); };
  }, [profile, patrol]);

  const onRefresh = async () => { setRefreshing(true); await load(); setRefreshing(false); };

  async function toggleDuty() {
    if (!profile || busy) return;
    if (!onDuty) {
      setBusy(true);
      try {
        await startPatrol(profile, null); // ad-hoc patrol
        await load();
        toast.show('You are now ON patrol', 'ok');
        // Going on duty takes you straight to the dashboard.
        setTimeout(() => router.replace('/(tabs)'), 350);
      } catch (e: unknown) {
        Alert.alert('Could not go on duty', e instanceof Error ? e.message : '');
      } finally { setBusy(false); }
    } else {
      Alert.alert('Go off patrol?', 'This ends your current patrol.', [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Go Off', style: 'destructive', onPress: async () => {
            setBusy(true);
            try { await endPatrol(patrol!); await load(); toast.show('You are now OFF patrol', 'ok'); }
            catch (e: unknown) { Alert.alert('Could not go off duty', e instanceof Error ? e.message : ''); }
            finally { setBusy(false); }
          },
        },
      ]);
    }
  }

  const elapsed = (() => {
    if (!patrol) return '00:00:00';
    const ms = Date.now() - new Date(patrol.started_at).getTime();
    const s = Math.max(0, Math.floor(ms / 1000));
    const hh = String(Math.floor(s / 3600)).padStart(2, '0');
    const mm = String(Math.floor((s % 3600) / 60)).padStart(2, '0');
    const ss = String(s % 60).padStart(2, '0');
    return `${hh}:${mm}:${ss}`;
  })();

  const accent = onDuty ? theme.success : theme.textMuted;

  return (
    <View style={{ flex: 1, backgroundColor: theme.bg }}>
      <ScrollView
        contentContainerStyle={{ padding: spacing.lg, paddingTop: spacing.xl * 2, paddingBottom: 60 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.brand} />}
      >
        {/* Gradient header */}
        <View style={styles.header}>
          <Svg style={StyleSheet.absoluteFill} width="100%" height="100%">
            <Defs>
              <SvgGradient id="dutyHdr" x1="0" y1="0" x2="1" y2="1">
                <Stop offset="0" stopColor="#667eea" />
                <Stop offset="1" stopColor="#764ba2" />
              </SvgGradient>
            </Defs>
            <Rect x="0" y="0" width="100%" height="100%" fill="url(#dutyHdr)" />
          </Svg>
          <View style={styles.headerRow}>
            <View style={styles.headerIcon}>
              <Ionicons name="shield-half" size={24} color="#fff" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.headerTitle}>Shift Maintenance</Text>
              <Text style={styles.headerSub}>Go on / off duty</Text>
            </View>
          </View>
        </View>

        {/* Big status + toggle */}
        <View style={[styles.statusCard, { borderColor: accent + '55' }]}>
          <View style={[styles.statusDot, { backgroundColor: accent }]} />
          <Text style={styles.statusLabel}>{onDuty ? 'On Patrol' : 'Off Patrol'}</Text>
          {onDuty ? (
            <Text style={styles.elapsed}>{elapsed}</Text>
          ) : (
            <Text style={styles.statusHint}>Tap the switch to go on patrol</Text>
          )}
          {onDuty && (
            <Text style={styles.startedAt}>
              Started {new Date(patrol!.started_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </Text>
          )}

          {/* The toggle */}
          <TouchableOpacity
            onPress={toggleDuty}
            disabled={busy}
            activeOpacity={0.85}
            style={[
              styles.toggle,
              { backgroundColor: onDuty ? theme.success : theme.surfaceHi, opacity: busy ? 0.6 : 1 },
            ]}
          >
            <View style={[styles.knob, { alignSelf: onDuty ? 'flex-end' : 'flex-start' }]}>
              <Ionicons
                name={onDuty ? 'walk' : 'power'}
                size={22}
                color={onDuty ? theme.success : theme.textMuted}
              />
            </View>
          </TouchableOpacity>
          <Text style={[styles.toggleHint, { color: accent }]}>
            {busy ? 'Working…' : onDuty ? 'Slide / tap to go OFF' : 'Slide / tap to go ON'}
          </Text>
        </View>

        {/* Always-available way through to the dashboard, whether or not
            you go on duty (e.g. you just need to log something quickly). */}
        <TouchableOpacity onPress={() => router.replace('/(tabs)')} activeOpacity={0.85} style={styles.linkCard}>
          <View style={[styles.linkIcon, { backgroundColor: theme.brand }]}>
            <Ionicons name="grid" size={22} color="#fff" />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.linkTitle}>Continue to Dashboard</Text>
            <Text style={styles.linkHint}>Open the guard portal without changing duty</Text>
          </View>
          <Ionicons name="chevron-forward" size={20} color={theme.textMuted} />
        </TouchableOpacity>

        {/* Route patrol shortcut for guards who run checkpoint routes */}
        {(can('patrols.run') || can('patrols.scan')) && (
          <TouchableOpacity onPress={() => router.push('/(tabs)/patrol')} activeOpacity={0.85} style={[styles.linkCard, { marginTop: spacing.md }]}>
            <View style={[styles.linkIcon, { backgroundColor: theme.info }]}>
              <Ionicons name="map" size={22} color="#fff" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.linkTitle}>Route patrol &amp; checkpoints</Text>
              <Text style={styles.linkHint}>Pick a route and scan QR/NFC checkpoints</Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color={theme.textMuted} />
          </TouchableOpacity>
        )}
      </ScrollView>
      <toast.ToastView />
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    marginHorizontal: -spacing.lg, marginTop: -spacing.xl * 2,
    paddingTop: spacing.xl * 2.2, paddingHorizontal: spacing.lg, paddingBottom: spacing.lg,
    marginBottom: spacing.lg, overflow: 'hidden',
    borderBottomLeftRadius: radius.xl, borderBottomRightRadius: radius.xl,
    backgroundColor: theme.brandPurple,
  },
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  backBtn: { padding: 2 },
  headerIcon: {
    width: 44, height: 44, borderRadius: radius.lg,
    backgroundColor: 'rgba(255,255,255,0.18)', alignItems: 'center', justifyContent: 'center',
  },
  headerTitle: { fontSize: 22, fontWeight: '800', color: '#fff' },
  headerSub: { fontSize: 13, color: 'rgba(255,255,255,0.85)', marginTop: 1 },

  statusCard: {
    backgroundColor: theme.surface, borderRadius: radius.xl, borderWidth: 1,
    padding: spacing.xl, alignItems: 'center', marginBottom: spacing.lg,
  },
  statusDot: { width: 14, height: 14, borderRadius: 7, marginBottom: 10 },
  statusLabel: { fontSize: 24, fontWeight: '800', color: theme.text },
  statusHint: { fontSize: 13, color: theme.textMuted, marginTop: 6 },
  elapsed: { fontSize: 40, fontWeight: '800', color: theme.success, marginTop: 6, fontVariant: ['tabular-nums'] },
  startedAt: { fontSize: 12, color: theme.textMuted, marginTop: 2 },

  toggle: {
    width: 120, height: 56, borderRadius: 999, padding: 5, marginTop: spacing.xl,
    justifyContent: 'center',
  },
  knob: {
    width: 46, height: 46, borderRadius: 23, backgroundColor: '#fff',
    alignItems: 'center', justifyContent: 'center',
  },
  toggleHint: { fontSize: 13, fontWeight: '700', marginTop: 12 },

  linkCard: {
    flexDirection: 'row', alignItems: 'center', gap: 14,
    backgroundColor: theme.surface, borderRadius: radius.lg, padding: spacing.lg,
    borderWidth: 1, borderColor: theme.border,
  },
  linkIcon: { width: 48, height: 48, borderRadius: radius.lg, alignItems: 'center', justifyContent: 'center' },
  linkTitle: { fontSize: 15, fontWeight: '700', color: theme.text },
  linkHint: { fontSize: 12, color: theme.textMuted, marginTop: 2 },
});
