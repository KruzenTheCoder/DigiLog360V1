import type { Metadata } from 'next';
import { LandingPage } from '@/components/landing/landing-page';
import { WhyHero } from '@/components/hero/why-hero';

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
