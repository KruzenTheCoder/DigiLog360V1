// ============================================================================
// DigiLog 360 — Log Occurrence form builder config.
//
// Shared by the admin app (settings page + Log Occurrence form) so the
// section keys and defaults stay in sync between writer and reader.
// ============================================================================

/** Every toggleable section/feature on the Log New Occurrence form. */
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
export interface LogFormConfig {
  sections?: Partial<Record<LogFormSection, LogFormSectionConfig>>;
}

/** Human-readable label + helper text for each toggle on the settings page. */
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
  // Treat absent / null / undefined as enabled (opt-out, not opt-in).
  if (!s) return true;
  return s.enabled !== false;
}
