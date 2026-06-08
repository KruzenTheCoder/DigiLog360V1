'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, Bell, Mail, Smartphone } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

interface Prefs {
  email_notifications?: boolean;
  push_notifications?: boolean;
  notify_on_assignment?: boolean;
  notify_on_sla_breach?: boolean;
}

export function NotificationPrefsForm({ initial }: { initial: Prefs }) {
  const router = useRouter();
  const [prefs, setPrefs] = useState<Prefs>(initial);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);

  function setKey<K extends keyof Prefs>(key: K, value: Prefs[K]) {
    setSaved(false);
    setPrefs((prev) => ({ ...prev, [key]: value }));
  }

  async function save() {
    setBusy(true);
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setBusy(false); return; }
    await supabase.from('profiles').update(prefs).eq('id', user.id);
    setBusy(false); setSaved(true);
    router.refresh();
  }

  function Toggle({ label, hint, icon: Icon, value, onChange }: {
    label: string; hint?: string; icon: typeof Bell;
    value: boolean | undefined; onChange: (v: boolean) => void;
  }) {
    return (
      <label className="flex items-start gap-3 rounded-lg border p-3 cursor-pointer">
        <Icon className="mt-0.5 h-5 w-5 text-brand" />
        <div className="flex-1">
          <p className="text-sm font-medium">{label}</p>
          {hint && <p className="text-xs text-[hsl(var(--muted))]">{hint}</p>}
        </div>
        <input
          type="checkbox"
          checked={Boolean(value ?? true)}
          onChange={(e) => onChange(e.target.checked)}
          className="mt-1 h-4 w-4"
        />
      </label>
    );
  }

  return (
    <Card>
      <CardContent className="space-y-3 py-5">
        <Toggle
          icon={Smartphone}
          label="Push notifications"
          hint="Mobile app push for SLA alerts and assignments."
          value={prefs.push_notifications}
          onChange={(v) => setKey('push_notifications', v)}
        />
        <Toggle
          icon={Mail}
          label="Email notifications"
          hint="SLA breach summaries and digest emails."
          value={prefs.email_notifications}
          onChange={(v) => setKey('email_notifications', v)}
        />
        <Toggle
          icon={Bell}
          label="Notify when assigned to me"
          value={prefs.notify_on_assignment}
          onChange={(v) => setKey('notify_on_assignment', v)}
        />
        <Toggle
          icon={Bell}
          label="Notify on SLA breaches at my site"
          value={prefs.notify_on_sla_breach}
          onChange={(v) => setKey('notify_on_sla_breach', v)}
        />
        <div className="flex items-center justify-between pt-2">
          {saved && <span className="text-sm text-green-600">Saved.</span>}
          <Button onClick={save} disabled={busy} className="ml-auto">
            {busy && <Loader2 className="h-4 w-4 animate-spin" />} Save
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
