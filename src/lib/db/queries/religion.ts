import "server-only";
import { prisma } from "@/lib/db";
import { can } from "@/lib/auth/permissions";
import type { ViewContext } from "@/lib/redact";
import { LIVE_PAYMENT } from "./shared";

export type ReligionRow = { religion: string; people: number; cases: number; paidPaise: bigint };

/**
 * People, cases and aid by religion, for the super admin only. Religion is sensitive (docs/00):
 * this is never shown to other roles, never in Meeting Mode, never on the dashboard or in exports.
 * Returns null whenever the viewer may not see it, so callers cannot render it by mistake.
 */
export async function religionBreakdown(ctx: ViewContext, as: "patient" | "applicant"): Promise<ReligionRow[] | null> {
  if (!can(ctx, "stats.religion") || ctx.meetingMode) return null;
  // Same people as the Patients / Applicants lists: everyone on any case, drafts included.
  const apps = await prisma.application.findMany({
    select: {
      patientId: true, applicantId: true,
      patient: { select: { religion: true } }, applicant: { select: { religion: true } },
      payments: { where: LIVE_PAYMENT, select: { amountPaise: true } },
    },
  });
  const groups = new Map<string, { people: Set<string>; cases: number; paidPaise: bigint }>();
  for (const a of apps) {
    const person = as === "patient" ? a.patientId : a.applicantId;
    const religion = (as === "patient" ? a.patient : a.applicant).religion?.trim() || "Not recorded";
    const g = groups.get(religion) ?? { people: new Set<string>(), cases: 0, paidPaise: 0n };
    g.people.add(person);
    g.cases += 1;
    g.paidPaise += a.payments.reduce((s, p) => s + p.amountPaise, 0n);
    groups.set(religion, g);
  }
  return [...groups.entries()]
    .map(([religion, g]) => ({ religion, people: g.people.size, cases: g.cases, paidPaise: g.paidPaise }))
    .sort((x, y) => y.people - x.people);
}
