"use server";

import { revalidatePath } from "next/cache";
import { action, UserError } from "@/lib/action";
import { verifyPassword } from "@/lib/auth";
import { diff } from "@/lib/audit";
import { fundSchema } from "@/lib/validators";
import { NO_RUNNING_COSTS } from "@/lib/labels";

/** Fund changes need the password again (docs/03 §8). */
export const saveFund = action("funds.write", fundSchema, async ({ id, password, ...data }, { ctx, tx, audit }) => {
  if (!(await verifyPassword(ctx.userId, password))) throw new UserError("That password is not correct.");
  if (id) {
    const before = await tx.fund.findFirst({ where: { id } });
    if (!before) throw new UserError("That fund no longer exists.");
    if (NO_RUNNING_COSTS.includes(data.type) && data.allowsExpenses) throw new UserError("Zakat and interest money cannot pay the trust's running costs.");
    if (data.type !== before.type) {
      // Retyping would let Zakat money be relabelled and then spent on running costs.
      if (before.type === "ZAKAT") throw new UserError("A Zakat fund cannot be changed to another type.");
      if (NO_RUNNING_COSTS.includes(data.type) && before.allowsExpenses) throw new UserError("Turn off running costs before making this a Zakat or Interest fund.");
    }
    if (data.openingBalancePaise !== before.openingBalancePaise) {
      const used = (await tx.donation.count({ where: { fundId: id } })) + (await tx.payment.count({ where: { fundId: id } })) + (await tx.expense.count({ where: { fundId: id } }));
      if (used) throw new UserError(`The opening balance of ${before.name} is fixed once money has come in or gone out.`);
    }
    await tx.fund.update({ where: { id }, data });
    const d = diff(before as unknown as Record<string, unknown>, data);
    await audit({ action: "SETTING_CHANGE", entity: "Fund", entityId: id, summary: `Changed fund ${before.name}`, before: d.before, after: d.after });
  } else {
    const f = await tx.fund.create({ data });
    await audit({ action: "CREATE", entity: "Fund", entityId: f.id, summary: `Created fund ${f.name}`, after: data });
  }
  revalidatePath("/funds");
  revalidatePath("/settings/funds");
  return { ok: true };
});
