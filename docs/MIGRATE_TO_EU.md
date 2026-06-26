# Migrating DigiLog 360 to an EU region (faster for SA users)

**Why:** your users are in South Africa. The current Supabase project + Vercel
deployment are in **US‑East (~235ms from SA)**. Moving both to **EU‑West
(London/Frankfurt, ~175ms from SA)** makes every request ~25% faster, app‑wide,
with no code changes. (Supabase has no African region; EU is the closest option.)

This is a **production data migration** — follow the steps in order. The source
(US) project is only ever **read** from, so it stays a safe rollback the whole
time. You only cut over at the very end.

---

## What you do vs. what I do

| Step | Who | Notes |
|------|-----|-------|
| 1. Create EU Supabase project | **You** | Dashboard operation |
| 2. Send me both DB connection strings | **You** | From each project's dashboard |
| 3. Dump US data → restore into EU | **Me** (or you, commands below) | Source is read‑only |
| 4. Deploy edge functions to EU project | **Me** | `supabase functions deploy` |
| 5. Repoint env vars (Vercel + mobile + functions) | **Me** | List below |
| 6. Flip `vercel.json` region to `fra1` | **Me** | Already prepared |
| 7. Verify + cut over | **Both** | Smoke test, then go live |

---

## Step 1 — Create the EU project (You)

1. Supabase dashboard → **New project**.
2. **Region: West EU (London)** `eu-west-2` *(or Central EU (Frankfurt) `eu-central-1` — both ~175ms from SA)*.
3. Same plan as the current project.
4. Set a strong DB password and **save it** — you'll need it for the connection string.

## Step 2 — Send me the two connection strings (You)

For **each** project: Dashboard → **Project Settings → Database → Connection string → URI**
(use the **Session pooler** or **Direct connection** — the `postgresql://...` one).

```
SOURCE (US, current):  postgresql://postgres.kwxmzyfpnrqqmltochjb:[PASSWORD]@aws-0-us-east-1.pooler.supabase.com:5432/postgres
DEST   (EU, new):      postgresql://postgres.[NEW_REF]:[PASSWORD]@aws-0-eu-west-2.pooler.supabase.com:5432/postgres
```

Also send the **new project ref** and its **anon key** + **service_role key**
(Settings → API).

## Step 3 — Dump + restore (commands)

Requires the Postgres client tools (`pg_dump`, `psql`) v15+. Install:
- **Windows:** `winget install PostgreSQL.PostgreSQL.16` (gives you `pg_dump`/`psql`)
- or download from postgresql.org.

Then, from the repo root (source is **only read**):

```bash
# 3a. Roles (RLS-relevant grants) — usually skippable for Supabase→Supabase,
#     but harmless. Skip if it errors on already-existing roles.
supabase db dump --db-url "$SOURCE" -f /tmp/roles.sql --role-only

# 3b. Schema: tables, views, functions, triggers, RLS policies, sequences.
supabase db dump --db-url "$SOURCE" -f /tmp/schema.sql

# 3c. Data only (fast COPY format).
supabase db dump --db-url "$SOURCE" -f /tmp/data.sql --data-only --use-copy

# 3d. Restore into the EU project, schema first then data.
psql "$DEST" -f /tmp/schema.sql
psql "$DEST" -f /tmp/data.sql

# 3e. Re-sync the OB number sequence (raw inserts don't advance it).
psql "$DEST" -c "select setval('public.ob_number_seq', (select coalesce(max(substring(ob_number from 3)::int),0)+1 from public.occurrences where ob_number ~ '^OB[0-9]+$'), false);"
```

> **Storage buckets** (occurrence photos, branding logos) live in Supabase
> Storage, not Postgres. The DB rows point at storage paths. After cutover,
> either: (a) copy the storage objects to the new project with the Supabase
> Storage API, or (b) keep serving images from the old project's storage URL
> until copied. I can script the object copy once both projects exist.

## Step 4 — Edge functions (Me)

```bash
# Point the CLI at the new project, then deploy all functions.
supabase link --project-ref [NEW_REF]
npm run functions:deploy   # or deploy each: pin-login, send-email, sla-monitor, ...
```
Set each function's secrets on the new project (`supabase secrets set ...`):
OpenAI key, email provider key, etc. — same values as today.

## Step 5 — Repoint env vars (Me)

Everything that points at the old project URL/keys:

| Where | Vars |
|-------|------|
| **Vercel** (admin) project → Settings → Environment Variables | `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` |
| **apps/mobile/.env** | `EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_ANON_KEY` (then publish an OTA update) |
| **repo root .env** (scripts) | `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` |

## Step 6 — Flip the Vercel region (Me)

In `apps/admin/vercel.json`, change `"iad1"` → `"fra1"` (Frankfurt, next to EU‑West).
**Only after the DB is in EU** — functions must stay co‑located with the DB.
Then redeploy.

## Step 7 — Verify + cut over

1. On a Vercel **preview** deploy pointed at the EU project, sign in and smoke‑test:
   login, dashboard, occurrences list + detail, log a new occurrence, mobile PIN login.
2. Check row counts match: `select count(*) from occurrences;` on both — should be equal.
3. Promote to production.
4. Keep the US project **paused, not deleted** for ~1 week as rollback.

---

## Rollback

Nothing destructive happens to the US project during this — it's read‑only
throughout. If anything looks wrong after cutover, repoint the env vars back to
the US project URL/keys and redeploy. Instant rollback.

---

**When you've done Steps 1–2, send me the connection strings + new keys and I'll
run Steps 3–6 for you.**
