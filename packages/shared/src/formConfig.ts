// ============================================================================
// DigiLog 360 — Log Occurrence form builder config.
//
// Shared by the admin app (settings page + Log Occurrence form) so the
// section keys and defaults stay in sync between writer and reader.
// ============================================================================

/** Every toggleable BUILT-IN section/feature on the Log New Occurrence form. */
export const LOG_FORM_SECTIONS = [
  'operational_details',          // Operational Details panel (CCTV / status / emergency)
  'cctv',                         // CCTV-available + time window subfield (inside operational_details)
  'status_indicator',             // Active/Inactive radio (inside operational_details)
  'emergency_services',           // Emergency services chips (inside operational_details)
  'assignment',                   // Assign-to dropdown (only ever shown if user has occurrences.assign)
  'ocr_upload',                   // Drag-a-photo OCR dropzone
  'management_report_shortcut',   // Special "Management Reports" subcategory option
  'severity_chip_row',            // Severity chip row (false hides it AND forces 'medium')
  'reported_by',                  // Reported By dropdown
] as const;

export type LogFormSection = (typeof LOG_FORM_SECTIONS)[number];

export interface LogFormSectionConfig { enabled: boolean }

/** Field types supported in custom sections. */
export const CUSTOM_FIELD_TYPES = ['text', 'textarea', 'number', 'select', 'checkbox', 'date'] as const;
export type CustomFieldType = (typeof CUSTOM_FIELD_TYPES)[number];

export interface CustomField {
  /** Stable id — used as the key in occurrences.custom_fields jsonb. Snake-case. */
  key: string;
  /** Human-readable label shown above the input. */
  label: string;
  type: CustomFieldType;
  /** Required for submit. Hidden sections always skip validation regardless. */
  required?: boolean;
  /** Placeholder for text / textarea / number / date inputs. */
  placeholder?: string;
  /** Options for `type === 'select'`. */
  options?: string[];
  /** Helper text shown beneath the input. */
  hint?: string;
}

/** A super-user-defined section that renders at the bottom of the form. */
export interface CustomSection {
  /** Stable id — used to dedupe + as React key. */
  id: string;
  /** Section heading (gradient bar). */
  title: string;
  /** Sub-headline under the title. */
  subtitle?: string;
  /** Lucide icon name (e.g. 'Car', 'ClipboardList'). Falls back to a default. */
  icon?: string;
  /** Header gradient tone (matches GradientSection). */
  tone?: 'brand' | 'green' | 'amber' | 'red' | 'sky' | 'violet' | 'slate';
  /** Off = hidden + validation skipped + values not submitted. Default true. */
  enabled?: boolean;
  fields: CustomField[];
}

export interface LogFormConfig {
  sections?: Partial<Record<LogFormSection, LogFormSectionConfig>>;
  customSections?: CustomSection[];
}

/** Human-readable label + helper text for each built-in toggle. */
export const LOG_FORM_SECTION_LABELS: Record<LogFormSection, { label: string; hint: string }> = {
  operational_details: {
    label: 'Operational Details panel',
    hint: 'CCTV, on-scene status and emergency services dispatched. Hides the entire amber panel.',
  },
  cctv: {
    label: 'CCTV — available + time window',
    hint: 'Yes / No buttons + optional CCTV time window text field.',
  },
  status_indicator: {
    label: 'Site status indicator',
    hint: 'Active / Inactive dropdown for the site at the time of the incident.',
  },
  emergency_services: {
    label: 'Emergency services on scene',
    hint: 'Multi-select chips for Police, Fire, Medical, etc.',
  },
  assignment: {
    label: 'Assignment dropdown',
    hint: 'Lets the reviewer hand the new occurrence directly to a specific person.',
  },
  ocr_upload: {
    label: 'OCR upload (photo of written note)',
    hint: 'Drag-and-drop or pick a photo of a hand-written/printed report — text is extracted in-browser.',
  },
  management_report_shortcut: {
    label: 'Management Reports shortcut',
    hint: 'Adds a "Management Reports" sub-category that auto-fills the type field.',
  },
  severity_chip_row: {
    label: 'Severity chip row',
    hint: 'Touch-friendly Critical / High / Medium / Low chips. When hidden, severity defaults to Medium.',
  },
  reported_by: {
    label: 'Reported By dropdown',
    hint: 'Lets the logger credit a different on-site guard / supervisor as the reporter.',
  },
};

/**
 * Section visibility resolver — defaults to "enabled" unless explicitly
 * turned off. This keeps the feature additive: a fresh org with an empty
 * config sees every section.
 */
export function isSectionEnabled(config: LogFormConfig | null | undefined, key: LogFormSection): boolean {
  const s = config?.sections?.[key];
  if (!s) return true;
  return s.enabled !== false;
}

/** Same resolver for a custom section — default-on. */
export function isCustomSectionEnabled(section: CustomSection): boolean {
  return section.enabled !== false;
}

/** Slugify a label into a safe snake_case key for a custom field. */
export function toFieldKey(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 48) || `field_${Date.now().toString(36)}`;
}
