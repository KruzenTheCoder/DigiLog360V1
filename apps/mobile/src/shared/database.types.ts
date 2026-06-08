// ============================================================================
// DigiLog 360 — Supabase database types.
// Hand-authored to match the migrations. Regenerate any time with:
//   supabase gen types typescript --linked > packages/shared/src/database.types.ts
// ============================================================================
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type AppRoleEnum = 'admin' | 'control_room' | 'supervisor' | 'guard';
export type SeverityEnum = 'critical' | 'high' | 'medium' | 'low';
export type OccurrenceStatusEnum =
  | 'open' | 'acknowledged' | 'in_progress' | 'on_patrol' | 'resolved' | 'closed';
export type PatrolStatusEnum = 'active' | 'completed' | 'abandoned';
export type ScanMethodEnum = 'qr' | 'nfc' | 'gps' | 'manual';

export interface Database {
  public: {
    Tables: {
      sites: {
        Row: {
          id: string; name: string; code: string | null; address: string | null;
          timezone: string; is_active: boolean; created_at: string; updated_at: string;
        };
        Insert: {
          id?: string; name: string; code?: string | null; address?: string | null;
          timezone?: string; is_active?: boolean; created_at?: string; updated_at?: string;
        };
        Update: Partial<Database['public']['Tables']['sites']['Insert']>;
        Relationships: [];
      };
      profiles: {
        Row: {
          id: string; email: string | null; full_name: string | null; role: AppRoleEnum;
          site_id: string | null; phone: string | null; avatar_url: string | null;
          is_active: boolean; expo_push_token: string | null;
          created_at: string; updated_at: string;
        };
        Insert: {
          id: string; email?: string | null; full_name?: string | null; role?: AppRoleEnum;
          site_id?: string | null; phone?: string | null; avatar_url?: string | null;
          is_active?: boolean; expo_push_token?: string | null;
          created_at?: string; updated_at?: string;
        };
        Update: Partial<Database['public']['Tables']['profiles']['Insert']>;
        Relationships: [
          {
            foreignKeyName: 'profiles_site_id_fkey';
            columns: ['site_id'];
            isOneToOne: false;
            referencedRelation: 'sites';
            referencedColumns: ['id'];
          },
        ];
      };
      occurrences: {
        Row: {
          id: number; ob_number: string | null; occurrence_type: string; severity: SeverityEnum;
          description: string; incident_at: string; site_id: string | null; site_name: string | null;
          logged_by: string | null; logged_by_name: string | null; status: OccurrenceStatusEnum;
          is_patrol: boolean; sla_hours: number; sla_due_at: string | null;
          last_sla_update_at: string | null; closed_at: string | null;
          category: string | null; subcategory: string | null;
          created_at: string; updated_at: string;
        };
        Insert: {
          id?: never; ob_number?: string | null; occurrence_type: string; severity: SeverityEnum;
          description: string; incident_at: string; site_id?: string | null; site_name?: string | null;
          logged_by?: string | null; logged_by_name?: string | null; status?: OccurrenceStatusEnum;
          is_patrol?: boolean; sla_hours?: number; sla_due_at?: string | null;
          last_sla_update_at?: string | null; closed_at?: string | null;
          category?: string | null; subcategory?: string | null;
          created_at?: string; updated_at?: string;
        };
        Update: Partial<Omit<Database['public']['Tables']['occurrences']['Insert'], 'id'>>;
        Relationships: [];
      };
      occurrence_updates: {
        Row: {
          id: number; occurrence_id: number; ob_number: string | null; notes: string;
          status: OccurrenceStatusEnum; updated_by: string | null; updated_by_name: string | null;
          created_at: string;
        };
        Insert: {
          id?: never; occurrence_id: number; ob_number?: string | null; notes: string;
          status: OccurrenceStatusEnum; updated_by?: string | null; updated_by_name?: string | null;
          created_at?: string;
        };
        Update: Partial<Omit<Database['public']['Tables']['occurrence_updates']['Insert'], 'id'>>;
        Relationships: [];
      };
      occurrence_reports: {
        Row: {
          id: number; occurrence_id: number; ob_number: string | null; severity: SeverityEnum | null;
          occurrence_type: string | null; incident_at: string | null; location: string | null;
          reported_by: string | null; description: string; personnel: string | null;
          responding_officer: string | null; emergency_services: string | null; external_case: string | null;
          cctv: string | null; cctv_times: string | null; property_damage: string | null;
          immediate_actions: string | null; next_steps: string | null; created_by: string | null;
          created_by_name: string | null; status: OccurrenceStatusEnum; auto_generated: boolean;
          created_at: string; updated_at: string;
        };
        Insert: {
          id?: never; occurrence_id: number; ob_number?: string | null; severity?: SeverityEnum | null;
          occurrence_type?: string | null; incident_at?: string | null; location?: string | null;
          reported_by?: string | null; description: string; personnel?: string | null;
          responding_officer?: string | null; emergency_services?: string | null; external_case?: string | null;
          cctv?: string | null; cctv_times?: string | null; property_damage?: string | null;
          immediate_actions?: string | null; next_steps?: string | null; created_by?: string | null;
          created_by_name?: string | null; status?: OccurrenceStatusEnum; auto_generated?: boolean;
          created_at?: string; updated_at?: string;
        };
        Update: Partial<Omit<Database['public']['Tables']['occurrence_reports']['Insert'], 'id'>>;
        Relationships: [];
      };
      occurrence_images: {
        Row: {
          id: number; occurrence_id: number; ob_number: string | null; storage_path: string;
          caption: string | null; captured_by: string | null; captured_by_name: string | null;
          captured_at: string;
        };
        Insert: {
          id?: never; occurrence_id: number; ob_number?: string | null; storage_path: string;
          caption?: string | null; captured_by?: string | null; captured_by_name?: string | null;
          captured_at?: string;
        };
        Update: Partial<Omit<Database['public']['Tables']['occurrence_images']['Insert'], 'id'>>;
        Relationships: [];
      };
      patrol_routes: {
        Row: {
          id: string; site_id: string; name: string; description: string | null;
          expected_duration_minutes: number | null; is_active: boolean; created_at: string; updated_at: string;
        };
        Insert: {
          id?: string; site_id: string; name: string; description?: string | null;
          expected_duration_minutes?: number | null; is_active?: boolean; created_at?: string; updated_at?: string;
        };
        Update: Partial<Database['public']['Tables']['patrol_routes']['Insert']>;
        Relationships: [];
      };
      checkpoints: {
        Row: {
          id: string; site_id: string; name: string; code: string | null; description: string | null;
          qr_token: string; nfc_tag_id: string | null; latitude: number | null; longitude: number | null;
          geofence_radius_m: number; sort_order: number; is_active: boolean; created_at: string; updated_at: string;
        };
        Insert: {
          id?: string; site_id: string; name: string; code?: string | null; description?: string | null;
          qr_token?: string; nfc_tag_id?: string | null; latitude?: number | null; longitude?: number | null;
          geofence_radius_m?: number; sort_order?: number; is_active?: boolean; created_at?: string; updated_at?: string;
        };
        Update: Partial<Database['public']['Tables']['checkpoints']['Insert']>;
        Relationships: [];
      };
      route_checkpoints: {
        Row: { id: string; route_id: string; checkpoint_id: string; sort_order: number };
        Insert: { id?: string; route_id: string; checkpoint_id: string; sort_order?: number };
        Update: Partial<Database['public']['Tables']['route_checkpoints']['Insert']>;
        Relationships: [
          {
            foreignKeyName: 'route_checkpoints_checkpoint_id_fkey';
            columns: ['checkpoint_id'];
            isOneToOne: false;
            referencedRelation: 'checkpoints';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'route_checkpoints_route_id_fkey';
            columns: ['route_id'];
            isOneToOne: false;
            referencedRelation: 'patrol_routes';
            referencedColumns: ['id'];
          },
        ];
      };
      patrols: {
        Row: {
          id: number; guard_id: string | null; guard_name: string; site_id: string | null;
          route_id: string | null; occurrence_id: number | null; ob_number: string | null;
          status: PatrolStatusEnum; started_at: string; ended_at: string | null;
          duration_minutes: number | null; checkpoints_total: number; checkpoints_scanned: number;
          notes: string | null; created_at: string; updated_at: string;
        };
        Insert: {
          id?: never; guard_id?: string | null; guard_name: string; site_id?: string | null;
          route_id?: string | null; occurrence_id?: number | null; ob_number?: string | null;
          status?: PatrolStatusEnum; started_at?: string; ended_at?: string | null;
          duration_minutes?: number | null; checkpoints_total?: number; checkpoints_scanned?: number;
          notes?: string | null; created_at?: string; updated_at?: string;
        };
        Update: Partial<Omit<Database['public']['Tables']['patrols']['Insert'], 'id'>>;
        Relationships: [];
      };
      checkpoint_scans: {
        Row: {
          id: number; patrol_id: number; checkpoint_id: string | null; guard_id: string | null;
          method: ScanMethodEnum; scanned_at: string; latitude: number | null; longitude: number | null;
          gps_accuracy_m: number | null; distance_m: number | null; is_verified: boolean;
          notes: string | null; created_at: string;
        };
        Insert: {
          id?: never; patrol_id: number; checkpoint_id?: string | null; guard_id?: string | null;
          method: ScanMethodEnum; scanned_at?: string; latitude?: number | null; longitude?: number | null;
          gps_accuracy_m?: number | null; distance_m?: number | null; is_verified?: boolean;
          notes?: string | null; created_at?: string;
        };
        Update: Partial<Omit<Database['public']['Tables']['checkpoint_scans']['Insert'], 'id'>>;
        Relationships: [];
      };
    };
    Views: {
      occurrences_live: {
        Row: Database['public']['Tables']['occurrences']['Row'] & {
          update_interval_minutes: number;
          is_sla_breached: boolean;
          is_sla_update_due: boolean;
          minutes_remaining: number | null;
          has_report: boolean;
        };
        Relationships: [];
      };
      patrols_detailed: {
        Row: Database['public']['Tables']['patrols']['Row'] & {
          route_name: string | null;
          site_name: string | null;
          scan_count: number;
        };
        Relationships: [];
      };
    };
    Functions: {
      haversine_m: {
        Args: { lat1: number; lon1: number; lat2: number; lon2: number };
        Returns: number;
      };
    };
    Enums: {
      app_role: AppRoleEnum;
      severity_level: SeverityEnum;
      occurrence_status: OccurrenceStatusEnum;
      patrol_status: PatrolStatusEnum;
      scan_method: ScanMethodEnum;
    };
  };
}
