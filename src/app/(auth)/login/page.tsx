import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { requireViewContext } from "@/lib/auth/context";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Sign in" };

export default async function LoginPage() {
  // Checked against the database, not just the token, so a deactivated account stays here.
  const ctx = await requireViewContext().catch(() => null);
  if (ctx) redirect("/dashboard");
  return (
    <main className="grid min-h-dvh place-items-center bg-paper px-4">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex items-center gap-3">
          <span aria-hidden className="grid size-11 place-items-center rounded-full border-2 border-navy-700 text-label font-semibold text-navy-700">MHF</span>
          <div>
            <h1 className="text-h2 text-navy-900">Muslim Health Foundation</h1>
            <p className="text-label text-slate-body">Medical aid register · Bhatkal</p>
          </div>
        </div>
        <section className="rounded-sheet border border-rule border-t-2 border-t-navy-700 bg-sheet p-6 shadow-sheet">
          <LoginForm />
        </section>
        <p className="mt-4 text-caption text-slate-body">Jamat Complex, 1st Floor, N.H.66, Near Noor Masjid, Bhatkal – 581 320</p>
      </div>
    </main>
  );
}
