import { useCallback, useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Alert, RefreshControl } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import { getActivePatrol, startPatrol, endPatrol, scannedCheckpointIds } from '@/lib/patrol';
import { startLocationReporting, stopLocationReporting } from '@/lib/location-reporter';
import { Button, Card, H1, Muted, Badge } from '@/components/ui';
import { theme, spacing, radius } from '@/lib/theme';
import type { Patrol, PatrolRoute, Checkpoint } from '@digilog/shared';

export default function PatrolScreen() {
  const { profile, can } = useAuth();
  const router = useRouter();
  const [patrol, setPatrol] = useState<Patrol | null>(null);
  const [routes, setRoutes] = useState<PatrolRoute[]>([]);
  const [routeId, setRouteId] = useState<string | null>(null);
  const [checkpoints, setCheckpoints] = useState<Checkpoint[]>([]);
  const [scanned, setScanned] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    if (!profile) return;
    const active = await getActivePatrol(profile.id);
    setPatrol(active);

    if (active) {
      setScanned(await scannedCheckpointIds(active.id));
      if (active.route_id) {
        const { data: rc } = await supabase.from('route_checkpoints')
          .select('checkpoint_id, sort_order, checkpoints(*)')
          .eq('route_id', active.route_id).order('sort_order');
        setCheckpoints(((rc ?? []).map((r: any) => r.checkpoints).filter(Boolean)) as Checkpoint[]);
      } else {
        setCheckpoints([]);
      }
    } else if (profile.site_id) {
      const { data } = await supabase.from('patrol_routes').select('*')
        .eq('site_id', profile.site_id).eq('is_active', true).order('name');
      setRoutes((data ?? []) as PatrolRoute[]);
    }
  }, [profile]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  // Live location reporting while on an active patrol.
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

  async function onStart() {
    if (!profile) return;
    setBusy(true);
    try {
      await startPatrol(profile, routeId);
      await load();
    } catch (e: any) {
      Alert.alert('Could not start patrol', e.message ?? '');
    } finally { setBusy(false); }
  }

  async function onEnd() {
    if (!patrol) return;
    Alert.alert('End Patrol', 'Are you sure you want to end this patrol?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'End', style: 'destructive', onPress: async () => {
          setBusy(true);
          try { await endPatrol(patrol); await load(); }
          finally { setBusy(false); }
        },
      },
    ]);
  }

  return (
    <ScrollView style={{ flex: 1, backgroundColor: theme.bg }}
      contentContainerStyle={{ padding: spacing.lg, paddingTop: spacing.xl * 2 }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.brand} />}>
      <H1>Patrol</H1>
      <View style={{ height: spacing.lg }} />

      {!patrol ? (
        <>
          <Muted>Select a route (optional) and start your patrol.</Muted>
          <View style={{ height: spacing.md }} />
          <TouchableOpacity onPress={() => setRouteId(null)}>
            <Card style={[styles.routeCard, !routeId && styles.routeActive]}>
              <Text style={styles.routeName}>Ad-hoc patrol</Text>
              <Muted>No fixed checkpoints</Muted>
            </Card>
          </TouchableOpacity>
          {routes.map((r) => (
            <TouchableOpacity key={r.id} onPress={() => setRouteId(r.id)}>
              <Card style={[styles.routeCard, routeId === r.id && styles.routeActive]}>
                <Text style={styles.routeName}>{r.name}</Text>
                {r.description ? <Muted>{r.description}</Muted> : null}
                {r.expected_duration_minutes ? <Muted>~{r.expected_duration_minutes} min</Muted> : null}
              </Card>
            </TouchableOpacity>
          ))}
          <View style={{ height: spacing.md }} />
          <Button title="Start Patrol" onPress={onStart} loading={busy}
            icon={<Ionicons name="play" size={18} color="#fff" />} />
        </>
      ) : (
        <>
          <Card style={{ borderColor: theme.brand }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              <Text style={styles.activeTitle}>Patrol active</Text>
              <Badge label="In progress" color={theme.success} />
            </View>
            <Text style={styles.progress}>
              {scanned.size}{patrol.checkpoints_total ? ` / ${patrol.checkpoints_total}` : ''} checkpoints scanned
            </Text>
            <Muted>Started {new Date(patrol.started_at).toLocaleTimeString()}</Muted>
          </Card>

          {can('patrols.scan') && (
            <>
              <Button title="Scan Checkpoint" onPress={() => router.push('/scan')}
                icon={<Ionicons name="scan" size={18} color="#fff" />} />
              <View style={{ height: spacing.md }} />
            </>
          )}

          {checkpoints.length > 0 && (
            <>
              <Text style={styles.section}>Route Checkpoints</Text>
              {checkpoints.map((c) => {
                const done = scanned.has(c.id);
                return (
                  <View key={c.id} style={styles.cpRow}>
                    <Ionicons name={done ? 'checkmark-circle' : 'ellipse-outline'} size={22}
                      color={done ? theme.success : theme.textMuted} />
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.cpName, done && { color: theme.textMuted, textDecorationLine: 'line-through' }]}>{c.name}</Text>
                      {c.code ? <Muted>{c.code}</Muted> : null}
                    </View>
                  </View>
                );
              })}
            </>
          )}

          <View style={{ height: spacing.lg }} />
          <Button title="End Patrol" variant="danger" onPress={onEnd} loading={busy}
            icon={<Ionicons name="stop" size={18} color="#fff" />} />
        </>
      )}
      <View style={{ height: 40 }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  routeCard: { borderColor: theme.border },
  routeActive: { borderColor: theme.brand, backgroundColor: theme.brand + '14' },
  routeName: { color: theme.text, fontWeight: '700', fontSize: 15 },
  activeTitle: { color: theme.text, fontSize: 18, fontWeight: '800' },
  progress: { color: theme.brand, fontSize: 16, fontWeight: '700', marginTop: 8 },
  section: { color: theme.text, fontSize: 16, fontWeight: '700', marginBottom: spacing.sm },
  cpRow: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: theme.surface, padding: spacing.md, borderRadius: radius.md, marginBottom: 8, borderWidth: 1, borderColor: theme.border },
  cpName: { color: theme.text, fontWeight: '600', fontSize: 14 },
});
