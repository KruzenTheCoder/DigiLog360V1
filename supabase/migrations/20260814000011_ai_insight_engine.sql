-- ============================================================================
-- Digilog360 — the insight engine's memory
--
-- The briefing used to re-derive everything on every run: it shipped 200 raw
-- occurrences to the model and asked it, among other things, to work out which
-- occurrence types are routine operations and which are real incidents. That
-- answer never changes — "Open and close gates" is routine today, tomorrow and
-- next year — yet we paid for it every time.
--
-- Worse, it made the briefing dishonest. PMI logs ~4 800 occurrences a month
-- and 97% of them are gate and warehouse movements, so the 200-record cap
-- covered 1.3 days of a window the text described as 30 days. A critical
-- occurrence open since 5 August had never once appeared in a prompt.
--
-- Three tables fix both problems:
--
--   ai_type_memory      what the platform has learned about each occurrence
--                       type. Classified once, reused for ever, overridable by
--                       a human. This is what lets the engine send routine
--                       activity as a single counted line and spend the tokens
--                       on incidents instead.
--
--   ai_period_summaries compact per-week digests, so a 90-day question costs
--                       roughly what a 7-day question costs.
--
--   ai_usage            token ledger. A daily cap you cannot see coming is a
--                       cap you hit at the worst moment.
-- ============================================================================

-- ─── What the engine has learned about each occurrence type ─────────────────

do $$ begin
  create type public.ai_type_kind as enum ('routine', 'incident');
exception when duplicate_object then null;
end $$;

create table if not exists public.ai_type_memory (
  id              bigint generated always as identity primary key,
  org_id          uuid not null references public.organizations(id) on delete cascade,
  -- The occurrence_type string exactly as it is logged. Types are free text
  -- per tenant, so this is deliberately not a foreign key.
  occurrence_type text not null,
  kind            public.ai_type_kind not null,
  -- One line explaining the call, shown to a super user reviewing the list.
  rationale       text,
  -- 'model' when the classifier decided it, 'human' when someone corrected it.
  decided_by      text not null default 'model' check (decided_by in ('model', 'human')),
  confidence      numeric(3, 2),
  -- A human decision is final: the classifier must never quietly undo it.
  locked          boolean not null default false,
  -- Cheap telemetry for the review screen: how much of the book this covers.
  sample_count    integer not null default 0,
  first_seen_at   timestamptz not null default now(),
  last_seen_at    timestamptz not null default now(),
  decided_at      timestamptz not null default now(),
  unique (org_id, occurrence_type)
);

create index if not exists idx_ai_type_memory_org
  on public.ai_type_memory(org_id, kind);

alter table public.ai_type_memory enable row level security;

drop policy if exists ai_type_memory_select on public.ai_type_memory;
create policy ai_type_memory_select on public.ai_type_memory
  for select to authenticated
  using (coalesce(public.is_super_user(), false) or org_id = public.current_org_id());

-- Correcting a classification changes what every future briefing says, so it
-- sits with admins and above rather than with anyone who can read it.
drop policy if exists ai_type_memory_write on public.ai_type_memory;
create policy ai_type_memory_write on public.ai_type_memory
  for all to authenticated
  using (
    coalesce(public.is_super_user(), false)
    or (coalesce(public.is_admin(), false) and org_id = public.current_org_id())
  )
  with check (
    coalesce(public.is_super_user(), false)
    or (coalesce(public.is_admin(), false) and org_id = public.current_org_id())
  );

-- ─── Rolling period summaries ───────────────────────────────────────────────

create table if not exists public.ai_period_summaries (
  id           bigint generated always as identity primary key,
  org_id       uuid not null references public.organizations(id) on delete cascade,
  -- 'week' today; 'month' is the obvious next grain.
  grain        text not null default 'week' check (grain in ('week', 'month')),
  period_start date not null,
  period_end   date not null,
  -- The deterministic half: counts, tallies, SLA figures. Arithmetic, not
  -- opinion, so it stays true no matter which model wrote the prose.
  facts        jsonb not null default '{}'::jsonb,
  -- The written half: one short paragraph standing in for the whole period.
  narrative    text,
  incidents    integer not null default 0,
  routine      integer not null default 0,
  model        text,
  created_at   timestamptz not null default now(),
  unique (org_id, grain, period_start)
);

create index if not exists idx_ai_period_org_start
  on public.ai_period_summaries(org_id, period_start desc);

alter table public.ai_period_summaries enable row level security;

drop policy if exists ai_period_select on public.ai_period_summaries;
create policy ai_period_select on public.ai_period_summaries
  for select to authenticated
  using (coalesce(public.is_super_user(), false) or org_id = public.current_org_id());

-- ─── Token ledger ───────────────────────────────────────────────────────────

create table if not exists public.ai_usage (
  id                bigint generated always as identity primary key,
  org_id            uuid references public.organizations(id) on delete cascade,
  mode              text not null,
  model             text,
  prompt_tokens     integer not null default 0,
  completion_tokens integer not null default 0,
  total_tokens      integer not null default 0,
  -- 'live' when the model was called, 'cache' when a content hash matched and
  -- nothing was spent. The ratio between them is the engine's whole point.
  source            text not null default 'live' check (source in ('live', 'cache')),
  cache_key         text,
  latency_ms        integer,
  ok                boolean not null default true,
  error             text,
  created_at        timestamptz not null default now()
);

create index if not exists idx_ai_usage_org_time
  on public.ai_usage(org_id, created_at desc);
-- The budget guard sums a rolling day on every call; keep that cheap.
create index if not exists idx_ai_usage_time
  on public.ai_usage(created_at desc);

alter table public.ai_usage enable row level security;

drop policy if exists ai_usage_select on public.ai_usage;
create policy ai_usage_select on public.ai_usage
  for select to authenticated
  using (coalesce(public.is_super_user(), false) or org_id = public.current_org_id());

-- ─── Cache keying by content, not by clock ──────────────────────────────────

-- The old cache expired an hour after it was written, so a quiet Sunday paid
-- the same as a busy Monday. Keying on a hash of the facts means a briefing is
-- regenerated when the underlying numbers move and not otherwise.
alter table public.ai_insights
  add column if not exists facts_hash text;

create index if not exists idx_ai_insights_hash
  on public.ai_insights(org_id, scope_key, facts_hash);

-- ─── Daily spend, for the budget guard and the super-user screen ────────────

create or replace function public.ai_tokens_today()
returns integer language sql stable security definer set search_path = '' as $$
  select coalesce(sum(total_tokens), 0)::integer
    from public.ai_usage
   where source = 'live'
     and created_at >= now() - interval '24 hours';
$$;

grant execute on function public.ai_tokens_today() to authenticated;
