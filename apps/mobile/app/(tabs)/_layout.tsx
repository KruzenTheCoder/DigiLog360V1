import { Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { theme } from '@/lib/theme';

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: theme.brand,
        tabBarInactiveTintColor: theme.textMuted,
        tabBarStyle: {
          backgroundColor: theme.surface,
          borderTopColor: theme.border,
          height: 62,
          paddingBottom: 8,
          paddingTop: 6,
        },
        tabBarLabelStyle: { fontSize: 11, fontWeight: '600' },
      }}
    >
      <Tabs.Screen name="index" options={{
        title: 'Home',
        tabBarIcon: ({ color, size }) => <Ionicons name="home" size={size} color={color} />,
      }} />
      <Tabs.Screen name="patrol" options={{
        title: 'Patrol',
        tabBarIcon: ({ color, size }) => <Ionicons name="walk" size={size} color={color} />,
      }} />
      <Tabs.Screen name="new" options={{
        title: 'Log',
        tabBarIcon: ({ color, size }) => <Ionicons name="add-circle" size={size + 6} color={color} />,
      }} />
      <Tabs.Screen name="logs" options={{
        title: 'My Logs',
        tabBarIcon: ({ color, size }) => <Ionicons name="list" size={size} color={color} />,
      }} />
    </Tabs>
  );
}
