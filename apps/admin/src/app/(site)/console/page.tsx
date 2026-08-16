import type { Metadata, Viewport } from 'next';
import { LandingPage } from '@/components/landing/landing-page';
import { ConsoleHero } from '@/components/hero/console-hero';

// The mobile browser chrome takes the colour of the ground this page opens
// on, so the hero starts at the top of the glass instead of under a
// mismatched strip. Merges with the root viewport; only the colour changes.
export const viewport: Viewport = { themeColor: "#0f172a" };

export const metadata: Metadata = {
  title: 'The console — Digilog360',
  description: 'The live board, the realtime feed and the response targets behind them.',
};

export default function ConsolePage() {
  return (
    <>
      <ConsoleHero />
      <LandingPage sections={['console', 'realtime']} />
    </>
  );
}
