'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { AlertCircle, Building2, Check, Loader2 } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  LOG_FORM_SECTIONS, LOG_FORM_SECTION_LABELS, isSectionEnabled,
  type LogFormConfig, type LogFormSection,
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
          Toggle a section off to hide it on the Log New Occurrence page.
          Hidden sections are also <strong>exempt from validation</strong> — users can submit
          without filling them. The change is per-organisation and takes effect on the next render.
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
  const [busy, setBusy] = useState<LogFormSection | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  async function toggle(section: LogFormSection, enabled: boolean) {
    setBusy(section);
    setError(null);
    const next: LogFormConfig = {
      ...config,
      sections: {
        ...(config.sections ?? {}),
        [section]: { enabled },
      },
    };
    setConfig(next);

    const supabase = createClient();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error: e } = await (supabase as any)
      .from('organizations')
      .update({ log_form_config: next })
      .eq('id', org.id);
    if (e) {
      setError(e.message);
      // Revert optimistic.
      setConfig(config);
    } else {
      startTransition(() => router.refresh());
    }
    setBusy(null);
  }

  return (
    <Card>
      <CardContent className="space-y-4 py-5">
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

        <ul className="divide-y">
          {LOG_FORM_SECTIONS.map((key) => {
            const meta = LOG_FORM_SECTION_LABELS[key];
            const on = isSectionEnabled(config, key);
            const isBusy = busy === key;
            return (
              <li key={key} className="flex items-center justify-between gap-4 py-3">
                <div className="min-w-0 flex-1">
                  <p className="font-medium">{meta.label}</p>
                  <p className="text-xs text-[hsl(var(--muted))]">{meta.hint}</p>
                </div>
                <ToggleSwitch
                  on={on}
                  busy={isBusy}
                  onChange={(v) => toggle(key, v)}
                  ariaLabel={`${on ? 'Hide' : 'Show'} ${meta.label}`}
                />
              </li>
            );
          })}
        </ul>
      </CardContent>
    </Card>
  );
}

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
