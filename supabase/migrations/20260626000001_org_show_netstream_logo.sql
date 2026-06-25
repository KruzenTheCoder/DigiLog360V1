-- ============================================================================
-- DigiLog 360 — per-org toggle for the Netstream parent-brand logo
--
-- When TRUE (default), the inline Netstream wordmark is rendered in the
-- centre of the admin app header. Super users toggle this per org via
-- /super/branding. Set to FALSE for white-label deployments where the
-- parent brand should not appear.
-- ============================================================================

alter table public.organizations
  add column if not exists show_netstream_logo boolean not null default true;
