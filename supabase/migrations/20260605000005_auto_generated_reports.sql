-- Reports created automatically when an occurrence is closed in bulk get
-- stamped with auto_generated=true. The UI shows a clear "AUTO-GENERATED"
-- badge on these so a control-room operator can tell a real write-up from
-- an auto-stub at a glance, and follow up if needed.

alter table public.occurrence_reports
  add column if not exists auto_generated boolean not null default false;

create index if not exists idx_occurrence_reports_auto_generated
  on public.occurrence_reports (auto_generated)
  where auto_generated = true;
