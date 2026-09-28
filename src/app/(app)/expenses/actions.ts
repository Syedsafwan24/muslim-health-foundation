"use server";

import { revalidatePath } from "next/cache";
import { action, UserError } from "@/lib/action";
import { formatINR } from "@/lib/money";
import { fromDateInput, getFiscalYear } from "@/lib/fy";
import { nextExpenseNo } from "@/lib/numbering";
import { fundBalance } from "@/lib/db/queries/funds";
import { lockFund } from "@/lib/db/writes";
import { expenseSchema } from "@/lib/validators";

// Zakat cannot pay the trust's running costs. Only funds with allowsExpenses may be charged,
// and there is deliberately no override (open question 2).
export const createExpense = action("expenses.write", expenseSchema, async (input, { ctx, tx, audit }) => {
  const funds = await tx.fund.findMany({ where: { isActive: true, allowsExpenses: true } });
  if (!funds.length) throw new UserError("No fund is available for expenses yet. Add a non-Zakat fund in Settings to record administrative costs.");
  const fund = input.fundId ? funds.find((f) => f.id === input.fundId) : funds.length === 1 ? funds[0] : null;
  if (!fund) throw new UserError("Choose a fund that allows expenses.");
  await lockFund(tx, fund.id);
  const balance = await fundBalance(fund.id, tx);
  if (input.amountPaise > balance) throw new UserError(`${fund.name} fund has ${formatINR(balance)} left. Reduce the amount or choose another fund.`);
  const expenseDate = fromDateInput(input.expenseDate);
  const voucherNo = await nextExpenseNo(tx, getFiscalYear(expenseDate));
  const e = await tx.expense.create({
    data: { voucherNo, category: input.category, description: input.description, amountPaise: input.amountPaise, expenseDate, fundId: fund.id, paidTo: input.paidTo, mode: input.mode, referenceNo: input.referenceNo, createdById: ctx.userId },
  });
  await audit({ action: "CREATE", entity: "Expense", entityId: e.id, summary: `Recorded expense ${voucherNo} of ${formatINR(input.amountPaise)}` });
  revalidatePath("/expenses");
  return { id: e.id, voucherNo };
});
