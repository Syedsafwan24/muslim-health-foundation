import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <div aria-busy="true" aria-label="Loading dashboard">
      <Skeleton className="mb-6 h-10 w-48" />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }, (_, i) => <Skeleton key={i} className="h-32 rounded-sheet" />)}
      </div>
      <Skeleton className="mt-6 h-40 rounded-sheet" />
      <div className="mt-6 grid gap-6 xl:grid-cols-[2fr_1fr]">
        <Skeleton className="h-80 rounded-sheet" />
        <Skeleton className="h-80 rounded-sheet" />
      </div>
    </div>
  );
}
