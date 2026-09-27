"use server";

import { revalidatePath } from "next/cache";
import { action, UserError } from "@/lib/action";
import { verifyPassword } from "@/lib/auth";
import { diff } from "@/lib/audit";
import { fundSchema } from "@/lib/validators";

/** Fund changes need the password again (docs/03 §8). */
export const saveFund = action("funds.write", fundSchema, async ({ id, password, ...data }, { ctx, tx, audit }) => {
  if (!(await verifyPassword(ctx.userId, password))) throw new UserError("That password is not correct.");
  if (id) {
    const before = await tx.fund.findFirst({ where: { id } });
    if (!before) throw new UserError("That fund no longer exists.");
    if (before.type === "ZAKAT" && data.allowsExpenses) throw new UserError("Zakat cannot pay the trust's running costs.");
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
