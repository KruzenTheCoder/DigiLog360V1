import type { Metadata, Viewport } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';
import { BRAND } from '@digilog/shared';

// Optimize font loading with display: swap to prevent FOIT
const inter = Inter({
  subsets: ['latin'],
  variable: '--font-sans',
  display: 'swap', // Prevent FOIT (Flash of Invisible Text)
  preload: true,
  fallback: ['system-ui', 'sans-serif'],
});

// Separate viewport export for Next.js 15
export const viewport: Viewport = {
  themeColor: BRAND.primary,
  width: 'device-width',
  initialScale: 1,
  maximumScale: 5,
};

export const metadata: Metadata = {
  title: `${BRAND.name} — Security Console`,
  description: `Security operations console by ${BRAND.company}.`,
  applicationName: BRAND.name,
  icons: {
    icon: BRAND.logo.monogram,
    shortcut: BRAND.logo.monogram,
    apple: BRAND.logo.monogram,
  },
  // Performance hints for browsers (only emitted when a URL is configured —
  // see the conditional <link>s below).
  ...(process.env.NEXT_PUBLIC_SUPABASE_URL
    ? {
        other: {
          'dns-prefetch': process.env.NEXT_PUBLIC_SUPABASE_URL,
          'preconnect': process.env.NEXT_PUBLIC_SUPABASE_URL,
        },
      }
    : {}),
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  return (
    <html lang="en" className={inter.variable} suppressHydrationWarning>
      <head>
        {/* Preconnect to critical origins — skipped when no URL is set so we
            never emit an empty href (which React warns about). */}
        {supabaseUrl && <link rel="preconnect" href={supabaseUrl} />}
        {supabaseUrl && <link rel="dns-prefetch" href={supabaseUrl} />}
        {/* Preload critical CSS */}
        <style dangerouslySetInnerHTML={{ __html: `
          /* Critical CSS - Inline for fastest paint */
          :root {
            --background: 210 40% 98%;
            --surface: 0 0% 100%;
            --foreground: 222 47% 11%;
            --muted: 215 20% 45%;
            --border: 214 32% 91%;
            --brand: 245 75% 66%;
          }
          body {
            background-color: hsl(var(--background));
            color: hsl(var(--foreground));
            margin: 0;
            font-family: var(--font-sans, system-ui, sans-serif);
          }
        `}} />
      </head>
      <body className="min-h-screen font-sans antialiased">{children}</body>
    </html>
  );
}
