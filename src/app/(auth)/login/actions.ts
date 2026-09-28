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
        // One message for unknown email, wrong password and locked account: it must not tell an
        // outsider which emails exist, nor confirm a correct guess while the account is locked.
        error: code === "throttled"
          ? "Too many failed sign-ins from this network. Wait 15 minutes and try again."
          : "That email and password do not match, or the account is locked for 15 minutes after 5 wrong passwords. Check them and try again, or ask the administrator.",
      };
    }
    throw e; // the redirect after a successful sign-in
  }
}
