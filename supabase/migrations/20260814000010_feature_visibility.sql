-- ============================================================================
-- Per-tenant feature control
--
-- Two things were conflated. ai_insights_enabled was a single switch covering
-- the dashboard briefing AND the chat assistant, so you could not run one
-- without the other. They are now separate, because they are separate
-- products: the briefing is a scheduled read of your data, the assistant is an
-- interactive tool.
--
-- Second, nav visibility. New surfaces (Organogram, Site Inspections) appear
-- for every role the moment they ship, which is rarely what you want — a
-- feature usually wants piloting with one role first. org_feature_roles says
-- which roles see which feature, per tenant. No row means "fall back to the
-- code default", so nothing changes until you say so.
-- ============================================================================

-- The chat assistant, split out from the briefing.
alter table public.organizations
  add column if not exists ai_chat_enabled boolean not null default true;

-- Existing behaviour preserved: wherever AI was off, both are off.
update public.organizations
   set ai_chat_enabled = false
 where ai_insights_enabled = false;

create table if not exists public.org_feature_roles (
  org_id      uuid not null references public.organizations(id) on delete cascade,
  -- Matches NavItem.feature in the admin nav config.
  feature_key text not null,
  -- Roles that may see it. Empty array = nobody but a super user.
  roles       text[] not null default '{}',
  updated_at  timestamptz not null default now(),
  primary key (org_id, feature_key)
);

alter table public.org_feature_roles enable row level security;

-- Everyone needs to read this to know what their own menu contains.
drop policy if exists org_feature_roles_read on public.org_feature_roles;
create policy org_feature_roles_read on public.org_feature_roles
  for select to authenticated
  using (public.is_super_user() or org_id = public.current_org_id());

-- Only a super user decides which roles get a feature.
drop policy if exists org_feature_roles_write on public.org_feature_roles;
create policy org_feature_roles_write on public.org_feature_roles
  for all to authenticated
  using (public.is_super_user())
  with check (public.is_super_user());

-- Ship the two newest surfaces to super users only, for every existing tenant.
-- They can be handed to other roles from Super User -> AI Assistant.
insert into public.org_feature_roles (org_id, feature_key, roles)
select id, k, '{}'::text[]
  from public.organizations
 cross join (values ('organogram'), ('inspections')) as f(k)
on conflict (org_id, feature_key) do nothing;
