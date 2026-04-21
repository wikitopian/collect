# AGENTS.md

## Purpose

Simulated debt-collections data environment for a forthcoming AI-enabled CRM. Pulls the public LendingClub loan dataset (2007–2018Q4), ingests it into a strictly-typed SQLite database, and projects collectible accounts — the foundation layer for downstream PII stamping, stochastic activity generation, and LLM-powered analytics.

## Quick start

```bash
cp .env.example .env          # paste KAGGLE_API_TOKEN
npm install
npm run test:lendingclub      # one-shot: download + extract + load
```

Output: `data/lending-club.db` — ~2 GB STRICT SQLite, containing:

- `accepted_loans` — source table, 2,260,668 rows × 151 columns
- `v_collectible_loans` — view filtering to ~304K accounts in Charged Off / Default / Late / Grace Period states
- `collectible_loans` — derived materialized table, populated from the view via `-- EXEC`

Re-runs are non-destructive. `INSERT OR IGNORE` on the primary key dedupes; `EXEC populate_collectible_loans` is idempotent. No truncate, no drop, no file delete in the happy path.

## Architecture

SQLite accessed through `@possumtech/sqlrite`. SQL is first-class: schema and queries live in `.sql` files, surfaced to JS via `-- INIT` / `-- PREP` / `-- EXEC` section markers.

- `migrations/001_initial_schema.sql` — tables, indexes, views (generated; `-- INIT` only)
- `src/lendingclub/accepted_loans.sql` — prepared statements and exec blocks (generated; `-- PREP` / `-- EXEC`)
- `scriptify/GenerateLendingClubSchema.js` — one-shot profiler that emits both `.sql` files by scanning the CSV. Rerun only if the source data shape changes.

## Layout

```
collect/main/
├── migrations/            # generated INIT
├── scriptify/             # dev-only tooling, not wired to npm
├── src/
│   ├── kaggle/            # Kaggle API client
│   └── lendingclub/       # pipeline stages + per-module .sql
├── data/                  # gitignored raw and built artifacts
├── AGENTS.md
├── README.md
└── package.json
```

## Code conventions

- ESM. One class per file, `export default class FileName {}`, filename matches class name.
- Private fields (`#field`) for internal state. Focused methods, each doing one thing.
- Node built-ins preferred (`node:fs/promises`, `node:stream/promises`, `process.loadEnvFile`, global `fetch`).
- STRICT SQLite tables; no dynamic `CREATE TABLE` in JS. Schema lives in SQL, coercion lives in JS.
- No defensive fallbacks (`||`, `??`) on contracts — boundaries validate, interiors fail hard.
- Comments only when the *why* isn't obvious from the code.

## Pipeline scripts

| Script | Purpose |
|---|---|
| `npm run test:lendingclub` | Easy button: download + extract + load |
| `npm run test:lendingclub:download` | Fetch LendingClub zip from Kaggle |
| `npm run test:lendingclub:extract` | Unpack `.csv.gz` files from the zip |
| `npm run test:lendingclub:inspect` | One-off CSV profile (columns, row count, status breakdown) |
| `npm run test:lendingclub:load` | Ingest into `data/lending-club.db` and materialize `collectible_loans` |
