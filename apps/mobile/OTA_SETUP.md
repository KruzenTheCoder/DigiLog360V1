# DigiLog 360 — One APK, push updates to every device (EAS Update)

The app is wired for **over-the-air (OTA) updates**: you install **one APK** on every
device, then ship JavaScript/asset changes instantly with a single command — no
Play Store, no reinstall. Devices pull the new bundle on next launch (the app
shows a branded "Installing the latest update…" splash while it does).

## One-time setup (needs your Expo account)

The repo ships with placeholders that must be replaced with your real Expo
project. This is the only step that requires your login — it can't be done for
you.

```bash
cd apps/mobile

# 1. Log in (create a free account at https://expo.dev if you don't have one)
npx eas-cli login

# 2. Link/create the Expo project. This fills in extra.eas.projectId in app.json.
npx eas-cli init

# 3. Wire up EAS Update. This sets updates.url to https://u.expo.dev/<projectId>.
npx eas-cli update:configure
```

After running those, confirm `app.json` no longer contains the placeholders:

- `expo.owner` → your Expo account/org (replaces `"your-expo-username"`)
- `expo.extra.eas.projectId` → real UUID (replaces `"your-project-id"`)
- `expo.updates.url` → `https://u.expo.dev/<that-uuid>` (replaces `.../your-project-id`)

## Build the single APK (once per native change)

```bash
npm run build:production     # eas build --profile production --platform android
```

Install the resulting APK on every device. You only rebuild/reinstall when you
change **native** code — new native module, permission, icon, or splash, or an
SDK bump.

> Because you just changed the icon and splash, you must do **one** production
> build now so the new branding ships. After that, branding/JS tweaks go out
> over the air.

## Push an update to all installed APKs

```bash
npm run update:production    # eas update --branch production
```

Every device on the `production` channel picks it up on its next cold start.

## How "one APK, all updates" holds together

- `runtimeVersion.policy = "appVersion"` (app.json) pins updates to the build's
  app version. Every device on app version `1.0.0` accepts `1.0.0` updates.
- `eas.json` maps the `production` build profile to the `production` update
  channel, so builds and `eas update` line up automatically.
- The OTA check lives in [src/lib/updates.ts](src/lib/updates.ts) (`useOtaUpdates`),
  invoked from [app/_layout.tsx](app/_layout.tsx). It fails open — offline
  devices boot on their bundled JS instead of hanging.

⚠️ **Don't bump `expo.version`** unless you also rebuild and redistribute the
APK — raising the app version changes the runtimeVersion, so old installs stop
receiving OTA updates until they're rebuilt.
