// Home / Today screen. Same surface for guard + supervisor with role-aware
// modules: shift card, KPI strip, role-specific quick actions, supervisor's
// site board, and a sticky "Log occurrence" CTA.

import { useCallback, useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, RefreshControl,
} from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import { Badge, Card } from '@/components/ui';
import { IconTile, SectionTitle, SkeletonRow, EmptyState, Press, Stat } from '@/components/primitives';
import { theme, spacing, radius, type } from '@/lib/theme';
import { hasAnyRole, profileRoles, ROLE_LABELS } from '@digilog/shared';

interface Stats {
  open: number;
  today: number;
  activePatrol: boolean;
  unread: number;
  onShift: boolean;
  siteOpen: number;          // supervisor only
  siteBreached: number;      // supervisor only
  onSiteVisitors: number;    // gate / supervisor surface
  openHandovers: number;
}

const ZERO_STATS: Stats = {
  open: 0, today: 0, activePatrol: false, unread: 0, onShift: false,
  siteOpen: 0, siteBreached: 0, onSiteVisitors: 0, openHandovers: 0,
};

export default function Home() {
  const { profile } = useAuth();
  const router = useRouter();
  const [stats, setStats] = useState<Stats>(ZERO_STATS);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [siteName, setSiteName] = useState<string | null>(null);

  const isSupervisor = !!profile && hasAnyRole(profile, ['supervisor']);

  // Resolve site name once on mount / when profile changes.
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
      // Supervisor: open occurrences at MY site
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
    });
    setLoading(false);
  }, [profile, isSupervisor]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const onRefresh = async () => { setRefreshing(true); await load(); setRefreshing(false); };

  if (!profile) return <View style={{ flex: 1, backgroundColor: theme.bg }} />;
  const firstName = (profile.full_name ?? profile.email ?? 'Guard').split(/\s+/)[0];
  const myRoles = profileRoles(profile);

  return (
    <View style={{ flex: 1, backgroundColor: theme.bg }}>
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ padding: spacing.lg, paddingTop: spacing.xl * 2, paddingBottom: 120 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.brand} />}
        showsVerticalScrollIndicator={false}
      >
        {/* ----- header ----- */}
        <View style={styles.header}>
          <View style={{ flex: 1 }}>
            <Text style={styles.greeting}>Hi, {firstName}</Text>
            <View style={styles.rolesRow}>
              {myRoles.map((r, idx) => (
                <Badge key={r} label={ROLE_LABELS[r]} color={idx === 0 ? theme.brand : theme.brandPurple} />
              ))}
              {siteName && <Text style={styles.site}>· {siteName}</Text>}
            </View>
          </View>
          <View style={{ flexDirection: 'row', gap: 4 }}>
            <IconBtn icon="notifications-outline" badge={stats.unread} onPress={() => router.push('/inbox')} />
            <IconBtn icon="settings-outline" onPress={() => router.push('/settings')} />
          </View>
        </View>

        {/* ----- shift card ----- */}
        <TouchableOpacity onPress={() => router.push('/shift')} activeOpacity={0.85}>
          <View style={[styles.shiftCard, stats.onShift && styles.shiftCardOn]}>
            <View style={[styles.shiftDot, { backgroundColor: stats.onShift ? theme.success : theme.textFaint }]} />
            <View style={{ flex: 1 }}>
              <Text style={styles.shiftStatus}>
                {stats.onShift ? 'On shift' : 'Off shift'}
              </Text>
              <Text style={styles.shiftHint}>
                {stats.onShift ? 'Tap to view or clock out' : 'Tap to clock in'}
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color={theme.textMuted} />
          </View>
        </TouchableOpacity>

        {/* ----- KPI strip ----- */}
        <View style={styles.kpiRow}>
          <Stat label="My open"      value={stats.open}    icon="alert-circle-outline" tint={theme.warning} loading={loading} />
          <Stat label="Today"        value={stats.today}   icon="time-outline"        tint={theme.brand}   loading={loading} />
          {isSupervisor ? (
            <Stat label="Breached"   value={stats.siteBreached} icon="flame-outline" tint={theme.danger}  loading={loading} />
          ) : (
            <Stat label="Visitors"   value={stats.onSiteVisitors} icon="people-outline" tint={theme.info}  loading={loading} />
          )}
        </View>

        {/* ----- handover prompt ----- */}
        {stats.openHandovers > 0 && (
          <TouchableOpacity onPress={() => router.push('/handovers')}>
            <Card style={[styles.callout, { borderColor: theme.brand }]}>
              <Ionicons name="document-text" size={22} color={theme.brand} />
              <View style={{ flex: 1 }}>
                <Text style={styles.calloutTitle}>{stats.openHandovers} shift handover{stats.openHandovers === 1 ? '' : 's'} waiting</Text>
                <Text style={styles.calloutHint}>Acknowledge them before starting your shift.</Text>
              </View>
            </Card>
          </TouchableOpacity>
        )}

        {/* ----- patrol callout ----- */}
        {stats.activePatrol && (
          <TouchableOpacity onPress={() => router.push('/(tabs)/patrol')}>
            <Card style={[styles.callout, { borderColor: theme.success }]}>
              <Ionicons name="walk" size={22} color={theme.success} />
              <View style={{ flex: 1 }}>
                <Text style={styles.calloutTitle}>Patrol in progress</Text>
                <Text style={styles.calloutHint}>Tap to scan checkpoints or end</Text>
              </View>
            </Card>
          </TouchableOpacity>
        )}

        {/* ----- Quick actions ----- */}
        <SectionTitle>Quick actions</SectionTitle>
        <View style={styles.tilesGrid}>
          <IconTile icon="document-text" label="Log occurrence" onPress={() => router.push('/(tabs)/new')} />
          <IconTile icon="walk" label="Patrol" onPress={() => router.push('/(tabs)/patrol')}
            tint={stats.activePatrol ? theme.success : theme.brand}
            badge={stats.activePatrol ? '●' : undefined} />
          <IconTile icon="qr-code" label="Scan" onPress={() => router.push('/scan')} tint={theme.info} />
          <IconTile icon="people" label="Visitors" onPress={() => router.push('/gate/visitors')} tint={theme.warning}
            badge={stats.onSiteVisitors || undefined} />
          <IconTile icon="key" label="Keys" onPress={() => router.push('/gate/keys')} tint={theme.brand} />
          <IconTile icon="time" label="My shift" onPress={() => router.push('/shift')}
            tint={stats.onShift ? theme.success : theme.brand} />
        </View>

        {/* ----- Supervisor extras ----- */}
        {isSupervisor && (
          <>
            <SectionTitle>Supervisor</SectionTitle>
            <View style={styles.tilesGrid}>
              <IconTile icon="pulse" label="Site board" onPress={() => router.push('/supervisor/board')}
                tint={theme.danger} badge={stats.siteBreached || undefined} />
              <IconTile icon="people-circle" label="Team" onPress={() => router.push('/supervisor/team')} tint={theme.info} />
            </View>
          </>
        )}

        {/* ----- My recent — placeholder, real loader stays in /logs tab ----- */}
        <SectionTitle right={
          <Press onPress={() => router.push('/(tabs)/logs?filter=all')} hapticStyle="light" hitSlop={8}>
            <Text style={styles.sectionLink}>All →</Text>
          </Press>
        }>My logs · today</SectionTitle>
        <Press
          onPress={() => router.push('/(tabs)/logs?filter=today')}
          hapticStyle="light"
          style={{ marginBottom: spacing.md }}
        >
        <Card style={{ paddingVertical: 0, paddingHorizontal: 0 }}>
          {loading ? (
            <>
              <SkeletonRow />
              <SkeletonRow />
            </>
          ) : stats.today === 0 ? (
            <EmptyState
              icon="clipboard-outline"
              title="No incidents logged yet"
              hint="Use the Log tab below to record your first one."
            />
          ) : (
            <View style={styles.todayRow}>
              <Text style={styles.todayCount}>{stats.today}</Text>
              <Text style={[type.muted, { flex: 1 }]}>incident{stats.today === 1 ? '' : 's'} logged today</Text>
              <Ionicons name="chevron-forward" size={20} color={theme.textMuted} />
            </View>
          )}
        </Card>
        </Press>
      </ScrollView>
    </View>
  );
}

// ---------------------------------------------------------------------------
function IconBtn({ icon, badge, onPress }: {
  icon: keyof typeof Ionicons.glyphMap; badge?: number; onPress: () => void;
}) {
  return (
    <Press onPress={onPress} style={styles.iconBtn} hapticStyle="light" hitSlop={6}>
      <Ionicons name={icon} size={22} color={theme.textSecondary} />
      {badge && badge > 0 ? (
        <View style={styles.iconBtnBadge}>
          <Text style={styles.iconBtnBadgeText}>{badge > 99 ? '99+' : String(badge)}</Text>
        </View>
      ) : null}
    </Press>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between',
    marginBottom: spacing.lg,
  },
  greeting: { ...type.display, lineHeight: 36 },
  rolesRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 4, alignItems: 'center' },
  site: { color: theme.textMuted, fontSize: 13 },

  iconBtn: { padding: 8, position: 'relative' },
  iconBtnBadge: {
    position: 'absolute', top: 2, right: 2,
    minWidth: 18, height: 18, borderRadius: 9,
    backgroundColor: theme.danger, alignItems: 'center', justifyContent: 'center',
    paddingHorizontal: 4,
  },
  iconBtnBadgeText: { color: '#fff', fontSize: 10, fontWeight: '700' },

  shiftCard: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: theme.surface, borderRadius: radius.lg,
    padding: spacing.md,
    borderWidth: 1, borderColor: theme.border,
    marginBottom: spacing.md,
  },
  shiftCardOn: { borderColor: theme.success, backgroundColor: theme.successTint },
  shiftDot: { width: 10, height: 10, borderRadius: 5 },
  shiftStatus: { ...type.h3 },
  shiftHint: { ...type.muted, marginTop: 2 },

  kpiRow: { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.md },

  callout: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    marginBottom: spacing.sm,
  },
  calloutTitle: { color: theme.text, fontWeight: '700', fontSize: 14 },
  calloutHint: { color: theme.textMuted, fontSize: 12, marginTop: 2 },

  sectionLink: { color: theme.brand, fontSize: 12, fontWeight: '700' },

  tilesGrid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between' },

  todayRow: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: spacing.lg },
  todayCount: { color: theme.brand, fontSize: 32, fontWeight: '800' },
});
