import type { Metadata } from 'next';
import { LandingPage } from '@/components/landing/landing-page';
import { StoryHero } from '@/components/hero/story-hero';

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
