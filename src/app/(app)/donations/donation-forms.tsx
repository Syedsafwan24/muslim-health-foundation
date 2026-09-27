"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import type { z } from "zod";
import { toast } from "sonner";
import { Pencil, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { FormField, MoneyInput, Select, TextArea, TextInput } from "@/components/app/inputs";
import { DONOR_TYPE, options, PAYMENT_MODE } from "@/lib/labels";
import { toDateInput } from "@/lib/fy";
import { donationSchema, donorSchema } from "@/lib/validators";
import { cancelDonation, issueReceipt, saveDonation, saveDonor } from "./actions";

type DonationInput = z.input<typeof donationSchema>;
type DonorInput = z.input<typeof donorSchema>;

function useRun(done?: () => void) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return {
    pending,
    run: <T,>(fn: () => Promise<{ ok: true; data: T } | { ok: false; error: string }>, msg: (d: T) => string) =>
      start(async () => {
        const r = await fn();
        if (r.ok) { toast.success(msg(r.data)); done?.(); router.refresh(); }
        else toast.error(r.error);
      }),
  };
}

export function DonationDialog({ donors, funds, banks, defaultDonorId, initial }: {
  donors: { id: string; label: string; hint?: string }[];
  funds: { id: string; name: string }[];
  banks: { id: string; label: string }[];
  defaultDonorId?: string;
  /** Editing an existing donation (only allowed until its receipt is issued). */
  initial?: DonationInput & { id: string; receiptNo: string };
}) {
  const [open, setOpen] = useState(false);
  const { pending, run } = useRun(() => setOpen(false));
  const { register, handleSubmit, control, watch, reset, formState: { errors } } = useForm<DonationInput>({
    resolver: zodResolver(donationSchema),
    defaultValues: initial ?? { donorId: defaultDonorId ?? "", fundId: funds.length === 1 ? funds[0].id : "", amountPaise: 0n, donationDate: toDateInput(new Date()), mode: "CASH", bankId: "", referenceNo: "", chequeNo: "", purposeNote: "", earmarkCaseNo: "" },
  });
  const mode = watch("mode");
  // "+ Add new donor" from the dropdown: a small pop-up, the new donor is selected on save.
  const [list, setList] = useState(donors);
  const [ask, setAsk] = useState<{ resolve: (o: { value: string; label: string } | null) => void } | null>(null);
  const [nd, setNd] = useState({ name: "", type: "INDIVIDUAL" as keyof typeof DONOR_TYPE, phone: "" });
  const [ndError, setNdError] = useState<string | null>(null);
  const [ndSaving, setNdSaving] = useState(false);
  const addDonor = (typed: string) => new Promise<{ value: string; label: string } | null>((resolve) => {
    setNd({ name: typed, type: "INDIVIDUAL", phone: "" });
    setNdError(null);
    setAsk({ resolve });
  });
  const closeAdd = (o: { value: string; label: string } | null) => { ask?.resolve(o); setAsk(null); };
  const submitDonor = async () => {
    setNdSaving(true);
    const r = await saveDonor({ name: nd.name, type: nd.type, phone: nd.phone, city: "Bhatkal", country: "India" });
    setNdSaving(false);
    if (!r.ok) return setNdError(r.error);
    const o = { value: r.data.id, label: nd.name.trim(), hint: r.data.donorCode };
    setList((l) => [...l, { id: o.value, label: o.label, hint: o.hint }]);
    toast.success(`Donor ${r.data.donorCode} added`);
    closeAdd(o);
  };
  return (
    <>
    <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) reset(); }}>
      <DialogTrigger asChild>{initial ? <Button variant="outline"><Pencil aria-hidden /> Edit donation</Button> : <Button><Plus aria-hidden /> Record donation</Button>}</DialogTrigger>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-2xl">
        <form onSubmit={handleSubmit((v) => run(() => saveDonation(v), (d) => initial ? `Receipt ${d.receiptNo} updated` : `Donation recorded — receipt ${d.receiptNo}`))} className="space-y-4">
          <DialogHeader>
            <DialogTitle>{initial ? `Edit donation ${initial.receiptNo}` : "Record donation"}</DialogTitle>
            <DialogDescription>{initial ? "Changes are kept in the history. Once the receipt is issued the donation can no longer be edited." : "A receipt number is issued on save and is never reused."}</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField id="d-donor" label="Donor" error={errors.donorId?.message} required className="sm:col-span-2">
              <Select id="d-donor" {...register("donorId")} options={list.map((d) => ({ value: d.id, label: d.label, hint: d.hint }))} placeholder="Choose the donor" onCreate={addDonor} createLabel={(t) => (t ? `Add new donor “${t}”` : "Add new donor")} />
            </FormField>
            <FormField id="d-amount" label="Amount" error={errors.amountPaise?.message} required>
              <Controller control={control} name="amountPaise" render={({ field }) => <MoneyInput id="d-amount" value={field.value as bigint} onChange={(v) => field.onChange(v ?? 0n)} />} />
            </FormField>
            <FormField id="d-date" label="Date" required><TextInput id="d-date" type="date" {...register("donationDate")} /></FormField>
            {/* Hidden while one fund is active; the fund is applied automatically. */}
            {funds.length > 1 && <FormField id="d-fund" label="Fund" required><Select id="d-fund" {...register("fundId")} options={funds.map((f) => ({ value: f.id, label: f.name }))} placeholder="Choose Zakat or General" /></FormField>}
            <FormField id="d-mode" label="Mode"><Select id="d-mode" {...register("mode")} options={options(PAYMENT_MODE)} /></FormField>
            {mode !== "CASH" && <FormField id="d-bank" label="Bank"><Select id="d-bank" {...register("bankId")} options={banks.map((b) => ({ value: b.id, label: b.label }))} placeholder="Choose the bank" /></FormField>}
            {mode === "CHEQUE" && <FormField id="d-cheque" label="Cheque no."><TextInput id="d-cheque" {...register("chequeNo")} /></FormField>}
            {mode !== "CASH" && mode !== "CHEQUE" && <FormField id="d-ref" label="Reference / UTR"><TextInput id="d-ref" {...register("referenceNo")} /></FormField>}
            <FormField id="d-earmark" label="For a specific case" hint="Case number, if the donor gave for one case"><TextInput id="d-earmark" placeholder="MHF/2026-27/00123" className="font-mono" {...register("earmarkCaseNo")} /></FormField>
            <FormField id="d-purpose" label="Purpose note" className="sm:col-span-2"><TextInput id="d-purpose" placeholder="For example: for dialysis cases" {...register("purposeNote")} /></FormField>
          </div>
          <DialogFooter><Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancel</Button><Button type="submit" disabled={pending}>{initial ? "Save changes" : "Record donation"}</Button></DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
    <Dialog open={!!ask} onOpenChange={(o) => !o && closeAdd(null)}>
      <DialogContent className="sm:max-w-md">
        <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); e.stopPropagation(); void submitDonor(); }}>
          <DialogHeader>
            <DialogTitle>Add a new donor</DialogTitle>
            <DialogDescription>More details can be added later under Donors.</DialogDescription>
          </DialogHeader>
          <FormField id="nd-name" label="Name" error={ndError ?? undefined} required>
            <TextInput id="nd-name" value={nd.name} onChange={(e) => setNd({ ...nd, name: e.target.value })} autoFocus autoComplete="off" invalid={!!ndError} />
          </FormField>
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField id="nd-type" label="Type"><Select id="nd-type" value={nd.type} onChange={(e) => setNd({ ...nd, type: e.target.value as keyof typeof DONOR_TYPE })} options={options(DONOR_TYPE)} /></FormField>
            <FormField id="nd-phone" label="Phone"><TextInput id="nd-phone" value={nd.phone} onChange={(e) => setNd({ ...nd, phone: e.target.value })} /></FormField>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => closeAdd(null)}>Cancel</Button>
            <Button type="submit" disabled={ndSaving}>Add donor</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
    </>
  );
}

export function DonorDialog({ initial }: { initial?: DonorInput & { id: string } }) {
  const [open, setOpen] = useState(false);
  const { pending, run } = useRun(() => setOpen(false));
  const { register, handleSubmit, formState: { errors } } = useForm<DonorInput>({
    resolver: zodResolver(donorSchema),
    defaultValues: initial ?? { name: "", type: "INDIVIDUAL", phone: "", email: "", addressLine: "", city: "Bhatkal", country: "India", panLast4: "", isAnonymous: false, notes: "" },
  });
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{initial ? <Button variant="outline">Edit donor</Button> : <Button variant="outline"><Plus aria-hidden /> Add donor</Button>}</DialogTrigger>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-2xl">
        <form onSubmit={handleSubmit((v) => run(() => saveDonor(v), (d) => initial ? "Donor updated" : `Donor ${d.donorCode} added`))} className="space-y-4">
          <DialogHeader><DialogTitle>{initial ? "Edit donor" : "Add donor"}</DialogTitle><DialogDescription>Only the last 4 characters of the PAN are stored.</DialogDescription></DialogHeader>
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField id="dn-name" label="Name" error={errors.name?.message} required className="sm:col-span-2"><TextInput id="dn-name" {...register("name")} /></FormField>
            <FormField id="dn-type" label="Type"><Select id="dn-type" {...register("type")} options={options(DONOR_TYPE)} /></FormField>
            <FormField id="dn-phone" label="Phone"><TextInput id="dn-phone" {...register("phone")} /></FormField>
            <FormField id="dn-email" label="Email" error={errors.email?.message}><TextInput id="dn-email" {...register("email")} /></FormField>
            <FormField id="dn-pan" label="PAN, last 4" error={errors.panLast4?.message}><TextInput id="dn-pan" maxLength={4} {...register("panLast4")} /></FormField>
            <FormField id="dn-addr" label="Address" className="sm:col-span-2"><TextInput id="dn-addr" {...register("addressLine")} /></FormField>
            <FormField id="dn-city" label="City"><TextInput id="dn-city" {...register("city")} /></FormField>
            <FormField id="dn-country" label="Country"><TextInput id="dn-country" {...register("country")} /></FormField>
            <FormField id="dn-notes" label="Notes" className="sm:col-span-2"><TextArea id="dn-notes" {...register("notes")} /></FormField>
            <label className="flex items-start gap-2 text-ui sm:col-span-2">
              <input type="checkbox" className="mt-1" {...register("isAnonymous")} />
              <span>Anonymous donor <span className="block text-caption text-slate-body">Shown as “Anonymous donor” on every report and receipt. Only the super admin and accountant see the name.</span></span>
            </label>
          </div>
          <DialogFooter><Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancel</Button><Button type="submit" disabled={pending}>{initial ? "Save donor" : "Add donor"}</Button></DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function DonationActions({ id, receiptNo, cancelled, issued }: { id: string; receiptNo: string; cancelled: boolean; issued: boolean }) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const { pending, run } = useRun(() => setOpen(false));
  if (cancelled) return null;
  return (
    <>
      {!issued && <Button variant="outline" disabled={pending} onClick={() => run(() => issueReceipt({ id }), () => `Receipt ${receiptNo} issued`)}>Mark receipt issued</Button>}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogTrigger asChild><Button variant="outline" className="text-rejected">Cancel receipt</Button></DialogTrigger>
        <DialogContent>
          <DialogHeader><DialogTitle>Cancel receipt {receiptNo}</DialogTitle><DialogDescription>The receipt number is voided and never reused. The donation stops counting towards the fund.</DialogDescription></DialogHeader>
          <FormField id="cancel-reason" label="Reason" required><TextArea id="cancel-reason" value={reason} onChange={(e) => setReason(e.target.value)} /></FormField>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Keep receipt</Button>
            <Button variant="destructive" disabled={pending} onClick={() => run(() => cancelDonation({ id, reason }), () => `Receipt ${receiptNo} cancelled`)}>Cancel receipt</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
