// ============================================================================
// DigiLog 360 — shared domain constants
// ============================================================================
import type { AppRole, SeverityLevel, OccurrenceStatus, ScanMethod } from './types';

export const APP_ROLES: AppRole[] = ['admin', 'control_room', 'supervisor', 'guard'];

export const ROLE_LABELS: Record<AppRole, string> = {
  admin: 'Administrator',
  control_room: 'Control Room',
  supervisor: 'Supervisor',
  guard: 'Guard',
};

/** Roles that operate the admin web console. */
export const WEB_ROLES: AppRole[] = ['admin', 'control_room', 'supervisor'];
/** Roles that operate the mobile field app. */
export const MOBILE_ROLES: AppRole[] = ['guard', 'supervisor'];

export const SEVERITIES: SeverityLevel[] = ['critical', 'high', 'medium', 'low'];

export const SEVERITY_LABELS: Record<SeverityLevel, string> = {
  critical: 'Critical',
  high: 'High',
  medium: 'Medium',
  low: 'Low',
};

/** Brand-aligned colours for severity chips (hex, usable in web + native). */
export const SEVERITY_COLORS: Record<SeverityLevel, string> = {
  critical: '#dc2626',
  high: '#ea580c',
  medium: '#ca8a04',
  low: '#16a34a',
};

export const OCCURRENCE_STATUSES: OccurrenceStatus[] = [
  'open', 'acknowledged', 'in_progress', 'on_patrol', 'resolved', 'closed',
];

export const STATUS_LABELS: Record<OccurrenceStatus, string> = {
  open: 'Open',
  acknowledged: 'Acknowledged',
  in_progress: 'In Progress',
  on_patrol: 'On Patrol',
  resolved: 'Resolved',
  closed: 'Closed',
};

export const STATUS_COLORS: Record<OccurrenceStatus, string> = {
  open: '#3b82f6',
  acknowledged: '#8b5cf6',
  in_progress: '#0ea5e9',
  on_patrol: '#14b8a6',
  resolved: '#16a34a',
  closed: '#64748b',
};

export const TERMINAL_STATUSES: OccurrenceStatus[] = ['resolved', 'closed'];

export const SCAN_METHODS: ScanMethod[] = ['qr', 'nfc', 'gps', 'manual'];

export const SCAN_METHOD_LABELS: Record<ScanMethod, string> = {
  qr: 'QR Code',
  nfc: 'NFC Tag',
  gps: 'GPS',
  manual: 'Manual',
};

/** Common occurrence types (the legacy app used free text; these seed the picker). */
export const OCCURRENCE_TYPES = [
  'Patrol',
  'Theft',
  'Trespassing',
  'Suspicious Activity',
  'Vandalism',
  'Medical Emergency',
  'Fire',
  'Access Control',
  'Equipment Fault',
  'Alarm Activation',
  'Vehicle Incident',
  'Other',
] as const;

/** SLA rules per severity — mirrors the database functions. */
export const SLA_CONFIG: Record<SeverityLevel, { resolveHours: number; updateIntervalMinutes: number }> = {
  critical: { resolveHours: 1, updateIntervalMinutes: 30 },
  high: { resolveHours: 4, updateIntervalMinutes: 60 },
  medium: { resolveHours: 24, updateIntervalMinutes: 360 },
  low: { resolveHours: 168, updateIntervalMinutes: 1440 },
};

export const STORAGE_BUCKET = 'occurrence-images';

/** Prefix wrapped around a checkpoint's qr_token when encoded into a QR label. */
export const CHECKPOINT_QR_PREFIX = 'DIGILOG-CP:';

export function encodeCheckpointQr(token: string): string {
  return CHECKPOINT_QR_PREFIX + token;
}

/** Returns the bare token if `value` is a DigiLog checkpoint QR, else null. */
export function decodeCheckpointQr(value: string): string | null {
  return value.startsWith(CHECKPOINT_QR_PREFIX)
    ? value.slice(CHECKPOINT_QR_PREFIX.length)
    : null;
}

export const BRAND = {
  name: 'DigiLog 360',
  company: 'Netstream Integrated Solutions',
  // Signature gradient carried over from the legacy console.
  gradientFrom: '#667eea',
  gradientTo: '#764ba2',
  primary: '#667eea',
};
