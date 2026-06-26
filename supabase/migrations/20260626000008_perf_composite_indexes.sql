-- ============================================================================
-- DigiLog 360 — Performance: composite indexes for the site-scoped query paths
--
-- Site scoping (added recently) filters most report/list queries by
-- `site_id IN (...)` and then orders by incident_at / filters by status.
-- Without a composite index Postgres falls back to the single-column
-- idx_occurrences_site and re-sorts in memory. These covering composites
-- let it satisfy the filter + sort from the index directly.
-- ============================================================================

-- occurrences: site-scoped lists ordered by recency
create index if not exists idx_occ_site_incident_desc
  on public.occurrences (site_id, incident_at desc);

-- occurrences: site-scoped open/closed counts + live board
create index if not exists idx_occ_site_status
  on public.occurrences (site_id, status);

-- occurrences: assigned queue ordered by recency
create index if not exists idx_occ_assigned_incident
  on public.occurrences (assigned_to, incident_at desc)
  where assigned_to is not null;

-- patrols: completed-patrol history filtered by site + end time
create index if not exists idx_patrols_site_ended
  on public.patrols (site_id, ended_at desc)
  where ended_at is not null;

-- notifications: the toast/bell unread lookup (user + kind)
create index if not exists idx_notif_user_kind
  on public.notifications (user_id, kind, created_at desc);

-- manager_acknowledgements: reviewer-scoped reviewed-logs feed
create index if not exists idx_ack_reviewed_by_at
  on public.manager_acknowledgements (reviewed_by, reviewed_at desc);

-- tasks: "my open tasks" count on the mobile home + web board
create index if not exists idx_tasks_assignee_status
  on public.tasks (assigned_to, status);
