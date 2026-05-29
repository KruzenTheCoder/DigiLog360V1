-- ============================================================================
-- DigiLog 360 — Extensions & Enums
-- ============================================================================

create extension if not exists "pgcrypto" with schema extensions;       -- gen_random_uuid()
create extension if not exists "uuid-ossp" with schema extensions;
create extension if not exists "pg_trgm" with schema extensions;        -- fuzzy text search

-- ----------------------------------------------------------------------------
-- Roles / access control
-- ----------------------------------------------------------------------------
do $$ begin
  create type public.app_role as enum ('admin', 'control_room', 'supervisor', 'guard');
exception when duplicate_object then null; end $$;

-- ----------------------------------------------------------------------------
-- Occurrence domain
-- ----------------------------------------------------------------------------
do $$ begin
  create type public.severity_level as enum ('critical', 'high', 'medium', 'low');
exception when duplicate_object then null; end $$;

-- Unified lifecycle status used by occurrences, reports and updates.
do $$ begin
  create type public.occurrence_status as enum (
    'open', 'acknowledged', 'in_progress', 'on_patrol', 'resolved', 'closed'
  );
exception when duplicate_object then null; end $$;

-- ----------------------------------------------------------------------------
-- Patrols & checkpoints
-- ----------------------------------------------------------------------------
do $$ begin
  create type public.patrol_status as enum ('active', 'completed', 'abandoned');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.scan_method as enum ('qr', 'nfc', 'gps', 'manual');
exception when duplicate_object then null; end $$;
