import { useEffect } from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { Stack, useRouter, useSegments } from 'expo-router';
import * as Notifications from 'expo-notifications';
import { AuthProvider, useAuth } from '@/lib/auth';
import { registerPushToken } from '@/lib/push';
import { startAutoFlush, flushQueue } from '@/lib/offline-queue';
import { useOtaUpdates } from '@/lib/updates';
import { BrandSplash } from '@/components/splash';
import { theme } from '@/lib/theme';

// Notification payload shapes we accept. Anything else falls through to /inbox.
interface PushData {
  type?: string;
  occurrence_id?: number | string;
  ob_number?: string;
}

function pickRouteForNotification(data: PushData | undefined): string {
  if (!data) return '/inbox';
  // Highest priority: deep link to a specific occurrence.
  if (data.occurrence_id !== undefined && data.occurrence_id !== null) {
    return `/occurrence/${data.occurrence_id}`;
  }
  switch (data.type) {
    case 'patrol_late':       return '/supervisor/board';
    case 'handover':          return '/handovers';
    case 'sla':               return '/supervisor/board';
    default:                  return '/inbox';
  }
}

function RootNavigator() {
  const { session, profile, loading } = useAuth();
  const ota = useOtaUpdates();
  const segments = useSegments();
  const router = useRouter();

  // Auth gating
  useEffect(() => {
    if (loading) return;
    const inAuthGroup = segments[0] === 'login';
    if (!session && !inAuthGroup) router.replace('/login');
    else if (session && profile && inAuthGroup) router.replace('/(tabs)');
  }, [session, profile, loading, segments, router]);

  // Push token registration
  useEffect(() => {
    if (session?.user) registerPushToken(session.user.id);
  }, [session?.user?.id]);

  // Offline queue
  useEffect(() => {
    if (!session?.user) return;
    flushQueue().catch(() => {});
    const unsub = startAutoFlush();
    return () => { unsub(); };
  }, [session?.user?.id]);

  // ---------------------------------------------------------------------
  // Push notification deep-linking
  //
  // 1. Cold start  → app launched from a notification → navigate as soon
  //    as we have a session.
  // 2. Background  → user tapped while running → navigate immediately.
  // ---------------------------------------------------------------------
  useEffect(() => {
    if (!session?.user) return;

    // Cold start handling.
    Notifications.getLastNotificationResponseAsync().then((response) => {
      if (!response) return;
      const data = response.notification.request.content.data as PushData | undefined;
      const route = pickRouteForNotification(data);
      router.push(route);
    });

    // Active app — tap on a notification while running.
    const sub = Notifications.addNotificationResponseReceivedListener((response) => {
      const data = response.notification.request.content.data as PushData | undefined;
      const route = pickRouteForNotification(data);
      router.push(route);
    });
    return () => { sub.remove(); };
  }, [session?.user?.id, router]);

  // Hold on the branded splash while we either pull an OTA update or restore
  // the session. The OTA hook fails open, so this never blocks boot when the
  // device is offline.
  const updating = ota === 'checking' || ota === 'downloading';
  if (updating || loading) {
    return (
      <BrandSplash
        status={
          ota === 'downloading'
            ? 'Installing the latest update…'
            : ota === 'checking'
              ? 'Checking for updates…'
              : undefined
        }
      />
    );
  }

  return (
    <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: theme.bg } }}>
      <Stack.Screen name="login" />
      <Stack.Screen name="(tabs)" />
      <Stack.Screen name="scan" options={{ presentation: 'modal' }} />
      <Stack.Screen name="occurrence/[id]" options={{ presentation: 'card' }} />
      <Stack.Screen name="settings" options={{ presentation: 'card' }} />
      <Stack.Screen name="inbox" options={{ presentation: 'card' }} />
      <Stack.Screen name="shift" options={{ presentation: 'card' }} />
      <Stack.Screen name="handovers" options={{ presentation: 'card' }} />
      <Stack.Screen name="gate/visitors" options={{ presentation: 'card' }} />
      <Stack.Screen name="gate/keys" options={{ presentation: 'card' }} />
      <Stack.Screen name="supervisor/board" options={{ presentation: 'card' }} />
      <Stack.Screen name="supervisor/team" options={{ presentation: 'card' }} />
    </Stack>
  );
}

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <AuthProvider>
          <StatusBar style="light" />
          <RootNavigator />
        </AuthProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
