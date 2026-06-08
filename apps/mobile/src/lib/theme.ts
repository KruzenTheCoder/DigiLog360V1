import { BRAND, SEVERITY_COLORS, STATUS_COLORS } from '@digilog/shared';

// Premium dark palette tuned for night patrol use:
// - High contrast text on a deep blue-slate, easy on the eyes in the dark
// - Brand purple gradient stays vibrant
// - Surface tiers (bg / surface / surfaceAlt / surfaceHi) give depth without
//   needing shadows on Android where they look muddy
export const theme = {
  brand: BRAND.primary,
  brandPurple: BRAND.gradientTo,
  brandSoft: '#7c8ffb',

  // Surface stack — deepest first
  bg: '#0b1020',
  surface: '#161c2e',
  surfaceAlt: '#1f2740',
  surfaceHi: '#2a3454',

  border: '#2b3447',
  borderSoft: '#1f2740',

  // Text
  text: '#f8fafc',
  textSecondary: '#cbd5e1',
  textMuted: '#94a3b8',
  textFaint: '#64748b',

  // Semantic
  danger: '#ef4444',
  warning: '#f59e0b',
  success: '#22c55e',
  info: '#38bdf8',

  // Tints (used for badge backgrounds, etc)
  brandTint: 'rgba(124,143,251,0.15)',
  successTint: 'rgba(34,197,94,0.15)',
  warningTint: 'rgba(245,158,11,0.15)',
  dangerTint: 'rgba(239,68,68,0.18)',

  severity: SEVERITY_COLORS,
  status: STATUS_COLORS,

  // Shadow preset for elevation 1
  shadow: {
    shadowColor: '#000',
    shadowOpacity: 0.25,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 3,
  },
} as const;

export const radius = { sm: 8, md: 12, lg: 16, xl: 20, pill: 999 };
export const spacing = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 };

// Type-scale helpers — single source of truth for headings/body.
export const type = {
  display: { fontSize: 32, fontWeight: '800' as const, color: theme.text, letterSpacing: -0.5 },
  h1: { fontSize: 24, fontWeight: '800' as const, color: theme.text, letterSpacing: -0.3 },
  h2: { fontSize: 18, fontWeight: '700' as const, color: theme.text },
  h3: { fontSize: 15, fontWeight: '700' as const, color: theme.text },
  body: { fontSize: 14, color: theme.text, lineHeight: 20 },
  bodySm: { fontSize: 13, color: theme.text, lineHeight: 18 },
  muted: { fontSize: 13, color: theme.textMuted },
  caption: { fontSize: 11, color: theme.textMuted, letterSpacing: 0.5, textTransform: 'uppercase' as const, fontWeight: '700' as const },
  label: { fontSize: 12, color: theme.textSecondary, fontWeight: '600' as const },
};
