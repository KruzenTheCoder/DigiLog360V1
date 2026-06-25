# Importing a SQL Server `.bacpac` into DigiLog 360

A `.bacpac` is Microsoft's proprietary database export — a ZIP archive of an
XML schema (`model.xml`) and per-table binary BCP data files. Postgres can't
ingest it directly. The canonical path is:

```
.bacpac  --(sqlpackage)-->  SQL Server (LocalDB / Express)  --(SSMS / bcp)-->  CSV  --(our importer)-->  Supabase
```

This document walks through every step. Total time for a ~1MB bacpac: ~10 min.

---

## Prerequisites

- **`sqlpackage`** — Microsoft's CLI for `.bacpac` and `.dacpac`.
  [Install guide](https://learn.microsoft.com/en-us/sql/tools/sqlpackage/sqlpackage-download).
  On Windows: `winget install Microsoft.SqlPackage`.
- **SQL Server** — Anything will work: LocalDB (ships with Visual Studio /
  SQL Server Express), Docker `mcr.microsoft.com/mssql/server`, or Azure SQL.
- **`sqlcmd`** or **SQL Server Management Studio (SSMS)** — for exporting
  tables to CSV after the bacpac is restored.
- Our seeded Supabase project with all migrations applied.

---

## Step 1 — Restore the `.bacpac` into a temporary SQL Server

```powershell
sqlpackage /Action:Import `
  /SourceFile:"C:\Users\Kruz Naidoo\OneDrive\Desktop\mydatabase.bacpac" `
  /TargetServerName:"(localdb)\MSSQLLocalDB" `
  /TargetDatabaseName:"DigilogLegacy"
```

On success you have a `DigilogLegacy` database containing the legacy tables:

| Table | Rows we'll import |
|---|---|
| `dbo.AspNetUsers` | Legacy user accounts (already handled by `seed-accounts.mjs` for the curated list — skip unless you need everyone) |
| `dbo.OccurrenceLogs` | The occurrence book (✓ import) |
| `dbo.OccurrenceUpdates` | Status updates per occurrence (✓ import) |
| `dbo.OccurrenceReports` | Detailed reports (✓ import) |
| `dbo.OccurrenceImages` | Photo-evidence binary blobs (✓ import; uploaded to Storage) |
| `dbo.PatrolLogs` | Patrols (✓ import) |
| `dbo.ManagerAcknowledgements` + `Items` | Manager review trail (✓ import) |
| `dbo.TaskItems` + `dbo.TaskUpdates` | Legacy task module (✓ import — maps to our `tasks` + `task_updates`) |
| `dbo.Notifications` | Legacy notification feed (skip — our new schema regenerates these) |
| `dbo.AuditLogs` | Legacy audit (skip — our new audit log starts fresh) |

---

## Step 2 — Export each needed table to CSV

The fastest way uses `sqlcmd`:

```powershell
$server   = "(localdb)\MSSQLLocalDB"
$database = "DigilogLegacy"
$out      = "C:\temp\digilog-export"
New-Item -ItemType Directory -Force -Path $out | Out-Null

foreach ($t in @("OccurrenceLogs","OccurrenceUpdates","OccurrenceReports","PatrolLogs","TaskItems","TaskUpdates","ManagerAcknowledgements","ManagerAcknowledgementItems")) {
  sqlcmd -S $server -d $database -E -W -s "," -h-1 -y0 `
    -Q "SET NOCOUNT ON; SELECT * FROM dbo.$t" `
    -o "$out\$t.csv"
  Write-Host "  → $t.csv"
}
```

(`-s ","` is the field separator, `-W` strips trailing whitespace, `-h-1`
removes the header divider, `-y0` keeps long fields intact.)

Alternative: SSMS → right-click the database → **Tasks → Export Data…** →
target = "Flat File Destination" → tick each table → CSV with header.

---

## Step 3 — Run the importer

Our existing **occurrences** importer:

```powershell
node --env-file=.env scripts/import-occurrences.mjs "C:\temp\digilog-export\OccurrenceLogs.csv"
```

It accepts a `--dry-run` flag — always try that first to see how many rows
parse, how many would be skipped, and how the timestamps look (it converts
SAST → UTC).

For **the other tables** use the generic importer below. It maps the legacy
columns to our new schema, preserves OB numbers, and links related rows.

```powershell
# Each table imported separately. Order matters — occurrences first so the
# FKs from updates/reports/patrols/tasks can resolve.
node --env-file=.env scripts/import-occurrences.mjs        "C:\temp\digilog-export\OccurrenceLogs.csv"
node --env-file=.env scripts/import-legacy-csv.mjs updates  "C:\temp\digilog-export\OccurrenceUpdates.csv"
node --env-file=.env scripts/import-legacy-csv.mjs reports  "C:\temp\digilog-export\OccurrenceReports.csv"
node --env-file=.env scripts/import-legacy-csv.mjs patrols  "C:\temp\digilog-export\PatrolLogs.csv"
node --env-file=.env scripts/import-legacy-csv.mjs tasks    "C:\temp\digilog-export\TaskItems.csv"
node --env-file=.env scripts/import-legacy-csv.mjs task_updates "C:\temp\digilog-export\TaskUpdates.csv"
node --env-file=.env scripts/import-legacy-csv.mjs acks     "C:\temp\digilog-export\ManagerAcknowledgements.csv"
node --env-file=.env scripts/import-legacy-csv.mjs ack_items "C:\temp\digilog-export\ManagerAcknowledgementItems.csv"
```

Each command prints how many rows parsed, how many were inserted, and how
many were skipped (typically due to a missing parent FK — e.g. an
OccurrenceUpdate referencing an OB number that wasn't imported).

---

## Step 4 — Bump the `ob_number_seq`

`OccurrenceLogs` keeps the legacy OB numbers. After import, advance the
sequence so new occurrences don't collide with what you imported:

```sql
-- Run in the Supabase SQL editor
select setval(
  'public.ob_number_seq',
  (select coalesce(max(regexp_replace(ob_number,'\D','','g')::int), 0) from public.occurrences)
);
```

---

## Troubleshooting

- **`sqlpackage` reports schema-drift errors** — pass `/p:CommandTimeout=0`
  and `/p:DisableIndexesForDataPhase=False`. For a one-off import you can
  ignore most warnings; the data is what we want, not the schema.
- **CSV has weird characters** — re-export with `-u` (Unicode) on `sqlcmd`
  or pick UTF-8 in SSMS's wizard.
- **Photo evidence** — `OccurrenceImages.csv` contains base64-encoded blobs
  in a column. The importer extracts them, uploads to the
  `occurrence-images/<org_slug>/<OB>/` bucket, and writes a row to
  `public.occurrence_images`. Expect the import to take longer on this
  table because of the upload step.
- **Re-runs** — every importer is idempotent. Re-running skips any rows
  whose `ob_number` (or legacy id) already exists.

---

## What stays put

- Legacy `AspNetUsers` is **not** auto-imported. The seed in
  `scripts/seed-accounts.mjs` is the canonical user list (you've curated it).
  If you need to bulk-import additional legacy users, run
  `scripts/seed-new.mjs` which iterates the AspNetUsers dump.
- Legacy `AuditLogs` and `Notifications` are **skipped** by design — our new
  schema regenerates them from live events.
