import "server-only";
import type { Donor, DonorType, ExpenseCategory, PaymentMode, Prisma } from "@prisma/client";
import { includeDeleted, prisma } from "@/lib/db";
import { fyRange } from "@/lib/fy";
import { can } from "@/lib/auth/permissions";
import { AMOUNT_BANDS, DONOR_TYPE, EXPENSE_CATEGORY, PAYMENT_MODE, type AmountBand } from "@/lib/labels";
import type { readParams } from "@/lib/params";
import type { ViewContext } from "@/lib/redact";
import { pageArgs, PAGE_SIZE, type Page } from "./shared";

/** Anonymous donors render as "Anonymous donor" except to SUPER_ADMIN and ACCOUNTANT. */
export function donorName(d: Pick<Donor, "name" | "isAnonymous">, ctx: ViewContext): string {
  return d.isAnonymous && !can(ctx, "donors.seeAnonymous") ? "Anonymous donor" : d.name;
}

export type DonationRow = {
  id: string;
  receiptNo: string;
  donationDate: Date;
  donorId: string;
  donorName: string;
  fundName: string;
  amountPaise: bigint;
  mode: PaymentMode;
  referenceNo: string | null;
  chequeNo: string | null;
  cancelled: boolean;
  isReceiptIssued: boolean;
};

type Dir = Prisma.SortOrder;
type Params = Awaited<ReturnType<typeof readParams>>;
const dirOf = (s: string): Dir => (s.startsWith("-") ? "desc" : "asc");
const keyOf = <K extends string>(s: string) => s.replace(/^-/, "") as K;
const sortsOf = <K extends string>(o: Record<K, unknown>) => Object.keys(o).flatMap((k) => [k, `-${k}`]) as (K | `-${K}`)[];
const band = (p: Params) => {
  const b = p.oneOf("amount", Object.keys(AMOUNT_BANDS) as AmountBand[]);
  return { minPaise: b ? AMOUNT_BANDS[b].min : null, maxPaise: b ? AMOUNT_BANDS[b].max : null };
};

const DONATION_ORDER = {
  receipt: (d: Dir) => [{ receiptNo: d }],
  date: (d: Dir) => [{ donationDate: d }],
  // Anonymous donors group together first, so the order never hints at a hidden name's place among the others.
  // Inside the group a name tie-break would still rank hidden names, so roles that cannot see them get donor code.
  // ponytail: Prisma has no CASE in orderBy, so those roles get donor-code order for named donors too.
  donor: (d: Dir, seeAnon: boolean) => [{ donor: { isAnonymous: d } }, { donor: seeAnon ? { name: d } : { donorCode: d } }],
  fund: (d: Dir) => [{ fund: { name: d } }],
  mode: (d: Dir) => [{ mode: d }],
  ref: (d: Dir) => [{ chequeNo: { sort: d, nulls: "last" } }, { referenceNo: { sort: d, nulls: "last" } }],
  amount: (d: Dir) => [{ amountPaise: d }],
} satisfies Record<string, (d: Dir, seeAnon: boolean) => Prisma.DonationOrderByWithRelationInput[]>;
type DonationSortKey = keyof typeof DONATION_ORDER;
export type DonationSort = DonationSortKey | `-${DonationSortKey}`;
export const DONATION_SORTS = sortsOf(DONATION_ORDER);

export type DonationFilters = {
  fy?: string; q?: string; mode?: PaymentMode; donorId?: string; fundId?: string; from?: Date; to?: Date;
  minPaise?: bigint | null; maxPaise?: bigint | null; sort?: DonationSort; page?: number;
  /** Every matching row, unpaginated (exports). */
  all?: boolean;
};

/** The URL filters of the Donations page, shared with its export. */
export function donationFilters(p: Params, ctx: ViewContext): DonationFilters {
  return {
    fy: p.fy() ?? (p.str("fy") === "all" ? undefined : ctx.fy), q: p.str("q"),
    mode: p.oneOf("mode", Object.keys(PAYMENT_MODE) as PaymentMode[]),
    fundId: p.str("fund"), from: p.date("from"), to: p.dateEnd("to"), ...band(p),
    sort: p.oneOf("sort", DONATION_SORTS),
  };
}

export async function listDonations(ctx: ViewContext, f: DonationFilters) {
  const and: Prisma.DonationWhereInput[] = [];
  if (f.fy) {
    const { start, end } = fyRange(f.fy);
    and.push({ donationDate: { gte: start, lt: end } });
  }
  if (f.mode) and.push({ mode: f.mode });
  if (f.donorId) and.push({ donorId: f.donorId });
  if (f.fundId) and.push({ fundId: f.fundId });
  if (f.from) and.push({ donationDate: { gte: f.from } });
  if (f.to) and.push({ donationDate: { lt: f.to } });
  if (f.minPaise != null) and.push({ amountPaise: { gte: f.minPaise } });
  if (f.maxPaise != null) and.push({ amountPaise: { lt: f.maxPaise } });
  const q = f.q?.trim();
  if (q) {
    const or: Prisma.DonationWhereInput[] = [{ receiptNo: { contains: q, mode: "insensitive" } }, { referenceNo: { contains: q, mode: "insensitive" } }];
    // Name search must not find anonymous donors for users who cannot see their names.
    or.push({ donor: { name: { contains: q, mode: "insensitive" }, ...(can(ctx, "donors.seeAnonymous") ? {} : { isAnonymous: false }) } });
    and.push({ OR: or });
  }
  const where: Prisma.DonationWhereInput = { AND: and };
  const sort = f.sort ?? "-date";
  const [rows, total, groups, funds] = await Promise.all([
    prisma.donation.findMany({
      where,
      orderBy: [...DONATION_ORDER[keyOf<DonationSortKey>(sort)](dirOf(sort), can(ctx, "donors.seeAnonymous")), { receiptNo: dirOf(sort) }],
      ...(f.all ? {} : pageArgs(f.page ?? 1)),
      include: { donor: true, fund: true },
    }),
    prisma.donation.count({ where }),
    prisma.donation.groupBy({ by: ["fundId", "isReceiptIssued"], where: { AND: [...and, { cancelledAt: null }] }, _count: true, _sum: { amountPaise: true } }),
    prisma.fund.findMany({ where: includeDeleted, select: { id: true, type: true } }),
  ]);
  const zakat = new Set(funds.filter((x) => x.type === "ZAKAT").map((x) => x.id));
  const stats = { receivedPaise: 0n, zakatPaise: 0n, otherPaise: 0n, receiptsPending: 0 };
  for (const g of groups) {
    const amt = g._sum.amountPaise ?? 0n;
    stats.receivedPaise += amt;
    if (zakat.has(g.fundId)) stats.zakatPaise += amt;
    else stats.otherPaise += amt;
    if (!g.isReceiptIssued) stats.receiptsPending += g._count;
  }
  const page: Page<DonationRow> = {
    rows: rows.map((d) => ({
      id: d.id, receiptNo: d.receiptNo, donationDate: d.donationDate, donorId: d.donorId, donorName: donorName(d.donor, ctx),
      fundName: d.fund.name, amountPaise: d.amountPaise, mode: d.mode, referenceNo: d.referenceNo, chequeNo: d.chequeNo,
      cancelled: !!d.cancelledAt, isReceiptIssued: d.isReceiptIssued,
    })),
    total, page: f.page ?? 1, pageSize: PAGE_SIZE,
  };
  return { ...page, totalPaise: stats.receivedPaise, stats };
}

export type DonorRow = {
  id: string; donorCode: string; name: string; type: DonorType; city: string | null; phone: string | null; isAnonymous: boolean;
  lifetimePaise: bigint; lastDonationAt: Date | null; count: number; fyPaise: bigint;
};
const DONOR_ORDER = {
  code: (r: DonorRow) => r.donorCode,
  name: (r: DonorRow) => r.name.toLowerCase(), // the displayed name, so hidden names never steer the order
  type: (r: DonorRow) => r.type,
  city: (r: DonorRow) => r.city?.toLowerCase() ?? null,
  count: (r: DonorRow) => r.count,
  last: (r: DonorRow) => r.lastDonationAt?.getTime() ?? null,
  total: (r: DonorRow) => r.lifetimePaise,
} satisfies Record<string, (r: DonorRow) => string | number | bigint | null>;
type DonorSortKey = keyof typeof DONOR_ORDER;
export type DonorSort = DonorSortKey | `-${DonorSortKey}`;
export const DONOR_SORTS = sortsOf(DONOR_ORDER);

export type DonorFilters = {
  q?: string; type?: DonorType; from?: Date; to?: Date; minPaise?: bigint | null; maxPaise?: bigint | null;
  sort?: DonorSort; page?: number; all?: boolean;
};

export function donorFilters(p: Params): DonorFilters {
  return {
    q: p.str("q"), type: p.oneOf("type", Object.keys(DONOR_TYPE) as DonorType[]), from: p.date("from"), to: p.dateEnd("to"), ...band(p),
    sort: p.oneOf("sort", DONOR_SORTS),
  };
}

/**
 * Donor registry. "Given", "Donations" and "Last donation" cover From–To when set (donors with
 * nothing in that window drop out), otherwise their lifetime; the amount band filters on "Given".
 * ponytail: every matching donor is aggregated and sorted in memory (two groupBy queries, no N+1),
 * fine for thousands of donors; move the sort into SQL if the registry grows past ~50k.
 */
export async function listDonors(ctx: ViewContext, f: DonorFilters) {
  const seeAnon = can(ctx, "donors.seeAnonymous");
  const and: Prisma.DonorWhereInput[] = [];
  const q = f.q?.trim();
  if (q) {
    const guard = seeAnon ? {} : { isAnonymous: false };
    and.push({
      OR: [
        { donorCode: { contains: q.toUpperCase() } },
        { name: { contains: q, mode: "insensitive" }, ...guard },
        { phone: { contains: q }, ...guard },
      ],
    });
  }
  if (f.type) and.push({ type: f.type });
  const where: Prisma.DonorWhereInput = { AND: and };
  const period = f.from || f.to ? { donationDate: { ...(f.from ? { gte: f.from } : {}), ...(f.to ? { lt: f.to } : {}) } } : {};
  const fy = fyRange(ctx.fy);
  const [donors, given, inFy] = await Promise.all([
    prisma.donor.findMany({ where, select: { id: true, donorCode: true, name: true, isAnonymous: true, type: true, city: true, phone: true } }),
    prisma.donation.groupBy({
      by: ["donorId"], where: { cancelledAt: null, donor: where, ...period },
      _sum: { amountPaise: true }, _max: { donationDate: true }, _count: true,
    }),
    prisma.donation.groupBy({
      by: ["donorId"], where: { cancelledAt: null, donor: where, donationDate: { gte: fy.start, lt: fy.end } }, _sum: { amountPaise: true },
    }),
  ]);
  const byId = new Map(given.map((g) => [g.donorId, g]));
  const fyById = new Map(inFy.map((g) => [g.donorId, g._sum.amountPaise ?? 0n]));
  let rows: DonorRow[] = donors.map((d) => {
    const s = byId.get(d.id);
    const hidden = d.isAnonymous && !seeAnon;
    return {
      id: d.id, donorCode: d.donorCode, name: donorName(d, ctx), type: d.type, city: hidden ? null : d.city, isAnonymous: d.isAnonymous,
      phone: hidden ? null : d.phone,
      lifetimePaise: s?._sum.amountPaise ?? 0n, lastDonationAt: s?._max.donationDate ?? null, count: s?._count ?? 0,
      fyPaise: fyById.get(d.id) ?? 0n,
    };
  });
  if (f.from || f.to) rows = rows.filter((r) => r.count > 0);
  if (f.minPaise != null) rows = rows.filter((r) => r.lifetimePaise >= f.minPaise!);
  if (f.maxPaise != null) rows = rows.filter((r) => r.lifetimePaise < f.maxPaise!);

  const sort = f.sort ?? "name";
  const key = DONOR_ORDER[keyOf<DonorSortKey>(sort)];
  const sign = dirOf(sort) === "desc" ? -1 : 1;
  rows.sort((a, b) => {
    const x = key(a), y = key(b);
    if (x === y) return a.donorCode.localeCompare(b.donorCode);
    if (x == null) return 1; // empties last either way
    if (y == null) return -1;
    return (x < y ? -1 : 1) * sign;
  });

  const givenPaise = rows.reduce((s, r) => s + r.lifetimePaise, 0n);
  const gifts = rows.reduce((s, r) => s + r.count, 0);
  const stats = {
    donors: rows.length,
    fyPaise: rows.reduce((s, r) => s + r.fyPaise, 0n),
    anonymous: rows.filter((r) => r.isAnonymous).length,
    averagePaise: gifts ? givenPaise / BigInt(gifts) : 0n,
  };
  const page = f.page ?? 1;
  const { skip, take } = pageArgs(page);
  return { rows: f.all ? rows : rows.slice(skip, skip + take), total: rows.length, page, pageSize: PAGE_SIZE, stats };
}

export async function getDonor(ctx: ViewContext, id: string) {
  const d = await prisma.donor.findFirst({ where: { id } });
  if (!d) return null;
  const hidden = d.isAnonymous && !can(ctx, "donors.seeAnonymous");
  const donations = await prisma.donation.findMany({ where: { donorId: id }, orderBy: { donationDate: "desc" }, include: { fund: true } });
  return {
    donor: {
      id: d.id, donorCode: d.donorCode, name: donorName(d, ctx), type: d.type, isAnonymous: d.isAnonymous,
      phone: hidden ? null : d.phone, email: hidden ? null : d.email, addressLine: hidden ? null : d.addressLine,
      city: hidden ? null : d.city, country: hidden ? null : d.country, panLast4: hidden ? null : d.panLast4, notes: hidden ? null : d.notes,
    },
    donations: donations.map((x) => ({
      id: x.id, receiptNo: x.receiptNo, donationDate: x.donationDate, fundName: x.fund.name, amountPaise: x.amountPaise,
      mode: x.mode, referenceNo: x.referenceNo, cancelled: !!x.cancelledAt, purposeNote: hidden ? null : x.purposeNote,
    })),
    lifetimePaise: donations.filter((x) => !x.cancelledAt).reduce((s, x) => s + x.amountPaise, 0n),
  };
}

/** Raw donor row for the edit form — only for roles that may write donations. */
export async function getDonorForEdit(ctx: ViewContext, id: string) {
  if (!can(ctx, "donations.write")) return null;
  return prisma.donor.findFirst({ where: { id } });
}

export async function getDonation(ctx: ViewContext, id: string) {
  const d = await prisma.donation.findFirst({ where: { id }, include: { donor: true, fund: true, bank: true } });
  if (!d) return null;
  // In Meeting Mode a donation earmarked to a case must not tie a donor to that case (as on getApplication).
  const veiled = ctx.meetingMode && !!d.earmarkApplicationId;
  const hidden = veiled || (d.donor.isAnonymous && !can(ctx, "donors.seeAnonymous"));
  const earmark = d.earmarkApplicationId
    ? await prisma.application.findFirst({ where: { id: d.earmarkApplicationId }, select: { id: true, caseNo: true } })
    : null;
  return {
    id: d.id, receiptNo: d.receiptNo, donationDate: d.donationDate, amountPaise: d.amountPaise, mode: d.mode,
    referenceNo: d.referenceNo, chequeNo: d.chequeNo, bankId: d.bankId, bankName: d.bank?.name ?? null, purposeNote: hidden ? null : d.purposeNote,
    fundName: d.fund.name, fundId: d.fundId, isReceiptIssued: d.isReceiptIssued, cancelledAt: d.cancelledAt, cancelReason: d.cancelReason,
    earmark,
    donor: {
      id: d.donor.id, donorCode: d.donor.donorCode, name: veiled ? "Donor" : donorName(d.donor, ctx),
      addressLine: hidden ? null : d.donor.addressLine, city: hidden ? null : d.donor.city, panLast4: hidden ? null : d.donor.panLast4,
      isAnonymous: d.donor.isAnonymous,
    },
  };
}

export async function donorOptions(ctx: ViewContext) {
  const rows = await prisma.donor.findMany({ orderBy: { name: "asc" }, select: { id: true, donorCode: true, name: true, isAnonymous: true } });
  return rows.map((d) => ({ id: d.id, label: donorName(d, ctx), hint: d.donorCode }));
}

// ─────────────────────────── expenses ───────────────────────────

const EXPENSE_ORDER = {
  voucher: (d: Dir) => [{ voucherNo: d }],
  date: (d: Dir) => [{ expenseDate: d }],
  category: (d: Dir) => [{ category: d }],
  description: (d: Dir) => [{ description: d }],
  paidTo: (d: Dir) => [{ paidTo: { sort: d, nulls: "last" } }],
  mode: (d: Dir) => [{ mode: d }],
  fund: (d: Dir) => [{ fund: { name: d } }],
  amount: (d: Dir) => [{ amountPaise: d }],
} satisfies Record<string, (d: Dir) => Prisma.ExpenseOrderByWithRelationInput[]>;
type ExpenseSortKey = keyof typeof EXPENSE_ORDER;
export type ExpenseSort = ExpenseSortKey | `-${ExpenseSortKey}`;
export const EXPENSE_SORTS = sortsOf(EXPENSE_ORDER);

export type ExpenseFilters = {
  fy?: string; q?: string; category?: ExpenseCategory; fundId?: string; mode?: PaymentMode; from?: Date; to?: Date;
  minPaise?: bigint | null; maxPaise?: bigint | null; sort?: ExpenseSort; page?: number; all?: boolean;
};

export function expenseFilters(p: Params, ctx: ViewContext): ExpenseFilters {
  return {
    fy: p.fy() ?? (p.str("fy") === "all" ? undefined : ctx.fy), q: p.str("q"),
    category: p.oneOf("category", Object.keys(EXPENSE_CATEGORY) as ExpenseCategory[]), fundId: p.str("fund"),
    mode: p.oneOf("mode", Object.keys(PAYMENT_MODE) as PaymentMode[]), from: p.date("from"), to: p.dateEnd("to"), ...band(p),
    sort: p.oneOf("sort", EXPENSE_SORTS),
  };
}

export async function listExpenses(ctx: ViewContext, f: ExpenseFilters) {
  const and: Prisma.ExpenseWhereInput[] = [];
  if (f.fy) {
    const { start, end } = fyRange(f.fy);
    and.push({ expenseDate: { gte: start, lt: end } });
  }
  if (f.category) and.push({ category: f.category });
  if (f.fundId) and.push({ fundId: f.fundId });
  if (f.mode) and.push({ mode: f.mode });
  if (f.from) and.push({ expenseDate: { gte: f.from } });
  if (f.to) and.push({ expenseDate: { lt: f.to } });
  if (f.minPaise != null) and.push({ amountPaise: { gte: f.minPaise } });
  if (f.maxPaise != null) and.push({ amountPaise: { lt: f.maxPaise } });
  const q = f.q?.trim();
  if (q) {
    and.push({
      OR: [
        { voucherNo: { contains: q, mode: "insensitive" } }, { description: { contains: q, mode: "insensitive" } },
        { paidTo: { contains: q, mode: "insensitive" } }, { referenceNo: { contains: q, mode: "insensitive" } },
      ],
    });
  }
  const where: Prisma.ExpenseWhereInput = { AND: and };
  const sort = f.sort ?? "-date";
  const [rows, byCat] = await Promise.all([
    prisma.expense.findMany({
      where,
      orderBy: [...EXPENSE_ORDER[keyOf<ExpenseSortKey>(sort)](dirOf(sort)), { voucherNo: dirOf(sort) }],
      ...(f.all ? {} : pageArgs(f.page ?? 1)),
      include: { fund: true },
    }),
    prisma.expense.groupBy({ by: ["category"], where, _sum: { amountPaise: true }, _count: true }),
  ]);
  const byCategory = byCat
    .map((c) => ({ category: c.category, paise: c._sum.amountPaise ?? 0n, count: c._count }))
    .sort((a, b) => (b.paise > a.paise ? 1 : b.paise < a.paise ? -1 : 0));
  const total = byCategory.reduce((s, c) => s + c.count, 0);
  const spentPaise = byCategory.reduce((s, c) => s + c.paise, 0n);
  return {
    rows: rows.map((e) => ({
      id: e.id, voucherNo: e.voucherNo, expenseDate: e.expenseDate, category: e.category, description: e.description,
      amountPaise: e.amountPaise, fundName: e.fund.name, paidTo: e.paidTo, mode: e.mode,
    })),
    total, page: f.page ?? 1, pageSize: PAGE_SIZE,
    byCategory: byCategory.map((c) => ({ category: c.category, amount: Number(c.paise) / 100 })),
    stats: { spentPaise, count: total, top: byCategory[0] ?? null, averagePaise: total ? spentPaise / BigInt(total) : 0n },
  };
}
