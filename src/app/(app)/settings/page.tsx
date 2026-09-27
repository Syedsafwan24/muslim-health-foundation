import type { Metadata } from "next";
import { requirePage } from "@/lib/auth/context";
import { can } from "@/lib/auth/permissions";
import { getSettings } from "@/lib/settings";
import { SheetPanel } from "@/components/app/bits";
import { OrgForm } from "./settings-forms";

export const metadata: Metadata = { title: "Settings" };

export default async function OrganisationSettings() {
  const ctx = await requirePage("settings.read");
  const s = await getSettings(["org.name", "org.address", "org.phone", "org.email", "org.registrationNo", "org.80gNo"]);
  return (
    <SheetPanel title="Organisation">
      <p className="mb-5 max-w-[68ch] text-ui text-slate-body">Printed on every receipt, voucher, case sheet and report. The fiscal year runs 1 April to 31 March; amounts are shown in rupees; the interface is in English.</p>
      <OrgForm
        readOnly={!can(ctx, "settings.write")}
        initial={{ name: s["org.name"], address: s["org.address"], phone: s["org.phone"], email: s["org.email"], registrationNo: s["org.registrationNo"], eightyGNo: s["org.80gNo"] }}
      />
    </SheetPanel>
  );
}
