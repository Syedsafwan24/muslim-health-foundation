import "server-only";
import type { Payment, PaymentMode, PaymentStatus, PaymentTowards, Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { fyBounds } from "@/lib/fy/db";
import type { ViewContext } from "@/lib/redact";
import { can } from "@/lib/auth/permissions";
import { AMOUNT_BANDS, PAYMENT_MODE, PAYMENT_STATUS, type AmountBand } from "@/lib/labels";
import type { readParams } from "@/lib/params";
import { pageArgs, PAGE_SIZE, type Page } from "./shared";

export type PaymentView = {
  id: string;
  voucherNo: string;
  applicationId: string;
  amountPaise: bigint;
  mode: PaymentMode;
  chequeNo: string | null;
  bankName: string | null;
  referenceNo: string | null;
  paymentDate: Date;
  towards: PaymentTowards;
  payeeType: string;
  hospitalName: string | null;
  /** Absent in Meeting Mode — it is often the applicant's own name. */
  payeeName?: string | null;
  bouncedReason?: string | null;
  remark?: string | null;
  status: PaymentStatus;
  clearedAt: Date | null;
  isReversal: boolean;
  fundName: string;
};

/** Payee name, remark and bounce reason: hidden in Meeting Mode and from roles that only see amounts. */
export function payeeMasked(ctx: ViewContext): boolean {
  return ctx.meetingMode || !can(ctx, "payments.write");
}

type Row = Payment & { hospital?: { name: string } | null; bank?: { name: string } | null; fund?: { name: string } | null };

export function paymentView(p: Row, masked: boolean): PaymentView {
  return {
    id: p.id,
    voucherNo: p.voucherNo,
    applicationId: p.applicationId,
    amountPaise: p.amountPaise,
    mode: p.mode,
    chequeNo: p.chequeNo,
    bankName: p.bank?.name ?? null,
    referenceNo: p.referenceNo,
    paymentDate: p.paymentDate,
    towards: p.towards,
    payeeType: p.payeeType,
    hospitalName: p.hospital?.name ?? null,
    ...(masked ? {} : { payeeName: p.payeeName, bouncedReason: p.bouncedReason, remark: p.remark }),
    status: p.status,
    clearedAt: p.clearedAt,
    isReversal: !!p.reversalOfId,
    fundName: p.fund?.name ?? "",
  };
}

export type PaymentFilters = {
  status?: PaymentStatus[];
  mode?: PaymentMode;
  bankId?: string;
  hospitalId?: string;
  fundId?: string;
  fy?: string;
  from?: Date;
  to?: Date;
  q?: string;
  uncleared30?: boolean;
  minPaise?: bigint | null;
  maxPaise?: bigint | null;
  sort?: PaymentSort;
  page?: number;
  /** Every matching row, unpaginated (exports). */
  all?: boolean;
};

type Dir = Prisma.SortOrder;
const PAYMENT_ORDER = {
  voucher: (d: Dir) => [{ voucherNo: d }],
  date: (d: Dir) => [{ paymentDate: d }],
  case: (d: Dir) => [{ application: { caseNo: d } }],
  // Payee names hide in Meeting Mode, so the order must not reveal them: hospital name only then.
  payee: (d: Dir, masked: boolean) => [{ hospital: { name: d } }, ...(masked ? [] : [{ payeeName: { sort: d, nulls: "last" } } as const])],
  mode: (d: Dir) => [{ mode: d }],
  ref: (d: Dir) => [{ chequeNo: { sort: d, nulls: "last" } }, { referenceNo: { sort: d, nulls: "last" } }],
  towards: (d: Dir) => [{ towards: d }],
  amount: (d: Dir) => [{ amountPaise: d }],
  status: (d: Dir) => [{ status: d }],
} satisfies Record<string, (d: Dir, masked: boolean) => Prisma.PaymentOrderByWithRelationInput[]>;
type PaymentSortKey = keyof typeof PAYMENT_ORDER;
export type PaymentSort = PaymentSortKey | `-${PaymentSortKey}`;
export const PAYMENT_SORTS = Object.keys(PAYMENT_ORDER).flatMap((k) => [k, `-${k}`]) as PaymentSort[];

function paymentOrder(s: PaymentSort, masked: boolean): Prisma.PaymentOrderByWithRelationInput[] {
  const d: Dir = s.startsWith("-") ? "desc" : "asc";
  return [...PAYMENT_ORDER[s.replace(/^-/, "") as PaymentSortKey](d, masked), { voucherNo: d }];
}

/** The URL filters of the Payments page, shared with its export. */
export function paymentFilters(p: Awaited<ReturnType<typeof readParams>>, ctx: ViewContext): PaymentFilters {
  const band = p.oneOf("amount", Object.keys(AMOUNT_BANDS) as AmountBand[]);
  const statuses = (p.str("status") ?? "").split(",").filter((s): s is PaymentStatus => s in PAYMENT_STATUS);
  return {
    status: statuses.length ? statuses : undefined,
    mode: p.oneOf("mode", Object.keys(PAYMENT_MODE) as PaymentMode[]),
    bankId: p.str("bank"),
    hospitalId: p.str("hospital"),
    fundId: p.str("fund"),
    fy: p.fy() ?? (p.str("fy") === "all" ? undefined : ctx.fy),
    from: p.date("from"),
    to: p.dateEnd("to"),
    q: p.str("q"),
    uncleared30: p.flag("uncleared30"),
    minPaise: band ? AMOUNT_BANDS[band].min : null,
    maxPaise: band ? AMOUNT_BANDS[band].max : null,
    sort: p.oneOf("sort", PAYMENT_SORTS),
  };
}

export async function listPayments(ctx: ViewContext, f: PaymentFilters) {
  const and: Prisma.PaymentWhereInput[] = [];
  if (f.fy) {
    const { start, end } = await fyBounds(f.fy);
    and.push({ paymentDate: { gte: start, lt: end } });
  }
  if (f.status?.length) and.push({ status: { in: f.status } });
  if (f.mode) and.push({ mode: f.mode });
  if (f.bankId) and.push({ bankId: f.bankId });
  if (f.hospitalId) and.push({ hospitalId: f.hospitalId });
  if (f.fundId) and.push({ fundId: f.fundId });
  if (f.from) and.push({ paymentDate: { gte: f.from } });
  if (f.to) and.push({ paymentDate: { lt: f.to } });
  if (f.minPaise != null) and.push({ amountPaise: { gte: f.minPaise } });
  if (f.maxPaise != null) and.push({ amountPaise: { lt: f.maxPaise } });
  if (f.uncleared30) and.push({ status: "ISSUED", clearedAt: null, paymentDate: { lt: new Date(Date.now() - 30 * 864e5) } });
  const q = f.q?.trim();
  if (q) {
    and.push({
      OR: [
        { voucherNo: { contains: q, mode: "insensitive" } },
        { chequeNo: { contains: q } },
        { referenceNo: { contains: q, mode: "insensitive" } },
        { application: { caseNo: { contains: q, mode: "insensitive" } } },
      ],
    });
  }
  const where: Prisma.PaymentWhereInput = { AND: and };
  const [rows, groups] = await Promise.all([
    prisma.payment.findMany({
      where,
      orderBy: paymentOrder(f.sort ?? "-date", payeeMasked(ctx)),
      ...(f.all ? {} : pageArgs(f.page ?? 1)),
      include: { hospital: true, bank: true, fund: true, application: { select: { caseNo: true } } },
    }),
    // One grouped query gives the count, the total and every stat card.
    prisma.payment.groupBy({ by: ["status", "mode"], where, _count: true, _sum: { amountPaise: true } }),
  ]);
  const stats = { count: 0, paidPaise: 0n, unclearedCount: 0, unclearedPaise: 0n, failedCount: 0 };
  for (const g of groups) {
    const amt = g._sum.amountPaise ?? 0n;
    stats.count += g._count;
    if (g.status === "CANCELLED" || g.status === "BOUNCED") stats.failedCount += g._count;
    else stats.paidPaise += amt;
    if (g.mode === "CHEQUE" && (g.status === "ISSUED" || g.status === "PENDING")) {
      stats.unclearedCount += g._count;
      stats.unclearedPaise += amt;
    }
  }
  const total = stats.count;
  const reversedIds = new Set(
    (await prisma.payment.findMany({ where: { reversalOfId: { in: rows.map((r) => r.id) } }, select: { reversalOfId: true } })).map((r) => r.reversalOfId),
  );
  // The register has no identity beyond the payee name, which follows payeeMasked().
  const masked = payeeMasked(ctx);
  const page: Page<PaymentView & { caseNo: string; reversed: boolean }> = {
    rows: rows.map((p) => ({ ...paymentView(p, masked), caseNo: p.application.caseNo, reversed: reversedIds.has(p.id) })),
    total,
    page: f.page ?? 1,
    pageSize: PAGE_SIZE,
  };
  return { ...page, totalPaise: stats.paidPaise, stats };
}

export async function getPayment(ctx: ViewContext, id: string) {
  const p = await prisma.payment.findFirst({
    where: { id },
    include: { hospital: true, bank: true, fund: true, application: { select: { id: true, caseNo: true } } },
  });
  if (!p) return null;
  return { ...paymentView(p, payeeMasked(ctx)), caseNo: p.application.caseNo, createdAt: p.createdAt };
}
