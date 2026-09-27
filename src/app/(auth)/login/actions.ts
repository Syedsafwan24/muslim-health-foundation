"use server";

import { AuthError } from "next-auth";
import { signIn } from "@/lib/auth";

export async function loginAction(_prev: unknown, form: FormData): Promise<{ error: string } | null> {
  try {
    await signIn("credentials", { email: String(form.get("email") ?? ""), password: String(form.get("password") ?? ""), redirectTo: "/dashboard" });
    return null;
  } catch (e) {
    if (e instanceof AuthError) {
      const code = (e as AuthError & { code?: string }).code;
      return {
        error: code === "locked"
          ? "This account is locked for 15 minutes after too many failed attempts. Try again later or ask the administrator."
          : "That email and password do not match. Check them and try again.",
      };
    }
    throw e; // the redirect after a successful sign-in
  }
}
