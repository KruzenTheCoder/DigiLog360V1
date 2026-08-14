import type { Metadata } from 'next';
import { LandingPage } from '@/components/landing/landing-page';

export const metadata: Metadata = {
  title: 'Why it matters — Digilog360',
  description: 'What happens between an incident and a decision, and what the delay costs.',
};

export default function WhyPage() {
  return <LandingPage sections={['problem', 'who']} />;
}
