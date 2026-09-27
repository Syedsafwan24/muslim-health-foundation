import type { Gender, IdType, MaritalStatus, Person, Role } from "@prisma/client";

// Redaction happens here, on the server, before serialisation. Every view is built from an
// explicit allowlist of fields — never by deleting keys from a full record — so a new column on
// Person cannot leak by default. See docs/03-privacy-and-access.md.

export type ViewContext = {
  userId: string;
  name: string;
  role: Role;
  /** Resolved from the database on every request. Never from the client. */
  meetingMode: boolean;
  globalMeetingMode: boolean;
  /** Selected fiscal year for dashboards and lists. */
  fy: string;
};

const AGE_BANDS: [number, number, string][] = [
  [0, 5, "0–5"], [6, 12, "6–12"], [13, 17, "13–17"], [18, 24, "18–24"], [25, 34, "25–34"],
  [35, 44, "35–44"], [45, 54, "45–54"], [55, 64, "55–64"], [65, 74, "65–74"],
];

export function toAgeBand(age: number | null | undefined): string | null {
  if (age == null) return null;
  const band = AGE_BANDS.find(([lo, hi]) => age >= lo && age <= hi);
  return band ? band[2] : "75+";
}

/** Age today, aged forward from when it was recorded. */
export function currentAge(p: Pick<Person, "ageYears" | "ageRecordedAt" | "dateOfBirth">, now = new Date()): number | null {
  const years = (from: Date) => Math.floor((now.getTime() - from.getTime()) / (365.2425 * 864e5));
  if (p.dateOfBirth) return years(p.dateOfBirth);
  if (p.ageYears == null) return null;
  return p.ageYears + (p.ageRecordedAt ? Math.max(0, years(p.ageRecordedAt)) : 0);
}

export type PersonRedacted = {
  isRedacted: true;
  id: string;
  personCode: string;
  displayName: string;
  gender: Gender | null;
  ageBand: string | null;
  maritalStatus: MaritalStatus;
  watchFlag: boolean;
};

export type PersonFull = {
  isRedacted: false;
  id: string;
  personCode: string;
  displayName: string;
  fullName: string;
  fatherName: string | null;
  husbandName: string | null;
  gender: Gender | null;
  age: number | null;
  ageBand: string | null;
  dateOfBirth: Date | null;
  maritalStatus: MaritalStatus;
  religion: string | null;
  mobile: string | null;
  altMobile: string | null;
  addressLine: string | null;
  areaId: string | null;
  areaName: string | null;
  city: string | null;
  pincode: string | null;
  idType: IdType;
  idNumberLast4: string | null;
  isDeceased: boolean;
  watchFlag: boolean;
  watchNote: string | null;
  notes: string | null;
};

export type PersonView = PersonFull | PersonRedacted;
type PersonRow = Person & { area?: { name: string } | null };

export function redactPerson(p: PersonRow, ctx: Pick<ViewContext, "meetingMode">): PersonView {
  const age = currentAge(p);
  if (ctx.meetingMode) {
    return {
      isRedacted: true,
      id: p.id,
      personCode: p.personCode,
      displayName: p.personCode,
      gender: p.gender,
      ageBand: toAgeBand(age),
      maritalStatus: p.maritalStatus,
      watchFlag: p.watchFlag,
    };
  }
  return {
    isRedacted: false,
    id: p.id,
    personCode: p.personCode,
    displayName: p.fullName,
    fullName: p.fullName,
    fatherName: p.fatherName,
    husbandName: p.husbandName,
    gender: p.gender,
    age,
    ageBand: toAgeBand(age),
    dateOfBirth: p.dateOfBirth,
    maritalStatus: p.maritalStatus,
    religion: p.religion,
    mobile: p.mobile,
    altMobile: p.altMobile,
    addressLine: p.addressLine,
    areaId: p.areaId,
    areaName: p.area?.name ?? null,
    city: p.city,
    pincode: p.pincode,
    idType: p.idType,
    idNumberLast4: p.idNumberLast4,
    isDeceased: p.isDeceased,
    watchFlag: p.watchFlag,
    watchNote: p.watchNote,
    notes: p.notes,
  };
}

/** Minimal person reference for table cells: name, or the alias. */
export type PersonRef = { id: string; personCode: string; displayName: string; isRedacted: boolean };
export function personRef(p: Pick<Person, "id" | "personCode" | "fullName">, ctx: Pick<ViewContext, "meetingMode">): PersonRef {
  return ctx.meetingMode
    ? { id: p.id, personCode: p.personCode, displayName: p.personCode, isRedacted: true }
    : { id: p.id, personCode: p.personCode, displayName: p.fullName, isRedacted: false };
}

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Name tokens worth scrubbing: each word of 3+ letters, plus the whole name. */
export function nameTokens(names: (string | null | undefined)[]): string[] {
  const out = new Set<string>();
  for (const n of names) {
    if (!n?.trim()) continue;
    out.add(n.trim());
    for (const t of n.split(/\s+/)) if (t.replace(/\W/g, "").length >= 3) out.add(t.replace(/[^\p{L}\p{N}'-]/gu, ""));
  }
  return [...out].filter(Boolean).sort((a, b) => b.length - a.length);
}

/** Literal token replacement of known names in free text. Not a model call. */
export function scrubNames(text: string | null | undefined, names: (string | null | undefined)[], replacement = "[name hidden]"): string | null {
  if (text == null) return null;
  let out = text;
  for (const t of nameTokens(names)) {
    out = out.replace(new RegExp(`(?<![\\p{L}\\p{N}])${escapeRe(t)}(?![\\p{L}\\p{N}])`, "giu"), replacement);
  }
  return out;
}

/** True if the text mentions any of the names — the clerk warning on save. */
export function mentionsNames(text: string | null | undefined, names: (string | null | undefined)[]): boolean {
  return !!text && scrubNames(text, names) !== text;
}

// Free-text case fields that commonly carry names. Hidden in Meeting Mode.
export const HIDDEN_CASE_FIELDS = ["introducedByName", "introducedByPhone", "attendingDoctor", "eligibilityNote"] as const;
