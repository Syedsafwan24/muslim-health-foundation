# MHF Aid — Muslim Health Foundation, Bhatkal

Replaces the paper application form: applications, committee decisions, payments, documents,
donors, and the trustees' reports. Read `CLAUDE.md`, then `docs/00`–`06`.

## Run it locally

Needs Node 22, pnpm, Docker.

```bash
cp .env.example .env          # then fill AUTH_SECRET and ID_ENCRYPTION_KEY (commands inside)
pnpm install
pnpm db:up                    # Postgres 16 on :5433, S3-compatible storage on :9000
pnpm db:migrate               # creates the schema
pnpm db:seed                  # masters, one user per role, 54 demo cases
pnpm dev                      # http://localhost:3100
```

Demo accounts for **local development only** (password `Mhf@2026!` for all — it is public, so it
is never used in production: there `pnpm db:seed` requires `SEED_ADMIN_PASSWORD` and every seeded
account must choose its own password at first sign-in; see `docs/RUNBOOK.md` §6):

| Email | Role | Note |
|---|---|---|
| admin@mhf.local | Super admin | meeting-mode switch, reveal identity, users |
| gensec@mhf.local | General secretary | approves cases, verifies eligibility |
| committee@mhf.local | Committee member | always sees identities hidden |
| operator@mhf.local | Operator | enters applications and documents |
| accounts@mhf.local | Accountant | payments, donations, funds |
| viewer@mhf.local | Viewer | read-only, identities hidden |

`pnpm db:reset` drops everything and re-seeds.

## Checks

```bash
pnpm typecheck && pnpm lint && pnpm test
```

`pnpm test` uses its own database, `mhf_test` (created, migrated and seeded on first run; set
`DATABASE_URL_TEST` to override). It covers money and fiscal-year units, the nine Meeting Mode
tests from `docs/03 §9`, and a walk-in-to-paid workflow through the real server actions.

`scripts/perf.ts` times every page query against a large database (see its header) — rerun it after changing a query.

## Where things are

| Path | What |
|---|---|
| `src/lib/db/queries/*` | every read. Takes a `ViewContext`, returns redacted views. Pages may not import Prisma (lint rule) |
| `src/lib/redact` | the redaction allowlists, age bands, `scrubNames` |
| `src/lib/auth/permissions.ts` | the single capability map |
| `src/lib/action.ts` | the server-action wrapper: session → permission → zod → transaction → audit |
| `src/app/(app)/*/actions.ts` | mutations |
| `src/app/api/files/[id]` | 5-minute signed URLs, after a permission + Meeting Mode check |
| `src/app/api/export/[report]` | PDFs and Excel, all audited |
| `docs/RUNBOOK.md` | backups, restore, deploys |

Operations: see `docs/RUNBOOK.md`.
