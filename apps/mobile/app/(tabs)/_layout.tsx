// Tab layout — Home, Patrol, Log, My Logs.
// "Log" is the central + button — primary entry to record an occurrence.
//
// Every tab is controllable from the super-user permissions matrix:
//   • mobile.tab_bar      — master switch; off ⇒ the whole bottom bar is hidden
//                           (the app is then navigated entirely from the home
//                           portal cards).
//   • mobile.tab.home     — Home tab
//   • mobile.tab.patrol   — Patrol tab   (+ patrols.run / patrols.view)
//   • mobile.tab.log      — Log (+) tab  (+ occurrences.log)
//   • mobile.tab.logs     — My Logs tab  (+ occurrences.view_*)
// A tab needs BOTH its visibility toggle AND its functional capability.

import { Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { View, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { theme } from '@/lib/theme';
import { haptic } from '@/components/primitives';
import { useAuth } from '@/lib/auth';
import { hasAnyCapability, type CapabilityKey } from '@digilog/shared';

const TAB_HAPTIC_LISTENERS = {
  tabPress: () => haptic('medium'),
};

export default function TabsLayout() {
  const insets = useSafeAreaInsets();
  const { capabilities } = useAuth();
  const baseHeight = 60;
  const basePaddingBottom = 8;

  // While caps load (`null`) show optimistically so the bar doesn't flash
  // empty; once resolved, ungranted tabs disappear via `href: null`.
  const has = (keys: CapabilityKey[]) =>
    capabilities === null || hasAnyCapability(capabilities, keys);

  // A tab is visible only when BOTH its visibility toggle AND (optionally) its
  // functional capability are granted.
  const showTab = (visKey: CapabilityKey, funcKeys?: CapabilityKey[]) =>
    has([visKey]) && (!funcKeys || has(funcKeys));
  const tabHref = (visKey: CapabilityKey, funcKeys?: CapabilityKey[]) =>
    showTab(visKey, funcKeys) ? undefined : { href: null as null };

  // Master switch: hide the entire bottom bar (resolved caps only — never hide
  // it while still loading, or the user could be left with no navigation).
  const barHidden = capabilities !== null && !hasAnyCapability(capabilities, ['mobile.tab_bar']);

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: theme.brand,
        tabBarInactiveTintColor: theme.textMuted,
        tabBarStyle: barHidden
          ? { display: 'none' }
          : {
              backgroundColor: theme.surface,
              borderTopColor: theme.borderSoft,
              height: baseHeight + insets.bottom,
              paddingBottom: basePaddingBottom + insets.bottom,
              paddingTop: 6,
            },
        tabBarLabelStyle: { fontSize: 11, fontWeight: '600' },
      }}
    >
      <Tabs.Screen
        name="index"
        listeners={TAB_HAPTIC_LISTENERS}
        options={{
          title: 'Home',
          tabBarIcon: ({ color, size }) => <Ionicons name="home" size={size} color={color} />,
          ...tabHref('mobile.tab.home'),
        }}
      />
      <Tabs.Screen
        name="patrol"
        listeners={TAB_HAPTIC_LISTENERS}
        options={{
          title: 'Patrol',
          tabBarIcon: ({ color, size }) => <Ionicons name="walk" size={size} color={color} />,
          ...tabHref('mobile.tab.patrol', ['patrols.run', 'patrols.view']),
        }}
      />
      <Tabs.Screen
        name="new"
        listeners={TAB_HAPTIC_LISTENERS}
        options={{
          title: 'Log',
          tabBarIcon: ({ color, size }) => (
            <View style={styles.centerIcon}>
              <Ionicons name="add-circle" size={size + 6} color={color} />
            </View>
          ),
          ...tabHref('mobile.tab.log', ['occurrences.log']),
        }}
      />
      <Tabs.Screen
        name="logs"
        listeners={TAB_HAPTIC_LISTENERS}
        options={{
          title: 'My Logs',
          tabBarIcon: ({ color, size }) => <Ionicons name="list" size={size} color={color} />,
          ...tabHref('mobile.tab.logs', ['occurrences.view_assigned', 'occurrences.view_all']),
        }}
      />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  centerIcon: { marginTop: -8 },
});
