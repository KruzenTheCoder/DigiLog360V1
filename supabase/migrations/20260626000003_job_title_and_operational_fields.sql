-- ============================================================================
-- DigiLog 360 — Operational fields + job titles + custom Netstream logo
--
--   • profiles.job_title     — short text shown next to the name in
--                              assignee dropdowns, audit rows, signature
--                              blocks, etc. (per Udeen's spec).
--   • occurrences.status_indicator         — 'active'/'inactive' (or null)
--   • occurrences.cctv_available           — boolean
--   • occurrences.cctv_times               — text (start/end window)
--   • occurrences.emergency_services       — text[] (Police, Fire, Medical, etc.)
--   • organizations.netstream_logo_url     — uploaded override for the
--                                            parent-brand logo (super-user
--                                            controls per-org via /super/branding).
-- ============================================================================

alter table public.profiles
  add column if not exists job_title text;

alter table public.occurrences
  add column if not exists status_indicator text check (status_indicator in ('active','inactive')) ,
  add column if not exists cctv_available   boolean,
  add column if not exists cctv_times       text,
  add column if not exists emergency_services text[];

alter table public.organizations
  add column if not exists netstream_logo_url text;
