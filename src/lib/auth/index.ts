import NextAuth, { CredentialsSignin } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { audit } from "@/lib/audit";
import { authConfig } from "./config";

const MAX_FAILURES = 5;
const LOCK_MS = 15 * 60 * 1000;

class LockedError extends CredentialsSignin {
  code = "locked";
}

const credentials = z.object({ email: z.string().email(), password: z.string().min(1) });

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  providers: [
    Credentials({
      credentials: { email: {}, password: {} },
      async authorize(raw) {
        const parsed = credentials.safeParse(raw);
        if (!parsed.success) return null;
        const user = await prisma.user.findFirst({
          where: { email: parsed.data.email.toLowerCase(), isActive: true },
        });
        if (!user) return null;
        if (user.lockedUntil && user.lockedUntil > new Date()) throw new LockedError();

        const ok = await bcrypt.compare(parsed.data.password, user.passwordHash);
        if (!ok) {
          const failures = user.failedLoginCount + 1;
          const lock = failures >= MAX_FAILURES;
          await prisma.user.update({
            where: { id: user.id },
            data: lock
              ? { failedLoginCount: 0, lockedUntil: new Date(Date.now() + LOCK_MS) }
              : { failedLoginCount: failures },
          });
          await audit(prisma, {
            actorId: user.id,
            action: "LOGIN",
            entity: "User",
            entityId: user.id,
            summary: lock ? "Account locked for 15 minutes after 5 failed sign-ins" : "Failed sign-in",
          });
          if (lock) throw new LockedError();
          return null;
        }

        await prisma.user.update({
          where: { id: user.id },
          data: { failedLoginCount: 0, lockedUntil: null, lastLoginAt: new Date() },
        });
        await audit(prisma, { actorId: user.id, action: "LOGIN", entity: "User", entityId: user.id, summary: "Signed in" });
        return { id: user.id, name: user.name, email: user.email, role: user.role };
      },
    }),
  ],
});

export const GET = handlers.GET;
export const POST = handlers.POST;

/** Re-authentication for reveal, user management and fund changes. */
export async function verifyPassword(userId: string, password: string): Promise<boolean> {
  const u = await prisma.user.findUnique({ where: { id: userId }, select: { passwordHash: true } });
  return !!u && (await bcrypt.compare(password, u.passwordHash));
}
