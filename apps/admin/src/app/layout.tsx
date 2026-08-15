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
        {/*
          Runs before first paint, and does two jobs.

          1. Theme. The stored choice was previously applied in an effect after
             hydration, so a dark-mode visitor got a white flash on every full
             page load. Setting the class here means the first frame is already
             the right colour.

          2. `motion-ready`. Hero entrances hold their opening frame — opacity
             0, a line below its own clip — until their animation runs, which
             is also a way to ship an invisible page if the animation never
             runs. Every rule that hides something is scoped to this class, so
             the absence of this script degrades to plain, finished markup
             rather than to a blank hero.

          Deliberately not deferred: both must land before the browser paints,
          and the work is a class assignment.
        */}
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{
var d=document.documentElement;
var s=localStorage.getItem('digilog.theme');
var dark=s==='dark'||(s!=='light'&&window.matchMedia('(prefers-color-scheme: dark)').matches);
d.classList.toggle('dark',dark);
d.classList.add('motion-ready');
}catch(e){document.documentElement.classList.add('motion-ready');}})();`,
          }}
        />
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
