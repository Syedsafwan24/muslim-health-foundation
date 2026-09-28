"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { action, UserError } from "@/lib/action";
import { verifyPassword } from "@/lib/auth";
import type { Tx } from "@/lib/db";
import { fmtDate, fromDateInput, isFiscalYear } from "@/lib/fy";
import { fyCodeFor } from "@/lib/fy/db";

const password = z.string().min(1, "Enter your password");
const code = z.string().refine(isFiscalYear, "Choose a fiscal year");
const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Choose a date");
const DAY = 864e5;

const refresh = () => revalidatePath("/", "layout");

/** Validates chosen dates and returns [start, exclusive end) plus the year's name. */
async function checkDates(tx: Tx, startsOn: string, lastDay: string, exceptCode?: string) {
  const start = fromDateInput(startsOn);
  const last = fromDateInput(lastDay);
  const end = new Date(last.getTime() + DAY);
  if (last < start) throw new UserError("The last day must be after the first day.");
  const days = Math.round((end.getTime() - start.getTime()) / DAY);
  if (days < 28) throw new UserError("A fiscal year must be at least four weeks long.");
  if (days > 731) throw new UserError("A fiscal year can be at most two years long.");
  const clash = await tx.fiscalYear.findFirst({ where: { startsOn: { lt: end }, endsOn: { gt: start }, ...(exceptCode ? { code: { not: exceptCode } } : {}) } });
  if (clash) throw new UserError(`These dates overlap FY ${clash.code} (${fmtDate(clash.startsOn)} – ${fmtDate(new Date(clash.endsOn.getTime() - DAY))}).`);
  return { start, end, code: fyCodeFor(start, last) };
}

/** Starts a new year on dates the super admin chooses. Years may not overlap. */
export const startFiscalYear = action(
  "settings.write",
  z.object({ startsOn: day, lastDay: day, password }),
  async ({ startsOn, lastDay, password }, { ctx, tx, audit }) => {
    if (!(await verifyPassword(ctx.userId, password))) throw new UserError("That password is not correct.");
    const { start, end, code: fy } = await checkDates(tx, startsOn, lastDay);
    if (await tx.fiscalYear.findFirst({ where: { code: fy } })) throw new UserError(`A year named FY ${fy} already exists. Choose dates that give it a different name.`);
    const row = await tx.fiscalYear.create({ data: { code: fy, startsOn: start, endsOn: end, openedById: ctx.userId } });
    await audit({ action: "SETTING_CHANGE", entity: "FiscalYear", entityId: row.id, summary: `Started FY ${fy} (${startsOn} to ${lastDay})` });
    refresh();
    return { code: fy };
  },
);

/**
 * Moves a year's dates. Refused when a recorded case, payment, donation or expense of that year
 * would fall outside the new dates, or when the name would change after numbers were issued
 * (case and voucher numbers carry the year's name).
 */
export const updateFiscalYearDates = action(
  "settings.write",
  z.object({ code, startsOn: day, lastDay: day, password }),
  async ({ code, startsOn, lastDay, password }, { ctx, tx, audit }) => {
    if (!(await verifyPassword(ctx.userId, password))) throw new UserError("That password is not correct.");
    const row = await tx.fiscalYear.findFirst({ where: { code } });
    if (!row) throw new UserError(`FY ${code} has not been started.`);
    if (row.status === "CLOSED") throw new UserError(`FY ${code} is closed. Reopen it before changing its dates.`);
    const { start, end, code: newCode } = await checkDates(tx, startsOn, lastDay, code);
    const [cases, payments, donations, expenses] = await Promise.all([
      tx.application.count({ where: { fiscalYear: code, status: { not: "DRAFT" }, OR: [{ applicationDate: { lt: start } }, { applicationDate: { gte: end } }] } }),
      tx.payment.count({ where: { voucherNo: { startsWith: `V/${code}/` }, OR: [{ paymentDate: { lt: start } }, { paymentDate: { gte: end } }] } }),
      tx.donation.count({ where: { receiptNo: { startsWith: `R/${code}/` }, OR: [{ donationDate: { lt: start } }, { donationDate: { gte: end } }] } }),
      tx.expense.count({ where: { voucherNo: { startsWith: `E/${code}/` }, OR: [{ expenseDate: { lt: start } }, { expenseDate: { gte: end } }] } }),
    ]);
    const left = [cases && `${cases} case${cases === 1 ? "" : "s"}`, payments && `${payments} payment${payments === 1 ? "" : "s"}`, donations && `${donations} donation${donations === 1 ? "" : "s"}`, expenses && `${expenses} expense${expenses === 1 ? "" : "s"}`].filter(Boolean);
    if (left.length) throw new UserError(`${left.join(", ")} of FY ${code} would fall outside these dates. Keep the year covering them.`);
    if (newCode !== code) {
      const issued = await tx.counter.count({ where: { id: { in: ["case", "voucher", "receipt", "expense"].map((s) => `${s}:${code}`) }, value: { gt: 0 } } });
      if (issued) throw new UserError(`These dates would rename FY ${code} to FY ${newCode}, but numbers with ${code} have already been issued. Keep the dates in the same years.`);
      if (await tx.fiscalYear.findFirst({ where: { code: newCode } })) throw new UserError(`A year named FY ${newCode} already exists.`);
      await tx.application.updateMany({ where: { fiscalYear: code, status: "DRAFT" }, data: { fiscalYear: newCode } });
    }
    await tx.fiscalYear.update({ where: { id: row.id }, data: { code: newCode, startsOn: start, endsOn: end } });
    await audit({
      action: "SETTING_CHANGE", entity: "FiscalYear", entityId: row.id,
      summary: `Changed the dates of FY ${code} to ${startsOn} – ${lastDay}${newCode !== code ? ` (now FY ${newCode})` : ""}`,
      before: { startsOn: row.startsOn, endsOn: row.endsOn }, after: { startsOn: start, endsOn: end },
    });
    refresh();
    return { code: newCode };
  },
);

/** Ends a year: no new case, payment, donation or expense can be numbered in it. */
export const closeFiscalYear = action(
  "settings.write",
  z.object({ code, password, note: z.string().trim().max(500).optional() }),
  async ({ code, password, note }, { ctx, tx, audit }) => {
    if (!(await verifyPassword(ctx.userId, password))) throw new UserError("That password is not correct.");
    const row = await tx.fiscalYear.findFirst({ where: { code } });
    if (!row) throw new UserError(`FY ${code} has not been started.`);
    if (row.status === "CLOSED") throw new UserError(`FY ${code} is already closed.`);
    await tx.fiscalYear.update({ where: { id: row.id }, data: { status: "CLOSED", closedAt: new Date(), closedById: ctx.userId, closeNote: note || null } });
    await audit({ action: "SETTING_CHANGE", entity: "FiscalYear", entityId: row.id, summary: `Closed FY ${code}`, reason: note || undefined });
    refresh();
    return { code };
  },
);

/** Undoes a close, for an entry that belongs to a year already closed. A reason is required. */
export const reopenFiscalYear = action(
  "settings.write",
  z.object({ code, password, reason: z.string().trim().min(10, "Give a reason of at least 10 characters").max(500) }),
  async ({ code, password, reason }, { ctx, tx, audit }) => {
    if (!(await verifyPassword(ctx.userId, password))) throw new UserError("That password is not correct.");
    const row = await tx.fiscalYear.findFirst({ where: { code } });
    if (!row) throw new UserError(`FY ${code} has not been started.`);
    if (row.status === "OPEN") throw new UserError(`FY ${code} is already open.`);
    await tx.fiscalYear.update({ where: { id: row.id }, data: { status: "OPEN", closedAt: null, closedById: null, closeNote: null } });
    await audit({ action: "SETTING_CHANGE", entity: "FiscalYear", entityId: row.id, summary: `Reopened FY ${code}`, reason });
    refresh();
    return { code };
  },
);
