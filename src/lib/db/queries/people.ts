import "server-only";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import type { readParams } from "@/lib/params";
import { fyRange } from "@/lib/fy";
import { identityHash, normaliseMobile, normaliseName } from "@/lib/crypto";
import { personRef, redactPerson, toAgeBand, currentAge, type PersonRef, type PersonView, type ViewContext } from "@/lib/redact";
import { LIVE_PAYMENT, pageArgs, PAGE_SIZE, type Page } from "./shared";
import { priorAid } from "./applications";

export type PersonRow = {
  person: PersonRef;
  gender: string | null;
  ageBand: string | null;
  /** Absent (not null) in Meeting Mode, like the other identity-adjacent fields. */
  age?: number | null;
  areaName?: string | null;
  mobile?: string | null;
  cases: number;
  totalPaise: bigint;
  lastCaseAt: Date | null;
  watchFlag: boolean;
};

export type PeopleStats = { people: number; cases: number; paidPaise: bigint; male: number; female: number; repeat: number };

/** The toAgeBand labels in order, with their inclusive age range (hi null = open-ended). */
const AGES = Array.from({ length: 121 }, (_, i) => i);
export const AGE_BAND_LABELS = [...new Set(AGES.map((i) => toAgeBand(i)!))];
const bandRange = (b: string): [number, number | null] => {
  const a = AGES.filter((i) => toAgeBand(i) === b);
  return [a[0], b === AGE_BAND_LABELS.at(-1) ? null : a.at(-1)!];
};

export const PEOPLE_SORTS = ["name", "gender", "age", "area", "cases", "paid", "last"] as const;
export type PeopleSort = (typeof PEOPLE_SORTS)[number] | `-${(typeof PEOPLE_SORTS)[number]}`;
const SORT_VALUES = PEOPLE_SORTS.flatMap((s) => [s, `-${s}`]) as PeopleSort[];

export type PeopleFilters = {
  q?: string; areaId?: string; gender?: "MALE" | "FEMALE" | "OTHER"; ageBand?: string;
  aided?: boolean; repeat?: boolean; sort?: PeopleSort; page?: number;
};

/** URL params → filters. Shared by the page and its export so both show the same rows. */
export function peopleFilters(p: Awaited<ReturnType<typeof readParams>>): PeopleFilters {
  return {
    q: p.str("q"), areaId: p.str("area"), gender: p.oneOf("gender", ["MALE", "FEMALE", "OTHER"] as const),
    ageBand: p.oneOf("age", AGE_BAND_LABELS), aided: p.flag("aided"), repeat: p.flag("repeat"),
    sort: p.oneOf("sort", SORT_VALUES), page: p.page(),
  };
}

const YEAR_SECONDS = 365.2425 * 86400; // same year length as currentAge()
const yearsSince = (col: string) => Prisma.raw(`floor(extract(epoch from ((now() AT TIME ZONE 'UTC') - per."${col}")) / ${YEAR_SECONDS})::int`);

/**
 * /patients and /applicants — the same registry seen from two sides. One SQL pass computes cases,
 * aid received, last case and today's age per person so filters, sorting and the stat cards all
 * agree and run in the database. Identity is redacted afterwards with personRef/toAgeBand.
 */
export async function listPeople(ctx: ViewContext, f: PeopleFilters & { as: "patient" | "applicant"; all?: boolean }) {
  const role = Prisma.raw(f.as === "patient" ? `"patientId"` : `"applicantId"`);
  const mm = ctx.meetingMode;
  const cond: Prisma.Sql[] = [Prisma.sql`per."deletedAt" IS NULL`];
  const q = f.q?.trim();
  if (q) {
    // Meeting Mode: person code only — name and mobile search would confirm identities.
    const or = [Prisma.sql`per."personCode" = ${q.toUpperCase()}`];
    if (!mm) or.push(Prisma.sql`strpos(lower(per."fullName"), lower(${q})) > 0`, Prisma.sql`strpos(per.mobile, ${normaliseMobile(q) || q}) > 0`);
    cond.push(Prisma.sql`(${Prisma.join(or, " OR ")})`);
  }
  if (f.areaId && !mm) cond.push(Prisma.sql`per."areaId" = ${f.areaId}`);
  if (f.gender) cond.push(Prisma.sql`per.gender::text = ${f.gender}`);
  const outer: Prisma.Sql[] = [Prisma.sql`true`];
  if (f.ageBand) {
    const [lo, hi] = bandRange(f.ageBand);
    outer.push(hi == null ? Prisma.sql`age >= ${lo}` : Prisma.sql`age BETWEEN ${lo} AND ${hi}`);
  }
  if (f.aided) outer.push(Prisma.sql`paid > 0`);
  if (f.repeat) outer.push(Prisma.sql`cases > 1`);

  const base = Prisma.sql`
    WITH c AS (
      SELECT a.${role} AS pid, count(*)::int AS cases, max(a."applicationDate") AS last
      FROM "Application" a WHERE a."deletedAt" IS NULL GROUP BY 1
    ), paid AS (
      SELECT a.${role} AS pid, sum(p."amountPaise")::bigint AS paid
      FROM "Payment" p JOIN "Application" a ON a.id = p."applicationId"
      WHERE p."deletedAt" IS NULL AND p.status NOT IN ('CANCELLED', 'BOUNCED') GROUP BY 1
    ), x AS (
      SELECT per.id, per."personCode", per."fullName", per.gender, ar.name AS area, c.cases, c.last,
        COALESCE(paid.paid, 0)::bigint AS paid,
        CASE WHEN per."dateOfBirth" IS NOT NULL THEN ${yearsSince("dateOfBirth")}
             WHEN per."ageYears" IS NULL THEN NULL
             ELSE per."ageYears" + CASE WHEN per."ageRecordedAt" IS NULL THEN 0 ELSE greatest(0, ${yearsSince("ageRecordedAt")}) END END AS age
      FROM "Person" per JOIN c ON c.pid = per.id
      LEFT JOIN paid ON paid.pid = per.id
      LEFT JOIN "Area" ar ON ar.id = per."areaId"
      WHERE ${Prisma.join(cond, " AND ")}
    ), f AS (SELECT * FROM x WHERE ${Prisma.join(outer, " AND ")})`;

  // Sorting must not reveal what Meeting Mode hides: by code instead of name, by band instead of exact age.
  const lows = AGE_BAND_LABELS.slice(1).map((b) => bandRange(b)[0]);
  const SORT_SQL: Record<(typeof PEOPLE_SORTS)[number], string> = {
    name: mm ? `"personCode"` : `lower("fullName")`,
    gender: "gender",
    age: mm ? `width_bucket(age, ARRAY[${lows.join(",")}])` : "age",
    area: mm ? `"personCode"` : "lower(area)",
    cases: "cases",
    paid: "paid",
    last: "last",
  };
  const sort = f.sort ?? "-last";
  const key = sort.replace(/^-/, "") as (typeof PEOPLE_SORTS)[number];
  const order = Prisma.raw(`${SORT_SQL[key]} ${sort.startsWith("-") ? "DESC" : "ASC"} NULLS LAST, id`);
  const page = f.page ?? 1;
  const { skip, take } = pageArgs(page);
  const limit = f.all ? Prisma.empty : Prisma.sql`LIMIT ${take} OFFSET ${skip}`;

  const [hits, [s]] = await Promise.all([
    prisma.$queryRaw<{ id: string; cases: number; last: Date | null; paid: bigint }[]>`${base} SELECT id, cases, last, paid FROM f ORDER BY ${order} ${limit}`,
    prisma.$queryRaw<PeopleStats[]>`${base} SELECT count(*)::int AS people, COALESCE(sum(cases), 0)::int AS cases, COALESCE(sum(paid), 0)::bigint AS "paidPaise",
      (count(*) FILTER (WHERE gender = 'MALE'))::int AS male, (count(*) FILTER (WHERE gender = 'FEMALE'))::int AS female,
      (count(*) FILTER (WHERE cases > 1))::int AS repeat FROM f`,
  ]);

  const people = new Map(
    (await prisma.person.findMany({ where: { id: { in: hits.map((h) => h.id) } }, include: { area: true } })).map((p) => [p.id, p]),
  );
  const rows = hits.flatMap((h): PersonRow[] => {
    const p = people.get(h.id);
    if (!p) return [];
    const age = currentAge(p);
    return [{
      person: personRef(p, ctx),
      gender: p.gender,
      ageBand: toAgeBand(age),
      ...(mm ? {} : { age, areaName: p.area?.name ?? null, mobile: p.mobile }),
      cases: h.cases,
      totalPaise: h.paid,
      lastCaseAt: h.last,
      watchFlag: p.watchFlag,
    }];
  });
  const out: Page<PersonRow> & { stats: PeopleStats } = { rows, total: s.people, page, pageSize: f.all ? s.people : PAGE_SIZE, stats: s };
  return out;
}

export async function getPerson(ctx: ViewContext, id: string) {
  const p = await prisma.person.findFirst({ where: { id }, include: { area: true } });
  if (!p) return null;
  const { start, end } = fyRange(ctx.fy);
  const appSelect = {
    id: true, caseNo: true, applicationDate: true, status: true, requestedAmountPaise: true, approvedAmountPaise: true,
    disease: { select: { name: true } }, hospital: { select: { name: true } },
    payments: { where: LIVE_PAYMENT, select: { amountPaise: true } },
  } as const;
  const [asPatient, asApplicant, lifetime, fy] = await Promise.all([
    prisma.application.findMany({ where: { patientId: id }, orderBy: { applicationDate: "desc" }, select: appSelect }),
    prisma.application.findMany({ where: { applicantId: id }, orderBy: { applicationDate: "desc" }, select: appSelect }),
    priorAid(id),
    prisma.payment.aggregate({
      where: { ...LIVE_PAYMENT, paymentDate: { gte: start, lt: end }, application: { OR: [{ patientId: id }, { applicantId: id }] } },
      _sum: { amountPaise: true },
    }),
  ]);
  const caseRow = (a: (typeof asPatient)[number]) => ({
    id: a.id, caseNo: a.caseNo, applicationDate: a.applicationDate, status: a.status,
    requestedPaise: a.requestedAmountPaise, approvedPaise: a.approvedAmountPaise,
    paidPaise: a.payments.reduce((s, x) => s + x.amountPaise, 0n),
    diseaseName: a.disease?.name ?? null, hospitalName: a.hospital?.name ?? null,
  });
  return {
    person: redactPerson(p, ctx) as PersonView,
    asPatient: asPatient.map(caseRow),
    asApplicant: asApplicant.map(caseRow),
    lifetimePaise: lifetime.totalPaise,
    lifetimeCases: lifetime.cases,
    fyPaise: fy._sum.amountPaise ?? 0n,
  };
}

/** Raw editable fields for the person form. Never called in Meeting Mode. */
export async function getPersonForEdit(ctx: ViewContext, id: string) {
  if (ctx.meetingMode) return null;
  const p = await prisma.person.findFirst({ where: { id }, include: { area: true } });
  return p ? (redactPerson(p, ctx) as PersonView) : null;
}

export type PersonSearchHit = PersonRef & { mobileHint: string | null; cases: number; totalPaise: bigint; watchFlag: boolean };

/**
 * Registry search for the application form combobox and ⌘K. In Meeting Mode only person codes
 * match — name and mobile search are disabled.
 */
export async function searchPeople(ctx: ViewContext, q: string, take = 8): Promise<PersonSearchHit[]> {
  const term = q.trim();
  if (term.length < 2) return [];
  const or: Prisma.PersonWhereInput[] = [{ personCode: { contains: term.toUpperCase() } }];
  if (!ctx.meetingMode) {
    or.push({ fullName: { contains: term, mode: "insensitive" } });
    const digits = normaliseMobile(term);
    if (digits.length >= 4) or.push({ mobile: { contains: digits } });
  }
  const rows = await prisma.person.findMany({ where: { OR: or }, take, orderBy: { updatedAt: "desc" } });
  return Promise.all(
    rows.map(async (p) => {
      const aid = await priorAid(p.id);
      return {
        ...personRef(p, ctx),
        mobileHint: ctx.meetingMode || !p.mobile ? null : `${p.mobile.slice(0, 2)}xxxxxx${p.mobile.slice(-2)}`,
        cases: aid.cases,
        totalPaise: aid.totalPaise,
        watchFlag: p.watchFlag,
      };
    }),
  );
}

/** Duplicate detection: same mobile, same identity hash, or same normalised name + father name. */
export async function findDuplicates(input: { fullName: string; fatherName?: string | null; mobile?: string | null; excludeId?: string }) {
  const or: Prisma.PersonWhereInput[] = [{ identityHash: identityHash(input.fullName, input.mobile) }];
  const mobile = input.mobile ? normaliseMobile(input.mobile) : "";
  if (mobile.length === 10) or.push({ mobile: { endsWith: mobile } });
  const candidates = await prisma.person.findMany({
    where: { OR: [...or, { fullName: { equals: input.fullName.trim(), mode: "insensitive" } }], ...(input.excludeId ? { id: { not: input.excludeId } } : {}) },
    take: 20,
  });
  const name = normaliseName(input.fullName);
  const father = normaliseName(input.fatherName ?? "");
  return candidates
    .filter(
      (c) =>
        (mobile.length === 10 && c.mobile && normaliseMobile(c.mobile) === mobile) ||
        c.identityHash === identityHash(input.fullName, input.mobile) ||
        (normaliseName(c.fullName) === name && !!father && normaliseName(c.fatherName ?? "") === father),
    )
    .slice(0, 3)
    .map((c) => ({ id: c.id, personCode: c.personCode, fullName: c.fullName }));
}
