import Link from "next/link";
import { ShieldOff } from "lucide-react";

export default function Forbidden() {
  return (
    <div className="mx-auto max-w-lg rounded-sheet border border-rule border-t-2 border-t-navy-700 bg-sheet p-8 text-center shadow-sheet">
      <ShieldOff aria-hidden className="mx-auto size-8 text-navy-400" />
      <h1 className="mt-3 text-h2">This page is not available to your role</h1>
      <p className="mt-2 text-body text-slate-body">If you need it for your work, ask the super admin to change your role.</p>
      <Link href="/dashboard" className="mt-5 inline-block text-info hover:underline">Back to the dashboard</Link>
    </div>
  );
}
