// Settings — profile summary, PIN change, sign out.
// PIN-only login means the screen lives or dies on the PIN UX; we make it
// hard to mistype and impossible to forget the current-PIN requirement.

import { useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, Alert,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import { Button, Card, Field, Badge } from '@/components/ui';
import { useToast, SectionTitle, ListRow, ScreenHeader, Press } from '@/components/primitives';
import { theme, spacing, radius, type } from '@/lib/theme';
import { ROLE_LABELS, isValidPinFormat, profileRoles } from '@digilog/shared';

export default function Settings() {
  const router = useRouter();
  const toast = useToast();
  const { profile, signOut } = useAuth();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [showPins, setShowPins] = useState(false);

  const pinsMatch = next.length > 0 && next === confirm;
  const pinsValid = isValidPinFormat(next) && pinsMatch && (!profile?.pin_hash || current.length >= 4);

  async function changePin() {
    if (!isValidPinFormat(next)) {
      toast.show('PIN must be 4 digits', 'error');
      return;
    }
    if (next !== confirm) {
      toast.show('PINs do not match', 'error');
      return;
    }
    setBusy(true);
    const body: Record<string, unknown> = { pin: next };
    if (profile?.pin_hash) body.current_pin = current;
    const { error } = await supabase.functions.invoke('pin-set', { body });
    setBusy(false);
    if (error) {
      toast.show(error.message, 'error');
      return;
    }
    setCurrent(''); setNext(''); setConfirm('');
    toast.show('PIN updated — use it on next sign-in', 'ok');
  }

  function confirmSignOut() {
    Alert.alert('Sign out', 'You\'ll need to enter your PIN to sign back in.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Sign out', style: 'destructive', onPress: signOut },
    ]);
  }

  if (!profile) return <View style={{ flex: 1, backgroundColor: theme.bg }} />;
  const roles = profileRoles(profile);

  return (
    <View style={{ flex: 1, backgroundColor: theme.bg }}>
      <ScreenHeader title="Settings" />

      <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingTop: 0, paddingBottom: 60 }}>
        {/* ----- Profile ----- */}
        <Card>
          <View style={styles.profileRow}>
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>
                {(profile.full_name ?? profile.email ?? 'G')[0].toUpperCase()}
              </Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={type.h3}>{profile.full_name ?? profile.email ?? 'Guard'}</Text>
              <Text style={type.muted}>{profile.email}</Text>
            </View>
          </View>

          <View style={styles.rolesRow}>
            {roles.map((r, idx) => (
              <Badge key={r} label={ROLE_LABELS[r]} color={idx === 0 ? theme.brand : theme.brandPurple} />
            ))}
          </View>

          <View style={{ height: spacing.sm }} />
          <Row label="Employee #" value={profile.employee_number ?? '—'} mono />
          <Row label="PIN status" value={profile.pin_hash ? 'Set' : 'Not set'}
            valueColor={profile.pin_hash ? theme.success : theme.warning} />
        </Card>

        {/* ----- Change PIN ----- */}
        <SectionTitle>Change PIN</SectionTitle>
        <Card>
          <Text style={[type.muted, { marginBottom: spacing.md }]}>
            {profile.pin_hash
              ? 'Enter your current PIN, then choose a new one.'
              : 'Set a PIN so you can sign in on this device.'}
          </Text>

          {profile.pin_hash && (
            <Field
              label="Current PIN"
              value={current}
              onChangeText={(t) => setCurrent(t.replace(/\D/g, ''))}
              keyboardType="number-pad"
              secureTextEntry={!showPins}
              maxLength={4}
              placeholder="••••"
            />
          )}
          <Field
            label="New PIN"
            value={next}
            onChangeText={(t) => setNext(t.replace(/\D/g, ''))}
            keyboardType="number-pad"
            secureTextEntry={!showPins}
            maxLength={4}
            placeholder="4 digits"
          />
          <Field
            label="Confirm new PIN"
            value={confirm}
            onChangeText={(t) => setConfirm(t.replace(/\D/g, ''))}
            keyboardType="number-pad"
            secureTextEntry={!showPins}
            maxLength={4}
            placeholder="Re-enter"
            // Live mismatch feedback
            style={confirm.length > 0 && !pinsMatch ? { borderColor: theme.danger } : undefined}
          />

          {confirm.length > 0 && !pinsMatch && (
            <Text style={styles.errorText}>PINs do not match</Text>
          )}

          <Press onPress={() => setShowPins((v) => !v)} style={styles.showToggle} hapticStyle="light">
            <Ionicons name={showPins ? 'eye-off-outline' : 'eye-outline'} size={16} color={theme.brand} />
            <Text style={styles.showToggleText}>{showPins ? 'Hide PINs' : 'Show PINs'}</Text>
          </Press>

          <View style={{ height: spacing.sm }} />
          <Button
            title={profile.pin_hash ? 'Update PIN' : 'Set PIN'}
            onPress={changePin}
            loading={busy}
            disabled={!pinsValid}
            icon={<Ionicons name="key" size={18} color="#fff" />}
          />
        </Card>

        {/* ----- Other actions ----- */}
        <SectionTitle>App</SectionTitle>
        <View style={styles.listGroup}>
          <ListRow icon="notifications-outline" title="Notifications" subtitle="View your inbox" onPress={() => router.push('/inbox')} />
          <ListRow icon="document-text-outline" title="Shift handovers" onPress={() => router.push('/handovers')} />
        </View>

        <View style={{ height: spacing.lg }} />
        <Button title="Sign Out" variant="danger" onPress={confirmSignOut}
          icon={<Ionicons name="log-out" size={18} color="#fff" />} />
      </ScrollView>

      <toast.ToastView />
    </View>
  );
}

function Row({ label, value, mono, valueColor }: {
  label: string; value: string; mono?: boolean; valueColor?: string;
}) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text
        style={[
          styles.rowValue,
          mono && { fontFamily: 'monospace' as const },
          valueColor && { color: valueColor },
        ]}
      >
        {value}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  profileRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: spacing.md },
  avatar: {
    width: 48, height: 48, borderRadius: 24,
    backgroundColor: theme.brand,
    alignItems: 'center', justifyContent: 'center',
  },
  avatarText: { color: '#fff', fontSize: 20, fontWeight: '800' },

  rolesRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },

  row: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 6 },
  rowLabel: { color: theme.textMuted, fontSize: 13 },
  rowValue: { color: theme.text, fontSize: 13, fontWeight: '600', flexShrink: 1, textAlign: 'right' },

  showToggle: { flexDirection: 'row', alignItems: 'center', gap: 4, alignSelf: 'flex-start', paddingVertical: 6 },
  showToggleText: { color: theme.brand, fontSize: 12, fontWeight: '700' },

  errorText: { color: theme.danger, fontSize: 12, marginTop: -spacing.sm, marginBottom: spacing.sm },

  listGroup: {
    backgroundColor: theme.surface, borderRadius: radius.lg,
    borderWidth: 1, borderColor: theme.border, overflow: 'hidden',
  },
});
