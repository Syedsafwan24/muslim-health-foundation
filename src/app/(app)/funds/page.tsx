import type { Metadata } from "next";
import { requirePage } from "@/lib/auth/context";
import { can } from "@/lib/auth/permissions";
import { listFunds } from "@/lib/db/queries/funds";
import { FUND_TYPE } from "@/lib/labels";
import { Field, FundBar, MoneyText, PageHeader, Pill, SheetPanel } from "@/components/app/bits";
import { FundDialog } from "./fund-dialog";

export const metadata: Metadata = { title: "Funds" };

export default async function FundsPage() {
  const ctx = await requirePage("funds.read");
  const funds = await listFunds(ctx, { includeInactive: true });
  const active = funds.filter((f) => f.isActive);
  return (
    <>
      <PageHeader
        title="Funds"
        meta={<>Balance = opening + donations − payments − expenses, computed live. FY {ctx.fy}.</>}
        actions={can(ctx, "funds.write") && <FundDialog />}
      />
      {active.length === 1 && (
        <p className="mb-4 max-w-[68ch] rounded-control bg-info-bg px-4 py-3 text-ui text-navy-900">
          Only one fund is active, so every donation and payment is booked to {active[0].name} automatically and no fund selector is shown anywhere else.
        </p>
      )}
      <div className="space-y-6">
        {funds.map((f) => (
          <SheetPanel
            key={f.id}
            rule={f.type === "ZAKAT" ? "zakat" : f.isActive ? "navy" : "none"}
            title={<span className="flex items-center gap-2">{f.name}{!f.isActive && <Pill tone="slate">Inactive</Pill>}{f.isRestricted && <Pill tone="info">Restricted</Pill>}{!f.allowsExpenses && <Pill tone="slate">No expenses</Pill>}</span>}
            action={can(ctx, "funds.write") && <FundDialog initial={{ id: f.id, name: f.name, type: f.type, isRestricted: f.isRestricted, allowsExpenses: f.allowsExpenses, isActive: f.isActive, openingBalancePaise: f.openingPaise, password: "" }} />}
          >
            <FundBar name="Balance" type={f.type} balancePaise={f.balancePaise} committedPct={f.committedPct} low={f.low} />
            <dl className="mt-5 grid gap-x-6 gap-y-3 sm:grid-cols-5">
              <Field label="Type">{FUND_TYPE[f.type]}</Field>
              <Field label="Opening balance"><MoneyText paise={f.openingPaise} /></Field>
              <Field label={`Donations received FY ${ctx.fy}`}><MoneyText paise={f.fyInflowPaise} /></Field>
              <Field label={`Paid out FY ${ctx.fy}`}><MoneyText paise={f.fyOutflowPaise} /></Field>
              <Field label="Approved, not yet paid"><MoneyText paise={f.committedPaise} /></Field>
            </dl>
            {f.low && <p className="mt-3 text-ui text-rejected">The balance is below 10% of this year&apos;s inflow.</p>}
          </SheetPanel>
        ))}
      </div>
    </>
  );
}
