'use client';

import { useEffect, useRef, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { SEVERITY_COLORS, SEVERITY_LABELS, type SeverityLevel } from '@digilog/shared';

interface Row {
  ref: string;
  type: string;
  where: string;
  severity: SeverityLevel;
  seconds: number;
  fresh?: boolean;
}

// Sample board only — generic locations, nothing identifies a real site.
const INITIAL: Row[] = [
  { ref: 'OB11430', type: 'Alarm activation', where: 'Plant room', severity: 'critical', seconds: 212 },
  { ref: 'OB11431', type: 'Attempted break-in', where: 'Loading bay', severity: 'high', seconds: 1985 },
  { ref: 'OB11429', type: 'Suspicious vehicle', where: 'Visitor entrance', severity: 'medium', seconds: 9240 },
  { ref: 'OB11427', type: 'Lighting fault', where: 'Yard', severity: 'low', seconds: 41300 },
];

const INCOMING: Row[] = [
  { ref: 'OB11435', type: 'Panic button activated', where: 'Reception desk', severity: 'critical', seconds: 3600 },
  { ref: 'OB11436', type: 'Fire alarm', where: 'Storage level 2', severity: 'critical', seconds: 3600 },
  { ref: 'OB11437', type: 'Theft reported', where: 'Staff entrance', severity: 'high', seconds: 14400 },
];

const RAIL: Record<SeverityLevel, string> = {
  critical: 'border-l-red-600 bg-gradient-to-r from-red-600/10 to-transparent',
  high: 'border-l-orange-600 bg-gradient-to-r from-orange-600/10 to-transparent',
  medium: 'border-l-amber-600 bg-gradient-to-r from-amber-600/[0.09] to-transparent',
  low: 'border-l-green-600 bg-gradient-to-r from-green-600/[0.08] to-transparent',
};

function countdown(total: number) {
  if (total <= 0) return 'BREACHED';
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return h > 0 ? `${h}h ${String(m).padStart(2, '0')}m` : `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

function slaClass(total: number) {
  if (total <= 0) return 'text-red-600';
  if (total < 900) return 'text-amber-600';
  return 'text-green-600';
}

/**
 * A working miniature of the Live Occurrences board: response clocks that
 * genuinely run, and new incidents that arrive on their own — the same way
 * they land in the real console.
 */
export function LiveBoard() {
  const [rows, setRows] = useState<Row[]>(INITIAL);
  const [open, setOpen] = useState(18);
  const [critical, setCritical] = useState(3);
  const [stamp, setStamp] = useState('now');
  const hostRef = useRef<HTMLDivElement>(null);
  const started = useRef(false);

  // Clocks tick every second.
  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const id = setInterval(() => {
      setRows((prev) => prev.map((r) => ({ ...r, seconds: r.seconds - 1, fresh: false })));
    }, 1000);
    return () => clearInterval(id);
  }, []);

  // New incidents arrive once the board is actually on screen.
  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const el = hostRef.current;
    if (!el || typeof IntersectionObserver === 'undefined') return;

    const timers: ReturnType<typeof setTimeout>[] = [];
    const io = new IntersectionObserver(
      (entries) => {
        if (!entries[0]?.isIntersecting || started.current) return;
        started.current = true;
        io.disconnect();

        INCOMING.forEach((row, i) => {
          timers.push(
            setTimeout(() => {
              setRows((prev) => [{ ...row, fresh: true }, ...prev]);
              setOpen((n) => n + 1);
              if (row.severity === 'critical') setCritical((n) => n + 1);
              setStamp('just now');
            }, 3000 + i * 11000),
          );
        });
      },
      { threshold: 0.2 },
    );
    io.observe(el);
    return () => {
      io.disconnect();
      timers.forEach(clearTimeout);
    };
  }, []);

  return (
    // The board sits inside a dark, `text-white` section but renders on the
    // app surface, so it must state its own foreground colour — otherwise
    // every cell without an explicit colour inherits white and disappears.
    <div ref={hostRef} className="text-[hsl(var(--foreground))]">
      <div className="mb-4 grid grid-cols-2 overflow-hidden rounded-xl border sm:grid-cols-3 lg:grid-cols-5">
        <Kpi value={open} label="Open" />
        <Kpi value={critical} label="Critical" tone="text-red-600" />
        <Kpi value={2} label="Update due" tone="text-amber-600" />
        <Kpi value={7} label="On patrol" tone="text-sky-600" />
        <Kpi value={41} label="On site" />
      </div>

      <div className="overflow-x-auto rounded-xl border">
        <table className="w-full min-w-[660px] border-collapse bg-[hsl(var(--surface))]">
          <thead>
            <tr>
              {['Reference', 'Type', 'Location', 'Severity', 'Resolve within'].map((h) => (
                <th
                  key={h}
                  scope="col"
                  className="border-b bg-[hsl(var(--background))] px-4 py-2.5 text-left text-[0.68rem] font-bold uppercase tracking-wider text-[hsl(var(--muted))]"
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr
                key={r.ref}
                className={`border-l-[5px] ${RAIL[r.severity]} ${r.fresh ? 'animate-flash-in' : ''}`}
              >
                <td className="border-b px-4 py-2.5 font-mono text-sm font-bold text-[hsl(var(--foreground))]">
                  {r.ref}
                </td>
                <td className="border-b px-4 py-2.5 text-sm text-[hsl(var(--foreground))]">{r.type}</td>
                <td className="border-b px-4 py-2.5 text-sm text-[hsl(var(--muted))]">{r.where}</td>
                <td className="border-b px-4 py-2.5">
                  <Badge color={SEVERITY_COLORS[r.severity]}>{SEVERITY_LABELS[r.severity]}</Badge>
                </td>
                <td
                  className={`whitespace-nowrap border-b px-4 py-2.5 font-mono text-sm font-bold tabular-nums ${slaClass(r.seconds)}`}
                >
                  {countdown(r.seconds)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="mt-3 flex flex-wrap gap-x-3 gap-y-1 text-xs text-[hsl(var(--muted))]">
        <span>
          Updated <span className="font-mono">{stamp}</span>
        </span>
        <span>·</span>
        <span>Streaming over websockets — no polling, no refresh button</span>
      </p>
    </div>
  );
}

function Kpi({ value, label, tone }: { value: number; label: string; tone?: string }) {
  return (
    <div className="border-b border-r bg-[hsl(var(--surface))] px-4 py-3 last:border-r-0">
      <b
        className={`block text-2xl font-extrabold tabular-nums tracking-tight ${
          tone ?? 'text-[hsl(var(--foreground))]'
        }`}
      >
        {value}
      </b>
      <span className="text-[0.68rem] font-semibold uppercase tracking-wider text-[hsl(var(--muted))]">
        {label}
      </span>
    </div>
  );
}
