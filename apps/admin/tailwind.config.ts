import type { Config } from 'tailwindcss';

const config: Config = {
  darkMode: 'class',
  content: [
    './src/**/*.{ts,tsx}',
    '../../packages/shared/src/**/*.{ts,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        brand: {
          DEFAULT: '#667eea',
          50: '#eef0fd',
          100: '#dde2fb',
          200: '#bcc5f7',
          300: '#9aa8f2',
          400: '#7e8dee',
          500: '#667eea',
          600: '#4f5fd6',
          700: '#4149ad',
          800: '#363c89',
          900: '#2f356f',
          purple: '#764ba2',
        },
      },
      backgroundImage: {
        'brand-gradient': 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
      },
      fontFamily: {
        sans: ['var(--font-sans)', 'system-ui', 'sans-serif'],
      },
      keyframes: {
        'fade-in': { from: { opacity: '0' }, to: { opacity: '1' } },
        'pulse-ring': {
          '0%': { boxShadow: '0 0 0 0 rgba(220,38,38,0.5)' },
          '70%': { boxShadow: '0 0 0 8px rgba(220,38,38,0)' },
          '100%': { boxShadow: '0 0 0 0 rgba(220,38,38,0)' },
        },
        // Landing page: the hero's slow radar sweep.
        'radar-sweep': { to: { transform: 'rotate(360deg)' } },
        // Landing page: ambient washes drifting behind the light sections.
        // Transform and opacity only, so these stay on the compositor.
        'drift-a': {
          '0%, 100%': { transform: 'translate3d(0, 0, 0) scale(1)', opacity: '0.55' },
          '50%': { transform: 'translate3d(7%, -5%, 0) scale(1.15)', opacity: '0.8' },
        },
        'drift-b': {
          '0%, 100%': { transform: 'translate3d(0, 0, 0) scale(1.1)', opacity: '0.5' },
          '50%': { transform: 'translate3d(-6%, 6%, 0) scale(1)', opacity: '0.75' },
        },
        // Landing page: a new incident arriving on the live board.
        'flash-in': {
          '0%': { backgroundColor: 'rgba(102,126,234,0.28)' },
          '100%': { backgroundColor: 'transparent' },
        },
      },
      animation: {
        'fade-in': 'fade-in 0.2s ease-out',
        'pulse-ring': 'pulse-ring 1.8s infinite',
        'radar-sweep': 'radar-sweep 9s linear infinite',
        'drift-a': 'drift-a 28s ease-in-out infinite',
        'drift-b': 'drift-b 36s ease-in-out infinite',
        'flash-in': 'flash-in 2.4s ease',
      },
    },
  },
  plugins: [],
};

export default config;
