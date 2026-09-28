import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { SheetPanel } from "@/components/app/bits";
import { getSignedIn } from "@/lib/auth/context";
import { PasswordForm } from "./password-form";

export const metadata: Metadata = { title: "Change password" };

export default async function ChangePasswordPage() {
  // getSignedIn, not getViewContext: this is the one page open to an account with a forced change.
  const s = await getSignedIn();
  if (!s) redirect("/login");
  return (
    <div className="mx-auto max-w-lg">
      <SheetPanel title="Change your password">
        <p className="mb-4 text-ui text-slate-body">
          {s.mustChangePassword
            ? "Your password was set by someone else. Choose your own before you continue."
            : "You will be signed out afterwards. Sign in again with the new password."}
        </p>
        <PasswordForm />
      </SheetPanel>
    </div>
  );
}
