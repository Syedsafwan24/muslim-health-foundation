"use client";

import { createContext, useContext, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { flexRender, getCoreRowModel, useReactTable, type ColumnDef, type VisibilityState } from "@tanstack/react-table";
import { ArrowDown, ArrowUp, ArrowUpDown, ChevronLeft, ChevronRight, Columns3 } from "lucide-react";
import { cn } from "@/lib/utils";

// TanStack Table driven by server data. Cells are rendered on the server (so identity redaction
// has already happened) and passed in as React nodes; this component owns only presentation:
// URL-synced sort and page, sticky header, column visibility, stacked rows under 768px.

export type Column = { id: string; header: string; align?: "right"; sortKey?: string; sortable?: boolean; hideable?: boolean; className?: string; hiddenByDefault?: boolean };
const Selection = createContext<{ ids: string[]; clear: () => void }>({ ids: [], clear: () => {} });
/** The ticked rows, for the bulk bar rendered inside a DataTable. */
export const useSelection = () => useContext(Selection);

/**
 * `sort` holds the raw value per column for tables sorted in the browser (all rows loaded):
 * give a column `sortable: true` and each row `sort: { [columnId]: value }`.
 * Paginated lists sort on the server instead, through a column's `sortKey` (?sort= in the URL).
 */
export type Row = { id: string; href?: string; cells: Record<string, React.ReactNode>; sort?: Record<string, string | number | null>; tone?: "muted" | "alert"; selectable?: boolean };

export function DataTable({
  columns, rows, total, page = 1, pageSize = 25, footer, empty, caption, bulk,
}: {
  columns: Column[];
  rows: Row[];
  total?: number;
  page?: number;
  pageSize?: number;
  footer?: React.ReactNode;
  empty?: React.ReactNode;
  caption: string;
  /** Bar shown when rows are ticked; it reads the ticked ids with useSelection(). */
  bulk?: React.ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const sort = params.get("sort") ?? "";
  // Browser-side sort for fully loaded tables.
  const [local, setLocal] = useState<{ id: string; desc: boolean } | null>(null);
  const sortedRows = useMemo(() => {
    if (!local) return rows;
    const val = (r: Row) => r.sort?.[local.id] ?? null;
    return [...rows].sort((a, b) => {
      const x = val(a), y = val(b);
      if (x === y) return 0;
      if (x === null) return 1; // blanks last either way
      if (y === null) return -1;
      const c = typeof x === "number" && typeof y === "number" ? x - y : String(x).localeCompare(String(y), "en-IN", { numeric: true });
      return local.desc ? -c : c;
    });
  }, [rows, local]);
  const [visibility, setVisibility] = useState<VisibilityState>(() => Object.fromEntries(columns.filter((c) => c.hiddenByDefault).map((c) => [c.id, false])));
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [showCols, setShowCols] = useState(false);

  const setParam = (k: string, v: string | null) => {
    const p = new URLSearchParams(params.toString());
    if (v === null) p.delete(k);
    else p.set(k, v);
    router.push(`${pathname}?${p.toString()}`, { scroll: false });
  };

  const defs = useMemo<ColumnDef<Row>[]>(
    () => columns.map((c) => ({ id: c.id, header: c.header, cell: ({ row }) => row.original.cells[c.id] ?? null, enableHiding: c.hideable !== false })),
    [columns],
  );
  const table = useReactTable({ data: sortedRows, columns: defs, getCoreRowModel: getCoreRowModel(), state: { columnVisibility: visibility }, onColumnVisibilityChange: setVisibility, getRowId: (r) => r.id });
  const colMeta = (id: string) => columns.find((c) => c.id === id)!;

  const open = (r: Row, e: React.MouseEvent | React.KeyboardEvent) => {
    if (!r.href) return;
    if ("metaKey" in e && (e.metaKey || e.ctrlKey)) window.open(r.href, "_blank");
    else router.push(r.href);
  };
  const pages = total != null ? Math.max(1, Math.ceil(total / pageSize)) : 1;
  const selectable = !!bulk;
  const toggle = (id: string) => setSelected((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });

  return (
    <div className="rounded-sheet border border-rule border-t-2 border-t-navy-700 bg-sheet shadow-sheet">
      <div className="flex items-center justify-between gap-2 border-b border-rule px-4 py-2">
        <div className="text-caption text-slate-body">{total != null ? `${total.toLocaleString("en-IN")} ${total === 1 ? "record" : "records"}` : null}</div>
        {columns.some((c) => c.hideable !== false) && <div className="relative">
          <button type="button" onClick={() => setShowCols((v) => !v)} className="inline-flex h-8 items-center gap-1.5 rounded-control px-2 text-label text-slate-body hover:bg-navy-50" aria-expanded={showCols}>
            <Columns3 aria-hidden className="size-4" /> Columns
          </button>
          {showCols && (
            <div className="absolute right-0 z-20 mt-1 w-52 rounded-sheet border border-rule bg-sheet p-2 shadow-pop">
              {table.getAllLeafColumns().filter((c) => c.getCanHide()).map((c) => (
                <label key={c.id} className="flex cursor-pointer items-center gap-2 rounded-control px-2 py-1.5 text-ui hover:bg-navy-50">
                  <input type="checkbox" checked={c.getIsVisible()} onChange={c.getToggleVisibilityHandler()} />
                  {colMeta(c.id).header}
                </label>
              ))}
            </div>
          )}
        </div>}
      </div>

      {selectable && selected.size > 0 && (
        <div className="flex items-center gap-3 border-b border-rule bg-info-bg px-4 py-2 text-ui">
          <span className="font-medium">{selected.size} selected</span>
          <Selection.Provider value={{ ids: [...selected], clear: () => setSelected(new Set()) }}>{bulk}</Selection.Provider>
        </div>
      )}

      {rows.length === 0 ? (
        empty
      ) : (
        <>
          {/* ≥768px: table */}
          <div className="hidden overflow-x-auto md:block">
            <table className="w-full border-collapse text-ui">
              <caption className="sr-only">{caption}</caption>
              <thead className="sticky top-0 z-10 bg-navy-700 text-left text-white">
                {table.getHeaderGroups().map((hg) => (
                  <tr key={hg.id}>
                    {selectable && <th className="w-10 px-3"><span className="sr-only">Select</span></th>}
                    {hg.headers.map((h) => {
                      const m = colMeta(h.column.id);
                      const dir = m.sortable
                        ? local?.id === m.id ? (local.desc ? "desc" : "asc") : null
                        : sort === m.sortKey ? "asc" : sort === `-${m.sortKey}` ? "desc" : null;
                      const onSort = m.sortable
                        ? () => setLocal(dir === "desc" ? { id: m.id, desc: false } : { id: m.id, desc: true })
                        : () => setParam("sort", dir === "desc" ? m.sortKey! : `-${m.sortKey}`);
                      return (
                        <th key={h.id} scope="col" aria-sort={dir === "asc" ? "ascending" : dir === "desc" ? "descending" : undefined} className={cn("px-3 py-2.5 text-label font-medium whitespace-nowrap", m.align === "right" && "text-right", m.className)}>
                          {m.sortKey || m.sortable ? (
                            <button type="button" className={cn("inline-flex items-center gap-1 hover:underline", m.align === "right" && "flex-row-reverse")} onClick={onSort}>
                              {flexRender(h.column.columnDef.header, h.getContext())}
                              {dir === "asc" && <ArrowUp aria-hidden className="size-3.5" />}
                              {dir === "desc" && <ArrowDown aria-hidden className="size-3.5" />}
                              {!dir && <ArrowUpDown aria-hidden className="size-3.5 opacity-40" />}
                            </button>
                          ) : (
                            flexRender(h.column.columnDef.header, h.getContext())
                          )}
                        </th>
                      );
                    })}
                  </tr>
                ))}
              </thead>
              <tbody>
                {table.getRowModel().rows.map((r) => (
                  <tr
                    key={r.id}
                    tabIndex={r.original.href ? 0 : undefined}
                    onClick={(e) => open(r.original, e)}
                    onKeyDown={(e) => e.key === "Enter" && open(r.original, e)}
                    className={cn(
                      "h-[var(--row-h)] border-b border-rule last:border-b-0",
                      r.original.href && "cursor-pointer hover:bg-navy-50 focus-visible:bg-navy-50",
                      r.original.tone === "muted" && "text-slate-body",
                      r.original.tone === "alert" && "bg-rejected-bg/50",
                    )}
                  >
                    {selectable && (
                      <td className="px-3" onClick={(e) => e.stopPropagation()}>
                        {r.original.selectable !== false && (
                          <input type="checkbox" aria-label="Select row" checked={selected.has(r.id)} onChange={() => toggle(r.id)} />
                        )}
                      </td>
                    )}
                    {r.getVisibleCells().map((c) => (
                      <td key={c.id} className={cn("px-3 py-1.5 align-middle [&_time]:whitespace-nowrap", colMeta(c.column.id).align === "right" && "text-right tabular-nums", colMeta(c.column.id).className)}>
                        {flexRender(c.column.columnDef.cell, c.getContext())}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* <768px: stacked record rows */}
          <ul className="divide-y divide-rule md:hidden">
            {sortedRows.map((r) => (
              <li key={r.id}>
                <div role={r.href ? "link" : undefined} tabIndex={r.href ? 0 : undefined} onClick={(e) => open(r, e)} onKeyDown={(e) => e.key === "Enter" && open(r, e)} className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 px-4 py-3">
                  {columns.filter((c) => visibility[c.id] !== false).map((c) => (
                    <div key={c.id} className="contents">
                      <div className="text-caption text-slate-body">{c.header}</div>
                      <div className="text-ui">{r.cells[c.id] ?? "—"}</div>
                    </div>
                  ))}
                </div>
              </li>
            ))}
          </ul>
        </>
      )}

      {(footer || pages > 1) && (
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-rule px-4 py-2.5 text-ui">
          <div className="text-slate-body">{footer}</div>
          {pages > 1 && (
            <nav aria-label="Pagination" className="flex items-center gap-1">
              <button type="button" disabled={page <= 1} onClick={() => setParam("page", String(page - 1))} className="inline-flex size-9 items-center justify-center rounded-control hover:bg-navy-50 disabled:opacity-40" aria-label="Previous page">
                <ChevronLeft aria-hidden className="size-4" />
              </button>
              <span className="px-2 tabular-nums">Page {page} of {pages}</span>
              <button type="button" disabled={page >= pages} onClick={() => setParam("page", String(page + 1))} className="inline-flex size-9 items-center justify-center rounded-control hover:bg-navy-50 disabled:opacity-40" aria-label="Next page">
                <ChevronRight aria-hidden className="size-4" />
              </button>
            </nav>
          )}
        </div>
      )}
    </div>
  );
}
