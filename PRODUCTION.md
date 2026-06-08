# DigiLog 360 — Production Deployment & Operations

This document is the operator's reference. Follow it once to ship, then revisit
on every rotation, every release, and after every incident.

---

## 1. Architecture in one paragraph

DigiLog 360 is a security-operations platform. Backend is **Supabase**
(Postgres + Auth + Storage + Edge Functions + Realtime). Two clients consume
it: a **Next.js** admin console (`apps/admin`) and an **Expo / React Native**
field app (`apps/mobile`). All authorisation is enforced in the database via
RLS — the apps cannot bypass it because they only ever speak with the public
anon key. Service-role privileges live exclusively in edge functions and the
seed script.

The schema is **multi-tenant**: every domain row is keyed by `org_id`. A
**super_user** sees every tenant; an **admin** sees only their own; every
other role (`manager`, `control_room`, `supervisor`, `guard`) is org- and
often site-scoped.

---

## 2. First-time deploy

### 2.1 Provision Supabase

1. Create a project at https://supabase.com. Copy the project ref.
2. In **Settings → API**, copy
   - `URL`
   - `anon public` key
   - `service_role` key (**server-side ONLY**)

### 2.2 Run the schema

Either:

```powershell
npx supabase link --project-ref <ref>
npm run db:push
```

…or paste `supabase/_deploy_all.sql` into the SQL editor (it bundles every
migration in order).

After the schema lands, regenerate the typed client:

```powershell
npm run db:types
```

This rewrites `packages/shared/src/database.types.ts` so the apps lose the
interim `(supabase as any)` casts.

### 2.3 Deploy edge functions

```powershell
npx supabase functions deploy `
  pin-login pin-set `
  admin-create-org admin-create-user admin-update-user `
  sla-monitor health-check
```

### 2.4 Seed the demo tenant + super user

```powershell
npm install
node --env-file=.env scripts/seed-accounts.mjs
```

The script prints the credentials it created. **Rotate every one** before
going live (see §4).

### 2.5 Configure local app env

Copy each `.env.example` to the live filename:

```powershell
Copy-Item apps/admin/.env.example apps/admin/.env.local
Copy-Item apps/mobile/.env.example apps/mobile/.env
```

Fill in the Supabase URL + anon key in both files.

### 2.6 Run

```powershell
npm run admin      # Next.js console on http://localhost:3000
npm run mobile     # Expo dev server
```

---

## 3. Deploying the admin console to production

Vercel is the path of least resistance.

1. Connect the GitHub repo, set the **root directory** to `apps/admin`.
2. **Build command**: `npm run build` (uses workspaces).
3. **Environment variables**:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
4. Set the custom domain and force HTTPS. The HSTS header in
   `apps/admin/next.config.mjs` will only stick on HTTPS.
5. Verify the deployed origin appears in **Supabase → Auth → URL configuration**
   under both *Site URL* and *Redirect URLs* so magic-link / password-reset
   flows redirect home.

### Mobile app

Use Expo EAS:

```powershell
npx eas build --platform ios
npx eas build --platform android
```

Set the same `EXPO_PUBLIC_*` variables in EAS Secrets. Submit through TestFlight
/ Internal App Sharing first; verify PIN login, push, and an end-to-end
occurrence with photo before promoting to production.

---

## 4. Secret rotation

Treat every secret as a hand-grenade with a 90-day pin.

| Secret | Stored in | Rotate every |
|---|---|---|
| Supabase `service_role` key | repo `.env`, EAS / Vercel secrets | 90 days, or immediately after any suspected leak |
| Supabase `anon` key | client apps | 180 days (or on RLS audit findings) |
| Demo / seeded user passwords + PINs | DB | Before go-live; never again — change individual passwords in-app |
| Org admin passwords | DB | Quarterly |
| Guard / supervisor PINs | DB | Whenever an employee leaves |

When you rotate the service-role key:

1. Generate the new key in Supabase **Settings → API → Reset**.
2. Update repo `.env`, Vercel env vars, EAS secrets.
3. Redeploy all edge functions (`npx supabase functions deploy`).
4. The old key is invalidated immediately by Supabase.

---

## 5. Monitoring & alerting

- **`/functions/v1/health-check`** — public probe. Hook into your uptime
  monitor (Better Stack, UptimeRobot, Datadog). Returns 200 with a tiny JSON
  payload when DB is reachable, 503 when it isn't.
- **Audit log** — `/settings/audit` in the admin console. Sweep weekly for
  unexpected role changes, lockouts, and org plan changes.
- **PIN attempts** — query `public.pin_attempts` for failure spikes:
  ```sql
  select org_slug, employee_number, count(*) as fails
    from public.pin_attempts
   where success = false and created_at > now() - interval '24 hours'
   group by 1, 2 having count(*) > 3 order by fails desc;
  ```
- **SLA monitor** — schedule the `sla-monitor` edge function with `pg_cron`
  every 5 minutes:
  ```sql
  select cron.schedule('sla-monitor', '*/5 * * * *',
    $$ select net.http_post(
        url := 'https://<ref>.functions.supabase.co/sla-monitor',
        headers := jsonb_build_object('Authorization', 'Bearer <service-role>')
       ) $$);
  ```

---

## 6. Backups & disaster recovery

- Supabase takes daily backups on the paid plan; verify retention matches
  your compliance posture (default 7 days; bump to 30 for production).
- Storage objects (`occurrence-images`, `org-branding`) are NOT included
  in DB backups. Configure a separate S3 lifecycle copy if you need
  point-in-time photo recovery.
- Quarterly: spin up a fresh Supabase project from a backup snapshot and
  verify the admin console + mobile app come up green.

---

## 7. Security baseline

Already enforced in the code:

- **RLS on every table.** No table accepts `select *` without policy checks.
- **Storage isolation by org path prefix.** `occurrence-images/<org_slug>/…`
  is the convention; a policy validates the prefix against the caller's org.
- **PIN brute-force lockout.** 5 failures in 15 minutes → 15-minute lock.
- **Audit log** on user CRUD, role changes, org changes, PIN events,
  manager acknowledgements.
- **CSP + HSTS + X-Frame-Options: DENY** on the admin console.
- **Service role bypass is impossible from a browser** — those keys never
  leave the server.

Operational hygiene you still must do:

- Enable Supabase's database SSL enforcement.
- Enable Supabase Auth MFA in **Auth → Providers** for super_user / admin
  accounts.
- Rotate the service-role key on a calendar reminder.
- Review the audit log weekly.

---

## 8. Common operations

### Suspend an organisation

```sql
update public.organizations set is_active = false where slug = '<slug>';
```

(Or use the super-user UI at `/super/organizations`.) Existing sessions remain
valid until they expire; revoke them with:

```sql
delete from auth.sessions
 where user_id in (select id from public.profiles where org_id = '<org-id>');
```

### Restore a soft-deleted occurrence

```sql
update public.occurrences set deleted_at = null where id = <id>;
```

### Force-unlock a PIN'd-out user

```sql
update public.profiles set locked_until = null where id = '<uuid>';
```

### Wipe local mobile cache for an employee

Field guard signs out from **Settings**, deletes the app, reinstalls. The
offline queue lives in `AsyncStorage`; reinstall removes it.

---

## 9. Pre-release checklist

Run this list before every prod release:

- [ ] All migrations applied; `npm run db:types` re-run.
- [ ] Edge functions deployed.
- [ ] Demo credentials rotated.
- [ ] HSTS header verified on production URL (`curl -I https://...`).
- [ ] CSP not breaking any pages (open browser console; look for violations).
- [ ] `/functions/v1/health-check` returns 200.
- [ ] PIN brute-force tested (6 wrong PINs in a row → 423 response).
- [ ] Mobile offline → online flush tested (toggle airplane mode).
- [ ] Realtime working (open occurrence in two browser tabs).
- [ ] Audit log shows every action you just performed.
- [ ] Supabase Auth Site URL + Redirect URLs match production domain.

Sign off the release ticket with who deployed, when, and which commit SHA.
