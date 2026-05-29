-- ============================================================================
-- DigiLog 360 — Seed data (idempotent: safe to run multiple times)
-- Run after migrations.  Auth users (admin, guards) are created separately via
-- `scripts/bootstrap-admin.mjs` because passwords must go through the Auth API.
-- ============================================================================

-- Sites (from the legacy hardcoded list) ------------------------------------
insert into public.sites (name, code, address) values
  ('Sandton',    'SAN', 'Sandton, Johannesburg'),
  ('Cape Town',  'CPT', 'Cape Town CBD'),
  ('Boksburg',   'BOK', 'Boksburg, East Rand'),
  ('HQ Central', 'HQ',  'Head Office')
on conflict (name) do nothing;

-- Sample patrol route + checkpoints for HQ Central (idempotent) --------------
do $$
declare
  _site uuid;
  _route uuid;
  _cp uuid;
  _i int;
  _names text[] := array['Main Gate','Reception','Server Room','Parking Level 1','Perimeter North','Loading Bay'];
  _code text;
begin
  select id into _site from public.sites where code = 'HQ';
  if _site is null then return; end if;

  -- Route (look up first; only create if missing)
  select id into _route from public.patrol_routes
    where site_id = _site and name = 'HQ Standard Night Patrol' limit 1;
  if _route is null then
    insert into public.patrol_routes (site_id, name, description, expected_duration_minutes)
    values (_site, 'HQ Standard Night Patrol', 'Full perimeter and interior sweep', 45)
    returning id into _route;
  end if;

  -- Checkpoints + route membership (skip any that already exist)
  for _i in 1 .. array_length(_names, 1) loop
    _code := 'HQ-CP' || lpad(_i::text, 2, '0');

    select id into _cp from public.checkpoints where site_id = _site and code = _code limit 1;
    if _cp is null then
      insert into public.checkpoints (site_id, name, code, sort_order, geofence_radius_m)
      values (_site, _names[_i], _code, _i, 50)
      returning id into _cp;
    end if;

    if _cp is not null and _route is not null then
      insert into public.route_checkpoints (route_id, checkpoint_id, sort_order)
      values (_route, _cp, _i)
      on conflict (route_id, checkpoint_id) do nothing;
    end if;
  end loop;

  -- Keep the route's expected checkpoint count in sync on patrols created later.
  update public.patrol_routes set updated_at = now() where id = _route;
end $$;
