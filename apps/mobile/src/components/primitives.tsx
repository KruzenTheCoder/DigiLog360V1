// Lightweight UI primitives layered on top of components/ui.tsx.
// Everything here is designed for the field — big touch targets, clear states,
// no fiddly animations that drain battery, dark-mode-first.

import { ReactNode, useEffect, useRef, useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, Animated, Easing, Modal, Pressable,
  ScrollView, ViewStyle, StyleProp, ActivityIndicator, TextStyle,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { theme, spacing, radius, type } from '@/lib/theme';

// ---------------------------------------------------------------------------
// Press — Pressable wrapper with consistent haptic feedback.
//
// On Android, Haptics.selectionAsync() is barely perceptible — it maps to the
// keyboard-tap HapticFeedbackConstant which most devices either ignore or
// pulse for ~5ms. We use impactAsync(Light/Medium) instead, which maps to a
// proper vibrate that survives across vendor quirks.
//
// Style guide:
//   light    — micro feedback (chevrons, secondary buttons, list expand)
//   medium   — primary interactions (cards, tiles, list rows). The default.
//   heavy    — decisive moments (submit, delete confirm)
//   success  — positive notification haptic
//   error    — error notification haptic
// ---------------------------------------------------------------------------
type HapticStyle = 'light' | 'medium' | 'heavy' | 'success' | 'error';

function triggerHaptic(style: HapticStyle) {
  // Fire-and-forget. expo-haptics throws on simulators or devices with
  // haptics disabled; we swallow so a missing haptic never bubbles up.
  try {
    if (style === 'success') {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    } else if (style === 'error') {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
    } else {
      const impact =
        style === 'heavy' ? Haptics.ImpactFeedbackStyle.Heavy :
        style === 'medium' ? Haptics.ImpactFeedbackStyle.Medium :
        Haptics.ImpactFeedbackStyle.Light;
      Haptics.impactAsync(impact).catch(() => {});
    }
  } catch { /* ignore — haptics are best-effort UX */ }
}

export function Press({
  onPress, disabled, style, hapticStyle = 'medium', children, hitSlop,
}: {
  onPress: () => void;
  disabled?: boolean;
  style?: StyleProp<ViewStyle> | ((state: { pressed: boolean }) => StyleProp<ViewStyle>);
  hapticStyle?: HapticStyle;
  children: ReactNode;
  hitSlop?: number | { top?: number; bottom?: number; left?: number; right?: number };
}) {
  return (
    <Pressable
      onPress={() => {
        triggerHaptic(hapticStyle);
        onPress();
      }}
      disabled={disabled}
      hitSlop={hitSlop}
      android_ripple={{ color: theme.surfaceHi, foreground: false }}
      style={style as never}
    >
      {children}
    </Pressable>
  );
}

// Public helper so non-Press callsites (form submit, etc) can fire haptics too.
export function haptic(style: HapticStyle = 'medium') {
  triggerHaptic(style);
}

// ---------------------------------------------------------------------------
// ScreenHeader — top bar used across detail/sub-screens. Back button on the
// left, title in the middle, optional right slot. Respects safe-area top inset
// so it doesn't sit under the status bar.
// ---------------------------------------------------------------------------
export function ScreenHeader({
  title, subtitle, onBack, right, large, variant = 'back',
}: {
  title: string;
  subtitle?: string;
  /** If omitted, defaults to router.back(). */
  onBack?: () => void;
  right?: ReactNode;
  /** Larger leading-line title — used for top-level tab screens. */
  large?: boolean;
  /** `back` (default) shows a chevron-back; `close` shows an X (for modals). */
  variant?: 'back' | 'close';
}) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const handleBack = onBack ?? (() => router.back());
  return (
    <View style={[s.header, { paddingTop: insets.top + (large ? spacing.lg : spacing.sm) }]}>
      {!large && (
        <Press onPress={handleBack} style={s.headerBack} hitSlop={10} hapticStyle="light">
          <Ionicons
            name={variant === 'close' ? 'close' : 'chevron-back'}
            size={variant === 'close' ? 28 : 26}
            color={theme.text}
          />
        </Press>
      )}
      <View style={{ flex: 1, marginLeft: large ? 0 : 4 }}>
        <Text
          style={large ? s.headerTitleLarge : s.headerTitle}
          numberOfLines={1}
          allowFontScaling={false}
        >
          {title}
        </Text>
        {subtitle && (
          <Text style={s.headerSubtitle} numberOfLines={1} allowFontScaling={false}>
            {subtitle}
          </Text>
        )}
      </View>
      {right && <View style={s.headerRight}>{right}</View>}
    </View>
  );
}

// ---------------------------------------------------------------------------
// Stat — single metric tile. Big number + label + optional trend/icon.
// ---------------------------------------------------------------------------
export function Stat({
  value, label, icon, tint, loading,
}: {
  value: ReactNode;
  label: string;
  icon?: keyof typeof Ionicons.glyphMap;
  tint?: string;
  loading?: boolean;
}) {
  const color = tint ?? theme.brand;
  return (
    <View style={s.stat}>
      {icon && (
        <View style={[s.statIcon, { backgroundColor: color + '22' }]}>
          <Ionicons name={icon} size={16} color={color} />
        </View>
      )}
      {loading ? (
        <Skeleton width={48} height={28} style={{ marginVertical: 2 }} />
      ) : (
        <Text style={[s.statValue, { color }]} allowFontScaling={false}>{value}</Text>
      )}
      <Text style={s.statLabel} allowFontScaling={false}>{label}</Text>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Card — uniform content surface. Optional title + right slot. Use everywhere
// we want a contained area on top of the screen background.
// ---------------------------------------------------------------------------
export function Card({
  children, title, right, style, padded = true,
}: {
  children: ReactNode;
  title?: string;
  right?: ReactNode;
  style?: StyleProp<ViewStyle>;
  padded?: boolean;
}) {
  return (
    <View style={[s.card, !padded && { padding: 0 }, style]}>
      {(title || right) && (
        <View style={s.cardHeader}>
          {title && <Text style={s.cardTitle} allowFontScaling={false}>{title}</Text>}
          {right}
        </View>
      )}
      {children}
    </View>
  );
}

// ---------------------------------------------------------------------------
// Divider — horizontal hairline between content groups.
// ---------------------------------------------------------------------------
export function Divider({ style }: { style?: StyleProp<ViewStyle> }) {
  return <View style={[s.divider, style]} />;
}

// ---------------------------------------------------------------------------
// SectionTitle — small uppercase label that introduces a content group
// ---------------------------------------------------------------------------
export function SectionTitle({ children, right }: { children: ReactNode; right?: ReactNode }) {
  return (
    <View style={s.sectionTitle}>
      <Text style={type.caption}>{children}</Text>
      {right}
    </View>
  );
}

// ---------------------------------------------------------------------------
// IconTile — square action tile (used on home + gate screens)
// ---------------------------------------------------------------------------
export function IconTile({
  icon, label, onPress, badge, tint,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress: () => void;
  badge?: number | string;
  tint?: string;
}) {
  const color = tint ?? theme.brand;
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [s.tile, pressed && s.tilePressed]}
      android_ripple={{ color: theme.surfaceHi, foreground: true }}
    >
      <View style={[s.tileIcon, { backgroundColor: color + '22' }]}>
        <Ionicons name={icon} size={24} color={color} />
        {badge !== undefined && badge !== 0 && (
          <View style={s.tileBadge}>
            <Text style={s.tileBadgeText}>{String(badge)}</Text>
          </View>
        )}
      </View>
      <Text style={s.tileLabel} numberOfLines={2}>{label}</Text>
    </Pressable>
  );
}

// ---------------------------------------------------------------------------
// ListRow — uniform interactive row (used in gate / settings / lists)
// ---------------------------------------------------------------------------
export function ListRow({
  icon, title, subtitle, right, onPress, tint, danger,
}: {
  icon?: keyof typeof Ionicons.glyphMap;
  title: string;
  subtitle?: string;
  right?: ReactNode;
  onPress?: () => void;
  tint?: string;
  danger?: boolean;
}) {
  const inner = (
    <View style={s.row}>
      {icon && (
        <View style={[s.rowIcon, { backgroundColor: (danger ? theme.danger : tint ?? theme.brand) + '22' }]}>
          <Ionicons name={icon} size={20} color={danger ? theme.danger : tint ?? theme.brand} />
        </View>
      )}
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={[s.rowTitle, danger && { color: theme.danger }]} numberOfLines={1}>{title}</Text>
        {subtitle && <Text style={s.rowSubtitle} numberOfLines={1}>{subtitle}</Text>}
      </View>
      {right ?? (onPress ? <Ionicons name="chevron-forward" size={20} color={theme.textMuted} /> : null)}
    </View>
  );
  if (!onPress) return <View style={s.rowWrap}>{inner}</View>;
  return (
    <Pressable onPress={onPress}
      style={({ pressed }) => [s.rowWrap, pressed && { backgroundColor: theme.surfaceAlt }]}
      android_ripple={{ color: theme.surfaceHi }}
    >
      {inner}
    </Pressable>
  );
}

// ---------------------------------------------------------------------------
// EmptyState — friendly empty / "all caught up" surface
// ---------------------------------------------------------------------------
export function EmptyState({
  icon = 'cafe-outline', title, hint, action,
}: {
  icon?: keyof typeof Ionicons.glyphMap;
  title: string;
  hint?: string;
  action?: { label: string; onPress: () => void };
}) {
  return (
    <View style={s.empty}>
      <Ionicons name={icon} size={56} color={theme.textFaint} />
      <Text style={s.emptyTitle}>{title}</Text>
      {hint && <Text style={s.emptyHint}>{hint}</Text>}
      {action && (
        <TouchableOpacity onPress={action.onPress} style={s.emptyAction} activeOpacity={0.8}>
          <Text style={s.emptyActionText}>{action.label}</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

// ---------------------------------------------------------------------------
// Skeleton — shimmer placeholder; respects reduced-motion via fallback opacity
// ---------------------------------------------------------------------------
export function Skeleton({ width, height = 16, style }: { width?: number | string; height?: number; style?: StyleProp<ViewStyle> }) {
  const opacity = useRef(new Animated.Value(0.4)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, { toValue: 0.9, duration: 700, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 0.4, duration: 700, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [opacity]);
  return (
    <Animated.View
      style={[
        { width: width as number, height, backgroundColor: theme.surfaceAlt, borderRadius: radius.sm, opacity },
        style,
      ]}
    />
  );
}

export function SkeletonRow() {
  return (
    <View style={[s.rowWrap, { paddingVertical: spacing.md }]}>
      <Skeleton width={36} height={36} style={{ borderRadius: 12, marginRight: 12 }} />
      <View style={{ flex: 1 }}>
        <Skeleton width="60%" height={14} />
        <View style={{ height: 6 }} />
        <Skeleton width="40%" height={11} />
      </View>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Sheet — slide-up bottom sheet
// ---------------------------------------------------------------------------
export function Sheet({
  visible, onClose, title, children,
}: {
  visible: boolean;
  onClose: () => void;
  title?: string;
  children: ReactNode;
}) {
  const slide = useRef(new Animated.Value(visible ? 0 : 400)).current;
  useEffect(() => {
    Animated.timing(slide, {
      toValue: visible ? 0 : 400,
      duration: 220,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [visible, slide]);

  return (
    <Modal transparent visible={visible} animationType="fade" onRequestClose={onClose}>
      <Pressable style={s.sheetBackdrop} onPress={onClose} />
      <Animated.View style={[s.sheet, { transform: [{ translateY: slide }] }]}>
        <View style={s.sheetGrabber} />
        {title && <Text style={s.sheetTitle}>{title}</Text>}
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: spacing.xl }}>
          {children}
        </ScrollView>
      </Animated.View>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// Toast — lightweight in-context message
// ---------------------------------------------------------------------------
interface ToastState { message: string; kind: 'ok' | 'error' | 'info' }

export function useToast() {
  const [toast, setToast] = useState<ToastState | null>(null);
  function show(message: string, kind: ToastState['kind'] = 'info') {
    setToast({ message, kind });
    setTimeout(() => setToast(null), 3200);
  }
  function ToastView() {
    if (!toast) return null;
    const bg =
      toast.kind === 'ok' ? theme.success
      : toast.kind === 'error' ? theme.danger
      : theme.brand;
    return (
      <View pointerEvents="none" style={s.toastWrap}>
        <View style={[s.toast, { backgroundColor: bg }]}>
          <Ionicons
            name={toast.kind === 'ok' ? 'checkmark-circle' : toast.kind === 'error' ? 'alert-circle' : 'information-circle'}
            size={18} color="#fff"
          />
          <Text style={s.toastText}>{toast.message}</Text>
        </View>
      </View>
    );
  }
  return { show, ToastView };
}

// ---------------------------------------------------------------------------
// Loading dot — small inline spinner with consistent colour
// ---------------------------------------------------------------------------
export function Loading({ size = 'small', tint }: { size?: 'small' | 'large'; tint?: string }) {
  return <ActivityIndicator size={size} color={tint ?? theme.brand} />;
}

// ---------------------------------------------------------------------------
const s = StyleSheet.create({
  sectionTitle: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    marginTop: spacing.lg, marginBottom: spacing.sm,
  },

  tile: {
    width: '47%', backgroundColor: theme.surface,
    borderRadius: radius.lg, padding: spacing.lg, alignItems: 'center',
    borderWidth: 1, borderColor: theme.border,
    marginBottom: spacing.md,
  },
  tilePressed: { backgroundColor: theme.surfaceAlt, transform: [{ scale: 0.98 }] },
  tileIcon: {
    width: 48, height: 48, borderRadius: 14,
    alignItems: 'center', justifyContent: 'center', marginBottom: 10,
    position: 'relative',
  },
  tileBadge: {
    position: 'absolute', top: -6, right: -6,
    minWidth: 20, height: 20, paddingHorizontal: 5, borderRadius: 10,
    backgroundColor: theme.danger, alignItems: 'center', justifyContent: 'center',
    borderWidth: 2, borderColor: theme.surface,
  },
  tileBadgeText: { color: '#fff', fontSize: 10, fontWeight: '800' },
  tileLabel: { color: theme.text, fontWeight: '600', fontSize: 14, textAlign: 'center' },

  rowWrap: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: theme.surface,
    paddingHorizontal: spacing.lg, paddingVertical: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: theme.borderSoft,
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1 },
  rowIcon: {
    width: 36, height: 36, borderRadius: 10,
    alignItems: 'center', justifyContent: 'center',
  },
  rowTitle: { color: theme.text, fontSize: 15, fontWeight: '600' },
  rowSubtitle: { color: theme.textMuted, fontSize: 12, marginTop: 2 },

  empty: { alignItems: 'center', padding: spacing.xl, gap: 8 },
  emptyTitle: { ...type.h3, marginTop: spacing.sm, textAlign: 'center' },
  emptyHint: { ...type.muted, textAlign: 'center', marginTop: 2 },
  emptyAction: {
    marginTop: spacing.md, backgroundColor: theme.brand,
    paddingHorizontal: spacing.lg, paddingVertical: 10, borderRadius: radius.md,
  },
  emptyActionText: { color: '#fff', fontWeight: '700' },

  sheetBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.55)',
  },
  sheet: {
    position: 'absolute', left: 0, right: 0, bottom: 0,
    backgroundColor: theme.surface,
    borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl,
    paddingHorizontal: spacing.lg, paddingTop: spacing.sm,
    paddingBottom: spacing.xl,
    maxHeight: '85%',
  },
  sheetGrabber: {
    alignSelf: 'center', width: 40, height: 4,
    backgroundColor: theme.borderSoft, borderRadius: 2,
    marginBottom: spacing.md,
  },
  sheetTitle: { ...type.h2, marginBottom: spacing.md },

  toastWrap: {
    position: 'absolute', bottom: 24, left: 16, right: 16,
    alignItems: 'center',
  },
  toast: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingHorizontal: 14, paddingVertical: 10,
    borderRadius: radius.pill,
    ...theme.shadow,
  },
  toastText: { color: '#fff', fontWeight: '600' },

  header: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: spacing.lg, paddingBottom: spacing.md,
    backgroundColor: theme.bg,
  },
  headerBack: {
    width: 40, height: 40, borderRadius: 20,
    alignItems: 'center', justifyContent: 'center',
    marginLeft: -8,
  },
  headerTitle: { ...type.h2, color: theme.text },
  headerTitleLarge: { ...type.display, color: theme.text, letterSpacing: -0.6 },
  headerSubtitle: { ...type.muted, marginTop: 2 },
  headerRight: { marginLeft: 12 },

  stat: {
    flex: 1, backgroundColor: theme.surface,
    borderRadius: radius.lg, padding: spacing.md,
    borderWidth: 1, borderColor: theme.borderSoft,
  },
  statIcon: {
    width: 28, height: 28, borderRadius: 8,
    alignItems: 'center', justifyContent: 'center', marginBottom: 8,
  },
  statValue: { fontSize: 24, fontWeight: '800', letterSpacing: -0.5 },
  statLabel: { ...type.muted, fontSize: 11, marginTop: 2, textTransform: 'uppercase' as TextStyle['textTransform'], letterSpacing: 0.5, fontWeight: '700' },

  card: {
    backgroundColor: theme.surface,
    borderRadius: radius.lg, padding: spacing.lg,
    borderWidth: 1, borderColor: theme.borderSoft,
    marginBottom: spacing.md,
  },
  cardHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    marginBottom: spacing.md,
  },
  cardTitle: { ...type.h3 },

  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: theme.border,
    marginVertical: spacing.md,
  },
});
