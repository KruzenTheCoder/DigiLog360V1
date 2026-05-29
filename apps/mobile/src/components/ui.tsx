import { ReactNode } from 'react';
import {
  Text, TextInput, TouchableOpacity, View, ActivityIndicator,
  StyleSheet, TextInputProps, ViewStyle, StyleProp,
} from 'react-native';
import { theme, radius, spacing } from '@/lib/theme';

export function Screen({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  return <View style={[styles.screen, style]}>{children}</View>;
}

export function Card({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  return <View style={[styles.card, style]}>{children}</View>;
}

export function Button({
  title, onPress, loading, disabled, variant = 'primary', icon,
}: {
  title: string; onPress: () => void; loading?: boolean; disabled?: boolean;
  variant?: 'primary' | 'secondary' | 'danger' | 'success'; icon?: ReactNode;
}) {
  const bg = {
    primary: theme.brand, secondary: theme.surfaceAlt, danger: theme.danger, success: theme.success,
  }[variant];
  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={disabled || loading}
      activeOpacity={0.8}
      style={[styles.btn, { backgroundColor: bg, opacity: disabled ? 0.5 : 1 }]}
    >
      {loading ? <ActivityIndicator color="#fff" /> : (
        <View style={styles.btnRow}>
          {icon}
          <Text style={styles.btnText}>{title}</Text>
        </View>
      )}
    </TouchableOpacity>
  );
}

export function Field({ label, ...props }: { label: string } & TextInputProps) {
  return (
    <View style={{ marginBottom: spacing.md }}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        placeholderTextColor={theme.textMuted}
        style={styles.input}
        {...props}
      />
    </View>
  );
}

export function Badge({ label, color }: { label: string; color: string }) {
  return (
    <View style={[styles.badge, { backgroundColor: color + '26' }]}>
      <Text style={[styles.badgeText, { color }]}>{label}</Text>
    </View>
  );
}

export function H1({ children }: { children: ReactNode }) {
  return <Text style={styles.h1}>{children}</Text>;
}
export function Muted({ children }: { children: ReactNode }) {
  return <Text style={styles.muted}>{children}</Text>;
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: theme.bg, padding: spacing.lg },
  card: { backgroundColor: theme.surface, borderRadius: radius.lg, padding: spacing.lg, borderWidth: 1, borderColor: theme.border, marginBottom: spacing.md },
  btn: { borderRadius: radius.md, paddingVertical: 14, alignItems: 'center', justifyContent: 'center' },
  btnRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  btnText: { color: '#fff', fontWeight: '700', fontSize: 15 },
  label: { color: theme.textMuted, fontSize: 13, marginBottom: 6, fontWeight: '600' },
  input: { backgroundColor: theme.surfaceAlt, borderRadius: radius.md, paddingHorizontal: 14, paddingVertical: 12, color: theme.text, fontSize: 15, borderWidth: 1, borderColor: theme.border },
  badge: { paddingHorizontal: 10, paddingVertical: 3, borderRadius: 999, alignSelf: 'flex-start' },
  badgeText: { fontSize: 12, fontWeight: '700' },
  h1: { color: theme.text, fontSize: 24, fontWeight: '800' },
  muted: { color: theme.textMuted, fontSize: 14 },
});
