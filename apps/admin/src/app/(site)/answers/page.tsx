import type { Metadata, Viewport } from 'next';
import { LandingPage } from '@/components/landing/landing-page';
import { AnswersHero } from '@/components/hero/answers-hero';
import { ContactForm } from '@/components/landing/contact-form';

// The mobile browser chrome takes the colour of the ground this page opens
// on, so the hero starts at the top of the glass instead of under a
// mismatched strip. Merges with the root viewport; only the colour changes.
export const viewport: Viewport = { themeColor: "#f8fafc" };

export const metadata: Metadata = {
  title: 'Answers — Digilog360',
  description: 'Common questions, and how your data is handled. Ask us anything the page does not cover.',
};

export default function AnswersPage() {
  return (
    <>
      <AnswersHero />
      {/* The form sits directly under the hero's question index: the page
          answers what people arrive with, and this is where they ask the one
          that is not on the list. It also fills the gap the hero used to leave
          between its cards and the first content section. */}
      <ContactForm />
      <LandingPage sections={['faq', 'confidential', 'outcome']} />
    </>
  );
}
