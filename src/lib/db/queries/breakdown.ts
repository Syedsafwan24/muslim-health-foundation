import "server-only";
import type { Prisma } from "@prisma/client";
import { startOfMonth, subMonths } from "date-fns";
import { prisma } from "@/lib/db";
import { byMonth, fyRange } from "@/lib/fy";
import { GENDER } from "@/lib/labels";
import { currentAge, personRef, toAgeBand, type ViewContext } from "@/lib/redact";
import { LIVE_PAYMENT } from "./shared";
import { months } from "./analytics";

/** One slice of a breakdown: "Cardiac · 3 cases · 2 patients · ₹1,20,000". */
export type Slice = { key: string; name: string; href?: string; cases: number; patients: number; paidPaise: bigint };

/**
 * Everything the hospital page and the disease page show, for the recorded cases in one scope:
 * stat cards, breakdowns (disease, category, hospital, gender, age, city), the monthly chart and
 * the Cases / Patients / Payments tables. Identities go through personRef, so Meeting Mode holds.
 */
export async function caseBreakdown(ctx: ViewContext, scope: { hospitalId: string } | { diseaseId: string }) {
  const where: Prisma.ApplicationWhereInput = { ...scope, status: { not: "DRAFT" } };
  const apps = await prisma.application.findMany({
    where,
    orderBy: { applicationDate: "desc" },
    include: {
      patient: true,
      hospital: { select: { id: true, name: true } },
      disease: { include: { category: true } },
      payments: { where: LIVE_PAYMENT, orderBy: { paymentDate: "desc" }, include: { bank: { select: { name: true } }, fund: { select: { name: true } } } },
      _count: { select: { payments: { where: { status: "ISSUED", clearedAt: null, deletedAt: null } } } },
    },
  });
  const { start, end } = fyRange(ctx.fy);
  // Exact age is identifying in Meeting Mode; the age band is shown instead.
  const shownAge = (p: Parameters<typeof currentAge>[0]): number | string | null => (ctx.meetingMode ? toAgeBand(currentAge(p)) : currentAge(p));
  const paidOf = (a: (typeof apps)[number]) => a.payments.reduce((s, p) => s + p.amountPaise, 0n);
  const payments = apps.flatMap((a) => a.payments.map((p) => ({ ...p, caseNo: a.caseNo, applicationId: a.id, patient: a.patient })));
  const total = payments.reduce((s, p) => s + p.amountPaise, 0n);
  const fyTotal = payments.filter((p) => p.paymentDate >= start && p.paymentDate < end).reduce((s, p) => s + p.amountPaise, 0n);
  const paidCases = apps.filter((a) => paidOf(a) > 0n).length;

  // Group cases by a key into slices.
  const group = (keyOf: (a: (typeof apps)[number]) => { key: string; name: string; href?: string } | null): Slice[] => {
    const m = new Map<string, Slice & { people: Set<string> }>();
    for (const a of apps) {
      const k = keyOf(a) ?? { key: "—", name: "Not recorded" };
      const s = m.get(k.key) ?? { ...k, cases: 0, patients: 0, paidPaise: 0n, people: new Set<string>() };
      s.cases += 1;
      s.people.add(a.patientId);
      s.paidPaise += paidOf(a);
      m.set(k.key, s);
    }
    return [...m.values()]
      .map(({ people, ...s }) => ({ ...s, patients: people.size }))
      .sort((x, y) => (y.paidPaise === x.paidPaise ? y.cases - x.cases : y.paidPaise > x.paidPaise ? 1 : -1));
  };

  const last12 = months(startOfMonth(subMonths(new Date(), 11)), 12);
  const perMonth = byMonth(payments, (p) => p.paymentDate);
  const casesPerMonth = byMonth(apps, (a) => a.applicationDate);

  // Patients table: one row per person.
  const people = new Map<string, { a: (typeof apps)[number]; cases: number; paid: bigint; last: Date }>();
  for (const a of apps) {
    const r = people.get(a.patientId) ?? { a, cases: 0, paid: 0n, last: a.applicationDate };
    r.cases += 1;
    r.paid += paidOf(a);
    if (a.applicationDate > r.last) r.last = a.applicationDate;
    people.set(a.patientId, r);
  }

  return {
    stats: {
      totalPaise: total,
      fyPaise: fyTotal,
      cases: apps.length,
      patients: people.size,
      approvedPaise: apps.reduce((s, a) => s + (a.approvedAmountPaise ?? 0n), 0n),
      averagePaise: paidCases ? total / BigInt(paidCases) : 0n,
      largestPaise: apps.reduce((m, a) => (paidOf(a) > m ? paidOf(a) : m), 0n),
      pendingCheques: apps.reduce((s, a) => s + a._count.payments, 0),
    },
    byDisease: group((a) => (a.disease ? { key: a.disease.id, name: a.disease.name, href: `/diseases/${a.disease.id}` } : null)),
    byCategory: group((a) => (a.disease ? { key: a.disease.category.id, name: a.disease.category.name } : null)),
    byHospital: group((a) => (a.hospital ? { key: a.hospital.id, name: a.hospital.name, href: `/hospitals/${a.hospital.id}` } : null)),
    byGender: group((a) => (a.patient.gender ? { key: a.patient.gender, name: GENDER[a.patient.gender] } : null)),
    byAge: group((a) => { const b = toAgeBand(currentAge(a.patient)); return b ? { key: b, name: b } : null; }).sort((x, y) => x.name.localeCompare(y.name, "en", { numeric: true })),
    // Where people live is identifying; the city breakdown is left out in Meeting Mode.
    byCity: ctx.meetingMode ? [] : group((a) => (a.patient.city ? { key: a.patient.city.toLowerCase(), name: a.patient.city } : null)),
    monthly: last12.map((m) => ({
      month: m,
      amount: Number((perMonth.get(m) ?? []).reduce((s, p) => s + p.amountPaise, 0n)) / 100,
      cases: (casesPerMonth.get(m) ?? []).length,
    })),
    cases: apps.map((a) => ({
      id: a.id, caseNo: a.caseNo, applicationDate: a.applicationDate, patient: personRef(a.patient, ctx),
      gender: a.patient.gender, age: shownAge(a.patient),
      diseaseName: a.disease?.name ?? null, categoryName: a.disease?.category.name ?? null, hospitalName: a.hospital?.name ?? null,
      approvedPaise: a.approvedAmountPaise, paidPaise: paidOf(a), status: a.status,
    })),
    patients: [...people.values()].map(({ a, cases, paid, last }) => ({
      person: personRef(a.patient, ctx), gender: a.patient.gender, age: shownAge(a.patient),
      ...(ctx.meetingMode ? {} : { city: a.patient.city }), cases, paidPaise: paid, lastCase: last,
    })),
    payments: payments.map((p) => ({
      id: p.id, voucherNo: p.voucherNo, paymentDate: p.paymentDate, caseNo: p.caseNo, applicationId: p.applicationId,
      mode: p.mode, chequeNo: p.chequeNo ?? p.referenceNo, bankName: p.bank?.name ?? null, fundName: p.fund.name,
      amountPaise: p.amountPaise, status: p.status,
    })),
  };
}
export type Breakdown = Awaited<ReturnType<typeof caseBreakdown>>;
