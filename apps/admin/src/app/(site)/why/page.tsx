import type { Metadata, Viewport } from 'next';
import { LandingPage } from '@/components/landing/landing-page';
import { WhyHero } from '@/components/hero/why-hero';

// The mobile browser chrome takes the colour of the ground this page opens
// on, so the hero starts at the top of the glass instead of under a
// mismatched strip. Merges with the root viewport; only the colour changes.
export const viewport: Viewport = { themeColor: "#07090C" };

export const metadata: Metadata = {
  title: 'Why it matters — Digilog360',
  description: 'What happens between an incident and a decision, and what the delay costs.',
};

export default function WhyPage() {
  return (
    <>
      <WhyHero />
      <LandingPage sections={['problem', 'who']} />
    </>
  );
}
