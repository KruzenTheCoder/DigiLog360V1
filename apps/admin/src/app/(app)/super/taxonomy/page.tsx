import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { requireProfile, isSuperUser } from '@/lib/auth';
import { PageHeader } from '@/components/page-header';
import { TaxonomyManager } from '@/components/super/taxonomy-manager';
import type { SeverityLevel } from '@digilog/shared';

export const dynamic = 'force-dynamic';

interface TypeRow {
  id: string; name: string; default_severity: SeverityLevel | null;
  is_active: boolean; sort_order: number;
  category: string | null; subcategory: string | null;
}
interface CategoryRow { id: string; name: string; is_active: boolean; sort_order: number }
interface SubcategoryRow { id: string; category: string; name: string; is_active: boolean; sort_order: number }

export default async function TaxonomyPage() {
  const profile = await requireProfile();
  if (!isSuperUser(profile)) redirect('/dashboard');

  const supabase = await createClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sb: any = supabase;
  const orgId = (profile as unknown as { org_id: string }).org_id;

  const [typesRes, catsRes, subsRes, orgRes] = await Promise.all([
    sb.from('org_occurrence_types').select('*').order('sort_order', { ascending: true }),
    sb.from('org_incident_categories').select('*').order('sort_order', { ascending: true }),
    sb.from('org_incident_subcategories').select('*').order('sort_order', { ascending: true }),
    sb.from('organizations').select('taxonomy_customized').eq('id', orgId).single(),
  ]);

  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader
        title="Occurrence Taxonomy"
        description="Add, rename, reorder, disable, or delete the Category → Sub-category → Type dropdown lists used across the app. Renaming updates historical records too, so your reports stay grouped."
      />
      <TaxonomyManager
        orgId={orgId}
        initialCustomized={Boolean(orgRes?.data?.taxonomy_customized)}
        initialTypes={(typesRes.data ?? []) as TypeRow[]}
        initialCategories={(catsRes.data ?? []) as CategoryRow[]}
        initialSubcategories={(subsRes.data ?? []) as SubcategoryRow[]}
      />
    </div>
  );
}
