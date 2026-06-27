// ============================================================================
// DigiLog 360 — shared domain constants
// ============================================================================
import type { AppRole, SeverityLevel, OccurrenceStatus, ScanMethod, ManagerDecision } from './types';

export const APP_ROLES: AppRole[] = [
  'super_user', 'admin', 'manager', 'control_room', 'supervisor', 'guard',
];

export const ROLE_LABELS: Record<AppRole, string> = {
  super_user: 'Super User',
  admin: 'Administrator',
  manager: 'Manager',
  control_room: 'Control Room',
  supervisor: 'Supervisor',
  guard: 'Guard',
};

/** Per-role accent colours (hex) for badges/pills — web + native. */
export const ROLE_COLORS: Record<AppRole, string> = {
  super_user: '#4f46e5',  // indigo
  admin: '#dc2626',       // red
  manager: '#7c3aed',     // violet
  control_room: '#d97706',// amber
  supervisor: '#0891b2',  // cyan
  guard: '#16a34a',       // green
};

export const ROLE_DESCRIPTIONS: Record<AppRole, string> = {
  super_user: 'Cross-organization owner. Manages all tenants, billing, impersonation.',
  admin: 'Full control of a single organization. Manages users, sites and settings.',
  manager: 'Reviews and acknowledges occurrences. Oversees site quality and SLA.',
  control_room: 'Operates the live SLA dashboard. Logs and updates incidents.',
  supervisor: 'Field oversight. Approves patrols and verifies on-scene reports.',
  guard: 'Mobile field officer. Logs occurrences, runs patrols, scans checkpoints.',
};

/** Roles that operate the admin web console. */
export const WEB_ROLES: AppRole[] = ['super_user', 'admin', 'manager', 'control_room', 'supervisor'];
/** Roles that operate the mobile field app. */
export const MOBILE_ROLES: AppRole[] = ['guard', 'supervisor'];
/** Roles that can write occurrence updates / reports. */
export const REVIEW_ROLES: AppRole[] = ['admin', 'manager', 'control_room', 'supervisor'];
/** Roles that have admin-level CRUD inside an org. */
export const ORG_ADMIN_ROLES: AppRole[] = ['admin', 'super_user'];

/** Returns true if `actor` has at least the same permission level as `target`. */
const ROLE_RANK: Record<AppRole, number> = {
  super_user: 100,
  admin: 80,
  manager: 60,
  control_room: 50,
  supervisor: 40,
  guard: 20,
};
export function roleRank(role: AppRole): number {
  return ROLE_RANK[role] ?? 0;
}
export function canActAs(actor: AppRole, target: AppRole): boolean {
  return roleRank(actor) >= roleRank(target);
}

// ----------------------------------------------------------------------------
// Multi-role helpers — accept anything with a role / roles shape so they work
// with the Profile type AND with edge-function JWT payloads.
// ----------------------------------------------------------------------------
type WithRoles = { role?: AppRole | null; roles?: AppRole[] | null };

/** Returns the full role set, falling back to `[role]` if `roles` is absent. */
export function profileRoles(p: WithRoles | null | undefined): AppRole[] {
  if (!p) return [];
  if (Array.isArray(p.roles) && p.roles.length > 0) return p.roles;
  if (p.role) return [p.role];
  return [];
}

/** Primary role (used for default landing routes and display defaults). */
export function primaryRole(p: WithRoles | null | undefined): AppRole | null {
  const r = profileRoles(p);
  return r[0] ?? null;
}

export function hasRole(p: WithRoles | null | undefined, role: AppRole): boolean {
  return profileRoles(p).includes(role);
}

export function hasAnyRole(p: WithRoles | null | undefined, roles: AppRole[]): boolean {
  const mine = profileRoles(p);
  return roles.some((r) => mine.includes(r));
}

export function isSuperUserMulti(p: WithRoles | null | undefined): boolean {
  return hasRole(p, 'super_user');
}

export function isOrgAdminMulti(p: WithRoles | null | undefined): boolean {
  return hasAnyRole(p, ['admin', 'super_user']);
}

export function isManagerMulti(p: WithRoles | null | undefined): boolean {
  return hasAnyRole(p, ['manager', 'admin', 'super_user']);
}

// ----------------------------------------------------------------------------
// Capability map — drives the My Access page.
// ----------------------------------------------------------------------------
export interface Capability {
  area: string;
  label: string;
}

export const ROLE_CAPABILITIES: Record<AppRole, Capability[]> = {
  super_user: [
    { area: 'Tenancy', label: 'Create, suspend and edit any organisation' },
    { area: 'Tenancy', label: 'Move users between organisations' },
    { area: 'Visibility', label: 'See every record across every tenant' },
    { area: 'Users', label: 'Grant any role including super_user' },
    { area: 'Platform', label: 'Cross-org health dashboard, audit log and live SLA' },
  ],
  admin: [
    { area: 'Users', label: 'Create, edit and deactivate users in your organisation' },
    { area: 'Users', label: 'Grant any role except super_user' },
    { area: 'Sites', label: 'Create, edit and deactivate sites' },
    { area: 'Settings', label: 'Edit organisation branding, SLA matrix, custom types' },
    { area: 'Settings', label: 'Create webhooks and API tokens' },
    { area: 'Occurrences', label: 'View, edit, soft-delete any occurrence in the org' },
    { area: 'Audit', label: 'View the audit log' },
  ],
  manager: [
    { area: 'Occurrences', label: 'Review and acknowledge any occurrence' },
    { area: 'Occurrences', label: 'Escalate or reject incoming logs' },
    { area: 'Occurrences', label: 'Comment on any occurrence in the org' },
    { area: 'Reports', label: 'Read every occurrence report' },
    { area: 'Field ops', label: 'Configure patrol schedules and routes' },
    { area: 'Visibility', label: 'Live SLA board and team status' },
  ],
  control_room: [
    { area: 'Occurrences', label: 'Log incidents, post status updates, write reports' },
    { area: 'Occurrences', label: 'Close, resolve and mark in-progress' },
    { area: 'Visibility', label: 'Live SLA dashboard with realtime updates' },
    { area: 'Field ops', label: 'Manage checkpoints, end patrols remotely' },
    { area: 'Visitor log', label: 'Sign visitors in/out' },
  ],
  supervisor: [
    { area: 'Occurrences', label: 'Log, update and report on incidents at your site' },
    { area: 'Field ops', label: 'Oversee patrols, scan checkpoints' },
    { area: 'Visibility', label: 'See your site\'s occurrences and team' },
    { area: 'Mobile', label: 'Full mobile app access — patrol + log + scan' },
  ],
  guard: [
    { area: 'Mobile', label: 'PIN login to the field app' },
    { area: 'Occurrences', label: 'Log new occurrences with photos' },
    { area: 'Patrols', label: 'Start/end patrols and scan checkpoints (QR / NFC / GPS)' },
    { area: 'Personal', label: 'View own logs and shifts' },
  ],
};

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

export const MANAGER_DECISIONS: ManagerDecision[] = ['acknowledged', 'escalated', 'rejected'];
export const MANAGER_DECISION_LABELS: Record<ManagerDecision, string> = {
  acknowledged: 'Acknowledged',
  escalated: 'Escalated',
  rejected: 'Rejected',
};
export const MANAGER_DECISION_COLORS: Record<ManagerDecision, string> = {
  acknowledged: '#16a34a',
  escalated: '#ea580c',
  rejected: '#dc2626',
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

// ---------------------------------------------------------------------------
// Incident classification taxonomy.
//
// 3 cascading levels:
//   1. category    — one of 3 top-level buckets (Security / Safety / Site)
//   2. subcategory — narrows the category (e.g. "Criminal incident")
//   3. type        — the specific incident (e.g. "Armed Robbery")
//
// Source of truth for both the mobile pickers and the admin dropdowns.
// Adding a new option means editing this object — the UIs read it directly.
// ---------------------------------------------------------------------------
export const INCIDENT_TAXONOMY = {
  'Security Incidents': {
    'Criminal incident': [
      'Armed Robbery',
      'Attempted Theft',
      'Bomb Threat Call',
      'Damage to Products',
      'Damage to Property',
      'Suspected Theft',
      'Trespassing',
    ],
    'External Incident': [
      'Suspicious Movement around fence',
    ],
  },
  'Safety Incidents': {
    'EHS Incident': [
      'Medical Emergency',
      'Injury on duty',
      'Near miss',
      'Off-Site Evacuation',
      'Smoke/Fire',
      'Physical Fights',
      'Alcohol Test',
      'Falling Objects',
      'Hazardous material spills',
      'Electrical hazards',
    ],
  },
  'Site Related Reports': {
    'Warehouse': ['Opening & Closing RTT warehouse'],
    'Gates': ['Opening and closing of gates'],
    'Perimeter fence': ['Perimeter fence checks'],
    'Admin Building': ['Opening & Closing of Admin Building'],
    'Waste Area': ['Collection of waste bins'],
    'Site Lights': ['Lights not working on site'],
  },
} as const satisfies Record<string, Record<string, readonly string[]>>;

export type IncidentCategory = keyof typeof INCIDENT_TAXONOMY;
export type IncidentSubcategory<C extends IncidentCategory> = keyof typeof INCIDENT_TAXONOMY[C];

export const INCIDENT_CATEGORIES: IncidentCategory[] =
  Object.keys(INCIDENT_TAXONOMY) as IncidentCategory[];

/** Subcategories under a given category, in declaration order. */
export function getSubcategories(category: string | null | undefined): string[] {
  if (!category || !(category in INCIDENT_TAXONOMY)) return [];
  return Object.keys(INCIDENT_TAXONOMY[category as IncidentCategory]);
}

/** Specific types under a (category, subcategory) pair, in declaration order. */
export function getIncidentTypes(
  category: string | null | undefined,
  subcategory: string | null | undefined,
): string[] {
  if (!category || !subcategory || !(category in INCIDENT_TAXONOMY)) return [];
  const subs = INCIDENT_TAXONOMY[category as IncidentCategory] as Record<string, readonly string[]>;
  return [...(subs[subcategory] ?? [])];
}

/** Org-custom category row, as stored in public.org_incident_categories. */
export interface OrgIncidentCategory {
  name: string;
  is_active: boolean;
  sort_order: number;
}

/** Org-custom sub-category row, as stored in public.org_incident_subcategories. */
export interface OrgIncidentSubcategory {
  category: string;
  name: string;
  is_active: boolean;
  sort_order: number;
}

/** Org-custom type row, as stored in public.org_occurrence_types. */
export interface OrgIncidentType {
  name: string;
  category: string | null;
  subcategory: string | null;
  is_active: boolean;
  sort_order: number;
}

/**
 * Built-in categories + active org-custom categories. Built-ins first
 * (declaration order), org-custom alphabetised after, de-duplicated by
 * lower-case name so an org can't shadow a built-in.
 */
export function mergeIncidentCategories(orgCategories: OrgIncidentCategory[]): string[] {
  const builtin = [...INCIDENT_CATEGORIES] as string[];
  const lowerBuiltin = new Set(builtin.map((c) => c.toLowerCase()));
  const custom = orgCategories
    .filter((c) => c.is_active && !lowerBuiltin.has(c.name.toLowerCase()))
    .sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name))
    .map((c) => c.name);
  return [...builtin, ...custom];
}

/**
 * Built-in sub-categories under the given category + active org-custom
 * sub-categories anchored to the same category name. De-duplicated.
 */
export function mergeIncidentSubcategories(
  category: string | null | undefined,
  orgSubcategories: OrgIncidentSubcategory[],
): string[] {
  const builtin = getSubcategories(category);
  if (!category) return [];
  const lowerBuiltin = new Set(builtin.map((s) => s.toLowerCase()));
  const custom = orgSubcategories
    .filter(
      (s) =>
        s.is_active &&
        s.category.toLowerCase() === category.toLowerCase() &&
        !lowerBuiltin.has(s.name.toLowerCase()),
    )
    .sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name))
    .map((s) => s.name);
  return [...builtin, ...custom];
}

/**
 * Merge built-in taxonomy types with active org-custom types for a given
 * (category, subcategory). Built-ins go first, org-custom alphabetised after.
 * De-duplicates case-insensitively so an org can't accidentally shadow a
 * built-in.
 */
export function mergeIncidentTypes(
  category: string | null | undefined,
  subcategory: string | null | undefined,
  orgTypes: OrgIncidentType[],
): string[] {
  const builtin = getIncidentTypes(category, subcategory);
  if (!category || !subcategory) return builtin;
  const lowerBuiltin = new Set(builtin.map((t) => t.toLowerCase()));
  const custom = orgTypes
    .filter((t) =>
      t.is_active &&
      t.category === category &&
      t.subcategory === subcategory &&
      !lowerBuiltin.has(t.name.toLowerCase()),
    )
    .sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name))
    .map((t) => t.name);
  return [...builtin, ...custom];
}

/** SLA rules per severity — mirrors the database functions. */
export const SLA_CONFIG: Record<SeverityLevel, { resolveHours: number; updateIntervalMinutes: number }> = {
  critical: { resolveHours: 1, updateIntervalMinutes: 30 },
  high: { resolveHours: 4, updateIntervalMinutes: 60 },
  medium: { resolveHours: 24, updateIntervalMinutes: 360 },
  low: { resolveHours: 168, updateIntervalMinutes: 1440 },
};

export const STORAGE_BUCKET = 'occurrence-images';

export const CHECKPOINT_QR_PREFIX = 'DIGILOG-CP:';
export function encodeCheckpointQr(token: string): string {
  return CHECKPOINT_QR_PREFIX + token;
}
export function decodeCheckpointQr(value: string): string | null {
  return value.startsWith(CHECKPOINT_QR_PREFIX)
    ? value.slice(CHECKPOINT_QR_PREFIX.length)
    : null;
}

/** PIN constraints — mirrored in the pin-set / pin-login edge functions. */
export const PIN_LENGTH = 4;
export const isValidPinFormat = (pin: string) => /^\d{4}$/.test(pin);

export const BRAND = {
  name: 'DigiLog 360',
  tagline: 'Security Operations Platform',
  company: 'Netstream Intergrated Solutions',
  // Signature gradient carried over from the legacy console.
  gradientFrom: '#667eea',
  gradientTo: '#764ba2',
  primary: '#667eea',
  primaryDark: '#5469d4',
  accent: '#764ba2',
  surface: '#0f172a',
  // Asset paths — copied from legacy wwwroot/Images. See public/img/* (admin)
  // and assets/* (mobile).
  logo: {
    light: '/img/digilog-logo.png',
    dark: '/img/digilog-logo-dark.png',
    monogram: '/img/digilog-mark.png',
  },
} as const;
