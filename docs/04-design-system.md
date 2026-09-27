# 04 — Design System

## 1. Design direction

**Subject:** a trust's medical-aid ledger, used by a clerk doing fast data entry, an
accountant reconciling cheques, and a committee of elders reviewing cases on a projector.

**Primary job:** make numbers and status unmistakable, make identity easy to conceal, and make
long data-entry sessions feel calm.

**The motif is a ledger sheet, not a card deck.** Content sits on white sheets with a hairline
cool-grey border and a 2px top rule whose colour carries meaning (status, fund, semantic
outcome). Elevation is used almost never — the interface is paper on a desk, not floating glass.
That top rule is the one recurring decorative device, and it is decorative only in the sense that
it is also informative. The boldness of the interface is spent in exactly one place: the
**amount** — large, tabular, weighted, with its label small and quiet beneath. Everything else
stays disciplined.

The palette is taken from MHF's own seal (navy and white) and extended with the minimum number
of semantic hues. No gradients, no tinted glass, no colour used for decoration.

Anti-goals, stated so they are not drifted into: cream backgrounds, terracotta accents, identical
rounded cards with the same grey shadow, ALL-CAPS eyebrow labels above every heading, arrows
appended to button text, numbered `01/02/03` markers on anything that is not a real sequence.

---

## 2. Colour

### Base palette

| Name | Hex | Use |
|---|---|---|
| Seal navy | `#1B2A5B` | brand, primary actions, sidebar, table headers |
| Ink | `#16213D` | body text, headings |
| Slate | `#5A6683` | secondary text, labels, icons |
| Rule | `#D7DCE7` | borders, dividers, table rules |
| Paper | `#EEF1F6` | app canvas |
| Sheet | `#FFFFFF` | content surfaces, inputs |

### Semantic

| Name | Hex | Meaning |
|---|---|---|
| Approved / money out | `#0E7A5F` | approved, paid, cleared, positive balance |
| Pending | `#A86A0B` | awaiting verification, awaiting committee, uncleared cheque |
| Rejected / alert | `#A4232C` | rejected, bounced, overdrawn fund, destructive |
| Information | `#2B5FA8` | neutral notices, links |
| Redacted | `#4A3E86` | every Meeting Mode affordance — aliases, locked documents, the mode banner |

Redaction gets its own hue on purpose. A user must be able to tell at a glance, across a room,
that what they are looking at is masked.

### Fund colours (charts and fund cards only)

Zakat `#8A6A1F` · Sadaqah `#0E7A5F` · General `#1B2A5B` · additional funds cycle through the
chart ramp.

### Chart ramp (categorical, colour-blind safe, 8 steps)

`#1B2A5B · #0E7A5F · #A86A0B · #4A3E86 · #2B5FA8 · #8A6A1F · #6E4A6B · #4C6B5A`

Never encode meaning in colour alone — every status also carries a label, and every chart series
carries a direct label or a legend with a pattern distinction.

### CSS variables (Tailwind v4, `src/app/globals.css`)

```css
@theme {
  --color-navy-50:  #F2F4FA;
  --color-navy-100: #E2E7F3;
  --color-navy-200: #C3CCE6;
  --color-navy-400: #6C7DAE;
  --color-navy-600: #2B3D74;
  --color-navy-700: #1B2A5B;   /* seal navy */
  --color-navy-900: #16213D;   /* ink */

  --color-slate-body: #5A6683;
  --color-rule:       #D7DCE7;
  --color-paper:      #EEF1F6;
  --color-sheet:      #FFFFFF;

  --color-approved:   #0E7A5F;
  --color-approved-bg:#E6F2EE;
  --color-pending:    #A86A0B;
  --color-pending-bg: #FBF1E0;
  --color-rejected:   #A4232C;
  --color-rejected-bg:#F8E8E9;
  --color-info:       #2B5FA8;
  --color-info-bg:    #E8EFF8;
  --color-redacted:   #4A3E86;
  --color-redacted-bg:#EEEBF7;

  --radius-badge: 4px;
  --radius-control: 6px;
  --radius-sheet: 10px;

  --shadow-sheet: 0 1px 2px rgba(22,33,61,.06);
  --shadow-pop:   0 8px 24px -8px rgba(22,33,61,.18);
}
```

shadcn's generated `--background/--foreground/--primary/...` variables map onto these. Do not
leave the default zinc/slate values in place — a review will reject it.

### Dark / Present mode

Only the meeting **Present mode** and the optional night theme use dark. Canvas `#0F1730`,
sheet `#16213D`, rule `#2B3A63`, text `#E7EBF5`, secondary `#9AA6C4`. Semantic hues lighten:
approved `#3FB28D`, pending `#E0A44A`, rejected `#E0707A`, redacted `#9A8BE0`.

---

## 3. Typography

| Role | Family | Why |
|---|---|---|
| Interface + body | **IBM Plex Sans** | true tabular figures, institutional without being cold, excellent at 13–15px, and a real bureaucratic-document lineage that suits a trust's register |
| Identifiers and money columns | **IBM Plex Mono** | case numbers, cheque numbers, voucher numbers, person codes and right-aligned amount columns only. Never for labels or body copy. |

Self-host both as woff2 in `public/fonts`. No runtime Google Fonts request.

### Scale

| Token | Size / line-height | Weight | Use |
|---|---|---|---|
| `display` | 36 / 40 | 600 | the amount on a case header, dashboard hero figures |
| `h1` | 24 / 32 | 600 | page title |
| `h2` | 19 / 28 | 600 | section title |
| `h3` | 16 / 24 | 600 | sheet title, dialog title |
| `body` | 15 / 24 | 400 | prose, form values |
| `ui` | 14 / 20 | 400/500 | table cells, inputs, buttons, nav |
| `label` | 13 / 18 | 500 | field labels, in sentence case |
| `caption` | 12 / 16 | 400 | helper text, timestamps, axis labels |
| `mono-sm` | 13 / 18 | 450 | case numbers, codes |
| `amount` | 15 / 20 | 500, tabular | money in tables, right-aligned |

Rules:
- `font-variant-numeric: tabular-nums` on every numeric column, amount and date.
- Labels are sentence case. **No ALL-CAPS labels anywhere**, including table headers.
- The interface is English only. No second script, no RTL, no language switcher.
- Prose max width 68 characters.
- One weight jump per hierarchy level — do not bold a single word inside a heading for emphasis.

---

## 4. Spacing, radius, elevation

4px base. Allowed: 4, 8, 12, 16, 20, 24, 32, 40, 56, 72.

| Element | Radius |
|---|---|
| Badge, status pill | 4px |
| Button, input, select, tab | 6px |
| Sheet, dialog, popover | 10px |
| Avatar / person code chip | full |

Elevation: `--shadow-sheet` on sheets (barely visible, it only separates white from white),
`--shadow-pop` on popovers/dialogs/dropdowns. There is no third level.

Density: a user-level setting `comfortable` (default, 44px rows) / `compact` (36px rows) applied
as a `data-density` attribute on `<html>`. Clerks doing bulk entry will use compact.

---

## 5. Layout

```
┌──────────────┬────────────────────────────────────────────────────────┐
│              │  Topbar 56px  [FY ▾] [⌘K search] [Meeting mode ⦿] [🔔] │
│  Sidebar     ├────────────────────────────────────────────────────────┤
│  264px       │  Page header: title · meta · primary action            │
│  (collapse   │  ──────────────────────────────────────────────────    │
│   → 68px)    │  Content, max-width 1440, gutter 32 (24 under 1024)    │
│              │                                                        │
└──────────────┴────────────────────────────────────────────────────────┘
```

Grid: 12 columns, 24px gutter. Case detail is 8 + 4 (main + history rail), collapsing to a
single column under 1280. Forms are a 2-column field grid at ≥1024, single column below.

Breakpoints: 640 / 768 / 1024 / 1280 / 1536. The app targets desktop first (office PCs) and must
remain usable on a 10" tablet; below 768 tables switch to stacked record rows.

---

## 6. The sidebar

Fixed, `--color-navy-700` background, white text at 90% opacity, active item on
`rgba(255,255,255,.10)` with a 3px left rule in white. Grouped with quiet dividers, group labels
in `caption` at 60% opacity in sentence case.

```
MHF  ▸ Bhatkal                        ← seal mark + org name, 64px block

  Dashboard
  Applications            (badge: count awaiting action)
  Patients
  Applicants

  Money
    Payments              (badge: uncleared)
    Donations
    Expenses
    Funds

  Records
    Hospitals
    Diseases
    Meetings
    Reports

  ────────────────────────
  Settings
  <user chip>             ← name, role, sign out
```

Component: `src/components/app/app-sidebar.tsx` built on shadcn `Sidebar` (`sidebar-07` pattern),
collapsible to icons, state persisted in a cookie, `⌘B` toggles. Every item has a lucide icon;
in collapsed mode a tooltip shows the label. Badges are counts only, never dots.

---

## 7. shadcn components to install

```
button input textarea select checkbox radio-group switch label form
table dropdown-menu dialog alert-dialog sheet popover command tooltip
tabs badge avatar separator skeleton sonner calendar date-picker
breadcrumb pagination progress scroll-area sidebar collapsible accordion
alert card chart hover-card toggle toggle-group
```

Generated files in `src/components/ui/` are not hand-edited. Project-specific variants go in
`src/components/app/`:

| Component | Behaviour |
|---|---|
| `MoneyInput` | Indian grouping as you type (1,25,000), stores paise, `₹` prefix |
| `MoneyText` | right-aligned, tabular, `₹` symbol, negative in `rejected` |
| `StatusBadge` | the 12 application statuses, each with a fixed colour + label |
| `CaseNoLink` | mono, copy-on-click |
| `PersonCell` | renders name **or** the alias chip, depending on `ViewContext` — the single place identity is rendered |
| `SheetPanel` | the ledger sheet with the semantic 2px top rule |
| `StatCard` | big tabular figure, small label beneath, optional delta |
| `FundBar` | fund balance with spend proportion |
| `AttachmentTile` | preview tile, or the locked state under Meeting Mode |
| `MeetingModeBanner` | sticky banner in `redacted` colour |
| `DataTable` | TanStack + shadcn, URL-synced sort/filter/page, sticky header, column visibility |
| `EmptyState` | icon, one sentence, one action |

### Status colours

| Status | Colour |
|---|---|
| Draft | slate |
| Submitted, Under verification, Committee review, Deferred | pending |
| On hold | pending, outlined |
| Approved, Partially approved, Payment pending | info |
| Paid, Closed | approved |
| Rejected | rejected |

Payment: Pending/Issued → pending · Cleared → approved · Bounced/Cancelled → rejected.

---

## 8. Motion

- Transitions only on state change: 120ms ease-out for hover/focus, 180ms for popovers and
  sheets, 240ms for the sidebar collapse.
- One orchestrated moment only: the Present-mode case card cross-fades (200ms) when moving
  between cases. Nothing else animates on load. No scroll-triggered reveals. No animated numbers.
- `@media (prefers-reduced-motion: reduce)` disables all of it.

## 9. Accessibility floor

WCAG 2.1 AA. Contrast ≥ 4.5:1 for text (verify seal navy on paper and every badge pair).
Visible focus: 2px `--color-info` ring with 2px offset, never removed. Full keyboard operation
including the data table and the stepper. Every icon-only button has an `aria-label`. Live
regions announce save/approve/payment results. Touch targets ≥ 40px in comfortable density.

## 10. Writing rules

- Sentence case everywhere, including buttons and table headers.
- Buttons name the outcome: "Approve case", "Record payment", "Issue receipt" — never "Submit",
  never "OK", never an arrow glyph appended to the text.
- The same verb through the whole flow: the button says "Approve case", the toast says
  "Case approved", the history says "Approved by Imran".
- Errors say what happened and what to do: "Zakat fund has ₹12,400 left. Reduce the amount or
  choose another fund." Not "Insufficient balance."
- Empty states invite the next action: "No cases yet this year. Record the first application."
- Never print an identity in a toast, a URL, or an error. Use the case number.
- Avoid clinical jargon in the interface. "Patient" and "applicant" are the only role words.
