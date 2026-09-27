import { Skeleton } from "@/components/ui/skeleton";

/** Shown instantly on every page switch while the server loads the page's data. */
export default function Loading() {
  return (
    <div aria-busy="true" aria-label="Loading">
      <Skeleton className="h-9 w-56" />
      <Skeleton className="mt-2 h-4 w-28" />
      <div className="mt-8 flex flex-wrap gap-3">
        <Skeleton className="h-10 w-full max-w-sm" />
        {Array.from({ length: 4 }, (_, i) => <Skeleton key={i} className="h-10 w-40" />)}
      </div>
      <div className="mt-6 overflow-hidden rounded-sheet border border-rule bg-sheet">
        <Skeleton className="h-12 rounded-none" />
        {Array.from({ length: 8 }, (_, i) => (
          <div key={i} className="flex gap-6 border-b border-rule px-4 py-4 last:border-b-0">
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-4 flex-1" />
            <Skeleton className="h-4 w-20" />
          </div>
        ))}
      </div>
    </div>
  );
}
