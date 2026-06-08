// ---------------------------------------------------------------------------
// Over-the-air (OTA) updates — "one APK, push updates to every device".
//
// With EAS Update + `expo-updates`, a single installed APK pulls new JavaScript
// bundles from Expo's CDN on launch. The build's runtimeVersion (app.json →
// `runtimeVersion.policy = "appVersion"`) pins which updates it accepts, so as
// long as the native code is unchanged you can ship JS/asset changes instantly
// with `eas update --branch production` — no Play Store, no reinstall.
//
// This hook runs the check on cold start, downloads any available update, and
// reloads into it so the newest code is live immediately. It fails open: if the
// device is offline or the update server is unreachable, the app boots on its
// bundled JS instead of hanging on the splash.
// ---------------------------------------------------------------------------
import { useEffect, useState } from 'react';
import * as Updates from 'expo-updates';

export type OtaPhase =
  | 'checking'     // asking the server whether a newer bundle exists
  | 'downloading'  // pulling the new bundle before we reload into it
  | 'none'         // up to date / disabled / offline — safe to show the app
  | 'error';       // unexpected failure — also safe to show the app

// Never block the splash longer than this waiting on the network.
const MAX_BLOCK_MS = 6000;

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    p,
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error('ota_timeout')), ms)),
  ]);
}

export function useOtaUpdates(): OtaPhase {
  // `expo-updates` is inert in dev / Expo Go — go straight to the app there.
  const enabled = Updates.isEnabled && !__DEV__;
  const [phase, setPhase] = useState<OtaPhase>(enabled ? 'checking' : 'none');

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;

    (async () => {
      try {
        const check = await withTimeout(Updates.checkForUpdateAsync(), MAX_BLOCK_MS);
        if (cancelled) return;

        if (!check.isAvailable) {
          setPhase('none');
          return;
        }

        setPhase('downloading');
        await withTimeout(Updates.fetchUpdateAsync(), MAX_BLOCK_MS);
        if (cancelled) return;

        // Apply the freshly downloaded bundle. This restarts the JS runtime,
        // so nothing after it runs.
        await Updates.reloadAsync();
      } catch {
        // Offline, slow network, or timed out — boot on the bundled JS. Any
        // update that did download will be applied on the next launch.
        if (!cancelled) setPhase('none');
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [enabled]);

  return phase;
}
