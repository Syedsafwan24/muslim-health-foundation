import type { Metadata } from "next";
import { cookies } from "next/headers";
import { SheetPanel } from "@/components/app/bits";
import { Appearance } from "../settings-forms";

export const metadata: Metadata = { title: "Appearance" };

export default async function AppearanceSettings() {
  const c = await cookies();
  return (
    <SheetPanel title="Appearance">
      <p className="mb-4 text-ui text-slate-body">Saved on this computer only.</p>
      <Appearance theme={c.get("theme")?.value ?? "light"} density={c.get("density")?.value ?? "comfortable"} />
    </SheetPanel>
  );
}
