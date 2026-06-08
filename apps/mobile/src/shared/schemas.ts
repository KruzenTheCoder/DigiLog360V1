// ============================================================================
// DigiLog 360 — zod validation schemas shared by web + mobile forms
// ============================================================================
import { z } from 'zod';

export const severitySchema = z.enum(['critical', 'high', 'medium', 'low']);
export const roleSchema = z.enum([
  'super_user', 'admin', 'manager', 'control_room', 'supervisor', 'guard',
]);
export const statusSchema = z.enum([
  'open', 'acknowledged', 'in_progress', 'on_patrol', 'resolved', 'closed',
]);
export const scanMethodSchema = z.enum(['qr', 'nfc', 'gps', 'manual']);
export const managerDecisionSchema = z.enum(['acknowledged', 'escalated', 'rejected']);

export const pinSchema = z
  .string()
  .regex(/^\d{4}$/, 'PIN must be 4 digits');

export const occurrenceFormSchema = z.object({
  occurrence_type: z.string().min(1, 'Occurrence type is required'),
  severity: severitySchema,
  description: z.string().min(3, 'Description is required'),
  incident_at: z.string().min(1, 'Incident date & time is required'),
  site_id: z.string().uuid('Select a site').nullable().optional(),
});
export type OccurrenceFormValues = z.infer<typeof occurrenceFormSchema>;

export const occurrenceUpdateSchema = z.object({
  notes: z.string().min(1, 'Update notes are required'),
  status: statusSchema,
});
export type OccurrenceUpdateValues = z.infer<typeof occurrenceUpdateSchema>;

export const reportFormSchema = z.object({
  occurrence_id: z.number().int(),
  description: z.string().min(1, 'Incident description is required'),
  personnel: z.string().optional().nullable(),
  responding_officer: z.string().optional().nullable(),
  emergency_services: z.string().optional().nullable(),
  external_case: z.string().optional().nullable(),
  cctv: z.string().optional().nullable(),
  cctv_times: z.string().optional().nullable(),
  property_damage: z.string().optional().nullable(),
  immediate_actions: z.string().optional().nullable(),
  next_steps: z.string().optional().nullable(),
  status: statusSchema.default('open'),
});
export type ReportFormValues = z.infer<typeof reportFormSchema>;

export const createUserSchema = z.object({
  email: z.string().email('Valid email required'),
  password: z.string().min(6, 'Min 6 characters').optional().nullable(),
  full_name: z.string().optional().nullable(),
  role: roleSchema,
  site_id: z.string().uuid().nullable().optional(),
  org_id: z.string().uuid().optional().nullable(),
  employee_number: z.string().min(1).max(40).optional().nullable(),
  phone: z.string().optional().nullable(),
  pin: pinSchema.optional().nullable(),
});
export type CreateUserValues = z.infer<typeof createUserSchema>;

export const checkpointFormSchema = z.object({
  site_id: z.string().uuid('Select a site'),
  name: z.string().min(1, 'Name is required'),
  code: z.string().optional().nullable(),
  description: z.string().optional().nullable(),
  nfc_tag_id: z.string().optional().nullable(),
  latitude: z.number().nullable().optional(),
  longitude: z.number().nullable().optional(),
  geofence_radius_m: z.number().int().positive().default(50),
});
export type CheckpointFormValues = z.infer<typeof checkpointFormSchema>;

export const loginSchema = z.object({
  email: z.string().email('Valid email required'),
  password: z.string().min(1, 'Password is required'),
});
export type LoginValues = z.infer<typeof loginSchema>;

export const pinLoginSchema = z.object({
  org_slug: z.string().min(1, 'Organisation is required'),
  pin: pinSchema,
});
export type PinLoginValues = z.infer<typeof pinLoginSchema>;

export const setPinSchema = z
  .object({
    pin: pinSchema,
    confirm_pin: pinSchema,
    current_pin: pinSchema.optional(),
  })
  .refine((v) => v.pin === v.confirm_pin, {
    message: 'PINs do not match',
    path: ['confirm_pin'],
  });
export type SetPinValues = z.infer<typeof setPinSchema>;

export const organizationSchema = z.object({
  name: z.string().min(2, 'Organization name is required'),
  slug: z
    .string()
    .min(2, 'Slug is required')
    .regex(/^[a-z0-9-]+$/, 'Lowercase letters, digits and hyphens only'),
  legal_name: z.string().optional().nullable(),
  contact_email: z.string().email().optional().nullable(),
  contact_phone: z.string().optional().nullable(),
  address: z.string().optional().nullable(),
  plan: z.enum(['standard', 'pro', 'enterprise']).default('standard'),
  max_users: z.number().int().positive().optional().nullable(),
  max_sites: z.number().int().positive().optional().nullable(),
  trial_ends_at: z.string().optional().nullable(),
  primary_color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional().nullable(),
  logo_url: z.string().url().optional().nullable(),
});
export type OrganizationFormValues = z.infer<typeof organizationSchema>;

export const managerAckSchema = z.object({
  occurrence_id: z.number().int(),
  decision: managerDecisionSchema,
  manager_notes: z.string().min(1, 'Notes are required'),
  signature_data_url: z.string().optional().nullable(),
});
export type ManagerAckValues = z.infer<typeof managerAckSchema>;

export const siteFormSchema = z.object({
  name: z.string().min(2, 'Site name is required'),
  code: z
    .string()
    .min(2, 'Code is required')
    .max(8, 'Max 8 characters')
    .regex(/^[A-Z0-9]+$/, 'Uppercase letters and digits only'),
  address: z.string().optional().nullable(),
  timezone: z.string().default('Africa/Johannesburg'),
  is_active: z.boolean().default(true),
});
export type SiteFormValues = z.infer<typeof siteFormSchema>;
