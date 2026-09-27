# CLAUDE.md — Muslim Health Foundation (MHF) Aid Management System

Read this file first. Then read `docs/` in order. Do not start coding until you have read
`docs/00-project-brief.md`, `docs/01-data-model.md` and `docs/03-privacy-and-access.md`.

---

## 1. What this is

A web app that replaces the paper application form used by **Muslim Health Foundation, Jamat
Complex, 1st Floor, N.H.66, Near Noor Masjid, Bhatkal – 581 320**.

MHF is a charitable trust. People from Bhatkal and surrounding areas come to the office and
apply for financial help with medical bills for themselves or a relative. A committee reviews
the case, approves an amount, and a cheque/transfer is issued — usually directly to the
hospital. The money comes from donations (Zakat, Sadaqah, general funds).

The app digitises: the application, the decision, the payment, the documents, the donors, the
expenses, and every report the trustees currently produce by hand.

## 2. Stack (fixed — do not substitute)

| Layer | Choice |
|---|---|
| Framework | Next.js 15 (App Router), TypeScript strict |
| UI | Tailwind CSS v4 + shadcn/ui (Radix primitives) |
| Icons | lucide-react |
| Forms | react-hook-form + zod resolver |
| Tables | TanStack Table v8 wrapped in shadcn `DataTable` |
| Charts | Recharts |
| DB | PostgreSQL 16 |
| ORM | Prisma |
| Auth | Auth.js (NextAuth v5) — credentials provider, bcrypt, JWT session carrying `role` |
| Files | S3-compatible object storage (Cloudflare R2 / MinIO), private bucket, short-lived signed URLs |
| PDF | `@react-pdf/renderer` for vouchers, receipts, case sheets |
| Dates | `date-fns` + `date-fns-tz`, app timezone `Asia/Kolkata` |
| Money | integer **paise** in DB (`BigInt`), formatted at the edge. Never use `float` for money. |
| Validation | one zod schema per entity in `src/lib/validators/`, shared by client and server |
| State | server components by default; `useState`/`nuqs` for URL-driven table state |

## 3. Non-negotiable rules

1. **Money is `BigInt` paise.** `₹1,25,000.50` → `12500050`. Format with
   `Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' })`.
2. **Meeting Mode redaction happens on the server.** Never send an identity field to the browser
   and hide it with CSS, `hidden`, or client-side `blur`. If the API would leak it, the feature is
   broken. See `docs/03-privacy-and-access.md`.
3. **Nothing is hard deleted.** Every table has `deletedAt`. Deletes are soft. Payments and
   donations are never edited after being marked cleared — they are reversed with a counter-entry.
4. **Every mutation writes an `AuditLog` row.** No exceptions.
5. **English only.** The interface is English throughout — no Urdu labels, no RTL, no language
   switcher. Field names follow the paper form's English wording so a clerk recognises them.
6. **No PII in logs, URLs, or error messages.** Use the case number, never the patient name.
7. **Attachments are private.** Never a public URL. Always a signed URL, 5-minute TTL, issued by
   a server action that checks role + Meeting Mode + writes an audit row.
8. **Fiscal year is Indian:** 1 April – 31 March. Case numbers and reports are FY-scoped.
9. Follow `docs/04-design-system.md` for every colour, font size, radius and spacing value.
   Do not invent tokens. Do not use default shadcn slate/zinc palettes.
10. Run `pnpm typecheck && pnpm lint` before declaring any task done.

## 4. Repo layout

```
src/
  app/
    (auth)/login/
    (app)/
      dashboard/
      applications/          # list, [id], new
      patients/              # person registry — patient view
      applicants/            # person registry — applicant view
      hospitals/             # list, [id] with bills + patient count
      diseases/              # categories + disease-wise counts
      donations/             # donors, donations, receipts
      expenses/
      payments/              # cheque register
      meetings/              # committee sessions
      reports/
      settings/              # general, funds, users, roles, meeting mode, masters, backup
    api/
      files/[id]/route.ts    # signed-URL redirect
      export/[report]/route.ts
  components/
    ui/                      # shadcn generated — do not hand-edit
    app/                     # AppSidebar, Topbar, MeetingModeSwitch, CaseCard, MoneyInput...
  lib/
    auth/  db/  redact/  money/  fy/  audit/  storage/  validators/
prisma/
docs/
```

## 5. Definition of done for any feature

- zod schema + Prisma model + migration
- server action with `assertPermission()` and `audit()` calls
- redaction applied in the data-access layer, verified by a test with `meetingMode: true`
- Keyboard accessible, works at 1280px and on a 10" tablet
- empty state, loading skeleton, and error state written per the copy rules in the design system
- seed data updated so the screen is demonstrable

## 6. Open questions

See the bottom of `docs/00-project-brief.md`. Do not guess on those — ask.
