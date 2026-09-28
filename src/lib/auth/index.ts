import NextAuth, { CredentialsSignin } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { audit, clientIp } from "@/lib/audit";
import { authConfig } from "./config";
import { loginThrottled, noteLoginFailure } from "./throttle";

const MAX_FAILURES = 5;
const LOCK_MS = 15 * 60 * 1000;

/** Compared against when the email is unknown, so a miss costs the same bcrypt time as a hit. */
const DUMMY_HASH = bcrypt.hashSync("not-a-real-password", 10);

class ThrottledError extends CredentialsSignin {
  code = "throttled";
}

const credentials = z.object({ email: z.string().email(), password: z.string().min(1) });

const isLocked = (u: { lockedUntil: Date | null }) => !!u.lockedUntil && u.lockedUntil > new Date();

/**
 * One wrong password on the shared counter (sign-in and password re-entry). The increment is
 * atomic, so parallel guesses each count; the lock is decided from the value the update returned.
 */
async function recordFailure(userId: string, what: "sign-in" | "password re-entry") {
  const { failedLoginCount } = await prisma.user.update({
    where: { id: userId },
    data: { failedLoginCount: { increment: 1 } },
    select: { failedLoginCount: true },
  });
  const lock = failedLoginCount >= MAX_FAILURES;
  if (lock) {
    await prisma.user.update({
      where: { id: userId },
      data: {
        failedLoginCount: 0,
        lockedUntil: new Date(Date.now() + LOCK_MS),
        // A session guessing its own password is treated as stolen: end it too.
        ...(what === "password re-entry" ? { sessionVersion: { increment: 1 } } : {}),
      },
    });
  }
  await audit(prisma, {
    actorId: userId,
    action: "LOGIN",
    entity: "User",
    entityId: userId,
    summary: lock ? `Account locked for 15 minutes after ${MAX_FAILURES} wrong passwords` : `Failed ${what}`,
  });
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  providers: [
    Credentials({
      credentials: { email: {}, password: {} },
      async authorize(raw) {
        const parsed = credentials.safeParse(raw);
        if (!parsed.success) return null;
        const ip = await clientIp();
        if (loginThrottled(ip)) throw new ThrottledError();

        const user = await prisma.user.findFirst({
          where: { email: parsed.data.email.toLowerCase(), isActive: true },
        });
        // Always run bcrypt so unknown emails and locked accounts take as long as a real check.
        const ok = await bcrypt.compare(parsed.data.password, user?.passwordHash ?? DUMMY_HASH);
        // Unknown, locked and wrong all return the same answer: no account enumeration, and a
        // locked account never confirms a correct guess.
        if (!user || isLocked(user) || !ok) {
          noteLoginFailure(ip);
          if (user && !isLocked(user)) await recordFailure(user.id, "sign-in");
          return null;
        }

        await prisma.user.update({
          where: { id: user.id },
          data: { failedLoginCount: 0, lockedUntil: null, lastLoginAt: new Date() },
        });
        await audit(prisma, { actorId: user.id, action: "LOGIN", entity: "User", entityId: user.id, summary: "Signed in" });
        return { id: user.id, name: user.name, email: user.email, role: user.role, sessionVersion: user.sessionVersion };
      },
    }),
  ],
});

export const GET = handlers.GET;
export const POST = handlers.POST;

/**
 * Re-authentication for reveal, user management, fund changes and the password page. Wrong
 * entries count on the same counter as sign-in, so guessing locks the account (and ends the session).
 */
export async function verifyPassword(userId: string, password: string): Promise<boolean> {
  const u = await prisma.user.findUnique({ where: { id: userId }, select: { passwordHash: true, lockedUntil: true, failedLoginCount: true } });
  if (!u || isLocked(u)) return false;
  if (!(await bcrypt.compare(password, u.passwordHash))) {
    await recordFailure(userId, "password re-entry");
    return false;
  }
  if (u.failedLoginCount) await prisma.user.update({ where: { id: userId }, data: { failedLoginCount: 0 } });
  return true;
}
