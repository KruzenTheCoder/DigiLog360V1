import { BRAND, SEVERITY_COLORS, STATUS_COLORS } from '@digilog/shared';

export const theme = {
  brand: BRAND.primary,
  brandPurple: BRAND.gradientTo,
  bg: '#0f1420',
  surface: '#1a2030',
  surfaceAlt: '#232b3d',
  border: '#2b3447',
  text: '#f1f5f9',
  textMuted: '#94a3b8',
  danger: '#ef4444',
  warning: '#f59e0b',
  success: '#16a34a',
  severity: SEVERITY_COLORS,
  status: STATUS_COLORS,
};

export const radius = { sm: 8, md: 12, lg: 16, xl: 20 };
export const spacing = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24 };
