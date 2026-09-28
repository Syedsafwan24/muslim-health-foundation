import "server-only";
import { prisma } from "@/lib/db";
import { getFiscalYear } from "@/lib/fy";

/** Fiscal years the super admin has started, newest first. */
export async function listFiscalYears() {
  return prisma.fiscalYear.findMany({ orderBy: { code: "desc" } });
}

/**
 * The year to show when the user has not picked one: the started year that contains today,
 * else the newest started year. Returns null only before any year has been started.
 */
export function defaultFiscalYear(codes: string[]): string | null {
  const today = getFiscalYear();
  return codes.includes(today) ? today : codes[0] ?? null;
}

/** The Fiscal years settings table: each started year with its activity and what is still open in it. */
export async function fiscalYearOverview() {
  const years = await listFiscalYears();
  const users = await prisma.user.findMany({ where: { id: { in: years.flatMap((y) => [y.openedById, y.closedById]).filter((x): x is string => !!x) } }, select: { id: true, name: true } });
  const nameOf = (id: string | null) => users.find((u) => u.id === id)?.name ?? null;
  return Promise.all(years.map(async (y) => {
    const inYear = { gte: y.startsOn, lt: y.endsOn };
    const [cases, drafts, payments, donations, unissued] = await Promise.all([
      prisma.application.count({ where: { fiscalYear: y.code, status: { not: "DRAFT" } } }),
      prisma.application.count({ where: { status: "DRAFT", applicationDate: inYear } }),
      prisma.payment.count({ where: { paymentDate: inYear } }),
      prisma.donation.count({ where: { donationDate: inYear, cancelledAt: null } }),
      prisma.donation.count({ where: { donationDate: inYear, cancelledAt: null, isReceiptIssued: false } }),
    ]);
    return {
      code: y.code, startsOn: y.startsOn, endsOn: y.endsOn, status: y.status,
      openedAt: y.openedAt, openedBy: nameOf(y.openedById), closedAt: y.closedAt, closedBy: nameOf(y.closedById), closeNote: y.closeNote,
      cases, drafts, payments, donations, unissued,
    };
  }));
}
