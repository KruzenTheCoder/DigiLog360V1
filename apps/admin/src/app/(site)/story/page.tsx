import type { Metadata, Viewport } from 'next';
import { LandingPage } from '@/components/landing/landing-page';
import { StoryHero } from '@/components/hero/story-hero';

// The mobile browser chrome takes the colour of the ground this page opens
// on, so the hero starts at the top of the glass instead of under a
// mismatched strip. Merges with the root viewport; only the colour changes.
export const viewport: Viewport = { themeColor: "#05070B" };

export const metadata: Metadata = {
  title: 'One night, minute by minute — Digilog360',
  description: 'The same incident run through the platform, timestamp by timestamp.',
};

export default function StoryPage() {
  return (
    <>
      <StoryHero />
      <LandingPage sections={['story', 'targets', 'field']} />
    </>
  );
}
