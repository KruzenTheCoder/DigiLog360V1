'use client';

import { useCallback, useMemo, useState } from 'react';
import {
  Loader2, Plus, Trash2, Pencil, Check, X, ChevronRight, ChevronDown, Info,
} from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input, Select } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  SEVERITIES, SEVERITY_LABELS, SEVERITY_COLORS,
  flattenBuiltinTaxonomy,
  type SeverityLevel,
} from '@digilog/shared';

// ---------------------------------------------------------------------------
// Row shapes (mirror the three org taxonomy tables).
// ---------------------------------------------------------------------------
interface TypeRow {
  id: string; name: string; default_severity: SeverityLevel | null;
  is_active: boolean; sort_order: number;
  category: string | null; subcategory: string | null;
}
interface CategoryRow { id: string; name: string; is_active: boolean; sort_order: number }
interface SubcategoryRow { id: string; category: string; name: string; is_active: boolean; sort_order: number }

// A uniform display node for the tree, whether it comes from a real DB row
// (has `id`) or a built-in default not yet materialised (`builtin`, no `id`).
interface Node { name: string; id?: string; active: boolean; builtin: boolean; severity?: SeverityLevel | null }

// ===========================================================================
export function TaxonomyManager({
  orgId, initialCustomized, initialTypes, initialCategories, initialSubcategories,
}: {
  orgId: string;
  initialCustomized: boolean;
  initialTypes: TypeRow[];
  initialCategories: CategoryRow[];
  initialSubcategories: SubcategoryRow[];
}) {
  const [customized, setCustomized] = useState(initialCustomized);
  const [cats, setCats] = useState<CategoryRow[]>(initialCategories);
  const [subs, setSubs] = useState<SubcategoryRow[]>(initialSubcategories);
  const [types, setTypes] = useState<TypeRow[]>(initialTypes);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [flash, setFlash] = useState<string | null>(null);

  const sb = useMemo(() => createClient(), []);

  // ---- fork-on-demand -----------------------------------------------------
  // Every mutation funnels through here first. Once the org is "customized"
  // this is a no-op; otherwise it materialises the built-in taxonomy into rows
  // and reloads them so subsequent edits operate on real rows with ids.
  const ensureForked = useCallback(async (): Promise<boolean> => {
    if (customized) return true;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error: forkErr } = await (sb as any).rpc('fork_org_taxonomy', {
      _org: orgId, _builtins: flattenBuiltinTaxonomy(),
    });
    if (forkErr) { setError(forkErr.message); return false; }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const s: any = sb;
    const [c, sc, t] = await Promise.all([
      s.from('org_incident_categories').select('*').order('sort_order', { ascending: true }),
      s.from('org_incident_subcategories').select('*').order('sort_order', { ascending: true }),
      s.from('org_occurrence_types').select('*').order('sort_order', { ascending: true }),
    ]);
    setCats((c.data ?? []) as CategoryRow[]);
    setSubs((sc.data ?? []) as SubcategoryRow[]);
    setTypes((t.data ?? []) as TypeRow[]);
    setCustomized(true);
    return true;
  }, [customized, orgId, sb]);

  // ---- view model ---------------------------------------------------------
  // When customized, the tree is exactly the rows. When not, we synthesise
  // read nodes for the built-in defaults (+ any custom rows) so the user sees
  // the full standard list and the first edit transparently forks it.
  const builtin = useMemo(() => flattenBuiltinTaxonomy(), []);

  const categoryNodes: Node[] = useMemo(() => {
    if (customized) {
      return [...cats].sort(byOrder).map((c) => ({ name: c.name, id: c.id, active: c.is_active, builtin: false }));
    }
    const seen = new Set<string>();
    const out: Node[] = [];
    for (const b of builtin) {
      if (seen.has(b.category.toLowerCase())) continue;
      seen.add(b.category.toLowerCase());
      out.push({ name: b.category, active: true, builtin: true });
    }
    for (const c of [...cats].sort(byOrder)) {
      if (seen.has(c.name.toLowerCase())) continue;
      out.push({ name: c.name, id: c.id, active: c.is_active, builtin: false });
    }
    return out;
  }, [customized, cats, builtin]);

  const subNodesFor = useCallback((category: string): Node[] => {
    if (customized) {
      return [...subs].filter((s) => eq(s.category, category)).sort(byOrder)
        .map((s) => ({ name: s.name, id: s.id, active: s.is_active, builtin: false }));
    }
    const seen = new Set<string>();
    const out: Node[] = [];
    for (const b of builtin) {
      if (!eq(b.category, category) || seen.has(b.subcategory.toLowerCase())) continue;
      seen.add(b.subcategory.toLowerCase());
      out.push({ name: b.subcategory, active: true, builtin: true });
    }
    for (const s of [...subs].filter((s) => eq(s.category, category)).sort(byOrder)) {
      if (seen.has(s.name.toLowerCase())) continue;
      out.push({ name: s.name, id: s.id, active: s.is_active, builtin: false });
    }
    return out;
  }, [customized, subs, builtin]);

  const typeNodesFor = useCallback((category: string, subcategory: string): Node[] => {
    if (customized) {
      return [...types].filter((t) => eq(t.category, category) && eq(t.subcategory, subcategory)).sort(byOrder)
        .map((t) => ({ name: t.name, id: t.id, active: t.is_active, builtin: false, severity: t.default_severity }));
    }
    const seen = new Set<string>();
    const out: Node[] = [];
    for (const b of builtin) {
      if (!eq(b.category, category) || !eq(b.subcategory, subcategory) || seen.has(b.name.toLowerCase())) continue;
      seen.add(b.name.toLowerCase());
      out.push({ name: b.name, active: true, builtin: true });
    }
    for (const t of [...types].filter((t) => eq(t.category, category) && eq(t.subcategory, subcategory)).sort(byOrder)) {
      if (seen.has(t.name.toLowerCase())) continue;
      out.push({ name: t.name, id: t.id, active: t.is_active, builtin: false, severity: t.default_severity });
    }
    return out;
  }, [customized, types, builtin]);

  // ---- mutations ----------------------------------------------------------
  function announce(msg: string) { setFlash(msg); setError(null); setTimeout(() => setFlash(null), 6000); }

  const renameCategory = useCallback(async (oldName: string, newName: string) => {
    setBusy(true); setError(null);
    if (!(await ensureForked())) { setBusy(false); return; }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error: e } = await (sb as any).rpc('rename_taxonomy_category', { _org: orgId, _old: oldName, _new: newName });
    setBusy(false);
    if (e) { setError(e.message); return; }
    setCats((p) => p.map((c) => (eq(c.name, oldName) ? { ...c, name: newName } : c)));
    setSubs((p) => p.map((s) => (eq(s.category, oldName) ? { ...s, category: newName } : s)));
    setTypes((p) => p.map((t) => (eq(t.category, oldName) ? { ...t, category: newName } : t)));
    announce(`Renamed category to “${newName}”. ${data ?? 0} record(s) updated.`);
  }, [ensureForked, orgId, sb]);

  const renameSubcategory = useCallback(async (category: string, oldName: string, newName: string) => {
    setBusy(true); setError(null);
    if (!(await ensureForked())) { setBusy(false); return; }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error: e } = await (sb as any).rpc('rename_taxonomy_subcategory', { _org: orgId, _category: category, _old: oldName, _new: newName });
    setBusy(false);
    if (e) { setError(e.message); return; }
    setSubs((p) => p.map((s) => (eq(s.category, category) && eq(s.name, oldName) ? { ...s, name: newName } : s)));
    setTypes((p) => p.map((t) => (eq(t.category, category) && eq(t.subcategory, oldName) ? { ...t, subcategory: newName } : t)));
    announce(`Renamed sub-category to “${newName}”. ${data ?? 0} record(s) updated.`);
  }, [ensureForked, orgId, sb]);

  const renameType = useCallback(async (category: string, subcategory: string, oldName: string, newName: string) => {
    setBusy(true); setError(null);
    if (!(await ensureForked())) { setBusy(false); return; }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error: e } = await (sb as any).rpc('rename_taxonomy_type', { _org: orgId, _category: category, _subcategory: subcategory, _old: oldName, _new: newName });
    setBusy(false);
    if (e) { setError(e.message); return; }
    setTypes((p) => p.map((t) => (eq(t.category, category) && eq(t.subcategory, subcategory) && eq(t.name, oldName) ? { ...t, name: newName } : t)));
    announce(`Renamed type to “${newName}”. ${data ?? 0} record(s) updated.`);
  }, [ensureForked, orgId, sb]);

  // Toggle-active / delete work by NAME + scope rather than row id: after a
  // fork the built-in nodes gain rows whose names match exactly, and every row
  // is unique within its (org, [category], [subcategory]) scope, so a scoped
  // .eq() match hits exactly one row — no id round-trip needed.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const s: any = sb;

  const toggleCategory = useCallback(async (cat: Node) => {
    setBusy(true); setError(null);
    if (!(await ensureForked())) { setBusy(false); return; }
    const { error: e } = await s.from('org_incident_categories').update({ is_active: !cat.active }).eq('org_id', orgId).eq('name', cat.name);
    setBusy(false);
    if (e) { setError(e.message); return; }
    setCats((p) => p.map((c) => (eq(c.name, cat.name) ? { ...c, is_active: !cat.active } : c)));
  }, [ensureForked, s, orgId]);

  const deleteCategory = useCallback(async (cat: Node) => {
    if (!confirm(`Delete “${cat.name}”? Historical records keep their existing wording; only the dropdown option is removed.`)) return;
    setBusy(true); setError(null);
    if (!(await ensureForked())) { setBusy(false); return; }
    const { error: e } = await s.from('org_incident_categories').delete().eq('org_id', orgId).eq('name', cat.name);
    setBusy(false);
    if (e) { setError(e.message); return; }
    setCats((p) => p.filter((c) => !eq(c.name, cat.name)));
  }, [ensureForked, s, orgId]);

  const toggleSub = useCallback(async (category: string, sub: Node) => {
    setBusy(true); setError(null);
    if (!(await ensureForked())) { setBusy(false); return; }
    const { error: e } = await s.from('org_incident_subcategories').update({ is_active: !sub.active }).eq('org_id', orgId).eq('category', category).eq('name', sub.name);
    setBusy(false);
    if (e) { setError(e.message); return; }
    setSubs((p) => p.map((x) => (eq(x.category, category) && eq(x.name, sub.name) ? { ...x, is_active: !sub.active } : x)));
  }, [ensureForked, s, orgId]);

  const deleteSub = useCallback(async (category: string, sub: Node) => {
    if (!confirm(`Delete “${sub.name}”? Historical records keep their existing wording.`)) return;
    setBusy(true); setError(null);
    if (!(await ensureForked())) { setBusy(false); return; }
    const { error: e } = await s.from('org_incident_subcategories').delete().eq('org_id', orgId).eq('category', category).eq('name', sub.name);
    setBusy(false);
    if (e) { setError(e.message); return; }
    setSubs((p) => p.filter((x) => !(eq(x.category, category) && eq(x.name, sub.name))));
  }, [ensureForked, s, orgId]);

  const toggleType = useCallback(async (category: string, subcategory: string, t: Node) => {
    setBusy(true); setError(null);
    if (!(await ensureForked())) { setBusy(false); return; }
    const { error: e } = await s.from('org_occurrence_types').update({ is_active: !t.active }).eq('org_id', orgId).eq('category', category).eq('subcategory', subcategory).eq('name', t.name);
    setBusy(false);
    if (e) { setError(e.message); return; }
    setTypes((p) => p.map((x) => (eq(x.category, category) && eq(x.subcategory, subcategory) && eq(x.name, t.name) ? { ...x, is_active: !t.active } : x)));
  }, [ensureForked, s, orgId]);

  const deleteType = useCallback(async (category: string, subcategory: string, t: Node) => {
    if (!confirm(`Delete “${t.name}”? Historical records keep their existing wording.`)) return;
    setBusy(true); setError(null);
    if (!(await ensureForked())) { setBusy(false); return; }
    const { error: e } = await s.from('org_occurrence_types').delete().eq('org_id', orgId).eq('category', category).eq('subcategory', subcategory).eq('name', t.name);
    setBusy(false);
    if (e) { setError(e.message); return; }
    setTypes((p) => p.filter((x) => !(eq(x.category, category) && eq(x.subcategory, subcategory) && eq(x.name, t.name))));
  }, [ensureForked, s, orgId]);

  // ---- render -------------------------------------------------------------
  return (
    <div className="space-y-5">
      <div className="rounded-xl border border-brand/30 bg-brand/5 px-4 py-3 text-sm">
        <p className="flex items-center gap-2 font-semibold text-brand"><Info className="h-4 w-4" /> How this works</p>
        <p className="mt-1 text-[hsl(var(--muted))]">
          {customized
            ? 'This organization has its own editable copy of the taxonomy. Renaming an entry also rewrites it on every historical record, so your reports stay grouped under one name.'
            : 'This organization currently uses the standard built-in list. Your first edit creates an editable copy — after that you can rename, reorder, disable, or delete any entry, and renames update historical records so reports stay grouped.'}
        </p>
      </div>

      {error && <div className="rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300">{error}</div>}
      {flash && <div className="rounded-lg border border-emerald-300 bg-emerald-50 px-3 py-2 text-sm text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-300">{flash}</div>}

      <AddCards
        categoryNodes={categoryNodes}
        subNodesFor={subNodesFor}
        typeNodesFor={typeNodesFor}
        ensureForked={ensureForked}
        orgId={orgId}
        sb={sb}
        onCategoryAdded={(row) => setCats((p) => [...p, row])}
        onSubAdded={(row) => setSubs((p) => [...p, row])}
        onTypeAdded={(row) => setTypes((p) => [...p, row])}
        onError={setError}
        counts={{ cats: cats.length, subsFor: (c) => subs.filter((s) => eq(s.category, c)).length, typesLen: types.length }}
      />

      <Card>
        <CardHeader><CardTitle>Current taxonomy</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          {categoryNodes.length === 0 && <p className="text-sm text-[hsl(var(--muted))]">No entries.</p>}
          {categoryNodes.map((cat) => (
            <TreeCategory
              key={cat.name}
              cat={cat}
              busy={busy}
              subNodes={subNodesFor(cat.name)}
              typeNodesFor={(sub) => typeNodesFor(cat.name, sub)}
              onRename={(nn) => renameCategory(cat.name, nn)}
              onToggle={() => toggleCategory(cat)}
              onDelete={() => deleteCategory(cat)}
              onRenameSub={(sub, nn) => renameSubcategory(cat.name, sub, nn)}
              onToggleSub={(sub) => toggleSub(cat.name, sub)}
              onDeleteSub={(sub) => deleteSub(cat.name, sub)}
              onRenameType={(sub, oldT, nn) => renameType(cat.name, sub, oldT, nn)}
              onToggleType={(sub, t) => toggleType(cat.name, sub, t)}
              onDeleteType={(sub, t) => deleteType(cat.name, sub, t)}
            />
          ))}
        </CardContent>
      </Card>
    </div>
  );
}

// ===========================================================================
// Tree rendering
// ===========================================================================
function TreeCategory({
  cat, subNodes, typeNodesFor, busy,
  onRename, onToggle, onDelete,
  onRenameSub, onToggleSub, onDeleteSub,
  onRenameType, onToggleType, onDeleteType,
}: {
  cat: Node; subNodes: Node[]; typeNodesFor: (sub: string) => Node[]; busy: boolean;
  onRename: (nn: string) => void; onToggle: () => void; onDelete: () => void;
  onRenameSub: (sub: string, nn: string) => void;
  onToggleSub: (sub: Node) => void;
  onDeleteSub: (sub: Node) => void;
  onRenameType: (sub: string, oldT: string, nn: string) => void;
  onToggleType: (sub: string, t: Node) => void;
  onDeleteType: (sub: string, t: Node) => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="rounded-lg border">
      <RowShell
        depth={0} open={open} onToggleOpen={() => setOpen((o) => !o)}
        node={cat} busy={busy} onRename={onRename} onToggleActive={onToggle} onDelete={onDelete}
        hasChildren
      />
      {open && (
        <div className="border-t bg-[hsl(var(--surface))]/40">
          {subNodes.length === 0 && <p className="px-6 py-2 text-xs text-[hsl(var(--muted))]">No sub-categories.</p>}
          {subNodes.map((sub) => (
            <TreeSub
              key={sub.name} sub={sub} busy={busy} types={typeNodesFor(sub.name)}
              onRename={(nn) => onRenameSub(sub.name, nn)}
              onToggle={() => onToggleSub(sub)}
              onDelete={() => onDeleteSub(sub)}
              onRenameType={(oldT, nn) => onRenameType(sub.name, oldT, nn)}
              onToggleType={(t) => onToggleType(sub.name, t)}
              onDeleteType={(t) => onDeleteType(sub.name, t)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function TreeSub({
  sub, types, busy, onRename, onToggle, onDelete, onRenameType, onToggleType, onDeleteType,
}: {
  sub: Node; types: Node[]; busy: boolean;
  onRename: (nn: string) => void; onToggle: () => void; onDelete: () => void;
  onRenameType: (oldT: string, nn: string) => void;
  onToggleType: (t: Node) => void;
  onDeleteType: (t: Node) => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="border-t first:border-t-0">
      <RowShell
        depth={1} open={open} onToggleOpen={() => setOpen((o) => !o)}
        node={sub} busy={busy} onRename={onRename} onToggleActive={onToggle} onDelete={onDelete}
        hasChildren
      />
      {open && (
        <div className="bg-[hsl(var(--surface))]/60">
          {types.length === 0 && <p className="px-10 py-2 text-xs text-[hsl(var(--muted))]">No types.</p>}
          {types.map((t) => (
            <RowShell
              key={t.name} depth={2} node={t} busy={busy}
              onRename={(nn) => onRenameType(t.name, nn)}
              onToggleActive={() => onToggleType(t)}
              onDelete={() => onDeleteType(t)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// A single editable row (used at all three depths).
function RowShell({
  node, depth, busy, open, onToggleOpen, hasChildren, onRename, onToggleActive, onDelete,
}: {
  node: Node; depth: 0 | 1 | 2; busy: boolean;
  open?: boolean; onToggleOpen?: () => void; hasChildren?: boolean;
  onRename: (nn: string) => void; onToggleActive: () => void; onDelete: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [val, setVal] = useState(node.name);
  const pad = depth === 0 ? 'px-3' : depth === 1 ? 'pl-8 pr-3' : 'pl-14 pr-3';

  function save() {
    const nn = val.trim();
    if (!nn || eq(nn, node.name)) { setEditing(false); setVal(node.name); return; }
    onRename(nn);
    setEditing(false);
  }

  return (
    <div className={`flex items-center gap-2 py-2 text-sm ${pad}`}>
      {hasChildren ? (
        <button type="button" onClick={onToggleOpen} className="shrink-0 text-[hsl(var(--muted))]">
          {open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
        </button>
      ) : <span className="w-4 shrink-0" />}

      {editing ? (
        <div className="flex flex-1 items-center gap-1 max-w-[32rem]">
          <Input autoFocus value={val} onChange={(e) => setVal(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') save(); if (e.key === 'Escape') { setEditing(false); setVal(node.name); } }} />
          <Button size="icon" variant="ghost" onClick={save} disabled={busy} title="Save"><Check className="h-4 w-4 text-emerald-600" /></Button>
          <Button size="icon" variant="ghost" onClick={() => { setEditing(false); setVal(node.name); }} title="Cancel"><X className="h-4 w-4" /></Button>
        </div>
      ) : (
        <>
          <span className={`flex-1 truncate ${!node.active ? 'italic text-[hsl(var(--muted))]' : depth === 0 ? 'font-semibold' : depth === 1 ? 'font-medium' : ''}`}>
            {node.name}
          </span>
          {node.severity && <Badge color={SEVERITY_COLORS[node.severity]}>{SEVERITY_LABELS[node.severity]}</Badge>}
          {node.builtin && <Badge color="#64748b">Built-in</Badge>}
          {!node.active && <Badge color="#94a3b8">Disabled</Badge>}
          <div className="flex shrink-0 gap-0.5">
            <Button size="icon" variant="ghost" onClick={() => { setVal(node.name); setEditing(true); }} disabled={busy} title="Rename"><Pencil className="h-4 w-4" /></Button>
            <Button size="sm" variant="ghost" onClick={onToggleActive} disabled={busy}>{node.active ? 'Disable' : 'Enable'}</Button>
            <Button size="icon" variant="ghost" onClick={onDelete} disabled={busy} title="Delete"><Trash2 className="h-4 w-4 text-red-600" /></Button>
          </div>
        </>
      )}
    </div>
  );
}

// ===========================================================================
// Add cards (category / sub-category / type) — fork-on-add for consistency.
// ===========================================================================
function AddCards({
  categoryNodes, subNodesFor, typeNodesFor, ensureForked, orgId, sb, counts,
  onCategoryAdded, onSubAdded, onTypeAdded, onError,
}: {
  categoryNodes: Node[];
  subNodesFor: (c: string) => Node[];
  typeNodesFor: (c: string, s: string) => Node[];
  ensureForked: () => Promise<boolean>;
  orgId: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  sb: any;
  counts: { cats: number; subsFor: (c: string) => number; typesLen: number };
  onCategoryAdded: (row: CategoryRow) => void;
  onSubAdded: (row: SubcategoryRow) => void;
  onTypeAdded: (row: TypeRow) => void;
  onError: (m: string | null) => void;
}) {
  const [catName, setCatName] = useState('');
  const [subCat, setSubCat] = useState('');
  const [subName, setSubName] = useState('');
  const [typeCat, setTypeCat] = useState('');
  const [typeSub, setTypeSub] = useState('');
  const [typeName, setTypeName] = useState('');
  const [typeSev, setTypeSev] = useState<SeverityLevel | ''>('');
  const [b1, setB1] = useState(false);
  const [b2, setB2] = useState(false);
  const [b3, setB3] = useState(false);

  const catNames = categoryNodes.map((c) => c.name);
  const dupe = (list: string[], v: string) => list.some((x) => eq(x, v));

  async function addCategory() {
    onError(null);
    const name = catName.trim();
    if (!name) return;
    if (dupe(catNames, name)) { onError('That category already exists.'); return; }
    setB1(true);
    if (!(await ensureForked())) { setB1(false); return; }
    const { data, error } = await sb.from('org_incident_categories').insert({ org_id: orgId, name, sort_order: counts.cats }).select().single();
    setB1(false);
    if (error) { onError(error.message); return; }
    onCategoryAdded(data as CategoryRow); setCatName('');
  }

  async function addSub() {
    onError(null);
    const name = subName.trim();
    if (!subCat) { onError('Pick a category.'); return; }
    if (!name) return;
    if (dupe(subNodesFor(subCat).map((n) => n.name), name)) { onError('That sub-category already exists here.'); return; }
    setB2(true);
    if (!(await ensureForked())) { setB2(false); return; }
    const { data, error } = await sb.from('org_incident_subcategories').insert({ org_id: orgId, category: subCat, name, sort_order: counts.subsFor(subCat) }).select().single();
    setB2(false);
    if (error) { onError(error.message); return; }
    onSubAdded(data as SubcategoryRow); setSubName('');
  }

  async function addType() {
    onError(null);
    const name = typeName.trim();
    if (!typeCat) { onError('Pick a category.'); return; }
    if (!typeSub) { onError('Pick a sub-category.'); return; }
    if (!name) return;
    if (dupe(typeNodesFor(typeCat, typeSub).map((n) => n.name), name)) { onError('That type already exists here.'); return; }
    setB3(true);
    if (!(await ensureForked())) { setB3(false); return; }
    const { data, error } = await sb.from('org_occurrence_types').insert({
      org_id: orgId, category: typeCat, subcategory: typeSub, name, default_severity: typeSev || null, sort_order: counts.typesLen,
    }).select().single();
    setB3(false);
    if (error) { onError(error.message); return; }
    onTypeAdded(data as TypeRow); setTypeName(''); setTypeSev('');
  }

  const subOptionsForType = typeCat ? subNodesFor(typeCat).map((n) => n.name) : [];

  return (
    <div className="grid gap-4 md:grid-cols-3">
      <Card>
        <CardHeader><CardTitle className="text-base">Add category</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          <Input value={catName} onChange={(e) => setCatName(e.target.value)} placeholder="e.g. Compliance Occurrences" />
          <Button onClick={addCategory} disabled={b1 || !catName.trim()} className="w-full">
            {b1 ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />} Add
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Add sub-category</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          <Select value={subCat} onChange={(e) => setSubCat(e.target.value)}>
            <option value="">Category…</option>
            {catNames.map((c) => <option key={c} value={c}>{c}</option>)}
          </Select>
          <Input value={subName} onChange={(e) => setSubName(e.target.value)} placeholder="Sub-category name" disabled={!subCat} />
          <Button onClick={addSub} disabled={b2 || !subName.trim() || !subCat} className="w-full">
            {b2 ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />} Add
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Add type</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          <Select value={typeCat} onChange={(e) => { setTypeCat(e.target.value); setTypeSub(''); }}>
            <option value="">Category…</option>
            {catNames.map((c) => <option key={c} value={c}>{c}</option>)}
          </Select>
          <Select value={typeSub} onChange={(e) => setTypeSub(e.target.value)} disabled={!typeCat}>
            <option value="">{typeCat ? 'Sub-category…' : 'Pick a category first'}</option>
            {subOptionsForType.map((s) => <option key={s} value={s}>{s}</option>)}
          </Select>
          <Input value={typeName} onChange={(e) => setTypeName(e.target.value)} placeholder="Type name" disabled={!typeSub} />
          <Select value={typeSev} onChange={(e) => setTypeSev(e.target.value as SeverityLevel | '')}>
            <option value="">Default severity — none</option>
            {SEVERITIES.map((s) => <option key={s} value={s}>{SEVERITY_LABELS[s]}</option>)}
          </Select>
          <Button onClick={addType} disabled={b3 || !typeName.trim() || !typeSub} className="w-full">
            {b3 ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />} Add
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

// ===========================================================================
// helpers
// ===========================================================================
function eq(a: string | null | undefined, b: string | null | undefined) {
  return (a ?? '').toLowerCase() === (b ?? '').toLowerCase();
}
function byOrder(a: { sort_order: number; name: string }, b: { sort_order: number; name: string }) {
  return a.sort_order - b.sort_order || a.name.localeCompare(b.name);
}
