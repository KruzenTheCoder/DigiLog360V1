// My Logs — searchable list of MY occurrences with status filter chips and
// pull-to-refresh. Tap any to open detail.

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity, RefreshControl, TextInput,
} from 'react-native';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import { Badge } from '@/components/ui';
import { EmptyState, SkeletonRow, Press } from '@/components/primitives';
import { theme, spacing, radius, type } from '@/lib/theme';
import {
  SEVERITY_COLORS, SEVERITY_LABELS, STATUS_COLORS, STATUS_LABELS,
  type Occurrence, type OccurrenceStatus,
} from '@digilog/shared';

type StatusFilter = 'today' | 'all' | 'open' | 'resolved';

const FILTERS: { key: StatusFilter; label: string }[] = [
  { key: 'today',    label: 'Today' },
  { key: 'all',      label: 'All' },
  { key: 'open',     label: 'Open' },
  { key: 'resolved', label: 'Closed' },
];

function parseFilter(raw: string | string[] | undefined): StatusFilter {
  if (raw === 'all' || raw === 'open' || raw === 'resolved') return raw;
  return 'today'; // sensible default for an empty / unknown param
}

export default function MyLogs() {
  const { profile } = useAuth();
  const router = useRouter();
  const params = useLocalSearchParams<{ filter?: string }>();
  const [items, setItems] = useState<Occurrence[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [query, setQuery] = useState('');
  // Initial filter respects ?filter= so Home's "All →" link and the
  // tap-the-card-for-today shortcut both land where the user expects.
  const [filter, setFilter] = useState<StatusFilter>(() => parseFilter(params.filter));

  // If the user opens the tab again with a different ?filter=, adopt it.
  useEffect(() => {
    if (params.filter) setFilter(parseFilter(params.filter));
  }, [params.filter]);

  const load = useCallback(async () => {
    if (!profile) return;
    setLoading(true);
    const { data } = await supabase.from('occurrences').select('*')
      .eq('logged_by', profile.id)
      .order('created_at', { ascending: false }).limit(200);
    setItems((data ?? []) as Occurrence[]);
    setLoading(false);
  }, [profile]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  // Subscribe so the list updates if status changes from web side.
  useEffect(() => {
    if (!profile) return;
    const ch = supabase
      .channel(`mylogs-${profile.id}`)
      .on('postgres_changes', {
        event: 'UPDATE', schema: 'public', table: 'occurrences',
        filter: `logged_by=eq.${profile.id}`,
      }, () => load())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [profile, load]);

  const filtered = useMemo(() => {
    const closedStatuses: OccurrenceStatus[] = ['resolved', 'closed'];
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);
    return items.filter((o) => {
      if (filter === 'today') {
        // Today's logs only — compare on local midnight of created_at.
        if (new Date(o.created_at).getTime() < startOfToday.getTime()) return false;
      }
      if (filter === 'open' && closedStatuses.includes(o.status)) return false;
      if (filter === 'resolved' && !closedStatuses.includes(o.status)) return false;
      if (query) {
        const q = query.toLowerCase();
        const hay = `${o.ob_number} ${o.occurrence_type} ${o.description}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [items, filter, query]);

  return (
    <View style={{ flex: 1, backgroundColor: theme.bg }}>
      {/* ----- header ----- */}
      <View style={styles.header}>
        <Text style={type.h1}>My Logs</Text>
        <Text style={[type.muted, { marginTop: 4 }]}>{filtered.length} of {items.length}</Text>
      </View>

      {/* ----- search ----- */}
      <View style={styles.searchWrap}>
        <Ionicons name="search" size={18} color={theme.textMuted} />
        <TextInput
          style={styles.searchInput}
          placeholder="Search OB#, type, description…"
          placeholderTextColor={theme.textMuted}
          value={query}
          onChangeText={setQuery}
          autoCorrect={false}
          autoCapitalize="none"
        />
        {query !== '' && (
          <Press onPress={() => setQuery('')} hapticStyle="light" hitSlop={8}>
            <Ionicons name="close-circle" size={18} color={theme.textMuted} />
          </Press>
        )}
      </View>

      {/* ----- filter chips ----- */}
      <View style={styles.chipsRow}>
        {FILTERS.map((f) => (
          <Press
            key={f.key}
            onPress={() => setFilter(f.key)}
            style={[styles.chip, filter === f.key && styles.chipActive]}
          >
            <Text style={[styles.chipText, filter === f.key && styles.chipTextActive]}>{f.label}</Text>
          </Press>
        ))}
      </View>

      {/* ----- list ----- */}
      <FlatList
        data={filtered}
        keyExtractor={(i) => String(i.id)}
        contentContainerStyle={{ paddingHorizontal: spacing.lg, paddingBottom: 120 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await load(); setRefreshing(false); }} tintColor={theme.brand} />}
        ListEmptyComponent={
          loading ? (
            <View><SkeletonRow /><SkeletonRow /><SkeletonRow /></View>
          ) : (
            <EmptyState
              icon="clipboard-outline"
              title={query || filter !== 'all' ? 'No matches' : 'No incidents logged'}
              hint={filter === 'today'
                ? 'Nothing logged today yet — use the Log tab below to record the first one.'
                : query || filter !== 'all'
                  ? 'Try clearing your filters or tapping All.'
                  : 'Use the Log tab below to record your first one.'}
            />
          )
        }
        renderItem={({ item }) => (
          <Press
            onPress={() => router.push(`/occurrence/${item.id}`)}
            style={styles.card}
            hapticStyle="light"
          >
            <View style={styles.cardTop}>
              <Text style={styles.cardOb}>{item.ob_number}</Text>
              <View style={{ flexDirection: 'row', gap: 4 }}>
                <Badge label={SEVERITY_LABELS[item.severity]} color={SEVERITY_COLORS[item.severity]} />
                <Badge label={STATUS_LABELS[item.status]} color={STATUS_COLORS[item.status]} />
              </View>
            </View>
            <Text style={styles.cardType}>{item.occurrence_type}</Text>
            <Text style={styles.cardDesc} numberOfLines={2}>{item.description}</Text>
            <Text style={styles.cardDate}>{new Date(item.incident_at).toLocaleString()}</Text>
          </Press>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    paddingHorizontal: spacing.lg, paddingTop: spacing.xl * 2,
    paddingBottom: spacing.md,
  },

  searchWrap: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: theme.surface, borderColor: theme.border, borderWidth: 1,
    borderRadius: radius.md, marginHorizontal: spacing.lg, paddingHorizontal: 12,
    paddingVertical: 6,
  },
  searchInput: { flex: 1, color: theme.text, fontSize: 14 },

  chipsRow: {
    flexDirection: 'row', gap: 6, paddingHorizontal: spacing.lg,
    marginTop: spacing.sm, marginBottom: spacing.md,
  },
  chip: {
    paddingHorizontal: 14, paddingVertical: 6, borderRadius: 999,
    backgroundColor: theme.surface, borderWidth: 1, borderColor: theme.border,
  },
  chipActive: { backgroundColor: theme.brand, borderColor: theme.brand },
  chipText: { color: theme.textMuted, fontWeight: '600', fontSize: 13 },
  chipTextActive: { color: '#fff' },

  card: {
    backgroundColor: theme.surface, borderColor: theme.border, borderWidth: 1,
    borderRadius: 14, padding: spacing.md, marginBottom: spacing.sm,
  },
  cardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  cardOb: { color: theme.brand, fontWeight: '800', fontSize: 15 },
  cardType: { color: theme.text, fontWeight: '600', marginTop: 4 },
  cardDesc: { color: theme.textMuted, fontSize: 13, marginTop: 2 },
  cardDate: { color: theme.textFaint, fontSize: 11, marginTop: 6 },
});
