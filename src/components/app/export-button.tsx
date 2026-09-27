"use client";

import { useSearchParams } from "next/navigation";
import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";

/** Exports what the page shows (same filters) as PDF or Excel. `name` is a key of LIST_EXPORTS. */
export function ExportButton({ name, params }: { name: string; params?: Record<string, string> }) {
  const sp = useSearchParams();
  const href = (format: "pdf" | "xlsx") => {
    const p = new URLSearchParams(sp.toString());
    p.delete("page");
    for (const [k, v] of Object.entries(params ?? {})) p.set(k, v);
    p.set("name", name);
    p.set("format", format);
    return `/api/export/list?${p.toString()}`;
  };
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline"><Download aria-hidden /> Export</Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem asChild><a href={href("pdf")} target="_blank" rel="noopener">PDF report</a></DropdownMenuItem>
        <DropdownMenuItem asChild><a href={href("xlsx")}>Excel sheet</a></DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
