import { useState } from 'react';
import { View, Text, StyleSheet, KeyboardAvoidingView, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '@/lib/auth';
import { Button, Field } from '@/components/ui';
import { theme, spacing } from '@/lib/theme';
import { BRAND } from '@digilog/shared';

export default function Login() {
  const { signIn } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setLoading(true); setError(null);
    const { error: err } = await signIn(email.trim(), password);
    setLoading(false);
    if (err) setError(err);
  }

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={styles.brand}>
        <View style={styles.logo}><Ionicons name="shield-checkmark" size={42} color="#fff" /></View>
        <Text style={styles.title}>{BRAND.name}</Text>
        <Text style={styles.subtitle}>Field Security App</Text>
      </View>

      <View style={styles.form}>
        <Field label="Email" value={email} onChangeText={setEmail} autoCapitalize="none"
          keyboardType="email-address" placeholder="you@company.com" />
        <Field label="Password" value={password} onChangeText={setPassword}
          secureTextEntry placeholder="••••••••" />
        {error && <Text style={styles.error}>{error}</Text>}
        <View style={{ marginTop: spacing.sm }}>
          <Button title="Sign In" onPress={submit} loading={loading} />
        </View>
      </View>

      <Text style={styles.footer}>© {new Date().getFullYear()} {BRAND.company}</Text>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.bg, justifyContent: 'center', padding: spacing.xl },
  brand: { alignItems: 'center', marginBottom: spacing.xl * 1.5 },
  logo: { width: 84, height: 84, borderRadius: 24, backgroundColor: theme.brand, alignItems: 'center', justifyContent: 'center', marginBottom: spacing.md },
  title: { color: theme.text, fontSize: 28, fontWeight: '800' },
  subtitle: { color: theme.textMuted, fontSize: 15, marginTop: 4 },
  form: { width: '100%' },
  error: { color: theme.danger, fontSize: 14, marginBottom: spacing.sm },
  footer: { color: theme.textMuted, fontSize: 12, textAlign: 'center', marginTop: spacing.xl },
});
