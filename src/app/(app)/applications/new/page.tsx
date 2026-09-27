import type { Metadata } from "next";
import { EyeOff } from "lucide-react";
import { requirePage } from "@/lib/auth/context";
import { masterOptions } from "@/lib/db/queries/admin";
import { activeFunds } from "@/lib/db/queries/funds";
import { caseSuggestions } from "@/lib/db/queries/applications";
import { getSetting } from "@/lib/settings";
import { EmptyState, PageHeader } from "@/components/app/bits";
import { emptyPerson } from "@/lib/validators";
import { toDateInput } from "@/lib/fy";
import { ApplicationForm } from "../application-form";

export const metadata: Metadata = { title: "New application" };

export default async function NewApplicationPage() {
  const ctx = await requirePage("applications.write");
  if (ctx.meetingMode) {
    return (
      <>
        <PageHeader title="New application" back={{ href: "/applications", label: "Applications" }} />
        <EmptyState icon={EyeOff}>Identities are hidden right now, so new applications cannot be entered. Ask the super admin to turn meeting mode off.</EmptyState>
      </>
    );
  }
  const [m, names, maxMb, funds] = await Promise.all([masterOptions(),
    caseSuggestions(), getSetting("documents.maxFileMb"), activeFunds("aid")]);
  return (
    <>
      <PageHeader title="New application" back={{ href: "/applications", label: "Applications" }} />
      <ApplicationForm
        masters={{
          hospitals: m.hospitals, banks: m.banks, funds: funds.map((f) => ({ id: f.id, name: f.name })), introducers: names.introducers, doctors: names.doctors,
          categories: m.categories.map((c) => ({ id: c.id, name: c.name })),
          diseases: m.categories.flatMap((c) => c.diseases.map((d) => ({ id: d.id, label: `${d.name} (${c.name})` }))),
        }}
        maxMb={maxMb}
        isDraft
        initial={{
          applicationDate: toDateInput(new Date()),
          applicant: emptyPerson(),
          patientIsApplicant: true,
          patient: null,
          relation: "SELF",
          dependentCount: "",
          case: { hospitalId: "", diseaseId: "", majorProblem: "", attendingDoctor: "", introducedByName: "", introducedByPhone: "", admissionDate: "", dischargeDate: "", approxExpensePaise: null, requestedAmountPaise: null, approvedAmountPaise: null, priority: "ROUTINE" },
          eligibility: { zakatCategory: null, monthlyIncomePaise: null, dependentsSupported: "", ownsHouse: null, ownsAgriLand: null, savingsOrGoldNote: "", existingDebtPaise: null, eligibilityNote: "", authorisationReceived: false },
        }}
      />
    </>
  );
}
