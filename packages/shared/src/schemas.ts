// ============================================================================
// DigiLog 360 — zod validation schemas shared by web + mobile forms
// ============================================================================
import { z } from 'zod';

export const severitySchema = z.enum(['critical', 'high', 'medium', 'low']);
export const roleSchema = z.enum(['admin', 'control_room', 'supervisor', 'guard']);
export const statusSchema = z.enum([
  'open', 'acknowledged', 'in_progress', 'on_patrol', 'resolved', 'closed',
]);
export const scanMethodSchema = z.enum(['qr', 'nfc', 'gps', 'manual']);

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
  password: z.string().min(6, 'Min 6 characters'),
  full_name: z.string().optional().nullable(),
  role: roleSchema,
  site_id: z.string().uuid().nullable().optional(),
  phone: z.string().optional().nullable(),
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
