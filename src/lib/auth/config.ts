import type { NextAuthConfig } from "next-auth";
import type { Role } from "@prisma/client";

const IDLE_SECONDS = 30 * 60; // session expires after 30 minutes idle
const ABSOLUTE_MS = 8 * 60 * 60 * 1000; // and after 8 hours regardless

// Edge-safe config shared by middleware. No Prisma, no bcrypt here.
export const authConfig = {
  pages: { signIn: "/login" },
  session: { strategy: "jwt", maxAge: IDLE_SECONDS },
  providers: [],
  callbacks: {
    authorized({ auth }) {
      return !!auth?.user;
    },
    jwt({ token, user }) {
      if (user) {
        token.uid = user.id as string;
        token.role = (user as { role: Role }).role;
        token.sv = (user as { sessionVersion?: number }).sessionVersion ?? 0;
        token.loginAt = Date.now();
      }
      if (typeof token.loginAt !== "number" || Date.now() - token.loginAt > ABSOLUTE_MS) return null;
      return token;
    },
    session({ session, token }) {
      session.user.id = token.uid as string;
      session.user.role = token.role as Role;
      // Compared with User.sessionVersion in loadContext; a mismatch ends the session.
      (session.user as { sessionVersion?: number }).sessionVersion = typeof token.sv === "number" ? token.sv : 0;
      return session;
    },
  },
} satisfies NextAuthConfig;
