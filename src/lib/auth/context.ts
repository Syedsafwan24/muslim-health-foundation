import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { forbidden, redirect } from "next/navigation";
import { can, type Capability } from "./permissions";
import { prisma } from "@/lib/db";
import { getSetting } from "@/lib/settings";
import { getFiscalYear, isFiscalYear } from "@/lib/fy";
import type { ViewContext } from "@/lib/redact";
import { auth } from "./index";

export class UnauthenticatedError extends Error {}

/**
 * Meeting Mode resolution, first match wins (docs/03 §4). Evaluated from the database on every
 * request. Nothing is read from a client-supplied cookie, header or query parameter.
 */
export function resolveMeetingMode(o: { global: boolean; forceMeetingMode: boolean }): boolean {
  if (o.global) return true;
  if (o.forceMeetingMode) return true;
  return false;
}

const loadContext = cache(async (): Promise<ViewContext | null> => {
  const session = await auth();
  if (!session?.user?.id) return null;
  // Role, active flag and the per-account pin come from the DB, not the JWT.
  const user = await prisma.user.findFirst({ where: { id: session.user.id, isActive: true } });
  if (!user) return null;
  const global = await getSetting("meetingMode.global");
  const fyCookie = (await cookies()).get("fy")?.value; // display preference only
  return {
    userId: user.id,
    name: user.name,
    role: user.role,
    meetingMode: resolveMeetingMode({ global, forceMeetingMode: user.forceMeetingMode }),
    globalMeetingMode: global,
    fy: isFiscalYear(fyCookie) ? fyCookie : getFiscalYear(),
  };
});

/** For pages and layouts: redirects to /login when there is no valid session. */
export async function getViewContext(): Promise<ViewContext> {
  const ctx = await loadContext();
  if (!ctx) redirect("/login");
  return ctx;
}

/** For server actions and route handlers: throws instead of redirecting. */
export async function requireViewContext(): Promise<ViewContext> {
  const ctx = await loadContext();
  if (!ctx) throw new UnauthenticatedError("Your session has ended. Sign in again.");
  return ctx;
}

/** For pages: render the 403 page unless the user has the capability. */
export async function requirePage(cap: Capability): Promise<ViewContext> {
  const ctx = await getViewContext();
  if (!can(ctx, cap)) forbidden();
  return ctx;
}
