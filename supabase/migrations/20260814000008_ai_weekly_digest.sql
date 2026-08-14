-- ============================================================================
-- Weekly AI digest + a master switch for every AI feature.
--
-- ai_insights_enabled started life gating only the dashboard briefing. It now
-- means "AI is on for this organisation" and covers the briefing, the chat
-- assistant and the weekly email — one switch, so turning AI off actually
-- turns it off rather than leaving a surface running.
-- ============================================================================

alter table public.organizations
  add column if not exists ai_weekly_digest_enabled boolean not null default false,
  -- 1 = Monday … 7 = Sunday (ISO). Monday morning is the useful default for a
  -- "week ahead" briefing.
  add column if not exists ai_digest_dow smallint not null default 1
    check (ai_digest_dow between 1 and 7);

-- Who receives it. Roles rather than named people, so the list stays correct
-- as staff change.
alter table public.organizations
  add column if not exists ai_digest_roles text[] not null default '{admin,manager}';

-- The briefing is now written for the READER — a guard, a supervisor and a
-- manager need different things from the same data — so the cache is keyed by
-- role as well as site and window.
alter table public.ai_insights
  add column if not exists audience_role text;

-- The old unique index was (org_id, scope_key); scope_key now carries the role,
-- so it still holds. Recreated only to be explicit about intent.
drop index if exists idx_ai_insights_scope;
create unique index if not exists idx_ai_insights_scope
  on public.ai_insights(org_id, scope_key);

-- Record of what went out, so a missed digest is visible rather than silent.
create table if not exists public.ai_digest_log (
  id          bigint generated always as identity primary key,
  org_id      uuid not null references public.organizations(id) on delete cascade,
  recipients  integer not null default 0,
  sent        integer not null default 0,
  failed      integer not null default 0,
  headline    text,
  error       text,
  created_at  timestamptz not null default now()
);

create index if not exists idx_ai_digest_log_org on public.ai_digest_log(org_id, id desc);

alter table public.ai_digest_log enable row level security;

drop policy if exists ai_digest_log_read on public.ai_digest_log;
create policy ai_digest_log_read on public.ai_digest_log
  for select to authenticated
  using (public.is_super_user() or org_id = public.current_org_id());
