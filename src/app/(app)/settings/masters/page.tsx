import type { Metadata } from "next";
import Link from "next/link";
import { requirePage } from "@/lib/auth/context";
import { can } from "@/lib/auth/permissions";
import { mastersWithUsage } from "@/lib/db/queries/admin";
import { SheetPanel } from "@/components/app/bits";
import { MasterRow } from "../settings-forms";

export const metadata: Metadata = { title: "Lists" };

export default async function MastersSettings() {
  const ctx = await requirePage("settings.read");
  const m = await mastersWithUsage();
  const ro = !can(ctx, "masters.write");
  const cats = m.categories.map((c) => ({ id: c.id, name: c.name }));
  return (
    <div className="space-y-6">
      <p className="max-w-[68ch] text-ui text-slate-body">A master that is in use cannot be removed — it can only be renamed. Hospitals are managed from the <Link href="/hospitals" className="text-info hover:underline">hospitals page</Link>.</p>
      <SheetPanel title="Areas and mohallas" bodyClassName="p-0">
        <p className="px-5 pt-3 text-caption text-slate-body">Demo list until the trust supplies its own (open question 10).</p>
        <ul className="divide-y divide-rule">
          {m.areas.map((a) => <MasterRow key={a.id} kind="area" id={a.id} name={a.name} uses={a.uses} extra={{ taluk: a.taluk }} readOnly={ro} />)}
          {!ro && <MasterRow kind="area" readOnly={false} />}
        </ul>
      </SheetPanel>
      <SheetPanel title="Disease categories" bodyClassName="p-0">
        <ul className="divide-y divide-rule">
          {m.categories.map((c) => <MasterRow key={c.id} kind="category" id={c.id} name={c.name} uses={c.uses} extra={{ sortOrder: c.sortOrder }} readOnly={ro} />)}
          {!ro && <MasterRow kind="category" readOnly={false} />}
        </ul>
      </SheetPanel>
      <SheetPanel title="Diseases" bodyClassName="p-0">
        <ul className="divide-y divide-rule">
          {m.diseases.map((d) => <MasterRow key={d.id} kind="disease" id={d.id} name={d.name} label={`${d.categoryName} — ${d.name}`} uses={d.uses} extra={{ categoryId: d.categoryId, isChronic: d.isChronic }} categories={cats} readOnly={ro} />)}
        </ul>
        {!ro && <ul className="border-t border-rule"><MasterRow kind="disease" categories={cats} readOnly={false} /></ul>}
      </SheetPanel>
      <SheetPanel title="Banks" bodyClassName="p-0">
        <ul className="divide-y divide-rule">
          {m.banks.map((b) => <MasterRow key={b.id} kind="bank" id={b.id} name={b.name} label={b.branch ? `${b.name}, ${b.branch}` : b.name} uses={b.uses} extra={{ branch: b.branch, accountLast4: b.accountLast4, isOwnAccount: b.isOwnAccount }} readOnly={ro} />)}
          {!ro && <MasterRow kind="bank" readOnly={false} />}
        </ul>
      </SheetPanel>
    </div>
  );
}
