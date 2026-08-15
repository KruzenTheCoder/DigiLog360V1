import Link from 'next/link';
import {
  Activity, AlertTriangle, ArrowDown, ArrowRight, BadgeCheck, Bell, Camera, Check,
  ClipboardCheck, Clock, Database, FileText, Footprints, Gauge, KeyRound, Layers,
  Lock, LogIn, Map, MapPin, PhoneCall, QrCode, Radio, Route, ScrollText,
  ShieldCheck, Siren, Smartphone, TrendingUp, Users, Webhook, WifiOff,
  type LucideIcon,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Logo } from '@/components/brand/logo';
import { BRAND, SLA_CONFIG, SEVERITY_LABELS, SEVERITY_COLORS, SEVERITIES } from '@digilog/shared';
import { HeroBoard } from './hero-board';
import { TiltStage, Depth } from './tilt-stage';
import { CountUp } from './count-up';
import { LiveBoard } from './live-board';
import { Reveal } from './reveal';
import { SiteCard, CardDeck } from './site-card';
import { BlockReveal, Mark } from './block-reveal';
import { Ambient } from './ambient';
import { Constellation } from './constellation';

// ---------------------------------------------------------------------------
// Content lives as data so the markup stays readable. Every location and
// person is deliberately generic — nothing identifies a real site or officer.
// ---------------------------------------------------------------------------

const HERO_CHIPS = ['Works offline', 'QR · NFC · GPS patrols', 'Multi-site', 'Audit trail on everything'];

const PATROLS = [
  { route: 'North perimeter', done: 7, total: 9, tone: 'bg-emerald-400' },
  { route: 'Yard & loading bay', done: 4, total: 8, tone: 'bg-sky-400' },
  { route: 'Roof & plant rooms', done: 1, total: 6, tone: 'bg-amber-300' },
];

const PROBLEMS: { k: string; icon: LucideIcon; title: string; body: string }[] = [
  { k: '01', icon: ScrollText, title: 'Written from memory', body: 'Entries are filled in at the end of a twelve-hour shift, long after the event, with the details worn smooth.' },
  { k: '02', icon: MapPin, title: 'Nobody knows where anyone is', body: 'An officer walks into a live intrusion and the control room only finds out when they stop answering the radio.' },
  { k: '03', icon: Clock, title: 'No clock on the response', body: "Nothing measures the gap between something happening and somebody acting on it. What isn't measured isn't managed." },
  { k: '04', icon: FileText, title: 'Evidence you cannot produce', body: 'Weeks later a client asks what happened. The answer is a photocopy of somebody’s handwriting — if the book can be found.' },
];

const PILLARS: { n: string; icon: LucideIcon; tint: string; title: string; body: string }[] = [
  { n: '01', icon: Smartphone, tint: 'bg-red-500/10 text-red-600', title: 'Report from the scene', body: 'Officers log incidents on a handset in under a minute, with photographs, voice notes and location — and no signal required.' },
  { n: '02', icon: Gauge, tint: 'bg-orange-500/10 text-orange-600', title: 'A clock on everything', body: 'Severity sets a response target the moment an incident is filed. The countdown runs on its own and escalates itself when it lapses.' },
  { n: '03', icon: Radio, tint: 'bg-sky-500/10 text-sky-600', title: 'See the whole operation', body: 'A live console shows every open incident, every officer on patrol and every visitor on site — updating as it happens.' },
  { n: '04', icon: QrCode, tint: 'bg-brand/10 text-brand', title: 'Prove the patrol', body: 'Checkpoints are verified by QR, NFC tag or GPS geofence, so presence is a record rather than a claim.' },
  { n: '05', icon: ClipboardCheck, tint: 'bg-violet-500/10 text-violet-600', title: 'Review and sign off', body: 'Every incident is read by a manager and acknowledged, escalated or rejected with notes — against a real name and timestamp.' },
  { n: '06', icon: FileText, tint: 'bg-emerald-500/10 text-emerald-600', title: 'Answer any question, later', body: 'One click produces a branded report with the full timeline and evidence attached, years after the shift ended.' },
];

const MODULES: { icon: LucideIcon; name: string; body: string; meta: string }[] = [
  { icon: Siren, name: 'Occurrences', body: 'Numbered incidents with severity, photographs, voice notes, comments and a full update timeline.', meta: 'OB-numbered' },
  { icon: Footprints, name: 'Patrols & checkpoints', body: 'Routes, schedules and verified scans, with alerts when an expected patrol does not happen.', meta: 'QR · NFC · GPS' },
  { icon: Map, name: 'Officer map', body: 'Live positions while on patrol, with tap-to-call straight from the team view.', meta: 'Every 30s' },
  { icon: LogIn, name: 'Visitor register', body: 'Licence scanning on the way in, and scanning the disk on the way out signs the right person off.', meta: 'Scan in · scan out' },
  { icon: KeyRound, name: 'Key register', body: 'Every hand-over captured against a name and ID number, with the full history kept per key.', meta: 'Held vs available' },
  { icon: Clock, name: 'Shifts & handovers', body: 'Clock-in and clock-out with live counters, plus signed handovers the incoming officer acknowledges.', meta: 'Signed off' },
  { icon: ClipboardCheck, name: 'Tasks', body: 'Follow-up work linked to the incident that caused it, with its own owner and due date.', meta: 'Linked to an OB' },
  { icon: FileText, name: 'Reports & exports', body: 'Branded PDF reports, evidence galleries and CSV exports for client packs and disputes.', meta: 'One click' },
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

const FIELD_APP: { icon: LucideIcon; title: string; body: string }[] = [
  { icon: Lock, title: 'A PIN, not a password', body: 'Officers sign in with an employee number and four digits — nothing to forget at two in the morning.' },
  { icon: Camera, title: 'Evidence as you go', body: 'Photographs and a voice note attach to the incident, and the recording is transcribed to searchable text.' },
  { icon: WifiOff, title: 'Signal optional', body: 'Everything queues on the handset in a dead zone and files itself the moment coverage returns.' },
  { icon: QrCode, title: 'Three ways to scan', body: 'QR label, NFC tag or GPS geofence — whichever suits the point, with method and distance recorded.' },
  { icon: LogIn, title: 'The gate house in a pocket', body: 'Licence scanning, the visitor register and the key hand-over log, all from the same device.' },
  { icon: BadgeCheck, title: 'Shifts and handovers', body: 'Clock on and off, then leave a signed handover the next officer has to acknowledge before starting.' },
];

const CAPABILITIES: { icon: LucideIcon; tag: string; accent: string; title: string; body: string }[] = [
  { icon: Radio, tag: 'Live board', accent: 'text-indigo-500', title: 'Incidents appear as they are logged', body: 'New incidents flash onto the control-room board with a banner, and every response badge counts down on its own.' },
  { icon: Map, tag: 'Officer map', accent: 'text-sky-500', title: 'Where your people are, right now', body: 'Positions land every thirty seconds while an officer is on patrol — and only while they are on patrol.' },
  { icon: Bell, tag: 'Alerts', accent: 'text-red-500', title: 'Breaches escalate themselves', body: 'Miss a target and the platform notifies the control room, supervisor, manager and administrator — in-app, push and email.' },
  { icon: WifiOff, tag: 'Offline first', accent: 'text-emerald-500', title: 'No signal is not an excuse', body: 'Incidents logged in a basement or a dead zone queue on the handset and file themselves when coverage returns.' },
  { icon: Footprints, tag: 'Verified patrols', accent: 'text-orange-500', title: 'Presence you can prove', body: 'Three ways to prove an officer stood at a checkpoint, with the method and the distance recorded on every scan.' },
  { icon: PhoneCall, tag: 'Reach anyone', accent: 'text-amber-500', title: 'One tap from the record', body: 'Call the officer on the incident straight from the team view, without hunting for a number on a roster.' },
];

const ROLES = [
  { role: 'Officer', icon: Smartphone, accent: 'text-sky-400 border-sky-400/30', lead: 'Works the site from a phone.', body: 'Clocks on, runs patrols, logs incidents, staffs the gate and hands over — signing in with an employee number and a PIN.' },
  { role: 'Supervisor', icon: Users, accent: 'text-emerald-400 border-emerald-400/30', lead: 'Runs the shift.', body: 'The site board, the team’s live positions, patrol oversight, and the ability to close out a patrol somebody forgot to end.' },
  { role: 'Control room', icon: Radio, accent: 'text-indigo-300 border-indigo-300/30', lead: 'Holds the line.', body: 'Watches every open incident against its clock, logs what comes in over the radio and answers for the response.' },
  { role: 'Manager', icon: ClipboardCheck, accent: 'text-red-400 border-red-400/30', lead: 'Signs it off.', body: 'Reviews every incident — acknowledge, escalate or reject with notes — and reports on how the team actually performed.' },
  { role: 'Administrator', icon: Layers, accent: 'text-orange-400 border-orange-400/30', lead: 'Shapes the operation.', body: 'People, sites, response targets, incident types and integrations — tuned per organisation without touching code.' },
  { role: 'Platform owner', icon: Database, accent: 'text-amber-400 border-amber-400/30', lead: 'Runs the platform.', body: 'Many client organisations from one deployment, each sealed off from the others, with its own branding and rules.' },
];

const PLATFORM: { icon: LucideIcon; title: string; body: string }[] = [
  { icon: Database, title: 'Separated by tenant', body: 'Every organisation’s data is isolated at the database level, not by a filter in the application. One deployment serves many clients without them ever meeting.' },
  { icon: ScrollText, title: 'An audit trail you cannot edit', body: 'Sign-ins, role changes, manager decisions and configuration changes are written with the actor, their role, the target and a timestamp.' },
  { icon: ShieldCheck, title: 'Access that fits the job', body: 'Six ranked roles plus a per-organisation capability grid, so a client sees exactly the screens they bought — and nothing else.' },
  { icon: Lock, title: 'Accounts held properly', body: 'Passwords with optional two-factor for the console, hashed PINs with lockout for the field, and tokens stored only as hashes.' },
  { icon: Webhook, title: 'It talks to your other systems', body: 'Signed outbound webhooks and organisation-scoped API tokens, so incidents can reach your ticketing, monitoring or reporting stack.' },
  { icon: Activity, title: 'Built to keep running', body: 'Watchdogs sweep for breached targets and missed patrols on a schedule, and alert emails retry until delivered or recorded as failed.' },
];

const FAQ = [
  { q: 'What happens where there is no signal?', a: 'The handset keeps working. Incidents, photographs and voice notes queue on the device and file themselves the moment coverage returns, keeping the time they were captured rather than the time they synced.' },
  { q: 'Do officers need to remember a password?', a: 'No. They sign in with their employee number and a four-digit PIN. PINs are stored hashed and lock out after repeated failures, and an administrator can reset one in seconds.' },
  { q: 'Can we keep our own response times?', a: 'Yes. The severity matrix ships with sensible defaults, and each organisation can set its own resolve and update targets to match what it has promised its clients.' },
  { q: 'How do we prove a patrol actually happened?', a: 'Checkpoints are scanned by QR label, NFC tag or GPS geofence. Each scan records the method, the time and the distance from the point, so presence is evidence rather than a signature.' },
  { q: 'Can more than one company use the same system?', a: 'Yes. It is multi-tenant by design — each organisation is isolated at the database level, with its own branding, sites, users, response targets and permissions.' },
  { q: 'What can we hand a client after an incident?', a: 'A branded report with the full timeline to the second, the photographs, every update and the manager’s sign-off — produced in one click, years after the shift ended.' },
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

/** Section label with a short gradient rule under it — used on every section. */
function Eyebrow({ children, tone, dark }: { children: string; tone: string; dark?: boolean }) {
  return (
    <div>
      <p className={`text-[0.7rem] font-bold uppercase tracking-[0.22em] ${tone}`}>{children}</p>
      <span
        aria-hidden
        className={`mt-3 block h-px w-14 ${dark ? 'bg-white/25' : 'bg-[hsl(var(--border))]'}`}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------

export type LandingSection =
  | 'hero' | 'problem' | 'solution' | 'what' | 'story' | 'targets' | 'console'
  | 'realtime' | 'field' | 'who' | 'underneath' | 'outcome' | 'faq' | 'confidential';

/**
 * The marketing content, one section per key.
 *
 * The site is now several short pages rather than one long scroll, so each
 * route renders the handful of sections it owns. Keeping them in one module
 * means the shared helpers, palette and copy stay in one place — the split is
 * about what a visitor is shown, not about splitting the source.
 */
export function LandingPage(
  { sections, showFooter = true }: { sections?: LandingSection[]; showFooter?: boolean },
) {
  const show = (k: LandingSection) => !sections || sections.includes(k);
  return (
    <main className="w-full overflow-x-hidden bg-[hsl(var(--background))]">

      {/* ══ HERO ═══════════════════════════════════════════════════════ */}
      {/* The hero owns its own vertical rhythm and runs under the floating
          nav, so it takes no section padding of its own. */}
      {show('hero') && (
      <section className="relative isolate w-full overflow-hidden bg-brand-gradient text-white">
        {/* The hero's light sources, drifting slowly so the background is
            never quite static behind the type. */}
        <div
          aria-hidden
          className="hero-aurora pointer-events-none absolute inset-0 bg-[radial-gradient(1200px_600px_at_78%_-15%,rgba(255,255,255,0.30),transparent_60%),radial-gradient(900px_500px_at_5%_110%,rgba(2,6,23,0.45),transparent_60%)]"
        />
        <div className="parallax-back pointer-events-none absolute inset-0">
          <div
            aria-hidden
            className="animate-radar-sweep absolute -right-[22rem] -top-[26rem] h-[60rem] w-[60rem] rounded-full opacity-[0.14]"
            style={{ background: 'conic-gradient(from 0deg, transparent 0deg, rgba(255,255,255,0.9) 30deg, transparent 64deg)' }}
          />
        </div>
        {/* The grid is the layer that sells the depth: it is the only one with
            hard edges, so its drift is what the eye actually measures against
            the content moving past it. */}
        <div
          aria-hidden
          className="parallax-back pointer-events-none absolute inset-0 opacity-[0.06]"
          style={{
            backgroundImage: 'linear-gradient(to right, #fff 1px, transparent 1px), linear-gradient(to bottom, #fff 1px, transparent 1px)',
            backgroundSize: '72px 72px',
            maskImage: 'radial-gradient(120% 90% at 70% 0%, #000 20%, transparent 75%)',
            WebkitMaskImage: 'radial-gradient(120% 90% at 70% 0%, #000 20%, transparent 75%)',
          }}
        />

        {/* The brand mark and Sign in live in the persistent site nav now, so
            the hero no longer carries its own copy of both. */}
        {/* Top padding clears the floating nav, which sits over this rather
            than above it — that overlap is what makes the nav read as free. */}
        <div className="relative z-10 mx-auto w-full max-w-[92rem] px-5 pb-14 pt-24 sm:px-8 lg:px-12 lg:pb-20 lg:pt-28">
          <div className="grid items-center gap-10 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,0.95fr)] lg:gap-14">
            <div className="min-w-0">
              <p
                className="hero-rise mb-6 inline-flex items-center gap-2 rounded-full border border-white/25 bg-white/[0.10] px-3.5 py-1.5 text-[0.66rem] font-bold uppercase tracking-[0.18em] text-white/90 backdrop-blur-sm"
                style={{ animationDelay: '80ms' }}
              >
                <span className="relative flex h-1.5 w-1.5">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-white opacity-75" />
                  <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-white" />
                </span>
                Live from the first second
              </p>

              {/* Three lines, each rising out from behind its own clip. The
                  stagger is what carries the sentence — the eye follows it
                  down rather than being handed the whole block at once. */}
              <h1 className="max-w-[15ch] text-[clamp(2.5rem,5.8vw,4.75rem)] font-extrabold leading-[1.03] tracking-[-0.04em]">
                <span className="hl-mask">
                  <span className="hl-line" style={{ animationDelay: '180ms' }}>
                    Know what happened.
                  </span>
                </span>
                <span className="hl-mask">
                  <span
                    className="hl-line bg-gradient-to-r from-white/95 via-sky-100/90 to-white/60 bg-clip-text font-light text-transparent"
                    style={{ animationDelay: '300ms' }}
                  >
                    While it is still
                  </span>
                </span>
                <span className="hl-mask">
                  <span className="hl-line" style={{ animationDelay: '420ms' }}>
                    happening.
                  </span>
                </span>
              </h1>

              <p
                className="hero-rise mt-7 max-w-[54ch] text-base leading-relaxed text-white/80 lg:text-lg"
                style={{ animationDelay: '620ms' }}
              >
                {BRAND.name} replaces the occurrence book, the patrol clock, the visitor register
                and the key ledger with one live system — so an incident on a dark perimeter reaches
                the control room while it is still happening, with the evidence already attached.
              </p>

              <div
                className="hero-rise mt-8 flex flex-wrap items-center gap-3"
                style={{ animationDelay: '740ms' }}
              >
                <Link href="/login">
                  <Button variant="secondary" size="lg" className="shadow-[0_12px_30px_-10px_rgba(2,6,23,0.5)]">
                    Sign in to the console <ArrowRight className="h-4 w-4" />
                  </Button>
                </Link>
                <a
                  href="#problem"
                  className="group inline-flex h-12 items-center gap-2 rounded-lg border border-white/30 px-5 text-base font-medium text-white transition hover:border-white/60 hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/60"
                >
                  See how it works
                  <ArrowDown className="h-4 w-4 transition-transform duration-300 group-hover:translate-y-0.5" />
                </a>
              </div>

              <ul className="mt-8 flex flex-wrap gap-x-5 gap-y-2">
                {HERO_CHIPS.map((c, i) => (
                  <li
                    key={c}
                    className="hero-rise flex items-center gap-1.5 text-sm text-white/75"
                    style={{ animationDelay: `${860 + i * 70}ms` }}
                  >
                    <Check className="h-4 w-4 shrink-0 text-white/60" />
                    {c}
                  </li>
                ))}
              </ul>
            </div>

            {/* Two stacked panels: what is happening, and who is out there.
                They share one 3-D stage, so the pair leans together as a
                single object rather than as two cards that happen to move. */}
            <TiltStage className="min-w-0">
            <div className="grid min-w-0 gap-4">
              <Depth z={36}><HeroBoard /></Depth>

              <div className="rounded-2xl border border-white/25 bg-white/[0.08] p-4 backdrop-blur-md" style={{ transform: 'translateZ(14px)' }}>
                <div className="mb-3 flex items-center gap-2">
                  <Route className="h-4 w-4 text-white/70" />
                  <span className="font-mono text-[0.64rem] font-bold uppercase tracking-[0.16em] text-white/70">
                    On patrol now
                  </span>
                  <span className="ml-auto font-mono text-[0.64rem] text-white/60">3 routes</span>
                </div>
                <ul className="grid gap-2.5">
                  {PATROLS.map((p) => (
                    <li key={p.route} className="flex items-center gap-3">
                      <span className="min-w-0 flex-1 truncate text-sm text-white/90">{p.route}</span>
                      <span className="h-1.5 w-20 overflow-hidden rounded-full bg-white/20 sm:w-28">
                        <span
                          className={`block h-full rounded-full ${p.tone}`}
                          style={{ width: `${(p.done / p.total) * 100}%` }}
                        />
                      </span>
                      <span className="w-10 shrink-0 text-right font-mono text-xs tabular-nums text-white/75">
                        {p.done}/{p.total}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
            </TiltStage>
          </div>
        </div>

        {/* Scroll cue — a line running down its own track, so the hero says
            there is more below without a bouncing chevron. */}
        <div
          className="hero-rise relative z-10 mx-auto mb-2 hidden w-full max-w-[92rem] px-5 sm:px-8 lg:block lg:px-12"
          style={{ animationDelay: '1150ms' }}
        >
          <span aria-hidden className="fade-on-scroll flex h-10 w-px overflow-hidden bg-white/15">
            <span className="cue-run block h-full w-px bg-white/70" />
          </span>
        </div>

        <div className="relative z-10 border-t border-white/15 bg-black/10 backdrop-blur-sm">
          <dl className="mx-auto grid w-full max-w-[92rem] grid-cols-2 gap-y-6 px-5 py-7 sm:px-8 lg:grid-cols-4 lg:px-12">
            {[
              { v: '<60s', l: 'Field to control room' },
              { v: '3', l: 'Ways to prove a patrol' },
              { v: '6', l: 'Roles, one platform' },
              { v: '0', l: 'Signal needed to report' },
            ].map((s, i) => (
              <div
                key={s.l}
                className={`hero-rise ${i > 0 ? 'lg:border-l lg:border-white/15 lg:pl-8' : ''}`}
                style={{ animationDelay: `${1000 + i * 90}ms` }}
              >
                <dt className="text-[clamp(1.6rem,3vw,2.5rem)] font-extrabold leading-none tracking-tight">
                  <CountUp value={s.v} delay={1000 + i * 90} />
                </dt>
                <dd className="mt-1.5 text-[0.68rem] font-semibold uppercase tracking-[0.14em] text-white/70">
                  {s.l}
                </dd>
              </div>
            ))}
          </dl>
        </div>
      </section>
      )}

      {/* ══ PROBLEM ════════════════════════════════════════════════════ */}
      {show('problem') && (
      <section id="problem" className="relative isolate w-full scroll-mt-16 overflow-hidden bg-slate-950 text-white py-20 lg:py-28">
        <div className="relative mx-auto w-full max-w-[92rem] px-5 sm:px-8 lg:px-12">



        <Ambient tone="red" scheme="dark" />
          <Reveal>
            <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:items-end lg:gap-16">
              <div className="min-w-0">
                <Eyebrow tone="text-red-400" dark>The problem</Eyebrow>
                <h2 className="mt-5 max-w-[17ch] text-[clamp(1.9rem,4.2vw,3.4rem)] font-extrabold leading-[1.05] tracking-[-0.03em]">
                  <BlockReveal tone="red">A paper book <Mark tone="red" className="text-white">cannot</Mark> raise the alarm.</BlockReveal>
                </h2>
              </div>
              <p className="min-w-0 text-base leading-relaxed text-slate-400 lg:text-lg">
                The occurrence book has run security operations for a century. It has one fatal
                property: it only speaks when somebody opens it — and by then the night is over.
                Everything below follows from that single flaw.
              </p>
            </div>
          </Reveal>

          {/* The silent hours — the gap made visible */}
          <Reveal delay={80}>
            <div className="mt-10 overflow-hidden rounded-2xl border border-white/10 bg-white/[0.03] p-6 lg:mt-14 lg:p-8">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <span className="flex items-center gap-2 font-mono text-sm font-bold tabular-nums text-red-400">
                  <AlertTriangle className="h-4 w-4" /> 02:14 · fence cut
                </span>
                <span className="font-mono text-sm font-bold tabular-nums text-slate-400">
                  06:00 · handover
                </span>
              </div>
              <div className="relative mt-4 h-2 w-full overflow-hidden rounded-full bg-white/10">
                <div className="absolute inset-y-0 left-0 w-full rounded-full bg-gradient-to-r from-red-600 via-red-500/60 to-slate-600" />
              </div>
              <p className="mt-4 text-sm text-slate-400">
                <b className="text-white">Three hours forty-six minutes</b> in which the control room,
                the supervisor and the client all believe the site is quiet. On paper, that gap is
                invisible — there is nothing to notice, because nothing was written down.
              </p>
            </div>
          </Reveal>

          <CardDeck className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {PROBLEMS.map((p) => (
              <SiteCard key={p.k} tone="red" surface="dark" className="h-full">
                <div className="flex items-center gap-3">
                  <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-red-500/10 text-red-400">
                    <p.icon className="h-[18px] w-[18px]" />
                  </span>
                  <span className="font-mono text-xs font-bold tracking-widest text-red-400/70">{p.k}</span>
                </div>
                <h3 className="mb-2 mt-4 text-lg font-bold tracking-tight">{p.title}</h3>
                <p className="text-sm leading-relaxed text-slate-400">{p.body}</p>
              </SiteCard>
            ))}
          </CardDeck>

          <Reveal>
            <p className="mt-10 max-w-[74ch] border-l-2 border-red-500 pl-5 text-base leading-relaxed text-slate-300 lg:text-lg">
              <b className="text-white">The cost is not paperwork.</b> It is an officer standing next
              to a threat nobody in the control room knows about, and a contract that cannot be
              defended when the client asks for proof.
            </p>
          </Reveal>
        </div>
      </section>
      )}

      {/* ══ SOLUTION ═══════════════════════════════════════════════════ */}
      {show('solution') && (
      <section className="relative isolate w-full overflow-hidden bg-[hsl(var(--background))] py-20 lg:py-28">
        <div className="relative mx-auto w-full max-w-[92rem] px-5 sm:px-8 lg:px-12">
        <Ambient tone="brand" />
          <Reveal>
            <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:items-end lg:gap-16">
              <div className="min-w-0">
                <Eyebrow tone="text-brand">The solution</Eyebrow>
                <h2 className="mt-5 max-w-[19ch] text-[clamp(1.9rem,4.2vw,3.4rem)] font-extrabold leading-[1.05] tracking-[-0.03em]">
                  <BlockReveal tone="brand">Capture it <Mark tone="brand" className="text-white">at the source</Mark>. Everything else follows.</BlockReveal>
                </h2>
              </div>
              <p className="min-w-0 text-base leading-relaxed text-[hsl(var(--muted))] lg:text-lg">
                A phone in the field, a live console in the control room, and one database that never
                forgets. Six things change the moment it is running.
              </p>
            </div>
          </Reveal>

          <CardDeck offset className="mt-10 grid gap-5 sm:grid-cols-2 lg:mt-14 lg:grid-cols-3 lg:gap-6">
            {PILLARS.map((p) => (
              <SiteCard key={p.n} tone="brand" className="h-full">
                <div className="flex items-center justify-between">
                  <span className={`flex h-11 w-11 items-center justify-center rounded-xl ${p.tint}`}>
                    <p.icon className="h-5 w-5" />
                  </span>
                  <span className="font-mono text-xs font-bold tracking-widest text-[hsl(var(--muted))]">{p.n}</span>
                </div>
                <h3 className="mb-2 mt-5 text-lg font-bold tracking-tight">{p.title}</h3>
                <p className="text-[0.95rem] leading-relaxed text-[hsl(var(--muted))]">{p.body}</p>
              </SiteCard>
            ))}
          </CardDeck>
        </div>
      </section>
      )}

      {/* ══ MODULES ════════════════════════════════════════════════════ */}
      {show('what') && (
      <section className="relative isolate w-full overflow-hidden bg-[hsl(var(--background))] py-20 lg:py-28">
        <div className="relative mx-auto w-full max-w-[92rem] px-5 sm:px-8 lg:px-12">
          <Reveal>
            <Eyebrow tone="text-violet-600">What you get</Eyebrow>
            <h2 className="mt-5 max-w-[24ch] text-[clamp(1.9rem,4.2vw,3.4rem)] font-extrabold leading-[1.05] tracking-[-0.03em]">
              <BlockReveal tone="violet">Eight registers, <Mark tone="violet" className="text-white">one system</Mark>, no double entry.</BlockReveal>
            </h2>
            <p className="mt-5 max-w-[68ch] text-base leading-relaxed text-[hsl(var(--muted))] lg:text-lg">
              Each of these replaces a book, a clipboard or a spreadsheet — and because they share one
              database, an incident can carry the patrol, the visitor and the key that relate to it.
            </p>
          </Reveal>

          <CardDeck className="mt-10 grid gap-4 sm:grid-cols-2 lg:mt-14 lg:grid-cols-4" step={50}>
            {MODULES.map((m) => (
              <SiteCard key={m.name} tone="violet" className="h-full">
                <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand/10 text-brand">
                  <m.icon className="h-5 w-5" />
                </span>
                <h3 className="mt-4 text-base font-bold tracking-tight">{m.name}</h3>
                <p className="mt-2 text-sm leading-relaxed text-[hsl(var(--muted))]">{m.body}</p>
                <p className="mt-3 font-mono text-[0.68rem] uppercase tracking-wider text-[hsl(var(--muted))]/70">
                  {m.meta}
                </p>
              </SiteCard>
            ))}
          </CardDeck>
        </div>
      </section>
      )}

      {/* ══ STORY ══════════════════════════════════════════════════════ */}
      {show('story') && (
      <section className="relative isolate w-full overflow-hidden bg-slate-950 text-white py-20 lg:py-28">
        <div className="relative mx-auto w-full max-w-[92rem] px-5 sm:px-8 lg:px-12">
        <Ambient tone="amber" scheme="dark" />
        {/* A slow sweep centred on the timeline — the watch being kept, and
            something in the wide gutters either side of the frames. */}
        <div
          aria-hidden
          className="animate-radar-sweep pointer-events-none absolute left-1/2 top-1/3 h-[70rem] w-[70rem] -translate-x-1/2 rounded-full opacity-[0.05] motion-reduce:animate-none"
          style={{
            background:
              'conic-gradient(from 0deg, transparent 0deg, rgba(255,255,255,0.9) 26deg, transparent 58deg)',
            animationDuration: '48s',
          }}
        />
          <Reveal>
            <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:items-end lg:gap-16">
              <div className="min-w-0">
                <Eyebrow tone="text-amber-400" dark>One night, minute by minute</Eyebrow>
                <h2 className="mt-5 max-w-[18ch] text-[clamp(1.9rem,4.2vw,3.4rem)] font-extrabold leading-[1.05] tracking-[-0.03em]">
                  <BlockReveal tone="amber">A perimeter breach, <Mark tone="amber" className="text-slate-950">end to end</Mark>.</BlockReveal>
                </h2>
              </div>
              <p className="min-w-0 text-base leading-relaxed text-slate-400 lg:text-lg">
                Every timestamp below is recorded by the platform itself. Nobody types these in
                afterwards — which is exactly the point.
              </p>
            </div>
          </Reveal>

          <div className="relative mt-12 lg:mt-16">
            <div
              aria-hidden
              className="absolute bottom-0 left-[7px] top-2 w-px overflow-hidden bg-gradient-to-b from-red-500 via-sky-400 to-emerald-500 opacity-40 lg:left-1/2 lg:-translate-x-1/2"
            >
              {/* A scan running the length of the rail. Its height is a share
                  of the rail, so the 420% travel in the keyframe covers the
                  whole run whatever the section ends up measuring. */}
              <span className="animate-rail-pulse absolute inset-x-0 top-0 block h-[24%] bg-gradient-to-b from-transparent via-white to-transparent motion-reduce:hidden" />
            </div>
            <div className="flex flex-col gap-6 lg:gap-8">
              {FRAMES.map((f, i) => {
                const right = i % 2 === 1;
                return (
                  <div key={f.no} className="relative pl-9 lg:grid lg:grid-cols-2 lg:gap-12 lg:pl-0">
                    <span
                      aria-hidden
                      className={`absolute left-0 top-2 h-4 w-4 rounded-full ring-4 ${f.dot} ${f.ring} lg:left-1/2 lg:-translate-x-1/2`}
                    />
                    <Reveal className={`min-w-0 ${right ? 'lg:col-start-2' : 'lg:col-start-1 lg:row-start-1'}`}>
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
      )}

      {/* ══ RESPONSE TARGETS ═══════════════════════════════════════════ */}
      {show('targets') && (
      <section className="relative isolate w-full overflow-hidden bg-[hsl(var(--background))] py-20 lg:py-28">
        <div className="relative mx-auto w-full max-w-[92rem] px-5 sm:px-8 lg:px-12">
        <Ambient tone="sky" />
          <div className="grid gap-10 lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)] lg:items-center lg:gap-16">
            {/* min-w-0 on both tracks: grid items default to min-width:auto and
                refuse to shrink below their content, so the table's min-w-[30rem]
                would otherwise force this whole section wider than a phone. */}
            <Reveal className="min-w-0">
              <div>
                <Eyebrow tone="text-orange-600">Response targets</Eyebrow>
                <h2 className="mt-5 max-w-[18ch] text-[clamp(1.9rem,4.2vw,3.4rem)] font-extrabold leading-[1.05] tracking-[-0.03em]">
                  <BlockReveal tone="brand">Every incident gets <Mark tone="brand" className="text-white">a clock</Mark>.</BlockReveal>
                </h2>
                <p className="mt-5 max-w-[52ch] text-base leading-relaxed text-[hsl(var(--muted))] lg:text-lg">
                  Severity is chosen once, at the scene. From that moment the platform knows when the
                  incident must be resolved and how often it must be updated — and it chases the
                  deadline itself rather than waiting to be asked.
                </p>
                <ul className="mt-6 grid gap-2.5">
                  {[
                    'The countdown starts the second it is filed',
                    'Change the severity and the clock recalculates',
                    'A lapse notifies the whole chain, not just one inbox',
                  ].map((t) => (
                    <li key={t} className="flex items-start gap-2.5 text-[0.95rem] text-[hsl(var(--muted))]">
                      <Check className="mt-0.5 h-4 w-4 shrink-0 text-orange-600" />
                      {t}
                    </li>
                  ))}
                </ul>
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
                      <tr key={sev} className="transition-colors hover:bg-[hsl(var(--background))]">
                        <td className="border-b px-5 py-4">
                          <span
                            className="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold"
                            style={{ backgroundColor: `${SEVERITY_COLORS[sev]}1a`, color: SEVERITY_COLORS[sev] }}
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
      )}

      {/* ══ CONSOLE SHOWCASE ═══════════════════════════════════════════ */}
      {show('console') && (
      <section id="console" className="relative isolate w-full scroll-mt-16 overflow-hidden bg-slate-900 text-white py-20 lg:py-28">
        <div className="relative mx-auto w-full max-w-[92rem] px-5 sm:px-8 lg:px-12">
        <div
          aria-hidden
          className="animate-breathe pointer-events-none absolute inset-0 bg-[radial-gradient(1000px_500px_at_50%_0%,rgba(102,126,234,0.25),transparent_65%)] motion-reduce:animate-none"
        />
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
      )}

      {/* ══ CAPABILITIES ═══════════════════════════════════════════════ */}
      {show('realtime') && (
      <section className="relative isolate w-full overflow-hidden bg-[hsl(var(--background))] py-20 lg:py-28">
        <div className="relative mx-auto w-full max-w-[92rem] px-5 sm:px-8 lg:px-12">
        <Ambient tone="sky" />
          <Reveal>
            <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:items-end lg:gap-16">
              <div className="min-w-0">
                <Eyebrow tone="text-sky-500">Realtime, meant literally</Eyebrow>
                <h2 className="mt-5 max-w-[16ch] text-[clamp(1.9rem,4.2vw,3.4rem)] font-extrabold leading-[1.05] tracking-[-0.03em]">
                  <BlockReveal tone="green">Nothing here <Mark tone="green" className="text-white">waits</Mark> to be asked.</BlockReveal>
                </h2>
              </div>
              <p className="min-w-0 text-base leading-relaxed text-[hsl(var(--muted))] lg:text-lg">
                The database pushes changes to every screen the moment they are written. No polling,
                no refresh button, no wondering whether what you are looking at is current.
              </p>
            </div>
          </Reveal>

          <CardDeck offset className="mt-10 grid gap-5 sm:grid-cols-2 lg:mt-14 lg:grid-cols-3 lg:gap-6">
            {CAPABILITIES.map((c) => (
              <SiteCard key={c.tag} tone="green" className="h-full">
                <div className="flex items-center gap-2.5">
                  <c.icon className={`h-[18px] w-[18px] ${c.accent}`} />
                  <p className={`text-[0.68rem] font-bold uppercase tracking-[0.16em] ${c.accent}`}>{c.tag}</p>
                </div>
                <h3 className="mb-2 mt-4 text-lg font-bold leading-snug tracking-tight">{c.title}</h3>
                <p className="text-[0.95rem] leading-relaxed text-[hsl(var(--muted))]">{c.body}</p>
              </SiteCard>
            ))}
          </CardDeck>
        </div>
      </section>
      )}

      {/* ══ THE FIELD APP ══════════════════════════════════════════════ */}
      {show('field') && (
      <section className="relative isolate w-full overflow-hidden bg-[hsl(var(--background))] py-20 lg:py-28">
        <div className="relative mx-auto w-full max-w-[92rem] px-5 sm:px-8 lg:px-12">
          <Reveal>
            <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:items-end lg:gap-16">
              <div className="min-w-0">
                <Eyebrow tone="text-emerald-600">In the field</Eyebrow>
                <h2 className="mt-5 max-w-[18ch] text-[clamp(1.9rem,4.2vw,3.4rem)] font-extrabold leading-[1.05] tracking-[-0.03em]">
                  <BlockReveal tone="green">The whole shift, from <Mark tone="green" className="text-white">one handset</Mark>.</BlockReveal>
                </h2>
              </div>
              <p className="min-w-0 text-base leading-relaxed text-[hsl(var(--muted))] lg:text-lg">
                Officers do not carry a laptop, and they should not have to remember a password at two
                in the morning. The field app is built for gloved hands, poor light and worse signal.
              </p>
            </div>
          </Reveal>

          <CardDeck className="mt-10 grid gap-5 sm:grid-cols-2 lg:mt-14 lg:grid-cols-3 lg:gap-6">
            {FIELD_APP.map((f) => (
              <SiteCard key={f.title} tone="green" className="flex h-full gap-4 !p-5">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-600">
                  <f.icon className="h-5 w-5" />
                </span>
                <div className="min-w-0">
                  <h3 className="text-base font-bold tracking-tight">{f.title}</h3>
                  <p className="mt-1.5 text-sm leading-relaxed text-[hsl(var(--muted))]">{f.body}</p>
                </div>
              </SiteCard>
            ))}
          </CardDeck>
        </div>
      </section>
      )}

      {/* ══ ROLES ══════════════════════════════════════════════════════ */}
      {show('who') && (
      <section className="relative isolate w-full overflow-hidden bg-slate-950 text-white py-20 lg:py-28">
        <div className="relative mx-auto w-full max-w-[92rem] px-5 sm:px-8 lg:px-12">
        <Ambient tone="brand" scheme="dark" />
        <Constellation />
          <Reveal>
            <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:items-end lg:gap-16">
              <div className="min-w-0">
                <Eyebrow tone="text-indigo-300" dark>Who it is for</Eyebrow>
                <h2 className="mt-5 max-w-[16ch] text-[clamp(1.9rem,4.2vw,3.4rem)] font-extrabold leading-[1.05] tracking-[-0.03em]">
                  <BlockReveal tone="brand">Six roles, <Mark tone="brand" className="text-white">one version</Mark> of the truth.</BlockReveal>
                </h2>
              </div>
              <p className="min-w-0 text-base leading-relaxed text-slate-400 lg:text-lg">
                Everyone sees the same records, filtered to what their job needs. Nobody keeps a
                private spreadsheet, because there is nothing the system does not already hold.
              </p>
            </div>
          </Reveal>

          <CardDeck offset className="mt-10 grid gap-5 md:grid-cols-2 lg:mt-14 lg:grid-cols-3 lg:gap-6">
            {ROLES.map((r) => (
              <SiteCard key={r.role} tone="brand" surface="dark" className="h-full">
                <div className="flex items-center gap-3">
                  <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/[0.06]">
                    <r.icon className={`h-5 w-5 ${r.accent.split(' ')[0]}`} />
                  </span>
                  <span className={`inline-block rounded-full border px-3 py-0.5 text-[0.7rem] font-bold uppercase tracking-[0.1em] ${r.accent}`}>
                    {r.role}
                  </span>
                </div>
                <p className="mt-4 text-base font-bold leading-snug">{r.lead}</p>
                <p className="mt-1.5 text-[0.95rem] leading-relaxed text-slate-400">{r.body}</p>
              </SiteCard>
            ))}
          </CardDeck>
        </div>
      </section>
      )}

      {/* ══ PLATFORM ═══════════════════════════════════════════════════ */}
      {show('underneath') && (
      <section className="relative isolate w-full overflow-hidden bg-[hsl(var(--background))] py-20 lg:py-28">
        <div className="relative mx-auto w-full max-w-[92rem] px-5 sm:px-8 lg:px-12">
        <Ambient tone="brand" />
          <Reveal>
            <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:items-end lg:gap-16">
              <div className="min-w-0">
                <Eyebrow tone="text-slate-500">Underneath</Eyebrow>
                <h2 className="mt-5 max-w-[18ch] text-[clamp(1.9rem,4.2vw,3.4rem)] font-extrabold leading-[1.05] tracking-[-0.03em]">
                  <BlockReveal tone="violet">Built to <Mark tone="violet" className="text-white">hold up</Mark> in a dispute.</BlockReveal>
                </h2>
              </div>
              <p className="min-w-0 text-base leading-relaxed text-[hsl(var(--muted))] lg:text-lg">
                A security record is only worth what it can prove. These are the parts that make the
                platform trustworthy when somebody starts asking hard questions.
              </p>
            </div>
          </Reveal>

          <CardDeck className="mt-10 grid gap-5 sm:grid-cols-2 lg:mt-14 lg:grid-cols-3 lg:gap-6">
            {PLATFORM.map((p) => (
              <SiteCard key={p.title} tone="default" className="h-full">
                <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-500/10 text-slate-500">
                  <p.icon className="h-5 w-5" />
                </span>
                <h3 className="mt-4 text-lg font-bold tracking-tight">{p.title}</h3>
                <p className="mt-2 text-[0.95rem] leading-relaxed text-[hsl(var(--muted))]">{p.body}</p>
              </SiteCard>
            ))}
          </CardDeck>
        </div>
      </section>
      )}

      {/* ══ OUTCOME ════════════════════════════════════════════════════ */}
      {show('outcome') && (
      <section className="relative isolate w-full overflow-hidden bg-[hsl(var(--background))] py-20 lg:py-28">
        <div className="relative mx-auto w-full max-w-[92rem] px-5 sm:px-8 lg:px-12">
          <Reveal>
            <Eyebrow tone="text-emerald-600">The outcome</Eyebrow>
            <h2 className="mt-5 max-w-[22ch] text-[clamp(1.9rem,4.2vw,3.4rem)] font-extrabold leading-[1.05] tracking-[-0.03em]">
              <BlockReveal tone="brand">From a book nobody reads to a record <Mark tone="brand" className="text-white">nobody can dispute</Mark>.</BlockReveal>
            </h2>
          </Reveal>

          <div className="mt-10 grid gap-5 lg:mt-14 lg:grid-cols-2 lg:gap-8">
            <Reveal>
              <div className="h-full rounded-2xl border border-red-500/25 bg-red-500/[0.04] p-6 lg:p-8">
                <p className="flex items-center gap-2 text-[0.7rem] font-bold uppercase tracking-[0.16em] text-red-600">
                  <AlertTriangle className="h-4 w-4" /> Before
                </p>
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
                <p className="flex items-center gap-2 text-[0.7rem] font-bold uppercase tracking-[0.16em] text-emerald-600">
                  <TrendingUp className="h-4 w-4" /> After
                </p>
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
      )}

      {/* ══ FAQ ════════════════════════════════════════════════════════ */}
      {show('faq') && (
      <section className="relative isolate w-full overflow-hidden bg-[hsl(var(--background))] py-20 lg:py-28">
        <div className="relative mx-auto w-full max-w-[92rem] px-5 sm:px-8 lg:px-12">
        <Ambient tone="emerald" />
          <Reveal>
            <Eyebrow tone="text-brand">Questions</Eyebrow>
            <h2 className="mt-5 max-w-[20ch] text-[clamp(1.9rem,4.2vw,3.4rem)] font-extrabold leading-[1.05] tracking-[-0.03em]">
              <BlockReveal tone="brand">The things operations managers <Mark tone="brand" className="text-white">ask first</Mark>.</BlockReveal>
            </h2>
          </Reveal>

          <CardDeck className="mt-10 grid gap-5 lg:mt-14 lg:grid-cols-2 lg:gap-x-6 lg:gap-y-5" step={45}>
            {FAQ.map((f) => (
              <SiteCard key={f.q} tone="brand" className="h-full">
                <h3 className="text-base font-bold tracking-tight">{f.q}</h3>
                <p className="mt-2.5 text-[0.95rem] leading-relaxed text-[hsl(var(--muted))]">{f.a}</p>
              </SiteCard>
            ))}
          </CardDeck>
        </div>
      </section>
      )}

      {/* ══ CLOSE ══════════════════════════════════════════════════════ */}
      {show('confidential') && (
      <section className="relative isolate w-full overflow-hidden bg-brand-gradient py-24 text-center text-white lg:py-32">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 bg-[radial-gradient(900px_450px_at_50%_-20%,rgba(255,255,255,0.25),transparent_60%)]"
        />
        {/* The hero's sweep, returning to close the page */}
        <div
          aria-hidden
          className="animate-radar-sweep pointer-events-none absolute -top-[34rem] left-1/2 h-[52rem] w-[52rem] -translate-x-1/2 rounded-full opacity-[0.13] motion-reduce:animate-none"
          style={{
            background:
              'conic-gradient(from 0deg, transparent 0deg, rgba(255,255,255,0.9) 30deg, transparent 64deg)',
            animationDuration: '22s',
          }}
        />
        <div className="mx-auto w-full max-w-[60rem]">
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
      )}

      {showFooter && (
      <footer className="w-full bg-slate-950 py-8 text-slate-500">
        <div className="mx-auto flex w-full max-w-[92rem] flex-wrap items-center justify-between gap-3 px-5 text-sm sm:px-8 lg:px-12">
          <span className="flex items-center gap-2">
            <Logo className="text-lg" onDark />
            <span className="text-slate-500">— {BRAND.tagline}</span>
          </span>
          <span>Proprietary &amp; confidential</span>
        </div>
      </footer>
      )}
    </main>
  );
}
