# 06 — Build Plan

Nine phases. Each phase is independently demonstrable to the client. Tickets are sized so one
Claude Code session can finish one ticket and leave the repo green (`typecheck`, `lint`, tests).

Estimates assume one developer working with Claude Code.

---

## Phase 0 — Foundation (2 days)

- `0.1` Next.js 15 + TypeScript strict + Tailwind v4 + ESLint/Prettier + pnpm; `pnpm typecheck`,
  `pnpm lint`, `pnpm test` scripts.
- `0.2` Install shadcn and the component list from `04-design-system.md §7`. Replace the default
  CSS variables with the token block. Self-host IBM Plex Sans and IBM Plex Mono.
- `0.3` `src/lib/money` (paise ↔ rupee, Indian grouping, amount in words), `src/lib/fy`
  (fiscal year helpers), with unit tests.
- `0.4` Prisma + Postgres via docker-compose, full schema from `01-data-model.md`, first
  migration, soft-delete Prisma extension.
- `0.5` Seed script: funds, disease taxonomy, hospitals, areas, banks, one user per role.
- `0.6` App shell — `AppSidebar`, topbar, FY selector, breadcrumb, empty pages for every route.

**Demo:** the shell navigates, in MHF's colours and fonts, with real seed masters.

## Phase 1 — Auth, roles, audit (2 days)

- `1.1` Auth.js credentials provider, bcrypt, JWT session with role, login page, rate limiting.
- `1.2` `src/lib/auth/permissions.ts` capability map + `assertPermission`; middleware guarding
  every `(app)` route.
- `1.3` `AuditLog` writer `audit(ctx, action, entity, id, {before, after, summary, reason})`,
  called from a server-action wrapper so it cannot be forgotten.
- `1.4` Settings → Users & roles CRUD.

**Demo:** six roles log in and see different navigation; every action lands in the audit table.

## Phase 2 — People registry (3 days)

- `2.1` Person CRUD + `personCode` generation + `identityHash`.
- `2.2` Duplicate detection on save; "looks like an existing person" dialog.
- `2.3` `/patients`, `/applicants`, `/people/[id]` with history panels and lifetime totals.
- `2.4` `mergePersons` with audit.
- `2.5` Areas master.

## Phase 3 — Applications core (5 days)

- `3.1` Four-step form with autosave draft.
- `3.2` Case number generation via row-locked `Counter`.
- `3.3` Status transition map + `ApplicationStatusHistory`.
- `3.4` List with URL-synced filters, saved views, footer totals.
- `3.5` Case detail with the five tabs.
- `3.6` Zakat eligibility block + verification gate (no approval without a verified block).
- `3.7` Decision flow (approve / partial / reject / defer / hold) with guards.
- `3.8` Case sheet PDF matching the paper form.

**Demo:** a case goes from walk-in to approved, on screen, in front of the client.

## Phase 4 — Documents (2 days)

- `4.1` Object storage adapter (R2/MinIO), private bucket, 5-minute signed URLs.
- `4.2` Upload with type selection, size/mime validation, EXIF stripping, image downscaling,
  sha256 checksum.
- `4.3` Document checklist gating `SUBMITTED`.
- `4.4` Preview drawer (pdf + image), `FILE_VIEW` / `FILE_DOWNLOAD` audit.

## Phase 5 — Meeting Mode (3 days) — *do not defer this to the end*

- `5.1` `ViewContext` + `resolveMeetingMode()` — global setting + per-account pin + present mode.
  Resolved from the database on every request; nothing read from the client.
- `5.2` `src/lib/redact/*` for Person, Application, Attachment, Payment, search.
- `5.3` Refactor every query into `src/lib/db/queries/*` taking a `ViewContext`; add the lint
  rule forbidding direct `prisma` imports outside that folder.
- `5.4` `PersonCell`, alias chips, `MeetingModeBanner`, locked `AttachmentTile`, and the topbar
  switch rendered for `SUPER_ADMIN` only.
- `5.5` `scrubNames` for free-text fields.
- `5.6` Reveal flow, `SUPER_ADMIN` only: reason + re-auth + 5-minute grant + banner + audit.
- `5.7` Settings → Privacy & meeting mode tab.
- `5.8` The nine tests in `03-privacy-and-access.md §9`.

**Demo:** the chair flips one switch and the committee's screens go anonymous; a reveal is
attempted and shows up in the audit log.

## Phase 6 — Money (4 days)

- `6.1` Funds CRUD, balance computation, negative-balance guard, low-balance thresholds.
  Seed a single active Zakat fund; hide every fund selector while one fund is active.
- `6.2` Payments: record, voucher number, cheque register, cleared/bounced/cancelled, reversal.
- `6.3` Voucher PDF matching Block D of the paper form.
- `6.4` Donors + donations + receipt numbering + receipt PDF (80G block if configured).
- `6.5` Expenses with the `allowsExpenses` guard. **Hold until open question 2 is answered** —
  with Zakat as the only fund there is nothing to charge an expense to.
- `6.6` Bulk "mark cleared" for bank reconciliation.

## Phase 7 — Analytics (3 days)

- `7.1` Dashboard with all five rows.
- `7.2` Hospital detail analytics.
- `7.3` Disease taxonomy analytics.
- `7.4` The eight reports with Excel + PDF export, redaction-aware, export audit.

## Phase 8 — Meetings, polish, launch (4 days)

- `8.1` Meetings CRUD, agenda building, decision recording, meeting lock, minutes PDF.
- `8.2` Present mode (dark, keyboard, forced redaction).
- `8.3` `⌘K` command palette.
- `8.4` Empty states, skeletons, error boundaries, toasts — the full copy pass against
  `04-design-system.md §10`.
- `8.5` Accessibility pass: contrast, focus, keyboard, `aria-label`, reduced motion.
- `8.6` Settings: numbering, documents, appearance, backup, audit log viewer.
- `8.7` Backup cron (`pg_dump` + object versioning), tested restore, runbook in `docs/RUNBOOK.md`.
- `8.8` Deployment, seed production masters, create real users, hand over.

**Total: roughly 28 working days.** Phases 0–5 are the minimum viable system; 6–8 make it the
thing the trust actually asked for.

---

## Working agreement for Claude Code

1. One ticket per session. Start by reading `CLAUDE.md` and the doc for that phase.
2. Schema change → migration in the same commit. Never edit a migration that has been applied.
3. New query → it lives in `src/lib/db/queries/`, takes a `ViewContext`, returns a redacted view
   type. No exceptions, including for admin-only screens.
4. New mutation → server action + zod schema + `assertPermission` + `audit`.
5. New screen → empty state, loading skeleton, error state.
6. Money touched → assert the value is `BigInt` paise at the boundary.
7. Finish with `pnpm typecheck && pnpm lint && pnpm test`, then update the seed so the screen is
   demonstrable.
8. If a requirement is ambiguous, stop and ask. The open questions list in
   `00-project-brief.md §9` is not guessed at.
