"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Controller, useForm, useWatch, type FieldPath, type UseFormReturn } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { AlertTriangle, Check, Search, UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { FormField, MoneyInput, Select, TextInput } from "@/components/app/inputs";
import { applicationSchema, emptyPerson, missingRequired, paymentEntrySchema, REQUIRED, type ApplicationInput, type PaymentEntryInput, type PersonInput } from "@/lib/validators";
import { formatINR } from "@/lib/money";
import { toDateInput } from "@/lib/fy";
import { GENDER, MARITAL, options, PAYMENT_MODE, RELATION, religionOptions, TOWARDS } from "@/lib/labels";
import { cn } from "@/lib/utils";
import { checkDuplicates, loadPerson, saveApplication, submitApplication } from "./actions";
import { useAddDialog, type AddKind } from "./add-dialog";
import { searchPeopleAction } from "../prefs-actions";
import { DocumentSlots, type SlotFile } from "./[id]/case-client";

// The screen follows the MHF paper form block by block, with no fields the paper does not have.
// Cases reach the office already approved, so the last step records the case as approved.

type Masters = {
  hospitals: { id: string; label: string }[];
  banks: { id: string; label: string; isOwnAccount: boolean }[];
  /** Active funds (Zakat, General); the payment says which one it is drawn from. */
  funds: { id: string; name: string }[];
  /** Values used on earlier cases, offered in the pick-or-add dropdowns. */
  introducers: string[];
  doctors: string[];
  diseases: { id: string; label: string }[];
  categories: { id: string; name: string }[];
};
type Known = { personCode: string; cases: number; totalPaise: bigint; watchFlag: boolean } | null;
type DocState = { files: SlotFile[]; missing: string[] };

const STEPS = ["Applicant", "Patient", "Case", "Documents", "Payment"] as const;
const DOCS = 3;
const PAY = 4;
const AUTOSAVE_MS = 3_000; // after the last keystroke

export function ApplicationForm({
  masters: initialMasters, initial, initialId, initialCaseNo, initialKnown, docs, maxMb, isDraft, canPay, initialStep = 0,
}: {
  masters: Masters;
  initial: ApplicationInput;
  initialId?: string;
  initialCaseNo?: string;
  initialKnown?: { applicant: Known; patient: Known };
  docs?: DocState;
  maxMb: number;
  isDraft: boolean;
  /** Only roles that may record payments see the cheque block (Block D). */
  canPay: boolean;
  initialStep?: number;
}) {
  const router = useRouter();
  // Hospitals and diseases live in form state so ones added here stay listed across steps.
  const [hospitals, setHospitals] = useState(initialMasters.hospitals);
  const [diseases, setDiseases] = useState(initialMasters.diseases);
  const [banks, setBanks] = useState(initialMasters.banks);
  const masters: Masters = { ...initialMasters, hospitals, diseases, banks };
  const addNew = useAddDialog(initialMasters.categories, (kind, item) =>
    kind === "bank" ? setBanks((list) => [...list, { ...item, isOwnAccount: false }]) : (kind === "hospital" ? setHospitals : setDiseases)((list) => [...list, item]),
  );
  const [step, setStep] = useState(initialStep);
  const [id, setId] = useState(initialId ?? null);
  const [caseNo, setCaseNo] = useState(initialCaseNo ?? null);
  const [savedAt, setSavedAt] = useState<Date | null>(null);
  const [saving, startSave] = useTransition();
  // The payment step owns its cheque form; the footer's "Save case" button calls into it.
  const recordRef = useRef<(() => Promise<void>) | null>(null);
  const [recording, startRecord] = useTransition();
  const [known, setKnown] = useState<{ applicant: Known; patient: Known }>(initialKnown ?? { applicant: null, patient: null });
  const [dupes, setDupes] = useState<{ block: "applicant" | "patient"; matches: { id: string; personCode: string; fullName: string }[] } | null>(null);
  const [nameWarning, setNameWarning] = useState(false);
  const dirtySince = useRef(false);
  // The draft id and the save in flight live in refs so overlapping saves cannot create two drafts.
  const idRef = useRef<string | null>(initialId ?? null);
  const inFlight = useRef<Promise<string | null> | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const form = useForm<ApplicationInput>({ resolver: zodResolver(applicationSchema), defaultValues: initial, mode: "onTouched" });
  const { handleSubmit, trigger, getValues, setValue, formState } = form;
  const same = useWatch({ control: form.control, name: "patientIsApplicant" });

  /** Save as draft. Returns the saved id, or null if nothing could be saved yet. Saves run one at a time. */
  const save = useCallback(
    async (quiet: boolean): Promise<string | null> => {
      while (inFlight.current) await inFlight.current;
      const run = saveOnce(quiet);
      inFlight.current = run;
      try {
        return await run;
      } finally {
        inFlight.current = null;
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [isDraft],
  );

  async function saveOnce(quiet: boolean): Promise<string | null> {
      const id = idRef.current;
      const values = getValues();
      if (!values.applicant.fullName || values.applicant.fullName.trim().length < 2) {
        if (!quiet) toast.error("Enter the applicant's name before saving.");
        return null;
      }
      if (!applicationSchema.safeParse({ ...values, id }).success) {
        if (!quiet) {
          await trigger();
          toast.error("Some fields need attention before this can be saved.");
        }
        return null;
      }
      const r = await saveApplication({ ...values, id });
      if (!r.ok) {
        if (!quiet) toast.error(r.error);
        return null;
      }
      dirtySince.current = false;
      idRef.current = r.data.id;
      setId(r.data.id);
      setCaseNo(r.data.caseNo);
      setSavedAt(new Date());
      setValue("applicant.personId", r.data.applicantId, { shouldDirty: false });
      if (!values.patientIsApplicant && values.patient) setValue("patient.personId", r.data.patientId, { shouldDirty: false });
      setNameWarning(r.data.nameInProblem);
      if (!quiet) toast.success(isDraft ? "Draft saved" : `Case ${r.data.caseNo} saved`);
      return r.data.id;
  }

  // Autosave a few seconds after the clerk stops typing. The person ids written back after a
  // save are not edits, so they do not start another save.
  useEffect(() => {
    const sub = form.watch((_v, { name }) => {
      if (name?.endsWith(".personId")) return;
      dirtySince.current = true;
      clearTimeout(timer.current);
      timer.current = setTimeout(() => { if (dirtySince.current) startSave(async () => { await save(true); }); }, AUTOSAVE_MS);
    });
    return () => { sub.unsubscribe(); clearTimeout(timer.current); };
  }, [form, save]);

  // Once the draft exists, the address points at it (and the current step), so a reload
  // reopens this draft where the clerk was instead of an empty form.
  useEffect(() => {
    if (id) window.history.replaceState(null, "", `/applications/${id}/edit?step=${step + 1}`);
  }, [id, step]);

  const stepFields: Record<number, FieldPath<ApplicationInput>[]> = {
    0: ["applicationDate", "applicant"],
    1: ["patientIsApplicant", "patient", "relation", "dependentCount"],
    2: ["case"],
    3: [],
    4: ["case.approvedAmountPaise"],
  };

  /** Mark this step's empty required fields. Returns true when the step is complete. */
  const requiredFilled = (): boolean => {
    const checks: ["applicant" | "patient" | "case", Record<string, string>][] =
      step === 0 ? [["applicant", REQUIRED.applicant]]
      : step === 1 && !getValues("patientIsApplicant") ? [["patient", REQUIRED.patient]]
      : step === 2 ? [["case", REQUIRED.case]]
      : [];
    let first: string | null = null;
    for (const [block, fields] of checks) {
      for (const k of missingRequired(getValues(block) as Record<string, unknown>, fields)) {
        form.setError(`${block}.${k}` as FieldPath<ApplicationInput>, { message: `${k === "gender" || k === "hospitalId" || k === "diseaseId" ? "Choose" : "Enter"} the ${fields[k]}` });
        first ??= block === "case" ? k : `${block}-${k}`;
      }
    }
    if (first) {
      document.getElementById(first)?.focus();
      toast.error("Fill in the required fields marked *.");
    }
    return !first;
  };

  const next = async () => {
    if (!(await trigger(stepFields[step]))) return;
    if (!requiredFilled()) return;
    // Duplicate detection for a newly entered person.
    const block = step === 0 ? "applicant" : step === 1 && !getValues("patientIsApplicant") ? "patient" : null;
    if (block) {
      const p = getValues(block);
      if (p && !p.personId) {
        const matches = await checkDuplicates(p);
        if (matches.length) {
          setDupes({ block, matches });
          return;
        }
      }
    }
    await advance();
  };
  const advance = async () => {
    if (step === 2) {
      // Documents need a saved record: save, and move a new draft to its own URL.
      startSave(async () => {
        const saved = await save(false);
        if (saved && !initialId) router.replace(`/applications/${saved}/edit?step=${DOCS + 1}`);
        else if (saved) setStep(DOCS);
      });
      return;
    }
    setStep((s) => s + 1);
  };

  const pickPerson = async (block: "applicant" | "patient", personId: string) => {
    const r = await loadPerson(personId);
    if (!r) return toast.error("That record cannot be opened right now.");
    setValue(block, r.person as PersonInput, { shouldDirty: true, shouldValidate: true });
    setKnown((k) => ({ ...k, [block]: { personCode: r.personCode, cases: r.cases, totalPaise: r.totalPaise, watchFlag: r.watchFlag } }));
  };

  const reachable = (i: number) => i <= 2 || !!id;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <ol className="flex flex-wrap items-center gap-2" aria-label="Steps">
          {STEPS.map((label, i) => (
            <li key={label} className="flex items-center gap-2">
              <button
                type="button"
                disabled={!reachable(i)}
                onClick={async () => { if (i < step || ((await trigger(stepFields[step])) && requiredFilled())) setStep(i); }}
                aria-current={i === step ? "step" : undefined}
                className={cn("flex h-9 items-center gap-2 rounded-control px-3 text-ui disabled:opacity-50", i === step ? "bg-navy-700 text-white" : i < step ? "text-navy-900 hover:bg-navy-50" : "text-slate-body hover:bg-navy-50")}
              >
                <span className={cn("grid size-5 place-items-center rounded-full text-caption tabular-nums", i === step ? "bg-white text-navy-700" : "border border-current")}>{i < step ? <Check className="size-3" aria-hidden /> : i + 1}</span>
                {label}
              </button>
              {i < STEPS.length - 1 && <span aria-hidden className="h-px w-4 bg-rule" />}
            </li>
          ))}
        </ol>
        <p className="text-caption text-slate-body" aria-live="polite">
          {caseNo && <span className="mr-2 font-mono">{caseNo}</span>}
          {saving ? "Saving…" : savedAt ? `Saved ${savedAt.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}` : id ? "Saved" : "Not saved yet"}
        </p>
      </div>

      <form onSubmit={handleSubmit(() => next())} noValidate>
        <section className="rounded-sheet border border-rule border-t-2 border-t-navy-700 bg-sheet p-6 shadow-sheet">
          {step === 0 && (
            <div className="space-y-6">
              <FormField id="applicationDate" label="Date" className="max-w-56">
                <TextInput id="applicationDate" type="date" {...form.register("applicationDate")} />
              </FormField>
              <PersonBlock form={form} block="applicant" known={known.applicant} onPick={(pid) => pickPerson("applicant", pid)} onClear={() => { setValue("applicant", emptyPerson()); setKnown((k) => ({ ...k, applicant: null })); }} />
            </div>
          )}
          {step === 1 && (
            <div className="space-y-6">
              <label className="flex items-center gap-3 rounded-control border border-rule bg-paper px-4 py-3 text-body">
                <input type="checkbox" className="size-4" checked={!!same} onChange={(e) => {
                  setValue("patientIsApplicant", e.target.checked, { shouldDirty: true });
                  if (e.target.checked) setValue("relation", "SELF");
                  else if (!getValues("patient")) setValue("patient", emptyPerson());
                }} />
                Patient is the same as the applicant
              </label>
              {!same && <PersonBlock form={form} block="patient" known={known.patient} onPick={(pid) => pickPerson("patient", pid)} onClear={() => { setValue("patient", emptyPerson()); setKnown((k) => ({ ...k, patient: null })); }} />}
              <div className="grid gap-4 lg:grid-cols-2">
                <FormField id="dependentCount" label="Dependent" error={formState.errors.dependentCount?.message}>
                  <TextInput id="dependentCount" inputMode="numeric" {...form.register("dependentCount")} />
                </FormField>
                {!same && (
                  <FormField id="relation" label="Applicant relation with patient" required>
                    <Select id="relation" {...form.register("relation")} options={options(RELATION).filter((o) => o.value !== "SELF")} />
                  </FormField>
                )}
              </div>
            </div>
          )}
          {step === 2 && <CaseBlock form={form} masters={masters} nameWarning={nameWarning} ask={addNew.ask} />}
          {step === DOCS && id && <DocumentsStep id={id} docs={docs} maxMb={maxMb} />}
          {step === PAY && id && (
            <PaymentStep
              form={form}
              masters={masters}
              onAddHospital={addNew.ask("hospital")}
              onAddBank={addNew.ask("bank")}
              isDraft={isDraft}
              canPay={canPay}
              recordRef={recordRef}
              onRecord={async (payment) => {
                // Save any last edits (the approved amount lives on the case), then record it.
                const saved = await save(true);
                if (!saved) return toast.error("Some fields need attention before the case can be saved.");
                const r = await submitApplication({ id: saved, payment });
                if (!r.ok) return toast.error(r.error);
                toast.success(`Case ${r.data.caseNo} saved${payment ? " with its payment" : ""}`);
                router.push(`/applications/${saved}`);
              }}
            />
          )}
        </section>

        <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
          <div>{step > 0 && <Button type="button" variant="outline" onClick={() => setStep((s) => s - 1)}>Back</Button>}</div>
          <div className="flex gap-2">
            {step !== DOCS && (step < PAY || !isDraft) && (
              <Button type="button" variant="outline" disabled={saving} onClick={() => startSave(async () => { await save(false); })}>{isDraft ? "Save draft" : "Save changes"}</Button>
            )}
            {step < PAY && (step !== DOCS || id) && (
              step === DOCS ? <Button type="button" onClick={() => setStep(PAY)}>Next: Payment</Button> : <Button type="submit" disabled={saving}>Next: {STEPS[step + 1]}</Button>
            )}
            {step === PAY && !isDraft && id && <Button type="button" variant="outline" onClick={() => router.push(`/applications/${id}`)}>Open case</Button>}
            {step === PAY && isDraft && id && (
              <Button type="button" disabled={recording} onClick={() => startRecord(async () => { await recordRef.current?.(); })}>Save case</Button>
            )}
          </div>
        </div>
        {step === PAY && isDraft && !!docs?.missing.length && (
          <p className="mt-2 text-right text-caption text-slate-body">Not uploaded yet: {docs.missing.join(", ")}. You can add them later from the case.</p>
        )}
      </form>

      {addNew.dialog}
      <Dialog open={!!dupes} onOpenChange={(o) => !o && setDupes(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>This may be someone already registered</DialogTitle>
            <DialogDescription>The same mobile number, or the same name and father name, is already in the registry.</DialogDescription>
          </DialogHeader>
          <ul className="space-y-2">
            {dupes?.matches.map((m) => (
              <li key={m.id} className="flex items-center justify-between gap-3 rounded-control border border-rule px-3 py-2">
                <span><span className="font-mono text-mono-sm">{m.personCode}</span> · {m.fullName}</span>
                <Button size="sm" onClick={async () => { const b = dupes!.block; setDupes(null); await pickPerson(b, m.id); }}>Use that record</Button>
              </li>
            ))}
          </ul>
          <DialogFooter>
            <Button variant="outline" onClick={async () => { setDupes(null); await advance(); }}>Create a new one anyway</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ─────────────────────────── blocks ───────────────────────────

/** Name · Father name · Husband name · Address · Status · Age · Gender · Religion · Mobile no. */
function PersonBlock({ form, block, known, onPick, onClear }: {
  form: UseFormReturn<ApplicationInput>;
  block: "applicant" | "patient";
  known: Known;
  onPick: (id: string) => void;
  onClear: () => void;
}) {
  const { register, formState: { errors } } = form;
  const e = (errors[block] ?? {}) as Partial<Record<keyof PersonInput, { message?: string }>>;
  const personId = useWatch({ control: form.control, name: `${block}.personId` });
  const f = (name: keyof PersonInput) => `${block}.${name}` as const;
  const id = (name: string) => `${block}-${name}`;
  const who = block === "applicant" ? "Applicant" : "Patient";
  const req = (k: keyof PersonInput) => k in REQUIRED[block];

  return (
    <div className="space-y-6">
      <h2 className="text-h2">{who}</h2>
      {!personId && <PersonSearch onPick={onPick} />}
      {personId && known && (
        <div className="flex flex-wrap items-center gap-3 rounded-control border border-info bg-info-bg px-4 py-3 text-ui">
          <span className="font-mono">{known.personCode}</span>
          <span className="font-medium">Known to MHF · {known.cases} previous {known.cases === 1 ? "case" : "cases"} · {formatINR(known.totalPaise)} received</span>
          {known.watchFlag && <span className="flex items-center gap-1 text-pending"><AlertTriangle className="size-4" aria-hidden /> On the watch list</span>}
          <Button type="button" size="sm" variant="ghost" className="ml-auto" onClick={onClear}>Choose someone else</Button>
        </div>
      )}
      {!personId && <p className="flex items-center gap-2 text-label text-slate-body"><UserPlus className="size-4" aria-hidden /> Or add a new person</p>}
      <div className="grid gap-4 lg:grid-cols-2">
        <FormField id={id("fullName")} label={`Name of the ${who.toLowerCase()}`} error={e.fullName?.message} required>
          <TextInput id={id("fullName")} autoComplete="off" {...register(f("fullName"))} invalid={!!e.fullName} />
        </FormField>
        <FormField id={id("fatherName")} label="Father name" error={e.fatherName?.message} required={req("fatherName")}>
          <TextInput id={id("fatherName")} autoComplete="off" {...register(f("fatherName"))} invalid={!!e.fatherName} />
        </FormField>
        <FormField id={id("husbandName")} label="Husband name" error={e.husbandName?.message}>
          <TextInput id={id("husbandName")} autoComplete="off" {...register(f("husbandName"))} />
        </FormField>
        <FormField id={id("addressLine")} label={`${who} address`} error={e.addressLine?.message} required={req("addressLine")}>
          <TextInput id={id("addressLine")} autoComplete="off" {...register(f("addressLine"))} invalid={!!e.addressLine} />
        </FormField>
        <div className="grid grid-cols-3 gap-4 lg:col-span-2">
          <FormField id={id("maritalStatus")} label="Status">
            <Select id={id("maritalStatus")} {...register(f("maritalStatus"))} options={options(MARITAL)} />
          </FormField>
          <FormField id={id("ageYears")} label="Age" error={e.ageYears?.message} required={req("ageYears")}>
            <TextInput id={id("ageYears")} inputMode="numeric" {...register(f("ageYears"))} invalid={!!e.ageYears} />
          </FormField>
          <FormField id={id("gender")} label="Gender" error={e.gender?.message} required={req("gender")}>
            <Select id={id("gender")} {...register(f("gender"), { setValueAs: (v) => v || null })} options={options(GENDER)} placeholder="Choose" invalid={!!e.gender} />
          </FormField>
        </div>
        <FormField id={id("religion")} label="Religion">
          <Select id={id("religion")} {...register(f("religion"))} options={religionOptions(form.getValues(f("religion")) as string | null)} placeholder="Choose" />
        </FormField>
        <FormField id={id("mobile")} label="Mobile no." error={e.mobile?.message} required={req("mobile")}>
          <TextInput id={id("mobile")} inputMode="tel" autoComplete="off" className="font-mono" {...register(f("mobile"))} invalid={!!e.mobile} />
        </FormField>
      </div>
    </div>
  );
}

function PersonSearch({ onPick }: { onPick: (id: string) => void }) {
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<Awaited<ReturnType<typeof searchPeopleAction>>>([]);
  useEffect(() => {
    if (q.trim().length < 2) return setHits([]);
    let live = true;
    const t = setTimeout(() => searchPeopleAction(q).then((h) => live && setHits(h)), 250);
    return () => { live = false; clearTimeout(t); };
  }, [q]);
  return (
    <div>
      <label htmlFor="person-search" className="text-label">Search existing person</label>
      <div className="relative mt-1.5">
        <Search aria-hidden className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-body" />
        <TextInput id="person-search" className="pl-9" placeholder="Name, mobile or person code…" value={q} onChange={(e) => setQ(e.target.value)} autoComplete="off" />
      </div>
      {hits.length > 0 && (
        <ul className="mt-2 divide-y divide-rule rounded-control border border-rule">
          {hits.map((h) => (
            <li key={h.id} className="flex flex-wrap items-center gap-3 px-3 py-2 text-ui">
              <span className="font-mono text-mono-sm">{h.personCode}</span>
              <span className="font-medium">{h.displayName}</span>
              {h.mobileHint && <span className="font-mono text-caption text-slate-body">{h.mobileHint}</span>}
              <span className="text-caption text-slate-body">Known to MHF · {h.cases} previous {h.cases === 1 ? "case" : "cases"} · {formatINR(h.totalPaise)} received</span>
              {h.watchFlag && <span className="text-caption text-pending">Watch list</span>}
              <Button type="button" size="sm" variant="outline" className="ml-auto" onClick={() => { onPick(h.id); setQ(""); setHits([]); }}>Select</Button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** Introduce by · Attending Dr. · Major problem of the patient · Approx hospital expenses · Name of the hospital */
/** Past names plus the current value (so a saved name always shows), as dropdown options. */
const nameOptions = (names: string[], current: string | null | undefined) =>
  [...new Set([...names, ...(current ? [current] : [])])].sort((a, b) => a.localeCompare(b)).map((n) => ({ value: n, label: n }));
function CaseBlock({ form, masters, nameWarning, ask }: { form: UseFormReturn<ApplicationInput>; masters: Masters; nameWarning: boolean; ask: (kind: AddKind) => (typed: string) => Promise<{ value: string; label: string } | null> }) {
  const { register, control, formState: { errors } } = form;
  const e = (errors.case ?? {}) as Partial<Record<string, { message?: string }>>;
  const [introducers] = useState(() => nameOptions(masters.introducers, form.getValues("case.introducedByName")));
  const [doctors] = useState(() => nameOptions(masters.doctors, form.getValues("case.attendingDoctor")));
  return (
    <div className="space-y-6">
      <h2 className="text-h2">Case</h2>
      <div className="grid gap-4 lg:grid-cols-2">
        <FormField id="introducedByName" label="Introduced by">
          <Select id="introducedByName" {...register("case.introducedByName")} options={introducers} placeholder="Choose or add a name" onCreate={ask("introducer")} createLabel={(t) => (t ? `Add new “${t}”` : "Add new name")} />
        </FormField>
        <FormField id="attendingDoctor" label="Attending Dr.">
          <Select id="attendingDoctor" {...register("case.attendingDoctor")} options={doctors} placeholder="Choose or add a doctor" onCreate={ask("doctor")} createLabel={(t) => (t ? `Add new doctor “${t}”` : "Add new doctor")} />
        </FormField>
        <FormField id="diseaseId" label="Major problem of the patient" className="lg:col-span-2" error={e.diseaseId?.message} required>
          <Select id="diseaseId" {...register("case.diseaseId")} options={masters.diseases.map((d) => ({ value: d.id, label: d.label }))} placeholder="Choose the disease" invalid={!!e.diseaseId} onCreate={ask("disease")} createLabel={(t) => (t ? `Add new disease “${t}”` : "Add new disease")} />
        </FormField>
        {nameWarning && (
          <p role="alert" className="flex items-center gap-2 rounded-control bg-pending-bg px-3 py-2 text-ui text-pending lg:col-span-2">
            <AlertTriangle className="size-4" aria-hidden /> The major problem mentions the applicant or patient by name. Write “the patient” instead, so it stays hidden in meeting mode.
          </p>
        )}
        <FormField id="approxExpensePaise" label="Approx hospital expenses" error={e.approxExpensePaise?.message} required>
          <Controller control={control} name="case.approxExpensePaise" render={({ field }) => <MoneyInput id="approxExpensePaise" value={field.value as bigint | null} onChange={field.onChange} invalid={!!e.approxExpensePaise} />} />
        </FormField>
        <FormField id="hospitalId" label="Name of the hospital" error={e.hospitalId?.message} required>
          <Select id="hospitalId" {...register("case.hospitalId")} options={masters.hospitals.map((h) => ({ value: h.id, label: h.label }))} placeholder="Choose the hospital" invalid={!!e.hospitalId} onCreate={ask("hospital")} createLabel={(t) => (t ? `Add new hospital “${t}”` : "Add new hospital")} />
        </FormField>
      </div>
    </div>
  );
}

function DocumentsStep({ id, docs, maxMb }: { id: string; docs?: DocState; maxMb: number }) {
  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-h2">Documents</h2>
        <p className="mt-1 text-ui text-slate-body">Upload what you have now. A photo from the phone is fine, and anything missing can be added later from the case.</p>
      </div>
      <DocumentSlots applicationId={id} files={docs?.files ?? []} maxMb={maxMb} canUpload canVerify={false} canDelete />
    </div>
  );
}

/** Block D: Cheque · INR · Bank · Payment date · Mode of transfer · Towards · Name of the hospital · Remark */
function PaymentStep({ form, masters, isDraft, recordRef, onRecord, onAddHospital, onAddBank, canPay }: {
  form: UseFormReturn<ApplicationInput>;
  masters: Masters;
  onAddHospital: (name: string) => Promise<{ value: string; label: string } | null>;
  onAddBank: (name: string) => Promise<{ value: string; label: string } | null>;
  isDraft: boolean;
  canPay: boolean;
  recordRef: React.RefObject<(() => Promise<void>) | null>;
  onRecord: (payment: PaymentEntryInput | null) => Promise<unknown>;
}) {
  const caseHospital = form.getValues("case.hospitalId") ?? "";
  const pay = useForm<PaymentEntryInput>({
    resolver: zodResolver(paymentEntrySchema),
    defaultValues: {
      mode: "CHEQUE", chequeNo: "", bankId: masters.banks.find((b) => b.isOwnAccount)?.id ?? "", paymentDate: toDateInput(new Date()),
      towards: "HOSPITAL_BILL", hospitalId: caseHospital, remark: "", fundId: masters.funds.length === 1 ? masters.funds[0].id : "",
    },
  });
  // Without payment rights the case is saved without its cheque; an accountant records it later.
  const [later, setLater] = useState(!canPay);
  const e = pay.formState.errors;
  const mode = pay.watch("mode");
  const towards = pay.watch("towards");
  const approx = form.getValues("case.approxExpensePaise") as bigint | null;
  const amountError = (form.formState.errors.case as { approvedAmountPaise?: { message?: string } } | undefined)?.approvedAmountPaise?.message;

  const record = async () => {
    const amount = form.getValues("case.approvedAmountPaise");
    if (!amount) {
      form.setError("case.approvedAmountPaise", { message: "Enter the approved amount (INR)" });
      return;
    }
    if (approx != null && amount > approx) {
      form.setError("case.approvedAmountPaise", { message: `Cannot be more than the approx hospital expenses (${formatINR(approx)})` });
      return;
    }
    if (later) return void (await onRecord(null));
    if (masters.funds.length > 1 && !pay.getValues("fundId")) {
      pay.setError("fundId", { message: "Choose the fund this payment is drawn from" });
      return;
    }
    await pay.handleSubmit(async (v) => { await onRecord(v); })();
  };
  useEffect(() => { recordRef.current = record; });

  return (
    <div className="space-y-6">
      <h2 className="text-h2">Payment</h2>
      <div className="grid gap-4 lg:grid-cols-3">
        <FormField id="approvedAmountPaise" label="INR" hint={approx != null ? `The amount MHF has approved for this case. Approx hospital expenses: ${formatINR(approx)}.` : "The amount MHF has approved for this case."} error={amountError} required>
          <Controller control={form.control} name="case.approvedAmountPaise" render={({ field }) => <MoneyInput
                id="approvedAmountPaise"
                value={field.value as bigint | null}
                onChange={(v) => { field.onChange(v); form.clearErrors("case.approvedAmountPaise"); }}
                invalid={!!amountError}
                max={approx}
                onOverMax={() => form.setError("case.approvedAmountPaise", { message: `Cannot be more than the approx hospital expenses (${formatINR(approx!)})` })}
              />} />
        </FormField>
      </div>

      {!isDraft ? (
        <p className="text-ui text-slate-body">Cheques for this case are recorded on its Payments tab.</p>
      ) : !canPay ? (
        <p className="text-ui text-slate-body">The cheque is recorded by the accountant or general secretary from the case&apos;s Payments tab after you save.</p>
      ) : (
        <>
          <label className="flex items-center gap-2 text-ui">
            <input type="checkbox" checked={later} onChange={(ev) => setLater(ev.target.checked)} />
            The cheque has not been made out yet — record it later from the case
          </label>
          {!later && (
            <div className="grid gap-4 lg:grid-cols-3">
              <FormField id="pay-cheque" label={mode === "CHEQUE" || mode === "DD" ? "Cheque" : "Reference no."} error={e.chequeNo?.message} required={mode !== "CASH"}>
                <TextInput id="pay-cheque" className="font-mono" {...pay.register("chequeNo")} invalid={!!e.chequeNo} />
              </FormField>
              {masters.funds.length > 1 && (
                <FormField id="pay-fund" label="Fund" error={e.fundId?.message} required>
                  <Select id="pay-fund" {...pay.register("fundId")} options={masters.funds.map((f) => ({ value: f.id, label: f.name }))} placeholder="Choose Zakat or General" invalid={!!e.fundId} />
                </FormField>
              )}
              <FormField id="pay-bank" label="Bank" error={e.bankId?.message} required={mode === "CHEQUE"}>
                <Select id="pay-bank" {...pay.register("bankId")} options={masters.banks.map((b) => ({ value: b.id, label: b.label }))} placeholder="Choose the bank" invalid={!!e.bankId} onCreate={onAddBank} createLabel={(t) => (t ? `Add new bank “${t}”` : "Add new bank")} />
              </FormField>
              <FormField id="pay-date" label="Payment date" error={e.paymentDate?.message} required>
                <TextInput id="pay-date" type="date" {...pay.register("paymentDate")} />
              </FormField>
              <FormField id="pay-mode" label="Mode of transfer" required>
                <Select id="pay-mode" {...pay.register("mode")} options={options(PAYMENT_MODE)} />
              </FormField>
              <FormField id="pay-towards" label="Towards" required>
                <Select id="pay-towards" {...pay.register("towards")} options={options(TOWARDS)} />
              </FormField>
              {towards !== "APPLICANT_DIRECT" && (
                <FormField id="pay-hospital" label="Name of the hospital" error={e.hospitalId?.message} required>
                  <Select id="pay-hospital" {...pay.register("hospitalId")} options={masters.hospitals.map((h) => ({ value: h.id, label: h.label }))} placeholder="Choose the hospital" invalid={!!e.hospitalId} onCreate={onAddHospital} createLabel={(t) => (t ? `Add new hospital “${t}”` : "Add new hospital")} />
                </FormField>
              )}
              <FormField id="pay-remark" label="Remark" className="lg:col-span-3">
                <TextInput id="pay-remark" {...pay.register("remark")} />
              </FormField>
            </div>
          )}
        </>
      )}
    </div>
  );
}
