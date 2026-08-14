-- Structured output for the dashboard briefing.
--
-- The prose read was fine for context but gave nobody anything to do. Splits
-- the result into three parts: the narrative, a set of KPIs, and concrete
-- recommended actions.
--
-- KPIs are computed in the edge function from the occurrence data, NOT written
-- by the model — a headline number a language model invented is worse than no
-- number at all. The model contributes judgement (what to do about it), the
-- database contributes arithmetic.
alter table public.ai_insights
  add column if not exists kpis    jsonb not null default '[]'::jsonb,
  add column if not exists actions jsonb not null default '[]'::jsonb;
