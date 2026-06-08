-- Rename the seeded demo org to PMI.
-- Single-tenant deployment: the mobile app hardcodes org_slug='pmi'.
-- Safe to re-run.

update public.organizations
set
  name = 'PMI',
  slug = 'pmi',
  legal_name = 'PMI'
where slug = 'digilog-demo';

-- If a prior run already inserted a 'pmi' org separately, the above is a no-op.
-- Either way, make sure exactly one PMI org exists.
insert into public.organizations (name, slug, legal_name, plan)
select 'PMI', 'pmi', 'PMI', 'standard'
where not exists (select 1 from public.organizations where slug = 'pmi');
