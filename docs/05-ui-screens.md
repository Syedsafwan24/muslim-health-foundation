# 05 — Screens

Wireframes are structural, not pixel-accurate. Colour and type come from `04-design-system.md`.

---

## Dashboard `/dashboard`

```
Dashboard                                        FY 2026-27 ▾
─────────────────────────────────────────────────────────────────────
┌ Cases received ─┐┌ Disbursed ─────┐┌ Donations ────┐┌ People helped ┐
│ 248             ││ ₹42,80,000     ││ ₹51,20,000    ││ 231           │
│ +18 vs last FY  ││ +₹6.4L         ││ +₹9.1L        ││ 68 repeat     │
└─────────────────┘└────────────────┘└───────────────┘└───────────────┘

┌ Fund balances ─────────────────────────────────────────────────────┐
│ Zakat     ₹8,40,000  ▓▓▓▓▓▓▓▓░░░░  62% committed                   │
│ Sadaqah   ₹3,10,000  ▓▓▓▓▓▓▓▓▓▓▓░  88% committed   ⚠ running low   │
│ General   ₹5,75,000  ▓▓▓▓▓░░░░░░░  41% committed                   │
└────────────────────────────────────────────────────────────────────┘

┌ Donations vs disbursements (12 mo) ─────┐┌ Disease mix ────────────┐
│  line chart, two series                 ││  donut + direct labels  │
└─────────────────────────────────────────┘└─────────────────────────┘

┌ Top hospitals by amount ────────────────┐┌ Needs attention ────────┐
│  horizontal bars, 8 rows                ││ 12 awaiting verification│
│                                         ││  7 awaiting committee   │
│                                         ││  4 cheques uncleared 30d│
│                                         ││  3 cases missing docs   │
└─────────────────────────────────────────┘└─────────────────────────┘

Recent activity — audit feed, PII-free, 10 rows
```

Every "needs attention" row is a link into a pre-filtered list.

---

## Applications list `/applications`

```
Applications                                   [+ New application]
─────────────────────────────────────────────────────────────────────
[Status ▾][Date range ▾][Hospital ▾][Disease ▾][Fund ▾][More ▾]  [⌕]
Saved views:  All open · Awaiting committee · Paid this month · Mine
─────────────────────────────────────────────────────────────────────
Case no          Date     Patient        Disease      Hospital   Requested  Approved  Status
MHF/2026-27/…123 12 Oct   Ahmed Ali      Dialysis     Manipal    ₹1,20,000  ₹80,000   Paid
MHF/2026-27/…124 12 Oct   P-000418 ▣     Cardiac      KMC        ₹3,40,000  —         Committee review
                          ↑ alias chip in Meeting Mode
─────────────────────────────────────────────────────────────────────
248 cases · ₹42.8L requested · ₹31.2L approved        ‹ 1 2 3 … 13 ›
```

Footer totals reflect the active filters. Row click opens the case; ⌘-click opens in a new tab.

---

## New application `/applications/new`

```
New application                                    Draft saved 10:42
─────────────────────────────────────────────────────────────────────
 ①Applicant ── ②Patient ── ③Case ── ④Eligibility ── ⑤Documents
─────────────────────────────────────────────────────────────────────
┌ Applicant ─────────────────────────────────────────────────────────┐
│ Search existing person                                             │
│ [⌕ name, mobile or person code…                                  ] │
│ ┌ P-000412 · Ahmed Ali · 98xxxxxx12 ──────────────────────────────┐│
│ │ Known to MHF · 3 previous cases · ₹1,45,000 received   [Select] ││
│ └─────────────────────────────────────────────────────────────────┘│
│ ─── or add a new person ───────────────────────────────────────────│
│ Name of the applicant            Father name                       │
│ [                            ]   [                            ]    │
│ Husband name                     Mobile no.                        │
│ [                            ]   [                            ]    │
│ Address                                              Area ▾        │
│ [                                                  ] [          ]  │
│ Status ▾        Age [  ]   Gender ▾        Religion ▾              │
└────────────────────────────────────────────────────────────────────┘
                                          [Save draft]  [Next: Patient]
```

Step 2 opens with the checkbox **"Patient is the same as the applicant"**, ticked by default when
the relation is self. Step 4 shows the document checklist with required types marked, and the
Submit button stays disabled with a tooltip naming what is missing.

---

## Case detail `/applications/[id]`

```
‹ Applications
MHF/2026-27/00123                                 [Reveal identity ▣]
Committee review · Urgent                    [Approve] [Reject] [⋯]
─────────────────────────────────────────────────────────────────────
┌ Requested ─────┐┌ Approved ──────┐┌ Paid ──────────┐┌ Disease ────┐
│ ₹1,20,000      ││ ₹80,000        ││ ₹80,000        ││ Dialysis    │
└────────────────┘└────────────────┘└────────────────┘└─────────────┘

 Application | Documents | Decision | Payments | History
─────────────────────────────────────────────────────────────────────
┌ Applicant ───────────────┐  ┌ Prior aid ──────────────────────────┐
│ Ahmed Ali                │  │ Applicant P-000412                  │
│ s/o Ibrahim Ali          │  │  3 cases · ₹1,45,000 · last Mar 2026│
│ Tengingundi, Bhatkal     │  │ Patient  P-000419                   │
│ 47 · Male · Married      │  │  1 case · ₹35,000 · Jan 2026        │
│ 98xxxxxx12               │  │ ⚠ 3rd application this year         │
└──────────────────────────┘  └─────────────────────────────────────┘
┌ Patient ─────────────────┐  ┌ Documents ──────────────────────────┐
│ …                        │  │ ✓ Govt ID   ✓ Hospital bill         │
└──────────────────────────┘  │ ✓ MHF form  ○ Discharge summary     │
┌ Case ────────────────────┐  └─────────────────────────────────────┘
│ Hospital · Doctor        │
│ Major problem (text)     │
│ Approx expense           │
└──────────────────────────┘
```

Under Meeting Mode the applicant and patient panels render as:

```
┌ Patient ─────────────────────────────┐
│ ▣ P-000419                           │   ← mono code, redacted hue
│ Female · 45–54 · Married             │
│ Identity hidden for this meeting     │
└──────────────────────────────────────┘
```

and the Documents tab shows locked tiles:

```
┌──────────┐ ┌──────────┐ ┌──────────┐
│    ▣     │ │    ▣     │ │    ▣     │
│ Govt ID  │ │ Hospital │ │ MHF form │
│ 1 page   │ │ bill·3pp │ │ 2 pages  │
│ Locked   │ │ Locked   │ │ Locked   │
└──────────┘ └──────────┘ └──────────┘
```

No thumbnail is generated, no signed URL is issued, and the tiles are not clickable.

---

## Meeting present mode `/meetings/[id]/present`

Full screen, dark theme, no sidebar, keyboard driven (`←` `→` cases, `A` approve, `R` reject,
`D` defer, `Esc` exit).

```
        Committee meeting · 12 October 2026            Case 4 of 17
 ─────────────────────────────────────────────────────────────────
        MHF/2026-27/00124

        ₹3,40,000  requested
        approx hospital expense ₹4,10,000

        Patient   ▣ P-000418 · Female · 45–54 · Married
        Applicant ▣ P-000412 · relation: son · 4 dependents
        Disease   Cardiac — valve replacement
        Hospital  KMC Mangalore (private)
        Admitted  04 Oct 2026

        Prior aid  1 previous case · ₹35,000 · Jan 2026
        Documents  Govt ID · Hospital bill · MHF form ✓ complete
        Eligibility  Needy · income ₹9,000/mo · 4 dependents · verified

 ─────────────────────────────────────────────────────────────────
 [Approve] [Partially approve] [Defer] [Reject]     ▣ Identities hidden
```

---

## Hospital detail `/hospitals/[id]`

Stat row (total paid / cases / patients / average grant / pending cheques), 12-month bar chart,
disease-mix donut, payments table, cases table, contact sheet.

## Disease detail `/diseases/[id]`

Stat row (patients / cases / total paid / average grant), cases-per-month line, hospital table,
age-band + gender bars, cases table.

## Donations `/donations`

Tabs: Entries · Donors · Funds. Entries table with receipt no, date, donor, fund, amount, mode.
Donor page shows lifetime total, donation history, annual statement button.

## Payments `/payments`

Cheque register grouped by status. Bulk "mark cleared" with a date, for reconciling a bank
statement. Bounced payments surface on the linked case as a red banner.

## Reports `/reports`

Left rail listing the eight reports; right pane is filters → table → chart → two export buttons.
Export buttons are disabled with an explanation for roles without export rights.

---

## Settings `/settings`

Tabbed. `SUPER_ADMIN` sees all tabs; `GENERAL_SECRETARY` sees them read-only.

### Organisation
Name, registration number, 80G number, address, phone, email, logo upload, letterhead
for PDFs, fiscal year start, currency display, default language.

### Privacy & meeting mode  ← the tab the client asked for

```
Privacy and meeting mode
─────────────────────────────────────────────────────────────────────
Meeting mode hides the identity of patients and applicants so cases can
be discussed on their facts. Case numbers, person codes, medical and
financial details stay visible.

  Hide identities for everyone                           [  ⦿ ]
  Applies to every user, including you, until you turn it off.
  Currently: off · last turned on 12 Oct 10:04 by Imran

  Present view is always hidden                          [ ⦿ ]  locked
  The full-screen meeting view can never show identities.

─────────────────────────────────────────────────────────────────────
Accounts that always see hidden identities                      [+]
  Use this when someone needs to browse the system without seeing who
  the cases are.

  Yusuf Kola · Committee member                  always hidden   [×]
  Audit visitor · Viewer                         always hidden   [×]

─────────────────────────────────────────────────────────────────────
Hidden fields                                            [Edit]
  Name · Father name · Husband name · Address · Area · Mobile ·
  Religion · ID number · Exact age · Photo · Attachments ·
  Introduced by · Attending doctor
  Exact age is replaced by an age band. Person codes stay visible.

─────────────────────────────────────────────────────────────────────
Revealing one identity
  Only you, as super admin, can reveal an identity. This cannot be
  granted to another role.

  Require a written reason                               [ ⦿ ]  locked
  Require password re-entry                              [ ⦿ ]  locked
  Reveal expires after                       [ 5 minutes ▾ ]

  Recent reveals                                    [View audit log]
  12 Oct 10:41 · Imran · MHF/2026-27/00124 · "verifying duplicate claim"
```

The switch also appears in the top bar, for the super admin only. Every other user sees the
banner but has no control.

### Users & roles
User list with role, status, last login, per-user "always use meeting mode" switch, reset
password, deactivate. Role capabilities shown read-only from the permission map.

### Funds
Fund list, opening balances, restricted/expense flags, low-balance threshold per fund.
Ships with one active fund: **Zakat**. While only one fund is active, every fund selector in the
app is hidden and the fund is applied automatically — the tab explains this in one line rather
than showing a single-option dropdown elsewhere.

### Masters
Disease categories and diseases · Hospitals · Banks · Areas/mohallas · Attachment types required
on submit · Priority labels. Each is a simple CRUD table with soft delete and usage counts
(a master in use cannot be deleted, only deactivated).

### Numbering
Prefix and format for case numbers, voucher numbers, receipt numbers, person codes and donor
codes. Preview of the next number for each. Locked once the first record of the FY exists.

### Documents
Max file size, allowed types, required checklist per case, retention note, EXIF stripping
(on, not editable).

### Backup & data
Last backup time, download an encrypted backup, restore instructions, export the audit log,
danger zone (reset demo data — non-production only).

### Audit log
Filterable table: actor, action, entity, case number, date range. Reveal actions highlighted.
Export to Excel for `SUPER_ADMIN`.

### Appearance
Theme (light / dark / system), density (comfortable / compact).
