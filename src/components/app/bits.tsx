import Link from "next/link";
import type { ApplicationStatus, PaymentStatus } from "@prisma/client";
import { EyeOff, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatINR } from "@/lib/money";
import { STATUS_LABEL } from "@/lib/applications/transitions";
import { PAYMENT_STATUS } from "@/lib/labels";
import type { PersonRef } from "@/lib/redact";

// Small presentational pieces from docs/04 §7. Server-safe (no hooks).

export function MoneyText({ paise, className, muted }: { paise: bigint | null | undefined; className?: string; muted?: boolean }) {
  return (
    <span className={cn("tabular-nums whitespace-nowrap", paise != null && paise < 0n && "text-rejected", muted && paise == null && "text-slate-body", className)}>
      {formatINR(paise)}
    </span>
  );
}

type Tone = "slate" | "pending" | "pending-outline" | "info" | "approved" | "rejected" | "redacted";
const TONE: Record<Tone, string> = {
  slate: "bg-navy-50 text-slate-body border-rule",
  pending: "bg-pending-bg text-pending border-transparent",
  "pending-outline": "bg-sheet text-pending border-pending",
  info: "bg-info-bg text-info border-transparent",
  approved: "bg-approved-bg text-approved border-transparent",
  rejected: "bg-rejected-bg text-rejected border-transparent",
  redacted: "bg-redacted-bg text-redacted border-transparent",
};

export function Pill({ tone, children, className }: { tone: Tone; children: React.ReactNode; className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-1 rounded-badge border px-2 py-0.5 text-caption font-medium whitespace-nowrap", TONE[tone], className)}>
      {children}
    </span>
  );
}

const STATUS_TONE: Record<ApplicationStatus, Tone> = {
  DRAFT: "slate",
  SUBMITTED: "pending",
  UNDER_VERIFICATION: "pending",
  COMMITTEE_REVIEW: "pending",
  DEFERRED: "pending",
  ON_HOLD: "pending-outline",
  APPROVED: "info",
  PARTIALLY_APPROVED: "info",
  PAYMENT_PENDING: "info",
  PAID: "approved",
  CLOSED: "approved",
  REJECTED: "rejected",
};

export function StatusBadge({ status }: { status: ApplicationStatus }) {
  return <Pill tone={STATUS_TONE[status]}>{STATUS_LABEL[status]}</Pill>;
}

const PAY_TONE: Record<PaymentStatus, Tone> = { PENDING: "pending", ISSUED: "pending", CLEARED: "approved", BOUNCED: "rejected", CANCELLED: "rejected" };
export function PaymentStatusBadge({ status }: { status: PaymentStatus }) {
  return <Pill tone={PAY_TONE[status]}>{PAYMENT_STATUS[status]}</Pill>;
}

/** The redacted-hue alias chip: ▣ P-000412. */
export function AliasChip({ code, className }: { code: string; className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-1 rounded-full bg-redacted-bg px-2 py-0.5 font-mono text-mono-sm text-redacted", className)}>
      <EyeOff aria-hidden className="size-3" />
      {code}
      <span className="sr-only">(identity hidden)</span>
    </span>
  );
}

/** The single place identity is rendered: a name, or the alias chip. */
export function PersonCell({ person, href }: { person: PersonRef; href?: string }) {
  if (person.isRedacted) return <AliasChip code={person.personCode} />;
  const inner = (
    <span className="flex flex-col leading-tight">
      <span className="font-medium text-navy-900">{person.displayName}</span>
      <span className="font-mono text-caption text-slate-body">{person.personCode}</span>
    </span>
  );
  return href ? <Link href={href} className="hover:underline">{inner}</Link> : inner;
}

/** The ledger sheet with the semantic 2px top rule. */
export function SheetPanel({
  title, action, rule = "navy", children, className, bodyClassName,
}: {
  title?: React.ReactNode;
  action?: React.ReactNode;
  rule?: "navy" | "approved" | "pending" | "rejected" | "info" | "redacted" | "zakat" | "none";
  children: React.ReactNode;
  className?: string;
  bodyClassName?: string;
}) {
  const ruleClass = {
    navy: "border-t-navy-700", approved: "border-t-approved", pending: "border-t-pending", rejected: "border-t-rejected",
    info: "border-t-info", redacted: "border-t-redacted", zakat: "border-t-fund-zakat", none: "border-t-rule",
  }[rule];
  return (
    <section className={cn("rounded-sheet border border-rule border-t-2 bg-sheet shadow-sheet", ruleClass, className)}>
      {(title || action) && (
        <header className="flex items-center justify-between gap-3 border-b border-rule px-5 py-3">
          {title && <h3 className="text-h3 text-navy-900">{title}</h3>}
          {action}
        </header>
      )}
      <div className={cn("p-5", bodyClassName)}>{children}</div>
    </section>
  );
}

/** Big tabular figure, small label beneath, optional delta. */
export function StatCard({ label, value, delta, rule = "navy", href }: { label: string; value: React.ReactNode; delta?: React.ReactNode; rule?: "navy" | "approved" | "pending" | "info" | "zakat"; href?: string }) {
  const body = (
    <SheetPanel rule={rule} bodyClassName="px-5 py-4">
      {/* Sized so ₹ crore amounts still fit a narrow card; long values wrap instead of spilling out. */}
      <div className="text-h1 tabular-nums text-navy-900 [overflow-wrap:anywhere] 2xl:text-display">{value}</div>
      <div className="mt-1 text-label text-slate-body">{label}</div>
      {delta && <div className="mt-2 text-caption text-slate-body">{delta}</div>}
    </SheetPanel>
  );
  return href ? <Link href={href} className="block rounded-sheet">{body}</Link> : body;
}

/** Male / female split as two labelled counts with a proportion bar. */
export function GenderCard({ male, female, other = 0 }: { male: number; female: number; other?: number }) {
  const total = male + female + other;
  const malePct = total ? Math.round((male * 100) / total) : 0;
  const otherPct = total ? Math.round((other * 100) / total) : 0;
  // Female takes the remainder so the shares always add up to 100%.
  const femalePct = total ? 100 - malePct - otherPct : 0;
  return (
    <SheetPanel rule="pending" bodyClassName="px-5 py-4">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <div className="text-h1 tabular-nums text-navy-900">{male.toLocaleString("en-IN")}</div>
          <div className="mt-1 flex items-center gap-1.5 text-label text-slate-body"><span aria-hidden className="size-2 rounded-full bg-navy-700" />Male · {malePct}%</div>
        </div>
        <div>
          <div className="text-h1 tabular-nums text-navy-900">{female.toLocaleString("en-IN")}</div>
          <div className="mt-1 flex items-center gap-1.5 text-label text-slate-body"><span aria-hidden className="size-2 rounded-full bg-info" />Female · {femalePct}%</div>
        </div>
      </div>
      <div className="mt-3 flex h-1.5 overflow-hidden rounded-full bg-navy-50" role="img" aria-label={`${malePct}% male, ${femalePct}% female`}>
        <div className="bg-navy-700" style={{ width: `${malePct}%` }} />
        <div className="bg-info" style={{ width: `${femalePct}%` }} />
      </div>
      {other > 0 && <div className="mt-2 text-caption text-slate-body">{other} other</div>}
    </SheetPanel>
  );
}

export function Delta({ cur, prev, money, suffix = "vs last FY" }: { cur: number | bigint; prev: number | bigint; money?: boolean; suffix?: string }) {
  const d = typeof cur === "bigint" ? (cur as bigint) - (prev as bigint) : (cur as number) - (prev as number);
  const positive = typeof d === "bigint" ? d >= 0n : d >= 0;
  const text = money ? formatINR(d as bigint) : String(d);
  return (
    <span className={positive ? "text-approved" : "text-rejected"}>
      {positive ? "+" : ""}
      {text} <span className="text-slate-body">{suffix}</span>
    </span>
  );
}

export function EmptyState({ icon: Icon, children, action }: { icon: LucideIcon; children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 px-6 py-14 text-center">
      <Icon aria-hidden className="size-8 text-navy-400" />
      <p className="max-w-[68ch] text-body text-slate-body">{children}</p>
      {action}
    </div>
  );
}

export function PageHeader({ title, meta, actions, back }: { title: React.ReactNode; meta?: React.ReactNode; actions?: React.ReactNode; back?: { href: string; label: string } }) {
  return (
    <div className="mb-6">
      {back && (
        <Link href={back.href} className="mb-2 inline-block text-label text-info hover:underline">
          ‹ {back.label}
        </Link>
      )}
      <div className="flex flex-wrap items-start justify-between gap-4 border-b border-rule pb-4">
        <div className="min-w-0">
          <h1 className="text-h1 text-navy-900">{title}</h1>
          {meta && <div className="mt-1 flex flex-wrap items-center gap-2 text-ui text-slate-body">{meta}</div>}
        </div>
        {actions && <div className="flex flex-wrap items-center gap-2" data-print-hide>{actions}</div>}
      </div>
    </div>
  );
}

/** Label/value pair for read-only blocks. */
export function Field({ label, children, mono, className }: { label: string; children: React.ReactNode; mono?: boolean; className?: string }) {
  const empty = children == null || children === "" || children === false;
  return (
    <div className={className}>
      <dt className="text-label text-slate-body">{label}</dt>
      <dd className={cn("mt-0.5 text-body text-navy-900 break-words", mono && "font-mono text-mono-sm", empty && "text-slate-body")}>{empty ? "—" : children}</dd>
    </div>
  );
}

/** Fund balance with its spend proportion. */
export function FundBar({ name, type, balancePaise, committedPct, low }: { name: string; type: string; balancePaise: bigint; committedPct: number; low: boolean }) {
  const color = type === "ZAKAT" ? "bg-fund-zakat" : type === "INTEREST" ? "bg-fund-sadaqah" : "bg-fund-general";
  return (
    <div className="grid grid-cols-[120px_1fr] items-center gap-x-4 gap-y-1 sm:grid-cols-[120px_160px_1fr_auto]">
      <div className="text-ui font-medium text-navy-900">{name}</div>
      <MoneyText paise={balancePaise} className={cn("text-h3 sm:text-right", balancePaise < 0n && "text-rejected")} />
      <div className="col-span-2 h-2 overflow-hidden rounded-full bg-navy-50 sm:col-span-1" role="img" aria-label={`${committedPct}% used`}>
        <div className={cn("h-full", color)} style={{ width: `${committedPct}%` }} />
      </div>
      <div className="col-span-2 text-caption text-slate-body sm:col-span-1">
        {committedPct}% used
        {low && <Pill tone="rejected" className="ml-2">Running low</Pill>}
      </div>
    </div>
  );
}
