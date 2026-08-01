-- ============================================================================
-- DigiLog 360 — OB numbers must survive past OB9999
--
-- Symptom: every new occurrence fails with
--   "duplicate key value violates unique constraint occurrences_ob_number_key"
--
-- Cause: the generator built the number as
--     'OB' || lpad(nextval('ob_number_seq')::text, 4, '0')
-- PostgreSQL's lpad TRUNCATES when the input is longer than the target length,
-- so once the sequence passed 9999:
--     lpad('10000', 4, '0')  ->  '1000'   ->  'OB1000'
-- which already exists. Every insert then collides, and the self-heal loop
-- cannot escape either: it re-bases the sequence to max+1 (10000), generates
-- the same truncated 'OB1000' again, and gives up.
--
-- The org has 9 969 occurrences with a maximum of OB9999 — the 4-digit space
-- is simply full.
--
-- Fix: keep zero-padding to 4 digits for numbers that fit (so existing OB0001
-- … OB9999 formatting is unchanged) and let longer numbers through intact:
-- OB10000, OB10001, …  The unique constraint and the self-heal retry stay.
-- ============================================================================

create or replace function public.set_ob_number()
returns trigger language plpgsql as $$
declare
  _attempt int := 0;
  _n bigint;
  _candidate text;
  _max bigint;
begin
  -- Caller supplied one explicitly (imports, backfills) — respect it.
  if new.ob_number is not null and new.ob_number <> '' then
    return new;
  end if;

  loop
    _n := nextval('public.ob_number_seq');
    -- lpad truncates anything longer than the pad length, so only pad while
    -- the number still fits in 4 digits. Beyond that, use it as-is.
    _candidate := 'OB' || case when _n <= 9999 then lpad(_n::text, 4, '0') else _n::text end;
    _attempt := _attempt + 1;

    -- Fast path: not already used.
    if not exists (select 1 from public.occurrences where ob_number = _candidate) then
      new.ob_number := _candidate;
      return new;
    end if;

    -- Collision — re-base the sequence to the real max + 1 and try again.
    select coalesce(max(substring(ob_number from 3)::bigint), 0)
      into _max
      from public.occurrences
     where ob_number ~ '^OB\d+$';
    perform setval('public.ob_number_seq', _max + 1, false);

    if _attempt > 5 then
      raise exception 'set_ob_number: could not generate a unique ob_number after 5 attempts (last candidate %)', _candidate;
    end if;
  end loop;
end $$;

-- Re-base the sequence to the true maximum so the next number is fresh.
-- bigint + the ^OB\d+$ filter means OB10000-style numbers are counted too.
do $$
declare
  _max bigint;
begin
  select coalesce(max(substring(ob_number from 3)::bigint), 0)
    into _max
    from public.occurrences
   where ob_number ~ '^OB\d+$';
  perform setval('public.ob_number_seq', greatest(_max + 1, 1), false);
end $$;
