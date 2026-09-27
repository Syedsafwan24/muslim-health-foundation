# 02 — Functional Spec

Every module below lists: what the screen does, the rules the server enforces, and the server
actions to implement. Mutations are Next.js **server actions** in
`src/app/(app)/<module>/actions.ts`. Route handlers exist only for file access and exports.

---

## 1. Applications

### 1.1 New application (`/applications/new`)

A four-step form that mirrors the paper form. Steps are a `Stepper`, not separate pages — state
is held by react-hook-form and autosaved as `DRAFT` every 20 seconds.

**Step 1 — Applicant**
- Search-first: a combobox that searches the person registry by name / mobile / person code
  as you type. Picking an existing person fills the block and shows a badge:
  `Known to MHF · 3 previous cases · ₹1,45,000 received`.
- "Add new person" opens inline fields: Name, Father Name, Husband Name, Address, Area,
  Status (marital), Age, Gender, Religion, Mobile.
- On save, run duplicate detection (same mobile, or same normalised name + father name).
  If a match is found, show a non-blocking dialog: "This looks like P-000412 Ahmed Ali.
  Use that record / Create a new one anyway".

**Step 2 — Patient**
- Checkbox **"Patient is the same as the applicant"** at the top. When ticked, Block B collapses
  and `patientIsApplicant = true`.
- Otherwise the same search-first person block, plus `relation` (applicant's relation to the
  patient) and `dependentCount`.

**Step 3 — Case**
- Introduced by (name + phone), Attending doctor, Hospital (combobox with "add new"),
  Disease (cascading: category → disease), Major problem (textarea), Admission/Discharge dates,
  Approx hospital expenses, Requested amount, Priority.
**Step 3b — Zakat eligibility** (mandatory; all aid is Zakat)
- Category (destitute / needy / in debt / stranded traveller / other), monthly income,
  dependents supported, owns a house, owns agricultural land, savings or gold note,
  existing debt, verifier's note.
- "Authorisation received to pay the hospital on the patient's behalf" checkbox, with the signed
  form uploaded in step 4.
- The block is editable by `OPERATOR` but must be marked verified by `GENERAL_SECRETARY` or
  `SUPER_ADMIN`. A case cannot be approved while `eligibilityVerifiedAt` is null — the Approve
  button is disabled with the reason shown.

**Step 4 — Documents**
- Dropzone per document type. Checklist showing required vs optional.
- **Required before `SUBMITTED`:** `GOVT_ID`, `HOSPITAL_BILL` or `HOSPITAL_LETTER`,
  `MHF_APPLICATION_FORM` (scan of the signed paper form), and `AUTHORISATION_FORM` once the
  client confirms they use one (open question 3 — make this checklist entry configurable in
  Settings → Documents rather than hard-coded).
- Optional: discharge summary, prescriptions, lab reports, photo.
- Accepts pdf, jpg, png, heic, webp. Max 15 MB per file, 40 files per case.
  Images > 2500px are downscaled server-side; every upload is stripped of EXIF GPS.

Submit → status `SUBMITTED`, case number generated, printable case sheet available.

### 1.2 Applications list (`/applications`)

Server-paginated `DataTable`. Columns: Case No · Date · Patient (aliased in Meeting Mode) ·
Disease · Hospital · Requested · Approved · Paid · Status · Priority.

Filters, all URL-synced via `nuqs`: status (multi), date range, hospital, disease category,
disease, area, fund, amount range, priority, "has pending documents", "repeat applicant",
created-by, fiscal year. Saved filter presets per user.

Bulk actions for `GENERAL_SECRETARY`: send N cases to a meeting, mark under verification.

### 1.3 Case detail (`/applications/[id]`)

Header: case number, status pill, priority, requested/approved/paid amounts, patient identity
(or alias), quick actions.

Tabs:
1. **Application** — all four blocks, read-only with inline edit for permitted roles.
2. **Documents** — grid of attachments grouped by type, preview drawer, verification tick per
   document (`verifiedBy`, `verifiedAt` in the attachment label metadata for v1).
3. **Decision** — approve / partially approve / reject / defer / hold. Amount field,
   note, meeting link. Approval writes `ApplicationStatusHistory`.
4. **Payments** — payments against the case, "Record payment" button.
5. **History** — merged timeline of status changes and audit entries.

Side panel: **Applicant & patient history** — every previous case for both people, with totals.
This is the repeat-claim signal the committee asks for.

### 1.4 Server actions

```ts
createApplicationDraft(input)            // → { id, caseNo? }
updateApplication(id, input)             // blocked once status ∈ {PAID, CLOSED}
submitApplication(id)                    // validates document checklist
setApplicationStatus(id, status, note)   // guarded transition table
decideApplication(id, { decision, approvedAmountPaise, note, meetingId })
attachToApplication(id, files[])
deleteAttachment(attachmentId)           // soft
reopenApplication(id, reason)            // SUPER_ADMIN only
printCaseSheet(id)                       // returns PDF stream
```

Transition guard lives in `src/lib/applications/transitions.ts` as an explicit map. Any
transition not in the map throws.

---

## 2. People registry

`/patients` and `/applicants` are two filtered views of `Person`, plus `/people/[id]`.

Person page shows: identity block, area, contact, ID (last 4 only), flags, and three panels —
cases as patient, cases as applicant, total aid received (lifetime and this FY).

`watchFlag` shows a persistent amber banner with the note, on the person page and on every case
that person appears in.

Merge duplicates: `mergePersons(keepId, mergeId, reason)` — repoints all applications and
attachments, soft-deletes the merged row, writes an audit entry with both codes. `SUPER_ADMIN`
and `GENERAL_SECRETARY` only.

---

## 3. Hospitals

`/hospitals` list: name, type, city, cases (FY), patients (FY), total paid (FY), pending cheques,
empanelled badge.

`/hospitals/[id]`:
- Stat row: total paid (all time / this FY), case count, distinct patient count, average grant,
  largest single payment, pending cheques.
- Bar chart: monthly amount paid, last 12 months.
- Donut: disease category mix for this hospital.
- Table: all payments to this hospital (voucher, date, case, amount, cheque no, status).
- Table: all cases referred to this hospital.
- Contact card + notes + bank detail (last 4 only).

---

## 4. Diseases

`/diseases` shows the two-level taxonomy with counts: category → diseases, each with patient
count, case count, total paid, average grant.

`/diseases/[id]`:
- Stat row: patients diagnosed, cases, total paid, average grant, chronic flag.
- Line chart: cases per month over 24 months.
- Table: hospitals treating this disease, with counts and amounts.
- Table: cases (masked per Meeting Mode).
- Age-band and gender split (bar chart) — useful for the annual report.

Category management is in Settings → Masters.

---

## 5. Donations

`/donations` — entries table: receipt no, date, donor (or "Anonymous"), fund, amount, mode, ref.
`/donations/donors` — donor registry with lifetime given, last donation, count.
`/donations/donors/[id]` — donor profile, donation history, printable annual statement.

Since all collections are Zakat, the fund selector is hidden while one fund is active and every
donation is booked to it automatically. Keep the field in the form model.

Rules:
- Receipt number generated on save, FY-scoped, never reused; cancelling a donation voids the
  receipt number (it is not reassigned).
- `isAnonymous` donors render as "Anonymous donor" everywhere including exports; their name is
  visible only to `SUPER_ADMIN` and `ACCOUNTANT`.
- Earmarked donations (`earmarkApplicationId`) appear on the linked case as "Funded by donor".
- Receipt PDF: org header, receipt no, date, donor name + address, amount in figures and words
  (Indian numbering), fund name, mode, reference, signature line. 80G block if configured.

Actions: `createDonation`, `updateDonation`, `cancelDonation(id, reason)`, `issueReceipt(id)`,
`createDonor`, `mergeDonors`.

---

## 6. Expenses

`/expenses` — table by category and month, with a category breakdown chart.
**Blocked on open question 2.** Zakat cannot pay the trust's own running costs, and right now
Zakat is the only fund. So the expense screen is built but has no fund to charge until the client
tells us where administrative money comes from. Until then:
- `fund.allowsExpenses` is enforced; the Zakat fund has it set to `false`.
- The expense screen shows an empty state: "No fund is available for expenses yet. Add a
  non-Zakat fund in Settings to record administrative costs."
- Do not ship a workaround that lets an expense be charged to Zakat.

---

## 7. Payments / cheque register

`/payments` — every instrument, filterable by status, bank, mode, date, hospital, fund.

Record payment (from a case, or standalone against a case):
- Amount (cannot exceed `approvedAmount − alreadyPaid` without an override note)
- Fund (balance shown live; blocked if it would go negative)
- Mode; cheque no + bank if `CHEQUE`; reference if electronic
- Payment date, Towards, Payee (hospital or applicant/patient)
- Remark, attachments (cheque copy, hospital receipt)

Status flow: `PENDING → ISSUED → CLEARED`, or `BOUNCED`, or `CANCELLED`.
`markCleared(id, date)`, `markBounced(id, reason)` (creates a follow-up task note on the case),
`cancelPayment(id, reason)` (never deletes; writes a reversal record if already cleared).

Voucher PDF matches Block D of the paper form so it can be filed alongside old records.

---

## 8. Committee meetings

`/meetings` list, `/meetings/[id]`:
- Agenda: cases attached to this meeting, in order, with the decision control on each.
- **Present mode**: full-screen, one case per card, arrow-key navigation, large type,
  Meeting Mode redaction forced ON regardless of the global setting. Built for a projector.
- After the meeting: lock the meeting → decisions immutable, minutes PDF exportable
  (redacted or unredacted, `SUPER_ADMIN` choice, both audited).

---

## 9. Dashboard

Row 1 — four stat cards (this FY, with delta vs last FY): cases received · amount disbursed ·
donations received · people helped.
Row 2 — fund balance cards, one per fund, with a spend bar and a low-balance warning.
Row 3 — line chart: donations vs disbursements by month · donut: disease category mix.
Row 4 — bar: top 8 hospitals by amount · list: pending actions (cases awaiting verification,
cases awaiting committee, cheques uncleared > 30 days, cases missing documents).
Row 5 — recent activity from the audit log, PII-free.

All figures respect the selected fiscal year (a selector in the top bar).

---

## 10. Reports (`/reports`)

Each report: filter panel → table → chart → export (PDF + Excel).

1. **Disbursement register** — every payment in a period, grouped by month.
2. **Hospital-wise summary** — cases, patients, amount, average, per hospital.
3. **Disease-wise summary** — patients, cases, amount, per disease and category.
4. **Area-wise summary** — cases and amount by mohalla/ward.
5. **Donation register** — donations in a period, by fund and by mode.
6. **Fund statement** — opening, inflow, outflow, closing per fund; the reconciliation report.
7. **Beneficiary list** — people helped in a period with amounts (redaction-aware; exporting an
   unredacted beneficiary list requires `SUPER_ADMIN` and is audited).
8. **Annual report pack** — a single PDF combining 1–7 with the org header, for the AGM.

Export rules: Excel via `exceljs`, PDF via `@react-pdf/renderer`, both generated server-side in a
route handler at `/api/export/[report]`. Every export writes an `EXPORT` audit row recording the
report, the filters, the row count, and whether it was redacted.

---

## 11. Notifications (in-app only, v1)

A bell in the top bar backed by a simple `Notification` derivation — no new table in v1, compute
from queries: cases awaiting my action, cheques uncleared > 30 days, funds below threshold,
documents missing on submitted cases.

---

## 12. Search

Global `⌘K` command palette: cases by number, people by name/mobile/code, hospitals, donors,
voucher and receipt numbers. In Meeting Mode, name-based person search is disabled and the
palette says so; code and case-number search still work.
