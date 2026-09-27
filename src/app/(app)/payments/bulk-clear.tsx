"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { toDateInput } from "@/lib/fy";
import { useSelection } from "@/components/app/data-table";
import { markCleared } from "./actions";

/** Bank reconciliation: mark the selected cheques cleared on one date. */
export function BulkClear() {
  const { ids, clear } = useSelection();
  const router = useRouter();
  const [date, setDate] = useState(toDateInput(new Date()));
  const [pending, start] = useTransition();
  return (
    <div className="flex flex-wrap items-center gap-2">
      <label htmlFor="clear-on" className="text-label">Cleared on</label>
      <input id="clear-on" type="date" value={date} onChange={(e) => setDate(e.target.value)} className="h-9 rounded-control border border-rule bg-sheet px-2 text-ui" />
      <Button
        size="sm"
        disabled={pending}
        onClick={() => start(async () => {
          const r = await markCleared({ ids, clearedOn: date });
          if (r.ok) { toast.success(`${r.data.count} ${r.data.count === 1 ? "payment" : "payments"} marked cleared`); clear(); router.refresh(); }
          else toast.error(r.error);
        })}
      >
        Mark cleared
      </Button>
    </div>
  );
}
