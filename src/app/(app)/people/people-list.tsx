import { Users } from "lucide-react";
import { getViewContext } from "@/lib/auth/context";
import { can } from "@/lib/auth/permissions";
import { AGE_BAND_LABELS, listPeople, peopleFilters } from "@/lib/db/queries/people";
import { religionBreakdown } from "@/lib/db/queries/religion";
import { masterOptions } from "@/lib/db/queries/admin";
import { readParams, type SearchParams } from "@/lib/params";
import { fmtDate } from "@/lib/fy";
import { formatINR } from "@/lib/money";
import { GENDER } from "@/lib/labels";
import { EmptyState, GenderCard, MoneyText, PageHeader, PersonCell, Pill, SheetPanel, StatCard } from "@/components/app/bits";
import { DataTable } from "@/components/app/data-table";
import { FilterBar, type Filter } from "@/components/app/filter-bar";
import { ExportButton } from "@/components/app/export-button";

/** /patients and /applicants share this view of the one Person registry. */
export async function PeopleList({ as, searchParams }: { as: "patient" | "applicant"; searchParams: SearchParams }) {
  const ctx = await getViewContext();
  const p = await readParams(searchParams);
  const [data, m, religions] = await Promise.all([listPeople(ctx, { as, ...peopleFilters(p) }), masterOptions(), religionBreakdown(ctx, as)]);
  const title = as === "patient" ? "Patients" : "Applicants";
  const s = data.stats;
  const mm = ctx.meetingMode;
  const filters: Filter[] = [
    { name: "q", label: "Search", type: "search", placeholder: mm ? "Person code" : "Name, mobile or person code" },
    ...(mm ? [] : [{ name: "area", label: "Area", type: "select" as const, options: m.areas.map((a) => ({ value: a.id, label: a.name })) }]),
    { name: "gender", label: "Gender", type: "select", options: Object.entries(GENDER).map(([value, label]) => ({ value, label })) },
    { name: "age", label: "Age band", type: "select", options: AGE_BAND_LABELS.map((b) => ({ value: b, label: b })) },
    { name: "aided", label: "Received aid", type: "toggle" },
    { name: "repeat", label: "Repeat (more than one case)", type: "toggle" },
  ];
  const filtered = filters.some((f) => p.str(f.name));
  return (
    <>
      <PageHeader
        title={title}
        meta={<>Everyone who has been {as === "patient" ? "a patient" : "an applicant"} on a case, with lifetime aid received</>}
        actions={can(ctx, "reports.export") && <ExportButton name={as === "patient" ? "patients" : "applicants"} />}
      />
      <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label={title} value={s.people.toLocaleString("en-IN")} />
        <StatCard label="Cases" value={s.cases.toLocaleString("en-IN")} rule="info" />
        <StatCard label="Aid received" value={formatINR(s.paidPaise)} rule="approved" />
        {as === "patient"
          ? <GenderCard male={s.male} female={s.female} />
          : <StatCard label="Repeat applicants" value={s.repeat.toLocaleString("en-IN")} rule="pending" />}
      </div>
      {religions && religions.length > 0 && (
        <SheetPanel title="By religion" className="mb-6" bodyClassName="p-0" action={<span className="text-caption text-slate-body">Only the super admin sees this</span>}>
          <table className="w-full text-ui">
            <caption className="sr-only">{title} by religion</caption>
            <thead className="border-b border-rule text-left text-slate-body">
              <tr><th scope="col" className="px-3 py-2 text-label font-medium">Religion</th><th scope="col" className="px-3 py-2 text-right text-label font-medium">{title}</th><th scope="col" className="px-3 py-2 text-right text-label font-medium">Cases</th><th scope="col" className="px-3 py-2 text-right text-label font-medium">Aid received</th></tr>
            </thead>
            <tbody>
              {religions.map((r) => (
                <tr key={r.religion} className="h-[var(--row-h)] border-b border-rule last:border-b-0">
                  <td className="px-3">{r.religion}</td>
                  <td className="px-3 text-right tabular-nums">{r.people.toLocaleString("en-IN")}</td>
                  <td className="px-3 text-right tabular-nums">{r.cases.toLocaleString("en-IN")}</td>
                  <td className="px-3 text-right font-mono"><MoneyText paise={r.paidPaise} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </SheetPanel>
      )}
      <FilterBar filters={filters} />
      <DataTable
        caption={title}
        total={data.total}
        page={data.page}
        pageSize={data.pageSize}
        columns={[
          { id: "person", header: as === "patient" ? "Patient" : "Applicant", sortKey: "name", hideable: false },
          { id: "gender", header: "Gender", sortKey: "gender", hideable: false },
          { id: "age", header: mm ? "Age band" : "Age", align: "right" as const, sortKey: "age", hideable: false },
          ...(mm ? [] : [{ id: "area", header: "Area", sortKey: "area", hideable: false }, { id: "mobile", header: "Mobile no.", hideable: false }]),
          { id: "cases", header: "Cases", align: "right" as const, sortKey: "cases", hideable: false },
          { id: "total", header: "Aid received", align: "right" as const, sortKey: "paid", hideable: false },
          { id: "last", header: "Last case", sortKey: "last", hideable: false },
        ]}
        rows={data.rows.map((r) => ({
          id: r.person.id,
          href: `/people/${r.person.id}`,
          cells: {
            person: (
              <span className="flex items-center gap-2">
                <PersonCell person={r.person} />
                {r.watchFlag && <Pill tone="pending">Watch</Pill>}
              </span>
            ),
            gender: (r.gender && GENDER[r.gender as keyof typeof GENDER]) || "—",
            age: (mm ? r.ageBand : r.age) ?? "—",
            area: r.areaName ?? "—",
            mobile: <span className="font-mono text-mono-sm">{r.mobile ?? "—"}</span>,
            cases: r.cases,
            total: <MoneyText paise={r.totalPaise} className="font-mono" />,
            last: r.lastCaseAt ? <time>{fmtDate(r.lastCaseAt)}</time> : "—",
          },
        }))}
        empty={<EmptyState icon={Users}>{filtered ? "Nobody matches these filters." : `No ${title.toLowerCase()} yet. People are added from the application form.`}</EmptyState>}
      />
    </>
  );
}
