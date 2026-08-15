import type { Metadata } from 'next';
import { LandingPage } from '@/components/landing/landing-page';
import { AnswersHero } from '@/components/hero/answers-hero';

export const metadata: Metadata = {
  title: 'Answers — Digilog360',
  description: 'Common questions, and how your data is handled.',
};

export default function AnswersPage() {
  return (
    <>
      <AnswersHero />
      <LandingPage sections={['faq', 'confidential', 'outcome']} />
    </>
  );
}
