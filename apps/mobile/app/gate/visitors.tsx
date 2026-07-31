// Visitor log — fast sign-in/out for gate guards.
// Live list of on-site visitors, swipe-style "Sign out" button, fast add form
// with PDF417 scan support for SA vehicle licence disks and driver's licences.

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, RefreshControl, Alert, Platform,
} from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { CameraView, useCameraPermissions, scanFromURLAsync } from 'expo-camera';
import * as ImagePicker from 'expo-image-picker';
import { useAuth } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import { profileSiteIds } from '@digilog/shared';
import { Button, Field, Badge } from '@/components/ui';
import { Sheet, EmptyState, SkeletonRow, useToast } from '@/components/primitives';
import { theme, spacing, radius, type } from '@/lib/theme';
import { detectAndParse, type ScanResult } from '@/lib/parse-barcodes';
import { base64ToBytes } from '@/lib/sa-drivers-license';

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
  const [scanOutOpen, setScanOutOpen] = useState(false);

  const load = useCallback(async () => {
    const mySites = profileSiteIds(profile);
    if (mySites.length === 0 && !profile?.id) {
      setItems([]); setLoading(false);
      return;
    }
    setLoading(true);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let q = (supabase as any).from('visitors').select('*')
      .order('signed_in_at', { ascending: false })
      .limit(50);
    if (mySites.length > 0) {
      // Assigned guard: show every visitor at the sites they cover.
      q = q.in('site_id', mySites);
    } else {
      // Site-less user (e.g. a manager not assigned to a site): the old code
      // returned an empty list here, so a visitor they signed in never showed
      // even though it saved. Fall back to the visitors they personally signed
      // in — which the visitors_read RLS policy allows (signed_in_by = auth.uid()).
      q = q.eq('signed_in_by', profile!.id);
    }
    const { data } = await q;
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
      {/* Sign-in has exactly ONE entry point: the FAB below. The header icon and
          the empty-state button were two more controls doing the identical
          thing, which just made the screen busier for a guard working one-handed. */}
      <Header onBack={() => router.back()} title="Visitor Log"
        subtitle={`${onsite.length} currently on site`}
      />

      <ScrollView
        contentContainerStyle={{ paddingTop: spacing.xs, paddingBottom: 96 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await load(); setRefreshing(false); }} tintColor={theme.brand} />}
      >
        {/* ----- on site ----- */}
        <View style={styles.sectionRow}>
          <View style={styles.sectionTitleWrap}>
            <Text style={styles.section}>On site</Text>
            {onsite.length > 0 && (
              <View style={styles.countChip}><Text style={styles.countChipText}>{onsite.length}</Text></View>
            )}
          </View>
          {onsite.length > 0 && (
            <TouchableOpacity onPress={() => setScanOutOpen(true)} style={styles.scanOutBtn} activeOpacity={0.7}>
              <Ionicons name="scan-outline" size={15} color={theme.brand} />
              <Text style={styles.scanOutBtnText}>Scan out</Text>
            </TouchableOpacity>
          )}
        </View>

        {loading ? (
          <View style={styles.card}><SkeletonRow /><SkeletonRow /></View>
        ) : onsite.length === 0 ? (
          <EmptyState
            icon="people-outline"
            title="No visitors on site"
            hint="Tap + to sign someone in"
          />
        ) : (
          <View style={styles.card}>
            {onsite.map((v, i) => (
              <View key={v.id} style={[styles.vrow, i > 0 && styles.vrowDivider]}>
                <View style={styles.vAvatar}>
                  <Ionicons name="person" size={18} color={theme.brand} />
                </View>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={styles.vName} numberOfLines={1}>{v.full_name}</Text>
                  <Text style={styles.vMeta} numberOfLines={1}>
                    {`In ${new Date(v.signed_in_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`}
                    {[v.company, v.vehicle_reg].filter(Boolean).length > 0
                      ? ` · ${[v.company, v.vehicle_reg].filter(Boolean).join(' · ')}` : ''}
                  </Text>
                </View>
                <TouchableOpacity onPress={() => signOut(v)} style={styles.outBtn} activeOpacity={0.8}>
                  <Ionicons name="log-out-outline" size={15} color={theme.brand} />
                  <Text style={styles.outBtnText}>Sign out</Text>
                </TouchableOpacity>
              </View>
            ))}
          </View>
        )}

        {/* ----- recent ----- */}
        {recent.length > 0 && (
          <>
            <View style={styles.sectionRow}>
              <Text style={styles.section}>Recently signed out</Text>
            </View>
            <View style={styles.card}>
              {recent.slice(0, 20).map((v, i) => (
                <View key={v.id} style={[styles.vrow, i > 0 && styles.vrowDivider]}>
                  <View style={[styles.vAvatar, styles.vAvatarMuted]}>
                    <Ionicons name="person-outline" size={16} color={theme.textMuted} />
                  </View>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={[styles.vName, styles.vNameMuted]} numberOfLines={1}>{v.full_name}</Text>
                    <Text style={styles.vMeta} numberOfLines={1}>
                      {`${new Date(v.signed_in_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} → ${v.signed_out_at ? new Date(v.signed_out_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''}`}
                    </Text>
                  </View>
                </View>
              ))}
            </View>
          </>
        )}
      </ScrollView>

      <TouchableOpacity style={styles.fab} onPress={() => setAddOpen(true)} activeOpacity={0.85}>
        <Ionicons name="person-add" size={24} color="#fff" />
      </TouchableOpacity>

      <SignInSheet
        visible={addOpen} onClose={() => setAddOpen(false)}
        // Save the visitor to a site that is guaranteed to be in the same set
        // load() filters on (profileSiteIds). A multi-site guard can have a null
        // legacy site_id while being assigned via site_ids[]; saving with that
        // null wrote a row the .in('site_id', mySites) query then excluded, so
        // the visitor "saved" but never appeared. Prefer the legacy site_id when
        // present (it's included in mySites), else the first assigned site.
        siteId={profile?.site_id ?? profileSiteIds(profile)[0] ?? null}
        currentUserId={profile?.id ?? ''}
        currentUserName={profile?.full_name ?? profile?.email ?? 'Gate Guard'}
        onDone={() => { setAddOpen(false); load(); toast.show('Visitor signed in', 'ok'); }}
      />
      <ScanOutSheet
        visible={scanOutOpen}
        onClose={() => setScanOutOpen(false)}
        onsite={onsite}
        onMatch={(v) => { setScanOutOpen(false); signOut(v); }}
      />
      <toast.ToastView />
    </View>
  );
}

// ---------------------------------------------------------------------------
function Header({ title, subtitle, onBack }: {
  title: string; subtitle?: string; onBack: () => void;
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
    </View>
  );
}

type ScanTarget = 'disk' | 'license';

/**
 * Why a scan attempt ended. `needs-newer-build` is the important one: the
 * barcode WAS read, but this build's native scanner cannot hand us the exact
 * bytes an encrypted SA licence needs. No JS/OTA update can change that.
 */
type ScanOutcome = 'ok' | 'no-barcode' | 'needs-newer-build';

const NEEDS_BUILD_MSG =
  'Licence read, but this app version can\'t decode it — a new app build is needed (not an update)';

function SignInSheet({
  visible, onClose, siteId, currentUserId, currentUserName, onDone,
}: {
  visible: boolean; onClose: () => void;
  siteId: string | null; currentUserId: string; currentUserName: string;
  onDone: () => void;
}) {
  const toast = useToast();
  const { can, capabilities } = useAuth();
  // Picking a stored photo is capability-gated so a site can switch it off —
  // signing someone in from a saved image weakens the "physically here"
  // assumption. Mirrors the home screen: treat it as visible while
  // capabilities are still loading so the button doesn't pop in late.
  const galleryEnabled = capabilities === null ? true : can('mobile.visitors.gallery_pick');
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
  // Ref mirror of `capturing` so the auto-scan interval and the manual button
  // share one fresh in-flight guard without stale-closure races.
  const capturingRef = useRef(false);
  // Rate-limit the detection-triggered auto capture so a continuous stream of
  // "detected but not decoded" frames can't machine-gun the shutter — one
  // focused attempt at a time, matched to how long a capture+decode takes.
  const lastAutoRef = useRef(0);
  // Once the operator taps Scan now, hand full control to them and stop the
  // auto loop, so the two don't fight over the camera and disrupt each other's
  // focus.
  const manualTakeoverRef = useRef(false);
  // Last scan's technical result, shown in the scanner panel. Survives long
  // enough to be read out to support; a successful scan closes the panel so it
  // is only ever visible after a failure.
  const [diag, setDiag] = useState<string | null>(null);

  /**
   * Decode a PDF417 from an image file and apply it to the form.
   * Shared by the live capture and the gallery pick — both end up handing a
   * file URI to the same native decoder. Returns false when nothing decoded so
   * each caller can word its own advice.
   */
  async function decodeAndApply(uri: string, source: 'capture' | 'gallery'): Promise<ScanOutcome> {
    const results = await scanFromURLAsync(uri, ['pdf417']);
    if (results.length === 0) {
      setDiag(`${source}: no symbol found in image`);
      return 'no-barcode';
    }

    const r0 = results[0] as {
      data: string; raw?: string; rawBase64?: string;
      /** "1" when the native override is compiled in. Never null — see below. */
      rawBytesSupport?: string;
    };
    const result = detectAndParse(r0.data, r0.raw ?? null, r0.rawBase64 ?? null);

    // Field-visible diagnostic. Only shapes and header bytes — never payload
    // contents — so it is safe to read out over the phone to support.
    // "bytes=NO" is the decisive signal: the native scanner did not hand us the
    // raw bytes, which no JS update can fix.
    const bytes = r0.rawBase64 ? base64ToBytes(r0.rawBase64) : null;
    const hdr = bytes
      ? [...bytes.subarray(0, 4)].map((b) => b.toString(16).padStart(2, '0')).join(' ')
      : '--';
    // Distinguishes the two reasons bytes can be missing, which need completely
    // different fixes. Our patch calls putString("rawBase64", …) unconditionally,
    // so an unpatched build has NO SUCH KEY (undefined) while a patched build
    // whose ML Kit simply returned no raw bytes has the key present but null.
    //   field=absent -> the APK does not contain the patch
    //   field=null   -> patch is there; ML Kit gave us no bytes for this symbol
    // `rawBytesSupport` is set to "1" by the override and is never null, so it
    // survives a bridge that drops null-valued keys — unlike rawBase64 itself.
    //   support=no  -> this APK was compiled WITHOUT the native override
    //   support=yes -> override is in; ML Kit simply returned no bytes
    const support = r0.rawBytesSupport === '1' ? 'yes' : 'no';
    setDiag(
      `${source}: bytes=${bytes ? 'yes' : 'NO'} support=${support} len=${bytes?.length ?? 0} ` +
      `hdr=${hdr} text=${r0.data?.length ?? 0} → ${result.kind}`,
    );

    // A licence payload is encrypted binary, so it can ONLY be read from the
    // barcode's exact bytes. Those arrive as `rawBase64` from our patched
    // expo-camera; without the patch the payload is a UTF-8-mangled string that
    // decrypts to nothing and lands here as 'unknown'. That is a native gap, so
    // an over-the-air JS update cannot fix it — the device needs a newer build.
    // Vehicle disks are plaintext and still work, hence the 'unknown' check.
    if (result.kind === 'unknown' && !r0.rawBase64) return 'needs-newer-build';

    scanLock.current = false; // allow this deliberate scan to apply
    applyScan(result);
    return 'ok';
  }

  // The reliable path for the dense SA PDF417: take a FULL-RESOLUTION still
  // and decode that, instead of relying on the heavily-downsampled live
  // frames (which never carry enough detail to resolve the fine bars).
  //
  // `auto` = driven by the licence auto-scan loop rather than a button tap.
  // In that mode a miss is expected (we're polling), so failure toasts are
  // suppressed — only a successful decode surfaces anything.
  async function captureAndScan(auto = false) {
    if (!auto) manualTakeoverRef.current = true; // operator took over → stop auto
    if (!cameraRef.current || capturingRef.current) return;
    capturingRef.current = true;
    setCapturing(true);
    try {
      const photo = await cameraRef.current.takePictureAsync({ quality: 1, skipProcessing: false });
      if (!photo?.uri) {
        if (!auto) toast.show('Could not capture photo — try again', 'error');
        return;
      }
      const outcome = await decodeAndApply(photo.uri, 'capture');
      if (auto) return; // misses are silent while polling; a hit already applied
      if (outcome === 'no-barcode') {
        toast.show('No barcode found — fill the frame, hold steady, try the torch', 'error');
      } else if (outcome === 'needs-newer-build') {
        toast.show(NEEDS_BUILD_MSG, 'error');
      }
    } catch (e) {
      // Separate "this device can never scan" from a one-off failure. ML Kit
      // ships inside Google Play Services, so on a gate tablet without it every
      // scan fails forever — and the old generic message gave no hint why.
      const msg = e instanceof Error ? e.message : String(e);
      if (__DEV__) {
        // eslint-disable-next-line no-console
        console.log('[visitor-scan] capture failed', msg);
      }
      if (!auto) {
        toast.show(
          /MLKit|Google Play/i.test(msg)
            ? 'This device can\'t scan barcodes — Google Play Services is missing'
            : 'Scan failed — try again',
          'error',
        );
      }
    } finally {
      capturingRef.current = false;
      setCapturing(false);
    }
  }

  // Focused auto-capture for the licence. Live frames on many devices can't even
  // DETECT the dense licence PDF417 (let alone decrypt it), so waiting on the
  // live scanner leaves it stuck. Instead: let continuous autofocus lock onto
  // the held card, then take a full-resolution still — the same shot the manual
  // button takes, which decodes reliably.
  //
  // Strictly bounded so it can never machine-gun the shutter again: a settle
  // delay before the first shot, a pause between shots for autofocus to re-lock,
  // and a hard cap after which it stops and asks the operator to reframe and tap
  // Scan now. A successful decode closes the panel, ending the loop early. The
  // detection-trigger in onBarcodeScanned can still lock faster when live works.
  useEffect(() => {
    if (!(visible && scanning === 'license')) return;
    let cancelled = false;
    let attempts = 0;
    let timer: ReturnType<typeof setTimeout>;
    const run = async () => {
      if (cancelled || scanLock.current || manualTakeoverRef.current) return;
      if (attempts >= 3) {
        setDiag('Fill the box with the barcode and hold still, then tap Scan now');
        return;
      }
      attempts += 1;
      lastAutoRef.current = Date.now();
      await captureAndScan(true);        // waits for capture + decode
      if (cancelled || scanLock.current || manualTakeoverRef.current) return;
      // Long pause: back-to-back captures never let continuous autofocus
      // re-converge, so the shots come out soft and nothing decodes. Give it
      // room to lock before the next shot.
      timer = setTimeout(run, 3000);
    };
    timer = setTimeout(run, 2500);       // generous initial autofocus settle
    return () => { cancelled = true; clearTimeout(timer); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, scanning]);

  /**
   * Decode from a photo already on the device. A live capture has to win on
   * focus, glare and a laminated sleeve all at once; an existing full-resolution
   * photo of the barcode often decodes when the camera cannot.
   */
  async function pickAndScan() {
    if (capturing) return;
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      toast.show('Photo library permission needed to pick an image', 'error');
      return;
    }
    // quality 1, no editing: any downscale or recompression destroys the fine
    // bar detail a dense PDF417 needs. Messenger-compressed copies never decode.
    const res = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 1,
      allowsEditing: false,
    });
    if (res.canceled || !res.assets[0]?.uri) return;

    setCapturing(true);
    try {
      const outcome = await decodeAndApply(res.assets[0].uri, 'gallery');
      if (outcome === 'no-barcode') {
        toast.show('No barcode in that photo — use the original, not a screenshot or forwarded copy', 'error');
      } else if (outcome === 'needs-newer-build') {
        toast.show(NEEDS_BUILD_MSG, 'error');
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (__DEV__) {
        // eslint-disable-next-line no-console
        console.log('[visitor-scan] gallery failed', msg);
      }
      toast.show(
        /MLKit|Google Play/i.test(msg)
          ? 'This device can\'t scan barcodes — Google Play Services is missing'
          : 'Could not read that image — try another',
        'error',
      );
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
    lastAutoRef.current = 0;
    manualTakeoverRef.current = false;
    setDiag(null);
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
              // Already locked on — ignore the stream of duplicate frames ML Kit
              // keeps firing, so we never run the RSA decrypt more than needed.
              if (scanLock.current) return;
              const { data, type } = event;
              const e = event as { raw?: string; rawBase64?: string };
              // `rawBase64` (patched native scanner) carries the EXACT bytes —
              // the only form that can decrypt an SA licence. `raw` is a lossy
              // fallback used for the plaintext disk.
              const raw = e.raw ?? null;
              const rawBase64 = e.rawBase64 ?? null;
              // eslint-disable-next-line no-console
              if (__DEV__) console.log('[visitor-scan] barcode', type, 'hasBytes', !!rawBase64, data.slice(0, 40));
              const result = detectAndParse(data, raw, rawBase64);
              // A downsampled live frame usually can't fully decrypt the dense
              // licence PDF417 — but ML Kit still DETECTED it, which means it's
              // framed and in focus right now. That's the ideal moment to grab
              // one full-resolution still, which resolves it. captureAndScan is
              // guarded against overlap, so this fires a single focused capture
              // per lock-on rather than a blind timed burst. A complete live
              // decode (rare) still applies directly; the disk always does.
              if (scanning === 'license' && !(result.kind === 'license' && result.data.id_number)) {
                const now = Date.now();
                if (now - lastAutoRef.current > 1500) {
                  lastAutoRef.current = now;
                  captureAndScan(true);
                }
                return;
              }
              applyScan(result);
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
                : 'Fill the box with the barcode strip, hold steady — it scans automatically'}
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
          title={capturing ? 'Scanning…' : scanning === 'license' ? 'Scan now' : 'Capture & scan'}
          onPress={() => captureAndScan(false)}
          loading={capturing}
          icon={<Ionicons name="scan" size={18} color="#fff" />}
        />
        {galleryEnabled && (
          <>
            <View style={{ height: spacing.xs }} />
            <Button
              title="Pick photo from gallery"
              variant="secondary"
              onPress={pickAndScan}
              disabled={capturing}
              icon={<Ionicons name="images-outline" size={18} color="#fff" />}
            />
          </>
        )}
        {diag && (
          <>
            <View style={{ height: spacing.xs }} />
            <Text style={styles.diag} selectable>Last scan → {diag}</Text>
          </>
        )}
        <View style={{ height: spacing.xs }} />
        <Button title="Cancel scan" variant="ghost" onPress={() => { setTorch(false); setScanning(null); }} />
        <toast.ToastView />
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
      <toast.ToastView />
    </Sheet>
  );
}

// ---------------------------------------------------------------------------
// Sign a visitor out by scanning their vehicle licence disk (or driver's
// licence) at the gate, instead of hunting for their row and tapping "Out".
// The disk decodes reliably from live frames, so this stays a simple live
// scanner with a Capture fallback — deliberately NOT the sign-in licence
// scanner's full-res auto-capture machinery, so the working sign-in flow is
// untouched.
function ScanOutSheet({
  visible, onClose, onsite, onMatch,
}: {
  visible: boolean; onClose: () => void;
  onsite: Visitor[]; onMatch: (v: Visitor) => void;
}) {
  const toast = useToast();
  const [permission, requestPermission] = useCameraPermissions();
  const [torch, setTorch] = useState(false);
  const [capturing, setCapturing] = useState(false);
  const cameraRef = useRef<CameraView>(null);
  const lock = useRef(false);
  // Dedupe the stream of identical frames so a scan that matches nobody doesn't
  // spam the same toast many times a second.
  const lastHandled = useRef<{ key: string; t: number }>({ key: '', t: 0 });

  useEffect(() => {
    if (!visible) return;
    lock.current = false;
    lastHandled.current = { key: '', t: 0 };
    if (!permission?.granted) requestPermission();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  const norm = (s?: string | null) => (s ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');

  function handle(result: ScanResult) {
    if (lock.current) return;
    const reg = result.kind === 'disk' ? result.data.vehicle_reg : undefined;
    const id = result.kind === 'license' ? result.data.id_number : undefined;
    const key = reg ? `R${norm(reg)}` : id ? `I${id}` : '';
    if (!key) return; // not a usable disk/licence — keep scanning silently

    const now = Date.now();
    if (key === lastHandled.current.key && now - lastHandled.current.t < 3000) return;
    lastHandled.current = { key, t: now };

    const found = reg
      ? onsite.filter((v) => norm(v.vehicle_reg) === norm(reg))
      : onsite.filter((v) => (v.id_number ?? '') === id);
    const label = reg ? reg : `ID …${(id ?? '').slice(-4)}`;

    if (found.length === 0) { toast.show(`No visitor on site with ${label}`, 'error'); return; }
    if (found.length > 1) { toast.show(`${found.length} on-site match ${label} — use the Out button`, 'info'); return; }

    lock.current = true;
    setTorch(false);
    onMatch(found[0]);
  }

  async function captureScan() {
    if (!cameraRef.current || capturing) return;
    setCapturing(true);
    try {
      const photo = await cameraRef.current.takePictureAsync({ quality: 1, skipProcessing: false });
      if (photo?.uri) {
        const results = await scanFromURLAsync(photo.uri, ['pdf417']);
        if (results.length > 0) {
          const r0 = results[0] as { data: string; raw?: string; rawBase64?: string };
          handle(detectAndParse(r0.data, r0.raw ?? null, r0.rawBase64 ?? null));
        } else {
          toast.show('No barcode found — fill the frame, hold steady', 'error');
        }
      }
    } catch {
      toast.show('Scan failed — try again', 'error');
    } finally {
      setCapturing(false);
    }
  }

  if (!visible) return null;
  return (
    <Sheet visible={visible} onClose={() => { setTorch(false); onClose(); }} title="Scan out a visitor">
      <View style={styles.cameraWrap}>
        <CameraView
          ref={cameraRef}
          key="cam-scanout"
          style={StyleSheet.absoluteFill}
          facing="back"
          autofocus="on"
          enableTorch={torch}
          barcodeScannerSettings={{ barcodeTypes: ['pdf417'] }}
          onBarcodeScanned={(event) => {
            const e = event as { data: string; raw?: string; rawBase64?: string };
            handle(detectAndParse(e.data, e.raw ?? null, e.rawBase64 ?? null));
          }}
        />
        <View style={styles.reticle} pointerEvents="none">
          <View style={[styles.reticleCorner, styles.reticleTL]} />
          <View style={[styles.reticleCorner, styles.reticleTR]} />
          <View style={[styles.reticleCorner, styles.reticleBL]} />
          <View style={[styles.reticleCorner, styles.reticleBR]} />
        </View>
        <View style={styles.cameraHintWrap} pointerEvents="none">
          <Text style={styles.cameraHint}>Scan the vehicle licence disk to sign the visitor out</Text>
        </View>
        <TouchableOpacity onPress={() => setTorch((t) => !t)} style={styles.torchBtn} activeOpacity={0.8}>
          <Ionicons name={torch ? 'flash' : 'flash-off'} size={20} color="#fff" />
        </TouchableOpacity>
      </View>
      <View style={{ height: spacing.sm }} />
      <Button
        title={capturing ? 'Scanning…' : 'Capture & scan'}
        onPress={captureScan}
        loading={capturing}
        icon={<Ionicons name="scan" size={18} color="#fff" />}
      />
      <View style={{ height: spacing.xs }} />
      <Button title="Cancel" variant="ghost" onPress={() => { setTorch(false); onClose(); }} />
      <toast.ToastView />
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

  section: { ...type.caption },

  // Section header: title + count chip on the left, action on the right.
  // Horizontal padding lives here (not on `section`) so headers align with
  // the card edges below.
  sectionRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    marginTop: spacing.lg, marginBottom: spacing.sm,
    minHeight: 30,
  },
  sectionTitleWrap: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  countChip: {
    minWidth: 22, paddingHorizontal: 7, paddingVertical: 2,
    borderRadius: radius.pill, backgroundColor: theme.brandTint,
    alignItems: 'center',
  },
  countChipText: { color: theme.brandSoft, fontSize: 11, fontWeight: '800' },
  scanOutBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    paddingHorizontal: 12, paddingVertical: 6, borderRadius: radius.pill,
    borderWidth: 1, borderColor: theme.brand,
  },
  scanOutBtnText: { color: theme.brand, fontWeight: '700', fontSize: 12 },

  // Lists sit in inset rounded cards instead of full-bleed hairline rows —
  // calmer edges, and a clear visual boundary between On-site and Recent.
  card: {
    marginHorizontal: spacing.lg,
    backgroundColor: theme.surface,
    borderRadius: radius.lg,
    borderWidth: 1, borderColor: theme.borderSoft,
    overflow: 'hidden',
  },
  vrow: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.md,
    paddingHorizontal: spacing.md, paddingVertical: spacing.md,
  },
  vrowDivider: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: theme.borderSoft },
  vAvatar: {
    width: 38, height: 38, borderRadius: 19,
    backgroundColor: theme.brandTint,
    alignItems: 'center', justifyContent: 'center',
  },
  vAvatarMuted: { backgroundColor: theme.surfaceAlt },
  vName: { color: theme.text, fontSize: 15, fontWeight: '700' },
  vNameMuted: { color: theme.textSecondary, fontWeight: '600' },
  vMeta: { color: theme.textMuted, fontSize: 12, marginTop: 2 },

  // Sign-out pill on each on-site row — brand-tinted so the single action on
  // the row reads as tappable without shouting.
  outBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    backgroundColor: theme.brandTint,
    paddingHorizontal: 12, paddingVertical: 7, borderRadius: radius.pill,
  },
  outBtnText: { color: theme.brand, fontWeight: '700', fontSize: 12 },

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
    // Wide, tall-ish box the barcode should FILL — more pixels per bar decodes
    // far more reliably than a distant strip. Leaves a small margin so the
    // whole symbol (with its quiet zone) stays inside the frame.
    position: 'absolute',
    top: '16%', bottom: '16%', left: '5%', right: '5%',
  },
  reticleCorner: {
    position: 'absolute',
    width: 34, height: 34,
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
  // Technical read-out after a scan attempt — exists to be read out to support.
  // Made legible (bordered, monospace) so it can be reported accurately.
  diag: {
    color: theme.text, fontSize: 12,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    textAlign: 'center',
    borderWidth: 1, borderColor: theme.border, borderRadius: radius.sm,
    paddingVertical: 6, paddingHorizontal: 8,
    backgroundColor: theme.surfaceAlt,
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
