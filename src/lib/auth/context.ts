import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { forbidden, redirect } from "next/navigation";
import { can, type Capability } from "./permissions";
import { prisma } from "@/lib/db";
import { getSetting } from "@/lib/settings";
import { getFiscalYear } from "@/lib/fy";
import { defaultFiscalYear, listFiscalYears } from "@/lib/db/queries/fiscal-years";
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

type SignedIn = { ctx: ViewContext; mustChangePassword: boolean };

const loadSession = cache(async (): Promise<SignedIn | null> => {
  const session = await auth();
  if (!session?.user?.id) return null;
  // Role, active flag and the per-account pin come from the DB, not the JWT.
  const user = await prisma.user.findFirst({ where: { id: session.user.id, isActive: true } });
  if (!user) return null;
  // A password reset, deactivation or sign-out bumps the DB version: older tokens are refused.
  // (Tokens minted before this field existed carry none and count as 0, the column default.)
  if (((session.user as { sessionVersion?: number }).sessionVersion ?? 0) !== user.sessionVersion) return null;
  const global = await getSetting("meetingMode.global");
  // The year shown is a display preference, but only a year the super admin has started.
  const fyCookie = (await cookies()).get("fy")?.value;
  const started = await listFiscalYears();
  const years = started.map((y) => y.code);
  return {
    mustChangePassword: user.mustChangePassword,
    ctx: {
      userId: user.id,
      name: user.name,
      role: user.role,
      meetingMode: resolveMeetingMode({ global, forceMeetingMode: user.forceMeetingMode }),
      globalMeetingMode: global,
      fy: fyCookie && years.includes(fyCookie) ? fyCookie : defaultFiscalYear(started) ?? getFiscalYear(),
    },
  };
});

/**
 * Signed in, even while a password change is pending. Only for the app shell, the
 * change-password page and sign-out; everything else uses getViewContext / requireViewContext.
 */
export async function getSignedIn(): Promise<SignedIn | null> {
  return loadSession();
}

/** For pages and layouts: redirects to /login when there is no valid session. */
export async function getViewContext(): Promise<ViewContext> {
  const s = await loadSession();
  if (!s) redirect("/login");
  if (s.mustChangePassword) redirect("/account/password");
  return s.ctx;
}

/** For server actions and route handlers: throws instead of redirecting. */
export async function requireViewContext(): Promise<ViewContext> {
  const s = await loadSession();
  if (!s) throw new UnauthenticatedError("Your session has ended. Sign in again.");
  if (s.mustChangePassword) throw new UnauthenticatedError("Change your password before you continue.");
  return s.ctx;
}

/** For pages: render the 403 page unless the user has the capability. */
export async function requirePage(cap: Capability): Promise<ViewContext> {
  const ctx = await getViewContext();
  if (!can(ctx, cap)) forbidden();
  return ctx;
}
