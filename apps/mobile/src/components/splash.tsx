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
import { BRAND } from '@digilog/shared';

const bg = require('../../assets/splash-bg.png');
const shield = require('../../assets/branding/digilog-logo.png');
const wordmark = require('../../assets/branding/digilog-mark.png');

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
          <Image source={shield} style={styles.shield} resizeMode="contain" />
          <Image source={wordmark} style={styles.wordmark} resizeMode="contain" />
          <Text style={styles.tagline} allowFontScaling={false}>
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
  // Shield art is 391×280 (≈1.4:1); a 140×100 box keeps its true proportions
  // so `contain` adds no letterbox padding.
  shield: { width: 140, height: 100, marginBottom: spacing.lg },
  // Wordmark art ("DigiLog360") is 534×94 (≈5.7:1). 252×44 matches that ratio
  // so the name renders crisp and tightly lockups under the shield.
  wordmark: { width: 252, height: 44, marginBottom: spacing.md },
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
