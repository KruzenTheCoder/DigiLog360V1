-- Super-user switch for the AI briefing, plus room for the routine/incident
-- split the briefing now makes.
--
-- The toggle lives on the organisation because that is the billing and policy
-- boundary: one org may not want occurrence text leaving the estate at all,
-- while another does. Default ON so nothing changes for anyone already using it.
alter table public.organizations
  add column if not exists ai_insights_enabled boolean not null default true;

-- Routine activity ("Open & Close gates" — the job being done) is reported
-- separately from incidents (something went wrong), so its volume stops
-- drowning the findings that matter.
alter table public.ai_insights
  add column if not exists routine_kpis  jsonb not null default '[]'::jsonb,
  add column if not exists routine_note  text,
  add column if not exists routine_types jsonb not null default '[]'::jsonb;
