import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { LandingPage } from '@/components/landing/landing-page';
import { BRAND } from '@digilog/shared';

// The public front door. Anyone can read it; anyone already signed in is sent
// straight through to the console instead.
export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: `${BRAND.name} — ${BRAND.tagline}`,
  description:
    'Replace the paper occurrence book, the patrol clock, the visitor register and the key ledger with one live system. Incidents reach the control room in under a minute, with evidence attached.',
};

export default async function Home() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  if (data?.user) redirect('/menu');

  return <LandingPage />;
}
