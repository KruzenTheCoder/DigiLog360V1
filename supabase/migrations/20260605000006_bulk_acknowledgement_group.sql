-- When a manager acknowledges many occurrences at once we want the audit
-- log to surface that as a SINGLE bulk-acknowledgement entry rather than N
-- individual rows. Each ack row still exists (so per-occurrence detail is
-- preserved), but they all share a `bulk_id` so the UI can group them and
-- the manager_acknowledgements_log view can render one summary row with a
-- nested list of OB numbers.

alter table public.manager_acknowledgements
  add column if not exists bulk_id uuid;

create index if not exists idx_manager_acks_bulk_id
  on public.manager_acknowledgements (bulk_id)
  where bulk_id is not null;
