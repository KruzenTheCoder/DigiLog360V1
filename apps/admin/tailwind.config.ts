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
        'flash-in': 'flash-in 2.4s ease',
      },
    },
  },
  plugins: [],
};

export default config;
