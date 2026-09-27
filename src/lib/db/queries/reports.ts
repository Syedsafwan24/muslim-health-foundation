import "server-only";
import { prisma } from "@/lib/db";
import { can, type Capability } from "@/lib/auth/permissions";
import { fmtDate, fmtMonth, fyRange, byMonth } from "@/lib/fy";
import { formatINR } from "@/lib/money";
import { PAYMENT_MODE, PAYMENT_STATUS, TOWARDS } from "@/lib/labels";
import type { ViewContext } from "@/lib/redact";
import { LIVE_PAYMENT } from "./shared";
import { donorName } from "./donations";

// The eight reports (docs/02 §10). Each returns one uniform table so the screen, the Excel
// export and the PDF export render the same thing. Religion is never a dimension.

export type Cell = string | number | bigint | null;
export type ReportColumn = { key: string; label: string; align?: "right"; money?: boolean };
export type ReportTable = {
  title: string;
  columns: ReportColumn[];
  rows: Record<string, Cell>[];
  totals?: Record<string, Cell>;
  chart?: { name: string; value: number }[];
  chartLabel?: string;
  note?: string;
};
export type ReportResult = { tables: ReportTable[]; redacted: boolean };

export const REPORTS = {
  disbursements: { label: "Payments register", cap: "reports.financial", blurb: "Every payment in the period, grouped by month." },
  hospitals: { label: "Hospital-wise summary", cap: "reports.operational", blurb: "Cases, patients and amount paid per hospital." },
  diseases: { label: "Disease-wise summary", cap: "reports.operational", blurb: "Patients, cases and amount per disease and category." },
  areas: { label: "Area-wise summary", cap: "reports.operational", blurb: "Cases and amount by mohalla or ward." },
  donations: { label: "Donation register", cap: "reports.financial", blurb: "Donations in the period, by fund and by mode." },
  funds: { label: "Fund statement", cap: "reports.financial", blurb: "Opening, inflow, outflow and closing per fund." },
  beneficiaries: { label: "Beneficiary list", cap: "reports.operational", blurb: "People helped in the period, with amounts." },
  annual: { label: "Annual report pack", cap: "reports.financial", blurb: "Reports 1–7 in one document for the AGM." },
} as const satisfies Record<string, { label: string; cap: Capability; blurb: string }>;
export type ReportKey = keyof typeof REPORTS;

export function canViewReport(ctx: ViewContext, key: ReportKey) {
  if (key === "annual") return can(ctx, "reports.financial") && can(ctx, "reports.operational");
  return can(ctx, REPORTS[key].cap);
}

export type Period = { from: Date; to: Date; label: string };
export function fyPeriod(fy: string): Period {
  const { start, end } = fyRange(fy);
  return { from: start, to: end, label: `FY ${fy}` };
}

const sumBig = (xs: bigint[]) => xs.reduce((s, x) => s + x, 0n);
const toNum = (p: bigint) => Number(p) / 100;

async function livePayments(p: Period) {
  return prisma.payment.findMany({
    where: { ...LIVE_PAYMENT, paymentDate: { gte: p.from, lt: p.to } },
    orderBy: [{ paymentDate: "asc" }, { voucherNo: "asc" }],
    include: {
      hospital: { select: { name: true } },
      application: { select: { caseNo: true, patientId: true, diseaseId: true, hospitalId: true, patient: { select: { personCode: true, fullName: true, areaId: true } } } },
    },
  });
}

async function disbursements(ctx: ViewContext, p: Period): Promise<ReportTable[]> {
  const pays = await livePayments(p);
  const months = byMonth(pays, (x) => x.paymentDate);
  return [
    {
      title: `Payments register — ${p.label}`,
      columns: [
        { key: "month", label: "Month" }, { key: "date", label: "Date" }, { key: "voucher", label: "Voucher" }, { key: "caseNo", label: "Case" },
        { key: "payee", label: "Payee" }, { key: "mode", label: "Mode" }, { key: "ref", label: "Cheque / ref" }, { key: "towards", label: "Towards" },
        { key: "status", label: "Status" }, { key: "amount", label: "Amount", align: "right", money: true },
      ],
      rows: pays.map((x) => ({
        month: fmtMonth(x.paymentDate), date: fmtDate(x.paymentDate), voucher: x.voucherNo, caseNo: x.application.caseNo,
        payee: x.hospital?.name ?? (ctx.meetingMode ? "—" : x.payeeName ?? "—"), mode: PAYMENT_MODE[x.mode], ref: x.chequeNo ?? x.referenceNo ?? "",
        towards: TOWARDS[x.towards], status: PAYMENT_STATUS[x.status], amount: x.amountPaise,
      })),
      totals: { month: "Total", amount: sumBig(pays.map((x) => x.amountPaise)) },
      chart: [...months].map(([m, rows]) => ({ name: m, value: toNum(sumBig(rows.map((x) => x.amountPaise))) })),
      chartLabel: "Amount paid by month",
    },
  ];
}

async function hospitals(_ctx: ViewContext, p: Period): Promise<ReportTable[]> {
  const pays = await livePayments(p);
  const byH = new Map<string, { name: string; cases: Set<string>; patients: Set<string>; total: bigint }>();
  for (const x of pays) {
    const key = x.hospitalId ?? "other";
    const h = byH.get(key) ?? { name: x.hospital?.name ?? "Other payees", cases: new Set(), patients: new Set(), total: 0n };
    h.cases.add(x.applicationId);
    h.patients.add(x.application.patientId);
    h.total += x.amountPaise;
    byH.set(key, h);
  }
  const rows = [...byH.values()].sort((a, b) => (b.total > a.total ? 1 : -1));
  return [{
    title: `Hospital-wise summary — ${p.label}`,
    columns: [
      { key: "name", label: "Hospital" }, { key: "cases", label: "Cases", align: "right" }, { key: "patients", label: "Patients", align: "right" },
      { key: "total", label: "Amount paid", align: "right", money: true }, { key: "avg", label: "Average per case", align: "right", money: true },
    ],
    rows: rows.map((h) => ({ name: h.name, cases: h.cases.size, patients: h.patients.size, total: h.total, avg: h.cases.size ? h.total / BigInt(h.cases.size) : 0n })),
    totals: { name: "Total", cases: rows.reduce((s, h) => s + h.cases.size, 0), total: sumBig(rows.map((h) => h.total)) },
    chart: rows.slice(0, 10).map((h) => ({ name: h.name, value: toNum(h.total) })),
    chartLabel: "Amount paid by hospital",
  }];
}

async function diseases(_ctx: ViewContext, p: Period): Promise<ReportTable[]> {
  const [pays, dis] = await Promise.all([livePayments(p), prisma.disease.findMany({ include: { category: true } })]);
  const byD = new Map<string, { cat: string; name: string; cases: Set<string>; patients: Set<string>; total: bigint }>();
  for (const x of pays) {
    const d = dis.find((y) => y.id === x.application.diseaseId);
    const key = d?.id ?? "none";
    const r = byD.get(key) ?? { cat: d?.category.name ?? "Not recorded", name: d?.name ?? "Not recorded", cases: new Set(), patients: new Set(), total: 0n };
    r.cases.add(x.applicationId);
    r.patients.add(x.application.patientId);
    r.total += x.amountPaise;
    byD.set(key, r);
  }
  const rows = [...byD.values()].sort((a, b) => a.cat.localeCompare(b.cat) || (b.total > a.total ? 1 : -1));
  const cats = new Map<string, bigint>();
  for (const r of rows) cats.set(r.cat, (cats.get(r.cat) ?? 0n) + r.total);
  return [{
    title: `Disease-wise summary — ${p.label}`,
    columns: [
      { key: "cat", label: "Category" }, { key: "name", label: "Disease" }, { key: "patients", label: "Patients", align: "right" },
      { key: "cases", label: "Cases", align: "right" }, { key: "total", label: "Amount paid", align: "right", money: true },
    ],
    rows: rows.map((r) => ({ cat: r.cat, name: r.name, patients: r.patients.size, cases: r.cases.size, total: r.total })),
    totals: { cat: "Total", total: sumBig(rows.map((r) => r.total)) },
    chart: [...cats.entries()].map(([name, v]) => ({ name, value: toNum(v) })),
    chartLabel: "Amount paid by disease category",
  }];
}

async function areas(_ctx: ViewContext, p: Period): Promise<ReportTable[]> {
  const [pays, apps, areaRows] = await Promise.all([
    livePayments(p),
    prisma.application.findMany({ where: { applicationDate: { gte: p.from, lt: p.to }, status: { not: "DRAFT" } }, select: { id: true, patient: { select: { areaId: true } } } }),
    prisma.area.findMany(),
  ]);
  const name = (id: string | null) => areaRows.find((a) => a.id === id)?.name ?? "Not recorded";
  const byA = new Map<string, { cases: number; total: bigint }>();
  for (const a of apps) {
    const k = name(a.patient.areaId);
    byA.set(k, { cases: (byA.get(k)?.cases ?? 0) + 1, total: byA.get(k)?.total ?? 0n });
  }
  for (const x of pays) {
    const k = name(x.application.patient.areaId);
    byA.set(k, { cases: byA.get(k)?.cases ?? 0, total: (byA.get(k)?.total ?? 0n) + x.amountPaise });
  }
  const rows = [...byA.entries()].sort((a, b) => (b[1].total > a[1].total ? 1 : -1));
  return [{
    title: `Area-wise summary — ${p.label}`,
    columns: [{ key: "area", label: "Area" }, { key: "cases", label: "Cases received", align: "right" }, { key: "total", label: "Amount paid", align: "right", money: true }],
    rows: rows.map(([area, v]) => ({ area, cases: v.cases, total: v.total })),
    totals: { area: "Total", cases: apps.length, total: sumBig(rows.map(([, v]) => v.total)) },
    chart: rows.slice(0, 12).map(([area, v]) => ({ name: area, value: toNum(v.total) })),
    chartLabel: "Amount paid by area",
    note: "The area list is a demo list until the trust supplies its own.",
  }];
}

async function donations(ctx: ViewContext, p: Period): Promise<ReportTable[]> {
  const rows = await prisma.donation.findMany({
    where: { donationDate: { gte: p.from, lt: p.to }, cancelledAt: null },
    orderBy: [{ donationDate: "asc" }, { receiptNo: "asc" }],
    include: { donor: true, fund: true },
  });
  const byFund = new Map<string, bigint>();
  const byMode = new Map<string, bigint>();
  for (const d of rows) {
    byFund.set(d.fund.name, (byFund.get(d.fund.name) ?? 0n) + d.amountPaise);
    byMode.set(PAYMENT_MODE[d.mode], (byMode.get(PAYMENT_MODE[d.mode]) ?? 0n) + d.amountPaise);
  }
  const total = sumBig(rows.map((d) => d.amountPaise));
  return [
    {
      title: `Donation register — ${p.label}`,
      columns: [
        { key: "date", label: "Date" }, { key: "receipt", label: "Receipt" }, { key: "donor", label: "Donor" }, { key: "fund", label: "Fund" },
        { key: "mode", label: "Mode" }, { key: "ref", label: "Reference" }, { key: "amount", label: "Amount", align: "right", money: true },
      ],
      rows: rows.map((d) => ({ date: fmtDate(d.donationDate), receipt: d.receiptNo, donor: donorName(d.donor, ctx), fund: d.fund.name, mode: PAYMENT_MODE[d.mode], ref: d.chequeNo ?? d.referenceNo ?? "", amount: d.amountPaise })),
      totals: { date: "Total", amount: total },
      chart: [...byMode.entries()].map(([name, v]) => ({ name, value: toNum(v) })),
      chartLabel: "Donations by mode",
    },
    {
      title: "By fund",
      columns: [{ key: "fund", label: "Fund" }, { key: "amount", label: "Amount", align: "right", money: true }],
      rows: [...byFund.entries()].map(([fund, amount]) => ({ fund, amount })),
      totals: { fund: "Total", amount: total },
    },
  ];
}

async function fundStatement(_ctx: ViewContext, p: Period): Promise<ReportTable[]> {
  const funds = await prisma.fund.findMany({ orderBy: { name: "asc" } });
  const rows = await Promise.all(
    funds.map(async (f) => {
      const agg = async (from: Date | null, to: Date) => {
        const range = from ? { gte: from, lt: to } : { lt: to };
        const [d, pay, e] = await Promise.all([
          prisma.donation.aggregate({ where: { fundId: f.id, cancelledAt: null, donationDate: range }, _sum: { amountPaise: true } }),
          prisma.payment.aggregate({ where: { ...LIVE_PAYMENT, fundId: f.id, paymentDate: range }, _sum: { amountPaise: true } }),
          prisma.expense.aggregate({ where: { fundId: f.id, deletedAt: null, expenseDate: range }, _sum: { amountPaise: true } }),
        ]);
        return { inflow: d._sum.amountPaise ?? 0n, aid: pay._sum.amountPaise ?? 0n, expenses: e._sum.amountPaise ?? 0n };
      };
      const before = await agg(null, p.from);
      const during = await agg(p.from, p.to);
      const opening = f.openingBalancePaise + before.inflow - before.aid - before.expenses;
      const closing = opening + during.inflow - during.aid - during.expenses;
      return { fund: f.name + (f.isActive ? "" : " (inactive)"), opening, inflow: during.inflow, aid: during.aid, expenses: during.expenses, closing };
    }),
  );
  return [{
    title: `Fund statement — ${p.label}`,
    columns: [
      { key: "fund", label: "Fund" }, { key: "opening", label: "Opening", align: "right", money: true }, { key: "inflow", label: "Donations", align: "right", money: true },
      { key: "aid", label: "Aid paid", align: "right", money: true }, { key: "expenses", label: "Expenses", align: "right", money: true }, { key: "closing", label: "Closing", align: "right", money: true },
    ],
    rows,
    totals: {
      fund: "Total", opening: sumBig(rows.map((r) => r.opening)), inflow: sumBig(rows.map((r) => r.inflow)), aid: sumBig(rows.map((r) => r.aid)),
      expenses: sumBig(rows.map((r) => r.expenses)), closing: sumBig(rows.map((r) => r.closing)),
    },
    note: "Closing = opening + donations − aid paid − expenses. Cancelled and bounced payments are excluded; reversals net against the original.",
  }];
}

/** Redaction-aware: names appear only when unredacted (and unredacted export is SUPER_ADMIN-only). */
async function beneficiaries(ctx: ViewContext, p: Period, unredacted: boolean): Promise<ReportTable[]> {
  const pays = await livePayments(p);
  const showNames = unredacted && !ctx.meetingMode;
  const byP = new Map<string, { code: string; name: string; cases: Set<string>; total: bigint; last: Date }>();
  for (const x of pays) {
    const pt = x.application.patient;
    const r = byP.get(x.application.patientId) ?? { code: pt.personCode, name: pt.fullName, cases: new Set(), total: 0n, last: x.paymentDate };
    r.cases.add(x.application.caseNo);
    r.total += x.amountPaise;
    if (x.paymentDate > r.last) r.last = x.paymentDate;
    byP.set(x.application.patientId, r);
  }
  const rows = [...byP.values()].sort((a, b) => a.code.localeCompare(b.code));
  return [{
    title: `Beneficiary list — ${p.label}`,
    columns: [
      { key: "code", label: "Person code" }, ...(showNames ? [{ key: "name", label: "Name" }] : []), { key: "cases", label: "Cases" },
      { key: "last", label: "Last paid" }, { key: "total", label: "Amount", align: "right" as const, money: true },
    ],
    rows: rows.map((r) => ({ code: r.code, ...(showNames ? { name: r.name } : {}), cases: [...r.cases].join(", "), last: fmtDate(r.last), total: r.total })),
    totals: { code: `${rows.length} people`, total: sumBig(rows.map((r) => r.total)) },
    note: showNames ? "Contains names. Handle as confidential." : "Identities are shown as person codes.",
  }];
}

export async function runReport(ctx: ViewContext, key: ReportKey, p: Period, opts: { unredacted?: boolean } = {}): Promise<ReportResult> {
  const unredacted = !!opts.unredacted && can(ctx, "reports.exportUnredacted") && !ctx.meetingMode;
  switch (key) {
    case "disbursements": return { tables: await disbursements(ctx, p), redacted: true };
    case "hospitals": return { tables: await hospitals(ctx, p), redacted: true };
    case "diseases": return { tables: await diseases(ctx, p), redacted: true };
    case "areas": return { tables: await areas(ctx, p), redacted: true };
    case "donations": return { tables: await donations(ctx, p), redacted: true };
    case "funds": return { tables: await fundStatement(ctx, p), redacted: true };
    case "beneficiaries": return { tables: await beneficiaries(ctx, p, unredacted), redacted: !unredacted };
    case "annual": {
      const parts = await Promise.all([
        fundStatement(ctx, p), disbursements(ctx, p), hospitals(ctx, p), diseases(ctx, p), areas(ctx, p), donations(ctx, p), beneficiaries(ctx, p, false),
      ]);
      return { tables: parts.flat(), redacted: true };
    }
  }
}

/** Plain-text cell for tables, Excel and PDF. */
export function cellText(v: Cell, money?: boolean): string {
  if (v == null) return "";
  if (typeof v === "bigint") return money ? formatINR(v) : v.toString();
  return String(v);
}
