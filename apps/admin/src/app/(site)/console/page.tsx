import type { Metadata } from 'next';
import { LandingPage } from '@/components/landing/landing-page';
import { ConsoleHero } from '@/components/hero/console-hero';

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
