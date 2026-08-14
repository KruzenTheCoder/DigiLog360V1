import type { Metadata } from 'next';
import { LandingPage } from '@/components/landing/landing-page';

export const metadata: Metadata = {
  title: 'Platform — Digilog360',
  description: 'Occurrence logging, SLA targets, patrols, inspections and escalation in one place.',
};

export default function PlatformPage() {
  return <LandingPage sections={['solution', 'what', 'underneath']} />;
}
