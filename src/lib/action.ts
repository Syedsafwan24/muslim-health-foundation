import "server-only";
import { z } from "zod";
import { prisma, type Tx } from "@/lib/db";
import { audit, type AuditEntry } from "@/lib/audit";
import { assertPermission, ForbiddenError, type Capability } from "@/lib/auth/permissions";
import { requireViewContext, UnauthenticatedError } from "@/lib/auth/context";
import type { ViewContext } from "@/lib/redact";

/** An expected failure whose message is safe to show the user. Never include PII. */
export class UserError extends Error {}

export type ActionResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: string; fieldErrors?: Record<string, string[] | undefined> };

type Helpers = {
  ctx: ViewContext;
  tx: Tx;
  audit: (e: Omit<AuditEntry, "actorId">) => Promise<void>;
};

/**
 * Every mutation goes through here: session → permission → zod → transaction → audit.
 * The transaction is rolled back if the handler wrote no audit row, so an audit call cannot be
 * forgotten (CLAUDE.md rule 4).
 */
export function action<S extends z.ZodTypeAny, R>(
  cap: Capability | Capability[],
  schema: S,
  handler: (input: z.output<S>, h: Helpers) => Promise<R>,
) {
  return async (raw: z.input<S>): Promise<ActionResult<R>> => {
    try {
      const ctx = await requireViewContext();
      for (const c of Array.isArray(cap) ? cap : [cap]) assertPermission(ctx, c);
      const parsed = schema.safeParse(raw);
      if (!parsed.success) {
        return {
          ok: false,
          error: "Some fields need attention. Check the highlighted fields and try again.",
          fieldErrors: parsed.error.flatten().fieldErrors as Record<string, string[]>,
        };
      }
      const data = await prisma.$transaction(
        async (tx) => {
          let audited = 0;
          const result = await handler(parsed.data, {
            ctx,
            tx,
            audit: async (e) => {
              audited++;
              await audit(tx, { ...e, actorId: ctx.userId });
            },
          });
          if (audited === 0) throw new Error("Mutation wrote no audit row");
          return result;
        },
        { timeout: 20_000 },
      );
      return { ok: true, data };
    } catch (e) {
      if (e instanceof UserError || e instanceof ForbiddenError || e instanceof UnauthenticatedError) {
        return { ok: false, error: e.message };
      }
      // Never log the input or a Prisma message — both can carry PII. Class and code only.
      const err = e as { name?: string; code?: string; message?: string };
      const detail = err.name?.startsWith("PrismaClient") ? err.code ?? "" : err.message ?? "";
      console.error("[action]", err.name ?? "unknown", detail);
      return { ok: false, error: "Something went wrong and nothing was saved. Try again, and tell the administrator if it keeps happening." };
    }
  };
}
