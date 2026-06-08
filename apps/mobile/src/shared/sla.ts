// ============================================================================
// DigiLog 360 — SLA helpers (client-side mirror of the DB functions)
// ============================================================================
import { SLA_CONFIG } from './constants';
import type { SeverityLevel, OccurrenceStatus } from './types';

const TERMINAL: OccurrenceStatus[] = ['resolved', 'closed'];

export function slaResolveHours(severity: SeverityLevel): number {
  return SLA_CONFIG[severity].resolveHours;
}

export function slaUpdateIntervalMinutes(severity: SeverityLevel): number {
  return SLA_CONFIG[severity].updateIntervalMinutes;
}

export function isTerminal(status: OccurrenceStatus): boolean {
  return TERMINAL.includes(status);
}

export function isSlaBreached(o: {
  status: OccurrenceStatus;
  sla_due_at: string | null;
}, now: Date = new Date()): boolean {
  if (isTerminal(o.status) || !o.sla_due_at) return false;
  return now.getTime() > new Date(o.sla_due_at).getTime();
}

export function isSlaUpdateDue(o: {
  status: OccurrenceStatus;
  severity: SeverityLevel;
  last_sla_update_at: string | null;
}, now: Date = new Date()): boolean {
  if (isTerminal(o.status)) return false;
  if (!o.last_sla_update_at) return true;
  const intervalMs = slaUpdateIntervalMinutes(o.severity) * 60_000;
  return now.getTime() >= new Date(o.last_sla_update_at).getTime() + intervalMs;
}

/** Minutes until SLA breach (negative once breached). Null when terminal/no due date. */
export function minutesRemaining(o: {
  status: OccurrenceStatus;
  sla_due_at: string | null;
}, now: Date = new Date()): number | null {
  if (isTerminal(o.status) || !o.sla_due_at) return null;
  return Math.round((new Date(o.sla_due_at).getTime() - now.getTime()) / 60_000);
}

/** Human label like "2h 15m left" / "1h 30m overdue". */
export function formatTimeRemaining(mins: number | null): string {
  if (mins === null) return '—';
  const overdue = mins < 0;
  const abs = Math.abs(mins);
  const h = Math.floor(abs / 60);
  const m = abs % 60;
  const body = h > 0 ? `${h}h ${m}m` : `${m}m`;
  return overdue ? `${body} overdue` : `${body} left`;
}

export function formatObNumber(seq: number): string {
  return 'OB' + String(seq).padStart(4, '0');
}
