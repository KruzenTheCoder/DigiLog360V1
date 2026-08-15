import type { Metadata } from 'next';
import { LandingPage } from '@/components/landing/landing-page';
import { PlatformHero } from '@/components/hero/platform-hero';

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
