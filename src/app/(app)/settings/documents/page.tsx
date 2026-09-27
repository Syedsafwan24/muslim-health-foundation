import type { Metadata } from "next";
import { requirePage } from "@/lib/auth/context";
import { can } from "@/lib/auth/permissions";
import { getSettings } from "@/lib/settings";
import { SheetPanel } from "@/components/app/bits";
import { DocumentSettings } from "../settings-forms";

export const metadata: Metadata = { title: "Documents" };

export default async function DocumentsSettings() {
  const ctx = await requirePage("settings.read");
  const s = await getSettings(["documents.maxFileMb", "documents.maxFilesPerCase"]);
  return (
    <SheetPanel title="Documents">
      <DocumentSettings
        readOnly={!can(ctx, "settings.write")}
        maxFileMb={s["documents.maxFileMb"]}
        maxFilesPerCase={s["documents.maxFilesPerCase"]}
      />
    </SheetPanel>
  );
}
