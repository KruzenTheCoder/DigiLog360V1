-- ============================================================================
-- Digilog360 — Organogram canvas layout
--
-- Where each person sits on the org chart. Kept in its own table rather than
-- as columns on profiles: this is presentation state that changes every time
-- someone nudges a card, and profiles is read on virtually every request.
--
-- A missing row is fine and expected — the client falls back to a computed
-- tree layout, so a chart nobody has arranged still opens tidy.
-- ============================================================================

create table if not exists public.org_chart_positions (
  profile_id uuid primary key references public.profiles(id) on delete cascade,
  org_id     uuid not null references public.organizations(id) on delete cascade,
  x          numeric(10,2) not null,
  y          numeric(10,2) not null,
  updated_at timestamptz not null default now()
);

create index if not exists idx_org_chart_pos_org on public.org_chart_positions(org_id);

alter table public.org_chart_positions enable row level security;

-- Everyone in the org sees the same arrangement — an org chart is shared
-- furniture, not a personal view.
drop policy if exists org_chart_pos_read on public.org_chart_positions;
create policy org_chart_pos_read on public.org_chart_positions
  for select to authenticated
  using (public.is_super_user() or org_id = public.current_org_id());

-- Rearranging it is the same privilege as editing the reporting lines it
-- depicts, so managers and above.
drop policy if exists org_chart_pos_write on public.org_chart_positions;
create policy org_chart_pos_write on public.org_chart_positions
  for all to authenticated
  using (public.is_super_user() or (public.is_manager() and org_id = public.current_org_id()))
  with check (public.is_super_user() or (public.is_manager() and org_id = public.current_org_id()));
