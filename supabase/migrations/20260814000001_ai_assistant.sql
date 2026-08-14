-- ============================================================================
-- Digilog360 — AI assistant (Groq)
--
-- Two surfaces, one model:
--   • Dashboard insight — a written read of the performance dashboard,
--     generated on demand and CACHED, because regenerating on every page load
--     would be slow, costly, and would make the text flicker between visits.
--   • Chat — a conversation per user, so follow-up questions ("which site was
--     that?") have something to refer back to.
--
-- The prompt payload is assembled inside the edge function from the caller's
-- own org, never posted from the browser. That way the client cannot widen
-- what gets sent to a third party.
-- ============================================================================

-- ─── Chat transcript ────────────────────────────────────────────────────────

create table if not exists public.ai_chat_messages (
  id          bigint generated always as identity primary key,
  org_id      uuid not null references public.organizations(id) on delete cascade,
  user_id     uuid not null references public.profiles(id) on delete cascade,
  role        text not null check (role in ('user', 'assistant')),
  content     text not null,
  -- Rough token accounting, handy for spotting a runaway conversation.
  tokens      integer,
  created_at  timestamptz not null default now()
);

create index if not exists idx_ai_chat_user_time
  on public.ai_chat_messages(user_id, id desc);

alter table public.ai_chat_messages enable row level security;

-- A conversation is personal. Even an admin has no business reading someone
-- else's chat, so this is scoped to the author alone.
drop policy if exists ai_chat_own_select on public.ai_chat_messages;
create policy ai_chat_own_select on public.ai_chat_messages
  for select to authenticated using (user_id = auth.uid());

drop policy if exists ai_chat_own_delete on public.ai_chat_messages;
create policy ai_chat_own_delete on public.ai_chat_messages
  for delete to authenticated using (user_id = auth.uid());

-- Inserts happen through the edge function (service role), which is what
-- guarantees the stored assistant reply is the one the model actually
-- returned rather than something typed by the client.

-- ─── Cached dashboard insight ───────────────────────────────────────────────

create table if not exists public.ai_insights (
  id            bigint generated always as identity primary key,
  org_id        uuid not null references public.organizations(id) on delete cascade,
  -- Which slice of the dashboard this describes: site filter + window, so a
  -- site-filtered dashboard doesn't show an org-wide narrative.
  scope_key     text not null,
  site_id       uuid references public.sites(id) on delete cascade,
  days          integer not null default 30,
  headline      text not null,
  body          text not null,
  -- The metrics the model was given, kept for auditability — so a surprising
  -- claim can be checked against the numbers that produced it.
  facts         jsonb not null default '{}'::jsonb,
  model         text,
  generated_by  uuid references public.profiles(id) on delete set null,
  created_at    timestamptz not null default now()
);

create unique index if not exists idx_ai_insights_scope
  on public.ai_insights(org_id, scope_key);

create index if not exists idx_ai_insights_org_time
  on public.ai_insights(org_id, created_at desc);

alter table public.ai_insights enable row level security;

-- Anyone who can see the dashboard can read its narrative.
drop policy if exists ai_insights_select on public.ai_insights;
create policy ai_insights_select on public.ai_insights
  for select to authenticated
  using (public.is_super_user() or org_id = public.current_org_id());
