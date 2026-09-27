"use client";

import { forwardRef, useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { Check, ChevronDown, Plus, Search } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

/** `hint` is shown faint on the right (e.g. a donor code) and is searchable. */
type Option = { value: string; label: string; hint?: string };
type Props = React.SelectHTMLAttributes<HTMLSelectElement> & {
  invalid?: boolean;
  options: Option[];
  placeholder?: string;
  /** Offers "+ Add" for text that is not in the list. Returns the new option, or null to cancel. */
  onCreate?: (text: string) => Promise<Option | null> | Option | null;
  /** List the placeholder as a choice (e.g. "All" in filters). Otherwise it is only hint text. */
  clearable?: boolean;
  /** Wording of the add row, e.g. (t) => `Add new hospital “${t}”`. */
  createLabel?: (text: string) => string;
};

const SEARCH_FROM = 9; // lists longer than this get a search box

/**
 * Custom dropdown with the native <select> kept underneath as the source of truth. That keeps
 * `{...register()}`, controlled `value`/`onChange`, form submission and validation working
 * unchanged. React-hook-form sets values by assigning `el.value`, so the element's `value`
 * setter is wrapped to keep the visible label in sync.
 */
export const Select = forwardRef<HTMLSelectElement, Props>(function Select(
  { className, invalid, options, placeholder, id, disabled, value, defaultValue, onBlur, "aria-label": ariaLabel, onCreate, createLabel, clearable, ...rest },
  forwarded,
) {
  const native = useRef<HTMLSelectElement | null>(null);
  const [current, setCurrent] = useState(String(value ?? defaultValue ?? ""));
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const listId = useId();
  const listRef = useRef<HTMLUListElement>(null);
  // Options created here; they are rendered as native options before being selected.
  const [extra, setExtra] = useState<Option[]>([]);
  const [creating, setCreating] = useState(false);
  const pending = useRef<string | null>(null);

  useEffect(() => {
    if (value !== undefined) setCurrent(String(value ?? ""));
  }, [value]);

  const attach = useCallback(
    (el: HTMLSelectElement | null) => {
      native.current = el;
      if (el && !("__watched" in el)) {
        const NATIVE_VALUE = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value")!; // browser only
        Object.defineProperty(el, "value", {
          configurable: true,
          get() { return NATIVE_VALUE.get!.call(this); },
          set(v) { NATIVE_VALUE.set!.call(this, v); setCurrent(NATIVE_VALUE.get!.call(this)); },
        });
        Object.defineProperty(el, "__watched", { value: true });
      }
      if (typeof forwarded === "function") forwarded(el);
      else if (forwarded) forwarded.current = el;
      if (el) setCurrent(el.value);
    },
    [forwarded],
  );

  const opts: Option[] = useMemo(() => [...options, ...extra.filter((x) => !options.some((o) => o.value === x.value))], [options, extra]);
  const all: Option[] = useMemo(() => (clearable && placeholder !== undefined ? [{ value: "", label: placeholder }, ...opts] : opts), [opts, placeholder, clearable]);
  const searchable = !!onCreate || all.length >= SEARCH_FROM;
  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? all.filter((o) => o.label.toLowerCase().includes(q) || o.hint?.toLowerCase().includes(q)) : all;
  }, [all, query]);
  const selected = all.find((o) => o.value === current);
  const typed = query.trim();
  // "+ Add new" is always offered when onCreate is set, carrying whatever was typed.
  const canCreate = !!onCreate && !all.some((o) => o.label.toLowerCase() === typed.toLowerCase() && typed !== "");
  const rowCount = shown.length + (canCreate ? 1 : 0);

  const choose = (v: string) => {
    const el = native.current;
    if (el) {
      el.value = v;
      el.dispatchEvent(new Event("change", { bubbles: true }));
    }
    setOpen(false);
  };

  const create = async () => {
    if (!onCreate || creating) return;
    setCreating(true);
    setOpen(false); // close first: onCreate may open a dialog
    try {
      const opt = await onCreate(typed);
      if (!opt) return;
      pending.current = opt.value;
      setExtra((e) => [...e, opt]);
    } finally {
      setCreating(false);
    }
  };
  // Select a newly created option once its native <option> exists.
  useEffect(() => {
    if (pending.current && opts.some((o) => o.value === pending.current)) {
      const v = pending.current;
      pending.current = null;
      choose(v);
    }
  }, [opts]);

  const onOpenChange = (o: boolean) => {
    setOpen(o);
    if (o) {
      setQuery("");
      setActive(Math.max(0, all.findIndex((x) => x.value === current)));
    } else {
      // Lets onTouched validation see the field as visited.
      native.current?.dispatchEvent(new FocusEvent("focusout", { bubbles: true }));
    }
  };

  useEffect(() => {
    if (open) listRef.current?.querySelector(`[data-index="${active}"]`)?.scrollIntoView({ block: "nearest" });
  }, [active, open]);

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") { e.preventDefault(); setActive((i) => Math.min(rowCount - 1, i + 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setActive((i) => Math.max(0, i - 1)); }
    else if (e.key === "Home") { e.preventDefault(); setActive(0); }
    else if (e.key === "End") { e.preventDefault(); setActive(rowCount - 1); }
    else if (e.key === "Enter") { e.preventDefault(); if (shown[active]) choose(shown[active].value); else if (canCreate) void create(); }
    else if (e.key.length === 1 && !searchable) {
      // Type-ahead on short lists without a search box.
      const i = shown.findIndex((o) => o.label.toLowerCase().startsWith(e.key.toLowerCase()));
      if (i >= 0) setActive(i);
    }
  };

  return (
    <>
      <select ref={attach} {...rest} value={value} defaultValue={defaultValue} onBlur={onBlur} disabled={disabled} tabIndex={-1} aria-hidden className="sr-only">
        {placeholder !== undefined && <option value="">{placeholder}</option>}
        {opts.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
      <Popover open={open} onOpenChange={onOpenChange}>
        <PopoverTrigger asChild>
          <button
            type="button"
            id={id}
            role="combobox"
            aria-expanded={open}
            aria-controls={listId}
            aria-label={ariaLabel}
            aria-invalid={invalid || undefined}
            disabled={disabled}
            onKeyDown={(e) => { if (e.key === "ArrowDown" && !open) { e.preventDefault(); onOpenChange(true); } }}
            className={cn(
              "flex h-10 w-full items-center justify-between gap-2 rounded-control border border-rule bg-sheet px-3 text-left text-ui text-navy-900 transition-colors duration-[120ms]",
              "hover:border-navy-200 focus-visible:border-info disabled:cursor-not-allowed disabled:bg-navy-50 aria-[invalid=true]:border-rejected data-[state=open]:border-info",
              className,
            )}
          >
            <span className={cn("truncate", (!selected || selected.value === "") && "text-slate-body")}>{selected?.label ?? placeholder ?? ""}</span>
            <ChevronDown aria-hidden className={cn("size-4 shrink-0 text-slate-body transition-transform duration-[120ms]", open && "rotate-180")} />
          </button>
        </PopoverTrigger>
        <PopoverContent
          align="start"
          sideOffset={4}
          collisionPadding={12}
          className="flex flex-col overflow-hidden p-0"
          style={{ width: "max(var(--radix-popover-trigger-width), 12rem)", maxHeight: "min(20rem, var(--radix-popover-content-available-height))" }}
          onKeyDown={onKeyDown}
        >
          {searchable && (
            <div className="flex shrink-0 items-center gap-2 border-b border-rule px-3">
              <Search aria-hidden className="size-4 shrink-0 text-slate-body" />
              <input
                autoFocus
                value={query}
                onChange={(e) => { setQuery(e.target.value); setActive(0); }}
                placeholder="Search…"
                aria-label="Search the list"
                aria-controls={listId}
                className="h-10 w-full bg-transparent text-ui outline-none placeholder:text-slate-body/70"
              />
            </div>
          )}
          <ul ref={listRef} id={listId} role="listbox" tabIndex={searchable ? -1 : 0} aria-activedescendant={shown[active] ? `${listId}-${active}` : undefined}
            className="thin-scroll min-h-0 flex-1 overflow-y-auto p-1 outline-none" autoFocus={!searchable}>
            {shown.length === 0 && !canCreate && <li className="px-3 py-2 text-ui text-slate-body">Nothing matches.</li>}
            {shown.map((o, i) => {
              const isSel = o.value === current;
              return (
                <li
                  key={o.value || "__empty"}
                  id={`${listId}-${i}`}
                  data-index={i}
                  role="option"
                  aria-selected={isSel}
                  onMouseEnter={() => setActive(i)}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => choose(o.value)}
                  className={cn(
                    "flex min-h-9 cursor-pointer items-center gap-2 rounded-control px-3 py-1.5 text-ui",
                    i === active && "bg-navy-50",
                    isSel && "font-medium text-navy-700",
                    o.value === "" && "text-slate-body",
                  )}
                >
                  <span className="flex-1 truncate">{o.label}</span>
                  {o.hint && <span className="shrink-0 font-mono text-caption text-slate-body">{o.hint}</span>}
                  <Check aria-hidden className={cn("size-4 shrink-0 text-navy-700", !isSel && "invisible")} />
                </li>
              );
            })}
          </ul>
          {/* Pinned below the list so it never scrolls out of sight. */}
          {canCreate && (
            <div className="shrink-0 border-t border-rule p-1">
              <button
                type="button"
                id={`${listId}-${shown.length}`}
                onMouseEnter={() => setActive(shown.length)}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => void create()}
                className={cn("flex min-h-9 w-full items-center gap-2 rounded-control px-3 py-1.5 text-left text-ui font-medium text-info", active === shown.length && "bg-info-bg", creating && "opacity-60")}
              >
                <Plus aria-hidden className="size-4 shrink-0" />
                <span className="truncate">{createLabel ? createLabel(typed) : typed ? `Add “${typed}”` : "Add new"}</span>
              </button>
            </div>
          )}
        </PopoverContent>
      </Popover>
    </>
  );
});
