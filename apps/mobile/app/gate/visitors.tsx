// Visitor log — fast sign-in/out for gate guards.
// Live list of on-site visitors, swipe-style "Sign out" button, fast add form
// with PDF417 scan support for SA vehicle licence disks and driver's licences.

import { useCallback, useRef, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, RefreshControl, Alert,
} from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { CameraView, useCameraPermissions, scanFromURLAsync } from 'expo-camera';
import { useAuth } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import { profileSiteIds } from '@digilog/shared';
import { Button, Field, Badge } from '@/components/ui';
import { Sheet, EmptyState, SkeletonRow, useToast, ListRow } from '@/components/primitives';
import { theme, spacing, radius, type } from '@/lib/theme';
import { detectAndParse, type ScanResult } from '@/lib/parse-barcodes';

interface Visitor {
  id: string;
  full_name: string;
  id_number: string | null;
  company: string | null;
  vehicle_reg: string | null;
  visiting: string | null;
  reason: string | null;
  signed_in_at: string;
  signed_out_at: string | null;
}

export default function VisitorsScreen() {
  const router = useRouter();
  const { profile } = useAuth();
  const toast = useToast();
  const [items, setItems] = useState<Visitor[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [addOpen, setAddOpen] = useState(false);

  const load = useCallback(async () => {
    const mySites = profileSiteIds(profile);
    if (mySites.length === 0) {
      setItems([]); setLoading(false);
      return;
    }
    setLoading(true);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data } = await (supabase as any).from('visitors').select('*')
      .in('site_id', mySites)
      .order('signed_in_at', { ascending: false })
      .limit(50);
    setItems((data ?? []) as Visitor[]);
    setLoading(false);
  }, [profile]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  async function signOut(v: Visitor) {
    Alert.alert('Sign out', `Sign ${v.full_name} out?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Sign out', style: 'default', onPress: async () => {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const { error } = await (supabase as any).from('visitors').update({
            signed_out_at: new Date().toISOString(),
            signed_out_by: profile?.id,
          }).eq('id', v.id);
          if (error) toast.show(error.message, 'error');
          else { toast.show(`${v.full_name} signed out`, 'ok'); load(); }
        },
      },
    ]);
  }

  const onsite = items.filter((v) => !v.signed_out_at);
  const recent = items.filter((v) => v.signed_out_at);

  return (
    <View style={{ flex: 1, backgroundColor: theme.bg }}>
      <Header onBack={() => router.back()} title="Visitor Log"
        subtitle={`${onsite.length} currently on site`}
        right={
          <TouchableOpacity onPress={() => setAddOpen(true)} style={styles.headerBtn}>
            <Ionicons name="person-add" size={20} color={theme.brand} />
          </TouchableOpacity>
        }
      />

      <ScrollView
        contentContainerStyle={{ paddingBottom: 80 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await load(); setRefreshing(false); }} tintColor={theme.brand} />}
      >
        {/* ----- on site ----- */}
        <Text style={styles.section}>On site now</Text>
        {loading ? (
          <View style={{ paddingHorizontal: spacing.lg }}>
            <SkeletonRow /><SkeletonRow />
          </View>
        ) : onsite.length === 0 ? (
          <EmptyState
            icon="people-outline"
            title="No visitors on site"
            hint="Tap + to sign someone in"
            action={{ label: 'Sign visitor in', onPress: () => setAddOpen(true) }}
          />
        ) : (
          onsite.map((v) => (
            <ListRow
              key={v.id}
              icon="person-circle"
              title={v.full_name}
              subtitle={[v.company, v.vehicle_reg].filter(Boolean).join(' · ') || 'No details'}
              right={
                <TouchableOpacity onPress={() => signOut(v)} style={styles.outBtn}>
                  <Ionicons name="log-out-outline" size={16} color={theme.text} />
                  <Text style={styles.outBtnText}>Out</Text>
                </TouchableOpacity>
              }
            />
          ))
        )}

        {/* ----- recent ----- */}
        {recent.length > 0 && (
          <>
            <Text style={styles.section}>Recent</Text>
            {recent.slice(0, 20).map((v) => (
              <ListRow
                key={v.id}
                icon="person-outline"
                title={v.full_name}
                subtitle={`${new Date(v.signed_in_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} → ${v.signed_out_at ? new Date(v.signed_out_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''}`}
                tint={theme.textMuted}
              />
            ))}
          </>
        )}
      </ScrollView>

      <TouchableOpacity style={styles.fab} onPress={() => setAddOpen(true)} activeOpacity={0.85}>
        <Ionicons name="person-add" size={24} color="#fff" />
      </TouchableOpacity>

      <SignInSheet
        visible={addOpen} onClose={() => setAddOpen(false)}
        siteId={profile?.site_id ?? null}
        currentUserId={profile?.id ?? ''}
        currentUserName={profile?.full_name ?? profile?.email ?? 'Gate Guard'}
        onDone={() => { setAddOpen(false); load(); toast.show('Visitor signed in', 'ok'); }}
      />
      <toast.ToastView />
    </View>
  );
}

// ---------------------------------------------------------------------------
function Header({ title, subtitle, onBack, right }: {
  title: string; subtitle?: string; onBack: () => void; right?: React.ReactNode;
}) {
  return (
    <View style={styles.header}>
      <TouchableOpacity onPress={onBack} style={styles.headerBtn}>
        <Ionicons name="chevron-back" size={26} color={theme.text} />
      </TouchableOpacity>
      <View style={{ flex: 1 }}>
        <Text style={[type.h2]}>{title}</Text>
        {subtitle && <Text style={[type.muted, { marginTop: 2 }]}>{subtitle}</Text>}
      </View>
      {right}
    </View>
  );
}

type ScanTarget = 'disk' | 'license';

function SignInSheet({
  visible, onClose, siteId, currentUserId, currentUserName, onDone,
}: {
  visible: boolean; onClose: () => void;
  siteId: string | null; currentUserId: string; currentUserName: string;
  onDone: () => void;
}) {
  const toast = useToast();
  const [fullName, setFullName] = useState('');
  const [idNumber, setIdNumber] = useState('');
  const [company, setCompany] = useState('');
  const [vehicleReg, setVehicleReg] = useState('');
  const [vehicleMakeModel, setVehicleMakeModel] = useState('');
  const [visiting, setVisiting] = useState('');
  const [busy, setBusy] = useState(false);

  // Scanner state lives inside the sheet so the camera UI replaces the form
  // when active. The lock ref prevents double-firing the parse on the same
  // barcode (CameraView fires onBarcodeScanned continuously).
  const [scanning, setScanning] = useState<ScanTarget | null>(null);
  const scanLock = useRef(false);
  const [permission, requestPermission] = useCameraPermissions();
  const cameraRef = useRef<CameraView>(null);
  // Torch helps a lot: SA licence/disk PDF417 is dense and needs even,
  // bright light on the barcode to decode.
  const [torch, setTorch] = useState(false);
  const [capturing, setCapturing] = useState(false);

  // The reliable path for the dense SA PDF417: take a FULL-RESOLUTION still
  // and decode that, instead of relying on the heavily-downsampled live
  // frames (which never carry enough detail to resolve the fine bars).
  async function captureAndScan() {
    if (!cameraRef.current || capturing) return;
    setCapturing(true);
    try {
      const photo = await cameraRef.current.takePictureAsync({ quality: 1, skipProcessing: false });
      if (!photo?.uri) {
        toast.show('Could not capture photo — try again', 'error');
        return;
      }
      const results = await scanFromURLAsync(photo.uri, ['pdf417']);
      if (__DEV__) {
        const r = results[0] as { type?: string; rawBase64?: string; data?: string } | undefined;
        // eslint-disable-next-line no-console
        console.log('[visitor-scan] photo decode', results.length,
          r ? { type: r.type, hasBytes: !!r.rawBase64, byteLen: r.rawBase64 ? Math.floor((r.rawBase64.length * 3) / 4) : 0, dataLen: r.data?.length } : null);
      }
      if (results.length > 0) {
        const r0 = results[0] as { data: string; raw?: string; rawBase64?: string };
        scanLock.current = false; // allow this deliberate capture to apply
        applyScan(detectAndParse(r0.data, r0.raw ?? null, r0.rawBase64 ?? null));
      } else {
        toast.show('No barcode found — fill the frame, hold steady, try the torch', 'error');
      }
    } catch (e) {
      toast.show('Scan failed — try again', 'error');
    } finally {
      setCapturing(false);
    }
  }

  function resetForm() {
    setFullName(''); setIdNumber(''); setCompany('');
    setVehicleReg(''); setVehicleMakeModel(''); setVisiting('');
  }

  async function save() {
    if (!fullName.trim()) return;
    setBusy(true);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (supabase as any).from('visitors').insert({
      full_name: fullName.trim(),
      id_number: idNumber || null,
      company: company || null,
      vehicle_reg: vehicleReg.toUpperCase() || null,
      // We don't have a make/model column on visitors yet; tuck it into reason
      // so the info isn't lost — operator can rearrange before save.
      reason: [visiting, vehicleMakeModel].filter(Boolean).join(' · ') || null,
      visiting: visiting || null,
      site_id: siteId, signed_in_by: currentUserId, signed_in_by_name: currentUserName,
    });
    setBusy(false);
    if (error) Alert.alert('Could not sign in', error.message);
    else { resetForm(); onDone(); }
  }

  async function startScan(target: ScanTarget) {
    if (!permission?.granted) {
      const r = await requestPermission();
      if (!r.granted) {
        toast.show('Camera permission required to scan', 'error');
        return;
      }
    }
    scanLock.current = false;
    setScanning(target);
  }

  function applyScan(result: ScanResult) {
    if (scanLock.current) return;
    scanLock.current = true;

    if (result.kind === 'disk') {
      const d = result.data;
      const filled: string[] = [];
      if (d.vehicle_reg) { setVehicleReg(d.vehicle_reg); filled.push('reg'); }
      const mm = [d.make, d.model].filter(Boolean).join(' ');
      if (mm) { setVehicleMakeModel(mm + (d.color ? ` · ${d.color}` : '')); filled.push('make/model'); }
      const expired = !!d.expires && d.expires < new Date().toISOString().slice(0, 10);
      toast.show(
        expired
          ? `Disk scanned · LICENCE EXPIRED ${d.expires}`
          : filled.length > 0
            ? `Disk scanned · filled ${filled.join(', ')}`
            : 'Disk scanned but no fields recognised',
        expired || filled.length === 0 ? 'error' : 'ok',
      );
    } else if (result.kind === 'license') {
      const d = result.data;
      const filled: string[] = [];
      if (d.id_number) {
        setIdNumber(d.id_number);
        filled.push('ID');
      }
      if (d.surname && d.initials) {
        setFullName(`${d.initials} ${d.surname}`);
        filled.push('name');
      } else if (d.surname) {
        setFullName(d.surname);
        filled.push('name');
      }
      
      if (filled.length > 0) {
        toast.show(`Driver's licence scanned · filled ${filled.join(' & ')}`, 'ok');
      } else {
        toast.show('Driver\'s licence scanned · fill name + ID manually', 'info');
      }
    } else {
      toast.show('Unrecognised barcode — fill manually', 'error');
    }

    setScanning(null);
  }

  // When scanning is active, the sheet swaps its body for the camera panel
  // (instead of the form). Card-shape reticle, fixed pixel height so the
  // ScrollView around the Sheet body doesn't collapse the CameraView surface.
  if (visible && scanning) {
    return (
      <Sheet
        visible={visible}
        onClose={() => { setTorch(false); setScanning(null); onClose(); }}
        title={scanning === 'disk' ? 'Scan vehicle licence disk' : "Scan driver's licence"}
      >
        <View style={styles.cameraWrap}>
          <CameraView
            ref={cameraRef}
            // Force a fresh native surface every time we open the scanner.
            // Without this key, the previous CameraView instance is reused
            // and the barcode scanner sometimes never re-attaches its
            // detector callback on Android.
            key={`cam-${scanning}`}
            style={StyleSheet.absoluteFill}
            facing="back"
            autofocus="on"
            enableTorch={torch}
            barcodeScannerSettings={{
              // SA licence disks AND driver's licences are BOTH PDF417.
              // Handing the native detector a single symbology (instead of
              // six) dramatically improves its hit-rate on these very dense
              // codes — the extra formats made it hesitate and never lock on.
              barcodeTypes: ['pdf417'],
            }}
            onBarcodeScanned={(event) => {
              const { data, type } = event;
              const e = event as { raw?: string; rawBase64?: string };
              // `rawBase64` (patched native scanner) carries the EXACT bytes —
              // the only form that can decrypt an SA licence. `raw` is a lossy
              // fallback used for the plaintext disk.
              const raw = e.raw ?? null;
              const rawBase64 = e.rawBase64 ?? null;
              // eslint-disable-next-line no-console
              if (__DEV__) console.log('[visitor-scan] barcode', type, 'hasBytes', !!rawBase64, data.slice(0, 40));
              applyScan(detectAndParse(data, raw, rawBase64));
            }}
          />
          {/* Card-aspect reticle (≈1.6:1 like a credit card / SA driver's
              licence / vehicle disk) sized to leave enough margin that the
              barcode actually fills the camera frame. */}
          <View style={styles.reticle} pointerEvents="none">
            <View style={[styles.reticleCorner, styles.reticleTL]} />
            <View style={[styles.reticleCorner, styles.reticleTR]} />
            <View style={[styles.reticleCorner, styles.reticleBL]} />
            <View style={[styles.reticleCorner, styles.reticleBR]} />
          </View>
          <View style={styles.cameraHintWrap} pointerEvents="none">
            <Text style={styles.cameraHint}>
              {scanning === 'disk'
                ? 'Line up the wide disk barcode in the box, then tap Capture & scan'
                : 'Line up the wide barcode strip on the licence, then tap Capture & scan'}
            </Text>
          </View>
          <TouchableOpacity
            onPress={() => setTorch((t) => !t)}
            style={styles.torchBtn}
            activeOpacity={0.8}
          >
            <Ionicons name={torch ? 'flash' : 'flash-off'} size={20} color="#fff" />
          </TouchableOpacity>
        </View>
        <View style={{ height: spacing.sm }} />
        <Button
          title={capturing ? 'Scanning…' : 'Capture & scan'}
          onPress={captureAndScan}
          loading={capturing}
          icon={<Ionicons name="scan" size={18} color="#fff" />}
        />
        <View style={{ height: spacing.xs }} />
        <Button title="Cancel scan" variant="ghost" onPress={() => { setTorch(false); setScanning(null); }} />
      </Sheet>
    );
  }

  return (
    <Sheet visible={visible} onClose={onClose} title="Sign visitor in">
      <View style={styles.scanRow}>
        <TouchableOpacity onPress={() => startScan('disk')} style={styles.scanBtn} activeOpacity={0.7}>
          <Ionicons name="car-outline" size={20} color={theme.brand} />
          <Text style={styles.scanBtnText}>Scan licence disk</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={() => startScan('license')} style={styles.scanBtn} activeOpacity={0.7}>
          <Ionicons name="card-outline" size={20} color={theme.brand} />
          <Text style={styles.scanBtnText}>Scan driver's licence</Text>
        </TouchableOpacity>
      </View>

      <Field label="Full name *" value={fullName} onChangeText={setFullName} placeholder="John Smith" />
      <Field label="ID / Passport" value={idNumber} onChangeText={setIdNumber} placeholder="8001015009087" keyboardType="numbers-and-punctuation" />
      <Field label="Company" value={company} onChangeText={setCompany} placeholder="Acme Logistics" />
      <Field label="Vehicle reg" value={vehicleReg} onChangeText={(t) => setVehicleReg(t.toUpperCase())} placeholder="GP 123 ABC" autoCapitalize="characters" />
      {vehicleMakeModel ? (
        <Field
          label="Vehicle (make · model · colour)"
          value={vehicleMakeModel}
          onChangeText={setVehicleMakeModel}
          placeholder="From scan — edit if wrong"
        />
      ) : null}
      <Field label="Visiting" value={visiting} onChangeText={setVisiting} placeholder="Site contact" />
      <View style={{ height: spacing.sm }} />
      <Button title="Sign In" onPress={save} loading={busy}
        icon={<Ionicons name="log-in" size={18} color="#fff" />} />
    </Sheet>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingHorizontal: spacing.lg, paddingTop: spacing.xl * 2, paddingBottom: spacing.md,
    backgroundColor: theme.bg,
  },
  headerBtn: { padding: 6 },

  section: {
    ...type.caption, paddingHorizontal: spacing.lg,
    marginTop: spacing.md, marginBottom: spacing.sm,
  },

  outBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: theme.surfaceHi,
    paddingHorizontal: 10, paddingVertical: 6, borderRadius: radius.pill,
  },
  outBtnText: { color: theme.text, fontWeight: '700', fontSize: 12 },

  fab: {
    position: 'absolute', right: 20, bottom: 24,
    width: 56, height: 56, borderRadius: 28,
    backgroundColor: theme.brand,
    alignItems: 'center', justifyContent: 'center',
    ...theme.shadow,
  },

  // Scan buttons at the top of the sign-in sheet — two tappable cards
  // that open the embedded scanner.
  scanRow: {
    flexDirection: 'row', gap: 8,
    marginBottom: spacing.md,
  },
  scanBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    paddingVertical: 12, paddingHorizontal: 10,
    borderRadius: radius.md,
    backgroundColor: theme.surfaceAlt,
    borderWidth: 1, borderColor: theme.border,
  },
  scanBtnText: {
    color: theme.text, fontWeight: '700', fontSize: 13,
    flexShrink: 1,
  },

  // Embedded scanner — explicit pixel height (not aspectRatio) so the
  // CameraView surface gets a stable size inside the Sheet's ScrollView.
  // Aspect ratios inside scrolling containers can resolve to 0 on Android
  // and the barcode scanner never starts.
  cameraWrap: {
    width: '100%',
    // Landscape preview to match the wide barcode strip on the card, and
    // tall enough to give the capture a high-detail frame to decode.
    height: 300,
    backgroundColor: '#000',
    borderRadius: radius.lg,
    overflow: 'hidden',
    position: 'relative',
  },
  torchBtn: {
    position: 'absolute',
    top: 10, right: 10,
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: 'rgba(0,0,0,0.55)',
    alignItems: 'center', justifyContent: 'center',
  },
  // Card-orientation reticle (~1.6:1 ratio, like a credit card / SA disk /
  // SA driver's licence). The four corner brackets are easier to read than
  // a full border when the camera preview is busy.
  reticle: {
    // Wide, short band — the SA barcode is a wide strip, not a square.
    position: 'absolute',
    top: '26%', bottom: '26%', left: '6%', right: '6%',
  },
  reticleCorner: {
    position: 'absolute',
    width: 28, height: 28,
    borderColor: theme.brand,
    borderTopWidth: 0, borderBottomWidth: 0, borderLeftWidth: 0, borderRightWidth: 0,
  },
  reticleTL: { top: 0, left: 0, borderTopWidth: 3, borderLeftWidth: 3, borderTopLeftRadius: 6 },
  reticleTR: { top: 0, right: 0, borderTopWidth: 3, borderRightWidth: 3, borderTopRightRadius: 6 },
  reticleBL: { bottom: 0, left: 0, borderBottomWidth: 3, borderLeftWidth: 3, borderBottomLeftRadius: 6 },
  reticleBR: { bottom: 0, right: 0, borderBottomWidth: 3, borderRightWidth: 3, borderBottomRightRadius: 6 },

  cameraHintWrap: {
    position: 'absolute', left: 0, right: 0, bottom: 12,
    alignItems: 'center', paddingHorizontal: 16,
  },
  cameraHint: {
    color: '#fff', fontSize: 12, textAlign: 'center',
    backgroundColor: 'rgba(0,0,0,0.55)',
    paddingHorizontal: 12, paddingVertical: 5,
    borderRadius: radius.pill,
  },
});

// keep Badge import used (we may want to expose status later)
void Badge;
