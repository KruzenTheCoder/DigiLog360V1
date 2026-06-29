<div align="center">

# DigiLog 360

### Multi-Tenant Security Operations Platform

**Proprietary & Confidential — © 2026 Kruz Naidoo. All Rights Reserved.**

</div>

> This document is the authoritative engineering reference for **DigiLog 360**:
> the problem it solves, its technology stack, system architecture, data model,
> business logic, access-control model, role-based capability matrix, and
> operational runbook.
>
> The software is the proprietary intellectual property of **Kruz Naidoo**. See
> [`LICENSE`](LICENSE). Unauthorized use, reproduction, modification, or
> distribution is prohibited. Third-party open-source components used by this
> platform remain subject to their respective licenses.

---

## Quick Start

Operators shipping to production should read [`PRODUCTION.md`](PRODUCTION.md)
for the runbook (deployment, secret rotation, monitoring, backups, pre-release
checklist). The rest of this README is the engineering reference.

```powershell
# 1. Apply migrations + regenerate types
npx supabase db push
npm run db:types

# 2. Deploy edge functions
npx supabase functions deploy `
  pin-login pin-set `
  admin-create-org admin-create-user admin-update-user `
  admin-delete-org admin-delete-user `
  admin-api-token admin-role-capability `
  send-email webhook-deliver `
  patrol-watcher sla-monitor `
  transcribe-audio health-check

# 3. Seed a demo tenant + super user
npm install
node --env-file=.env scripts/seed-accounts.mjs

# 4. Run the apps
npm run admin     # Next.js admin console
npm run mobile    # Expo dev server (Guard / Supervisor)
```

---

## Table of Contents

1. [What DigiLog 360 Is](#1-what-digilog-360-is)
2. [Roles & Capabilities](#2-roles--capabilities)
3. [Technology Stack](#3-technology-stack)
4. [System Architecture](#4-system-architecture)
5. [Monorepo Layout](#5-monorepo-layout)
6. [Database Schema](#6-database-schema)
7. [Multi-Tenancy & Tenant Isolation](#7-multi-tenancy--tenant-isolation)
8. [Access Control — RLS + Capability Matrix](#8-access-control--rls--capability-matrix)
9. [SLA Engine](#9-sla-engine)
10. [Edge Functions](#10-edge-functions)
11. [Realtime & Storage](#11-realtime--storage)
12. [Admin Console — Surfaces & Workflows](#12-admin-console--surfaces--workflows)
13. [Mobile App — Surfaces & Workflows](#13-mobile-app--surfaces--workflows)
14. [Authentication Flows (Web Password / Mobile PIN)](#14-authentication-flows-web-password--mobile-pin)
15. [Checkpoint Scanning (QR / NFC / GPS)](#15-checkpoint-scanning-qr--nfc--gps)
16. [Offline Resilience](#16-offline-resilience)
17. [Notifications & Push Deep-Links](#17-notifications--push-deep-links)
18. [Security Posture](#18-security-posture)
19. [Production Hardening Summary](#19-production-hardening-summary)
20. [Deployment & Operations](#20-deployment--operations)
21. [Demo Accounts](#21-demo-accounts)
22. [License](#22-license)

---

## 1. What DigiLog 360 Is

DigiLog 360 is a **multi-tenant security operations platform** for SA-style
security companies that need to run a control room, a manager review pipeline,
mobile-app-equipped field guards, gate-house operations, patrols with checkpoint
verification, and supervisor oversight — across multiple sites and multiple
client organisations from a single deployment.

The platform is split into three first-party surfaces:

| Surface | Built with | Primary users |
|---|---|---|
| **Admin console** | Next.js 15 (App Router) | super_user · admin · manager · control_room · supervisor |
| **Mobile app** | Expo / React Native | guard · supervisor (PIN-only sign-in) |
| **Backend** | Supabase (Postgres + Auth + Storage + Realtime + Edge Functions) | All clients |

What it replaces / improves on the legacy ASP.NET MVC `OccurenceBook` app:

- True multi-tenant architecture (one Supabase project hosts many client orgs)
- Super user role that delegates tenancy and permissions
- Six-role hierarchy with multi-role support and a configurable capability matrix
- Real checkpoint scanning (QR + NFC + GPS) rather than a start/end timer
- Mobile PIN login with employee-number identity + brute-force lockout
- Realtime SLA board, live guard map, push + email notifications
- Offline queue on mobile so guards can log without signal
- Webhooks + API tokens for client integrations
- Comprehensive audit trail
- Per-org SLA matrix, custom occurrence types, branding
- Voice notes (Whisper transcription) and OCR (Tesseract.js) for evidence capture

---

## 2. Roles & Capabilities

The `app_role` enum is the security floor; the capability matrix sits on top
and is fully editable by `super_user` per organisation.

### Six built-in roles (ranked)

| Rank | Role | Scope | Primary surface |
|------|---|---|---|
| 100 | **super_user** | Cross-org god mode | Admin web |
| 80 | **admin** | One organisation | Admin web |
| 60 | **manager** | One organisation | Admin web |
| 50 | **control_room** | One site or org | Admin web |
| 40 | **supervisor** | One site | Admin web + mobile |
| 20 | **guard** | One site | Mobile only |

### Multi-role assignment

A user can hold **any subset** of these roles. `profiles.roles app_role[]`
stores the full set; `profiles.role` is kept in sync as the "primary" (used
for default landing and display fallbacks). A trigger guarantees both stay
consistent regardless of which column the caller writes to.

Examples of valid combinations:

- `{control_room, manager}` — operator who also reviews incidents
- `{admin, supervisor}` — manager covering shifts as supervisor
- `{guard, supervisor}` — field officer who runs other guards

### Capability matrix (super-user editable)

Several dozen built-in capability keys (the registry grows as features land —
e.g. `patrols.scan`, `occurrences.log_management_report`, `audit.view`, the
mobile tab/duty keys) cover every feature the platform exposes. The
super user opens **Super User → Permissions**, picks an organisation, and
toggles a `role × capability` grid. The change takes effect immediately.

Capability areas:

| Area | Keys (excerpt) |
|---|---|
| Dashboard | `dashboard.view`, `dashboard.cross_org` |
| Occurrences | `occurrences.view_all`, `occurrences.log`, `occurrences.update_status`, `occurrences.assign`, `occurrences.delete`, `occurrences.bulk_actions`, `occurrences.comment`, `occurrences.export_csv` |
| Reports | `reports.view`, `reports.create`, `reports.export_pdf` |
| Manager | `manager.acknowledge`, `manager.escalate`, `manager.reviewed_logs` |
| Patrols | `patrols.view`, `patrols.run`, `patrols.end_remote`, `patrols.schedule_manage`, `checkpoints.manage` |
| Field ops | `team.view`, `visitors.manage`, `keys.manage`, `shifts.view_all`, `shifts.clock`, `guards.map_view` |
| Users | `users.view`, `users.create`, `users.edit`, `users.deactivate`, `users.reset_pin` |
| Sites | `sites.manage` |
| Settings | `org.edit_branding`, `org.edit_sla`, `org.edit_types`, `webhooks.manage`, `api_tokens.manage`, `audit.view` |
| Personal | `notifications.view_own`, `preferences.manage`, `security.manage_2fa` |
| Super user | `super.orgs_manage`, `super.users_cross_org`, `super.platform_health`, `super.permissions_manage` |

Super user can also **add custom capability keys** for documentation or
future feature gating. Removing a built-in capability is blocked.

### My Access page

Every user can open `/my-access` to audit their effective access: roles held,
deduped capability list with `via {role}` provenance per capability, and the
nav surfaces they can actually open.

---

## 3. Technology Stack

### Backend (Supabase)

- **Postgres 15** with `pgcrypto`, `uuid-ossp`, `pg_trgm` extensions
- **Supabase Auth** — JWT sessions, MFA (TOTP) for web, magic-link minting for mobile PIN flow
- **Supabase Storage** — private buckets for occurrence images and voice notes, public bucket for org branding
- **Supabase Realtime** — Postgres replication → WebSocket pushes to web + mobile
- **Supabase Edge Functions** — Deno runtime (TypeScript)
- **pg_cron** — schedules SLA monitor and patrol watcher

### Admin web (`apps/admin`)

- **Next.js 15** App Router with **React 19**
- **TypeScript 5.6** strict mode
- **Tailwind CSS 3.4** + custom dark mode
- **@supabase/ssr** — server-side cookie-based auth
- **lucide-react** icons · **recharts** dashboards · **qrcode.react** checkpoint labels
- **react-leaflet** + **leaflet** — live guard map
- **tesseract.js** — client-side OCR for log-occurrence form
- **@sentry/nextjs** — opt-in error monitoring
- **@formatjs**-style minimal i18n (en / af / zu / xh)
- **next/headers** custom CSP / HSTS / X-Frame-Options: DENY

### Mobile (`apps/mobile`)

- **Expo SDK 52** managed workflow
- **React Native 0.76** with the new architecture
- **expo-router 4** — file-based navigation
- **expo-camera** — QR scanner + photo capture
- **expo-location** — GPS scan + live guard position reporting
- **expo-av** — voice note recording
- **react-native-nfc-manager** — NFC tag reads (dev build required)
- **expo-notifications** — push registration + tap deep-linking
- **expo-secure-store** + **AsyncStorage** — session + offline queue
- **react-native-svg** — signature canvas, charts

### Shared package (`packages/shared`)

- Common TypeScript types (generated from DB + manual extensions)
- Zod schemas for cross-app form validation
- SLA helpers, role/capability constants and predicates
- URL filter serialisers for the admin's server-side filtered tables
- i18n dictionaries

### Tooling

- **npm workspaces** (admin + shared; mobile sits outside to avoid React dual-version issues)
- **GitHub Actions CI** — typecheck (shared + admin + mobile) + admin build smoke test on PR

---

## 4. System Architecture

```
                   ┌────────────────────────────────────────────┐
                   │             Supabase (Postgres)            │
                   │                                            │
                   │  domain tables (org_id-scoped)             │
                   │   ┌─ organizations  profiles    sites      │
                   │   ┌─ occurrences   occurrence_updates      │
                   │   ┌─ occurrence_reports occurrence_images  │
                   │   ┌─ occurrence_comments                   │
                   │   ┌─ patrols  patrol_routes  checkpoints   │
                   │   ┌─ checkpoint_scans  patrol_schedules    │
                   │   ┌─ expected_patrols  guard_positions     │
                   │   ┌─ shifts  shift_handovers               │
                   │   ┌─ visitors  keys  key_handovers         │
                   │   ┌─ manager_acknowledgements              │
                   │   ┌─ tasks  task_updates                   │
                   │   ┌─ saved_views  notifications            │
                   │   ┌─ audit_log  pin_attempts               │
                   │   ┌─ org_sla_overrides  org_occurrence_types │
                   │   ┌─ org_webhooks  webhook_deliveries      │
                   │   ┌─ api_tokens                            │
                   │   ┌─ capabilities  role_capabilities       │
                   │                                            │
                   │  RLS on every table — super_user bypass    │
                   │  Triggers for SLA, audit, sync_primary_role│
                   │  Views: occurrences_live, my_capabilities, │
                   │         guard_positions_latest, ...        │
                   └─────▲────────────────▲─────────────▲───────┘
              REST/RPC + Realtime         │   service_role        Postgres logical replication
              (anon key, RLS enforced)    │   (edge fns only)     to supabase_realtime publication
                       │                  │                       │
        ┌──────────────┴───┐  ┌───────────┴──────────────┐  ┌─────┴──────────┐
        │ Admin web        │  │  Edge functions (Deno)   │  │  Mobile app    │
        │ (Next.js 15)     │  │  pin-login pin-set       │  │  (Expo / RN)   │
        │                  │  │  admin-create-org/user   │  │                │
        │  super_user      │  │  admin-update-user       │  │  guard         │
        │                  │  │  admin-delete-org/user   │  │                │
        │  admin           │  │  admin-api-token         │  │  supervisor    │
        │  manager         │  │  admin-role-capability   │  │                │
        │  control_room    │  │  send-email              │  │  PIN-only      │
        │  supervisor      │  │  webhook-deliver         │  │  Offline queue │
        │                  │  │  patrol-watcher          │  │  Push deep     │
        │  Web sessions    │  │  sla-monitor             │  │  -linking      │
        │  via @supabase/  │  │  transcribe-audio        │  │                │
        │  ssr cookies     │  │  health-check            │  │                │
        └──────────────────┘  └──────────────────────────┘  └────────────────┘
                  │                       │                       │
                  └───────────── outbound webhooks + emails ──────┘
                                          │
                                  client integrations:
                                  Slack, monitoring,
                                  ticketing, Resend, OpenAI
```

---

## 5. Monorepo Layout

```
NewDigiLog/
├── apps/
│   ├── admin/                  Next.js 15 admin console
│   │   ├── src/app/(app)/      Authenticated routes (server components)
│   │   │   ├── dashboard/      KPI dashboard with site filter
│   │   │   ├── occurrences/
│   │   │   │   ├── all/        Server-side paginated explorer + saved views
│   │   │   │   ├── new/        Log incident form (with OCR)
│   │   │   │   ├── history/    Closed + completed patrols
│   │   │   │   └── [id]/       Detail: report, comments, assignment, updates
│   │   │   ├── my-queue/       Assigned to me
│   │   │   ├── tasks/          Task board + task detail ([id])
│   │   │   ├── manager/        Acknowledgement queue + reviewed logs + staff reports
│   │   │   ├── patrols/        + schedules subroute
│   │   │   ├── checkpoints/    QR/NFC/GPS checkpoint CRUD
│   │   │   ├── team/           Team status
│   │   │   ├── visitors/       Visitor log
│   │   │   ├── keys/           Key register
│   │   │   ├── shifts/         Shift roll-up
│   │   │   ├── guards-map/     Live leaflet map of on-patrol guards
│   │   │   ├── reports/        Reports list + PDF print route
│   │   │   ├── users/          User CRUD with multi-role checkbox grid
│   │   │   ├── sites/          Sites CRUD
│   │   │   ├── notifications/  In-app inbox
│   │   │   ├── my-access/      Capability audit (any user)
│   │   │   ├── settings/
│   │   │   │   ├── organization/  Branding + contact
│   │   │   │   ├── sla/        Per-org SLA override matrix
│   │   │   │   ├── types/      Custom occurrence types
│   │   │   │   ├── notifications/ Personal notification preferences
│   │   │   │   ├── security/   Self-service TOTP enrollment
│   │   │   │   ├── webhooks/   Outbound webhooks
│   │   │   │   ├── api-tokens/ Personal access tokens
│   │   │   │   └── audit/      Immutable action trail
│   │   │   └── super/
│   │   │       ├── organizations/ Cross-org tenant CRUD (create + delete)
│   │   │       ├── users/      Cross-org user list (org picker + delete)
│   │   │       ├── assignees/  Assignment allow-list
│   │   │       ├── branding/   Per-org parent-company logo toggle
│   │   │       ├── form-builder/ Log-occurrence form section toggles
│   │   │       ├── mobile-layout/ Mobile tab bar + home cards per role
│   │   │       ├── health/     Platform health
│   │   │       └── permissions/ Role × capability matrix editor
│   │   ├── src/components/     UI primitives, page bodies
│   │   ├── src/lib/            auth, supabase clients, csv, utils
│   │   ├── src/middleware.ts   Auth gate for /(app)/*
│   │   ├── next.config.mjs     CSP / HSTS / Permissions-Policy
│   │   ├── sentry.client.config.ts (opt-in via env)
│   │   └── public/img/         Logos copied from legacy wwwroot
│   │
│   └── mobile/                 Expo / React Native app
│       ├── app/
│       │   ├── _layout.tsx     Root stack + push deep-linking
│       │   ├── login.tsx       PIN-only login
│       │   ├── (tabs)/         Home · Patrol · Log · My Logs
│       │   ├── scan.tsx        QR / NFC / GPS scanner
│       │   ├── occurrence/[id].tsx  Detail with status update sheet
│       │   ├── shift.tsx       Clock in / out with live counter
│       │   ├── handovers.tsx   Shift handover inbox + new
│       │   ├── inbox.tsx       Notifications
│       │   ├── settings.tsx    Profile + PIN change + sign out
│       │   ├── gate/
│       │   │   ├── visitors.tsx  Visitor sign-in/out
│       │   │   └── keys.tsx    Key hand-over register
│       │   └── supervisor/
│       │       ├── board.tsx   Live site SLA board with realtime
│       │       └── team.tsx    Who's on shift / patrol
│       ├── src/lib/            auth, supabase, patrol, storage,
│       │                       location-reporter, offline-queue,
│       │                       push, voice-note, theme
│       ├── src/components/     primitives.tsx (Sheet, Toast, …),
│       │                       signature-canvas.tsx, ui.tsx
│       └── assets/branding/    Logos
│
├── packages/
│   └── shared/                 @digilog/shared — types, constants,
│                               schemas, sla, filters, capabilities, i18n
│
├── supabase/
│   ├── migrations/             45 incremental migrations (see §6)
│   ├── functions/              15 edge functions (see §10)
│   ├── _deploy_all.sql         Single-file bundle for SQL editor paste
│   ├── seed.sql                Demo sites + sample patrol route
│   ├── schedule_sla_monitor.sql Sample pg_cron schedule for the SLA monitor
│   └── config.toml
│
├── scripts/                    Node maintenance scripts (run with --env-file=.env)
│   ├── seed-accounts.mjs       Bootstrap super user + org + the full role line-up
│   ├── seed-new.mjs            Import legacy AspNetUsers
│   ├── import-occurrences.mjs  Bulk import historical occurrences (CSV)
│   ├── import-legacy-csv.mjs   Import a legacy CSV export
│   ├── import-legacy-azure.mjs Import directly from a legacy Azure SQL BACPAC
│   ├── backfill-audit.mjs      Reconstruct the audit log from historical records
│   │                           (real timestamps, tagged backfilled, dry-run default)
│   ├── fix-ob-sequence.mjs     Repair the OB-number sequence after a bulk import
│   ├── build-mobile-icon.mjs   Generate the mobile app icon set
│   └── verify-db-state.mjs / check-state.mjs / probe-rls-funcs.mjs  Diagnostics
│
├── .github/workflows/ci.yml    Typecheck + build on PR
├── LICENSE                     Proprietary, governed by SA law
├── PRODUCTION.md               Deploy / rotate / monitor runbook
└── README.md                   This file
```

---

## 6. Database Schema

The schema lives entirely in Postgres. Each migration is forward-only and
idempotent (`create table if not exists`, `drop policy if exists`, etc.) so
the bundled `_deploy_all.sql` can be re-run safely.

### Migration timeline

| # | File | What |
|---|---|---|
| 01 | `20260527000001_extensions_and_enums.sql` | `pgcrypto`, `pg_trgm`, `app_role` enum, severity/status/patrol_status/scan_method enums |
| 02 | `20260527000002_core_schema.sql` | `sites`, `profiles`, `occurrences`, `occurrence_updates`, `occurrence_reports`, `occurrence_images`, `ob_number_seq` |
| 03 | `20260527000003_patrols_checkpoints.sql` | `patrol_routes`, `checkpoints` (QR/NFC/GPS), `route_checkpoints`, `patrols`, `checkpoint_scans` |
| 04 | `20260527000004_functions_and_triggers.sql` | `set_ob_number`, `apply_occurrence_sla`, `compute_patrol_metrics`, `bump_patrol_scan_count`, `handle_new_user`, RLS helpers |
| 05 | `20260527000005_rls_policies.sql` | RLS per table (admin / control_room / supervisor / guard scopes) |
| 06 | `20260527000006_storage_and_realtime.sql` | Private `occurrence-images` bucket, realtime publication |
| 07 | `20260527000007_views_and_helpers.sql` | `haversine_m()`, `occurrences_live`, `patrols_detailed` |
| 08 | `20260603000000_app_role_values.sql` | Adds `super_user` and `manager` enum values (own transaction) |
| 09 | `20260603000001_multi_tenant_and_pin.sql` | `organizations`, `org_id` on every domain table, RLS rewrite for org isolation + super_user bypass, PIN columns on profiles, `manager_acknowledgements` |
| 10 | `20260603000002_org_defaults.sql` | `default current_org_id()` on org_id everywhere — client inserts stay simple |
| 11 | `20260603000003_production_hardening.sql` | `audit_log`, `pin_attempts`, `notifications`, soft-delete columns, composite (org_id,…) indexes, storage RLS rewrite by `<org_slug>/` path prefix |
| 12 | `20260603000004_saved_views.sql` | `saved_views`, trigram indexes for occurrence search |
| 13 | `20260603000005_assignment_and_comments.sql` | `occurrences.assigned_to`, `occurrence_comments` |
| 14 | `20260603000006_org_settings.sql` | `org_sla_overrides`, `org_occurrence_types`, per-user notification prefs |
| 15 | `20260603000007_webhooks_and_tokens.sql` | `org_webhooks`, `webhook_deliveries`, `api_tokens` |
| 16 | `20260603000008_visitors_and_keys.sql` | `visitors`, `keys`, `key_handovers` |
| 17 | `20260603000009_shifts.sql` | `shifts` (one-open-per-user), `shift_handovers` |
| 18 | `20260603000010_patrol_schedules.sql` | `patrol_schedules`, `expected_patrols`, `generate_expected_patrols()` |
| 19 | `20260603000011_guard_locations.sql` | `guard_positions` + `guard_positions_latest` view |
| 20 | `20260603000012_voice_and_ocr.sql` | Private `occurrence-voice-notes` storage bucket |
| 21 | `20260603000013_multi_role_profiles.sql` | `profiles.roles app_role[]`, sync trigger, array-based RLS helpers |
| 22 | `20260603000014_capability_registry.sql` | `capabilities`, `role_capabilities`, `my_capabilities` view, `has_capability(text)` SQL helper |
| 23 | `20260603000015_tasks.sql` | `tasks`, `task_updates` to-do tracker (assignment, realtime publication, audit triggers) |
| 24 | `20260605000001_rename_org_to_pmi.sql` | Renames the seeded demo org to **PMI** (name + slug) |
| 25 | `20260605000002_incident_taxonomy.sql` | Incident category taxonomy seed |
| 26 | `20260605000003_org_types_taxonomy.sql` | Per-org occurrence-type taxonomy |
| 27 | `20260605000004_org_categories_subcategories.sql` | Category → subcategory hierarchy for occurrence types |
| 28 | `20260605000005_auto_generated_reports.sql` | Auto-create an `occurrence_reports` shell on occurrence logging |
| 29 | `20260605000006_bulk_acknowledgement_group.sql` | `bulk_id` on `manager_acknowledgements` for one-click bulk sign-off |
| 30 | `20260605000007_multi_site_assignment.sql` | `profiles.site_ids[]` — assign a user to multiple sites |
| 31 | `20260610000001_add_patrols_scan_capability.sql` | Adds the `patrols.scan` capability key |
| 32 | `20260625000001_management_report_capability.sql` | Adds the `occurrences.log_management_report` capability |
| 33 | `20260626000001_org_show_netstream_logo.sql` | `organizations.show_netstream_logo` + `netstream_logo_url` |
| 34 | `20260626000002_ob_seq_selfheal.sql` | OB-number sequence self-heal guard |
| 35 | `20260626000003_job_title_and_operational_fields.sql` | `profiles.job_title` + operational profile fields |
| 36 | `20260626000004_branding_storage.sql` | `org-branding` public storage bucket + policies |
| 37 | `20260626000005_assignable_flag.sql` | `profiles.is_assignable` — assignment allow-list |
| 38 | `20260626000006_log_form_config.sql` | `organizations.log_form_config` — form-builder section toggles |
| 39 | `20260626000007_mobile_container_capabilities.sql` | Mobile home-container capability keys |
| 40 | `20260626000007_occurrence_custom_fields.sql` | Per-org custom fields on occurrences |
| 41 | `20260626000008_perf_composite_indexes.sql` | Composite indexes matching the apps' hot query paths |
| 42 | `20260626000009_audit_log_capability_rls.sql` | `audit.view` capability + audit_log RLS tightening |
| 43 | `20260626000009_mobile_duty_capability.sql` | Mobile on/off-duty capability |
| 44 | `20260626000010_mobile_tab_capabilities.sql` | Per-role mobile tab-bar capability keys |
| 45 | `20260626000010_occurrence_reports_all_areas_secure.sql` | Occurrence-report RLS hardening across all areas |

> Migrations are forward-only and idempotent; `supabase/_deploy_all.sql` bundles
> them for a single SQL-editor paste.

### Entity relationship (core)

```
organizations 1───────* sites
       │      1───────* profiles ─ * (auth.users)
       │      1───────* occurrences ─ * occurrence_updates
       │                                ─ ? occurrence_reports
       │                                ─ * occurrence_images
       │                                ─ * occurrence_comments
       │                                ─ ? manager_acknowledgements
       │      1───────* patrol_routes ─ * route_checkpoints ─ checkpoints
       │      1───────* patrols ─ * checkpoint_scans
       │      1───────* patrol_schedules ─ * expected_patrols
       │      1───────* guard_positions
       │      1───────* shifts  shift_handovers
       │      1───────* visitors  keys  key_handovers
       │      1───────* notifications
       │      1───────* audit_log
       │      1───────* org_sla_overrides  org_occurrence_types
       │      1───────* org_webhooks  webhook_deliveries  api_tokens
       │      1───────* role_capabilities
       │
       └─ capabilities (system-wide catalog)
```

---

## 7. Multi-Tenancy & Tenant Isolation

DigiLog is **truly multi-tenant**. One Supabase project hosts any number of
client organisations. The platform is engineered so that:

- Every domain table carries `org_id NOT NULL` (default = `current_org_id()`)
- Every SELECT/UPDATE/DELETE policy filters by `org_id = current_org_id()` OR `is_super_user()`
- Storage paths are namespaced by `<org_slug>/` and an RLS policy enforces it
- `super_user` is the only role that can read across tenants (and is the only role that can create or move users between orgs)
- Even cross-org auth user emails are unique globally (Supabase Auth constraint) — accept this as a known trade-off

Onboarding a new tenant takes one POST to `admin-create-org` (super_user only),
which also bootstraps the first admin and seeds the default role × capability
grants via the `trg_seed_org_caps` trigger.

---

## 8. Access Control — RLS + Capability Matrix

### Layer 1: Postgres RLS (security floor)

Every table has RLS enabled. The base helpers:

| Function | Behaviour |
|---|---|
| `current_app_roles()` | Returns the full role array of the caller |
| `current_app_role()` | Primary role (= `roles[1]`) |
| `current_org_id()` | Caller's org |
| `current_site_id()` | Caller's primary site |
| `has_any_role(_roles)` | Array overlap |
| `is_super_user()` | `'super_user' = ANY(current_app_roles())` |
| `is_admin()` | super_user OR admin |
| `is_manager()` | super_user OR admin OR manager |
| `can_access_site(_site)` | Site is in caller's org AND (caller is admin/manager/control_room OR is caller's primary site) |
| `has_capability(_cap)` | super_user OR capability granted to one of caller's roles in their org |

### Layer 2: Capability matrix (super-user editable)

UI/feature gating sits on top of RLS. Each nav item / button / page can carry
a `capability` key. When the user visits the app shell:

1. `loadMyCapabilities()` reads `public.my_capabilities` (view).
2. Super users get `Set(['*'])` and bypass capability filtering.
3. Everyone else gets the exact set the matrix grants their roles in their org.
4. Nav items and gated actions check via `hasCapability()`.

This means: the super user can hide features per role per org, **and only the
features the role's RLS already allows**. The system is fail-safe: revoking
a capability hides UI, but a malicious caller still can't bypass RLS.

### Privilege-escalation guard

The `prevent_profile_privilege_escalation` trigger blocks:

- Granting `super_user` unless the caller is super_user
- Moving a user between orgs unless the caller is super_user
- Changing role/site/org by anyone who isn't admin/super_user
- Removing the last role (would lock the user out)

---

## 9. SLA Engine

### Default matrix

| Severity | Resolve within | Update every |
|---|---|---|
| Critical | 1 h | 30 min |
| High | 4 h | 60 min |
| Medium | 24 h | 6 h |
| Low | 168 h (7 d) | 24 h |

### Per-org override

`org_sla_overrides (org_id, severity, resolve_hours, update_minutes)` lets
admins tighten or loosen the matrix per organisation. The helper functions
`severity_sla_hours()` and `severity_update_interval_minutes()` consult the
override table first and fall back to the defaults.

### Computation

The trigger `apply_occurrence_sla` runs `BEFORE INSERT OR UPDATE` on
`occurrences`:

- Sets `sla_hours` from severity
- Stamps `sla_due_at` if null
- Updates `last_sla_update_at` to `now()` on insert
- Recomputes `sla_due_at` if severity changes on update
- Stamps `closed_at` when entering `resolved` or `closed`

### Live view

`public.occurrences_live` (security_invoker view) projects each open
occurrence with:

- `is_sla_breached` — past `sla_due_at` and not closed
- `is_sla_update_due` — no update for `update_interval_minutes`
- `minutes_remaining` — friendly countdown
- `has_report`

### SLA monitor edge function

Scheduled by `pg_cron` every 5 minutes. For each affected site:

1. Reads `occurrences_live` and bucketises into breached / update-due
2. Resolves recipients (control_room / supervisor / manager / admin at that site)
3. Inserts `notifications` rows for the in-app inbox (with `data.occurrence_id`)
4. Sends Expo push messages (respecting per-user `push_notifications` flag)
5. Sends email summaries via Resend (respecting per-user `email_notifications` flag) for breach events

### Patrol watcher edge function

- `generate_expected_patrols()` seeds upcoming slots for the next 6 h based on `patrol_schedules`
- Marks overdue, unsatisfied, unalerted slots
- Sends push + creates `patrol.late` notifications for site supervisors
- Marks the slot `late_alert_sent_at` so it doesn't re-spam

---

## 10. Edge Functions

| Function | Purpose | Auth |
|---|---|---|
| `pin-login` | Verifies bcrypt PIN, mints magic-link token, applies brute-force lockout (5 fails / 15 min → 15 min lock) | Public POST |
| `pin-set` | Set / reset PIN (self with current_pin OR admin reset) | Bearer (signed-in) |
| `admin-create-user` | Create auth user + profile with roles[], optional PIN, optional employee# | admin OR super_user |
| `admin-update-user` | Mutate profile fields + roles + PIN. Org admins can't reassign org | admin OR super_user |
| `admin-create-org` | Super-user-only tenant provisioning with optional first-admin bootstrap | super_user |
| `admin-delete-org` | Super-user-only tenant teardown — cascade-deletes all org data and removes the org's auth accounts (no orphans). Refuses to delete the caller's own org | super_user |
| `admin-delete-user` | Delete a user (auth account + cascaded profile). super_user any; admin within own org (not super users, not self) | admin OR super_user |
| `admin-api-token` | Mint / revoke org-scoped API tokens (SHA-256 stored hash, plaintext shown once) | admin OR super_user |
| `admin-role-capability` | grant/revoke/bulk on `role_capabilities`, add/remove custom capability keys | super_user |
| `send-email` | Resend wrapper; falls back to console log if `RESEND_API_KEY` unset | Internal key OR admin |
| `webhook-deliver` | Fan out an event to org_webhooks with HMAC-SHA256 signature, records `webhook_deliveries` | Internal key OR admin |
| `patrol-watcher` | Seeds expected_patrols + alerts overdue ones | Cron (service role) |
| `sla-monitor` | Inbox + push + email for SLA events | Cron (service role) |
| `transcribe-audio` | OpenAI Whisper proxy; attaches transcript as a comment on the occurrence | Bearer (signed-in) |
| `health-check` | Public uptime probe (DB connectivity + counts) | None |

All functions live under `supabase/functions/` and are deployed with
`npx supabase functions deploy <name>`.

---

## 11. Realtime & Storage

### Realtime publication

These tables stream change events over the `supabase_realtime` publication:

`occurrences`, `occurrence_updates`, `occurrence_reports`, `patrols`,
`checkpoint_scans`, `organizations`, `manager_acknowledgements`,
`occurrence_comments`, `notifications`, `tasks`, `task_updates`.

On the admin web, any server-rendered table can be made live by dropping in the
reusable `<RealtimeRefresh tables={[…]} />` component: it subscribes to the
listed tables and debounce-refreshes the page on any change (pausing while the
tab is hidden). Client-cached pages (Reports, My Queue) subscribe directly and
revalidate. This is what keeps the operational tables current without a manual
refresh.

Used by:

- Admin **Live Occurrences** board — flash banner on new OB, refresh on any change
- Admin **Guard Map** — animate markers as `guard_positions` rows arrive
- Mobile **Supervisor Board** — auto-refresh on changes to the site's occurrences
- Mobile **Occurrence Detail** — live status and comment updates
- Admin **Notifications bell** — live unread counter

### Storage

| Bucket | Visibility | Path convention | RLS |
|---|---|---|---|
| `occurrence-images` | Private | `<org_slug>/<OB>/<uuid>.<ext>` | Read/write only if path's first segment matches caller's org_slug; super_user bypass |
| `occurrence-voice-notes` | Private | `<org_slug>/<OB>/<uuid>.m4a` | Same as above |
| `org-branding` | Public | `<org_slug>/<file>` | Read public; write requires admin in matching org |

All buckets enforce file-size caps and MIME-type allowlists.

---

## 12. Admin Console — Surfaces & Workflows

### Layout

A two-pane shell with a collapsible sidebar grouped by section: **Overview,
Occurrences, Field Operations, Manager, Administration, Super User**.
Sections and items render based on the user's roles AND capabilities.

The header carries:

- Site context indicator
- Live unread notification bell
- Theme toggle (persisted to `localStorage.digilog.theme`)
- Avatar + sign out

### Dashboard

KPI cards (incidents 30d / open / breached / resolution rate), monthly trend
chart, type breakdown, severity pie, top sites. **Filterable by site** via
chip selector (`?site=` query param).

### Live Occurrences

Realtime grid of open occurrences with SLA badge animation on breach. Each
card has Update + Add Report actions and a flash banner appears on new OB.

### All Occurrences

Server-side paginated + filtered explorer. Filters: free-text search across
OB/type/description/logger (uses `pg_trgm`), status, severity, site, type,
date range, patrol toggle. URL-driven, so every filter combination is
shareable. **Saved views** let users (or admins, shared with org) name a
filter set, pin it, and one-click apply. **Bulk actions** bar appears on
multi-select: acknowledge, close (with timeline note), assign. **Export CSV**
exports the visible page.

### Occurrence detail

Severity + status badges, details grid, description, optional report card,
photo gallery, **assignment card** (pick a reviewer; auto-notifies them),
**comments thread** (realtime, edit/delete own), update timeline.

### Log incident

Type/severity/site/incident-at form. OCR drop-zone lets reviewers drop a
photo of a handwritten note — Tesseract.js extracts text into the description.

### Reports

List of reports with one-click PDF print route at `/print/report/[ob]`. The
print route renders a polished page styled for A4 with auto-print on load.

### Manager

- **Acknowledgements** — queue of un-acknowledged occurrences; modal lets the manager pick a decision (Acknowledge / Escalate / Reject) + notes; writes to `manager_acknowledgements`, mirrors status onto occurrence, drops a timeline update.
- **Reviewed Logs** — historical decisions (bulk sign-offs collapse into one entry).
- **Staff Reports** — per-role / per-person activity roll-up with CSV export.

### Tasks

Lightweight to-do tracker (`tasks` + `task_updates`). Create a task, optionally
link it to an occurrence (OB), assign it to a user, and track status through an
update thread. Realtime: assignees get a toast + the board self-updates. The
detail page lives at `/tasks/[id]`.

### Field Operations

- **Patrols** — active + recent with route progress
- **Checkpoints** — CRUD with QR/NFC/GPS, printable QR labels
- **Team Status** — field-staff availability + active-patrol indicator
- **Visitor Log** — currently-on-site + recent
- **Key Register** — held vs available
- **Shifts** — KPI strip + roll-up
- **Patrol Schedules** — recurring expectations
- **Guard Map** — live leaflet map with marker per on-patrol guard, accuracy circle, OSM tiles, lazy-loaded chunk

### Administration

- **Users** — table with role chips, multi-role checkbox dialog (rank-clamped), **multi-site assignment** (`site_ids[]`), job title, employee number, PIN reset, **delete** (not self; org admins can't delete super users), CSV export
- **Sites** — CRUD per org. The super-user view adds an **Organisation column** and an org picker so a site can be assigned to any tenant
- **Organisation** — branding, contact, plan (read-only for org admins)
- **SLA Matrix** — per-severity override form, reset-to-default per row
- **Occurrence Types** — register/disable custom types with a category → subcategory taxonomy, default severity, and optional per-type custom fields
- **My Preferences** — per-user push/email/assignment/breach toggles
- **Security (2FA)** — Supabase Auth TOTP enrollment with QR
- **Webhooks** — register URL + events + secret; signed `X-DigiLog-Signature: hmac-sha256` deliveries; last_status badge
- **API Tokens** — mint + revoke; shown plaintext once; SHA-256 hashed at rest; scopes list
- **Audit Log** — color-coded action chips, actor name + role, target table#id, IP. Historical activity from before live logging (or from a legacy import) can be reconstructed from each record's real timestamp via `scripts/backfill-audit.mjs`; reconstructed rows are tagged `metadata.backfilled = true` so they stay distinguishable from live-captured entries and are reversible in one delete

### Super User

- **Organisations** — per-tenant counts; create (with optional first-admin bootstrap) and **delete** (type-to-confirm; cascades all org data and removes the org's auth accounts; can't delete the org you belong to)
- **All Users (cross-org)** — every user across every tenant. Create a user **into a chosen organisation** (org picker; the assignable sites filter to that org), edit, reset PIN, and **delete**. Org membership is set explicitly per user — it is *not* derived from the site
- **Assignment allow-list** — choose which profiles appear in the "Assign to" dropdown when logging an occurrence
- **Branding** — toggle the parent-company (Netstream) logo per organisation
- **Form Builder** — toggle which sections appear on the Log-Occurrence form per org
- **Mobile Layout** — control the mobile tab bar and home cards shown per role
- **Platform Health** — aggregate KPIs and recent activity across all tenants
- **Permissions** — role × capability matrix editor (the entire point of the capability layer)

### My Access

Self-service page anyone can open: roles held with primary chip, live capability set chips, area-grouped capability matrix with `via {role}` provenance per capability, list of pages they can actually open.

---

## 13. Mobile App — Surfaces & Workflows

The mobile **tab bar and home cards are configurable per role** by the super
user via **Super User → Mobile Layout** (backed by mobile-tab / mobile-duty /
mobile-container capability keys), so each org can tailor what guards and
supervisors see without a rebuild.

### Authentication — PIN only

Mobile has **no password mode**. On the first launch a user opens the
"Switch account" sheet, enters org slug + employee number (saved to
AsyncStorage), then types their PIN.

### Home (tab 1)

- Greeting + multi-role chips + site name
- Shift card — tap to clock in/out
- KPI strip — my open / logged today / (visitors OR breached for supervisors)
- Handover prompt if any are waiting on the user
- Active-patrol callout
- Quick action tiles — Log occurrence · Patrol · Scan · Visitors · Keys · My shift
- Supervisor section (only if user holds supervisor) — Site Board · Team
- "My logs · today" summary card
- Floating "+" log-occurrence FAB

### Patrol (tab 2)

Route picker (or ad-hoc) → Start. While active: live status card, scan
checkpoint button, route checkpoint list with done/not-done state. While
active, the location reporter posts a `guard_positions` row every 30 s.

### Scan (modal)

Three modes — **QR** (expo-camera, decodes `DIGILOG-CP:<token>`), **NFC**
(NFC Manager — requires dev build), **GPS** (Location → nearest checkpoint
+ haversine distance against geofence). Each commit writes a
`checkpoint_scans` row with method, coordinates, distance, verified flag.

### Log incident (tab 3 / FAB)

Type chips (org-custom first, defaults fallback) → severity chips → multi-line
description → photos (camera or library, up to 6) → Submit. On success,
toast + auto-navigate to detail. On no network, queued to AsyncStorage and
flushed automatically on reconnect.

### My Logs (tab 4)

Searchable, filterable by status (All / Open / Closed). Realtime updates if
status changes from the web side.

### Occurrence detail (deep-linkable)

Header with OB + type, badges, details grid, description, photo strip,
comments thread, update timeline. **Sticky bottom action bar** for reviewers
(supervisor / manager / control_room / admin / super_user) opens a status
update sheet with chip-grid + notes field. Realtime subscriptions update all
panels while open.

### Gate-house

- **Visitors** — currently-on-site list with one-tap "Out" button. Add sheet with full name, ID, company, vehicle reg, visiting contact. Recent history below.
- **Keys** — held vs available. Hand-over sheet captures recipient name + ID. Return-to-supervisor flow.

### Shift

Live elapsed counter (`Hh Mm`, updates every 30 s). Closing notes textarea.
Clock Out with confirmation. Recent shifts list with computed durations.

### Handovers

Inbox of waiting handovers (acknowledge button) + history. New-handover
sheet captures summary, open issues, and a **signature** drawn with
`react-native-svg`.

### Supervisor surfaces (gated)

- **Site Board** — realtime SLA bucketed by Breached / Update Due / On Track. Tap any card → bottom sheet with status chip grid + notes → Post. Page updates without nav.
- **Team** — live who's-on-patrol / on-shift / off, end-patrol-remotely action, tap-to-call.

### Inbox

Mark-read / mark-all / delete. Kinds with custom icon + colour: `sla.breach`,
`sla.update_due`, `manager.*`, `occurrence.assigned`, `patrol.late`,
`handover.waiting`, `system`.

### Settings

Profile (avatar, multi-role chips, employee#, PIN status), Change PIN with
live mismatch feedback + show/hide toggle, shortcuts to Inbox + Handovers,
Sign Out with confirmation.

---

## 14. Authentication Flows (Web Password / Mobile PIN)

### Web

Standard Supabase Auth email + password via `signInWithPassword`. Optional
TOTP MFA via `/settings/security`. Auth gated by middleware on `/(app)/*`
routes. Web roles: super_user, admin, manager, control_room, supervisor.

### Mobile PIN

The mobile app intentionally has **no password** flow. The sequence:

```
1. User taps PIN keypad (4 digits)
2. App POSTs { org_slug, employee_number, pin } to `pin-login` edge fn
3. Edge fn:
   - Look up org by slug, profile by (org_id, employee_number)
   - Check `locked_until` — if set and in future, 423 + locked_until
   - Read profile.pin_hash, bcrypt-compare
   - Register attempt to public.pin_attempts (success or failure)
   - If failure count >= 5 in last 15 min, set profile.locked_until = now() + 15 min
   - On success: mint magiclink token via supabase.auth.admin.generateLink
   - Return { token_hash, email, role }
4. App calls supabase.auth.verifyOtp({ token_hash, type: 'magiclink' })
5. Supabase returns a real session; app enforces MOBILE_ROLES on the profile
```

### Brute-force protection

- bcrypt(10) PIN storage
- Constant-time response normalisation (250 ms minimum) avoids enumeration timing
- Account lockout: 5 failures in 15 min → 15-min lock, audit-logged
- All attempts written to `pin_attempts` for forensic review

---

## 15. Checkpoint Scanning (QR / NFC / GPS)

Each `checkpoint` row carries:

- `qr_token` (auto, used as the QR payload prefixed with `DIGILOG-CP:`)
- `nfc_tag_id` (operator-set; matched case-insensitively, colons ignored)
- `latitude`, `longitude`, `geofence_radius_m`

When a guard scans:

- **QR** — decode payload → token lookup → write `checkpoint_scans (method='qr')`
- **NFC** — read tag id → checkpoint lookup → `(method='nfc')`
- **GPS** — get current position → find nearest checkpoint with GPS → compute haversine distance → `(method='gps', verified=distance ≤ radius)`

The `bump_patrol_scan_count` trigger increments
`patrols.checkpoints_scanned` on each insert. The patrol view shows progress
against `checkpoints_total`.

Printable QR labels are rendered in the admin **Checkpoints** page via
`QRCodeSVG`.

---

## 16. Offline Resilience

### Mobile offline queue

A guard logging an incident with no signal is mission-critical. The flow:

1. `isOnline()` checks via `@react-native-community/netinfo`
2. If offline (or the insert fails mid-flight), the occurrence + base64 photos are written to AsyncStorage at `digilog.offline_queue.v1`
3. `startAutoFlush()` listens for connectivity changes; on reconnect it iterates the queue
4. Each item is retried up to 8 times; dropped if it still fails (poison-row protection)
5. The home + log screens surface a "N pending sync" banner so guards know the state

The PIN itself is never persisted to AsyncStorage.

### Web

Server-rendered Next.js pages tolerate connection blips naturally. The
notifications bell and live board both gracefully degrade when realtime
disconnects.

---

## 17. Notifications & Push Deep-Links

### Channels

- **In-app inbox** — `public.notifications` table; realtime subscription drives the bell badge on web + home badge on mobile
- **Push** — Expo Push API, via the SLA monitor / patrol watcher / occurrence assignment trigger; respects per-user `push_notifications`
- **Email** — Resend via `send-email` edge function; respects per-user `email_notifications`

### Mobile deep-linking

The root `_layout.tsx` wires both `getLastNotificationResponseAsync()` (cold
start) and `addNotificationResponseReceivedListener` (warm). Payload routing:

| Payload | Destination |
|---|---|
| `{ occurrence_id }` (any kind) | `/occurrence/{id}` |
| `{ type: 'patrol_late' }` | `/supervisor/board` |
| `{ type: 'handover' }` | `/handovers` |
| `{ type: 'sla' }` (no occurrence_id) | `/supervisor/board` |
| Anything else | `/inbox` |

---

## 18. Security Posture

### Code-level

- **RLS on every table** including `auth.users` indirectly via Supabase Auth
- **Storage RLS** validates the `<org_slug>/` path prefix per request
- **Privilege escalation triggers** on `profiles`
- **CSP** on the admin app (Supabase URL inlined from env, OSM + unpkg whitelisted only for the guard map)
- **HSTS 2y w/ subdomains**, **X-Frame-Options: DENY**, **COOP same-origin**, restrictive **Permissions-Policy**
- **CSRF** — Supabase JWT in HttpOnly cookies via `@supabase/ssr`; no separate token needed
- **PIN brute-force lockout**
- **Audit log** triggered on profile/org/manager-ack changes + written by edge functions

### Operational

- **Service-role key** lives only in edge functions and the seed script
- **API tokens** stored only as SHA-256 hashes — recoverable plaintext exists exactly once at creation time
- **MFA (TOTP)** available for any web user via self-service
- **Soft delete** on profiles / sites / occurrences / organizations — `deleted_at` filter in select policies
- **Health check** at `/functions/v1/health-check` for monitoring without auth

### Known trade-offs (documented intentionally)

- Auth user emails are globally unique (Supabase Auth constraint) — accepted because email collisions across tenants are rare and the org_slug + employee# is the primary mobile identity
- NFC reads require a dev build (Expo Go can't read NFC)

---

## 19. Production Hardening Summary

The features that distinguish DigiLog 360 from a demo:

- ✅ True multi-tenant schema with `org_id` on every domain row and RLS bypass only via `super_user`
- ✅ PIN auth on mobile (employee# + 4-digit PIN), bcrypt(10), brute-force lockout, lockout audit
- ✅ Multi-role profiles (`roles app_role[]`) with primary-role sync trigger and array-based RLS helpers
- ✅ Capability matrix per org (super-user editable; UI + nav + page-level gates)
- ✅ Audit log on every sensitive action (auth + user + role + org + PIN + capability + manager-ack)
- ✅ Soft delete on profiles / sites / occurrences / organizations
- ✅ Storage RLS isolates `<org_slug>/…` per tenant
- ✅ CSP + HSTS + X-Frame-Options: DENY on the admin console
- ✅ Notifications inbox (web + mobile) driven by SLA monitor + patrol watcher + manual triggers
- ✅ Mobile offline queue for occurrences
- ✅ Mobile push deep-linking
- ✅ CSV export on occurrences and users
- ✅ Public `/functions/v1/health-check` for uptime monitoring
- ✅ Outbound webhooks with HMAC-SHA256 signatures and delivery history
- ✅ API tokens (org-scoped, hash-at-rest)
- ✅ Per-org SLA matrix and custom occurrence types
- ✅ Voice notes (OpenAI Whisper) + OCR (Tesseract.js)
- ✅ Live guard map (Leaflet + OSM)
- ✅ Realtime live SLA board (web + mobile supervisor)
- ✅ Self-service 2FA (TOTP)
- ✅ GitHub Actions CI (typecheck + admin build)
- ✅ Sentry opt-in error monitoring

### Performance & scale

The web console is tuned for South-African users hitting an EU-hosted Supabase
project (see [`PERFORMANCE_OPTIMIZATIONS.md`](PERFORMANCE_OPTIMIZATIONS.md) for
measured before/after numbers):

- **Lean bundles** — Next.js default code-splitting (no catch-all vendor chunk) plus a tree-shakeable icon registry (`apps/admin/src/lib/icons.tsx`) hold shared First-Load JS at ~104 kB (down from ~426 kB). recharts, leaflet and tesseract.js are route-scoped / lazy-loaded.
- **Parallel data fetching** — independent Supabase reads on heavy server pages run as one `Promise.all` batch instead of a serial SA→EU round-trip waterfall.
- **One auth round-trip per navigation** — the middleware validates the JWT once per request; server components then read the already-validated session (no second network `getUser`). RLS still re-checks every query, so security is unchanged.
- **Instant navigation** — the menu and sidebar fully prefetch destinations (data included), and the App-Router client cache (`staleTimes`) keeps revisits instant.
- **Live, not polled** — `<RealtimeRefresh>` keeps operational tables current via Supabase realtime; no manual refresh.
- **DB indexes** — composite indexes (`20260626000008_perf_composite_indexes.sql`) match the apps' hot query paths.

---

## 20. Deployment & Operations

See [`PRODUCTION.md`](PRODUCTION.md) for the full runbook including secret
rotation cadence, monitoring setup, backup/DR, pre-release checklist, and
common ops. The headline flow:

```powershell
# 1. Provision a Supabase project; grab URL + anon + service_role
# 2. Fill the three .env files:
#    - .env                       (SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
#    - apps/admin/.env.local      (NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY)
#    - apps/mobile/.env           (EXPO_PUBLIC_SUPABASE_URL, EXPO_PUBLIC_SUPABASE_ANON_KEY)

# 3. Apply migrations
npx supabase db push
# OR paste supabase/_deploy_all.sql into the SQL editor

# 4. Regenerate typed DB client
npm run db:types

# 5. Deploy edge functions
npx supabase functions deploy `
  pin-login pin-set `
  admin-create-org admin-create-user admin-update-user `
  admin-delete-org admin-delete-user `
  admin-api-token admin-role-capability `
  send-email webhook-deliver `
  patrol-watcher sla-monitor `
  transcribe-audio health-check

# 6. Schedule cron jobs (in SQL editor, see supabase/schedule_sla_monitor.sql)
#    SLA monitor:     */5 * * * *
#    Patrol watcher:  */5 * * * *

# 7. Seed demo accounts
node --env-file=.env scripts/seed-accounts.mjs

# 8. Production hosting
#    - Admin → Vercel (root: apps/admin)
#    - Mobile → Expo EAS for iOS + Android builds
```

### Secret rotation schedule

| Secret | Rotate |
|---|---|
| `SUPABASE_SERVICE_ROLE_KEY` | Every 90 days or on any suspected leak |
| `SUPABASE_ANON_KEY` | Every 180 days or on RLS audit findings |
| `RESEND_API_KEY`, `OPENAI_API_KEY`, `INTERNAL_FN_KEY` | Every 180 days |
| Demo / seed passwords + PINs | Once, before go-live; never reused |
| Org admin / guard PINs | When the employee leaves |

---

## 21. Demo Accounts

After running `scripts/seed-accounts.mjs`, the following accounts exist on
the `digilog-demo` org plus one cross-org super user:

| Surface | Email | Password | Role(s) |
|---|---|---|---|
| Web (super) | `super@digilog360.com` | `Super123!` | super_user |
| Web (admin) | `admin@digilog360.com` | `Admin123!` | admin |
| Web (manager) | `manager@digilog360.com` | `Manager123!` | manager |
| Web (control) | `control@digilog360.com` | `Control123!` | control_room |
| Web (supervisor) | `supervisor@digilog360.com` | `Supervisor123!` | supervisor |
| Mobile (guard HQ) | org `digilog-demo` · emp `GRD001` | PIN `123456` | guard |
| Mobile (guard Sandton) | org `digilog-demo` · emp `GRD002` | PIN `234561` | guard |
| Mobile (supervisor) | org `digilog-demo` · emp `SUP001` | PIN `601234` | supervisor |

**Rotate all of these before going to production.** They exist exclusively for
exercising the platform during development and demos.

---

## 22. License

DigiLog 360 is **proprietary software** owned by **Kruz Naidoo**.

- See [`LICENSE`](LICENSE) for the full terms.
- Copyright © 2026 Kruz Naidoo. All Rights Reserved.
- Governed by the laws of the Republic of South Africa.
- **No license, right, or permission to use, copy, modify, distribute,
  sublicense, lease, sell, reverse-engineer, or otherwise exploit the
  Software is granted to any person or entity** except by express prior
  written permission of the Owner.
- The Software incorporates third-party open-source components subject to
  their respective licenses. Those licenses apply only to the third-party
  components and not to the Software as a whole.

For licensing inquiries, contact the Owner: **Kruz Naidoo**.

---

<div align="center">

**DigiLog 360**
Multi-Tenant Security Operations Platform
© 2026 Kruz Naidoo. Proprietary & Confidential. All Rights Reserved.

</div>
