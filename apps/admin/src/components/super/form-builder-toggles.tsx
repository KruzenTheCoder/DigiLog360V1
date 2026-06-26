'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import {
  AlertCircle, Building2, Check, Loader2, Plus, Trash2, Pencil, Save, X,
} from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { Card, CardContent } from '@/components/ui/card';
import { Input, Label, Select, Textarea } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  LOG_FORM_SECTIONS, LOG_FORM_SECTION_LABELS, isSectionEnabled,
  CUSTOM_FIELD_TYPES, toFieldKey,
  type LogFormConfig, type LogFormSection,
  type CustomSection, type CustomField, type CustomFieldType,
} from '@digilog/shared';

interface OrgRow {
  id: string;
  name: string;
  slug: string;
  log_form_config: LogFormConfig | null;
  is_active: boolean;
}

export function FormBuilderToggles({ orgs }: { orgs: OrgRow[] }) {
  return (
    <div className="space-y-5">
      <Card>
        <CardContent className="py-4 text-sm text-[hsl(var(--muted))]">
          Toggle a built-in section off to hide it on the Log New Occurrence page,
          or add your own custom sections with text / select / checkbox fields.
          Hidden sections are <strong>exempt from validation</strong>, so users can still submit
          even when an entire section is off.
        </CardContent>
      </Card>

      {orgs.map((o) => (
        <OrgBlock key={o.id} org={o} />
      ))}
    </div>
  );
}

function OrgBlock({ org }: { org: OrgRow }) {
  const router = useRouter();
  const [config, setConfig] = useState<LogFormConfig>(org.log_form_config ?? {});
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  async function persist(next: LogFormConfig, busyKey: string) {
    setBusy(busyKey);
    setError(null);
    setConfig(next);
    const supabase = createClient();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error: e } = await (supabase as any)
      .from('organizations')
      .update({ log_form_config: next })
      .eq('id', org.id);
    if (e) {
      setError(e.message);
      setConfig(config); // revert
    } else {
      startTransition(() => router.refresh());
    }
    setBusy(null);
  }

  function toggleBuiltIn(section: LogFormSection, enabled: boolean) {
    persist({
      ...config,
      sections: { ...(config.sections ?? {}), [section]: { enabled } },
    }, `builtin:${section}`);
  }

  function addCustomSection() {
    const id = `custom_${Date.now().toString(36)}`;
    const next: LogFormConfig = {
      ...config,
      customSections: [
        ...(config.customSections ?? []),
        { id, title: 'New section', icon: 'ClipboardList', tone: 'sky', enabled: true, fields: [] },
      ],
    };
    persist(next, `add:section`);
  }

  function updateCustomSection(id: string, patch: Partial<CustomSection>) {
    const next: LogFormConfig = {
      ...config,
      customSections: (config.customSections ?? []).map((s) => s.id === id ? { ...s, ...patch } : s),
    };
    persist(next, `update:${id}`);
  }

  function deleteCustomSection(id: string) {
    if (!confirm('Delete this custom section? All field definitions inside it will be removed.')) return;
    const next: LogFormConfig = {
      ...config,
      customSections: (config.customSections ?? []).filter((s) => s.id !== id),
    };
    persist(next, `delete:${id}`);
  }

  function setCustomFields(sectionId: string, fields: CustomField[]) {
    updateCustomSection(sectionId, { fields });
  }

  return (
    <Card>
      <CardContent className="space-y-6 py-5">
        <div className="flex items-center gap-2">
          <Building2 className="h-4 w-4 text-brand" />
          <h2 className="font-semibold">{org.name}</h2>
          <Badge color="#667eea">/{org.slug}</Badge>
          {!org.is_active && <Badge color="#dc2626">Inactive</Badge>}
        </div>

        {error && (
          <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" /> {error}
          </div>
        )}

        {/* ───────── Built-in section toggles ───────── */}
        <div>
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-[hsl(var(--muted))]">
            Built-in sections
          </h3>
          <ul className="divide-y rounded-xl border">
            {LOG_FORM_SECTIONS.map((key) => {
              const meta = LOG_FORM_SECTION_LABELS[key];
              const on = isSectionEnabled(config, key);
              const isBusy = busy === `builtin:${key}`;
              return (
                <li key={key} className="flex items-center justify-between gap-4 px-4 py-3">
                  <div className="min-w-0 flex-1">
                    <p className="font-medium">{meta.label}</p>
                    <p className="text-xs text-[hsl(var(--muted))]">{meta.hint}</p>
                  </div>
                  <ToggleSwitch
                    on={on}
                    busy={isBusy}
                    onChange={(v) => toggleBuiltIn(key, v)}
                    ariaLabel={`${on ? 'Hide' : 'Show'} ${meta.label}`}
                  />
                </li>
              );
            })}
          </ul>
        </div>

        {/* ───────── Custom sections ───────── */}
        <div>
          <div className="mb-2 flex items-center justify-between gap-2">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-[hsl(var(--muted))]">
              Custom sections
            </h3>
            <Button size="sm" variant="secondary" onClick={addCustomSection} disabled={busy === 'add:section'}>
              {busy === 'add:section' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
              Add section
            </Button>
          </div>

          {(!config.customSections || config.customSections.length === 0) && (
            <p className="rounded-xl border border-dashed px-4 py-6 text-center text-sm text-[hsl(var(--muted))]">
              No custom sections yet — click <strong>Add section</strong> to build your own.
            </p>
          )}

          <div className="space-y-3">
            {(config.customSections ?? []).map((section) => (
              <CustomSectionEditor
                key={section.id}
                section={section}
                busy={busy === `update:${section.id}` || busy === `delete:${section.id}`}
                onChange={(patch) => updateCustomSection(section.id, patch)}
                onDelete={() => deleteCustomSection(section.id)}
                onFieldsChange={(fields) => setCustomFields(section.id, fields)}
              />
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// ===========================================================================
// One custom section — header editor + field list editor.
// ===========================================================================
function CustomSectionEditor({
  section, busy, onChange, onDelete, onFieldsChange,
}: {
  section: CustomSection;
  busy: boolean;
  onChange: (patch: Partial<CustomSection>) => void;
  onDelete: () => void;
  onFieldsChange: (fields: CustomField[]) => void;
}) {
  const [expanded, setExpanded] = useState(true);
  const on = section.enabled !== false;

  return (
    <div className="overflow-hidden rounded-xl border">
      <header className="flex items-center gap-2 bg-slate-50 px-3 py-2 dark:bg-slate-900/40">
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="text-xs text-[hsl(var(--muted))] hover:text-[hsl(var(--foreground))]"
          aria-label={expanded ? 'Collapse section' : 'Expand section'}
        >
          {expanded ? '▾' : '▸'}
        </button>
        <Input
          value={section.title}
          onChange={(e) => onChange({ title: e.target.value })}
          className="h-8 flex-1 font-semibold"
          placeholder="Section title"
        />
        <Select
          value={section.tone ?? 'sky'}
          onChange={(e) => onChange({ tone: e.target.value as CustomSection['tone'] })}
          className="h-8 w-auto"
        >
          {['brand', 'green', 'amber', 'red', 'sky', 'violet', 'slate'].map((t) => (
            <option key={t} value={t}>{t}</option>
          ))}
        </Select>
        <ToggleSwitch
          on={on}
          busy={busy}
          onChange={(v) => onChange({ enabled: v })}
          ariaLabel={on ? 'Hide custom section' : 'Show custom section'}
        />
        <Button size="sm" variant="ghost" onClick={onDelete} aria-label="Delete section">
          <Trash2 className="h-4 w-4 text-red-500" />
        </Button>
      </header>

      {expanded && (
        <div className="space-y-3 p-3">
          <div className="grid gap-2 sm:grid-cols-[1fr_220px]">
            <div>
              <Label className="text-xs">Subtitle (optional)</Label>
              <Input
                value={section.subtitle ?? ''}
                onChange={(e) => onChange({ subtitle: e.target.value })}
                placeholder="Short helper text shown under the title"
              />
            </div>
            <div>
              <Label className="text-xs">Icon (lucide name)</Label>
              <Input
                value={section.icon ?? ''}
                onChange={(e) => onChange({ icon: e.target.value })}
                placeholder="e.g. Car, ClipboardList, ShieldCheck"
              />
            </div>
          </div>

          <FieldList fields={section.fields} onChange={onFieldsChange} />
        </div>
      )}
    </div>
  );
}

// ===========================================================================
// List of fields inside one custom section.
// ===========================================================================
function FieldList({
  fields, onChange,
}: { fields: CustomField[]; onChange: (next: CustomField[]) => void }) {
  function addField() {
    const i = fields.length + 1;
    onChange([
      ...fields,
      { key: toFieldKey(`field_${i}`), label: `Field ${i}`, type: 'text', required: false },
    ]);
  }
  function updateField(idx: number, patch: Partial<CustomField>) {
    onChange(fields.map((f, i) => i === idx ? { ...f, ...patch } : f));
  }
  function deleteField(idx: number) {
    onChange(fields.filter((_, i) => i !== idx));
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <h4 className="text-xs font-semibold uppercase tracking-wider text-[hsl(var(--muted))]">
          Fields ({fields.length})
        </h4>
        <Button size="sm" variant="secondary" onClick={addField}>
          <Plus className="h-4 w-4" /> Add field
        </Button>
      </div>
      {fields.length === 0 && (
        <p className="rounded-lg border border-dashed px-3 py-3 text-center text-xs text-[hsl(var(--muted))]">
          No fields yet.
        </p>
      )}
      {fields.map((f, i) => (
        <FieldEditor
          key={i}
          field={f}
          onChange={(patch) => updateField(i, patch)}
          onDelete={() => deleteField(i)}
        />
      ))}
    </div>
  );
}

function FieldEditor({
  field, onChange, onDelete,
}: {
  field: CustomField;
  onChange: (patch: Partial<CustomField>) => void;
  onDelete: () => void;
}) {
  // Keep the key in sync with the label as the user types — but only until
  // they manually edit it (we don't track that, so we'll just regenerate on
  // label changes if the key is the auto-slug of the previous label).
  function onLabelChange(label: string) {
    const auto = toFieldKey(field.label);
    const patch: Partial<CustomField> = { label };
    if (field.key === auto) patch.key = toFieldKey(label);
    onChange(patch);
  }

  return (
    <div className="rounded-lg border bg-[hsl(var(--surface))] p-3">
      <div className="grid gap-2 sm:grid-cols-[1fr_140px_auto]">
        <div>
          <Label className="text-xs">Label</Label>
          <Input value={field.label} onChange={(e) => onLabelChange(e.target.value)} />
        </div>
        <div>
          <Label className="text-xs">Type</Label>
          <Select value={field.type} onChange={(e) => onChange({ type: e.target.value as CustomFieldType })}>
            {CUSTOM_FIELD_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
          </Select>
        </div>
        <div className="flex items-end gap-2">
          <label className="flex h-10 cursor-pointer items-center gap-2 text-xs">
            <input
              type="checkbox"
              checked={!!field.required}
              onChange={(e) => onChange({ required: e.target.checked })}
              className="h-4 w-4"
            />
            Required
          </label>
          <Button size="sm" variant="ghost" onClick={onDelete} aria-label="Delete field">
            <Trash2 className="h-4 w-4 text-red-500" />
          </Button>
        </div>
      </div>

      <div className="mt-2 grid gap-2 sm:grid-cols-2">
        <div>
          <Label className="text-xs">Key (stored as column in custom_fields)</Label>
          <Input value={field.key} onChange={(e) => onChange({ key: toFieldKey(e.target.value) })} className="font-mono text-xs" />
        </div>
        <div>
          <Label className="text-xs">Placeholder / hint</Label>
          <Input value={field.placeholder ?? ''} onChange={(e) => onChange({ placeholder: e.target.value })} />
        </div>
      </div>

      {field.type === 'select' && (
        <div className="mt-2">
          <Label className="text-xs">Options (one per line)</Label>
          <Textarea
            className="min-h-[70px]"
            value={(field.options ?? []).join('\n')}
            onChange={(e) => onChange({
              options: e.target.value.split('\n').map((s) => s.trim()).filter(Boolean),
            })}
            placeholder={'Good\nDamaged\nNeeds inspection'}
          />
        </div>
      )}
    </div>
  );
}

// ===========================================================================
// Toggle
// ===========================================================================
function ToggleSwitch({
  on, busy, onChange, ariaLabel,
}: {
  on: boolean;
  busy: boolean;
  onChange: (next: boolean) => void;
  ariaLabel: string;
}) {
  return (
    <button
      type="button"
      onClick={() => onChange(!on)}
      disabled={busy}
      aria-pressed={on}
      aria-label={ariaLabel}
      className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition disabled:opacity-50 ${
        on ? 'bg-emerald-500' : 'bg-slate-300 dark:bg-slate-700'
      }`}
    >
      <span
        className={`inline-flex h-5 w-5 transform items-center justify-center rounded-full bg-white shadow-sm transition ${
          on ? 'translate-x-5' : 'translate-x-1'
        }`}
      >
        {busy ? <Loader2 className="h-3 w-3 animate-spin text-slate-500" />
          : on ? <Check className="h-3 w-3 text-emerald-500" /> : null}
      </span>
    </button>
  );
}

// Silence unused-var warnings on icons surfaced for future use.
void Pencil; void Save; void X;
