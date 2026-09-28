"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { action, UserError } from "@/lib/action";
import { verifyPassword } from "@/lib/auth";
import { fyRange, getFiscalYear, isFiscalYear } from "@/lib/fy";

const password = z.string().min(1, "Enter your password");
const code = z.string().refine(isFiscalYear, "Choose a fiscal year");
const nextCode = (fy: string) => {
  const y = Number(fy.slice(0, 4)) + 1;
  return `${y}-${String((y + 1) % 100).padStart(2, "0")}`;
};

const refresh = () => {
  revalidatePath("/", "layout");
};

/**
 * Starts the year after the newest started one (or the current year when none exists), so
 * years always follow on without gaps. Dates are fixed: 1 April to 31 March.
 */
export const startFiscalYear = action("settings.write", z.object({ password }), async ({ password }, { ctx, tx, audit }) => {
  if (!(await verifyPassword(ctx.userId, password))) throw new UserError("That password is not correct.");
  const latest = await tx.fiscalYear.findFirst({ orderBy: { code: "desc" } });
  const fy = latest ? nextCode(latest.code) : getFiscalYear();
  const { start, end } = fyRange(fy);
  const row = await tx.fiscalYear.create({ data: { code: fy, startsOn: start, endsOn: end, openedById: ctx.userId } });
  await audit({ action: "SETTING_CHANGE", entity: "FiscalYear", entityId: row.id, summary: `Started FY ${fy}` });
  refresh();
  return { code: fy };
});

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
