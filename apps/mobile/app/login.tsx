// PIN-only login.
//
// Multi-tenant: each device sets its organisation slug on first launch
// (e.g. "pmi"). The slug is persisted to AsyncStorage so subsequent launches
// jump straight to the PIN keypad. Guards then enter only their 4-digit PIN
// and the server identifies them by bcrypt-comparing against every mobile
// profile in the org.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View, Text, StyleSheet, KeyboardAvoidingView, Platform, Image, TouchableOpacity,
  ScrollView, Vibration, useWindowDimensions, Alert,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '@/lib/auth';
import { Button, Field } from '@/components/ui';
import { useToast } from '@/components/primitives';
import { theme, spacing, radius, type } from '@/lib/theme';
import { BRAND, isValidPinFormat } from '@digilog/shared';

const ORG_SLUG_KEY = 'digilog.org_slug';
// Lowercase letters, digits, hyphens. 2–40 chars. Matches the slug pattern
// used by the seeds / migrations on the server side.
const SLUG_PATTERN = /^[a-z0-9][a-z0-9-]{1,39}$/;
const PIN_DISPLAY_SLOTS = 4;
// digilog-logo.png = shield icon · digilog-mark.png = "DigiLog360" wordmark.
const shield = require('../assets/branding/digilog-logo.png');
const wordmark = require('../assets/branding/digilog-mark.png');

// ---------------------------------------------------------------------------
// Keypad key. The outer TouchableOpacity is the hit target (sized by aspect
// ratio so it stays square). The CONTENT is inside an absolutely-positioned
// overlay that fills the key — this is the only reliable way to centre text
// in RN on Android, because it bypasses the Text's own line-box quirks
// (font padding, leading, baseline drift). All children — digits and icons
// alike — render inside the same overlay with identical flex centring,
// so they line up pixel-for-pixel.
// ---------------------------------------------------------------------------
function Key({
  size, onPress, disabled, children, variant,
}: {
  size: number;
  onPress: () => void;
  disabled?: boolean;
  children: React.ReactNode;
  variant?: 'muted';
}) {
  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={disabled}
      activeOpacity={0.55}
      style={[
        styles.key,
        variant === 'muted' && styles.keyMuted,
        { width: size, height: size, borderRadius: Math.round(size * 0.28) },
      ]}
    >
      <View style={styles.keyContent} pointerEvents="none">
        {children}
      </View>
    </TouchableOpacity>
  );
}

function DigitKey({
  d, size, onPress, disabled,
}: { d: string; size: number; onPress: (d: string) => void; disabled?: boolean }) {
  return (
    <Key size={size} onPress={() => onPress(d)} disabled={disabled}>
      <Text
        style={styles.keyDigit}
        allowFontScaling={false}
        numberOfLines={1}
      >
        {d}
      </Text>
    </Key>
  );
}

export default function Login() {
  const { signInWithPin } = useAuth();
  const toast = useToast();

  // Compute the dialpad key size from the actual window width. Percentage
  // widths inside a flex-row with flex-wrap have been collapsing on this
  // device's New Architecture renderer, so we lay out with absolute pixels.
  // 3 columns, 14px gaps, scroll padding 24px each side, capped at 96px so
  // tablets don't get goofy.
  const { width: winWidth } = useWindowDimensions();
  const KEYPAD_GAP = 14;
  const KEYPAD_OUTER_PADDING = spacing.xl * 2; // matches styles.scroll padding
  const computedKey = Math.floor((winWidth - KEYPAD_OUTER_PADDING - KEYPAD_GAP * 2) / 3);
  const keySize = Math.max(64, Math.min(96, computedKey));

  const [pin, setPin] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Org slug — null while loading from AsyncStorage, '' if never set
  // (triggers the setup screen), or a real slug.
  const [orgSlug, setOrgSlug] = useState<string | null>(null);

  // Hydrate the saved org slug on mount.
  useEffect(() => {
    AsyncStorage.getItem(ORG_SLUG_KEY)
      .then((stored) => setOrgSlug(stored ?? ''))
      .catch(() => setOrgSlug(''));
  }, []);

  const submittingRef = useRef(false);

  // Clear errors when user starts a new PIN entry attempt.
  const onPinChange = useCallback((next: string) => {
    setError(null);
    setPin(next);
  }, []);

  const submit = useCallback(async (pinValue: string) => {
    if (submittingRef.current) return;
    if (!orgSlug) {
      setError('Set this device\'s organisation first.');
      return;
    }
    if (!isValidPinFormat(pinValue)) {
      setError('PIN must be 4 digits.');
      Vibration.vibrate(60);
      return;
    }
    submittingRef.current = true;
    setLoading(true);
    setError(null);
    const { error: err } = await signInWithPin({ org_slug: orgSlug, pin: pinValue });
    setLoading(false);
    submittingRef.current = false;
    if (err) {
      setError(err);
      Vibration.vibrate([0, 60, 60, 60]);
      setPin('');
      return;
    }
    toast.show('Signed in', 'ok');
  }, [signInWithPin, toast, orgSlug]);

  // Save a new slug + clear any stale PIN entry. Called from the setup screen
  // and from the "Change organisation" affordance.
  const saveOrgSlug = useCallback(async (raw: string) => {
    const clean = raw.trim().toLowerCase();
    await AsyncStorage.setItem(ORG_SLUG_KEY, clean);
    setOrgSlug(clean);
    setPin('');
    setError(null);
  }, []);

  const promptChangeOrg = useCallback(() => {
    Alert.alert(
      'Change organisation?',
      `This device is currently set to "${orgSlug}". Switching will clear the PIN and ask for a new slug. Your sign-in history isn't affected.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Change',
          style: 'destructive',
          onPress: async () => {
            await AsyncStorage.removeItem(ORG_SLUG_KEY);
            setOrgSlug('');
            setPin('');
            setError(null);
          },
        },
      ],
    );
  }, [orgSlug]);

  const tapDigit = useCallback((d: string) => {
    if (pin.length >= 4) return;
    const next = pin + d;
    onPinChange(next);
    if (Platform.OS === 'android') Vibration.vibrate(15);
    if (next.length === 4) {
      // Tiny delay so the 4th dot fills visually before loading state kicks in.
      setTimeout(() => submit(next), 120);
    }
  }, [pin, onPinChange, submit]);

  const backspace = useCallback(() => {
    if (!pin) return;
    onPinChange(pin.slice(0, -1));
  }, [pin, onPinChange]);

  const clearPin = useCallback(() => onPinChange(''), [onPinChange]);

  useEffect(() => () => { submittingRef.current = false; }, []);

  const pinDisplay = useMemo(
    () => Array.from({ length: Math.max(PIN_DISPLAY_SLOTS, pin.length) }, (_, i) => pin[i] ?? ''),
    [pin],
  );

  // Initial hydration of AsyncStorage — render a blank backdrop instead of
  // flashing either the setup screen or the PIN keypad while we wait.
  if (orgSlug === null) {
    return <View style={{ flex: 1, backgroundColor: theme.bg }} />;
  }

  // First launch on this device → ask for the org slug before showing PIN.
  if (orgSlug === '') {
    return (
      <OrgSetup
        onSave={saveOrgSlug}
        ToastView={toast.ToastView}
        notifyError={(m) => toast.show(m, 'error')}
      />
    );
  }

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: theme.bg }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView
        contentContainerStyle={styles.scroll}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* ----- brand ----- */}
        <View style={styles.brand}>
          <Image source={shield} style={styles.shield} resizeMode="contain" />
          <Image source={wordmark} style={styles.wordmark} resizeMode="contain" />
          <Text style={styles.subtitle} allowFontScaling={false}>Field Security App</Text>
        </View>

        {/* ----- org chip — shows the active org + lets user switch ----- */}
        <TouchableOpacity
          onPress={promptChangeOrg}
          activeOpacity={0.7}
          style={styles.orgChip}
        >
          <Ionicons name="business-outline" size={14} color={theme.textMuted} />
          <Text style={styles.orgChipText} allowFontScaling={false}>{orgSlug}</Text>
          <Ionicons name="swap-horizontal" size={14} color={theme.textMuted} />
        </TouchableOpacity>

        {/* ----- PIN display ----- */}
        <Text style={styles.pinHeading} allowFontScaling={false}>Enter your PIN</Text>
        <View style={styles.pinRow}>
          {pinDisplay.map((d, i) => (
            <View
              key={i}
              style={[
                styles.pinDot,
                d ? styles.pinDotFilled : null,
                !!error && styles.pinDotError,
              ]}
            />
          ))}
        </View>

        {error && (
          <View style={styles.errorPill}>
            <Ionicons name="alert-circle" size={14} color="#fff" />
            <Text style={styles.errorText} allowFontScaling={false}>{error}</Text>
          </View>
        )}

        {/* ----- keypad ----- */}
        <View style={[styles.keypad, { gap: KEYPAD_GAP }]}>
          {['1','2','3','4','5','6','7','8','9'].map((d) => (
            <DigitKey key={d} d={d} size={keySize} onPress={tapDigit} disabled={loading} />
          ))}

          <Key size={keySize} onPress={clearPin} disabled={loading} variant="muted">
            <Ionicons name="refresh-outline" size={Math.round(keySize * 0.34)} color={theme.textMuted} />
          </Key>

          <DigitKey d="0" size={keySize} onPress={tapDigit} disabled={loading} />

          <Key size={keySize} onPress={backspace} disabled={loading} variant="muted">
            <Ionicons name="backspace-outline" size={Math.round(keySize * 0.34)} color={theme.text} />
          </Key>
        </View>

        <View style={styles.signInWrap}>
          <Button
            title="Sign In"
            onPress={() => submit(pin)}
            loading={loading}
            icon={<Ionicons name="log-in" size={18} color="#fff" />}
          />
        </View>

        <Text style={styles.footer} allowFontScaling={false}>
          © {new Date().getFullYear()} {BRAND.company}
        </Text>
      </ScrollView>

      <toast.ToastView />
    </KeyboardAvoidingView>
  );
}

// ---------------------------------------------------------------------------
// OrgSetup — first-launch screen that asks for the organisation slug. Saved
// once, never asked again unless the user explicitly changes it.
// ---------------------------------------------------------------------------
function OrgSetup({
  onSave, ToastView, notifyError,
}: {
  onSave: (slug: string) => Promise<void> | void;
  ToastView: () => React.ReactElement | null;
  notifyError: (m: string) => void;
}) {
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);

  async function continueSetup() {
    const cleaned = draft.trim().toLowerCase();
    if (!cleaned) { notifyError('Enter your organisation slug.'); return; }
    if (!SLUG_PATTERN.test(cleaned)) {
      notifyError('Slug must be lowercase letters, numbers, or hyphens (e.g. "pmi").');
      return;
    }
    setBusy(true);
    try { await onSave(cleaned); } finally { setBusy(false); }
  }

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: theme.bg }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView
        contentContainerStyle={styles.scroll}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.brand}>
          <Image source={shield} style={styles.shield} resizeMode="contain" />
          <Image source={wordmark} style={styles.wordmark} resizeMode="contain" />
          <Text style={styles.subtitle} allowFontScaling={false}>Field Security App</Text>
        </View>

        <View style={styles.setupCard}>
          <View style={styles.setupHeader}>
            <View style={styles.setupIcon}>
              <Ionicons name="business" size={22} color={theme.brand} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.setupTitle} allowFontScaling={false}>Set up this device</Text>
              <Text style={styles.setupHint} allowFontScaling={false}>
                Enter your organisation slug to link this device. Your supervisor or
                administrator will have given it to you (e.g. <Text style={styles.setupMono}>pmi</Text>).
                You'll only need to do this once.
              </Text>
            </View>
          </View>

          <View style={{ marginTop: spacing.lg }}>
            <Field
              label="Organisation slug"
              value={draft}
              onChangeText={(t) => setDraft(t.replace(/[^a-z0-9-]/gi, '').toLowerCase())}
              placeholder="e.g. pmi"
              autoCapitalize="none"
              autoCorrect={false}
              autoFocus
              maxLength={40}
            />
            <Button
              title="Continue"
              onPress={continueSetup}
              loading={busy}
              icon={<Ionicons name="arrow-forward" size={18} color="#fff" />}
            />
          </View>
        </View>

        <Text style={styles.footer} allowFontScaling={false}>
          © {new Date().getFullYear()} {BRAND.company}
        </Text>
      </ScrollView>
      <ToastView />
    </KeyboardAvoidingView>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------
const PIN_DOT_SIZE = 16;

const styles = StyleSheet.create({
  scroll: {
    padding: spacing.xl,
    paddingTop: spacing.xl * 2,
    paddingBottom: spacing.xl,
  },

  // Brand
  brand: { alignItems: 'center', marginBottom: spacing.xl },
  shield: { width: 84, height: 84, marginBottom: spacing.sm },
  // Wordmark stays in aspect ratio. The source image is ~4:1, so 220×56
  // keeps the "DigiLog360" letters crisp without scaling artifacts.
  wordmark: { width: 220, height: 56, marginBottom: spacing.xs },
  subtitle: { color: theme.textMuted, fontSize: 13, letterSpacing: 0.5 },

  // Org chip — small pill under the brand, shows the saved slug and lets
  // the user tap to change it. Deliberately understated; once set this is
  // background context, not a primary action.
  orgChip: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    alignSelf: 'center',
    paddingHorizontal: 12, paddingVertical: 6,
    borderRadius: radius.pill,
    backgroundColor: theme.surfaceAlt,
    borderWidth: StyleSheet.hairlineWidth, borderColor: theme.border,
    marginBottom: spacing.lg,
  },
  orgChipText: {
    color: theme.text, fontSize: 12, fontWeight: '700',
    textTransform: 'uppercase', letterSpacing: 0.5,
  },

  // First-launch setup card
  setupCard: {
    backgroundColor: theme.surface,
    borderRadius: radius.lg,
    borderWidth: 1, borderColor: theme.border,
    padding: spacing.lg,
    marginBottom: spacing.lg,
  },
  setupHeader: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  setupIcon: {
    width: 40, height: 40, borderRadius: 12,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: theme.brand + '22',
  },
  setupTitle: { ...type.h2 },
  setupHint: { ...type.muted, marginTop: 4, lineHeight: 20 },
  setupMono: {
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    color: theme.text, fontWeight: '700',
  },

  // PIN dots — solid fill on press, hollow otherwise. No text inside the
  // dots = nothing that can drift off-centre.
  pinHeading: { ...type.h2, textAlign: 'center', marginBottom: spacing.lg },
  pinRow: {
    flexDirection: 'row',
    gap: 18,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: spacing.xl,
    minHeight: PIN_DOT_SIZE + 4,
  },
  pinDot: {
    width: PIN_DOT_SIZE,
    height: PIN_DOT_SIZE,
    borderRadius: PIN_DOT_SIZE / 2,
    borderWidth: 1.5,
    borderColor: theme.border,
    backgroundColor: 'transparent',
  },
  pinDotFilled: { borderColor: theme.brand, backgroundColor: theme.brand },
  pinDotError: { borderColor: theme.danger, backgroundColor: theme.danger },

  // Error pill
  errorPill: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    alignSelf: 'center', paddingHorizontal: 12, paddingVertical: 6,
    backgroundColor: theme.danger, borderRadius: radius.pill,
    marginBottom: spacing.md,
  },
  errorText: { color: '#fff', fontSize: 12, fontWeight: '600' },

  // Keypad — fixed pixel sizes computed at render time, centered as a block.
  // Gap is set inline (matches the JS-side constant used for the size math).
  keypad: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    alignSelf: 'center',
    marginTop: spacing.sm,
  },
  // Width / height / borderRadius are injected inline from the computed
  // keySize so the layout doesn't depend on Yoga resolving percentages.
  key: {
    backgroundColor: theme.surfaceAlt,
    borderWidth: 1,
    borderColor: theme.border,
    overflow: 'hidden',
    position: 'relative',
  },
  // Muted variant for refresh / backspace — visually a tier back so digits
  // dominate the grid.
  keyMuted: {
    backgroundColor: theme.surface,
    borderColor: theme.borderSoft,
  },
  // Absolutely-stretched overlay = bulletproof centring. The digit/icon
  // becomes a flex child of this 1:1 box instead of an inline child next to
  // the TouchableOpacity's own layout flow, so Text font-padding and line-box
  // baselines stop interfering with vertical position.
  keyContent: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
  },
  keyDigit: {
    color: theme.text,
    fontSize: 32,
    fontWeight: '600',
    // includeFontPadding is Android-only — kills the invisible padding the
    // OS adds above/below glyphs. textAlign + textAlignVertical pin the
    // glyph to the centre of its own Text box; the overlay does the rest.
    includeFontPadding: false,
    textAlign: 'center',
    textAlignVertical: 'center',
  },

  // Sign In
  signInWrap: { marginTop: spacing.xl },

  footer: {
    color: theme.textFaint,
    fontSize: 11,
    textAlign: 'center',
    marginTop: spacing.xl,
  },
});
