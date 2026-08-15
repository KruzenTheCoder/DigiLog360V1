import Link from 'next/link';
import { HeroShell, Stage, MaskLine } from './hero-shell';

/**
 * /answers — restraint.
 *
 * This is the page a sceptical buyer opens to find the catch, and it earns
 * trust by not performing. After five pages of movement, a hero that simply
 * holds still reads as confidence rather than as an absence of effort.
 *
 * One display line, one mask, one stagger on the question links, and then
 * nothing. It is the only hero on the site with no ambient motion at all, and
 * that is the design rather than an omission.
 *
 * The questions are links into the page's own answers, so the hero doubles as
 * the contents page for what follows — which is what somebody arriving with a
 * specific worry actually wants.
 */

const QUESTIONS = [
  { q: 'Where does our data actually live?', href: '#confidential' },
  { q: 'What happens when there is no signal?', href: '#faq' },
  { q: 'Can guards edit what they logged?', href: '#faq' },
  { q: 'What does it cost to leave?', href: '#faq' },
] as const;

export function AnswersHero() {
  return (
    <HeroShell
      ground="bg-[hsl(var(--background))] text-[hsl(var(--foreground))]"
      // Hugs its content rather than reserving most of a screen. The taller
      // setting centred a short composition inside 70svh and left a band of
      // empty page between the question index and whatever came next.
      height="short"
      exit={false}
    >
      <Stage at={0}>
        <p className="font-mono text-[0.68rem] font-bold uppercase tracking-[0.22em] text-[hsl(var(--muted))]">
          Answers
        </p>
      </Stage>

      <h1 className="mt-8 max-w-[16ch] text-[clamp(2.4rem,6vw,4.6rem)] font-extrabold leading-[1.02] tracking-[-0.042em]">
        <MaskLine at={260}>Ask the</MaskLine>
        <MaskLine at={380} className="text-[hsl(var(--muted))]">awkward ones.</MaskLine>
      </h1>

      <Stage at={720} as="p" className="mt-8 max-w-[54ch] text-base leading-relaxed text-[hsl(var(--muted))] lg:text-lg">
        Everything below is the answer we would give on a call, written down.
        Where the honest answer is a limitation, it says so.
      </Stage>

      <ul className="mt-12 grid max-w-[62rem] gap-px overflow-hidden rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--border))] sm:grid-cols-2">
        {QUESTIONS.map((item, i) => (
          <Stage
            key={item.q}
            at={900 + i * 45}
            as="li"
            className="bg-[hsl(var(--surface))]"
          >
            <Link
              href={item.href}
              className="group flex h-full items-center justify-between gap-4 px-5 py-4 text-[0.97rem] font-medium transition-colors hover:bg-[hsl(var(--background))] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--brand))]"
            >
              {item.q}
              <span
                aria-hidden
                className="shrink-0 text-[hsl(var(--muted))] transition-transform duration-200 group-hover:translate-x-0.5"
              >
                ↓
              </span>
            </Link>
          </Stage>
        ))}
      </ul>
    </HeroShell>
  );
}
