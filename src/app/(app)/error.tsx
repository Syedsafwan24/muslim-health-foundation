"use client";

import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function AppError({ reset }: { error: Error; reset: () => void }) {
  return (
    <div className="mx-auto max-w-lg rounded-sheet border border-rule border-t-2 border-t-rejected bg-sheet p-8 text-center shadow-sheet">
      <AlertTriangle aria-hidden className="mx-auto size-8 text-rejected" />
      <h1 className="mt-3 text-h2">This page could not load</h1>
      <p className="mt-2 text-body text-slate-body">Nothing was changed. Try again; if it keeps happening, tell the administrator the time it happened.</p>
      <Button className="mt-5" onClick={reset}>Try again</Button>
    </div>
  );
}
