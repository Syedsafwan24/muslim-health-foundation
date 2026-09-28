import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { EyeOff } from "lucide-react";
import { requirePage } from "@/lib/auth/context";
import { can } from "@/lib/auth/permissions";
import { caseSuggestions, getApplicationForEdit, missingDocuments, priorAid } from "@/lib/db/queries/applications";
import { masterOptions } from "@/lib/db/queries/admin";
import { activeFunds } from "@/lib/db/queries/funds";
import { getSetting } from "@/lib/settings";
import { toDateInput } from "@/lib/fy";
import { EDITABLE } from "@/lib/applications/transitions";
import type { PersonInput } from "@/lib/validators";
import type { PersonView } from "@/lib/redact";
import { EmptyState, PageHeader } from "@/components/app/bits";
import { readParams, type SearchParams } from "@/lib/params";
import { ApplicationForm } from "../../application-form";

export const metadata: Metadata = { title: "Edit application" };

function personDefaults(p: PersonView): PersonInput {
  if (p.isRedacted) throw new Error("unreachable: edit is never served masked");
  return {
    personId: p.id, fullName: p.fullName, fatherName: p.fatherName ?? "", husbandName: p.husbandName ?? "", gender: p.gender ?? undefined,
    ageYears: p.age ?? "", maritalStatus: p.maritalStatus, religion: p.religion ?? "", mobile: p.mobile ?? "", altMobile: p.altMobile ?? "",
    addressLine: p.addressLine ?? "", areaId: p.areaId ?? "", city: p.city ?? "", pincode: p.pincode ?? "", idType: p.idType, idNumber: "",
  };
}

export default async function EditApplicationPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: SearchParams }) {
  const ctx = await requirePage("applications.write");
  const { id } = await params;
  const step = Number((await readParams(searchParams)).str("step")) || 1;
  const r = await getApplicationForEdit(ctx, id);
  if (!r) notFound();
  if (r.masked) {
    return (
      <>
        <PageHeader title="Edit application" back={{ href: `/applications/${id}`, label: "Case" }} />
        <EmptyState icon={EyeOff}>Identities are hidden right now, so this application cannot be edited.</EmptyState>
      </>
    );
  }
  const a = r.app;
  if (!EDITABLE(a.status)) redirect(`/applications/${id}`);
  const [m, names, maxMb, missing, appPrior, patPrior, funds] = await Promise.all([
    masterOptions(),
    // A reveal unlocks this one case, not every case's introducers and doctors.
    ctx.meetingMode ? { introducers: [], doctors: [] } : caseSuggestions(),
    getSetting("documents.maxFileMb"),
    missingDocuments(r.attachments.map((x) => x.type)),
    priorAid(a.applicantId, a.id),
    a.patientId === a.applicantId ? null : priorAid(a.patientId, a.id),
    activeFunds("aid"),
  ]);
  const known = (p: PersonView, prior: Awaited<ReturnType<typeof priorAid>> | null) =>
    prior ? { personCode: p.personCode, cases: prior.cases, totalPaise: prior.totalPaise, watchFlag: p.watchFlag } : null;

  return (
    <>
      <PageHeader title="Edit application" meta={<span className="font-mono">{a.caseNo}</span>} back={{ href: `/applications/${id}`, label: a.caseNo }} />
      <ApplicationForm
        masters={{
          hospitals: m.hospitals, banks: m.banks, funds: funds.map((f) => ({ id: f.id, name: f.name })), introducers: names.introducers, doctors: names.doctors,
          categories: m.categories.map((c) => ({ id: c.id, name: c.name })),
          diseases: m.categories.flatMap((c) => c.diseases.map((d) => ({ id: d.id, label: `${d.name} (${c.name})` }))),
        }}
        maxMb={maxMb}
        isDraft={a.status === "DRAFT"}
        canPay={can(ctx, "payments.write")}
        initialId={a.id}
        initialCaseNo={a.caseNo}
        initialStep={Math.min(4, Math.max(0, step - 1))}
        initialKnown={{ applicant: known(r.applicant, appPrior), patient: a.patientIsApplicant ? null : known(r.patient, patPrior) }}
        docs={{ files: r.attachments, missing }}
        initial={{
          id: a.id,
          applicationDate: toDateInput(a.applicationDate),
          applicant: personDefaults(r.applicant),
          patientIsApplicant: a.patientIsApplicant,
          patient: a.patientIsApplicant ? null : personDefaults(r.patient),
          relation: a.relation,
          dependentCount: a.dependentCount ?? "",
          case: {
            hospitalId: a.hospitalId ?? "", diseaseId: a.diseaseId ?? "", majorProblem: a.majorProblem ?? "", attendingDoctor: a.attendingDoctor ?? "",
            introducedByName: a.introducedByName ?? "", introducedByPhone: a.introducedByPhone ?? "",
            admissionDate: toDateInput(a.admissionDate), dischargeDate: toDateInput(a.dischargeDate),
            approxExpensePaise: a.approxExpensePaise, requestedAmountPaise: a.requestedAmountPaise, approvedAmountPaise: a.approvedAmountPaise, priority: a.priority,
          },
          eligibility: {
            zakatCategory: a.zakatCategory, monthlyIncomePaise: a.monthlyIncomePaise, dependentsSupported: a.dependentsSupported ?? "",
            ownsHouse: a.ownsHouse, ownsAgriLand: a.ownsAgriLand, savingsOrGoldNote: a.savingsOrGoldNote ?? "", existingDebtPaise: a.existingDebtPaise,
            eligibilityNote: a.eligibilityNote ?? "", authorisationReceived: a.authorisationReceived,
          },
        }}
      />
    </>
  );
}
