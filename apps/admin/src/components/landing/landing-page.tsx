import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { GradientSection } from '@/components/ui/gradient-section';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { BRAND } from '@digilog/shared';
import { LiveTicker } from './live-ticker';
import { LiveBoard } from './live-board';
import { Reveal } from './reveal';

// ---------------------------------------------------------------------------
// Content. Kept as data so the markup below stays readable, and so copy edits
// never mean touching layout. Every location and person is deliberately
// generic — nothing here identifies a real site, client or officer.
// ---------------------------------------------------------------------------

const PROBLEMS = [
  {
    title: 'Written from memory',
    body: 'Entries are filled in at the end of a twelve-hour shift, long after the event, with the details worn smooth.',
  },
  {
    title: 'Nobody knows where anyone is',
    body: 'An officer walks into a live intrusion and the control room only finds out when they stop answering the radio.',
  },
  {
    title: 'No clock on the response',
    body: "Nothing measures the gap between something happening and somebody acting on it. What isn't measured isn't managed.",
  },
  {
    title: 'Evidence you cannot produce',
    body: 'Weeks later a client asks what happened. The answer is a photocopy of somebody’s handwriting, if the book can be found at all.',
  },
];

const PILLARS = [
  {
    n: '01',
    tone: 'text-red-600',
    title: 'Report from the scene',
    body: 'Officers log incidents on a handset in under a minute, with photographs, voice notes and location — and no signal required.',
  },
  {
    n: '02',
    tone: 'text-orange-600',
    title: 'A clock on everything',
    body: 'Severity sets a response target the moment an incident is filed. The countdown runs on its own and escalates itself when it lapses.',
  },
  {
    n: '03',
    tone: 'text-sky-600',
    title: 'See the whole operation',
    body: 'A live console shows every open incident, every officer on patrol and every visitor on site — updating as it happens, without a refresh.',
  },
  {
    n: '04',
    tone: 'text-brand',
    title: 'Prove the patrol',
    body: 'Checkpoints are verified by QR, NFC tag or GPS geofence, so presence is a record rather than a claim.',
  },
  {
    n: '05',
    tone: 'text-violet-600',
    title: 'Review and sign off',
    body: 'Every incident is read by a manager and acknowledged, escalated or rejected with notes — against a real name and timestamp.',
  },
  {
    n: '06',
    tone: 'text-green-600',
    title: 'Answer any question, later',
    body: 'One click produces a branded report with the full timeline and evidence attached, years after the shift ended.',
  },
];

interface Frame {
  no: string;
  time: string;
  who: string;
  title: string;
  body: string;
  chips?: string[];
  accent: string; // left lip
  chip: string; // chip colours
}

const ACT_ONE: Frame[] = [
  {
    no: 'FRAME 01', time: '02:14:07', who: 'Field',
    title: 'Two figures cut the perimeter fence.',
    body: 'An officer is eleven minutes into a patrol route. A beam trips and he sees them from thirty metres — bolt cutters, no vehicle yet. He does not walk closer. He takes out his phone.',
    accent: 'border-l-red-600', chip: 'border-red-600/25 bg-red-600/[0.08] text-red-600',
  },
  {
    no: 'FRAME 02', time: '02:14:47', who: 'Mobile',
    title: 'Forty seconds to file it — with evidence.',
    body: 'Type: intrusion. Severity: critical. Two photographs and a nine-second voice note describing what he can see. There is no signal at the fence line, so it queues on the handset and files itself the moment the phone finds a bar.',
    chips: ['Reference number issued', '2 photos · 1 voice note', 'Voice transcribed to text'],
    accent: 'border-l-red-600', chip: 'border-red-600/25 bg-red-600/[0.08] text-red-600',
  },
  {
    no: 'FRAME 03', time: '02:14:52', who: 'Control room',
    title: 'The board flashes before he has put the phone away.',
    body: 'The incident lands on the live board with a banner. Critical severity sets the response target — resolve within the hour, post an update every thirty minutes — and the countdown starts without anyone touching it.',
    chips: ['Response clock armed', 'Push + email to duty manager', 'Realtime — no refresh'],
    accent: 'border-l-orange-600', chip: 'border-orange-600/25 bg-orange-600/[0.08] text-orange-600',
  },
];

const ACT_TWO: Frame[] = [
  {
    no: 'FRAME 04', time: '02:16:20', who: 'Supervisor',
    title: 'The map is why he goes home in the morning.',
    body: 'The supervisor opens the officer map and sees his position updating every thirty seconds — right on top of the breach. One tap calls him from the same screen: withdraw to the guard house, armed response is rolling. Knowing where your people are is the whole point.',
    chips: ['Position every 30s while on patrol', 'Tap-to-call from the team view'],
    accent: 'border-l-sky-500', chip: 'border-sky-500/25 bg-sky-500/[0.08] text-sky-600',
  },
  {
    no: 'FRAME 05', time: '02:22:41', who: 'Control room',
    title: 'Nothing waits on a phone call being answered.',
    body: 'The controller assigns the incident to the duty manager and dispatches armed response. The assignment reaches the manager as an in-app alert, a push notification and an email that opens straight onto the incident.',
    chips: ['Assigned + notified in one action', 'Every alert deep-links to the record'],
    accent: 'border-l-sky-500', chip: 'border-sky-500/25 bg-sky-500/[0.08] text-sky-600',
  },
  {
    no: 'FRAME 06', time: '02:31:05', who: 'Field',
    title: 'Armed response on scene. The record keeps up.',
    body: 'The responding officer’s note goes onto the incident from a phone at the gate. It appears in the control room mid-sentence, resets the update clock, and emails everyone attached to the incident.',
    chips: ['Update clock reset', 'Comment thread live on every screen'],
    accent: 'border-l-[#667eea]', chip: 'border-brand/25 bg-brand/[0.08] text-brand',
  },
];

const ACT_THREE: Frame[] = [
  {
    no: 'FRAME 07', time: '03:05:41', who: 'Resolved',
    title: 'Closed at fifty-one minutes. Inside the promise.',
    body: 'Fence secured, no entry to the building, nobody hurt. The status moves to resolved, the clock stops, and the incident leaves the live board with its response time measured against the target it was given at 02:14.',
    chips: ['Resolved in 51m of 60m', 'Target met'],
    accent: 'border-l-green-600', chip: 'border-green-600/25 bg-green-600/[0.08] text-green-600',
  },
  {
    no: 'FRAME 08', time: '09:12', who: 'Manager',
    title: 'Signed off by a person, not a rubber stamp.',
    body: 'The duty manager reads the whole thread — photographs, transcript, every update, who did what and when — and acknowledges it with notes. That decision is stored against her name permanently.',
    chips: ['Acknowledge · escalate · reject', 'Written to the audit log'],
    accent: 'border-l-[#667eea]', chip: 'border-brand/25 bg-brand/[0.08] text-brand',
  },
  {
    no: 'FRAME 09', time: 'Any time', who: 'Evidence',
    title: 'Weeks later, the client asks.',
    body: 'One click produces a branded report: the timeline to the second, the photographs, the response, the sign-off. Not a recollection — a record that was built while it happened.',
    chips: ['Report exported in one click', 'Evidence retained and searchable'],
    accent: 'border-l-green-600', chip: 'border-green-600/25 bg-green-600/[0.08] text-green-600',
  },
];

const FLOW = [
  { step: '01 · Field', tone: 'text-red-600 border-t-red-600', title: 'Logged where it happened', body: 'On a handset, with photographs, voice and location. Works offline and syncs itself.' },
  { step: '02 · System', tone: 'text-orange-600 border-t-orange-600', title: 'Numbered and clocked', body: 'A reference number is issued and the response target stamped from the severity.' },
  { step: '03 · Control room', tone: 'text-sky-600 border-t-sky-500', title: 'Worked in the open', body: 'Live board, assignment, updates and comments. Breaches escalate themselves.' },
  { step: '04 · Manager', tone: 'text-brand border-t-[#667eea]', title: 'Reviewed and signed', body: 'Acknowledged, escalated or rejected with notes — against a real name.' },
  { step: '05 · Record', tone: 'text-green-600 border-t-green-600', title: 'Kept, and provable', body: 'Exportable report, evidence in isolated storage, and a full audit trail.' },
];

const CAPABILITIES = [
  { tag: 'Live board', color: '#667eea', title: 'Incidents appear as they are logged', body: 'New incidents flash onto the control-room board with a banner, and every response badge counts down on its own.' },
  { tag: 'Officer map', color: '#0ea5e9', title: 'Where your people are, right now', body: 'Positions land every thirty seconds while an officer is on patrol — and only while they are on patrol.' },
  { tag: 'Alerts', color: '#dc2626', title: 'Breaches escalate themselves', body: 'Miss a target and the platform notifies the control room, supervisor, manager and administrator — in-app, push and email.' },
  { tag: 'Offline first', color: '#16a34a', title: 'No signal is not an excuse', body: 'Incidents logged in a basement or a dead zone queue on the handset with their photographs and file themselves when coverage returns.' },
  { tag: 'Verified patrols', color: '#ea580c', title: 'Presence you can prove', body: 'QR labels, NFC tags or a GPS geofence — three ways to prove an officer stood at a checkpoint, with method and distance recorded.' },
  { tag: 'Gate house', color: '#d97706', title: 'Scan the licence, not the clipboard', body: 'Vehicle disks and drivers’ licences scan straight into the visitor register, and scanning on the way out signs the right person off.' },
];

const ROLES = [
  { role: 'Officer', color: '#0ea5e9', lead: 'Works the site from a phone.', body: 'Clocks on, runs patrols, logs incidents, staffs the gate and hands over at the end of the shift — signing in with an employee number and a PIN.' },
  { role: 'Supervisor', color: '#16a34a', lead: 'Runs the shift.', body: 'The site board, the team’s live positions, patrol oversight, and the ability to close out a patrol somebody forgot to end.' },
  { role: 'Control room', color: '#667eea', lead: 'Holds the line.', body: 'Watches every open incident against its clock, logs what comes in over the radio, assigns reviewers and answers for the response.' },
  { role: 'Manager', color: '#dc2626', lead: 'Signs it off.', body: 'Reviews every incident — acknowledge, escalate or reject with notes — and reports on how the team actually performed.' },
  { role: 'Administrator', color: '#ea580c', lead: 'Shapes the operation.', body: 'People, sites, response targets, incident types and integrations — tuned per organisation without touching code.' },
  { role: 'Platform owner', color: '#d97706', lead: 'Runs the platform.', body: 'Many client organisations from one deployment, each sealed off from the others, each with its own branding, permissions and rules.' },
];

const BEFORE = [
  'Incidents surface at the 06:00 handover',
  'Officer locations are unknown between radio calls',
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

const OUTCOMES = [
  { border: 'border-t-red-600', title: 'Minutes, not shifts', body: 'The gap between an event and the right people knowing collapses from a handover to under a minute.' },
  { border: 'border-t-sky-500', title: 'People nobody loses', body: 'A supervisor can see where every officer on patrol is standing, and reach them from the same screen.' },
  { border: 'border-t-[#667eea]', title: 'Accountability with a name on it', body: 'Every status change, decision and sign-off is stored against a person and a timestamp that cannot be quietly edited.' },
  { border: 'border-t-green-600', title: 'Contracts you can defend', body: 'Response times measured against agreed targets, and evidence produced in one click instead of one week.' },
];

// ---------------------------------------------------------------------------

export function LandingPage() {
  return (
    <div className="min-h-screen bg-[hsl(var(--background))]">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-6">

        {/* ─── Hero ─────────────────────────────────────────────── */}
        <header className="relative overflow-hidden rounded-2xl bg-brand-gradient px-6 py-10 text-white shadow-lg sm:px-10 sm:py-14">
          {/* Depth + a slow radar sweep, the subject's own motif */}
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 bg-[radial-gradient(900px_420px_at_82%_-18%,rgba(255,255,255,0.28),transparent_62%)]"
          />
          <div
            aria-hidden
            className="animate-radar-sweep pointer-events-none absolute -right-72 -top-80 h-[780px] w-[780px] rounded-full opacity-[0.16]"
            style={{
              background:
                'conic-gradient(from 0deg, transparent 0deg, rgba(255,255,255,0.85) 32deg, transparent 66deg)',
            }}
          />

          <div className="relative">
            <div className="mb-10 flex items-center justify-between gap-4 sm:mb-14">
              <div className="flex items-center gap-3">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-white/25 bg-white/[0.18] text-lg font-extrabold backdrop-blur-sm">
                  D
                </div>
                <div className="min-w-0">
                  <b className="block text-base font-bold leading-tight">{BRAND.name}</b>
                  <span className="text-xs text-white/80">{BRAND.tagline}</span>
                </div>
              </div>
              <Link href="/login">
                <Button variant="secondary" className="shadow-sm">
                  Sign in <ArrowRight className="h-4 w-4" />
                </Button>
              </Link>
            </div>

            <p className="mb-5 inline-flex items-center gap-2 rounded-full border border-white/30 bg-white/[0.12] px-3.5 py-1 text-[0.7rem] font-bold uppercase tracking-[0.14em] backdrop-blur-sm">
              <span className="h-1.5 w-1.5 rounded-full bg-white" />
              Live from the first second
            </p>

            <h1 className="max-w-[17ch] text-4xl font-extrabold leading-[1.05] tracking-tight sm:text-5xl lg:text-6xl">
              Know what happened.
              <br />
              <span className="font-light opacity-90">While it is still</span> happening.
            </h1>

            <p className="mt-6 max-w-[60ch] text-base text-white/90 sm:text-lg">
              Security runs on information that arrives too late — written from memory, hours
              after the fact, in a book nobody can search. {BRAND.name} puts every incident,
              patrol, visitor and key on one live system the moment it occurs.
            </p>

            <LiveTicker />

            <dl className="mt-10 grid grid-cols-2 gap-6 border-t border-white/25 pt-8 sm:grid-cols-4">
              {[
                ['<60s', 'Field to control room'],
                ['24/7', 'Clock on every incident'],
                ['100%', 'Logged with evidence'],
                ['0', 'Signal needed to report'],
              ].map(([value, label]) => (
                <div key={label}>
                  <dt className="text-2xl font-extrabold tabular-nums tracking-tight sm:text-3xl">
                    {value}
                  </dt>
                  <dd className="mt-0.5 text-[0.7rem] font-semibold uppercase tracking-wider text-white/80">
                    {label}
                  </dd>
                </div>
              ))}
            </dl>
          </div>
        </header>

        {/* ─── Problem ──────────────────────────────────────────── */}
        <GradientSection
          title="The problem"
          subtitle="Why incidents are discovered too late"
          icon="TriangleAlert"
          tone="red"
        >
          <SectionIntro
            lead="A paper book cannot raise the alarm."
            sub="The occurrence book has run security operations for a century. It has one fatal property: it only speaks when somebody opens it — and by then the night is over."
          />
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {PROBLEMS.map((p) => (
              <div key={p.title} className="rounded-xl border border-t-[3px] border-t-red-600 p-4">
                <b className="mb-1 block text-[0.95rem]">{p.title}</b>
                <p className="text-sm text-[hsl(var(--muted))]">{p.body}</p>
              </div>
            ))}
          </div>
          <p className="mt-5 rounded-xl border border-red-600/20 bg-red-600/[0.06] px-4 py-3 text-[0.95rem]">
            <b className="text-red-600">The cost is not paperwork.</b> It is an officer standing
            next to a threat that nobody in the control room knows about, and a contract that
            cannot be defended when the client asks for proof.
          </p>
        </GradientSection>

        {/* ─── Solution ─────────────────────────────────────────── */}
        <GradientSection
          title="The solution"
          subtitle="One connected system, from the field to the archive"
          icon="ShieldCheck"
          tone="brand"
        >
          <SectionIntro
            lead="Capture it at the source. Everything else follows."
            sub={`${BRAND.name} replaces the occurrence book, the patrol clock, the visitor register and the key ledger with a single platform — a phone in the field, a live console in the control room, and one database that never forgets.`}
          />
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {PILLARS.map((p) => (
              <div
                key={p.n}
                className="rounded-xl border bg-[hsl(var(--surface))] p-5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
              >
                <p className={`font-mono text-xs font-bold tracking-widest ${p.tone}`}>{p.n}</p>
                <h3 className="mb-1.5 mt-2 text-base font-bold">{p.title}</h3>
                <p className="text-sm text-[hsl(var(--muted))]">{p.body}</p>
              </div>
            ))}
          </div>
        </GradientSection>

        {/* ─── Story ────────────────────────────────────────────── */}
        <GradientSection
          title="The story"
          subtitle="One incident, end to end"
          icon="ScrollText"
          tone="amber"
        >
          <SectionIntro
            lead="A perimeter breach, minute by minute."
            sub="This is the same night twice: once on the platform, and once in the book. Every timestamp below is recorded by the system itself — nobody types these in afterwards."
          />

          <Act label="Act one — it happens" frames={ACT_ONE} />
          <Act label="Act two — the response" frames={ACT_TWO} />
          <Act label="Act three — the record" frames={ACT_THREE} />

          <div className="mt-6 rounded-xl border border-dashed bg-[hsl(var(--background))] p-5">
            <h3 className="mb-2 text-xs font-bold uppercase tracking-widest text-[hsl(var(--muted))]">
              The same night, in the paper book
            </h3>
            <p className="max-w-[76ch] text-sm text-[hsl(var(--muted))]">
              <span className="font-mono font-bold text-[hsl(var(--foreground))]">02:14</span> — nobody
              knows.{' '}
              <span className="font-mono font-bold text-[hsl(var(--foreground))]">02:45</span> — nobody
              knows.{' '}
              <span className="font-mono font-bold text-[hsl(var(--foreground))]">06:00</span> — the
              outgoing officer writes <em>“suspicious persons at fence, chased away”</em> from memory,
              in a book that stays in a drawer at the guard house. The control room hears about it at
              handover. The supervisor never knew an officer was standing thirty metres from two men
              with bolt cutters. And when the client asks weeks later, that one line is the entire
              record.
            </p>
          </div>
        </GradientSection>

        {/* ─── Flow ─────────────────────────────────────────────── */}
        <GradientSection
          title="The flow"
          subtitle="The route every incident takes"
          icon="GitBranchPlus"
          tone="sky"
        >
          <SectionIntro
            lead="One path, and nothing falls off it."
            sub="Those nine frames are not a special case — they are the standard route. Every incident travels it, and every hop is a write with a timestamp and a name against it."
          />
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            {FLOW.map((f) => (
              <div key={f.step} className={`rounded-xl border border-t-[3px] bg-[hsl(var(--surface))] p-4 shadow-sm ${f.tone.split(' ')[1]}`}>
                <p className={`font-mono text-[0.68rem] font-bold uppercase tracking-widest ${f.tone.split(' ')[0]}`}>
                  {f.step}
                </p>
                <h3 className="mb-1 mt-1.5 text-[0.95rem] font-bold">{f.title}</h3>
                <p className="text-[0.84rem] text-[hsl(var(--muted))]">{f.body}</p>
              </div>
            ))}
          </div>
        </GradientSection>

        {/* ─── Console ──────────────────────────────────────────── */}
        <GradientSection
          title="The console"
          subtitle="The screen the control room actually watches"
          icon="Radio"
          tone="violet"
        >
          <SectionIntro
            lead="Open incidents, ranked by how close they are to breaching."
            sub="The clocks below are running right now — and a new critical will arrive while you are reading. Sample data; the layout is the real thing."
          />
          <LiveBoard />
        </GradientSection>

        {/* ─── Capabilities ─────────────────────────────────────── */}
        <GradientSection
          title="Realtime, meant literally"
          subtitle="Replication, not polling dressed up"
          icon="Activity"
          tone="sky"
        >
          <SectionIntro
            lead="Nothing here waits to be asked."
            sub="The database pushes changes to every screen the moment they are written."
          />
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {CAPABILITIES.map((c) => (
              <div
                key={c.tag}
                className="rounded-xl border bg-[hsl(var(--surface))] p-5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
              >
                <Badge color={c.color}>{c.tag}</Badge>
                <h3 className="mb-1.5 mt-3 text-base font-bold">{c.title}</h3>
                <p className="text-sm text-[hsl(var(--muted))]">{c.body}</p>
              </div>
            ))}
          </div>
        </GradientSection>

        {/* ─── Roles ────────────────────────────────────────────── */}
        <GradientSection
          title="Who it is for"
          subtitle="Six roles, one version of the truth"
          icon="Users"
          tone="slate"
        >
          <dl className="overflow-hidden rounded-xl border">
            {ROLES.map((r) => (
              <div
                key={r.role}
                className="grid gap-x-5 gap-y-1 border-b bg-[hsl(var(--surface))] px-4 py-4 last:border-b-0 sm:grid-cols-[11rem_1fr] sm:items-baseline"
              >
                <dt>
                  <Badge color={r.color}>{r.role}</Badge>
                </dt>
                <dd className="text-[0.93rem] text-[hsl(var(--muted))]">
                  <b className="text-[hsl(var(--foreground))]">{r.lead}</b> {r.body}
                </dd>
              </div>
            ))}
          </dl>
        </GradientSection>

        {/* ─── Outcome ──────────────────────────────────────────── */}
        <GradientSection
          title="The outcome"
          subtitle="What changes once it is running"
          icon="TrendingUp"
          tone="green"
        >
          <SectionIntro
            lead="From a book nobody reads to a record nobody can dispute."
            sub="The same operation, before and after."
          />

          <div className="mb-5 grid overflow-hidden rounded-xl border lg:grid-cols-[1fr_auto_1fr]">
            <div className="bg-[hsl(var(--surface))] p-5">
              <p className="mb-3 text-xs font-bold uppercase tracking-widest text-red-600">Before</p>
              <ul className="list-disc space-y-1.5 pl-5">
                {BEFORE.map((b) => (
                  <li key={b} className="text-sm text-[hsl(var(--muted))]">{b}</li>
                ))}
              </ul>
            </div>
            <div
              aria-hidden
              className="grid place-items-center border-y bg-[hsl(var(--background))] py-2 text-lg text-[hsl(var(--muted))] lg:border-x lg:border-y-0 lg:px-4 lg:py-0"
            >
              <ArrowRight className="h-5 w-5" />
            </div>
            <div className="bg-[hsl(var(--surface))] p-5">
              <p className="mb-3 text-xs font-bold uppercase tracking-widest text-green-600">After</p>
              <ul className="list-disc space-y-1.5 pl-5">
                {AFTER.map((a) => (
                  <li key={a} className="text-sm text-[hsl(var(--muted))]">{a}</li>
                ))}
              </ul>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {OUTCOMES.map((o) => (
              <div
                key={o.title}
                className={`rounded-xl border border-t-[3px] bg-[hsl(var(--surface))] p-4 shadow-sm ${o.border}`}
              >
                <b className="mb-1 block text-[0.95rem]">{o.title}</b>
                <p className="text-[0.86rem] text-[hsl(var(--muted))]">{o.body}</p>
              </div>
            ))}
          </div>
        </GradientSection>

        {/* ─── Close ────────────────────────────────────────────── */}
        <section className="rounded-2xl bg-brand-gradient px-6 py-10 text-center text-white shadow-lg sm:px-10">
          <h2 className="text-2xl font-extrabold tracking-tight sm:text-3xl">
            Make every incident answerable.
          </h2>
          <p className="mx-auto mt-3 max-w-[56ch] text-white/90">
            Who was there, what they saw, when they acted and what came of it — captured while it
            happened, provable years later, across every site and every shift.
          </p>
          <Link href="/login" className="mt-7 inline-block">
            <Button variant="secondary" size="lg" className="shadow-sm">
              Sign in to the console <ArrowRight className="h-4 w-4" />
            </Button>
          </Link>
        </section>

        <footer className="flex flex-wrap items-center justify-between gap-3 py-4 text-xs text-[hsl(var(--muted))]">
          <span>
            <b className="text-[hsl(var(--foreground))]">{BRAND.name}</b> — {BRAND.tagline}
          </span>
          <span>Proprietary &amp; confidential</span>
        </footer>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------

function SectionIntro({ lead, sub }: { lead: string; sub: string }) {
  return (
    <div className="mb-6">
      <h2 className="mb-2 max-w-[26ch] text-xl font-extrabold tracking-tight sm:text-2xl">{lead}</h2>
      <p className="max-w-[70ch] text-[0.97rem] text-[hsl(var(--muted))]">{sub}</p>
    </div>
  );
}

function Act({ label, frames }: { label: string; frames: Frame[] }) {
  return (
    <>
      <p className="mb-3 mt-7 flex items-center gap-3 text-xs font-bold uppercase tracking-widest text-[hsl(var(--muted))] first:mt-0">
        {label}
        <span className="h-px flex-1 bg-[hsl(var(--border))]" />
      </p>
      <div className="flex flex-col">
        {frames.map((f, i) => (
          <div key={f.no}>
            <Reveal delay={i * 80}>
              <article
                className={`grid gap-x-5 gap-y-2 rounded-xl border border-l-[5px] bg-[hsl(var(--surface))] p-5 shadow-sm transition hover:shadow-md sm:grid-cols-[7.5rem_1fr] ${f.accent}`}
              >
                <div className="flex items-baseline gap-3 sm:flex-col sm:gap-1">
                  <span className="font-mono text-[0.67rem] font-bold tracking-widest text-[hsl(var(--muted))]">
                    {f.no}
                  </span>
                  <span className="font-mono text-base font-extrabold tabular-nums tracking-tight">
                    {f.time}
                  </span>
                  <span className="text-[0.67rem] font-bold uppercase tracking-wider text-[hsl(var(--muted))]">
                    {f.who}
                  </span>
                </div>
                <div>
                  <h3 className="mb-1 text-[1.05rem] font-bold tracking-tight">{f.title}</h3>
                  <p className="max-w-[62ch] text-[0.93rem] text-[hsl(var(--muted))]">{f.body}</p>
                  {f.chips && (
                    <div className="mt-3 flex flex-wrap gap-2">
                      {f.chips.map((c) => (
                        <span
                          key={c}
                          className={`rounded-md border px-2 py-1 font-mono text-[0.71rem] font-semibold ${f.chip}`}
                        >
                          {c}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </article>
            </Reveal>
            {/* Connector: the frames read as one flow, not a stack of cards */}
            {i < frames.length - 1 && (
              <div aria-hidden className="ml-6 h-6 w-0.5 bg-[hsl(var(--border))] sm:ml-[3.75rem]" />
            )}
          </div>
        ))}
      </div>
    </>
  );
}
