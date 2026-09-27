# 00 — Project Brief

## 1. The organisation

Muslim Health Foundation (MHF), Bhatkal, Karnataka. A charitable trust that pays medical bills
for people from Bhatkal and surrounding areas who cannot afford treatment.

Today everything is on paper: a pre-printed application form, a ledger
of cheques issued, a donation book, and files of photocopied documents. There is no way to
answer questions like "how much did we pay to Manipal Hospital this year", "how many dialysis
cases did we fund", "has this applicant come to us before", or "how much Zakat money is left".

## 2. What the software must do

1. Capture the application exactly as the paper form does — applicant block, patient block,
   case block, payment block.
2. Track a case from walk-in to cheque cleared.
3. Hold every supporting document against the case.
4. Keep a permanent registry of people, so repeat applicants and repeat patients are recognised.
5. Track money in: donors and donations, split by fund (Zakat / Sadaqah / General).
6. Track money out: patient disbursements and the trust's own running expenses.
7. Produce hospital-wise, disease-wise, area-wise, fund-wise and period-wise reports.
8. Let the committee review cases on a screen **without seeing who the person is** — Meeting Mode.

## 3. The paper form, field by field

The printed form has four blocks. The app mirrors them so a clerk who knows the paper form can
use the screen without training.

**Block A — Applicant** (the person who walks in and asks)
Name of the Applicant · Father Name · Husband Name · Applicant Address · Status · Age · Gender ·
Religion · Mobile No.

**Block B — Patient** (may be the same person)
Name of the Patient · Father Name · Husband Name · Patient Address · Status · Age · Gender ·
Religion · Mobile No. · Dependent

**Block C — Case**
Applicant Relation with Patient · Introduced by · Attending Dr. · Major Problem of the Patient ·
Approx Hospital Expenses · Name of the Hospital · Signature App/PT

**Block D — Payment** (filled after approval)
Cheque · INR · Bank · Payment Date · Mode of Transfer · Towards · Name of the Hospital · Remark ·
Signature App/PT · Signature of General Secretary

Notes:
- "Status" on the paper form means **marital status** (married / unmarried / widow / divorced).
  Confirm — see open questions.
- Applicant and patient are often the same person. The form must have a **"Patient is the same
  as applicant"** checkbox that copies Block A into Block B.
- "Religion" is on the form and must be storable, but it is sensitive. It is never shown on
  dashboards, never used as a report dimension, and is hidden entirely in Meeting Mode.

## 4. Actors and roles

| Role | Who | Can do |
|---|---|---|
| `SUPER_ADMIN` | IT owner / one trustee | everything, including users, settings, Meeting Mode policy, reveal-identity, restore deleted records |
| `GENERAL_SECRETARY` | signs cheques | approve/reject cases, authorise payments, all reports |
| `COMMITTEE_MEMBER` | trustees who meet and decide | read cases (Meeting Mode forced by default), vote/record decision, no exports |
| `OPERATOR` | office clerk, data entry | create/edit applications, upload documents, register people, no approvals, no money |
| `ACCOUNTANT` | keeps the books | payments, donations, expenses, funds, financial reports; case clinical detail read-only |
| `VIEWER` | auditor | read-only, masked by default, no exports |

## 5. Case lifecycle

```
DRAFT ──► SUBMITTED ──► UNDER_VERIFICATION ──► COMMITTEE_REVIEW ──┬─► APPROVED ──► PAYMENT_PENDING ──► PAID ──► CLOSED
                                │                                 ├─► PARTIALLY_APPROVED ──► PAYMENT_PENDING ──► ...
                                │                                 ├─► REJECTED ──► CLOSED
                                ▼                                 └─► DEFERRED ──► COMMITTEE_REVIEW
                        ON_HOLD (missing documents)
```

Rules:
- `SUBMITTED` requires the mandatory document checklist to be complete (see `02`).
- Only `GENERAL_SECRETARY` or `SUPER_ADMIN` may move a case out of `COMMITTEE_REVIEW`.
- `PARTIALLY_APPROVED` means `approvedAmount < requestedAmount`; a reason is mandatory.
- A case can have **multiple payments** (part payments, or one to the hospital and one to the
  pharmacy). `PAID` when `sum(payments where status != CANCELLED) >= approvedAmount`.
- `CLOSED` freezes the case. Reopening is a `SUPER_ADMIN` action and is audited.

## 6. Modules

1. **Dashboard** — this FY at a glance: cases by status, disbursed vs donated, fund balances,
   pending cheques, top hospitals, disease mix, recent activity.
2. **Applications** — the core. List with filters, case detail with tabs (Application, Documents,
   Decision, Payments, History).
3. **People registry** — one table for every human, viewed as "Applicants" or "Patients".
   Duplicate detection on mobile + name + father name. Lifetime aid received per person.
4. **Hospitals** — master + per-hospital page: total paid, patient count, case count, average
   bill, disease mix, pending cheques, contact person.
5. **Diseases** — two-level taxonomy (category → disease). Per-disease page: patient count,
   total paid, average grant, hospital spread.
6. **Donations** — donor registry, donation entries, fund allocation, printable receipts.
7. **Expenses** — the trust's own costs (rent, stationery, staff, events), fund-charged.
8. **Payments / Cheque register** — every instrument issued, its clearing status, bounce handling.
9. **Meetings** — a committee session: agenda of cases, decisions recorded, minutes exported.
10. **Reports** — the eight reports listed in `02`.
11. **Settings** — organisation, funds, masters, users, Meeting Mode policy, backup, audit log.

## 7. Money model (important)

**Confirmed by the client: all aid MHF disburses is Zakat.** That is a constraint, not a
preference, and it drives three requirements.

**(a) Eligibility is mandatory, not a flag.** Because every rupee paid out is Zakat, every case
must be assessed against Zakat eligibility before approval. The application carries an
eligibility block (see `01-data-model.md` → `Application`), and a case cannot reach `APPROVED`
with that block empty. This replaces the optional `zakatEligible` boolean.

**(b) Zakat cannot pay the trust's own running costs.** Office rent, stationery, bank charges and
staff cannot be charged to Zakat money. So either the trust has a separate non-Zakat pool for
administration, or the trustees bear those costs personally. We must know which — see open
question 2. Until then the Expense module is built against a second fund that is seeded but
empty.

**(c) Paying the hospital directly needs an authorisation trail.** Zakat classically requires
transfer of ownership to the eligible recipient. Trusts normally handle this by taking the
applicant's authorisation to act on their behalf, then paying the hospital. The application
therefore captures an authorisation checkbox plus the signed form as an attachment. The exact
wording is for their scholar or trustees to decide — see open question 3.

**Fund mechanics.** The `Fund` table stays, seeded with a single active `ZAKAT` fund. While only
one fund is active the fund selector is hidden throughout the UI and the fund is applied
automatically — the client should never see a dropdown with one option. The structure remains so
that Sadaqah or a general fund can be switched on later without a migration.

Fund balance = `opening + Σ donations − Σ payments(status ≠ CANCELLED) − Σ expenses`.
Block a payment that would push a fund negative; warn below 10% of the FY inflow.

## 8. Out of scope for v1

Offline mode · mobile app · SMS/WhatsApp gateway · online donation payment gateway ·
hospital API integrations · Tally/accounting export · applicant self-service portal.
Design the schema so these can be added later; do not build them.

## 9. Open questions — ask the client before building these

1. **"Status" field** — is it marital status? What are the exact allowed values in their words?
2. **Who pays the office costs?** Zakat cannot fund rent, stationery, bank charges or staff.
   Is there a separate non-Zakat pool, do trustees cover it personally, or are there no
   administrative expenses recorded at all? This decides whether the Expense module ships in v1.
3. **Authorisation to pay the hospital** — does the applicant sign anything authorising MHF to
   pay the hospital on their behalf? If yes, we add it to the document checklist. If the
   trustees have a standing ruling on this, we should record it in the app's help text.
4. **Zakat eligibility criteria** — which of these does the committee actually assess, and in
   what words: monthly income, number of dependents, land or house owned, gold/savings held,
   existing debt, whether the applicant is a Muslim, widow/orphan status? The eligibility block
   is built from this list, so it should come from them, not from us.
5. **Donation receipts** — is the trust 80G registered? If yes we must print the registration
   number, donor PAN, and a serial receipt number on every receipt. Note that 80G and Zakat
   collection are independent questions.
6. **Case number format** — proposed `MHF/2026-27/00123`. Do they already use a register number
   that must be preserved for old records?
7. **Historical data** — is there an existing Excel/register to import, and how far back?
8. **Approval limits** — can the General Secretary approve up to some amount alone, with larger
   amounts needing the full committee? What is the threshold?
9. **Payment to whom** — is the cheque normally in the hospital's name, or the applicant's?
   Both appear on the form ("Towards").
10. **Area/ward list** — we want an "area / mohalla" master for Bhatkal so reporting can show
   which localities are being served. Can they supply the list?
11. **Users** — how many staff, and which of them are in which role on day one?
12. **Language** — answered: English only. No Urdu labels and no language switcher.
13. **Meeting Mode** — answered: one switch controlled by the super admin, no role-based
    masking, reveal restricted to the super admin. Nothing further needed here.
14. **Hosting** — office server on the local network, or a cloud VPS with internet access?
    This decides backup strategy and whether we need VPN/IP allow-listing.
