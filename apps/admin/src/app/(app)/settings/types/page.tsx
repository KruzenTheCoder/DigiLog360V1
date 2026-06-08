import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { requireProfile, isAdmin } from '@/lib/auth';
import { PageHeader } from '@/components/page-header';
import { TypesManager } from '@/components/settings/types-manager';
import type { SeverityLevel } from '@digilog/shared';

export const dynamic = 'force-dynamic';

interface TypeRow {
  id: string; name: string; default_severity: SeverityLevel | null;
  is_active: boolean; sort_order: number;
  category: string | null; subcategory: string | null;
}
interface CategoryRow {
  id: string; name: string; is_active: boolean; sort_order: number;
}
interface SubcategoryRow {
  id: string; category: string; name: string; is_active: boolean; sort_order: number;
}

export default async function TypesPage() {
  const profile = await requireProfile();
  if (!isAdmin(profile)) redirect('/dashboard');

  const supabase = await createClient();

  // Parallel-fetch all three taxonomy tables.
  const [typesRes, catsRes, subsRes] = await Promise.all([
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (supabase as any).from('org_occurrence_types').select('*').order('sort_order', { ascending: true }),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (supabase as any).from('org_incident_categories').select('*').order('sort_order', { ascending: true }),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (supabase as any).from('org_incident_subcategories').select('*').order('sort_order', { ascending: true }),
  ]);

  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader
        title="Occurrence Types"
        description="Add categories, sub-categories, and types. They appear in the log-incident picker alongside the built-in taxonomy."
      />
      <TypesManager
        initialTypes={(typesRes.data ?? []) as TypeRow[]}
        initialCategories={(catsRes.data ?? []) as CategoryRow[]}
        initialSubcategories={(subsRes.data ?? []) as SubcategoryRow[]}
      />
    </div>
  );
}
