import { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, Platform } from 'react-native';
import { useRouter } from 'expo-router';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as Location from 'expo-location';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import { getActivePatrol, recordScan, haversineMeters } from '@/lib/patrol';
import { Button } from '@/components/ui';
import { theme, spacing, radius } from '@/lib/theme';
import { decodeCheckpointQr, type Patrol, type Checkpoint } from '@digilog/shared';

type Mode = 'qr' | 'nfc' | 'gps';
type Result = { ok: boolean; message: string } | null;

export default function Scan() {
  const router = useRouter();
  const { profile } = useAuth();
  const [permission, requestPermission] = useCameraPermissions();
  const [mode, setMode] = useState<Mode>('qr');
  const [patrol, setPatrol] = useState<Patrol | null>(null);
  const [checkpoints, setCheckpoints] = useState<Checkpoint[]>([]);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<Result>(null);
  const lock = useRef(false);

  useEffect(() => {
    (async () => {
      if (!profile) return;
      const active = await getActivePatrol(profile.id);
      setPatrol(active);
      if (profile.site_id) {
        const { data } = await supabase.from('checkpoints').select('*')
          .eq('site_id', profile.site_id).eq('is_active', true);
        setCheckpoints((data ?? []) as Checkpoint[]);
      }
    })();
  }, [profile]);

  async function commit(checkpoint: Checkpoint, method: Mode, extra: Partial<Parameters<typeof recordScan>[0]> = {}) {
    if (!patrol || !profile) return;
    setBusy(true);
    try {
      await recordScan({ patrolId: patrol.id, checkpoint, guardId: profile.id, method, ...extra });
      setResult({ ok: true, message: `${checkpoint.name} scanned via ${method.toUpperCase()}` });
    } catch (e: any) {
      setResult({ ok: false, message: e.message ?? 'Could not record scan' });
    } finally {
      setBusy(false);
    }
  }

  function onQr({ data }: { data: string }) {
    if (lock.current || busy || result) return;
    lock.current = true;
    const token = decodeCheckpointQr(data);
    const cp = token ? checkpoints.find((c) => c.qr_token === token) : null;
    if (!cp) {
      setResult({ ok: false, message: 'Unrecognised checkpoint QR code.' });
    } else {
      commit(cp, 'qr');
    }
  }

  async function onGps() {
    setBusy(true);
    try {
      const perm = await Location.requestForegroundPermissionsAsync();
      if (!perm.granted) { setResult({ ok: false, message: 'Location permission denied.' }); return; }
      const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
      const withGps = checkpoints.filter((c) => c.latitude != null && c.longitude != null);
      let nearest: { cp: Checkpoint; dist: number } | null = null;
      for (const c of withGps) {
        const d = haversineMeters(pos.coords.latitude, pos.coords.longitude, c.latitude!, c.longitude!);
        if (!nearest || d < nearest.dist) nearest = { cp: c, dist: d };
      }
      if (!nearest) { setResult({ ok: false, message: 'No GPS-enabled checkpoints at your site.' }); return; }
      const within = nearest.dist <= nearest.cp.geofence_radius_m;
      await commit(nearest.cp, 'gps', {
        latitude: pos.coords.latitude, longitude: pos.coords.longitude,
        accuracy: pos.coords.accuracy, distance: Math.round(nearest.dist), verified: within,
      });
      if (!within) {
        setResult({ ok: true, message: `Logged near ${nearest.cp.name} (${Math.round(nearest.dist)}m — outside ${nearest.cp.geofence_radius_m}m radius)` });
      }
    } catch (e: any) {
      setResult({ ok: false, message: e.message ?? 'GPS scan failed.' });
    } finally {
      setBusy(false);
    }
  }

  async function onNfc() {
    setBusy(true);
    try {
      const NfcManager = (await import('react-native-nfc-manager')).default;
      const { NfcTech } = await import('react-native-nfc-manager');
      const supported = await NfcManager.isSupported();
      if (!supported) { setResult({ ok: false, message: 'NFC is not supported on this device, or you are using Expo Go (needs a dev build).' }); return; }
      await NfcManager.start();
      await NfcManager.requestTechnology(NfcTech.Ndef);
      const tag = await NfcManager.getTag();
      const tagId = (tag?.id ?? '').toString();
      const cp = checkpoints.find((c) => c.nfc_tag_id && c.nfc_tag_id.replace(/:/g, '').toLowerCase() === tagId.replace(/:/g, '').toLowerCase());
      if (!cp) setResult({ ok: false, message: `No checkpoint matches NFC tag ${tagId || '(unknown)'}.` });
      else await commit(cp, 'nfc');
    } catch (e: any) {
      setResult({ ok: false, message: 'NFC read cancelled or failed.' });
    } finally {
      try { (await import('react-native-nfc-manager')).default.cancelTechnologyRequest(); } catch {}
      setBusy(false);
    }
  }

  function reset() { setResult(null); lock.current = false; }

  if (!patrol) {
    return (
      <View style={styles.center}>
        <Ionicons name="walk-outline" size={48} color={theme.textMuted} />
        <Text style={styles.info}>Start a patrol before scanning checkpoints.</Text>
        <Button title="Back" variant="secondary" onPress={() => router.back()} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}><Ionicons name="close" size={28} color={theme.text} /></TouchableOpacity>
        <Text style={styles.title}>Scan Checkpoint</Text>
        <View style={{ width: 28 }} />
      </View>

      <View style={styles.modes}>
        {(['qr', 'nfc', 'gps'] as Mode[]).map((m) => (
          <TouchableOpacity key={m} onPress={() => { setMode(m); reset(); }}
            style={[styles.modeBtn, mode === m && styles.modeActive]}>
            <Ionicons name={m === 'qr' ? 'qr-code' : m === 'nfc' ? 'radio' : 'location'} size={18}
              color={mode === m ? '#fff' : theme.textMuted} />
            <Text style={[styles.modeText, mode === m && { color: '#fff' }]}>{m.toUpperCase()}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <View style={styles.stage}>
        {result ? (
          <View style={styles.center}>
            <Ionicons name={result.ok ? 'checkmark-circle' : 'alert-circle'} size={72}
              color={result.ok ? theme.success : theme.danger} />
            <Text style={styles.resultText}>{result.message}</Text>
            <View style={{ flexDirection: 'row', gap: 12, marginTop: spacing.lg }}>
              <Button title="Scan Another" onPress={reset} />
              <Button title="Done" variant="secondary" onPress={() => router.back()} />
            </View>
          </View>
        ) : mode === 'qr' ? (
          !permission?.granted ? (
            <View style={styles.center}>
              <Text style={styles.info}>Camera access is required to scan QR codes.</Text>
              <Button title="Grant Camera Access" onPress={requestPermission} />
            </View>
          ) : (
            <View style={styles.cameraWrap}>
              <CameraView style={StyleSheet.absoluteFill} facing="back"
                barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
                onBarcodeScanned={onQr} />
              <View style={styles.reticle} />
              <Text style={styles.hint}>Point the camera at a checkpoint QR label</Text>
            </View>
          )
        ) : (
          <View style={styles.center}>
            <Ionicons name={mode === 'nfc' ? 'radio-outline' : 'location-outline'} size={64} color={theme.brand} />
            <Text style={styles.info}>
              {mode === 'nfc'
                ? 'Tap your phone on the checkpoint NFC tag.'
                : 'Confirm your presence using GPS at the nearest checkpoint.'}
            </Text>
            {busy ? <ActivityIndicator color={theme.brand} size="large" />
              : <Button title={mode === 'nfc' ? 'Read NFC Tag' : 'Check My Location'}
                  onPress={mode === 'nfc' ? onNfc : onGps} />}
          </View>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.bg, paddingTop: spacing.xl * 2 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: spacing.lg, marginBottom: spacing.lg },
  title: { color: theme.text, fontSize: 18, fontWeight: '700' },
  modes: { flexDirection: 'row', gap: 8, paddingHorizontal: spacing.lg, marginBottom: spacing.lg },
  modeBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 12, borderRadius: radius.md, backgroundColor: theme.surface, borderWidth: 1, borderColor: theme.border },
  modeActive: { backgroundColor: theme.brand, borderColor: theme.brand },
  modeText: { color: theme.textMuted, fontWeight: '700', fontSize: 13 },
  stage: { flex: 1, marginHorizontal: spacing.lg, marginBottom: spacing.xl, borderRadius: radius.lg, overflow: 'hidden' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.md, padding: spacing.lg },
  cameraWrap: { flex: 1, backgroundColor: '#000', justifyContent: 'center', alignItems: 'center' },
  reticle: { width: 220, height: 220, borderWidth: 3, borderColor: theme.brand, borderRadius: radius.lg, backgroundColor: 'transparent' },
  hint: { position: 'absolute', bottom: 24, color: '#fff', fontSize: 14, textAlign: 'center', paddingHorizontal: 20 },
  info: { color: theme.text, fontSize: 15, textAlign: 'center', lineHeight: 22 },
  resultText: { color: theme.text, fontSize: 16, textAlign: 'center', fontWeight: '600', marginTop: spacing.md },
});
