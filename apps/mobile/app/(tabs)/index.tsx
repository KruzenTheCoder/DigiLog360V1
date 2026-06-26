// Guard Portal home — a vertical list of big "portal cards", one per enabled
// container. Each card is gated by BOTH its mobile-home container capability
// (the super-user "show this card" toggle) AND its functional capability
// (whether the user can actually do the thing). Turning either off in the
// /super/permissions matrix hides the card.

import { useCallback, useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, RefreshControl, TouchableOpacity, Alert,
} from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import Svg, { Defs, LinearGradient as SvgGradient, Stop, Rect } from 'react-native-svg';
import { useAuth } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import { Card, Button, Muted, Badge } from '@/components/ui';
import { SectionTitle, SkeletonRow, Press, Stat } from '@/components/primitives';
import { theme, spacing, radius, type } from '@/lib/theme';
import { hasAnyRole, profileRoles, ROLE_LABELS } from '@digilog/shared';
import { getActivePatrol, startPatrol, endPatrol, scannedCheckpointIds } from '@/lib/patrol';
import { startLocationReporting, stopLocationReporting } from '@/lib/location-reporter';
import type { Patrol, PatrolRoute, Checkpoint } from '@digilog/shared';

interface Stats {
  open: number;
  today: number;
  activePatrol: boolean;
  unread: number;
  onShift: boolean;
  siteOpen: number;
  siteBreached: number;
  onSiteVisitors: number;
  openHandovers: number;
  openTasks: number;
}

const ZERO_STATS: Stats = {
  open: 0, today: 0, activePatrol: false, unread: 0, onShift: false,
  siteOpen: 0, siteBreached: 0, onSiteVisitors: 0, openHandovers: 0, openTasks: 0,
};

export default function Home() {
  const { profile, can } = useAuth();
  const router = useRouter();
  const [stats, setStats] = useState<Stats>(ZERO_STATS);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [siteName, setSiteName] = useState<string | null>(null);
  
  // Patrol/On Duty state
  const [patrol, setPatrol] = useState<Patrol | null>(null);
  const [routes, setRoutes] = useState<PatrolRoute[]>([]);
  const [routeId, setRouteId] = useState<string | null>(null);
  const [checkpoints, setCheckpoints] = useState<Checkpoint[]>([]);
  const [scanned, setScanned] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);

  const isSupervisor = !!profile && hasAnyRole(profile, ['supervisor']);

  useEffect(() => {
    if (!profile?.site_id) { setSiteName(null); return; }
    supabase.from('sites').select('name').eq('id', profile.site_id).maybeSingle()
      .then(({ data }) => setSiteName(data?.name ?? null));
  }, [profile?.site_id]);

  const load = useCallback(async () => {
    if (!profile) return;
    setLoading(true);
    const startOfDay = new Date(); startOfDay.setHours(0, 0, 0, 0);

    const [
      { count: open },
      { count: today },
      { data: patrol },
      { count: unread },
      { data: shift },
      { count: siteOpen },
      { count: siteBreached },
      { count: visitors },
      { count: handovers },
      { count: openTasks },
    ] = await Promise.all([
      supabase.from('occurrences').select('id', { count: 'exact', head: true })
        .eq('logged_by', profile.id).not('status', 'in', '(resolved,closed)'),
      supabase.from('occurrences').select('id', { count: 'exact', head: true })
        .eq('logged_by', profile.id).gte('created_at', startOfDay.toISOString()),
      supabase.from('patrols').select('id').eq('guard_id', profile.id).eq('status', 'active').maybeSingle(),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (supabase as any).from('notifications').select('id', { count: 'exact', head: true })
        .eq('user_id', profile.id).is('read_at', null),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (supabase as any).from('shifts').select('id').eq('user_id', profile.id).is('ended_at', null).maybeSingle(),
      isSupervisor && profile.site_id
        ? supabase.from('occurrences').select('id', { count: 'exact', head: true })
            .eq('site_id', profile.site_id).not('status', 'in', '(resolved,closed)')
        : Promise.resolve({ count: 0 }),
      isSupervisor && profile.site_id
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ? (supabase as any).from('occurrences_live').select('id', { count: 'exact', head: true })
            .eq('site_id', profile.site_id).eq('is_sla_breached', true)
        : Promise.resolve({ count: 0 }),
      profile.site_id
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ? (supabase as any).from('visitors').select('id', { count: 'exact', head: true })
            .eq('site_id', profile.site_id).is('signed_out_at', null)
        : Promise.resolve({ count: 0 }),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (supabase as any).from('shift_handovers').select('id', { count: 'exact', head: true })
        .eq('incoming_user_id', profile.id).is('acknowledged_at', null),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (supabase as any).from('tasks').select('id', { count: 'exact', head: true })
        .eq('assigned_to', profile.id).not('status', 'in', '(done,cancelled)'),
    ]);

    setStats({
      open: open ?? 0,
      today: today ?? 0,
      activePatrol: !!patrol,
      unread: unread ?? 0,
      onShift: !!shift,
      siteOpen: siteOpen ?? 0,
      siteBreached: siteBreached ?? 0,
      onSiteVisitors: visitors ?? 0,
      openHandovers: handovers ?? 0,
      openTasks: openTasks ?? 0,
    });
    setLoading(false);
  }, [profile, isSupervisor]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const onRefresh = async () => { setRefreshing(true); await load(); setRefreshing(false); };

  if (!profile) return <View style={{ flex: 1, backgroundColor: theme.bg }} />;
  const firstName = (profile.full_name ?? profile.email ?? 'Guard').split(/\s+/)[0];
  const myRoles = profileRoles(profile);

  // A card shows only when its container toggle AND functional capability are
  // both granted. `funcCap = true` means "no extra functional gate".
  const showCard = (containerCap: string, funcCap: boolean) => can(containerCap) && funcCap;

  const cards: PortalCardConfig[] = [
    showCard('mobile.home.new_occurrence', can('occurrences.log')) && {
      id: 'new', icon: 'document-text', tint: theme.danger,
      title: 'New Occurrence', subtitle: 'Report an incident or security event',
      onPress: () => router.push('/(tabs)/new'),
    },
    showCard('mobile.home.shift', can('shifts.clock')) && {
      id: 'shift', icon: 'time', tint: theme.success,
      title: 'Shift Duty', subtitle: stats.onShift ? 'On shift — tap to clock out' : 'Manage duty status',
      badge: stats.onShift ? 'ON' : undefined, badgeTint: theme.success,
      onPress: () => router.push('/shift'),
    },
    showCard('mobile.home.patrol', can('patrols.run') || can('patrols.view')) && {
      id: 'patrol', icon: 'walk', tint: stats.activePatrol ? theme.success : theme.brand,
      title: stats.activePatrol ? 'Patrol Active' : 'Patrol',
      subtitle: stats.activePatrol ? 'Tap to scan checkpoints or end patrol' : 'Start a new patrol',
      badge: stats.activePatrol ? '●' : undefined, badgeTint: theme.success,
      onPress: () => router.push('/(tabs)/patrol'),
    },
    showCard('mobile.home.scan', can('patrols.scan')) && {
      id: 'scan', icon: 'qr-code', tint: theme.info,
      title: 'Scan Checkpoint', subtitle: 'Tap a QR or NFC checkpoint tag',
      onPress: () => router.push('/scan'),
    },
    showCard('mobile.home.tasks', true) && {
      id: 'tasks', icon: 'checkmark-done-circle', tint: theme.brand,
      title: 'My Tasks', subtitle: 'Work assigned to you',
      badge: stats.openTasks || undefined, badgeTint: theme.brand,
      onPress: () => router.push('/tasks'),
    },
    showCard('mobile.home.visitors', can('visitors.manage')) && {
      id: 'visitors', icon: 'people', tint: theme.warning,
      title: 'Visitors', subtitle: 'Sign visitors in and out at the gate',
      badge: stats.onSiteVisitors || undefined, badgeTint: theme.warning,
      onPress: () => router.push('/gate/visitors'),
    },
    showCard('mobile.home.keys', can('keys.manage')) && {
      id: 'keys', icon: 'key', tint: theme.brand,
      title: 'Key Register', subtitle: 'Issue and return keys',
      onPress: () => router.push('/gate/keys'),
    },
    showCard('mobile.home.history', true) && {
      id: 'history', icon: 'time-outline', tint: theme.info,
      title: 'History', subtitle: 'View your incident history',
      onPress: () => router.push('/(tabs)/logs?filter=all'),
    },
    // Supervisor extras
    isSupervisor && showCard('mobile.home.supervisor_board', can('team.view')) && {
      id: 'board', icon: 'pulse', tint: theme.danger,
      title: 'Site Board', subtitle: 'Live SLA board for your site',
      badge: stats.siteBreached || undefined, badgeTint: theme.danger,
      onPress: () => router.push('/supervisor/board'),
    },
    isSupervisor && showCard('mobile.home.team', can('team.view')) && {
      id: 'team', icon: 'people-circle', tint: theme.info,
      title: 'Team', subtitle: "See who's on duty right now",
      onPress: () => router.push('/supervisor/team'),
    },
  ].filter(Boolean) as PortalCardConfig[];

  const showKpi = can('mobile.home.kpi') || can('mobile.kpi_visible');

  return (
    <View style={{ flex: 1, backgroundColor: theme.bg }}>
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ padding: spacing.lg, paddingTop: spacing.xl * 2, paddingBottom: 120 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.brand} />}
        showsVerticalScrollIndicator={false}
      >
        {/* ----- Purple gradient header ----- */}
        <View style={styles.headerGradient}>
          {/* Real gradient via react-native-svg (works on native + web). */}
          <Svg style={StyleSheet.absoluteFill} width="100%" height="100%">
            <Defs>
              <SvgGradient id="hdr" x1="0" y1="0" x2="1" y2="1">
                <Stop offset="0" stopColor="#667eea" />
                <Stop offset="1" stopColor="#764ba2" />
              </SvgGradient>
            </Defs>
            <Rect x="0" y="0" width="100%" height="100%" fill="url(#hdr)" />
          </Svg>
          <View style={styles.headerContent}>
            <View style={styles.portalIcon}>
              <Ionicons name="shield-checkmark" size={26} color="#fff" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.portalTitle}>Guard Portal</Text>
              <Text style={styles.portalWelcome}>Welcome, {profile.full_name ?? firstName}</Text>
              <View style={styles.rolesRow}>
                {myRoles.map((r) => (
                  <View key={r} style={styles.roleBadge}>
                    <Text style={styles.roleBadgeText}>{ROLE_LABELS[r]}</Text>
                  </View>
                ))}
                {siteName && <Text style={styles.siteLight}>· {siteName}</Text>}
              </View>
            </View>
            <View style={{ flexDirection: 'row', gap: 4 }}>
              <IconBtnLight icon="notifications-outline" badge={stats.unread} onPress={() => router.push('/inbox')} />
              <IconBtnLight icon="settings-outline" onPress={() => router.push('/settings')} />
            </View>
          </View>
        </View>

        {/* ----- On Duty / Off Duty Toggle ----- */}
        {can('patrols.run') && (
          <View style={styles.dutyToggleContainer}>
            <View style={styles.dutyToggle}>
              {/* Off Duty Button */}
              <TouchableOpacity 
                onPress={stats.activePatrol ? () => router.push('/(tabs)/patrol') : undefined}
                style={[
                  styles.dutyButton,
                  !stats.activePatrol && styles.dutyButtonActiveOff
                ]}
                activeOpacity={0.8}
              >
                <View style={[
                  styles.indicatorDot,
                  !stats.activePatrol ? { backgroundColor: theme.danger } : { backgroundColor: theme.textMuted }
                ]} />
                <Text style={[
                  styles.dutyButtonText,
                  !stats.activePatrol && styles.dutyButtonTextActive
                ]}>Off Duty</Text>
              </TouchableOpacity>

              {/* On Duty Button */}
              <TouchableOpacity 
                onPress={!stats.activePatrol ? () => router.push('/(tabs)/patrol') : undefined}
                style={[
                  styles.dutyButton,
                  stats.activePatrol && styles.dutyButtonActiveOn
                ]}
                activeOpacity={0.8}
              >
                <View style={[
                  styles.indicatorDot,
                  stats.activePatrol ? { backgroundColor: theme.success } : { backgroundColor: theme.textMuted }
                ]} />
                <Text style={[
                  styles.dutyButtonText,
                  stats.activePatrol && styles.dutyButtonTextActive
                ]}>On Duty</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* ----- KPI strip (container toggle) ----- */}
        {showKpi && (
          <View style={styles.kpiRow}>
            <Stat label="My open" value={stats.open} icon="alert-circle-outline" tint={theme.warning} loading={loading} />
            <Stat label="Today" value={stats.today} icon="time-outline" tint={theme.brand} loading={loading} />
            {isSupervisor ? (
              <Stat label="Breached" value={stats.siteBreached} icon="flame-outline" tint={theme.danger} loading={loading} />
            ) : (
              <Stat label="Tasks" value={stats.openTasks} icon="checkmark-done-outline" tint={theme.info} loading={loading} />
            )}
          </View>
        )}

        {/* ----- Handover prompt ----- */}
        {stats.openHandovers > 0 && (
          <Press onPress={() => router.push('/handovers')} hapticStyle="light">
            <Card style={[styles.callout, { borderColor: theme.brand }]}>
              <Ionicons name="document-text" size={22} color={theme.brand} />
              <View style={{ flex: 1 }}>
                <Text style={styles.calloutTitle}>{stats.openHandovers} shift handover{stats.openHandovers === 1 ? '' : 's'} waiting</Text>
                <Text style={styles.calloutHint}>Acknowledge them before starting your shift.</Text>
              </View>
            </Card>
          </Press>
        )}

        {/* ----- Portal cards ----- */}
        <SectionTitle>What would you like to do?</SectionTitle>
        {loading && cards.length === 0 ? (
          <><SkeletonRow /><SkeletonRow /><SkeletonRow /></>
        ) : (
          cards.map((c) => <PortalCard key={c.id} {...c} />)
        )}

        {cards.length === 0 && !loading && (
          <Card style={{ alignItems: 'center', paddingVertical: spacing.xl }}>
            <Ionicons name="lock-closed-outline" size={28} color={theme.textMuted} />
            <Text style={[type.muted, { marginTop: 8, textAlign: 'center' }]}>
              No actions enabled for your role yet.{'\n'}Ask an admin to enable your containers.
            </Text>
          </Card>
        )}
      </ScrollView>
    </View>
  );
}

// ---------------------------------------------------------------------------
interface PortalCardConfig {
  id: string;
  icon: keyof typeof Ionicons.glyphMap;
  tint: string;
  title: string;
  subtitle: string;
  badge?: string | number;
  badgeTint?: string;
  onPress: () => void;
}

function PortalCard({ icon, tint, title, subtitle, badge, badgeTint, onPress }: PortalCardConfig) {
  return (
    <Press onPress={onPress} hapticStyle="light" style={styles.portalCardWrap}>
      <View style={styles.portalCard}>
        {/* Coloured accent rail */}
        <View style={[styles.portalRail, { backgroundColor: tint }]} />
        <View style={[styles.portalCardIcon, { backgroundColor: tint }]}>
          <Ionicons name={icon} size={24} color="#fff" />
        </View>
        <View style={{ flex: 1 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Text style={styles.portalCardTitle}>{title}</Text>
            {badge != null && (
              <View style={[styles.portalBadge, { backgroundColor: (badgeTint ?? tint) + '33', borderColor: badgeTint ?? tint }]}>
                <Text style={[styles.portalBadgeText, { color: badgeTint ?? tint }]}>{String(badge)}</Text>
              </View>
            )}
          </View>
          <Text style={styles.portalCardSubtitle}>{subtitle}</Text>
        </View>
        <Ionicons name="chevron-forward" size={20} color={theme.textMuted} />
      </View>
    </Press>
  );
}

function IconBtnLight({ icon, badge, onPress }: {
  icon: keyof typeof Ionicons.glyphMap; badge?: number; onPress: () => void;
}) {
  return (
    <Press onPress={onPress} style={styles.iconBtn} hapticStyle="light" hitSlop={6}>
      <Ionicons name={icon} size={22} color="rgba(255,255,255,0.9)" />
      {badge && badge > 0 ? (
        <View style={[styles.iconBtnBadge, { backgroundColor: '#fbbf24' }]}>
          <Text style={[styles.iconBtnBadgeText, { color: '#1f2937' }]}>{badge > 99 ? '99+' : String(badge)}</Text>
        </View>
      ) : null}
    </Press>
  );
}

const styles = StyleSheet.create({
  headerGradient: {
    marginHorizontal: -spacing.lg,
    marginTop: -spacing.xl * 2,
    paddingTop: spacing.xl * 2.5,
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.lg,
    marginBottom: spacing.lg,
    // Solid fallback behind the absolute-fill SVG gradient.
    backgroundColor: theme.brandPurple,
    borderBottomLeftRadius: radius.xl,
    borderBottomRightRadius: radius.xl,
    overflow: 'hidden',
  },
  headerContent: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  portalIcon: {
    width: 52, height: 52, borderRadius: radius.lg,
    backgroundColor: 'rgba(255,255,255,0.18)',
    alignItems: 'center', justifyContent: 'center',
  },
  portalTitle: { fontSize: 22, fontWeight: '800', color: '#fff', letterSpacing: -0.3 },
  portalWelcome: { fontSize: 13, color: 'rgba(255,255,255,0.85)', marginTop: 1 },
  siteLight: { color: 'rgba(255,255,255,0.7)', fontSize: 12 },
  rolesRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 6, alignItems: 'center' },
  roleBadge: { paddingHorizontal: 10, paddingVertical: 3, borderRadius: 12, backgroundColor: 'rgba(255,255,255,0.2)' },
  roleBadgeText: { color: '#fff', fontSize: 11, fontWeight: '600' },

  iconBtn: { padding: 8, position: 'relative' },
  iconBtnBadge: {
    position: 'absolute', top: 2, right: 2,
    minWidth: 18, height: 18, borderRadius: 9,
    backgroundColor: theme.danger, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4,
  },
  iconBtnBadgeText: { color: '#fff', fontSize: 10, fontWeight: '700' },

  kpiRow: { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.md },

  callout: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: spacing.md },
  calloutTitle: { color: theme.text, fontWeight: '700', fontSize: 14 },
  calloutHint: { color: theme.textMuted, fontSize: 12, marginTop: 2 },

  // Big portal cards
  portalCardWrap: { marginBottom: spacing.md },
  portalCard: {
    flexDirection: 'row', alignItems: 'center', gap: 14,
    backgroundColor: theme.surface, borderRadius: radius.lg,
    paddingVertical: spacing.lg, paddingHorizontal: spacing.lg, paddingLeft: spacing.lg + 4,
    borderWidth: 1, borderColor: theme.border,
    overflow: 'hidden',
  },
  portalRail: { position: 'absolute', left: 0, top: 0, bottom: 0, width: 5 },
  portalCardIcon: {
    width: 52, height: 52, borderRadius: radius.lg,
    alignItems: 'center', justifyContent: 'center',
  },
  portalCardTitle: { fontSize: 17, fontWeight: '700', color: theme.text },
  portalCardSubtitle: { fontSize: 13, color: theme.textMuted, marginTop: 2 },
  portalBadge: {
    minWidth: 22, paddingHorizontal: 7, paddingVertical: 1,
    borderRadius: 999, borderWidth: 1, alignItems: 'center', justifyContent: 'center',
  },
  portalBadgeText: { fontSize: 11, fontWeight: '800' },

  // On Duty / Off Duty Toggle Styles
  dutyToggleContainer: {
    marginBottom: spacing.md,
  },
  dutyToggle: {
    flexDirection: 'row',
    backgroundColor: theme.surface,
    borderRadius: radius.xl,
    padding: 4,
    borderWidth: 1,
    borderColor: theme.border,
  },
  dutyButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    borderRadius: radius.lg,
    backgroundColor: 'transparent',
  },
  dutyButtonActiveOff: {
    backgroundColor: theme.danger + '20',
    borderWidth: 1,
    borderColor: theme.danger,
  },
  dutyButtonActiveOn: {
    backgroundColor: theme.success + '20',
    borderWidth: 1,
    borderColor: theme.success,
  },
  indicatorDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  dutyButtonText: {
    fontSize: 15,
    fontWeight: '700',
    color: theme.textMuted,
  },
  dutyButtonTextActive: {
    color: theme.text,
  },
});
