// Tab layout — 4 tabs: Home, Patrol, Log, My Logs.
// "Log" is the central + button — primary entry to record an occurrence.
// (Home also has a Log-occurrence tile as a secondary path.)

import { Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { View, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { theme } from '@/lib/theme';
import { haptic } from '@/components/primitives';

// React-Navigation listener that fires a haptic on every tab tap (including
// re-taps of the current tab). Shared across all four tab screens so the
// feedback is identical on every press.
const TAB_HAPTIC_LISTENERS = {
  tabPress: () => haptic('medium'),
};

export default function TabsLayout() {
  // Push the tab bar above the Android system nav (3-button or gesture pill)
  // and the iOS home indicator. Without this, the OS chrome overlaps the
  // tab icons and labels — especially obvious on gesture-nav Android devices
  // where the OS draws a translucent pill across the bottom of the screen.
  const insets = useSafeAreaInsets();
  const baseHeight = 60;
  const basePaddingBottom = 8;
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: theme.brand,
        tabBarInactiveTintColor: theme.textMuted,
        tabBarStyle: {
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
        }}
      />
      <Tabs.Screen
        name="patrol"
        listeners={TAB_HAPTIC_LISTENERS}
        options={{
          title: 'Patrol',
          tabBarIcon: ({ color, size }) => <Ionicons name="walk" size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="new"
        listeners={TAB_HAPTIC_LISTENERS}
        options={{
          // Central "Log" button — primary entry point to record an occurrence.
          title: 'Log',
          tabBarIcon: ({ color, size }) => (
            <View style={styles.centerIcon}>
              <Ionicons name="add-circle" size={size + 6} color={color} />
            </View>
          ),
        }}
      />
      <Tabs.Screen
        name="logs"
        listeners={TAB_HAPTIC_LISTENERS}
        options={{
          title: 'My Logs',
          tabBarIcon: ({ color, size }) => <Ionicons name="list" size={size} color={color} />,
        }}
      />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  centerIcon: { marginTop: -8 },
});
