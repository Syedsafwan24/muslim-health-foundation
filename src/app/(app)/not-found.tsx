import Link from "next/link";
import { SearchX } from "lucide-react";

export default function NotFound() {
  return (
    <div className="mx-auto max-w-lg rounded-sheet border border-rule border-t-2 border-t-navy-700 bg-sheet p-8 text-center shadow-sheet">
      <SearchX aria-hidden className="mx-auto size-8 text-navy-400" />
      <h1 className="mt-3 text-h2">That record was not found</h1>
      <p className="mt-2 text-body text-slate-body">It may have been merged or removed. Search for it by case number or person code.</p>
      <Link href="/dashboard" className="mt-5 inline-block text-info hover:underline">Back to the dashboard</Link>
    </div>
  );
}
