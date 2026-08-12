import Link from 'next/link';
import { ArrowRight, ArrowDown, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Logo } from '@/components/brand/logo';
import { BRAND, SLA_CONFIG, SEVERITY_LABELS, SEVERITY_COLORS, SEVERITIES } from '@digilog/shared';
import { HeroBoard } from './hero-board';
import { LiveBoard } from './live-board';
import { Reveal } from './reveal';

// ---------------------------------------------------------------------------
// Content lives as data so the markup stays readable. Every location and
// person is deliberately generic — nothing identifies a real site or officer.
// ---------------------------------------------------------------------------

const HERO_CHIPS = ['Works offline', 'QR · NFC · GPS patrols', 'Multi-site', 'Audit trail on everything'];

const PROBLEMS = [
  { k: '01', title: 'Written from memory', body: 'Entries are filled in at the end of a twelve-hour shift, long after the event, with the details worn smooth.' },
  { k: '02', title: 'Nobody knows where anyone is', body: 'An officer walks into a live intrusion and the control room only finds out when they stop answering the radio.' },
  { k: '03', title: 'No clock on the response', body: "Nothing measures the gap between something happening and somebody acting on it. What isn't measured isn't managed." },
  { k: '04', title: 'Evidence you cannot produce', body: 'Weeks later a client asks what happened. The answer is a photocopy of somebody’s handwriting — if the book can be found.' },
];

const PILLARS = [
  { n: '01', dot: 'bg-red-500', title: 'Report from the scene', body: 'Officers log incidents on a handset in under a minute, with photographs, voice notes and location — and no signal required.' },
  { n: '02', dot: 'bg-orange-500', title: 'A clock on everything', body: 'Severity sets a response target the moment an incident is filed. The countdown runs on its own and escalates itself when it lapses.' },
  { n: '03', dot: 'bg-sky-500', title: 'See the whole operation', body: 'A live console shows every open incident, every officer on patrol and every visitor on site — updating as it happens.' },
  { n: '04', dot: 'bg-brand', title: 'Prove the patrol', body: 'Checkpoints are verified by QR, NFC tag or GPS geofence, so presence is a record rather than a claim.' },
  { n: '05', dot: 'bg-violet-500', title: 'Review and sign off', body: 'Every incident is read by a manager and acknowledged, escalated or rejected with notes — against a real name and timestamp.' },
  { n: '06', dot: 'bg-emerald-500', title: 'Answer any question, later', body: 'One click produces a branded report with the full timeline and evidence attached, years after the shift ended.' },
];

const MODULES = [
  { name: 'Occurrences', body: 'Numbered incidents with severity, photographs, voice notes, comments and a full update timeline.' },
  { name: 'Patrols & checkpoints', body: 'Routes, schedules and verified scans by QR label, NFC tag or GPS geofence — with late-patrol alerts.' },
  { name: 'Officer map', body: 'Live positions every thirty seconds while on patrol, with tap-to-call straight from the team view.' },
  { name: 'Visitor register', body: 'Licence-disk and driver’s-licence scanning in, scan-to-sign-out on the way back through the gate.' },
  { name: 'Key register', body: 'Every hand-over captured against a name and ID number, with the full history kept per key.' },
  { name: 'Shifts & handovers', body: 'Clock-in and clock-out with live counters, plus signed handovers the incoming officer must acknowledge.' },
  { name: 'Tasks', body: 'Follow-up work linked to the incident that caused it, with its own owner, due date and update thread.' },
  { name: 'Reports & exports', body: 'Branded PDF reports, evidence galleries and CSV exports for client packs and disputes.' },
];

interface Frame {
  no: string; time: string; who: string; title: string; body: string;
  chips?: string[]; dot: string; ring: string;
}

const FRAMES: Frame[] = [
  { no: '01', time: '02:14:07', who: 'Field', title: 'Two figures cut the perimeter fence.', body: 'An officer is eleven minutes into a patrol route. A beam trips and he sees them from thirty metres — bolt cutters, no vehicle yet. He does not walk closer. He takes out his phone.', dot: 'bg-red-500', ring: 'ring-red-500/30' },
  { no: '02', time: '02:14:47', who: 'Mobile', title: 'Forty seconds to file it — with evidence.', body: 'Type: intrusion. Severity: critical. Two photographs and a nine-second voice note. There is no signal at the fence line, so it queues on the handset and files itself the moment the phone finds a bar.', chips: ['Reference issued', '2 photos · 1 voice note', 'Voice transcribed'], dot: 'bg-red-500', ring: 'ring-red-500/30' },
  { no: '03', time: '02:14:52', who: 'Control room', title: 'The board flashes before he has put the phone away.', body: 'The incident lands on the live board with a banner. Critical severity sets the response target — resolve within the hour, update every thirty minutes — and the countdown starts without anyone touching it.', chips: ['Response clock armed', 'Push + email to duty manager'], dot: 'bg-orange-500', ring: 'ring-orange-500/30' },
  { no: '04', time: '02:16:20', who: 'Supervisor', title: 'The map is why he goes home in the morning.', body: 'The supervisor sees his position updating every thirty seconds — right on top of the breach. One tap calls him from the same screen: withdraw to the guard house, armed response is rolling. Knowing where your people are is the whole point.', chips: ['Position every 30s', 'Tap-to-call from the team view'], dot: 'bg-sky-400', ring: 'ring-sky-400/30' },
  { no: '05', time: '02:22:41', who: 'Control room', title: 'Nothing waits on a phone call being answered.', body: 'The controller assigns the incident to the duty manager and dispatches armed response. The assignment arrives as an in-app alert, a push notification and an email that opens straight onto the incident.', chips: ['Assigned + notified in one action', 'Alerts deep-link to the record'], dot: 'bg-sky-400', ring: 'ring-sky-400/30' },
  { no: '06', time: '02:31:05', who: 'Field', title: 'Armed response on scene. The record keeps up.', body: 'The responding officer’s note goes onto the incident from a phone at the gate. It appears in the control room mid-sentence, resets the update clock and emails everyone attached to it.', chips: ['Update clock reset', 'Comment thread live on every screen'], dot: 'bg-indigo-400', ring: 'ring-indigo-400/30' },
  { no: '07', time: '03:05:41', who: 'Resolved', title: 'Closed at fifty-one minutes. Inside the promise.', body: 'Fence secured, no entry to the building, nobody hurt. The clock stops and the incident leaves the live board with its response time measured against the target it was given at 02:14.', chips: ['Resolved in 51m of 60m', 'Target met'], dot: 'bg-emerald-500', ring: 'ring-emerald-500/30' },
  { no: '08', time: '09:12', who: 'Manager', title: 'Signed off by a person, not a rubber stamp.', body: 'The duty manager reads the whole thread — photographs, transcript, every update, who did what and when — and acknowledges it with notes. That decision is stored against her name permanently.', chips: ['Acknowledge · escalate · reject', 'Written to the audit log'], dot: 'bg-indigo-400', ring: 'ring-indigo-400/30' },
  { no: '09', time: 'Any time', who: 'Evidence', title: 'Weeks later, the client asks.', body: 'One click produces a branded report: the timeline to the second, the photographs, the response, the sign-off. Not a recollection — a record that was built while it happened.', chips: ['Exported in one click', 'Evidence retained and searchable'], dot: 'bg-emerald-500', ring: 'ring-emerald-500/30' },
];

const FIELD_APP = [
  'Signs in with an employee number and a four-digit PIN — no passwords in the dark.',
  'Logs an incident in under a minute with photographs and a voice note that is transcribed for you.',
  'Queues everything on the handset when there is no signal, and files it the moment coverage returns.',
  'Scans checkpoints by QR label, NFC tag or GPS geofence, recording method and distance.',
  'Runs the gate house: licence scanning in, scan-to-sign-out, and the key register.',
  'Clocks shifts and writes a signed handover the incoming officer has to acknowledge.',
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

const PLATFORM = [
  { title: 'Separated by tenant', body: 'Every organisation’s data is isolated at the database level, not by a filter in the application. One deployment serves many clients without them ever meeting.' },
  { title: 'An audit trail you cannot edit', body: 'Sign-ins, role changes, manager decisions and configuration changes are written with the actor, their role, the target and a timestamp.' },
  { title: 'Access that fits the job', body: 'Six ranked roles plus a per-organisation capability grid, so a client can be given exactly the screens they bought — and nothing else.' },
  { title: 'Accounts held properly', body: 'Passwords with optional two-factor for the console, hashed PINs with lockout for the field, and tokens stored only as hashes.' },
  { title: 'It talks to your other systems', body: 'Signed outbound webhooks and organisation-scoped API tokens, so incidents can reach your ticketing, monitoring or reporting stack.' },
  { title: 'Built to keep running', body: 'Watchdogs sweep for breached targets and missed patrols on a schedule, and alert emails retry until they are delivered or recorded as failed.' },
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

function targetLabel(hours: number) {
  if (hours >= 24 && hours % 24 === 0) {
    const days = hours / 24;
    return days === 1 ? '24 hours' : `${days} days`;
  }
  return hours === 1 ? '1 hour' : `${hours} hours`;
}

function intervalLabel(minutes: number) {
  if (minutes >= 60 && minutes % 60 === 0) {
    const hours = minutes / 60;
    if (hours >= 24 && hours % 24 === 0) return `${hours / 24} day`;
    return hours === 1 ? 'hourly' : `every ${hours} hours`;
  }
  return `every ${minutes} min`;
}

// ---------------------------------------------------------------------------

export function LandingPage() {
  return (
    <main className="w-full overflow-x-hidden bg-[hsl(var(--background))]">

      {/* ══ HERO ═══════════════════════════════════════════════════════ */}
      <section className="relative isolate w-full overflow-hidden bg-brand-gradient text-white">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 bg-[radial-gradient(1200px_600px_at_78%_-15%,rgba(255,255,255,0.30),transparent_60%),radial-gradient(900px_500px_at_5%_110%,rgba(2,6,23,0.45),transparent_60%)]"
        />
        <div
          aria-hidden
          className="animate-radar-sweep pointer-events-none absolute -right-[22rem] -top-[26rem] h-[60rem] w-[60rem] rounded-full opacity-[0.14]"
          style={{ background: 'conic-gradient(from 0deg, transparent 0deg, rgba(255,255,255,0.9) 30deg, transparent 64deg)' }}
        />
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 opacity-[0.06]"
          style={{
            backgroundImage: 'linear-gradient(to right, #fff 1px, transparent 1px), linear-gradient(to bottom, #fff 1px, transparent 1px)',
            backgroundSize: '72px 72px',
            maskImage: 'radial-gradient(120% 90% at 70% 0%, #000 20%, transparent 75%)',
            WebkitMaskImage: 'radial-gradient(120% 90% at 70% 0%, #000 20%, transparent 75%)',
          }}
        />

        <nav className="relative z-10 mx-auto flex w-full max-w-[92rem] items-center justify-between gap-4 px-5 py-5 sm:px-8 lg:px-12">
          <div className="min-w-0">
            <Logo className="text-xl sm:text-2xl" onDark />
            <p className="mt-0.5 truncate text-[0.7rem] text-white/75 sm:text-xs">{BRAND.tagline}</p>
          </div>
          <Link href="/login" className="shrink-0">
            <Button variant="secondary" className="shadow-sm">
              Sign in <ArrowRight className="h-4 w-4" />
            </Button>
          </Link>
        </nav>

        <div className="relative z-10 mx-auto w-full max-w-[92rem] px-5 pb-12 pt-6 sm:px-8 lg:px-12 lg:pb-16 lg:pt-10">
          <div className="grid items-center gap-10 lg:grid-cols-[minmax(0,1.08fr)_minmax(0,0.92fr)] lg:gap-14">
            <div>
              <p className="mb-5 inline-flex items-center gap-2 rounded-full border border-white/30 bg-white/[0.12] px-3.5 py-1.5 text-[0.68rem] font-bold uppercase tracking-[0.16em] backdrop-blur-sm">
                <span className="relative flex h-2 w-2">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-white opacity-75" />
                  <span className="relative inline-flex h-2 w-2 rounded-full bg-white" />
                </span>
                Live from the first second
              </p>

              <h1 className="max-w-[16ch] text-[clamp(2.25rem,5.4vw,4.25rem)] font-extrabold leading-[1.02] tracking-[-0.035em]">
                Know what happened.
                <span className="block font-light text-white/85">While it is still</span>
                happening.
              </h1>

              <p className="mt-6 max-w-[56ch] text-base leading-relaxed text-white/85 lg:text-lg">
                {BRAND.name} replaces the occurrence book, the patrol clock, the visitor register
                and the key ledger with one live system — so an incident on a dark perimeter reaches
                the control room while it is still happening, with the evidence already attached.
              </p>

              <div className="mt-7 flex flex-wrap items-center gap-3">
                <Link href="/login">
                  <Button variant="secondary" size="lg" className="shadow-lg">
                    Sign in to the console <ArrowRight className="h-4 w-4" />
                  </Button>
                </Link>
                <a
                  href="#problem"
                  className="inline-flex h-12 items-center gap-2 rounded-lg border border-white/35 px-5 text-base font-medium text-white transition hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/60"
                >
                  See how it works <ArrowDown className="h-4 w-4" />
                </a>
              </div>

              <ul className="mt-7 flex flex-wrap gap-x-5 gap-y-2">
                {HERO_CHIPS.map((c) => (
                  <li key={c} className="flex items-center gap-1.5 text-sm text-white/80">
                    <Check className="h-4 w-4 shrink-0 text-white/70" />
                    {c}
                  </li>
                ))}
              </ul>
            </div>

            <div className="lg:justify-self-end lg:pl-4">
              <HeroBoard />
            </div>
          </div>
        </div>

        <div className="relative z-10 border-t border-white/20 bg-black/10 backdrop-blur-sm">
          <dl className="mx-auto grid w-full max-w-[92rem] grid-cols-2 gap-y-6 px-5 py-7 sm:px-8 lg:grid-cols-4 lg:px-12">
            {[
              { v: '<60s', l: 'Field to control room' },
              { v: '3', l: 'Ways to prove a patrol' },
              { v: '6', l: 'Roles, one platform' },
              { v: '0', l: 'Signal needed to report' },
            ].map((s, i) => (
              <div key={s.l} className={i > 0 ? 'lg:border-l lg:border-white/20 lg:pl-8' : ''}>
                <dt className="text-[clamp(1.6rem,3vw,2.5rem)] font-extrabold leading-none tracking-tight tabular-nums">
                  {s.v}
                </dt>
                <dd className="mt-1.5 text-[0.68rem] font-semibold uppercase tracking-[0.14em] text-white/75">
                  {s.l}
                </dd>
              </div>
            ))}
          </dl>
        </div>
      </section>

      {/* ══ PROBLEM ════════════════════════════════════════════════════ */}
      <section id="problem" className="w-full scroll-mt-2 bg-slate-950 py-16 text-white lg:py-24">
        <div className="mx-auto w-full max-w-[92rem] px-5 sm:px-8 lg:px-12">
          <Reveal>
            <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:items-end lg:gap-16">
              <div>
                <p className="text-[0.7rem] font-bold uppercase tracking-[0.22em] text-red-400">The problem</p>
                <h2 className="mt-4 max-w-[17ch] text-[clamp(1.9rem,4.2vw,3.4rem)] font-extrabold leading-[1.05] tracking-[-0.03em]">
                  A paper book cannot raise the alarm.
                </h2>
              </div>
              <p className="text-base leading-relaxed text-slate-400 lg:text-lg">
                The occurrence book has run security operations for a century. It has one fatal
                property: it only speaks when somebody opens it — and by then the night is over.
                Everything below follows from that single flaw.
              </p>
            </div>
          </Reveal>

          <div className="mt-10 grid gap-px overflow-hidden rounded-2xl bg-white/10 sm:grid-cols-2 lg:mt-14 lg:grid-cols-4">
            {PROBLEMS.map((p, i) => (
              <Reveal key={p.k} delay={i * 80}>
                <div className="h-full bg-slate-950 p-6 lg:p-7">
                  <span className="font-mono text-xs font-bold tracking-widest text-red-400/70">{p.k}</span>
                  <h3 className="mb-2 mt-3 text-lg font-bold tracking-tight">{p.title}</h3>
                  <p className="text-sm leading-relaxed text-slate-400">{p.body}</p>
                </div>
              </Reveal>
            ))}
          </div>

          <Reveal>
            <p className="mt-10 max-w-[74ch] border-l-2 border-red-500 pl-5 text-base leading-relaxed text-slate-300 lg:text-lg">
              <b className="text-white">The cost is not paperwork.</b> It is an officer standing next
              to a threat nobody in the control room knows about, and a contract that cannot be
              defended when the client asks for proof.
            </p>
          </Reveal>
        </div>
      </section>

      {/* ══ SOLUTION ═══════════════════════════════════════════════════ */}
      <section className="w-full bg-[hsl(var(--background))] py-16 lg:py-24">
        <div className="mx-auto w-full max-w-[92rem] px-5 sm:px-8 lg:px-12">
          <Reveal>
            <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:items-end lg:gap-16">
              <div>
                <p className="text-[0.7rem] font-bold uppercase tracking-[0.22em] text-brand">The solution</p>
                <h2 className="mt-4 max-w-[19ch] text-[clamp(1.9rem,4.2vw,3.4rem)] font-extrabold leading-[1.05] tracking-[-0.03em]">
                  Capture it at the source. Everything else follows.
                </h2>
              </div>
              <p className="text-base leading-relaxed text-[hsl(var(--muted))] lg:text-lg">
                A phone in the field, a live console in the control room, and one database that never
                forgets. Six things change the moment it is running.
              </p>
            </div>
          </Reveal>

          <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:mt-14 lg:grid-cols-3 lg:gap-6">
            {PILLARS.map((p, i) => (
              <Reveal key={p.n} delay={i * 60}>
                <div className="h-full rounded-2xl border bg-[hsl(var(--surface))] p-6 shadow-sm transition duration-300 hover:-translate-y-1 hover:shadow-xl">
                  <div className="flex items-center gap-2.5">
                    <span className={`h-2.5 w-2.5 rounded-full ${p.dot}`} />
                    <span className="font-mono text-xs font-bold tracking-widest text-[hsl(var(--muted))]">{p.n}</span>
                  </div>
                  <h3 className="mb-2 mt-4 text-lg font-bold tracking-tight">{p.title}</h3>
                  <p className="text-[0.95rem] leading-relaxed text-[hsl(var(--muted))]">{p.body}</p>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ══ MODULES ════════════════════════════════════════════════════ */}
      <section className="w-full border-y bg-[hsl(var(--surface))] py-16 lg:py-24">
        <div className="mx-auto w-full max-w-[92rem] px-5 sm:px-8 lg:px-12">
          <Reveal>
            <p className="text-[0.7rem] font-bold uppercase tracking-[0.22em] text-violet-600">What you get</p>
            <h2 className="mt-4 max-w-[24ch] text-[clamp(1.9rem,4.2vw,3.4rem)] font-extrabold leading-[1.05] tracking-[-0.03em]">
              Eight registers, one system, no double entry.
            </h2>
            <p className="mt-5 max-w-[68ch] text-base leading-relaxed text-[hsl(var(--muted))] lg:text-lg">
              Each of these replaces a book, a clipboard or a spreadsheet — and because they share
              one database, an incident can carry the patrol, the visitor and the key that relate to it.
            </p>
          </Reveal>

          <div className="mt-10 grid gap-px overflow-hidden rounded-2xl border bg-[hsl(var(--border))] sm:grid-cols-2 lg:mt-14 lg:grid-cols-4">
            {MODULES.map((m, i) => (
              <Reveal key={m.name} delay={i * 45}>
                <div className="h-full bg-[hsl(var(--surface))] p-6">
                  <h3 className="text-base font-bold tracking-tight">{m.name}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-[hsl(var(--muted))]">{m.body}</p>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ══ STORY ══════════════════════════════════════════════════════ */}
      <section className="w-full bg-slate-950 py-16 text-white lg:py-24">
        <div className="mx-auto w-full max-w-[92rem] px-5 sm:px-8 lg:px-12">
          <Reveal>
            <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:items-end lg:gap-16">
              <div>
                <p className="text-[0.7rem] font-bold uppercase tracking-[0.22em] text-amber-400">One night, minute by minute</p>
                <h2 className="mt-4 max-w-[18ch] text-[clamp(1.9rem,4.2vw,3.4rem)] font-extrabold leading-[1.05] tracking-[-0.03em]">
                  A perimeter breach, end to end.
                </h2>
              </div>
              <p className="text-base leading-relaxed text-slate-400 lg:text-lg">
                Every timestamp below is recorded by the platform itself. Nobody types these in
                afterwards — which is exactly the point.
              </p>
            </div>
          </Reveal>

          <div className="relative mt-12 lg:mt-16">
            <div
              aria-hidden
              className="absolute bottom-0 left-[7px] top-2 w-px bg-gradient-to-b from-red-500 via-sky-400 to-emerald-500 opacity-40 lg:left-1/2 lg:-translate-x-1/2"
            />
            <div className="flex flex-col gap-6 lg:gap-8">
              {FRAMES.map((f, i) => {
                const right = i % 2 === 1;
                return (
                  <div key={f.no} className="relative pl-9 lg:grid lg:grid-cols-2 lg:gap-12 lg:pl-0">
                    <span
                      aria-hidden
                      className={`absolute left-0 top-2 h-4 w-4 rounded-full ring-4 ${f.dot} ${f.ring} lg:left-1/2 lg:-translate-x-1/2`}
                    />
                    <Reveal className={right ? 'lg:col-start-2' : 'lg:col-start-1 lg:row-start-1'}>
                      <article className="rounded-2xl border border-white/10 bg-white/[0.04] p-5 backdrop-blur-sm transition duration-300 hover:border-white/20 hover:bg-white/[0.07] lg:p-6">
                        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                          <span className="font-mono text-[0.68rem] font-bold tracking-widest text-slate-500">
                            FRAME {f.no}
                          </span>
                          <span className="font-mono text-base font-extrabold tabular-nums tracking-tight">{f.time}</span>
                          <span className="text-[0.66rem] font-bold uppercase tracking-[0.12em] text-slate-500">{f.who}</span>
                        </div>
                        <h3 className="mb-2 mt-3 text-lg font-bold leading-snug tracking-tight lg:text-xl">{f.title}</h3>
                        <p className="text-[0.95rem] leading-relaxed text-slate-400">{f.body}</p>
                        {f.chips && (
                          <div className="mt-4 flex flex-wrap gap-2">
                            {f.chips.map((c) => (
                              <span
                                key={c}
                                className="rounded-md border border-white/15 bg-white/[0.06] px-2 py-0.5 font-mono text-[0.7rem] font-medium text-slate-300"
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

          <Reveal>
            <div className="mt-12 rounded-2xl border border-dashed border-white/15 p-6 lg:mt-16 lg:p-9">
              <p className="text-[0.7rem] font-bold uppercase tracking-[0.2em] text-slate-500">
                The same night, in the paper book
              </p>
              <p className="mt-4 max-w-[80ch] text-base leading-relaxed text-slate-400">
                <span className="font-mono font-bold text-slate-200">02:14</span> — nobody knows.{' '}
                <span className="font-mono font-bold text-slate-200">02:45</span> — nobody knows.{' '}
                <span className="font-mono font-bold text-slate-200">06:00</span> — the outgoing
                officer writes <em className="text-slate-300">“suspicious persons at fence, chased away”</em>{' '}
                from memory, in a book that stays in a drawer at the guard house. The supervisor never
                knew an officer was standing thirty metres from two men with bolt cutters. And when the
                client asks weeks later, that one line is the entire record.
              </p>
            </div>
          </Reveal>
        </div>
      </section>

      {/* ══ RESPONSE TARGETS ═══════════════════════════════════════════ */}
      <section className="w-full bg-[hsl(var(--background))] py-16 lg:py-24">
        <div className="mx-auto w-full max-w-[92rem] px-5 sm:px-8 lg:px-12">
          <div className="grid gap-10 lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)] lg:items-center lg:gap-16">
            {/* min-w-0 on both tracks: grid items default to min-width:auto and
                refuse to shrink below their content, so the table's min-w-[30rem]
                would otherwise force this whole section wider than a phone. */}
            <Reveal className="min-w-0">
              <div>
                <p className="text-[0.7rem] font-bold uppercase tracking-[0.22em] text-orange-600">Response targets</p>
                <h2 className="mt-4 max-w-[18ch] text-[clamp(1.9rem,4.2vw,3.4rem)] font-extrabold leading-[1.05] tracking-[-0.03em]">
                  Every incident gets a clock.
                </h2>
                <p className="mt-5 max-w-[52ch] text-base leading-relaxed text-[hsl(var(--muted))] lg:text-lg">
                  Severity is chosen once, at the scene. From that moment the platform knows when the
                  incident must be resolved and how often it must be updated — and it chases the
                  deadline itself rather than waiting to be asked.
                </p>
                <p className="mt-5 max-w-[52ch] text-base leading-relaxed text-[hsl(var(--muted))]">
                  These are the defaults. Every organisation can tune its own matrix to match what it
                  has promised its clients.
                </p>
              </div>
            </Reveal>

            <Reveal delay={100} className="min-w-0">
              <div className="overflow-x-auto rounded-2xl border bg-[hsl(var(--surface))] shadow-sm">
                <table className="w-full min-w-[30rem] border-collapse">
                  <thead>
                    <tr>
                      {['Severity', 'Resolve within', 'Update every', 'Escalates to'].map((h) => (
                        <th
                          key={h}
                          scope="col"
                          className="border-b bg-[hsl(var(--background))] px-5 py-3 text-left text-[0.68rem] font-bold uppercase tracking-wider text-[hsl(var(--muted))]"
                        >
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {SEVERITIES.map((sev) => (
                      <tr key={sev}>
                        <td className="border-b px-5 py-4">
                          <span
                            className="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold"
                            style={{
                              backgroundColor: `${SEVERITY_COLORS[sev]}1a`,
                              color: SEVERITY_COLORS[sev],
                            }}
                          >
                            {SEVERITY_LABELS[sev]}
                          </span>
                        </td>
                        <td className="border-b px-5 py-4 font-mono text-sm font-bold tabular-nums text-[hsl(var(--foreground))]">
                          {targetLabel(SLA_CONFIG[sev].resolveHours)}
                        </td>
                        <td className="border-b px-5 py-4 font-mono text-sm tabular-nums text-[hsl(var(--muted))]">
                          {intervalLabel(SLA_CONFIG[sev].updateIntervalMinutes)}
                        </td>
                        <td className="border-b px-5 py-4 text-sm text-[hsl(var(--muted))]">
                          {sev === 'critical' || sev === 'high'
                            ? 'Control room, supervisor, manager'
                            : 'Assigned reviewer'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Reveal>
          </div>
        </div>
      </section>

      {/* ══ CONSOLE SHOWCASE ═══════════════════════════════════════════ */}
      <section id="console" className="relative w-full scroll-mt-2 overflow-hidden bg-slate-900 py-16 text-white lg:py-24">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 bg-[radial-gradient(1000px_500px_at_50%_0%,rgba(102,126,234,0.25),transparent_65%)]"
        />
        <div className="relative mx-auto w-full max-w-[92rem] px-5 sm:px-8 lg:px-12">
          <Reveal>
            <div className="mx-auto max-w-[48rem] text-center">
              <p className="text-[0.7rem] font-bold uppercase tracking-[0.22em] text-indigo-300">The console</p>
              <h2 className="mt-4 text-[clamp(1.9rem,4.2vw,3.4rem)] font-extrabold leading-[1.05] tracking-[-0.03em]">
                The screen the control room watches.
              </h2>
              <p className="mx-auto mt-5 max-w-[56ch] text-base leading-relaxed text-slate-400 lg:text-lg">
                Open incidents ranked by how close they are to breaching. The clocks are running right
                now — and a new critical will arrive while you read this.
              </p>
            </div>
          </Reveal>

          <Reveal delay={100}>
            <div className="mx-auto mt-10 max-w-[76rem] lg:mt-14">
              <div className="overflow-hidden rounded-2xl border border-white/10 bg-[hsl(var(--surface))] shadow-[0_40px_120px_-20px_rgba(0,0,0,0.7)]">
                <div className="flex items-center gap-2 border-b bg-[hsl(var(--background))] px-5 py-3">
                  <span className="h-3 w-3 rounded-full bg-red-400/70" />
                  <span className="h-3 w-3 rounded-full bg-amber-400/70" />
                  <span className="h-3 w-3 rounded-full bg-emerald-400/70" />
                  <span className="ml-3 truncate font-mono text-xs font-semibold uppercase tracking-widest text-[hsl(var(--muted))]">
                    Live Occurrences · All sites
                  </span>
                  <span className="ml-auto flex shrink-0 items-center gap-2 text-[0.64rem] font-bold uppercase tracking-[0.14em] text-emerald-500">
                    <span className="relative flex h-2 w-2">
                      <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-500 opacity-75" />
                      <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
                    </span>
                    Realtime
                  </span>
                </div>
                <div className="p-4 lg:p-6">
                  <LiveBoard />
                </div>
              </div>
              <p className="mt-4 text-center text-sm text-slate-500">
                Sample data — the layout, clocks and behaviour are the real thing.
              </p>
            </div>
          </Reveal>
        </div>
      </section>

      {/* ══ CAPABILITIES ═══════════════════════════════════════════════ */}
      <section className="w-full bg-[hsl(var(--background))] py-16 lg:py-24">
        <div className="mx-auto w-full max-w-[92rem] px-5 sm:px-8 lg:px-12">
          <Reveal>
            <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:items-end lg:gap-16">
              <div>
                <p className="text-[0.7rem] font-bold uppercase tracking-[0.22em] text-sky-500">Realtime, meant literally</p>
                <h2 className="mt-4 max-w-[16ch] text-[clamp(1.9rem,4.2vw,3.4rem)] font-extrabold leading-[1.05] tracking-[-0.03em]">
                  Nothing here waits to be asked.
                </h2>
              </div>
              <p className="text-base leading-relaxed text-[hsl(var(--muted))] lg:text-lg">
                The database pushes changes to every screen the moment they are written. No polling,
                no refresh button, no wondering whether what you are looking at is current.
              </p>
            </div>
          </Reveal>

          <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:mt-14 lg:grid-cols-3 lg:gap-6">
            {CAPABILITIES.map((c, i) => (
              <Reveal key={c.tag} delay={i * 60}>
                <div className="h-full rounded-2xl border bg-[hsl(var(--surface))] p-6 shadow-sm transition duration-300 hover:-translate-y-1 hover:shadow-xl">
                  <p className={`text-[0.68rem] font-bold uppercase tracking-[0.16em] ${c.accent}`}>{c.tag}</p>
                  <h3 className="mb-2 mt-3 text-lg font-bold leading-snug tracking-tight">{c.title}</h3>
                  <p className="text-[0.95rem] leading-relaxed text-[hsl(var(--muted))]">{c.body}</p>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ══ THE FIELD APP ══════════════════════════════════════════════ */}
      <section className="w-full border-y bg-[hsl(var(--surface))] py-16 lg:py-24">
        <div className="mx-auto w-full max-w-[92rem] px-5 sm:px-8 lg:px-12">
          <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:items-center lg:gap-16">
            <Reveal>
              <div>
                <p className="text-[0.7rem] font-bold uppercase tracking-[0.22em] text-emerald-600">In the field</p>
                <h2 className="mt-4 max-w-[18ch] text-[clamp(1.9rem,4.2vw,3.4rem)] font-extrabold leading-[1.05] tracking-[-0.03em]">
                  The whole shift, from one handset.
                </h2>
                <p className="mt-5 max-w-[54ch] text-base leading-relaxed text-[hsl(var(--muted))] lg:text-lg">
                  Officers do not carry a laptop and they should not have to remember a password at
                  two in the morning. The field app is built for gloved hands, poor light and worse
                  signal — and it never asks anyone to write anything down twice.
                </p>
              </div>
            </Reveal>

            <Reveal delay={100}>
              <ul className="grid gap-3">
                {FIELD_APP.map((f) => (
                  <li
                    key={f}
                    className="flex gap-3 rounded-xl border bg-[hsl(var(--background))] p-4 text-[0.95rem] leading-relaxed text-[hsl(var(--muted))]"
                  >
                    <Check className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" />
                    <span>{f}</span>
                  </li>
                ))}
              </ul>
            </Reveal>
          </div>
        </div>
      </section>

      {/* ══ ROLES ══════════════════════════════════════════════════════ */}
      <section className="w-full bg-slate-950 py-16 text-white lg:py-24">
        <div className="mx-auto w-full max-w-[92rem] px-5 sm:px-8 lg:px-12">
          <Reveal>
            <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:items-end lg:gap-16">
              <div>
                <p className="text-[0.7rem] font-bold uppercase tracking-[0.22em] text-indigo-300">Who it is for</p>
                <h2 className="mt-4 max-w-[16ch] text-[clamp(1.9rem,4.2vw,3.4rem)] font-extrabold leading-[1.05] tracking-[-0.03em]">
                  Six roles, one version of the truth.
                </h2>
              </div>
              <p className="text-base leading-relaxed text-slate-400 lg:text-lg">
                Everyone sees the same records, filtered to what their job needs. Nobody keeps a
                private spreadsheet, because there is nothing the system does not already hold.
              </p>
            </div>
          </Reveal>

          <div className="mt-10 grid gap-5 md:grid-cols-2 lg:mt-14 lg:grid-cols-3 lg:gap-6">
            {ROLES.map((r, i) => (
              <Reveal key={r.role} delay={i * 50}>
                <div className="h-full rounded-2xl border border-white/10 bg-white/[0.04] p-6 transition duration-300 hover:border-white/20 hover:bg-white/[0.07]">
                  <span className={`inline-block rounded-full border px-3 py-0.5 text-[0.7rem] font-bold uppercase tracking-[0.1em] ${r.accent}`}>
                    {r.role}
                  </span>
                  <p className="mt-4 text-base font-bold leading-snug">{r.lead}</p>
                  <p className="mt-1.5 text-[0.95rem] leading-relaxed text-slate-400">{r.body}</p>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ══ PLATFORM ═══════════════════════════════════════════════════ */}
      <section className="w-full bg-[hsl(var(--background))] py-16 lg:py-24">
        <div className="mx-auto w-full max-w-[92rem] px-5 sm:px-8 lg:px-12">
          <Reveal>
            <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:items-end lg:gap-16">
              <div>
                <p className="text-[0.7rem] font-bold uppercase tracking-[0.22em] text-slate-500">Underneath</p>
                <h2 className="mt-4 max-w-[18ch] text-[clamp(1.9rem,4.2vw,3.4rem)] font-extrabold leading-[1.05] tracking-[-0.03em]">
                  Built to hold up in a dispute.
                </h2>
              </div>
              <p className="text-base leading-relaxed text-[hsl(var(--muted))] lg:text-lg">
                A security record is only worth what it can prove. These are the parts that make the
                platform trustworthy when somebody starts asking hard questions.
              </p>
            </div>
          </Reveal>

          <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:mt-14 lg:grid-cols-3 lg:gap-6">
            {PLATFORM.map((p, i) => (
              <Reveal key={p.title} delay={i * 55}>
                <div className="h-full rounded-2xl border bg-[hsl(var(--surface))] p-6 shadow-sm">
                  <h3 className="text-lg font-bold tracking-tight">{p.title}</h3>
                  <p className="mt-2 text-[0.95rem] leading-relaxed text-[hsl(var(--muted))]">{p.body}</p>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ══ OUTCOME ════════════════════════════════════════════════════ */}
      <section className="w-full border-t bg-[hsl(var(--surface))] py-16 lg:py-24">
        <div className="mx-auto w-full max-w-[92rem] px-5 sm:px-8 lg:px-12">
          <Reveal>
            <p className="text-[0.7rem] font-bold uppercase tracking-[0.22em] text-emerald-600">The outcome</p>
            <h2 className="mt-4 max-w-[22ch] text-[clamp(1.9rem,4.2vw,3.4rem)] font-extrabold leading-[1.05] tracking-[-0.03em]">
              From a book nobody reads to a record nobody can dispute.
            </h2>
          </Reveal>

          <div className="mt-10 grid gap-5 lg:mt-14 lg:grid-cols-2 lg:gap-8">
            <Reveal>
              <div className="h-full rounded-2xl border border-red-500/25 bg-red-500/[0.04] p-6 lg:p-8">
                <p className="text-[0.7rem] font-bold uppercase tracking-[0.16em] text-red-600">Before</p>
                <ul className="mt-5 space-y-3">
                  {BEFORE.map((b) => (
                    <li key={b} className="flex gap-3 text-[hsl(var(--muted))]">
                      <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-red-500/60" />
                      <span className="leading-relaxed">{b}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </Reveal>
            <Reveal delay={100}>
              <div className="h-full rounded-2xl border border-emerald-500/25 bg-emerald-500/[0.04] p-6 lg:p-8">
                <p className="text-[0.7rem] font-bold uppercase tracking-[0.16em] text-emerald-600">After</p>
                <ul className="mt-5 space-y-3">
                  {AFTER.map((a) => (
                    <li key={a} className="flex gap-3">
                      <Check className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" />
                      <span className="font-medium leading-relaxed">{a}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </Reveal>
          </div>
        </div>
      </section>

      {/* ══ CLOSE ══════════════════════════════════════════════════════ */}
      <section className="relative w-full overflow-hidden bg-brand-gradient py-16 text-white lg:py-24">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 bg-[radial-gradient(900px_450px_at_50%_-20%,rgba(255,255,255,0.25),transparent_60%)]"
        />
        <div className="relative mx-auto w-full max-w-[60rem] px-5 text-center sm:px-8">
          <h2 className="text-[clamp(1.9rem,4.4vw,3.25rem)] font-extrabold leading-[1.05] tracking-[-0.03em]">
            Make every incident answerable.
          </h2>
          <p className="mx-auto mt-5 max-w-[56ch] text-base leading-relaxed text-white/85 lg:text-lg">
            Who was there, what they saw, when they acted and what came of it — captured while it
            happened, provable years later, across every site and every shift.
          </p>
          <Link href="/login" className="mt-8 inline-block">
            <Button variant="secondary" size="lg" className="shadow-xl">
              Sign in to the console <ArrowRight className="h-4 w-4" />
            </Button>
          </Link>
        </div>
      </section>

      <footer className="w-full bg-slate-950 py-8 text-slate-500">
        <div className="mx-auto flex w-full max-w-[92rem] flex-wrap items-center justify-between gap-3 px-5 text-sm sm:px-8 lg:px-12">
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
