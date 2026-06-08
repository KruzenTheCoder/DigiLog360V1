-- ============================================================================
-- DigiLog 360 — Add new app_role enum values in their OWN transaction.
--
-- Why this is its own migration:
--   Postgres requires new enum values from `alter type … add value` to be
--   committed before they can be referenced. The next migration
--   (20260603000001_multi_tenant_and_pin.sql) defines functions like
--   is_super_user() that compare against 'super_user' / 'manager' — those
--   would raise "unsafe use of new value" if added in the same transaction.
--
--   Keeping these ALTER TYPE statements alone in this file guarantees they
--   commit first.
-- ============================================================================

do $$ begin
  alter type public.app_role add value if not exists 'super_user';
exception when duplicate_object then null; end $$;

do $$ begin
  alter type public.app_role add value if not exists 'manager';
exception when duplicate_object then null; end $$;
