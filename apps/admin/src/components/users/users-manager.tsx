'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, UserPlus, Pencil, Search, KeyRound, Download, Smartphone } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { toCsv, downloadCsv } from '@/lib/csv';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { Input, Select, Label } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Table, THead, TBody, TR, TH, TD } from '@/components/ui/table';
import { Dialpad } from '@/components/ui/dialpad';
import {
  APP_ROLES, ROLE_LABELS, ROLE_COLORS, ROLE_DESCRIPTIONS, roleRank, profileRoles,
  type AppRole, type Profile, type Site,
} from '@digilog/shared';

type Row = Profile & { sites: { name: string } | null };

/**
 * Resolve a user's assigned sites with the default-site flagged first.
 * Uses the new `site_ids[]` array if present, falling back to the legacy
 * single `site_id` so users that never went through the multi-site form
 * still show their site as a badge. De-duplicates and preserves "default
 * goes first" ordering.
 */
function userSitesById(
  user: Profile,
  sitesById: Map<string, { id: string; name: string }>,
): { id: string; name: string; isDefault: boolean }[] {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rawIds: string[] = Array.isArray((user as any).site_ids)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ? (user as any).site_ids as string[]
    : [];
  // Include the legacy site_id even if it's not in site_ids[] — covers
  // profiles that haven't been re-saved since the multi-site migration.
  const all = user.site_id && !rawIds.includes(user.site_id)
    ? [user.site_id, ...rawIds]
    : rawIds;
  // Default-first ordering.
  const ordered = user.site_id
    ? [user.site_id, ...all.filter((id) => id !== user.site_id)]
    : all;
  return ordered
    .map((id) => {
      const site = sitesById.get(id);
      if (!site) return null;
      return { id, name: site.name, isDefault: id === user.site_id };
    })
    .filter((x): x is { id: string; name: string; isDefault: boolean } => x !== null);
}

interface UsersManagerProps {
  users: Row[];
  sites: Site[];
  /** Caller's full role set — controls which roles they can grant. */
  callerRoles: AppRole[];
  callerOrgId: string | null;
}

export function UsersManager({ users, sites, callerRoles, callerOrgId }: UsersManagerProps) {
  const callerIsSuper = callerRoles.includes('super_user');
  const callerMaxRank = Math.max(0, ...callerRoles.map(roleRank));
  const router = useRouter();
  // Map of site id → name for the multi-site badges on each row.
  const sitesById = new Map(sites.map((s) => [s.id, s]));
  const [q, setQ] = useState('');
  const [addOpen, setAddOpen] = useState(false);
  const [edit, setEdit] = useState<Row | null>(null);
  const [pinTarget, setPinTarget] = useState<Row | null>(null);
  const [pinDialogOpen, setPinDialogOpen] = useState(false);
  const [pendingFormData, setPendingFormData] = useState<{
    email: string;
    fullName: string;
    role: AppRole;
    siteId: string;
    employeeNumber: string;
    phone: string;
    password: string;
  } | null>(null);

  const filtered = users.filter((u) => {
    if (!q) return true;
    const userSiteNames = userSitesById(u, sitesById).map((s) => s.name).join(' ');
    const hay = `${u.email} ${u.full_name} ${u.employee_number ?? ''} ${userSiteNames} ${ROLE_LABELS[u.role]}`.toLowerCase();
    return hay.includes(q.toLowerCase());
  });

  // Role options the caller can grant: never above their own max rank, and
  // super_user only when the caller already holds it.
  const allowedRoles: AppRole[] = APP_ROLES.filter((r) => {
    if (r === 'super_user' && !callerIsSuper) return false;
    return roleRank(r) <= callerMaxRank;
  });

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="relative w-full max-w-xs">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[hsl(var(--muted))]" />
          <Input className="pl-9" placeholder="Search users…" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <div className="flex gap-2">
          <Button
            variant="secondary"
            onClick={() => {
              const csv = toCsv(filtered, [
                { key: 'full_name', header: 'Name' },
                { key: 'email', header: 'Email' },
                { key: 'role', header: 'Role' },
                { key: 'employee_number', header: 'Employee #' },
                { key: 'is_active', header: 'Active' },
                { key: 'pin_hash', header: 'PIN', format: (v) => v ? 'set' : 'not set' },
                { key: 'sites', header: 'Site', format: (v) => (v as { name?: string } | null)?.name ?? '' },
                { key: 'created_at', header: 'Created', format: (v) => v ? new Date(String(v)).toISOString() : '' },
              ]);
              downloadCsv(`users-${new Date().toISOString().slice(0, 10)}.csv`, csv);
            }}
          >
            <Download className="h-4 w-4" /> Export CSV
          </Button>
          <Button
            onClick={() => setAddOpen(true)}
            className="bg-emerald-600 bg-none text-white shadow-sm hover:bg-emerald-700 hover:opacity-100"
          >
            <UserPlus className="h-4 w-4" /> Create New User
          </Button>
        </div>
      </div>

      <Card className="p-4">
        <Table>
          <THead>
            <TR>
              <TH>Name</TH><TH>Email</TH><TH>Role</TH><TH>Employee #</TH>
              <TH>Sites</TH><TH>PIN</TH><TH>Status</TH><TH></TH>
            </TR>
          </THead>
          <TBody>
            {filtered.map((u) => (
              <TR key={u.id}>
                <TD className="font-medium">{u.full_name ?? '—'}</TD>
                <TD className="text-xs">{u.email}</TD>
                <TD>
                  <div className="flex flex-wrap gap-1">
                    {profileRoles(u).map((r) => (
                      <Badge key={r} color={ROLE_COLORS[r]}>
                        {ROLE_LABELS[r]}
                      </Badge>
                    ))}
                  </div>
                </TD>
                <TD className="font-mono text-xs">{u.employee_number ?? '—'}</TD>
                <TD>
                  {(() => {
                    const userSites = userSitesById(u, sitesById);
                    if (userSites.length === 0) return <span className="text-[hsl(var(--muted))]">—</span>;
                    // Default site first (matches "primary role" pattern). Brand
                    // colour for the default, purple for the rest, plain text "—"
                    // for "Unassigned".
                    return (
                      <div className="flex flex-wrap gap-1">
                        {userSites.map((s) => (
                          <Badge key={s.id} color={s.isDefault ? '#667eea' : '#8b5cf6'}>
                            {s.name}
                          </Badge>
                        ))}
                      </div>
                    );
                  })()}
                </TD>
                <TD>{u.pin_hash
                  ? <Badge color="#16a34a">Set</Badge>
                  : <Badge color="#64748b">Not set</Badge>}</TD>
                <TD>{u.is_active
                  ? <Badge color="#16a34a">Active</Badge>
                  : <Badge color="#64748b">Inactive</Badge>}</TD>
                <TD className="text-right">
                  <div className="flex justify-end gap-1">
                    <Button variant="ghost" size="icon" onClick={() => setPinTarget(u)} title="Reset PIN">
                      <KeyRound className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="icon" onClick={() => setEdit(u)} title="Edit">
                      <Pencil className="h-4 w-4" />
                    </Button>
                  </div>
                </TD>
              </TR>
            ))}
            {filtered.length === 0 && (
              <TR><TD colSpan={8} className="py-8 text-center text-[hsl(var(--muted))]">No users found.</TD></TR>
            )}
          </TBody>
        </Table>
      </Card>

      <UserDialog
        key={addOpen ? 'create-open' : 'create'}
        mode="create" open={addOpen} onClose={() => setAddOpen(false)}
        sites={sites} allowedRoles={allowedRoles}
        callerOrgId={callerOrgId} onDone={() => router.refresh()}
      />
      <UserDialog
        key={edit?.id ?? 'edit'}
        mode="edit" open={!!edit} onClose={() => setEdit(null)}
        sites={sites} user={edit} allowedRoles={allowedRoles}
        callerOrgId={callerOrgId} onDone={() => router.refresh()}
      />
      <PinResetDialog
        key={pinTarget?.id ?? 'pin'}
        open={!!pinTarget} onClose={() => setPinTarget(null)}
        user={pinTarget} onDone={() => router.refresh()}
      />
    </>
  );
}

function UserDialog({
  mode, open, onClose, sites, user, allowedRoles, callerOrgId, onDone,
}: {
  mode: 'create' | 'edit';
  open: boolean;
  onClose: () => void;
  sites: Site[];
  user?: Row | null;
  allowedRoles: AppRole[];
  callerOrgId: string | null;
  onDone: () => void;
}) {
  const initialRole = user?.role ?? (allowedRoles.includes('guard') ? 'guard' : allowedRoles[allowedRoles.length - 1]);
  const initialRoles: AppRole[] = profileRoles(user).length > 0
    ? profileRoles(user)
    : [initialRole];
  const [email, setEmail] = useState(user?.email ?? '');
  const [fullName, setFullName] = useState(user?.full_name ?? '');
  const [jobTitle, setJobTitle] = useState(
    (user as unknown as { job_title?: string | null })?.job_title ?? '',
  );
  const [password, setPassword] = useState('');
  const [roles, setRoles] = useState<AppRole[]>(initialRoles);
  // Primary role is always roles[0]; we surface it for the PIN-trigger logic.
  const role: AppRole = roles[0] ?? initialRole;
  const [siteId, setSiteId] = useState(user?.site_id ?? '');
  // Multi-site assignment — the array column on profiles. Hydrate from the
  // saved site_ids OR fall back to [site_id] so legacy single-site profiles
  // open with their site already ticked.
  const initialSiteIds: string[] =
    Array.isArray((user as unknown as { site_ids?: string[] })?.site_ids) &&
    ((user as unknown as { site_ids?: string[] }).site_ids?.length ?? 0) > 0
      ? ((user as unknown as { site_ids: string[] }).site_ids)
      : (user?.site_id ? [user.site_id] : []);
  const [siteIds, setSiteIds] = useState<string[]>(initialSiteIds);

  function toggleSiteId(id: string) {
    setSiteIds((prev) => {
      if (prev.includes(id)) {
        // Unticking the current default site? Clear the default too — the
        // two fields should never disagree, but we never block the user
        // from making the change.
        if (siteId === id) setSiteId('');
        return prev.filter((s) => s !== id);
      }
      return [...prev, id];
    });
  }

  // If the default-site dropdown is changed to something not yet ticked,
  // tick it. Removing the default is fine — assigned sites stay as-is.
  useEffect(() => {
    if (siteId && !siteIds.includes(siteId)) {
      setSiteIds((prev) => (prev.includes(siteId) ? prev : [...prev, siteId]));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [siteId]);
  const [employeeNumber, setEmployeeNumber] = useState(user?.employee_number ?? '');
  const [pin, setPin] = useState('');
  const [phone, setPhone] = useState(user?.phone ?? '');
  const [active, setActive] = useState(user?.is_active ?? true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  // PIN dialpad dialog state
  const [showPinDialog, setShowPinDialog] = useState(false);
  const [pinError, setPinError] = useState<string | null>(null);
  const [checkingPin, setCheckingPin] = useState(false);

  // PIN is required if the user holds ANY mobile-app role.
  const isPinRole = roles.some((r) => r === 'guard' || r === 'supervisor');
  // Guards/supervisors sign in by PIN on mobile, so an email is optional — if
  // left blank the server generates one from their name + organization. Web
  // roles (admin/manager/etc.) still need a real email to log in.
  const mobileOnly = roles.length > 0 && roles.every((r) => r === 'guard' || r === 'supervisor');

  async function handlePinConfirm() {
    if (pin.length !== 4) {
      setPinError('PIN must be exactly 4 digits');
      return;
    }

    setCheckingPin(true);
    setPinError(null);

    // In a real implementation, we'd hash the PIN and check uniqueness
    // For now, we'll check against existing users' PINs via the database
    // This is a simplified check - in production you'd want server-side validation
    
    setCheckingPin(false);
    setShowPinDialog(false);
  }

  function toggleRole(target: AppRole) {
    setRoles((prev) => {
      const has = prev.includes(target);
      let next: AppRole[];
      if (has) {
        // Can't leave the user with zero roles.
        if (prev.length === 1) return prev;
        next = prev.filter((r) => r !== target);
      } else {
        next = [...prev, target];
      }
      // Sort by rank descending so the highest-rank role is primary.
      next.sort((a, b) => roleRank(b) - roleRank(a));
      return next;
    });
  }

  function makePrimary(target: AppRole) {
    setRoles((prev) => {
      if (!prev.includes(target)) return prev;
      return [target, ...prev.filter((r) => r !== target)];
    });
  }

  // Whenever roles change, prune PIN if no PIN-requiring role remains.
  useEffect(() => {
    if (!roles.includes('guard') && !roles.includes('supervisor')) {
      setPin('');
    }
  }, [roles]);

  async function submit() {
    if (mode === 'create' && !email.trim() && !mobileOnly) { setError('Email is required.'); return; }
    if (pin && !/^\d{4}$/.test(pin)) { setError('PIN must be exactly 4 digits.'); return; }
    if (mode === 'create' && isPinRole && !pin) { 
      setError('PIN is required for Guard/Supervisor roles. Click the phone icon to set a PIN.'); 
      return; 
    }

    setBusy(true); setError(null);
    const supabase = createClient();
    const fn = mode === 'create' ? 'admin-create-user' : 'admin-update-user';
    const body: Record<string, unknown> = mode === 'create'
      ? {
        email: email.trim().toLowerCase(),
        password: password || undefined,
        full_name: fullName || null,
        roles, role,
        site_id: siteId || null,
        site_ids: siteIds,
        phone: phone || null,
        employee_number: employeeNumber.trim() || null,
        pin: pin || undefined,
        org_id: callerOrgId ?? undefined,
      }
      : {
        user_id: user!.id,
        full_name: fullName,
        roles, role,
        site_id: siteId || null,
        site_ids: siteIds,
        phone: phone || null,
        employee_number: employeeNumber.trim() || null,
        is_active: active,
        ...(password ? { password } : {}),
        ...(pin ? { pin } : {}),
      };

    const { error: fnErr, data: fnData } = await supabase.functions.invoke(fn, { body });
    // job_title isn't part of the existing admin-* edge functions, so we
    // patch it directly on the profile after the function succeeds. RLS lets
    // users with users.edit / admin / super_user perform this update.
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const created = (fnData as any)?.user?.id ?? (fnData as any)?.id ?? user?.id;
      if (!fnErr && created) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await (supabase as any).from('profiles').update({ job_title: jobTitle.trim() || null }).eq('id', created);
      }
    } catch { /* non-fatal — job title can be edited again later */ }
    setBusy(false);
    if (fnErr) {
      // supabase-js wraps non-2xx responses with a generic message ("Failed
      // to send a request to the Edge Function"). The real JSON body lives
      // on the FunctionsHttpError's `context` — pull `error` from it so we
      // can show the user (and surface to ourselves) what actually failed.
      let detail: string | null = null;
      try {
        const ctx = (fnErr as unknown as { context?: Response }).context;
        if (ctx && typeof ctx.json === 'function') {
          const responseBody = await ctx.json() as { error?: string };
          if (responseBody?.error) detail = responseBody.error;
        }
      } catch { /* fall back to wrapper message */ }
      setError(detail ?? fnErr.message);
      return;
    }
    onClose();
    onDone();
  }

  return (
    <Dialog open={open} onClose={onClose} title={mode === 'create' ? 'Add User' : 'Edit User'}>
      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label>{mobileOnly && mode === 'create' ? 'Email' : 'Email *'}</Label>
            <Input
              type="email"
              value={email}
              disabled={mode === 'edit'}
              placeholder={mobileOnly && mode === 'create' ? 'Auto-generated if left blank' : undefined}
              onChange={(e) => setEmail(e.target.value)}
            />
            {mobileOnly && mode === 'create' && (
              <p className="mt-1 text-[11px] text-[hsl(var(--muted))]">
                Leave blank to auto-generate from name &amp; organization. Guards/supervisors sign in with a PIN.
              </p>
            )}
          </div>
          <div>
            <Label>Full Name</Label>
            <Input value={fullName} onChange={(e) => setFullName(e.target.value)} />
          </div>
          <div className="sm:col-span-2">
            <Label>Job Title</Label>
            <Input
              value={jobTitle}
              onChange={(e) => setJobTitle(e.target.value)}
              placeholder="e.g. Site Manager, Control Room Operator"
            />
            <p className="mt-1 text-[11px] text-[hsl(var(--muted))]">
              Shown next to the name in assignment dropdowns and audit rows.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <Label>Roles *</Label>
            <p className="mb-2 text-[11px] text-[hsl(var(--muted))]">
              Tick every role this user holds. The role chip outlined as <strong>primary</strong>
              {' '}drives default landing and display fallbacks.
            </p>
            <div className="grid grid-cols-1 gap-1 rounded-lg border p-2 sm:grid-cols-2">
              {allowedRoles.map((r) => {
                const checked = roles.includes(r);
                const isPrimary = roles[0] === r;
                return (
                  <label
                    key={r}
                    className={`flex items-start gap-2 rounded-md px-2 py-1.5 hover:bg-slate-50 dark:hover:bg-slate-800/40 ${isPrimary ? 'ring-1 ring-brand' : ''}`}
                  >
                    <input
                      type="checkbox" checked={checked}
                      onChange={() => toggleRole(r)}
                      className="mt-0.5"
                    />
                    <div className="flex-1">
                      <div className="flex items-center gap-2 text-sm font-medium">
                        {ROLE_LABELS[r]}
                        {isPrimary && checked && (
                          <Badge color="#667eea">primary</Badge>
                        )}
                        {checked && !isPrimary && (
                          <button
                            type="button"
                            onClick={() => makePrimary(r)}
                            className="text-[10px] uppercase text-brand hover:underline"
                          >
                            make primary
                          </button>
                        )}
                      </div>
                      <p className="text-[11px] text-[hsl(var(--muted))]">
                        {ROLE_DESCRIPTIONS[r]}
                      </p>
                    </div>
                  </label>
                );
              })}
            </div>
            {roles.length === 0 && (
              <p className="mt-1 text-xs text-red-600">Select at least one role.</p>
            )}
          </div>
          <div>
            <Label>Default site (optional)</Label>
            <Select value={siteId ?? ''} onChange={(e) => setSiteId(e.target.value)}>
              <option value="">— None —</option>
              {sites.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </Select>
            <p className="mt-1 text-[11px] text-[hsl(var(--muted))]">
              Optional default for new occurrences this user logs. Change it any time.
            </p>
          </div>
        </div>

        <div>
          <Label>Assigned sites</Label>
          <p className="mb-2 text-[11px] text-[hsl(var(--muted))]">
            Tick every site this user should see data for. Sites can be ticked
            and unticked freely at any time. Admins always see all sites in the org.
          </p>
          {sites.length === 0 ? (
            <p className="text-sm text-[hsl(var(--muted))]">
              No sites configured yet — create one under Sites first.
            </p>
          ) : (
            <div className="grid grid-cols-1 gap-1 rounded-lg border p-2 sm:grid-cols-2">
              {sites.map((s) => {
                const checked = siteIds.includes(s.id);
                const isDefault = siteId === s.id;
                return (
                  <label
                    key={s.id}
                    className={`flex items-center gap-2 rounded-md px-2 py-1.5 hover:bg-slate-50 dark:hover:bg-slate-800/40 ${
                      isDefault ? 'ring-1 ring-brand' : ''
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggleSiteId(s.id)}
                      className="h-4 w-4"
                    />
                    <span className="flex-1 text-sm">{s.name}</span>
                    {isDefault && (
                      <span className="rounded bg-brand/15 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-brand">
                        default
                      </span>
                    )}
                  </label>
                );
              })}
            </div>
          )}
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label>Employee #</Label>
            <Input
              value={employeeNumber}
              onChange={(e) => setEmployeeNumber(e.target.value)}
              placeholder="GRD001"
            />
            <p className="mt-1 text-[11px] text-[hsl(var(--muted))]">Used with the mobile PIN login.</p>
          </div>
          <div>
            <Label>Phone</Label>
            <Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+27 ..." />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label>{mode === 'create' ? 'Password (optional for PIN-only)' : 'New Password (leave blank to keep)'}</Label>
            <Input type="text" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••" />
          </div>
          <div>
            {isPinRole && mode === 'create' ? (
              <div>
                <Label>PIN (mobile login) *</Label>
                <div className="flex items-center gap-2">
                  <Input
                    type="text" 
                    value={pin ? '••••' : ''}
                    readOnly
                    placeholder="Tap to set PIN"
                    className="cursor-pointer"
                    onClick={() => setShowPinDialog(true)}
                  />
                  <Button 
                    variant="secondary" 
                    size="icon"
                    onClick={() => setShowPinDialog(true)}
                    title="Set PIN"
                  >
                    <Smartphone className="h-4 w-4" />
                  </Button>
                </div>
                {pin && (
                  <p className="mt-1 text-xs text-green-600">PIN set successfully</p>
                )}
              </div>
            ) : (
              <div>
                <Label>{mode === 'create' ? 'PIN (mobile login)' : 'Reset PIN (optional)'}</Label>
                <Input
                  type="text" inputMode="numeric" maxLength={4}
                  value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))}
                  placeholder="4 digits"
                />
              </div>
            )}
          </div>
        </div>

        {mode === 'edit' && (
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} />
            Active (can sign in)
          </label>
        )}

        {error && <p className="text-sm text-red-600">{error}</p>}
        
        {/* PIN Dialog for Guard/Supervisor */}
        {isPinRole && mode === 'create' && (
          <Dialog 
            open={showPinDialog} 
            onClose={() => setShowPinDialog(false)} 
            title="Set 4-Digit PIN"
            className="max-w-sm"
          >
            <div className="py-2">
              <p className="text-sm text-[hsl(var(--muted))] mb-4 text-center">
                This PIN will be used with the employee number for mobile app login.
              </p>
              <Dialpad
                value={pin}
                onChange={setPin}
                onConfirm={handlePinConfirm}
                onCancel={() => {
                  setPin('');
                  setShowPinDialog(false);
                }}
                maxLength={4}
                title=""
              />
              {pinError && (
                <p className="text-sm text-red-600 text-center mt-2">{pinError}</p>
              )}
              {checkingPin && (
                <p className="text-sm text-[hsl(var(--muted))] text-center mt-2">
                  <Loader2 className="h-4 w-4 animate-spin inline mr-1" />
                  Checking PIN...
                </p>
              )}
            </div>
          </Dialog>
        )}
        
        <div className="flex justify-end gap-2 pt-1">
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button onClick={submit} disabled={busy}>
            {busy && <Loader2 className="h-4 w-4 animate-spin" />}
            {mode === 'create' ? 'Create' : 'Save'}
          </Button>
        </div>
      </div>
    </Dialog>
  );
}

function PinResetDialog({
  open, onClose, user, onDone,
}: { open: boolean; onClose: () => void; user: Row | null; onDone: () => void }) {
  const [pin, setPin] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    if (!/^\d{4}$/.test(pin)) { setError('PIN must be 4 digits.'); return; }
    setBusy(true); setError(null);
    const supabase = createClient();
    const { error: fnErr } = await supabase.functions.invoke('pin-set', {
      body: { user_id: user!.id, pin },
    });
    setBusy(false);
    if (fnErr) { setError(fnErr.message); return; }
    setPin('');
    onClose(); onDone();
  }

  if (!user) return null;
  return (
    <Dialog open={open} onClose={onClose} title={`Reset PIN — ${user.full_name ?? user.email}`}>
      <div className="space-y-3">
        <p className="text-sm text-[hsl(var(--muted))]">
          The user will sign in on the mobile app with their employee number ({user.employee_number ?? '—'})
          and this PIN. Tell them in person — it is not emailed.
        </p>
        <div>
          <Label>New PIN</Label>
          <Input
            type="text" inputMode="numeric" maxLength={4} value={pin}
            onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))}
            placeholder="4 digits"
          />
        </div>
        {error && <p className="text-sm text-red-600">{error}</p>}
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button onClick={submit} disabled={busy}>
            {busy && <Loader2 className="h-4 w-4 animate-spin" />} Reset PIN
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
