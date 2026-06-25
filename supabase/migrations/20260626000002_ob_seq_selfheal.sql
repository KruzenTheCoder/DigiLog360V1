-- ============================================================================
-- DigiLog 360 — Self-healing OB number sequence
--
-- Background: legacy data was imported with raw INSERTs that supplied the
-- ob_number directly, leaving public.ob_number_seq stuck at its initial
-- value. The BEFORE-INSERT trigger then generates OB0001, OB0002, ...
-- which immediately collides with the unique constraint and the insert
-- fails with 23505 (and OCR uploads start surfacing the duplicate-key error).
--
-- Fix:
--   1. Bump the sequence to (current max + 1) so the next generated OB is fresh.
--   2. Make the trigger self-heal: if the generated number already exists,
--      jump the sequence to max() + 1 and retry once. Bounded so a bug
--      can't loop forever.
-- ============================================================================

-- 1. Hard reset to the current max.
do $$
declare
  _max int;
begin
  select coalesce(max(substring(ob_number from 3)::int), 0)
    into _max
    from public.occurrences
   where ob_number ~ '^OB\d+$';
  perform setval('public.ob_number_seq', greatest(_max + 1, 1), false);
end $$;

-- 2. Self-healing trigger.
create or replace function public.set_ob_number()
returns trigger language plpgsql as $$
declare
  _attempt int := 0;
  _candidate text;
  _max int;
begin
  if new.ob_number is not null and new.ob_number <> '' then
    return new;
  end if;

  loop
    _candidate := 'OB' || lpad(nextval('public.ob_number_seq')::text, 4, '0');
    _attempt := _attempt + 1;

    -- Fast path: not already used.
    if not exists (select 1 from public.occurrences where ob_number = _candidate) then
      new.ob_number := _candidate;
      return new;
    end if;

    -- Collision — re-base the sequence to the actual max + 1 and try again.
    select coalesce(max(substring(ob_number from 3)::int), 0)
      into _max
      from public.occurrences
     where ob_number ~ '^OB\d+$';
    perform setval('public.ob_number_seq', _max + 1, false);

    if _attempt > 5 then
      raise exception 'set_ob_number: could not generate a unique ob_number after 5 attempts';
    end if;
  end loop;
end $$;
