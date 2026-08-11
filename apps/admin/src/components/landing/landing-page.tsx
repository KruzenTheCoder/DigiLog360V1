import Link from 'next/link';
import { ArrowRight, ArrowDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Logo } from '@/components/brand/logo';
import { BRAND } from '@digilog/shared';
import { LiveTicker } from './live-ticker';
import { LiveBoard } from './live-board';
import { Reveal } from './reveal';

// ---------------------------------------------------------------------------
// Content lives as data so the markup stays readable. Every location and
// person is deliberately generic — nothing identifies a real site or officer.
// ---------------------------------------------------------------------------

const PROBLEMS = [
  {
    k: '01',
    title: 'Written from memory',
    body: 'Entries are filled in at the end of a twelve-hour shift, long after the event, with the details worn smooth.',
  },
  {
    k: '02',
    title: 'Nobody knows where anyone is',
    body: 'An officer walks into a live intrusion and the control room only finds out when they stop answering the radio.',
  },
  {
    k: '03',
    title: 'No clock on the response',
    body: "Nothing measures the gap between something happening and somebody acting on it. What isn't measured isn't managed.",
  },
  {
    k: '04',
    title: 'Evidence you cannot produce',
    body: 'Weeks later a client asks what happened. The answer is a photocopy of somebody’s handwriting — if the book can be found.',
  },
];

const PILLARS = [
  { n: '01', dot: 'bg-red-500', title: 'Report from the scene', body: 'Officers log incidents on a handset in under a minute, with photographs, voice notes and location — and no signal required.' },
  { n: '02', dot: 'bg-orange-500', title: 'A clock on everything', body: 'Severity sets a response target the moment an incident is filed. The countdown runs on its own and escalates itself when it lapses.' },
  { n: '03', dot: 'bg-sky-500', title: 'See the whole operation', body: 'A live console shows every open incident, every officer on patrol and every visitor on site — updating as it happens.' },
  { n: '04', dot: 'bg-brand', title: 'Prove the patrol', body: 'Checkpoints are verified by QR, NFC tag or GPS geofence, so presence is a record rather than a claim.' },
  { n: '05', dot: 'bg-violet-500', title: 'Review and sign off', body: 'Every incident is read by a manager and acknowledged, escalated or rejected with notes — against a real name and timestamp.' },
  { n: '06', dot: 'bg-emerald-500', title: 'Answer any question, later', body: 'One click produces a branded report with the full timeline and evidence attached, years after the shift ended.' },
];

interface Frame {
  no: string;
  time: string;
  who: string;
  title: string;
  body: string;
  chips?: string[];
  dot: string;
  ring: string;
}

const FRAMES: Frame[] = [
  {
    no: '01', time: '02:14:07', who: 'Field',
    title: 'Two figures cut the perimeter fence.',
    body: 'An officer is eleven minutes into a patrol route. A beam trips and he sees them from thirty metres — bolt cutters, no vehicle yet. He does not walk closer. He takes out his phone.',
    dot: 'bg-red-500', ring: 'ring-red-500/30',
  },
  {
    no: '02', time: '02:14:47', who: 'Mobile',
    title: 'Forty seconds to file it — with evidence.',
    body: 'Type: intrusion. Severity: critical. Two photographs and a nine-second voice note. There is no signal at the fence line, so it queues on the handset and files itself the moment the phone finds a bar.',
    chips: ['Reference issued', '2 photos · 1 voice note', 'Voice transcribed'],
    dot: 'bg-red-500', ring: 'ring-red-500/30',
  },
  {
    no: '03', time: '02:14:52', who: 'Control room',
    title: 'The board flashes before he has put the phone away.',
    body: 'The incident lands on the live board with a banner. Critical severity sets the response target — resolve within the hour, update every thirty minutes — and the countdown starts without anyone touching it.',
    chips: ['Response clock armed', 'Push + email to duty manager'],
    dot: 'bg-orange-500', ring: 'ring-orange-500/30',
  },
  {
    no: '04', time: '02:16:20', who: 'Supervisor',
    title: 'The map is why he goes home in the morning.',
    body: 'The supervisor sees his position updating every thirty seconds — right on top of the breach. One tap calls him from the same screen: withdraw to the guard house, armed response is rolling. Knowing where your people are is the whole point.',
    chips: ['Position every 30s', 'Tap-to-call from the team view'],
    dot: 'bg-sky-400', ring: 'ring-sky-400/30',
  },
  {
    no: '05', time: '02:22:41', who: 'Control room',
    title: 'Nothing waits on a phone call being answered.',
    body: 'The controller assigns the incident to the duty manager and dispatches armed response. The assignment arrives as an in-app alert, a push notification and an email that opens straight onto the incident.',
    chips: ['Assigned + notified in one action', 'Alerts deep-link to the record'],
    dot: 'bg-sky-400', ring: 'ring-sky-400/30',
  },
  {
    no: '06', time: '02:31:05', who: 'Field',
    title: 'Armed response on scene. The record keeps up.',
    body: 'The responding officer’s note goes onto the incident from a phone at the gate. It appears in the control room mid-sentence, resets the update clock and emails everyone attached to it.',
    chips: ['Update clock reset', 'Comment thread live on every screen'],
    dot: 'bg-indigo-400', ring: 'ring-indigo-400/30',
  },
  {
    no: '07', time: '03:05:41', who: 'Resolved',
    title: 'Closed at fifty-one minutes. Inside the promise.',
    body: 'Fence secured, no entry to the building, nobody hurt. The clock stops and the incident leaves the live board with its response time measured against the target it was given at 02:14.',
    chips: ['Resolved in 51m of 60m', 'Target met'],
    dot: 'bg-emerald-500', ring: 'ring-emerald-500/30',
  },
  {
    no: '08', time: '09:12', who: 'Manager',
    title: 'Signed off by a person, not a rubber stamp.',
    body: 'The duty manager reads the whole thread — photographs, transcript, every update, who did what and when — and acknowledges it with notes. That decision is stored against her name permanently.',
    chips: ['Acknowledge · escalate · reject', 'Written to the audit log'],
    dot: 'bg-indigo-400', ring: 'ring-indigo-400/30',
  },
  {
    no: '09', time: 'Any time', who: 'Evidence',
    title: 'Weeks later, the client asks.',
    body: 'One click produces a branded report: the timeline to the second, the photographs, the response, the sign-off. Not a recollection — a record that was built while it happened.',
    chips: ['Exported in one click', 'Evidence retained and searchable'],
    dot: 'bg-emerald-500', ring: 'ring-emerald-500/30',
  },
];

const CAPABILITIES = [
  { tag: 'Live board', accent: 'text-indigo-500', title: 'Incidents appear as they are logged', body: 'New incidents flash onto the control-room board with a banner, and every response badge counts down on its own.' },
  { tag: 'Officer map', accent: 'text-sky-500', title: 'Where your people are, right now', body: 'Positions land every thirty seconds while an officer is on patrol — and only while they are on patrol.' },
  { tag: 'Alerts', accent: 'text-red-500', title: 'Breaches escalate themselves', body: 'Miss a target and the platform notifies the control room, supervisor, manager and administrator — in-app, push and email.' },
  { tag: 'Offline first', accent: 'text-emerald-500', title: 'No signal is not an excuse', body: 'Incidents logged in a basement or a dead zone queue on the handset with their photographs and file themselves when coverage returns.' },
  { tag: 'Verified patrols', accent: 'text-orange-500', title: 'Presence you can prove', body: 'QR labels, NFC tags or a GPS geofence — three ways to prove an officer stood at a checkpoint, with method and distance recorded.' },
  { tag: 'Gate house', accent: 'text-amber-500', title: 'Scan the licence, not the clipboard', body: 'Vehicle disks and drivers’ licences scan straight into the visitor register, and scanning on the way out signs the right person off.' },
];

const ROLES = [
  { role: 'Officer', accent: 'text-sky-400 border-sky-400/30', lead: 'Works the site from a phone.', body: 'Clocks on, runs patrols, logs incidents, staffs the gate and hands over — signing in with an employee number and a PIN.' },
  { role: 'Supervisor', accent: 'text-emerald-400 border-emerald-400/30', lead: 'Runs the shift.', body: 'The site board, the team’s live positions, patrol oversight, and the ability to close out a patrol somebody forgot to end.' },
  { role: 'Control room', accent: 'text-indigo-300 border-indigo-300/30', lead: 'Holds the line.', body: 'Watches every open incident against its clock, logs what comes in over the radio and answers for the response.' },
  { role: 'Manager', accent: 'text-red-400 border-red-400/30', lead: 'Signs it off.', body: 'Reviews every incident — acknowledge, escalate or reject with notes — and reports on how the team actually performed.' },
  { role: 'Administrator', accent: 'text-orange-400 border-orange-400/30', lead: 'Shapes the operation.', body: 'People, sites, response targets, incident types and integrations — tuned per organisation without touching code.' },
  { role: 'Platform owner', accent: 'text-amber-400 border-amber-400/30', lead: 'Runs the platform.', body: 'Many client organisations from one deployment, each sealed off from the others, with its own branding and rules.' },
];

const BEFORE = [
  'Incidents surface at the 06:00 handover',
  'Officer locations unknown between radio calls',
  'Patrols are a signature on a sheet',
  'Response time is nobody’s number',
  'Client disputes come down to memory',
];

const AFTER = [
  'Incidents reach the control room in under a minute',
  'Every officer on patrol is on a live map',
  'Patrols are verified scans with time and place',
  'Every incident is measured against a target',
  'Disputes are answered with an exported report',
];

// ---------------------------------------------------------------------------

export function LandingPage() {
  return (
    <main className="w-full overflow-x-hidden bg-[hsl(var(--background))]">

      {/* ══ HERO ═══════════════════════════════════════════════════════ */}
      <section className="relative isolate flex min-h-[92vh] w-full flex-col overflow-hidden bg-brand-gradient text-white">
        {/* Depth: top-light, a deep corner shadow, and a slow radar sweep */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 bg-[radial-gradient(1200px_600px_at_78%_-15%,rgba(255,255,255,0.30),transparent_60%),radial-gradient(900px_500px_at_5%_110%,rgba(2,6,23,0.45),transparent_60%)]"
        />
        <div
          aria-hidden
          className="animate-radar-sweep pointer-events-none absolute -right-[22rem] -top-[26rem] h-[60rem] w-[60rem] rounded-full opacity-[0.14]"
          style={{
            background:
              'conic-gradient(from 0deg, transparent 0deg, rgba(255,255,255,0.9) 30deg, transparent 64deg)',
          }}
        />
        {/* A fine survey grid, masked so it fades out before the copy —
            texture you feel rather than notice. */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 opacity-[0.06]"
          style={{
            backgroundImage:
              'linear-gradient(to right, #fff 1px, transparent 1px), linear-gradient(to bottom, #fff 1px, transparent 1px)',
            backgroundSize: '72px 72px',
            maskImage: 'radial-gradient(120% 90% at 70% 0%, #000 20%, transparent 75%)',
            WebkitMaskImage: 'radial-gradient(120% 90% at 70% 0%, #000 20%, transparent 75%)',
          }}
        />

        {/* Nav */}
        <nav className="relative z-10 mx-auto flex w-full max-w-[100rem] items-center justify-between px-6 py-6 lg:px-14">
          <div className="min-w-0">
            <Logo className="text-2xl sm:text-3xl" onDark />
            <p className="mt-1 text-xs text-white/75">{BRAND.tagline}</p>
          </div>
          <Link href="/login">
            <Button variant="secondary" className="shadow-sm">
              Sign in <ArrowRight className="h-4 w-4" />
            </Button>
          </Link>
        </nav>

        {/* Hero body */}
        <div className="relative z-10 mx-auto flex w-full max-w-[100rem] flex-1 flex-col justify-center px-6 pb-16 pt-10 lg:px-14 lg:pb-24">
          <div className="grid items-center gap-12 xl:grid-cols-[minmax(0,1.05fr)_minmax(0,0.95fr)] xl:gap-20">
            <div>
              <p className="mb-6 inline-flex items-center gap-2 rounded-full border border-white/30 bg-white/[0.12] px-4 py-1.5 text-[0.7rem] font-bold uppercase tracking-[0.16em] backdrop-blur-sm">
                <span className="relative flex h-2 w-2">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-white opacity-75" />
                  <span className="relative inline-flex h-2 w-2 rounded-full bg-white" />
                </span>
                Live from the first second
              </p>

              <h1 className="max-w-[15ch] text-[clamp(2.5rem,7vw,5.5rem)] font-extrabold leading-[0.98] tracking-[-0.04em]">
                Know what happened.
                <span className="block font-light text-white/85">While it is still</span>
                happening.
              </h1>

              <p className="mt-8 max-w-[54ch] text-lg leading-relaxed text-white/85 lg:text-xl">
                Security runs on information that arrives too late. {BRAND.name} puts every
                incident, patrol, visitor and key on one live system — the moment it happens,
                with the evidence attached.
              </p>

              <div className="mt-10 flex flex-wrap items-center gap-4">
                <Link href="/login">
                  <Button variant="secondary" size="lg" className="shadow-lg">
                    Sign in to the console <ArrowRight className="h-4 w-4" />
                  </Button>
                </Link>
                <a
                  href="#problem"
                  className="inline-flex h-12 items-center gap-2 rounded-lg border border-white/35 px-6 text-base font-medium text-white transition hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/60"
                >
                  See how it works <ArrowDown className="h-4 w-4" />
                </a>
              </div>
            </div>

            {/* Live readout — the realtime promise, shown not claimed */}
            <div className="xl:justify-self-end xl:pl-6">
              <LiveTicker />
            </div>
          </div>
        </div>

        {/* Stat band pinned to the base of the hero */}
        <div className="relative z-10 border-t border-white/20 bg-black/10 backdrop-blur-sm">
          <dl className="mx-auto grid w-full max-w-[100rem] grid-cols-2 gap-y-8 px-6 py-10 lg:grid-cols-4 lg:px-14">
            {/* Rendered statically, not counted up: these are small factual
                figures, and a count-up reads "<21s" mid-flight — briefly
                claiming a faster number than the truth. */}
            {[
              { v: '<60s', l: 'Field to control room' },
              { v: '3', l: 'Ways to prove a patrol' },
              { v: '6', l: 'Roles, one platform' },
              { v: '0', l: 'Signal needed to report' },
            ].map((s, i) => (
              <div
                key={s.l}
                // Hairline rules between figures on wide screens; none on the
                // first, and none at all once the grid wraps to two columns.
                className={i > 0 ? 'lg:border-l lg:border-white/20 lg:pl-8' : ''}
              >
                <dt className="text-[clamp(2rem,4vw,3.25rem)] font-extrabold leading-none tracking-tight tabular-nums">
                  {s.v}
                </dt>
                <dd className="mt-2 text-[0.72rem] font-semibold uppercase tracking-[0.14em] text-white/75">
                  {s.l}
                </dd>
              </div>
            ))}
          </dl>
        </div>
      </section>

      {/* ══ PROBLEM ════════════════════════════════════════════════════ */}
      <section id="problem" className="w-full scroll-mt-4 bg-slate-950 py-24 text-white lg:py-36">
        <div className="mx-auto w-full max-w-[100rem] px-6 lg:px-14">
          <Reveal>
            <p className="text-[0.72rem] font-bold uppercase tracking-[0.22em] text-red-400">
              The problem
            </p>
            <h2 className="mt-5 max-w-[18ch] text-[clamp(2.25rem,5.5vw,4.5rem)] font-extrabold leading-[1.02] tracking-[-0.035em]">
              A paper book cannot raise the alarm.
            </h2>
            <p className="mt-7 max-w-[62ch] text-lg leading-relaxed text-slate-400 lg:text-xl">
              The occurrence book has run security operations for a century. It has one fatal
              property: it only speaks when somebody opens it — and by then the night is over.
            </p>
          </Reveal>

          <div className="mt-16 grid gap-px overflow-hidden rounded-2xl bg-white/10 sm:grid-cols-2 lg:mt-20 lg:grid-cols-4">
            {PROBLEMS.map((p, i) => (
              <Reveal key={p.k} delay={i * 90}>
                <div className="h-full bg-slate-950 p-7 lg:p-9">
                  <span className="font-mono text-xs font-bold tracking-widest text-red-400/70">
                    {p.k}
                  </span>
                  <h3 className="mb-3 mt-4 text-xl font-bold tracking-tight">{p.title}</h3>
                  <p className="text-[0.95rem] leading-relaxed text-slate-400">{p.body}</p>
                </div>
              </Reveal>
            ))}
          </div>

          <Reveal>
            <p className="mt-14 max-w-[70ch] border-l-2 border-red-500 pl-6 text-lg leading-relaxed text-slate-300 lg:text-xl">
              <b className="text-white">The cost is not paperwork.</b> It is an officer standing
              next to a threat nobody in the control room knows about, and a contract that cannot
              be defended when the client asks for proof.
            </p>
          </Reveal>
        </div>
      </section>

      {/* ══ SOLUTION ═══════════════════════════════════════════════════ */}
      <section className="w-full bg-[hsl(var(--background))] py-24 lg:py-36">
        <div className="mx-auto w-full max-w-[100rem] px-6 lg:px-14">
          <Reveal>
            <p className="text-[0.72rem] font-bold uppercase tracking-[0.22em] text-brand">
              The solution
            </p>
            <h2 className="mt-5 max-w-[20ch] text-[clamp(2.25rem,5.5vw,4.5rem)] font-extrabold leading-[1.02] tracking-[-0.035em]">
              Capture it at the source. Everything else follows.
            </h2>
            <p className="mt-7 max-w-[64ch] text-lg leading-relaxed text-[hsl(var(--muted))] lg:text-xl">
              {BRAND.name} replaces the occurrence book, the patrol clock, the visitor register and
              the key ledger with one platform — a phone in the field, a live console in the control
              room, and a database that never forgets.
            </p>
          </Reveal>

          <div className="mt-16 grid gap-6 sm:grid-cols-2 lg:mt-20 lg:grid-cols-3 lg:gap-8">
            {PILLARS.map((p, i) => (
              <Reveal key={p.n} delay={i * 70}>
                <div className="group h-full rounded-2xl border bg-[hsl(var(--surface))] p-8 shadow-sm transition duration-300 hover:-translate-y-1 hover:shadow-xl">
                  <div className="flex items-center gap-3">
                    <span className={`h-2.5 w-2.5 rounded-full ${p.dot}`} />
                    <span className="font-mono text-xs font-bold tracking-widest text-[hsl(var(--muted))]">
                      {p.n}
                    </span>
                  </div>
                  <h3 className="mb-3 mt-5 text-xl font-bold tracking-tight">{p.title}</h3>
                  <p className="leading-relaxed text-[hsl(var(--muted))]">{p.body}</p>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ══ STORY ══════════════════════════════════════════════════════ */}
      <section className="w-full bg-slate-950 py-24 text-white lg:py-36">
        <div className="mx-auto w-full max-w-[100rem] px-6 lg:px-14">
          <Reveal>
            <p className="text-[0.72rem] font-bold uppercase tracking-[0.22em] text-amber-400">
              One night, minute by minute
            </p>
            <h2 className="mt-5 max-w-[20ch] text-[clamp(2.25rem,5.5vw,4.5rem)] font-extrabold leading-[1.02] tracking-[-0.035em]">
              A perimeter breach, end to end.
            </h2>
            <p className="mt-7 max-w-[64ch] text-lg leading-relaxed text-slate-400 lg:text-xl">
              Every timestamp below is recorded by the platform itself. Nobody types these in
              afterwards — which is exactly the point.
            </p>
          </Reveal>

          {/* Timeline: rail on the left for small screens, centred and
              alternating from large up. */}
          <div className="relative mt-16 lg:mt-24">
            <div
              aria-hidden
              className="absolute bottom-0 left-[7px] top-2 w-px bg-gradient-to-b from-red-500 via-sky-400 to-emerald-500 opacity-40 lg:left-1/2 lg:-translate-x-1/2"
            />

            <div className="flex flex-col gap-10 lg:gap-16">
              {FRAMES.map((f, i) => {
                const right = i % 2 === 1;
                return (
                  <div
                    key={f.no}
                    className="relative pl-10 lg:grid lg:grid-cols-2 lg:gap-16 lg:pl-0"
                  >
                    {/* Node on the rail */}
                    <span
                      aria-hidden
                      className={`absolute left-0 top-2 h-4 w-4 rounded-full ring-4 ${f.dot} ${f.ring} lg:left-1/2 lg:-translate-x-1/2`}
                    />

                    {/* Alternation is carried by which column the card sits
                        in — the prose stays left-aligned either side, because
                        ragged-left body text is measurably harder to read. */}
                    <Reveal className={right ? 'lg:col-start-2' : 'lg:col-start-1 lg:row-start-1'}>
                      <article className="rounded-2xl border border-white/10 bg-white/[0.04] p-6 backdrop-blur-sm transition duration-300 hover:border-white/20 hover:bg-white/[0.07] lg:p-8">
                        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                          <span className="font-mono text-[0.7rem] font-bold tracking-widest text-slate-500">
                            FRAME {f.no}
                          </span>
                          <span className="font-mono text-lg font-extrabold tabular-nums tracking-tight">
                            {f.time}
                          </span>
                          <span className="text-[0.68rem] font-bold uppercase tracking-[0.12em] text-slate-500">
                            {f.who}
                          </span>
                        </div>

                        <h3 className="mb-3 mt-4 text-xl font-bold leading-snug tracking-tight lg:text-2xl">
                          {f.title}
                        </h3>
                        <p className="leading-relaxed text-slate-400">{f.body}</p>

                        {f.chips && (
                          <div className="mt-5 flex flex-wrap gap-2">
                            {f.chips.map((c) => (
                              <span
                                key={c}
                                className="rounded-md border border-white/15 bg-white/[0.06] px-2.5 py-1 font-mono text-[0.72rem] font-medium text-slate-300"
                              >
                                {c}
                              </span>
                            ))}
                          </div>
                        )}
                      </article>
                    </Reveal>
                  </div>
                );
              })}
            </div>
          </div>

          {/* The counterfactual */}
          <Reveal>
            <div className="mt-20 rounded-2xl border border-dashed border-white/15 p-8 lg:mt-28 lg:p-12">
              <p className="text-[0.72rem] font-bold uppercase tracking-[0.2em] text-slate-500">
                The same night, in the paper book
              </p>
              <p className="mt-5 max-w-[80ch] text-lg leading-relaxed text-slate-400">
                <span className="font-mono font-bold text-slate-200">02:14</span> — nobody knows.{' '}
                <span className="font-mono font-bold text-slate-200">02:45</span> — nobody knows.{' '}
                <span className="font-mono font-bold text-slate-200">06:00</span> — the outgoing
                officer writes <em className="text-slate-300">“suspicious persons at fence, chased
                away”</em> from memory, in a book that stays in a drawer at the guard house. The
                supervisor never knew an officer was standing thirty metres from two men with bolt
                cutters. And when the client asks weeks later, that one line is the entire record.
              </p>
            </div>
          </Reveal>
        </div>
      </section>

      {/* ══ CONSOLE SHOWCASE ═══════════════════════════════════════════ */}
      <section
        id="console"
        className="relative w-full scroll-mt-4 overflow-hidden bg-slate-900 py-24 text-white lg:py-36"
      >
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 bg-[radial-gradient(1000px_500px_at_50%_0%,rgba(102,126,234,0.25),transparent_65%)]"
        />
        <div className="relative mx-auto w-full max-w-[100rem] px-6 lg:px-14">
          <Reveal>
            <div className="mx-auto max-w-[52rem] text-center">
              <p className="text-[0.72rem] font-bold uppercase tracking-[0.22em] text-indigo-300">
                The console
              </p>
              <h2 className="mt-5 text-[clamp(2.25rem,5.5vw,4.5rem)] font-extrabold leading-[1.02] tracking-[-0.035em]">
                The screen the control room watches.
              </h2>
              <p className="mx-auto mt-7 max-w-[58ch] text-lg leading-relaxed text-slate-400 lg:text-xl">
                Open incidents ranked by how close they are to breaching. The clocks below are
                running right now — and a new critical will arrive while you read this.
              </p>
            </div>
          </Reveal>

          {/* The board, presented as a screen floating on the dark band */}
          <Reveal delay={120}>
            <div className="mx-auto mt-16 max-w-[80rem] lg:mt-20">
              <div className="overflow-hidden rounded-2xl border border-white/10 bg-[hsl(var(--surface))] shadow-[0_40px_120px_-20px_rgba(0,0,0,0.7)]">
                <div className="flex items-center gap-2 border-b bg-[hsl(var(--background))] px-5 py-3.5">
                  <span className="h-3 w-3 rounded-full bg-red-400/70" />
                  <span className="h-3 w-3 rounded-full bg-amber-400/70" />
                  <span className="h-3 w-3 rounded-full bg-emerald-400/70" />
                  <span className="ml-3 font-mono text-xs font-semibold uppercase tracking-widest text-[hsl(var(--muted))]">
                    Live Occurrences · All sites
                  </span>
                  <span className="ml-auto flex items-center gap-2 text-[0.66rem] font-bold uppercase tracking-[0.14em] text-emerald-500">
                    <span className="relative flex h-2 w-2">
                      <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-500 opacity-75" />
                      <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
                    </span>
                    Realtime
                  </span>
                </div>
                <div className="p-5 lg:p-7">
                  <LiveBoard />
                </div>
              </div>
              <p className="mt-5 text-center text-sm text-slate-500">
                Sample data — the layout, clocks and behaviour are the real thing.
              </p>
            </div>
          </Reveal>
        </div>
      </section>

      {/* ══ CAPABILITIES ═══════════════════════════════════════════════ */}
      <section className="w-full bg-[hsl(var(--background))] py-24 lg:py-36">
        <div className="mx-auto w-full max-w-[100rem] px-6 lg:px-14">
          <Reveal>
            <p className="text-[0.72rem] font-bold uppercase tracking-[0.22em] text-sky-500">
              Realtime, meant literally
            </p>
            <h2 className="mt-5 max-w-[18ch] text-[clamp(2.25rem,5.5vw,4.5rem)] font-extrabold leading-[1.02] tracking-[-0.035em]">
              Nothing here waits to be asked.
            </h2>
            <p className="mt-7 max-w-[62ch] text-lg leading-relaxed text-[hsl(var(--muted))] lg:text-xl">
              The database pushes changes to every screen the moment they are written. No polling,
              no refresh button.
            </p>
          </Reveal>

          <div className="mt-16 grid gap-6 sm:grid-cols-2 lg:mt-20 lg:grid-cols-3 lg:gap-8">
            {CAPABILITIES.map((c, i) => (
              <Reveal key={c.tag} delay={i * 70}>
                <div className="h-full rounded-2xl border bg-[hsl(var(--surface))] p-8 shadow-sm transition duration-300 hover:-translate-y-1 hover:shadow-xl">
                  <p className={`text-[0.7rem] font-bold uppercase tracking-[0.16em] ${c.accent}`}>
                    {c.tag}
                  </p>
                  <h3 className="mb-3 mt-4 text-xl font-bold leading-snug tracking-tight">
                    {c.title}
                  </h3>
                  <p className="leading-relaxed text-[hsl(var(--muted))]">{c.body}</p>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ══ ROLES ══════════════════════════════════════════════════════ */}
      <section className="w-full bg-slate-950 py-24 text-white lg:py-36">
        <div className="mx-auto w-full max-w-[100rem] px-6 lg:px-14">
          <Reveal>
            <p className="text-[0.72rem] font-bold uppercase tracking-[0.22em] text-indigo-300">
              Who it is for
            </p>
            <h2 className="mt-5 max-w-[18ch] text-[clamp(2.25rem,5.5vw,4.5rem)] font-extrabold leading-[1.02] tracking-[-0.035em]">
              Six roles, one version of the truth.
            </h2>
          </Reveal>

          <div className="mt-16 grid gap-6 md:grid-cols-2 lg:mt-20 lg:grid-cols-3 lg:gap-8">
            {ROLES.map((r, i) => (
              <Reveal key={r.role} delay={i * 60}>
                <div className="h-full rounded-2xl border border-white/10 bg-white/[0.04] p-7 transition duration-300 hover:border-white/20 hover:bg-white/[0.07]">
                  <span
                    className={`inline-block rounded-full border px-3 py-1 text-[0.72rem] font-bold uppercase tracking-[0.1em] ${r.accent}`}
                  >
                    {r.role}
                  </span>
                  <p className="mt-5 text-lg font-bold leading-snug">{r.lead}</p>
                  <p className="mt-2 leading-relaxed text-slate-400">{r.body}</p>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ══ OUTCOME ════════════════════════════════════════════════════ */}
      <section className="w-full bg-[hsl(var(--background))] py-24 lg:py-36">
        <div className="mx-auto w-full max-w-[100rem] px-6 lg:px-14">
          <Reveal>
            <p className="text-[0.72rem] font-bold uppercase tracking-[0.22em] text-emerald-600">
              The outcome
            </p>
            <h2 className="mt-5 max-w-[22ch] text-[clamp(2.25rem,5.5vw,4.5rem)] font-extrabold leading-[1.02] tracking-[-0.035em]">
              From a book nobody reads to a record nobody can dispute.
            </h2>
          </Reveal>

          <div className="mt-16 grid gap-6 lg:mt-20 lg:grid-cols-2 lg:gap-10">
            <Reveal>
              <div className="h-full rounded-2xl border border-red-500/25 bg-red-500/[0.04] p-8 lg:p-10">
                <p className="text-[0.72rem] font-bold uppercase tracking-[0.16em] text-red-600">
                  Before
                </p>
                <ul className="mt-6 space-y-4">
                  {BEFORE.map((b) => (
                    <li key={b} className="flex gap-3 text-[hsl(var(--muted))]">
                      <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-red-500/60" />
                      <span className="text-[1.02rem] leading-relaxed">{b}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </Reveal>

            <Reveal delay={120}>
              <div className="h-full rounded-2xl border border-emerald-500/25 bg-emerald-500/[0.04] p-8 lg:p-10">
                <p className="text-[0.72rem] font-bold uppercase tracking-[0.16em] text-emerald-600">
                  After
                </p>
                <ul className="mt-6 space-y-4">
                  {AFTER.map((a) => (
                    <li key={a} className="flex gap-3">
                      <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-500" />
                      <span className="text-[1.02rem] font-medium leading-relaxed">{a}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </Reveal>
          </div>
        </div>
      </section>

      {/* ══ CLOSE ══════════════════════════════════════════════════════ */}
      <section className="relative w-full overflow-hidden bg-brand-gradient py-24 text-white lg:py-36">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 bg-[radial-gradient(900px_450px_at_50%_-20%,rgba(255,255,255,0.25),transparent_60%)]"
        />
        <div className="relative mx-auto w-full max-w-[64rem] px-6 text-center lg:px-14">
          <h2 className="text-[clamp(2.25rem,5.5vw,4.25rem)] font-extrabold leading-[1.03] tracking-[-0.035em]">
            Make every incident answerable.
          </h2>
          <p className="mx-auto mt-7 max-w-[56ch] text-lg leading-relaxed text-white/85 lg:text-xl">
            Who was there, what they saw, when they acted and what came of it — captured while it
            happened, provable years later, across every site and every shift.
          </p>
          <Link href="/login" className="mt-10 inline-block">
            <Button variant="secondary" size="lg" className="shadow-xl">
              Sign in to the console <ArrowRight className="h-4 w-4" />
            </Button>
          </Link>
        </div>
      </section>

      <footer className="w-full bg-slate-950 py-10 text-slate-500">
        <div className="mx-auto flex w-full max-w-[100rem] flex-wrap items-center justify-between gap-4 px-6 text-sm lg:px-14">
          <span className="flex items-center gap-2">
            <Logo className="text-lg" onDark />
            <span className="text-slate-500">— {BRAND.tagline}</span>
          </span>
          <span>Proprietary &amp; confidential</span>
        </div>
      </footer>
    </main>
  );
}
