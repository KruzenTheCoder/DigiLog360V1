'use client';

import { useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import { Loader2, Check, AlertCircle, Upload, Trash2 } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { NetstreamLogo } from '@/components/brand/netstream-logo';

interface Org {
  id: string;
  name: string;
  slug: string;
  show_netstream_logo: boolean;
  netstream_logo_url: string | null;
  is_active: boolean;
}

export function BrandingToggleForm({ orgs }: { orgs: Org[] }) {
  const router = useRouter();
  const [state, setState] = useState<Record<string, boolean>>(
    Object.fromEntries(orgs.map((o) => [o.id, o.show_netstream_logo])),
  );
  const [logoUrls, setLogoUrls] = useState<Record<string, string | null>>(
    Object.fromEntries(orgs.map((o) => [o.id, o.netstream_logo_url])),
  );
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [uploadingId, setUploadingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();
  const fileInputs = useRef<Record<string, HTMLInputElement | null>>({});

  async function toggle(id: string, next: boolean) {
    setPendingId(id);
    setError(null);
    const supabase = createClient();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error: e } = await (supabase as any)
      .from('organizations')
      .update({ show_netstream_logo: next })
      .eq('id', id);
    if (e) {
      setError(`${id.slice(0, 8)}…: ${e.message}`);
      setState((s) => ({ ...s, [id]: !next }));
    } else {
      startTransition(() => router.refresh());
    }
    setPendingId(null);
  }

  async function uploadLogo(orgId: string, file: File) {
    if (!file.type.startsWith('image/')) {
      setError('Only image files are allowed.');
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setError('Logo files must be 5 MB or smaller.');
      return;
    }
    setUploadingId(orgId);
    setError(null);
    const supabase = createClient();
    const ext = file.name.split('.').pop() ?? 'png';
    // Use the org id + a timestamp so re-uploads bust any CDN cache.
    const path = `netstream/${orgId}-${Date.now()}.${ext}`;

    const { error: upErr } = await supabase.storage
      .from('branding')
      .upload(path, file, { upsert: true, contentType: file.type });
    if (upErr) { setError(`Upload failed: ${upErr.message}`); setUploadingId(null); return; }

    const { data: pub } = supabase.storage.from('branding').getPublicUrl(path);
    const url = pub.publicUrl;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error: dbErr } = await (supabase as any)
      .from('organizations')
      .update({ netstream_logo_url: url })
      .eq('id', orgId);
    if (dbErr) { setError(`Save failed: ${dbErr.message}`); setUploadingId(null); return; }

    setLogoUrls((m) => ({ ...m, [orgId]: url }));
    startTransition(() => router.refresh());
    setUploadingId(null);
  }

  async function removeLogo(orgId: string) {
    setUploadingId(orgId);
    setError(null);
    const supabase = createClient();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error: dbErr } = await (supabase as any)
      .from('organizations')
      .update({ netstream_logo_url: null })
      .eq('id', orgId);
    if (dbErr) { setError(`Remove failed: ${dbErr.message}`); setUploadingId(null); return; }
    setLogoUrls((m) => ({ ...m, [orgId]: null }));
    startTransition(() => router.refresh());
    setUploadingId(null);
  }

  return (
    <div className="space-y-5">
      {/* Preview card */}
      <Card>
        <CardHeader><CardTitle>Live preview (default SVG)</CardTitle></CardHeader>
        <CardContent>
          <div className="flex items-center justify-center rounded-lg border bg-slate-50 p-6 dark:bg-slate-900">
            <NetstreamLogo height={44} />
          </div>
          <p className="mt-3 text-xs text-[hsl(var(--muted))]">
            This is the default Netstream logo shown in the top navigation bar.
            Each org can upload its own override below, or hide the logo entirely with the toggle.
            PNG, JPG or SVG up to 5&nbsp;MB.
          </p>
        </CardContent>
      </Card>

      {error && (
        <div className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" /> {error}
        </div>
      )}

      <Card>
        <CardHeader><CardTitle>Per-organisation overrides</CardTitle></CardHeader>
        <CardContent className="divide-y">
          {orgs.length === 0 && (
            <p className="py-4 text-sm text-[hsl(var(--muted))]">No organisations yet.</p>
          )}
          {orgs.map((o) => {
            const on = state[o.id] ?? true;
            const url = logoUrls[o.id];
            const busy = pendingId === o.id;
            const uploading = uploadingId === o.id;
            return (
              <div key={o.id} className="flex flex-wrap items-center gap-4 py-4 first:pt-0 last:pb-0">
                <div className="min-w-[180px] flex-1">
                  <p className="truncate font-semibold">{o.name}</p>
                  <p className="text-xs text-[hsl(var(--muted))]">
                    /{o.slug}
                    {!o.is_active && <> · <Badge color="#dc2626">Inactive</Badge></>}
                  </p>
                </div>

                {/* Current logo preview — uploaded image or default SVG */}
                <div className="flex h-14 w-32 items-center justify-center overflow-hidden rounded-lg border bg-slate-50 p-1 dark:bg-slate-900">
                  {url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <Image src={url} alt={`${o.name} logo`} width={120} height={48} className="h-full w-auto object-contain" unoptimized />
                  ) : (
                    <NetstreamLogo height={32} />
                  )}
                </div>

                {/* Upload + remove */}
                <div className="flex items-center gap-2">
                  <input
                    ref={(el) => { fileInputs.current[o.id] = el; }}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) uploadLogo(o.id, f);
                      e.target.value = '';
                    }}
                  />
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => fileInputs.current[o.id]?.click()}
                    disabled={uploading}
                  >
                    {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                    {url ? 'Replace' : 'Upload'}
                  </Button>
                  {url && (
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => removeLogo(o.id)}
                      disabled={uploading}
                      aria-label="Remove uploaded logo"
                    >
                      <Trash2 className="h-4 w-4 text-red-500" />
                    </Button>
                  )}
                </div>

                {/* Show / hide toggle */}
                <ToggleSwitch
                  on={on}
                  disabled={busy}
                  onChange={(v) => {
                    setState((s) => ({ ...s, [o.id]: v }));
                    toggle(o.id, v);
                  }}
                  label={on ? 'Logo visible' : 'Logo hidden'}
                  busy={busy}
                />
              </div>
            );
          })}
        </CardContent>
      </Card>
    </div>
  );
}

function ToggleSwitch({
  on, disabled, onChange, label, busy,
}: {
  on: boolean;
  disabled?: boolean;
  onChange: (next: boolean) => void;
  label: string;
  busy?: boolean;
}) {
  return (
    <div className="flex items-center gap-3">
      <span className="text-xs text-[hsl(var(--muted))]">{label}</span>
      <button
        type="button"
        disabled={disabled}
        onClick={() => onChange(!on)}
        className={`relative inline-flex h-6 w-11 items-center rounded-full transition disabled:opacity-50 ${
          on ? 'bg-emerald-500' : 'bg-slate-300 dark:bg-slate-700'
        }`}
        aria-pressed={on}
        aria-label={label}
      >
        <span
          className={`inline-flex h-5 w-5 transform items-center justify-center rounded-full bg-white shadow-sm transition ${
            on ? 'translate-x-5' : 'translate-x-1'
          }`}
        >
          {busy
            ? <Loader2 className="h-3 w-3 animate-spin text-slate-500" />
            : on
              ? <Check className="h-3 w-3 text-emerald-500" />
              : null}
        </span>
      </button>
    </div>
  );
}
