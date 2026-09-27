"use client";

import { forwardRef, useEffect, useState } from "react";
import { Check, Copy } from "lucide-react";
import { cn } from "@/lib/utils";
import { groupRupees, paiseToRupeeString, parseRupees } from "@/lib/money";

export const inputClass =
  "h-10 w-full rounded-control border border-rule bg-sheet px-3 text-ui text-navy-900 placeholder:text-slate-body/70 transition-colors duration-[120ms] focus-visible:border-info disabled:cursor-not-allowed disabled:bg-navy-50 aria-[invalid=true]:border-rejected";

/** Indian grouping as you type (1,25,000); the value is BigInt paise. */
export function MoneyInput({
  value, onChange, id, invalid, disabled, placeholder, max, onOverMax, "aria-describedby": describedBy,
}: {
  value: bigint | null | undefined;
  onChange: (v: bigint | null) => void;
  id?: string;
  invalid?: boolean;
  disabled?: boolean;
  placeholder?: string;
  /** Upper limit in paise; keystrokes that would go past it are ignored. */
  max?: bigint | null;
  /** Called when a keystroke is ignored for going past `max`. */
  onOverMax?: () => void;
  "aria-describedby"?: string;
}) {
  const [text, setText] = useState(() => groupRupees(paiseToRupeeString(value)));
  // Follow external resets without fighting the user's typing.
  useEffect(() => {
    const current = parseRupees(text);
    if ((value ?? null) !== current) setText(groupRupees(paiseToRupeeString(value)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);
  return (
    <div className="relative">
      <span aria-hidden className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-slate-body">₹</span>
      <input
        id={id}
        inputMode="decimal"
        autoComplete="off"
        className={cn(inputClass, "pl-7 text-right tabular-nums")}
        value={text}
        disabled={disabled}
        placeholder={placeholder ?? "0"}
        aria-invalid={invalid || undefined}
        aria-describedby={describedBy}
        onChange={(e) => {
          const g = groupRupees(e.target.value);
          if (max != null && g !== "" && parseRupees(g)! > max) return onOverMax?.();
          setText(g);
          onChange(g === "" ? null : parseRupees(g));
        }}
      />
    </div>
  );
}

export const TextInput = forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement> & { invalid?: boolean }>(
  function TextInput({ className, invalid, ...p }, ref) {
    return <input ref={ref} className={cn(inputClass, className)} aria-invalid={invalid || undefined} {...p} />;
  },
);

export const TextArea = forwardRef<HTMLTextAreaElement, React.TextareaHTMLAttributes<HTMLTextAreaElement> & { invalid?: boolean }>(
  function TextArea({ className, invalid, ...p }, ref) {
    return <textarea ref={ref} className={cn(inputClass, "h-auto min-h-24 py-2 leading-6", className)} aria-invalid={invalid || undefined} {...p} />;
  },
);

export { Select } from "./select";

/** Label + control + helper/error, with ids wired for screen readers. */
export function FormField({
  id, label, error, hint, children, className, required,
}: {
  id: string;
  label: string;
  error?: string;
  hint?: string;
  children: React.ReactNode;
  className?: string;
  required?: boolean;
}) {
  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <label htmlFor={id} className="text-label text-navy-900">
        {label}
        {required && <span className="text-rejected"> *</span>}
      </label>
      {children}
      {error ? (
        <p id={`${id}-error`} role="alert" className="text-caption text-rejected">{error}</p>
      ) : hint ? (
        <p id={`${id}-hint`} className="text-caption text-slate-body">{hint}</p>
      ) : null}
    </div>
  );
}

/** Mono case number, copy on click. */
export function CaseNo({ value, className }: { value: string; className?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      className={cn("group inline-flex items-center gap-1.5 whitespace-nowrap font-mono text-mono-sm text-navy-900", className)}
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        void navigator.clipboard?.writeText(value).then(() => {
          setCopied(true);
          setTimeout(() => setCopied(false), 1200);
        });
      }}
      aria-label={`Copy case number ${value}`}
      title="Copy"
    >
      {value}
      {copied ? <Check aria-hidden className="size-3.5 text-approved" /> : <Copy aria-hidden className="size-3.5 opacity-0 group-hover:opacity-60" />}
    </button>
  );
}
