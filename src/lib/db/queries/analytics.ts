import "server-only";
import type { HospitalType, Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { monthKey } from "@/lib/fy";
import { fyBounds, previousFy } from "@/lib/fy/db";
import type { ViewContext } from "@/lib/redact";
import { can } from "@/lib/auth/permissions";
import { LIVE_PAYMENT } from "./shared";
import { listFunds } from "./funds";
import { attentionCounts } from "./applications";

// Dashboard, hospital and disease analytics. Religion is never a dimension here.

/** Month buckets (yyyy-MM) from `from` for `n` months. */
export function months(from: Date, n: number): string[] {
  const [y, m] = monthKey(from).split("-").map(Number); // IST month, whatever the server TZ
  return Array.from({ length: n }, (_, i) => {
    const t = y * 12 + (m - 1) + i;
    return `${Math.floor(t / 12)}-${String((t % 12) + 1).padStart(2, "0")}`;
  });
}

async function fyFigures(fy: string | null, withDonations: boolean) {
  // No earlier year to compare with: zeros.
  if (!fy) return { cases: 0, disbursed: 0n, donations: 0n, helped: 0, helpedIds: [] as string[] };
  const { start, end } = await fyBounds(fy);
  const [cases, disbursed, donations, helped] = await Promise.all([
    prisma.application.count({ where: { fiscalYear: fy, status: { not: "DRAFT" } } }),
    prisma.payment.aggregate({ where: { ...LIVE_PAYMENT, paymentDate: { gte: start, lt: end } }, _sum: { amountPaise: true } }),
    withDonations ? prisma.donation.aggregate({ where: { cancelledAt: null, donationDate: { gte: start, lt: end } }, _sum: { amountPaise: true } }) : null,
    prisma.application.findMany({
      where: { payments: { some: { ...LIVE_PAYMENT, paymentDate: { gte: start, lt: end } } } },
      select: { patientId: true },
      distinct: ["patientId"],
    }),
  ]);
  return {
    cases,
    disbursed: disbursed._sum.amountPaise ?? 0n,
    donations: donations?._sum.amountPaise ?? 0n,
    helped: helped.length,
    helpedIds: helped.map((h) => h.patientId),
  };
}

export async function getDashboard(ctx: ViewContext) {
  const { start, end } = await fyBounds(ctx.fy);
  // Role-gated parts are not queried at all for roles that may not see them.
  const seeDonations = can(ctx, "donations.read");
  const seeFunds = can(ctx, "funds.read");
  const seeAudit = can(ctx, "audit.read");
  const [cur, prev, funds, attention] = await Promise.all([
    fyFigures(ctx.fy, seeDonations),
    previousFy(ctx.fy).then((prev) => fyFigures(prev, seeDonations)),
    seeFunds ? listFunds(ctx) : null,
    attentionCounts(),
  ]);
  const [repeat, pays, dons, byHospitalRows, diseaseMix, recent] = await Promise.all([
    // Repeat = helped this FY and also had a case in an earlier FY.
    prisma.application.findMany({
      where: { patientId: { in: cur.helpedIds }, applicationDate: { lt: start }, status: { not: "DRAFT" } },
      select: { patientId: true },
      distinct: ["patientId"],
    }),
    prisma.payment.findMany({ where: { ...LIVE_PAYMENT, paymentDate: { gte: start, lt: end } }, select: { amountPaise: true, paymentDate: true } }),
    seeDonations ? prisma.donation.findMany({ where: { cancelledAt: null, donationDate: { gte: start, lt: end } }, select: { amountPaise: true, donationDate: true } }) : [],
    prisma.payment.groupBy({ by: ["hospitalId"], where: { ...LIVE_PAYMENT, paymentDate: { gte: start, lt: end }, hospitalId: { not: null } }, _sum: { amountPaise: true } }),
    categoryMix({ fiscalYear: ctx.fy, status: { not: "DRAFT" } }),
    // Recent activity: summaries are PII-free by construction; in Meeting Mode only own rows keep them.
    seeAudit
      ? prisma.auditLog.findMany({
          where: { action: { notIn: ["LOGIN", "LOGOUT", "FILE_VIEW"] } },
          orderBy: { createdAt: "desc" },
          take: 10,
          include: { actor: { select: { name: true } } },
        })
      : null,
  ]);

  // Months of the selected FY that have started (no zero-filled future months).
  // Each row's month is computed once; time-zone formatting is the expensive part.
  const now = monthKey(new Date());
  const inMonth = new Map<string, { donations: bigint; disbursed: bigint }>();
  const add = (m: string, k: "donations" | "disbursed", v: bigint) => {
    const b = inMonth.get(m) ?? { donations: 0n, disbursed: 0n };
    b[k] += v;
    inMonth.set(m, b);
  };
  for (const d of dons) add(monthKey(d.donationDate), "donations", d.amountPaise);
  for (const p of pays) add(monthKey(p.paymentDate), "disbursed", p.amountPaise);
  const flow = months(start, 12)
    .filter((m) => m <= now)
    .map((m) => ({ month: m, donations: Number(inMonth.get(m)?.donations ?? 0n) / 100, disbursed: Number(inMonth.get(m)?.disbursed ?? 0n) / 100 }));
  const top = byHospitalRows.sort((a, b) => ((b._sum.amountPaise ?? 0n) > (a._sum.amountPaise ?? 0n) ? 1 : -1)).slice(0, 8);
  const names = new Map((await prisma.hospital.findMany({ where: { id: { in: top.map((r) => r.hospitalId!) } }, select: { id: true, name: true } })).map((h) => [h.id, h.name]));
  const topHospitals = top.map((r) => ({ id: r.hospitalId!, name: names.get(r.hospitalId!) ?? "—", amount: Number(r._sum.amountPaise ?? 0n) / 100 }));

  return {
    stats: {
      cases: { cur: cur.cases, prev: prev.cases },
      disbursed: { cur: cur.disbursed, prev: prev.disbursed },
      donations: seeDonations ? { cur: cur.donations, prev: prev.donations } : null,
      helped: { cur: cur.helped, prev: prev.helped, repeat: repeat.length },
    },
    funds,
    flow: seeDonations ? flow : null,
    diseaseMix,
    topHospitals,
    attention,
    recent: recent?.map((r) => ({
      id: r.id,
      at: r.createdAt,
      action: r.action,
      actor: r.actor?.name ?? "System",
      summary: ctx.meetingMode && r.actorId !== ctx.userId ? null : r.summary,
    })) ?? null,
  };
}

/** Disease-category mix by case count. */
async function categoryMix(where: Prisma.ApplicationWhereInput) {
  const rows = await prisma.application.groupBy({ by: ["diseaseId"], where: { ...where, diseaseId: { not: null } }, _count: true });
  const diseases = await prisma.disease.findMany({ where: { id: { in: rows.map((r) => r.diseaseId!) } }, include: { category: true } });
  const byCat = new Map<string, number>();
  for (const r of rows) {
    const c = diseases.find((d) => d.id === r.diseaseId)?.category.name ?? "Other";
    byCat.set(c, (byCat.get(c) ?? 0) + r._count);
  }
  return [...byCat.entries()].map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value);
}

// ─────────────────────────── hospitals ───────────────────────────

export async function listHospitals(ctx: ViewContext, f: { q?: string; includeInactive?: boolean; type?: HospitalType; withCases?: boolean }) {
  const { start, end } = await fyBounds(ctx.fy);
  const hospitals = await prisma.hospital.findMany({
    where: {
      ...(f.includeInactive ? {} : { isActive: true }),
      ...(f.type ? { type: f.type } : {}),
      ...(f.q ? { OR: [{ name: { contains: f.q, mode: "insensitive" } }, { city: { contains: f.q, mode: "insensitive" } }] } : {}),
    },
    orderBy: { name: "asc" },
  });
  const [apps, pays, pending] = await Promise.all([
    prisma.application.findMany({ where: { fiscalYear: ctx.fy, status: { not: "DRAFT" }, hospitalId: { not: null } }, select: { hospitalId: true, patientId: true } }),
    prisma.payment.groupBy({ by: ["hospitalId"], where: { ...LIVE_PAYMENT, paymentDate: { gte: start, lt: end } }, _sum: { amountPaise: true } }),
    prisma.payment.groupBy({ by: ["hospitalId"], where: { status: "ISSUED", clearedAt: null, deletedAt: null }, _count: true }),
  ]);
  const rows = hospitals.map((h) => {
    const mine = apps.filter((a) => a.hospitalId === h.id);
    return {
      id: h.id, name: h.name, type: h.type, city: h.city, isEmpanelled: h.isEmpanelled, isActive: h.isActive,
      cases: mine.length,
      patients: new Set(mine.map((a) => a.patientId)).size,
      paidPaise: pays.find((p) => p.hospitalId === h.id)?._sum.amountPaise ?? 0n,
      pendingCheques: pending.find((p) => p.hospitalId === h.id)?._count ?? 0,
    };
  });
  return f.withCases ? rows.filter((h) => h.cases > 0) : rows;
}

/** Hospital details for its page header; the figures come from caseBreakdown(). */
export async function getHospital(id: string) {
  const h = await prisma.hospital.findFirst({ where: { id } });
  if (!h) return null;
  return {
    id: h.id, name: h.name, type: h.type, street: h.addressLine, city: h.city, state: h.state, phone: h.phone,
    contactPerson: h.contactPerson, contactPhone: h.contactPhone, email: h.email, isEmpanelled: h.isEmpanelled,
    discountNote: h.discountNote, bankName: h.bankName, bankAccountLast4: h.bankAccountLast4, isActive: h.isActive, notes: h.notes,
  };
}

// ─────────────────────────── diseases ───────────────────────────

/** The Diseases list: one row per disease with this FY's patients, cases and amount paid. */
export async function diseaseRows(ctx: ViewContext, f: { q?: string; categoryId?: string; chronic?: boolean; withCases?: boolean }) {
  const { start, end } = await fyBounds(ctx.fy);
  const [cats, apps, pays] = await Promise.all([
    prisma.diseaseCategory.findMany({ orderBy: { sortOrder: "asc" }, include: { diseases: { where: { deletedAt: null }, orderBy: { name: "asc" } } } }),
    prisma.application.findMany({ where: { fiscalYear: ctx.fy, status: { not: "DRAFT" }, diseaseId: { not: null } }, select: { diseaseId: true, patientId: true } }),
    prisma.payment.findMany({ where: { ...LIVE_PAYMENT, paymentDate: { gte: start, lt: end }, application: { diseaseId: { not: null } } }, select: { amountPaise: true, applicationId: true, application: { select: { diseaseId: true } } } }),
  ]);
  const q = f.q?.trim().toLowerCase();
  const rows = cats
    .filter((c) => !f.categoryId || c.id === f.categoryId)
    .flatMap((c) => c.diseases.map((d) => ({ d, c })))
    .filter(({ d }) => (!q || d.name.toLowerCase().includes(q)) && (!f.chronic || d.isChronic))
    .map(({ d, c }) => {
      const a = apps.filter((x) => x.diseaseId === d.id);
      const p = pays.filter((x) => x.application.diseaseId === d.id);
      const total = p.reduce((s, x) => s + x.amountPaise, 0n);
      const paidCases = new Set(p.map((x) => x.applicationId)).size;
      return {
        id: d.id, name: d.name, isChronic: d.isChronic, categoryName: c.name,
        cases: a.length, patients: new Set(a.map((x) => x.patientId)).size, patientIds: a.map((x) => x.patientId),
        totalPaise: total, averagePaise: paidCases ? total / BigInt(paidCases) : 0n,
      };
    })
    .filter((r) => !f.withCases || r.cases > 0);
  return {
    rows: rows.map((r) => ({ id: r.id, name: r.name, isChronic: r.isChronic, categoryName: r.categoryName, cases: r.cases, patients: r.patients, totalPaise: r.totalPaise, averagePaise: r.averagePaise })),
    categories: cats.map((c) => ({ id: c.id, name: c.name })),
    totals: {
      cases: rows.reduce((s, r) => s + r.cases, 0),
      patients: new Set(rows.flatMap((r) => r.patientIds)).size,
      paidPaise: rows.reduce((s, r) => s + r.totalPaise, 0n),
    },
  };
}

/** Disease details for its page header; the figures come from caseBreakdown(). */
export async function getDisease(id: string) {
  const d = await prisma.disease.findFirst({ where: { id }, include: { category: true } });
  return d ? { id: d.id, name: d.name, categoryName: d.category.name, isChronic: d.isChronic } : null;
}
