import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getViewContext } from "@/lib/auth/context";
import { can } from "@/lib/auth/permissions";
import { getDisease } from "@/lib/db/queries/analytics";
import { caseBreakdown } from "@/lib/db/queries/breakdown";
import { readParams, type SearchParams } from "@/lib/params";
import { PageHeader, Pill } from "@/components/app/bits";
import { BreakdownView } from "@/components/app/breakdown-view";
import { ExportButton } from "@/components/app/export-button";

export const metadata: Metadata = { title: "Disease" };

export default async function DiseasePage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: SearchParams }) {
  const ctx = await getViewContext();
  const { id } = await params;
  const tab = (await readParams(searchParams)).oneOf("tab", ["cases", "patients", "payments"] as const) ?? "cases";
  const [disease, d] = await Promise.all([getDisease(id), caseBreakdown(ctx, { diseaseId: id })]);
  if (!disease) notFound();
  return (
    <>
      <PageHeader
        back={{ href: "/diseases", label: "Diseases" }}
        title={disease.name}
        meta={<>{disease.categoryName}{disease.isChronic && <Pill tone="info">Chronic — recurring support likely</Pill>}</>}
        actions={can(ctx, "reports.export") && <ExportButton name="disease" params={{ id }} />}
      />
      <BreakdownView
        d={d}
        basePath={`/diseases/${id}`}
        tab={tab}
        show={{ disease: false, hospital: true }}
        donut={{ title: "By hospital", data: d.byHospital }}
        slices={[
          { title: "By hospital", data: d.byHospital },
          { title: "By gender", data: d.byGender },
          { title: "By age", data: d.byAge },
          { title: "By city", data: d.byCity },
        ]}
      />
    </>
  );
}
