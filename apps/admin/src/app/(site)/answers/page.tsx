import type { Metadata } from 'next';
import { LandingPage } from '@/components/landing/landing-page';

export const metadata: Metadata = {
  title: 'Answers — Digilog360',
  description: 'Common questions, and how your data is handled.',
};

export default function AnswersPage() {
  return <LandingPage sections={['faq', 'confidential', 'outcome']} />;
}
