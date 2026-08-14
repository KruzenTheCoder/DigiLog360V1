'use client';

// The home page's onward navigation.
//
// Replaces "keep scrolling for another two thousand pixels" with a deck the
// visitor chooses from. Each card is a whole page, so someone who only wants
// the console never wades through the storyboard to reach it.

import Link from 'next/link';
import { ArrowRight } from 'lucide-react';

const CARDS = [
  {
    href: '/why',
    kicker: 'The problem',
    title: 'Why minutes matter',
    body: 'What actually happens between an incident and someone deciding what to do about it — and what the delay costs.',
    tone: 'from-[#f0506e] to-[#d4314f]',
  },
  {
    href: '/platform',
    kicker: 'The platform',
    title: 'What you get',
    body: 'Occurrence logging, SLA targets, patrols, inspections and escalation, in one place your control room already understands.',
    tone: 'from-[#667eea] to-[#764ba2]',
  },
  {
    href: '/story',
    kicker: 'A worked example',
    title: 'One night, minute by minute',
    body: 'The same incident, run through the platform, timestamp by timestamp — from first alarm to a signed-off report.',
    tone: 'from-[#0ea5e9] to-[#2563c9]',
  },
  {
    href: '/console',
    kicker: 'The console',
    title: 'See it working',
    body: 'The live board, the realtime feed and the response targets your managers are held to.',
    tone: 'from-[#10b981] to-[#059467]',
  },
];

export function PageCards() {
  return (
    <section className="w-full bg-[hsl(var(--background))] py-16 lg:py-24">
      <div className="mx-auto w-full max-w-[92rem] px-5 sm:px-8 lg:px-12">
        <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-[hsl(var(--brand))]">
          Explore
        </p>
        <h2 className="mt-4 max-w-[20ch] text-[clamp(1.7rem,3.4vw,2.6rem)] font-extrabold leading-[1.08] tracking-[-0.03em]">
          Four short pages, not one long scroll.
        </h2>

        <div className="mt-10 grid gap-5 sm:grid-cols-2 xl:grid-cols-4">
          {CARDS.map((c, i) => (
            <Link
              key={c.href}
              href={c.href}
              // Staggered rise so the deck assembles rather than snapping in.
              className="group animate-card-in rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--surface))] p-6 transition duration-300 hover:-translate-y-1 hover:border-[hsl(var(--brand))]/40 hover:shadow-xl"
              style={{ animationDelay: `${i * 90}ms` }}
            >
              <span className={`inline-flex h-1.5 w-12 rounded-full bg-gradient-to-r ${c.tone}`} />
              <p className="mt-5 text-[11px] font-bold uppercase tracking-[0.18em] text-[hsl(var(--muted))]">
                {c.kicker}
              </p>
              <h3 className="mt-2 text-xl font-bold leading-snug">{c.title}</h3>
              <p className="mt-3 text-sm leading-relaxed text-[hsl(var(--muted))]">{c.body}</p>
              <span className="mt-5 inline-flex items-center gap-1.5 text-sm font-semibold text-[hsl(var(--brand))]">
                Read on
                <ArrowRight className="h-4 w-4 transition-transform duration-300 group-hover:translate-x-1" />
              </span>
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}
