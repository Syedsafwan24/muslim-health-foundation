# 03 — Privacy, Meeting Mode and Access Control

This is the most sensitive part of the product. Read it fully before writing any data-access code.

## 1. Why Meeting Mode exists

The committee meets to decide who gets money. Bhatkal is a small town — a trustee will often
recognise the family being discussed, and that recognition biases the decision and embarrasses
the family. The trustees asked for a mode where a case can be reviewed and voted on **without
anyone in the room seeing who the person is**, while everything needed to judge the case stays
visible.

Meeting Mode is therefore a *dignity* feature, not a security feature. But it must be built like
a security feature, because if the name is in the JSON payload someone will find it.

## 2. The rule that governs the implementation

> **Redaction happens on the server, in the data-access layer, before serialisation.**

Never send an identity field to the client and hide it with CSS, `display:none`, a blur filter,
or conditional rendering. If a redacted response is inspected in the network tab, the identity
fields must simply not be there.

Practical shape:

```ts
// src/lib/redact/index.ts
export type ViewContext = {
  userId: string;
  role: Role;
  meetingMode: boolean;      // resolved by resolveMeetingMode(), never trusted from the client
};

export function redactPerson(p: Person, ctx: ViewContext): PersonView {
  if (!ctx.meetingMode) return toPersonView(p);
  return {
    id: p.id,
    personCode: p.personCode,          // P-000412 — the alias people speak aloud
    displayName: `Patient ${p.personCode}`,
    gender: p.gender,
    ageBand: toAgeBand(p.ageYears),    // "45–54", not 47
    areaBand: null,                    // area is identifying in a town this size — hide it
    maritalStatus: p.maritalStatus,
    isRedacted: true,
    // fullName, fatherName, husbandName, mobile, address, religion, idNumber: ABSENT
  };
}
```

Every read path goes through `getViewContext()` → `redact*()`. There is a lint rule / code
review check: **no route or server component may import `prisma` directly**; they import from
`src/lib/db/queries/*`, and those functions take a `ViewContext` and return redacted view types.

## 3. What is hidden and what stays visible

### Hidden when Meeting Mode is ON

**Patient and applicant:** full name, father's name, husband's name, address line,
area/mohalla, pincode, mobile and alternate mobile, religion, ID type and number, date of birth,
exact age, photo, `watchNote` free text, free-text fields that commonly carry names —
`introducedByName`, `introducedByPhone`, `attendingDoctor`, and `eligibilityNote`.

**Documents:** attachments with `containsIdentity = true` cannot be previewed or downloaded. The
document tile renders as a locked card showing only the type, page count and upload date. No
thumbnail is generated or served.

**Elsewhere:** payee name on payments, donor names on any case linked to an earmarked donation,
global search by name, exports of unredacted data, the audit log's `summary` for other users.

### Visible when Meeting Mode is ON

Case number · person code (`P-000412`) · gender · age band · marital status · relation of
applicant to patient · dependent count · disease and category · hospital · attending hospital
type · admission/discharge dates · major problem text *(see caveat below)* · approximate expense ·
requested amount · income band · Zakat eligibility · **prior aid history** (number of previous
cases, total received, last aid date, watch flag as a badge) · document checklist completeness
(which types are present, without opening them) · decision controls.

**Caveat on `majorProblem`:** it is free text written by a clerk and may contain a name. Two
mitigations, both required:
1. On save, run a light name-scrub warning: if the text contains a token matching the applicant's
   or patient's name, warn the clerk and offer to replace it with "the patient".
2. In Meeting Mode, apply `scrubNames(text, [applicantNames, patientNames])` server-side before
   returning it — a literal token replacement, not a model call.

### Age bands

`0–5 · 6–12 · 13–17 · 18–24 · 25–34 · 35–44 · 45–54 · 55–64 · 65–74 · 75+`

## 4. How Meeting Mode is turned on

**There is no role-based masking.** Redaction is not tied to who someone is; it is a switch the
super admin flips when the system is going to be looked at by people who should not see
identities. Three ways it can be on:

| Layer | Setting key | Controlled by | Behaviour |
|---|---|---|---|
| Global switch | `meetingMode.global` | `SUPER_ADMIN` only | ON → **every** user is redacted, including the super admin and the general secretary, until it is turned off |
| Per-account pin | `User.forceMeetingMode` | `SUPER_ADMIN` only | one account is always redacted — for handing a laptop to a visitor, an auditor, or a committee member's own login |
| Present mode | — | automatic | the full-screen meeting view is always redacted and cannot be unredacted |

Resolution order (first match wins):
```ts
if (presentMode) return true;
if (settings.meetingMode.global) return true;
if (user.forceMeetingMode) return true;
return false;
```

Notes:
- Ordinary users have **no toggle**. The switch appears in the top bar only for `SUPER_ADMIN`,
  and flipping it affects everyone immediately — no logout required. Other users see a banner
  the moment their next request resolves.
- `resolveMeetingMode()` is re-evaluated **on every request from the database**. Nothing about the
  mode is ever read from a client-supplied cookie, header or query parameter.
- Turning the switch on or off writes a `MEETING_MODE_TOGGLE` audit row with the actor and time,
  so the trust can show that identities were hidden during a given meeting.

## 5. Reveal

**`SUPER_ADMIN` only.** No other role can reveal an identity, and there is no "ask an admin to
unhide it for a minute" path — the admin either reveals the one record, on the record, or does
not.

Reveal works even while the global switch is on. That is deliberate: without it, the only way for
the admin to check one case would be to turn masking off for everyone in the room. Revealing one
case, with a reason, in the audit log, is the safer of the two.

Reveal flow:
1. Click "Reveal identity" on the case header.
2. Dialog requires a reason (free text, minimum 10 characters) and re-entry of the password.
3. Server checks permission, writes an `AuditLog` row with `action: REVEAL_IDENTITY`,
   the case number, the reason, IP and user agent.
4. The unredacted record is returned for **that record only**, for 5 minutes, held in a
   server-side short-lived grant keyed by `(userId, applicationId)`. Not a global switch-off.
5. A persistent banner shows "Identity revealed — expires in 4:32" with an "end now" button.

Reveals are listed in Settings → Audit with a dedicated filter, and appear on the case's History
tab as "Identity revealed by <user> — <reason>". The committee can see that it happened.

## 6. Tracking applicants and patients (the audit trail side of the request)

Independent of Meeting Mode, the system keeps a full trail so the trust can answer "who touched
this record and when":

- **Per person:** `Person` rows are never hard deleted. Every case they appear in — as applicant
  or as patient — is listed on their page with dates and amounts. Lifetime totals are computed,
  not stored, so they cannot drift.
- **Repeat detection:** on creating a case, the server checks whether the applicant or patient has
  an existing case in the last 12 months and surfaces a badge: `3rd application this year`.
- **Per record:** `AuditLog` captures create/update/delete with a before/after JSON diff for every
  entity. The case History tab renders this as a timeline.
- **Per document:** viewing or downloading an attachment writes `FILE_VIEW` / `FILE_DOWNLOAD`
  with the attachment id and case number. Signed URLs are 5 minutes, single-issue, and never
  cached by the CDN.
- **Per export:** every export records what was exported, with which filters, and whether it was
  redacted.
- Audit rows are append-only. No UI deletes them. `SUPER_ADMIN` can only export them.

## 7. Permission matrix

`R` read · `W` create/edit · `A` approve/authorise · `—` no access · `Rm` read, forced masked

| Area | SUPER_ADMIN | GEN_SECRETARY | COMMITTEE | OPERATOR | ACCOUNTANT | VIEWER |
|---|---|---|---|---|---|---|
| Applications | RWA | RWA | Rm | RW | R | Rm |
| Decision | A | A | record vote only | — | — | — |
| People registry | RW | RW | Rm | RW | R | Rm |
| Person merge | ✓ | ✓ | — | — | — | — |
| Attachments | RW | RW | locked in MM | RW | R (financial only) | — |
| Payments | RWA | RWA | R (amounts only) | — | RW | Rm |
| Donations / donors | RW | R | — | — | RW | Rm |
| Expenses | RW | R | — | — | RW | Rm |
| Funds | RW | R | — | — | RW | — |
| Meetings | RW | RW | R + vote | W (schedule) | — | — |
| Reports | all + unredacted export | all | — | operational only | financial | view only, no export |
| Settings | RW | R | — | — | — | — |
| Users & roles | RW | — | — | — | — | — |
| Audit log | R + export | R | — | — | — | — |
| Reveal identity | ✓ | — | — | — | — | — |
| Meeting mode switch | ✓ | — | — | — | — | — |

Implement as `assertPermission(ctx, 'payments.create')` with a single capability map in
`src/lib/auth/permissions.ts`. Never check `role === 'SUPER_ADMIN'` inline in a component.

## 8. Other privacy requirements

- Session timeout 30 minutes idle; 8 hours absolute. Re-auth for reveal, user management, and
  fund changes.
- Rate-limit login: 5 failures → 15-minute lockout, audited.
- Backups: nightly `pg_dump` encrypted with age/GPG, plus object-store versioning. Test a restore
  before go-live and document it.
- ID numbers encrypted at rest; only last 4 rendered; full value revealed only through the same
  reveal flow.
- No third-party analytics, no external fonts loaded at runtime (self-host), no error reporting
  service that captures request bodies.
- Printed case sheets carry a footer: case number, printed-by, printed-at — so a leaked paper can
  be traced.

## 9. Tests that must exist

1. `redactPerson` drops every field in the hidden list — snapshot test on the view type.
2. A request with `meetingMode: true` to each list and detail endpoint contains none of:
   `fullName`, `fatherName`, `husbandName`, `mobile`, `addressLine`, `religion`, `idNumberLast4`.
   Assert against the serialised JSON string, not the object.
3. No request-supplied value (cookie, header, query param, body) can turn masking off:
   with `meetingMode.global = true`, a forged request still returns redacted data.
4. Signed URL issuance for an attachment with `containsIdentity = true` is rejected under
   Meeting Mode and writes no URL to the response.
5. Reveal without a reason is rejected; reveal with a reason writes exactly one audit row.
6. Present mode forces redaction even for `SUPER_ADMIN`.
8. A reveal attempted by `GENERAL_SECRETARY` is rejected and writes no grant.
9. Toggling the global switch writes exactly one `MEETING_MODE_TOGGLE` audit row.
7. `scrubNames` removes the patient's name from `majorProblem` in the redacted response.
