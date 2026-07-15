-- ============================================================================
-- DigiLog 360 — Fully editable incident taxonomy + rename-cascade.
--
-- Occurrences store category / subcategory / occurrence_type as free TEXT, and
-- every report GROUPs BY those strings. To let an org rename ANY taxonomy entry
-- (including the built-in defaults that live in code) while keeping historical
-- reports grouped, we:
--
--   1. "Fork" the built-in taxonomy into the org's own rows on first edit
--      (fork_org_taxonomy). From then on the pickers read ONLY the org's rows
--      (see organizations.taxonomy_customized + the shared merge helpers), so
--      built-in and custom entries become one uniform, editable set.
--   2. Rename via SECURITY DEFINER RPCs that update the taxonomy row AND cascade
--      the new wording across every matching occurrence, so the old and new
--      wording never split into two groups.
--
-- Un-forked orgs are untouched — the pickers keep merging built-ins + custom
-- exactly as before, so this migration is a no-op until someone edits.
-- ============================================================================

-- One flag per org: has this org taken ownership of its taxonomy?
alter table public.organizations
  add column if not exists taxonomy_customized boolean not null default false;

-- ----------------------------------------------------------------------------
-- fork_org_taxonomy — materialise the built-in taxonomy into the org's rows.
-- Idempotent: no-op once the org is customized; INSERTs skip anything already
-- present (so pre-existing custom rows are preserved). The built-in payload is
-- supplied by the app (single source of truth = @digilog/shared), shaped as a
-- jsonb array of { category, subcategory, name } in declaration order.
-- ----------------------------------------------------------------------------
create or replace function public.fork_org_taxonomy(_org uuid, _builtins jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not (public.is_super_user() or (public.is_admin() and _org = public.current_org_id())) then
    raise exception 'not authorized to customize taxonomy for this organization';
  end if;

  if exists (select 1 from public.organizations where id = _org and taxonomy_customized) then
    return;
  end if;

  -- Categories (distinct, ordered by first appearance).
  insert into public.org_incident_categories (org_id, name, sort_order)
  select _org, cat, min(ord)::int
  from (
    select elem->>'category' as cat, ord
    from jsonb_array_elements(_builtins) with ordinality as t(elem, ord)
  ) s
  where cat is not null and cat <> ''
  group by cat
  on conflict do nothing;

  -- Sub-categories (distinct category+name).
  insert into public.org_incident_subcategories (org_id, category, name, sort_order)
  select _org, cat, sub, min(ord)::int
  from (
    select elem->>'category' as cat, elem->>'subcategory' as sub, ord
    from jsonb_array_elements(_builtins) with ordinality as t(elem, ord)
  ) s
  where cat is not null and cat <> '' and sub is not null and sub <> ''
  group by cat, sub
  on conflict do nothing;

  -- Leaf types.
  insert into public.org_occurrence_types (org_id, category, subcategory, name, sort_order)
  select _org, elem->>'category', elem->>'subcategory', elem->>'name', ord::int
  from jsonb_array_elements(_builtins) with ordinality as t(elem, ord)
  where coalesce(elem->>'name', '') <> ''
  on conflict do nothing;

  update public.organizations set taxonomy_customized = true where id = _org;
end;
$$;

-- ----------------------------------------------------------------------------
-- Rename RPCs. Each renames the taxonomy row(s) at its level, re-points child
-- rows, and cascades the new wording onto every matching occurrence. Returns
-- the number of occurrences updated (for the UI's "N records updated" toast).
-- Callers must ensure `_new` is not already a sibling (the UI validates this)
-- so the unique indexes can't be violated.
-- ----------------------------------------------------------------------------

create or replace function public.rename_taxonomy_category(_org uuid, _old text, _new text)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare _n integer;
begin
  if not (public.is_super_user() or (public.is_admin() and _org = public.current_org_id())) then
    raise exception 'not authorized';
  end if;

  update public.org_incident_categories set name = _new
    where org_id = _org and lower(name) = lower(_old);
  update public.org_incident_subcategories set category = _new
    where org_id = _org and lower(category) = lower(_old);
  update public.org_occurrence_types set category = _new
    where org_id = _org and lower(category) = lower(_old);
  update public.occurrences set category = _new
    where org_id = _org and lower(category) = lower(_old);
  get diagnostics _n = row_count;
  return _n;
end;
$$;

create or replace function public.rename_taxonomy_subcategory(_org uuid, _category text, _old text, _new text)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare _n integer;
begin
  if not (public.is_super_user() or (public.is_admin() and _org = public.current_org_id())) then
    raise exception 'not authorized';
  end if;

  update public.org_incident_subcategories set name = _new
    where org_id = _org and lower(category) = lower(_category) and lower(name) = lower(_old);
  update public.org_occurrence_types set subcategory = _new
    where org_id = _org and lower(category) = lower(_category) and lower(subcategory) = lower(_old);
  update public.occurrences set subcategory = _new
    where org_id = _org and lower(category) = lower(_category) and lower(subcategory) = lower(_old);
  get diagnostics _n = row_count;
  return _n;
end;
$$;

create or replace function public.rename_taxonomy_type(_org uuid, _category text, _subcategory text, _old text, _new text)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare _n integer;
begin
  if not (public.is_super_user() or (public.is_admin() and _org = public.current_org_id())) then
    raise exception 'not authorized';
  end if;

  update public.org_occurrence_types set name = _new
    where org_id = _org
      and lower(coalesce(category, '')) = lower(coalesce(_category, ''))
      and lower(coalesce(subcategory, '')) = lower(coalesce(_subcategory, ''))
      and lower(name) = lower(_old);
  update public.occurrences set occurrence_type = _new
    where org_id = _org
      and lower(coalesce(category, '')) = lower(coalesce(_category, ''))
      and lower(coalesce(subcategory, '')) = lower(coalesce(_subcategory, ''))
      and lower(occurrence_type) = lower(_old);
  get diagnostics _n = row_count;
  return _n;
end;
$$;

grant execute on function public.fork_org_taxonomy(uuid, jsonb) to authenticated;
grant execute on function public.rename_taxonomy_category(uuid, text, text) to authenticated;
grant execute on function public.rename_taxonomy_subcategory(uuid, text, text, text) to authenticated;
grant execute on function public.rename_taxonomy_type(uuid, text, text, text, text) to authenticated;
