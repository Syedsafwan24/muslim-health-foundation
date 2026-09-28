"use server";

import { z } from "zod";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/db";
import { audit } from "@/lib/audit";
import { signOut, verifyPassword } from "@/lib/auth";
import { getSignedIn } from "@/lib/auth/context";

const schema = z
  .object({
    current: z.string().min(1, "Enter your current password"),
    next: z.string().min(10, "Use at least 10 characters").max(200),
    confirm: z.string(),
  })
  .refine((v) => v.next === v.confirm, { path: ["confirm"], message: "The two new passwords do not match" })
  .refine((v) => v.next !== v.current, { path: ["next"], message: "Choose a password different from the current one" });

export type PasswordState = { error?: string; fieldErrors?: Record<string, string[] | undefined> } | null;

/**
 * Self-service password change. Not wrapped in action(): that wrapper refuses accounts with a
 * pending forced change, which is exactly who needs this. Signed-in is the only permission.
 */
export async function changePasswordAction(_prev: PasswordState, form: FormData): Promise<PasswordState> {
  const s = await getSignedIn();
  if (!s) return { error: "Your session has ended. Sign in again." };
  const parsed = schema.safeParse({ current: form.get("current"), next: form.get("next"), confirm: form.get("confirm") });
  if (!parsed.success) return { error: "Some fields need attention. Check the highlighted fields and try again.", fieldErrors: parsed.error.flatten().fieldErrors };
  // Wrong entries count towards the 5-attempt lockout, like sign-in.
  if (!(await verifyPassword(s.ctx.userId, parsed.data.current))) {
    return { fieldErrors: { current: ["That password is not correct"] }, error: "That password is not correct. Five wrong entries lock the account for 15 minutes." };
  }
  const passwordHash = await bcrypt.hash(parsed.data.next, 10);
  await prisma.$transaction(async (tx) => {
    await tx.user.update({
      where: { id: s.ctx.userId },
      data: { passwordHash, mustChangePassword: false, sessionVersion: { increment: 1 }, failedLoginCount: 0, lockedUntil: null },
    });
    await audit(tx, { actorId: s.ctx.userId, action: "UPDATE", entity: "User", entityId: s.ctx.userId, summary: "Changed own password" });
  });
  // Every session, this one included, is now stale: sign in again with the new password.
  await signOut({ redirectTo: "/login?changed=1" });
  return null;
}
