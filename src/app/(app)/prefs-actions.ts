"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { signOut } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { prisma } from "@/lib/db";
import { getSignedIn, requireViewContext } from "@/lib/auth/context";
import { isFiscalYear } from "@/lib/fy";
import { globalSearch } from "@/lib/db/queries/admin";
import { searchPeople } from "@/lib/db/queries/people";

// Display preferences (cookies) and read-only lookups. Preferences are not records, so they
// are not audited; they never affect what data a user may see.

export async function setFiscalYear(fy: string) {
  if (!isFiscalYear(fy)) return;
  (await cookies()).set("fy", fy, { path: "/", sameSite: "lax", httpOnly: true, maxAge: 60 * 60 * 24 * 365 });
  revalidatePath("/", "layout");
}

export async function setDensity(density: "comfortable" | "compact") {
  (await cookies()).set("density", density === "compact" ? "compact" : "comfortable", { path: "/", sameSite: "lax", maxAge: 60 * 60 * 24 * 365 });
  revalidatePath("/", "layout");
}

export async function setTheme(theme: "light" | "dark" | "system") {
  (await cookies()).set("theme", ["light", "dark", "system"].includes(theme) ? theme : "system", { path: "/", sameSite: "lax", maxAge: 60 * 60 * 24 * 365 });
  revalidatePath("/", "layout");
}

export async function signOutAction() {
  try {
    const s = await getSignedIn();
    if (s) {
      // Ends every copy of this session's token, not just this browser's cookie.
      await prisma.user.update({ where: { id: s.ctx.userId }, data: { sessionVersion: { increment: 1 } } });
      await audit(prisma, { actorId: s.ctx.userId, action: "LOGOUT", entity: "User", entityId: s.ctx.userId, summary: "Signed out" });
    }
  } catch {
    // already signed out
  }
  await signOut({ redirectTo: "/login" });
}

/** ⌘K palette. Redaction-aware: no name search in Meeting Mode. */
export async function searchAction(q: string) {
  const ctx = await requireViewContext();
  return globalSearch(ctx, q.slice(0, 80));
}

/** Registry combobox on the application form. */
export async function searchPeopleAction(q: string) {
  const ctx = await requireViewContext();
  return searchPeople(ctx, q.slice(0, 80));
}
