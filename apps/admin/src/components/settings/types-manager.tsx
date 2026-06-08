'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, Plus, Trash2 } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input, Select } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  SEVERITIES, SEVERITY_LABELS, SEVERITY_COLORS,
  mergeIncidentCategories, mergeIncidentSubcategories, mergeIncidentTypes,
  INCIDENT_CATEGORIES, getSubcategories, getIncidentTypes,
  type SeverityLevel,
  type OrgIncidentType, type OrgIncidentCategory, type OrgIncidentSubcategory,
} from '@digilog/shared';

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

// ===========================================================================
// Main manager
// ===========================================================================
export function TypesManager({
  initialTypes, initialCategories, initialSubcategories,
}: {
  initialTypes: TypeRow[];
  initialCategories: CategoryRow[];
  initialSubcategories: SubcategoryRow[];
}) {
  const router = useRouter();
  const [types, setTypes] = useState<TypeRow[]>(initialTypes);
  const [cats, setCats] = useState<CategoryRow[]>(initialCategories);
  const [subs, setSubs] = useState<SubcategoryRow[]>(initialSubcategories);

  // Merged option lists (built-in + active org-custom). Power both the
  // add-forms' dropdowns and the listing structure below.
  const orgCategoriesAsType = useMemo<OrgIncidentCategory[]>(
    () => cats.map((c) => ({ name: c.name, is_active: c.is_active, sort_order: c.sort_order })),
    [cats],
  );
  const orgSubsAsType = useMemo<OrgIncidentSubcategory[]>(
    () => subs.map((s) => ({ category: s.category, name: s.name, is_active: s.is_active, sort_order: s.sort_order })),
    [subs],
  );
  const orgTypesAsType = useMemo<OrgIncidentType[]>(
    () => types.map((t) => ({
      category: t.category, subcategory: t.subcategory, name: t.name,
      is_active: t.is_active, sort_order: t.sort_order,
    })),
    [types],
  );

  const allCategories = useMemo(
    () => mergeIncidentCategories(orgCategoriesAsType),
    [orgCategoriesAsType],
  );

  return (
    <div className="space-y-5">
      <AddCategoryCard
        onAdded={(row) => { setCats((prev) => [...prev, row]); router.refresh(); }}
        existing={cats}
      />
      <AddSubcategoryCard
        allCategories={allCategories}
        orgSubcategories={orgSubsAsType}
        onAdded={(row) => { setSubs((prev) => [...prev, row]); router.refresh(); }}
      />
      <AddTypeCard
        allCategories={allCategories}
        orgSubcategories={orgSubsAsType}
        orgTypes={orgTypesAsType}
        onAdded={(row) => { setTypes((prev) => [...prev, row]); router.refresh(); }}
        existingCount={types.length}
      />

      <CustomListing
        cats={cats} subs={subs} types={types}
        onCatChanged={(row) => setCats((p) => p.map((c) => (c.id === row.id ? row : c)))}
        onCatRemoved={(id) => setCats((p) => p.filter((c) => c.id !== id))}
        onSubChanged={(row) => setSubs((p) => p.map((s) => (s.id === row.id ? row : s)))}
        onSubRemoved={(id) => setSubs((p) => p.filter((s) => s.id !== id))}
        onTypeChanged={(row) => setTypes((p) => p.map((t) => (t.id === row.id ? row : t)))}
        onTypeRemoved={(id) => setTypes((p) => p.filter((t) => t.id !== id))}
      />
    </div>
  );
}

// ===========================================================================
// Add-Category card
// ===========================================================================
function AddCategoryCard({
  onAdded, existing,
}: {
  onAdded: (row: CategoryRow) => void;
  existing: CategoryRow[];
}) {
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function add() {
    setErr(null);
    if (!name.trim()) return;
    // Reject if it matches a built-in to keep the picker tidy.
    if ((INCIDENT_CATEGORIES as readonly string[]).some(
      (c) => c.toLowerCase() === name.trim().toLowerCase(),
    )) {
      setErr('That category is already built-in.');
      return;
    }
    setBusy(true);
    const supabase = createClient();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (supabase as any).from('org_incident_categories').insert({
      name: name.trim(), sort_order: existing.length,
    }).select().single();
    setBusy(false);
    if (error) { setErr(error.message); return; }
    onAdded(data as CategoryRow);
    setName('');
  }

  return (
    <Card>
      <CardHeader><CardTitle>Add Category</CardTitle></CardHeader>
      <CardContent>
        <p className="mb-3 text-xs text-[hsl(var(--muted))]">
          A category is the top level of the incident picker
          (e.g. <em>Security Incidents</em>, <em>Safety Incidents</em>).
        </p>
        <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
          <div>
            <label className="text-xs text-[hsl(var(--muted))]">Category name *</label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Compliance Incidents" />
          </div>
          <Button onClick={add} disabled={busy || !name.trim()} className="self-end">
            {busy && <Loader2 className="h-4 w-4 animate-spin" />} <Plus className="h-4 w-4" /> Add Category
          </Button>
        </div>
        {err && <p className="mt-2 text-sm text-red-600">{err}</p>}
      </CardContent>
    </Card>
  );
}

// ===========================================================================
// Add-Sub-category card
// ===========================================================================
function AddSubcategoryCard({
  allCategories, orgSubcategories, onAdded,
}: {
  allCategories: string[];
  orgSubcategories: OrgIncidentSubcategory[];
  onAdded: (row: SubcategoryRow) => void;
}) {
  const [category, setCategory] = useState('');
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const existingUnder = useMemo(
    () => mergeIncidentSubcategories(category, orgSubcategories),
    [category, orgSubcategories],
  );

  async function add() {
    setErr(null);
    if (!category) { setErr('Pick a category.'); return; }
    if (!name.trim()) return;
    if (getSubcategories(category).some((s) => s.toLowerCase() === name.trim().toLowerCase())) {
      setErr('That sub-category is already built-in.');
      return;
    }
    setBusy(true);
    const supabase = createClient();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (supabase as any).from('org_incident_subcategories').insert({
      category, name: name.trim(),
      sort_order: orgSubcategories.filter((s) => s.category === category).length,
    }).select().single();
    setBusy(false);
    if (error) { setErr(error.message); return; }
    onAdded(data as SubcategoryRow);
    setName('');
  }

  return (
    <Card>
      <CardHeader><CardTitle>Add Sub-category</CardTitle></CardHeader>
      <CardContent>
        <p className="mb-3 text-xs text-[hsl(var(--muted))]">
          A sub-category lives under a category
          (e.g. <em>Criminal incident</em> under <em>Security Incidents</em>).
        </p>
        <div className="grid gap-3 sm:grid-cols-[1fr_1fr_auto]">
          <div>
            <label className="text-xs text-[hsl(var(--muted))]">Parent category *</label>
            <Select value={category} onChange={(e) => setCategory(e.target.value)}>
              <option value="">Select…</option>
              {allCategories.map((c) => <option key={c} value={c}>{c}</option>)}
            </Select>
          </div>
          <div>
            <label className="text-xs text-[hsl(var(--muted))]">Sub-category name *</label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Property Damage"
              disabled={!category}
            />
          </div>
          <Button onClick={add} disabled={busy || !name.trim() || !category} className="self-end">
            {busy && <Loader2 className="h-4 w-4 animate-spin" />} <Plus className="h-4 w-4" /> Add Sub-category
          </Button>
        </div>
        {existingUnder.length > 0 && category && (
          <p className="mt-3 text-xs text-[hsl(var(--muted))]">
            Under <strong>{category}</strong>: {existingUnder.join(' · ')}
          </p>
        )}
        {err && <p className="mt-2 text-sm text-red-600">{err}</p>}
      </CardContent>
    </Card>
  );
}

// ===========================================================================
// Add-Type card
// ===========================================================================
function AddTypeCard({
  allCategories, orgSubcategories, orgTypes, onAdded, existingCount,
}: {
  allCategories: string[];
  orgSubcategories: OrgIncidentSubcategory[];
  orgTypes: OrgIncidentType[];
  onAdded: (row: TypeRow) => void;
  existingCount: number;
}) {
  const [category, setCategory] = useState('');
  const [subcategory, setSubcategory] = useState('');
  const [name, setName] = useState('');
  const [severity, setSeverity] = useState<SeverityLevel | ''>('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const subcategoryOptions = useMemo(
    () => mergeIncidentSubcategories(category, orgSubcategories),
    [category, orgSubcategories],
  );
  const typesUnder = useMemo(
    () => mergeIncidentTypes(category, subcategory, orgTypes),
    [category, subcategory, orgTypes],
  );

  function onCategoryChange(c: string) {
    setCategory(c);
    setSubcategory('');
  }

  async function add() {
    setErr(null);
    if (!category) { setErr('Pick a category.'); return; }
    if (!subcategory) { setErr('Pick a sub-category.'); return; }
    if (!name.trim()) return;
    if (getIncidentTypes(category, subcategory).some(
      (t) => t.toLowerCase() === name.trim().toLowerCase(),
    )) {
      setErr('That type is already built-in.');
      return;
    }
    setBusy(true);
    const supabase = createClient();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (supabase as any).from('org_occurrence_types').insert({
      name: name.trim(),
      category, subcategory,
      default_severity: severity || null,
      sort_order: existingCount,
    }).select().single();
    setBusy(false);
    if (error) { setErr(error.message); return; }
    onAdded(data as TypeRow);
    setName(''); setSeverity('');
  }

  return (
    <Card>
      <CardHeader><CardTitle>Add Type</CardTitle></CardHeader>
      <CardContent>
        <p className="mb-3 text-xs text-[hsl(var(--muted))]">
          A type is the specific incident name shown at the leaf level
          (e.g. <em>Armed Robbery</em>).
        </p>
        <div className="grid gap-3 sm:grid-cols-3">
          <div>
            <label className="text-xs text-[hsl(var(--muted))]">Category *</label>
            <Select value={category} onChange={(e) => onCategoryChange(e.target.value)}>
              <option value="">Select…</option>
              {allCategories.map((c) => <option key={c} value={c}>{c}</option>)}
            </Select>
          </div>
          <div>
            <label className="text-xs text-[hsl(var(--muted))]">Sub-category *</label>
            <Select
              value={subcategory}
              onChange={(e) => setSubcategory(e.target.value)}
              disabled={!category}
            >
              <option value="">{category ? 'Select…' : 'Pick a category first'}</option>
              {subcategoryOptions.map((s) => <option key={s} value={s}>{s}</option>)}
            </Select>
          </div>
          <div>
            <label className="text-xs text-[hsl(var(--muted))]">Default severity</label>
            <Select value={severity} onChange={(e) => setSeverity(e.target.value as SeverityLevel | '')}>
              <option value="">— None —</option>
              {SEVERITIES.map((s) => <option key={s} value={s}>{SEVERITY_LABELS[s]}</option>)}
            </Select>
          </div>
        </div>
        <div className="mt-3 grid gap-3 sm:grid-cols-[1fr_auto]">
          <div>
            <label className="text-xs text-[hsl(var(--muted))]">Type name *</label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Suspicious vehicle"
              disabled={!subcategory}
            />
          </div>
          <Button onClick={add} disabled={busy || !name.trim() || !subcategory} className="self-end">
            {busy && <Loader2 className="h-4 w-4 animate-spin" />} <Plus className="h-4 w-4" /> Add Type
          </Button>
        </div>
        {typesUnder.length > 0 && subcategory && (
          <p className="mt-3 text-xs text-[hsl(var(--muted))]">
            Under <strong>{subcategory}</strong>: {typesUnder.join(' · ')}
          </p>
        )}
        {err && <p className="mt-2 text-sm text-red-600">{err}</p>}
      </CardContent>
    </Card>
  );
}

// ===========================================================================
// Custom listing — only shows org-custom rows. Built-ins are immutable.
// ===========================================================================
function CustomListing({
  cats, subs, types,
  onCatChanged, onCatRemoved,
  onSubChanged, onSubRemoved,
  onTypeChanged, onTypeRemoved,
}: {
  cats: CategoryRow[]; subs: SubcategoryRow[]; types: TypeRow[];
  onCatChanged: (row: CategoryRow) => void; onCatRemoved: (id: string) => void;
  onSubChanged: (row: SubcategoryRow) => void; onSubRemoved: (id: string) => void;
  onTypeChanged: (row: TypeRow) => void; onTypeRemoved: (id: string) => void;
}) {
  const empty = cats.length === 0 && subs.length === 0 && types.length === 0;
  if (empty) {
    return (
      <Card>
        <CardHeader><CardTitle>Your custom additions</CardTitle></CardHeader>
        <CardContent>
          <p className="text-sm text-[hsl(var(--muted))]">
            None yet. The built-in taxonomy is used by default.
          </p>
        </CardContent>
      </Card>
    );
  }
  return (
    <Card>
      <CardHeader><CardTitle>Your custom additions</CardTitle></CardHeader>
      <CardContent className="space-y-5">
        {cats.length > 0 && (
          <Section title="Categories">
            {cats.map((c) => (
              <CustomRow
                key={c.id}
                label={c.name}
                inactive={!c.is_active}
                onToggle={async () => {
                  const sb = createClient();
                  const next = { ...c, is_active: !c.is_active };
                  // eslint-disable-next-line @typescript-eslint/no-explicit-any
                  await (sb as any).from('org_incident_categories').update({ is_active: next.is_active }).eq('id', c.id);
                  onCatChanged(next);
                }}
                onDelete={async () => {
                  if (!confirm(`Delete category "${c.name}"? Sub-categories under it stay (so types still work).`)) return;
                  const sb = createClient();
                  // eslint-disable-next-line @typescript-eslint/no-explicit-any
                  await (sb as any).from('org_incident_categories').delete().eq('id', c.id);
                  onCatRemoved(c.id);
                }}
              />
            ))}
          </Section>
        )}

        {subs.length > 0 && (
          <Section title="Sub-categories">
            {subs.map((s) => (
              <CustomRow
                key={s.id}
                label={<><span className="text-[hsl(var(--muted))]">{s.category} ›</span> {s.name}</>}
                inactive={!s.is_active}
                onToggle={async () => {
                  const sb = createClient();
                  const next = { ...s, is_active: !s.is_active };
                  // eslint-disable-next-line @typescript-eslint/no-explicit-any
                  await (sb as any).from('org_incident_subcategories').update({ is_active: next.is_active }).eq('id', s.id);
                  onSubChanged(next);
                }}
                onDelete={async () => {
                  if (!confirm(`Delete sub-category "${s.name}"?`)) return;
                  const sb = createClient();
                  // eslint-disable-next-line @typescript-eslint/no-explicit-any
                  await (sb as any).from('org_incident_subcategories').delete().eq('id', s.id);
                  onSubRemoved(s.id);
                }}
              />
            ))}
          </Section>
        )}

        {types.length > 0 && (
          <Section title="Types">
            {types.map((t) => (
              <CustomRow
                key={t.id}
                label={
                  <>
                    <span className="text-[hsl(var(--muted))]">
                      {t.category ?? '—'} › {t.subcategory ?? '—'} ›
                    </span>{' '}
                    {t.name}
                  </>
                }
                badge={t.default_severity ? {
                  label: SEVERITY_LABELS[t.default_severity], color: SEVERITY_COLORS[t.default_severity],
                } : undefined}
                inactive={!t.is_active}
                onToggle={async () => {
                  const sb = createClient();
                  const next = { ...t, is_active: !t.is_active };
                  // eslint-disable-next-line @typescript-eslint/no-explicit-any
                  await (sb as any).from('org_occurrence_types').update({ is_active: next.is_active }).eq('id', t.id);
                  onTypeChanged(next);
                }}
                onDelete={async () => {
                  if (!confirm(`Delete type "${t.name}"?`)) return;
                  const sb = createClient();
                  // eslint-disable-next-line @typescript-eslint/no-explicit-any
                  await (sb as any).from('org_occurrence_types').delete().eq('id', t.id);
                  onTypeRemoved(t.id);
                }}
              />
            ))}
          </Section>
        )}
      </CardContent>
    </Card>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-[hsl(var(--muted))]">
        {title}
      </h3>
      <div className="rounded-lg border divide-y">{children}</div>
    </div>
  );
}

function CustomRow({
  label, badge, inactive, onToggle, onDelete,
}: {
  label: React.ReactNode;
  badge?: { label: string; color: string };
  inactive: boolean;
  onToggle: () => void;
  onDelete: () => void;
}) {
  return (
    <div className="flex items-center justify-between gap-2 px-3 py-2 text-sm">
      <div className={`flex items-center gap-2 ${inactive ? 'italic text-[hsl(var(--muted))]' : ''}`}>
        <span>{label}</span>
        {badge && <Badge color={badge.color}>{badge.label}</Badge>}
        {inactive && <Badge color="#64748b">Inactive</Badge>}
      </div>
      <div className="flex gap-1">
        <Button size="sm" variant="ghost" onClick={onToggle}>
          {inactive ? 'Enable' : 'Disable'}
        </Button>
        <Button size="icon" variant="ghost" onClick={onDelete} title="Delete">
          <Trash2 className="h-4 w-4 text-red-600" />
        </Button>
      </div>
    </div>
  );
}
