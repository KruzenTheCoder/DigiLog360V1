// ---------------------------------------------------------------------------
// BrandSplash — the premium loading screen shown while the app boots:
// restoring the session, and (on a real build) checking for OTA updates.
//
// It deliberately mirrors the native splash (assets/splash.png): same dark
// gradient backdrop with a soft brand glow, same centered shield + wordmark.
// That makes the hand-off from the OS splash to this React view seamless —
// the logo appears to stay put while it fades/scales in.
// ---------------------------------------------------------------------------
import { useEffect, useRef } from 'react';
import {
  Animated,
  ActivityIndicator,
  Easing,
  Image,
  ImageBackground,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { theme, spacing } from '@/lib/theme';
import { Logo } from '@/components/logo';
import { BRAND } from '@digilog/shared';

const markIcon = require('../../assets/branding/digilog-logo.png');

const bg = require('../../assets/splash-bg.png');

export function BrandSplash({ status }: { status?: string }) {
  const logoOpacity = useRef(new Animated.Value(0)).current;
  const logoScale = useRef(new Animated.Value(0.92)).current;
  const tailOpacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(logoOpacity, {
        toValue: 1,
        duration: 520,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.spring(logoScale, {
        toValue: 1,
        friction: 7,
        tension: 60,
        useNativeDriver: true,
      }),
      Animated.timing(tailOpacity, {
        toValue: 1,
        duration: 700,
        delay: 220,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      }),
    ]).start();
  }, [logoOpacity, logoScale, tailOpacity]);

  return (
    <ImageBackground source={bg} style={styles.fill} resizeMode="cover">
      <View style={styles.center}>
        <Animated.View
          style={{ opacity: logoOpacity, transform: [{ scale: logoScale }], alignItems: 'center' }}
        >
          {/* App Icon above logo */}
          <View style={styles.iconContainer}>
            <Image source={markIcon} style={styles.appIcon} resizeMode="contain" />
          </View>
          
          <View style={styles.logoSpacing}>
            <Logo width={240} onDark />
          </View>
          
          <Text style={[styles.tagline, styles.taglineSpacing]} allowFontScaling={false}>
            {BRAND.tagline}
          </Text>
        </Animated.View>
      </View>

      <Animated.View style={[styles.footer, { opacity: tailOpacity }]}>
        <ActivityIndicator color={theme.brandSoft} />
        {!!status && (
          <Text style={styles.status} allowFontScaling={false}>
            {status}
          </Text>
        )}
        <Text style={styles.company} allowFontScaling={false}>
          {BRAND.company}
        </Text>
      </Animated.View>
    </ImageBackground>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1, backgroundColor: theme.bg },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  iconContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.lg,
  },
  appIcon: {
    width: 96,
    height: 96,
    borderRadius: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
  logoSpacing: { marginTop: spacing.md },
  taglineSpacing: { marginTop: spacing.md },
  tagline: {
    color: theme.textMuted,
    fontSize: 12,
    letterSpacing: 2,
    textTransform: 'uppercase',
    fontWeight: '600',
  },
  footer: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: spacing.xxl + spacing.lg,
    alignItems: 'center',
    gap: spacing.sm,
  },
  status: { color: theme.textSecondary, fontSize: 13, letterSpacing: 0.3 },
  company: { color: theme.textFaint, fontSize: 11, letterSpacing: 0.5, marginTop: spacing.xs },
});
