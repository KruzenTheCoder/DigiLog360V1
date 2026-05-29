// ============================================================================
// DigiLog 360 — friendly domain type aliases derived from the DB schema
// ============================================================================
import type { Database } from './database.types';

export type AppRole = Database['public']['Enums']['app_role'];
export type SeverityLevel = Database['public']['Enums']['severity_level'];
export type OccurrenceStatus = Database['public']['Enums']['occurrence_status'];
export type PatrolStatus = Database['public']['Enums']['patrol_status'];
export type ScanMethod = Database['public']['Enums']['scan_method'];

type T = Database['public']['Tables'];
type V = Database['public']['Views'];

export type Site = T['sites']['Row'];
export type Profile = T['profiles']['Row'];
export type Occurrence = T['occurrences']['Row'];
export type OccurrenceInsert = T['occurrences']['Insert'];
export type OccurrenceUpdate = T['occurrence_updates']['Row'];
export type OccurrenceReport = T['occurrence_reports']['Row'];
export type OccurrenceImage = T['occurrence_images']['Row'];
export type PatrolRoute = T['patrol_routes']['Row'];
export type Checkpoint = T['checkpoints']['Row'];
export type RouteCheckpoint = T['route_checkpoints']['Row'];
export type Patrol = T['patrols']['Row'];
export type CheckpointScan = T['checkpoint_scans']['Row'];

export type LiveOccurrence = V['occurrences_live']['Row'];
export type PatrolDetailed = V['patrols_detailed']['Row'];
