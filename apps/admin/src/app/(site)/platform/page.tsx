import type { Metadata, Viewport } from 'next';
import { LandingPage } from '@/components/landing/landing-page';
import { PlatformHero } from '@/components/hero/platform-hero';

// The mobile browser chrome takes the colour of the ground this page opens
// on, so the hero starts at the top of the glass instead of under a
// mismatched strip. Merges with the root viewport; only the colour changes.
export const viewport: Viewport = { themeColor: "#020617" };

export const metadata: Metadata = {
  title: 'Platform — Digilog360',
  description: 'Occurrence logging, SLA targets, patrols, inspections and escalation in one place.',
};

export default function PlatformPage() {
  return (
    <>
      <PlatformHero />
      <LandingPage sections={['solution', 'what', 'underneath']} />
    </>
  );
}
