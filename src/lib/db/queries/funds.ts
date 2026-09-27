import "server-only";
import type { FundType } from "@prisma/client";
import { prisma, type DB, type Tx } from "@/lib/db";
import { fyRange } from "@/lib/fy";
import type { ViewContext } from "@/lib/redact";
import { LIVE_PAYMENT } from "./shared";
import { PAYABLE } from "@/lib/applications/transitions";

/** balance = opening + Σ donations − Σ live payments − Σ expenses. Computed, never stored. */
export async function fundBalance(fundId: string, db: DB | Tx = prisma): Promise<bigint> {
  const [fund, don, pay, exp] = await Promise.all([
    db.fund.findUniqueOrThrow({ where: { id: fundId } }),
    db.donation.aggregate({ where: { fundId, cancelledAt: null, deletedAt: null }, _sum: { amountPaise: true } }),
    db.payment.aggregate({ where: { ...LIVE_PAYMENT, fundId }, _sum: { amountPaise: true } }),
    db.expense.aggregate({ where: { fundId, deletedAt: null }, _sum: { amountPaise: true } }),
  ]);
  return fund.openingBalancePaise + (don._sum.amountPaise ?? 0n) - (pay._sum.amountPaise ?? 0n) - (exp._sum.amountPaise ?? 0n);
}

export type FundSummary = {
  id: string;
  name: string;
  type: FundType;
  isActive: boolean;
  isRestricted: boolean;
  allowsExpenses: boolean;
  openingPaise: bigint;
  balancePaise: bigint;
  fyInflowPaise: bigint;
  fyOutflowPaise: bigint;
  fyExpensePaise: bigint;
  committedPaise: bigint;
  /** 0–100: share of the pool already paid out or committed to approved cases. */
  committedPct: number;
  low: boolean;
};

export async function listFunds(ctx: ViewContext, opts: { includeInactive?: boolean } = {}): Promise<FundSummary[]> {
  const { start, end } = fyRange(ctx.fy);
  const funds = await prisma.fund.findMany({ where: opts.includeInactive ? {} : { isActive: true }, orderBy: { name: "asc" } });

  // Approved but not yet paid, across payable cases. Single-fund today, so attributed to each
  // active restricted fund; revisit when a second aid fund exists.
  // A payable case is not yet fully paid, so approved − paid summed over them is exact.
  const [approvedSum, paidSum] = await Promise.all([
    prisma.application.aggregate({ where: { status: { in: PAYABLE } }, _sum: { approvedAmountPaise: true } }),
    prisma.payment.aggregate({ where: { ...LIVE_PAYMENT, application: { status: { in: PAYABLE } } }, _sum: { amountPaise: true } }),
  ]);
  const owed = (approvedSum._sum.approvedAmountPaise ?? 0n) - (paidSum._sum.amountPaise ?? 0n);
  const committed = owed > 0n ? owed : 0n;

  return Promise.all(
    funds.map(async (f) => {
      const [inflow, outflow, expense, allIn, allOut, allExp] = await Promise.all([
        prisma.donation.aggregate({ where: { fundId: f.id, cancelledAt: null, donationDate: { gte: start, lt: end } }, _sum: { amountPaise: true } }),
        prisma.payment.aggregate({ where: { ...LIVE_PAYMENT, fundId: f.id, paymentDate: { gte: start, lt: end } }, _sum: { amountPaise: true } }),
        prisma.expense.aggregate({ where: { fundId: f.id, expenseDate: { gte: start, lt: end } }, _sum: { amountPaise: true } }),
        prisma.donation.aggregate({ where: { fundId: f.id, cancelledAt: null }, _sum: { amountPaise: true } }),
        prisma.payment.aggregate({ where: { ...LIVE_PAYMENT, fundId: f.id }, _sum: { amountPaise: true } }),
        prisma.expense.aggregate({ where: { fundId: f.id }, _sum: { amountPaise: true } }),
      ]);
      // Same formula as fundBalance(), from the totals already fetched here.
      const balance = f.openingBalancePaise + (allIn._sum.amountPaise ?? 0n) - (allOut._sum.amountPaise ?? 0n) - (allExp._sum.amountPaise ?? 0n);
      const fyIn = inflow._sum.amountPaise ?? 0n;
      const fundCommitted = f.isRestricted && f.isActive ? committed : 0n;
      const pool = f.openingBalancePaise + (allIn._sum.amountPaise ?? 0n);
      const used = (allOut._sum.amountPaise ?? 0n) + fundCommitted;
      return {
        id: f.id, name: f.name, type: f.type, isActive: f.isActive, isRestricted: f.isRestricted, allowsExpenses: f.allowsExpenses,
        openingPaise: f.openingBalancePaise,
        balancePaise: balance,
        fyInflowPaise: fyIn,
        fyOutflowPaise: outflow._sum.amountPaise ?? 0n,
        fyExpensePaise: expense._sum.amountPaise ?? 0n,
        committedPaise: fundCommitted,
        committedPct: pool > 0n ? Math.min(100, Number((used * 100n) / pool)) : 0,
        low: balance < fyIn / 10n,
      };
    }),
  );
}

/** Active funds for selectors. The UI hides the selector when there is exactly one. */
export async function activeFunds(purpose: "aid" | "expense" | "donation") {
  return prisma.fund.findMany({
    where: { isActive: true, ...(purpose === "expense" ? { allowsExpenses: true } : {}) },
    orderBy: { name: "asc" },
    select: { id: true, name: true, type: true },
  });
}
