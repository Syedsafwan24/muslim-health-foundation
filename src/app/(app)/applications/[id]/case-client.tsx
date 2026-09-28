"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { PaymentStatus } from "@prisma/client";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { Check, Download, Eye, EyeOff, Lock, MoreHorizontal, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { FormField, MoneyInput, Select, TextArea, TextInput } from "@/components/app/inputs";
import { formatINR } from "@/lib/money";
import { toDateInput } from "@/lib/fy";
import { ATTACHMENT_TYPE, CASE_DOCUMENTS, options, PAYMENT_MODE, TOWARDS } from "@/lib/labels";
import { paymentSchema, type PaymentInput } from "@/lib/validators";
import type { ActionResult } from "@/lib/action";
import { deleteDraft, endReveal, revealIdentity } from "../actions";
import { deleteAttachment, uploadAttachments, verifyAttachment } from "../attachment-actions";
import { useAddDialog } from "../add-dialog";
import { cancelPayment, markBounced, markCleared, markIssued, recordPayment } from "@/app/(app)/payments/actions";

/** Run an action, toast the outcome, refresh the page. */
function useRun() {
  const router = useRouter();
  const [pending, start] = useTransition();
  const run = <T,>(fn: () => Promise<ActionResult<T>>, success: string | ((d: T) => string), after?: (d: T) => void) =>
    start(async () => {
      const r = await fn();
      if (r.ok) {
        toast.success(typeof success === "string" ? success : success(r.data));
        after?.(r.data);
        router.refresh();
      } else toast.error(r.error);
    });
  return { pending, run };
}

// ─────────────────────────── reveal ───────────────────────────

export function RevealButton({ applicationId, caseNo }: { applicationId: string; caseNo: string }) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const { pending, run } = useRun();
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" className="border-redacted text-redacted hover:bg-redacted-bg"><Eye aria-hidden /> Reveal identity</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Reveal identity for {caseNo}</DialogTitle>
          <DialogDescription>Only this case is revealed, only to you, for a few minutes. The reveal and your reason are recorded in the audit log and shown on the case history.</DialogDescription>
        </DialogHeader>
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (!reason.trim()) return setError("Say why you need to see the name.");
            setError(null);
            run(() => revealIdentity({ applicationId, reason, password }), "Identity revealed", () => { setOpen(false); setPassword(""); setReason(""); });
          }}
        >
          <FormField id="reveal-reason" label="Reason" error={error ?? undefined} required>
            <TextArea id="reveal-reason" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="For example: verifying a duplicate claim" invalid={!!error} />
          </FormField>
          <FormField id="reveal-password" label="Your password" required>
            <TextInput id="reveal-password" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
          </FormField>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>Keep hidden</Button>
            <Button type="submit" disabled={pending} className="bg-redacted hover:bg-redacted/90">Reveal identity</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function RevealBanner({ applicationId, expiresAt }: { applicationId: string; expiresAt: string }) {
  const router = useRouter();
  const [left, setLeft] = useState(() => new Date(expiresAt).getTime() - Date.now());
  const { pending, run } = useRun();
  useEffect(() => {
    const t = setInterval(() => {
      const ms = new Date(expiresAt).getTime() - Date.now();
      setLeft(ms);
      if (ms <= 0) {
        clearInterval(t);
        router.refresh();
      }
    }, 1000);
    return () => clearInterval(t);
  }, [expiresAt, router]);
  const s = Math.max(0, Math.floor(left / 1000));
  return (
    <div role="status" className="mb-4 flex items-center gap-3 rounded-sheet bg-redacted px-4 py-3 text-ui text-white">
      <Eye aria-hidden className="size-4" />
      <span>Identity revealed — expires in <span className="tabular-nums">{Math.floor(s / 60)}:{String(s % 60).padStart(2, "0")}</span></span>
      <Button size="sm" variant="secondary" className="ml-auto" disabled={pending} onClick={() => run(() => endReveal({ applicationId }), "Identity hidden again")}>
        <EyeOff aria-hidden /> End now
      </Button>
    </div>
  );
}

// ─────────────────────────── documents ───────────────────────────

export function AttachmentActions({ id, mime, title, verified, canVerify, canDelete }: { id: string; mime: string; title: string; verified: boolean; canVerify: boolean; canDelete: boolean }) {
  const [open, setOpen] = useState(false);
  const { pending, run } = useRun();
  return (
    <div className="flex items-center gap-1">
      <Button type="button" size="sm" variant="outline" onClick={() => setOpen(true)}>Preview</Button>
      <Button size="icon" variant="ghost" asChild aria-label={`Download ${title}`}>
        <a href={`/api/files/${id}?download=1`}><Download aria-hidden /></a>
      </Button>
      {(canVerify || canDelete) && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button type="button" size="icon" variant="ghost" aria-label={`More actions for ${title}`} disabled={pending}><MoreHorizontal aria-hidden /></Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {canVerify && <DropdownMenuItem onSelect={() => run(() => verifyAttachment({ id, verified: !verified }), verified ? "Verification removed" : "Document verified")}>{verified ? "Mark not verified" : "Mark verified"}</DropdownMenuItem>}
            {canDelete && <DropdownMenuItem className="text-rejected" onSelect={() => run(() => deleteAttachment({ id }), "Document removed")}>Remove document</DropdownMenuItem>}
          </DropdownMenuContent>
        </DropdownMenu>
      )}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-4xl">
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
            <DialogDescription className="sr-only">Preview of the uploaded document</DialogDescription>
          </DialogHeader>
          {open && (
            <div className="flex h-[75dvh] items-center justify-center">
              {mime === "application/pdf" ? (
                <iframe src={`/api/files/${id}`} title={title} className="size-full rounded-control border border-rule" />
              ) : (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={`/api/files/${id}`} alt={title} className="max-h-full max-w-full rounded-control object-contain" />
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ─────────────────────────── document slots ───────────────────────────

export type SlotFile = { id: string; type: string; mimeType: string; locked: boolean; verified: boolean };

/**
 * One numbered slot per document the office collects (Aadhaar/ration card, MHF form, hospital
 * letter, bill/receipt). Each slot uploads straight to its own type — no type picker.
 */
export function DocumentSlots({ applicationId, files, maxMb, canUpload, canVerify, canDelete }: {
  applicationId: string;
  files: SlotFile[];
  maxMb: number;
  canUpload: boolean;
  canVerify: boolean;
  canDelete: boolean;
}) {
  const others = files.filter((f) => !CASE_DOCUMENTS.some((d) => d.type === f.type));
  return (
    <div className="space-y-3">
      <ol className="space-y-3">
        {CASE_DOCUMENTS.map((d, i) => (
          <Slot key={d.type} n={i + 1} doc={d} applicationId={applicationId} files={files.filter((f) => f.type === d.type)} maxMb={maxMb} canUpload={canUpload} canVerify={canVerify} canDelete={canDelete} />
        ))}
      </ol>
      {others.length > 0 && (
        <div className="rounded-sheet border border-rule p-4">
          <h3 className="text-label text-slate-body">Other documents</h3>
          <ul className="mt-2 space-y-2">
            {others.map((f) => (
              <li key={f.id} className="flex flex-wrap items-center gap-3 text-ui">
                <span className="flex-1">{ATTACHMENT_TYPE[f.type as keyof typeof ATTACHMENT_TYPE] ?? f.type}</span>
                {f.locked ? <span className="flex items-center gap-1 text-label text-redacted"><Lock aria-hidden className="size-3.5" /> Locked</span> : <AttachmentActions id={f.id} mime={f.mimeType} title={ATTACHMENT_TYPE[f.type as keyof typeof ATTACHMENT_TYPE] ?? "Document"} verified={f.verified} canVerify={canVerify} canDelete={canDelete} />}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function Slot({ n, doc, applicationId, files, maxMb, canUpload, canVerify, canDelete }: {
  n: number;
  doc: (typeof CASE_DOCUMENTS)[number];
  applicationId: string;
  files: SlotFile[];
  maxMb: number;
  canUpload: boolean;
  canVerify: boolean;
  canDelete: boolean;
}) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [pending, start] = useTransition();
  const done = files.length > 0;

  const send = (list: FileList | null) => {
    if (!list?.length) return;
    const fd = new FormData();
    fd.set("applicationId", applicationId);
    fd.set("type", doc.type);
    fd.set("containsIdentity", "true");
    for (const f of Array.from(list)) fd.append("files", f);
    start(async () => {
      const r = await uploadAttachments(fd);
      if (r.ok) {
        toast.success(`${doc.label} uploaded`);
        router.refresh();
      } else toast.error(r.error);
      if (input.current) input.current.value = "";
    });
  };

  return (
    <li
      className={`flex flex-wrap items-center gap-4 rounded-sheet border p-4 ${done ? "border-approved/40 bg-approved-bg/40" : "border-rule bg-sheet"}`}
      onDragOver={(e) => canUpload && e.preventDefault()}
      onDrop={(e) => { if (!canUpload) return; e.preventDefault(); send(e.dataTransfer.files); }}
    >
      <span aria-hidden className={`grid size-9 shrink-0 place-items-center rounded-full text-ui font-semibold ${done ? "bg-approved text-white" : "border-2 border-rule text-slate-body"}`}>
        {done ? <Check className="size-4" /> : n}
      </span>
      <div className="min-w-48 flex-1">
        <p className="text-body font-medium text-navy-900">{doc.label} <span className="text-rejected">*</span></p>
        <p className="text-caption text-slate-body">
          {done ? `${files.length} ${files.length === 1 ? "file" : "files"} uploaded` : doc.hint}
          <span className="sr-only">{done ? " — uploaded" : " — not uploaded yet"}</span>
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {files.map((f, i) =>
          f.locked ? (
            <span key={f.id} className="flex items-center gap-1 text-label text-redacted"><Lock aria-hidden className="size-3.5" /> Locked</span>
          ) : (
            <span key={f.id} className="flex items-center gap-1">
              {files.length > 1 && <span className="text-caption text-slate-body">{i + 1}.</span>}
              <AttachmentActions id={f.id} mime={f.mimeType} title={doc.label} verified={f.verified} canVerify={canVerify} canDelete={canDelete} />
            </span>
          ),
        )}
        {canUpload && (
          <>
            <Button type="button" variant={done ? "outline" : "default"} size="sm" disabled={pending} onClick={() => input.current?.click()}>
              <Upload aria-hidden /> {pending ? "Uploading…" : done ? "Add another page" : "Upload"}
            </Button>
            <input ref={input} type="file" multiple accept="application/pdf,image/jpeg,image/png,image/webp,image/heic,.heic" className="sr-only" onChange={(e) => send(e.target.files)} aria-label={`Upload ${doc.label}`} />
          </>
        )}
      </div>
      {canUpload && !done && <p className="basis-full text-caption text-slate-body">Photo or PDF, up to {maxMb} MB. Location data is removed from photos.</p>}
    </li>
  );
}

// ─────────────────────────── case status ───────────────────────────

/** Only an unfinished draft has actions; a recorded case is final. */
export function DraftActions({ id }: { id: string }) {
  return (
    <div className="space-y-3">
      <p className="text-ui text-slate-body">This entry is not finished. Complete the form and save the case.</p>
      <Button asChild><a href={`/applications/${id}/edit`}>Continue entry</a></Button>
      <DiscardDraft id={id} />
    </div>
  );
}

// ─────────────────────────── payments ───────────────────────────

/** Block D of the paper form: Cheque · INR · Bank · Payment date · Mode of transfer · Towards · Name of the hospital · Remark. */
export function PaymentForm({ applicationId, remainingPaise, funds, banks, hospitals, defaultHospitalId }: {
  applicationId: string;
  remainingPaise: bigint;
  funds: { id: string; name: string }[];
  banks: { id: string; label: string; isOwnAccount: boolean }[];
  hospitals: { id: string; label: string }[];
  defaultHospitalId: string | null;
}) {
  const { pending, run } = useRun();
  // Banks added here ("+ Add new bank") stay in the list without a reload.
  const [bankList, setBankList] = useState(banks);
  const addNew = useAddDialog([], (kind, item) => { if (kind === "bank") setBankList((l) => [...l, { ...item, isOwnAccount: false }]); });
  const form = useForm<PaymentInput>({
    resolver: zodResolver(paymentSchema),
    defaultValues: {
      applicationId, fundId: funds.length === 1 ? funds[0].id : "", amountPaise: remainingPaise, mode: "CHEQUE", chequeNo: "",
      bankId: banks.find((b) => b.isOwnAccount)?.id ?? "", paymentDate: toDateInput(new Date()), towards: "HOSPITAL_BILL",
      hospitalId: defaultHospitalId ?? "", remark: "", overrideNote: "",
    },
  });
  const { register, handleSubmit, control, watch, formState: { errors } } = form;
  const mode = watch("mode");
  const towards = watch("towards");
  const amount = watch("amountPaise");
  const over = typeof amount === "bigint" && amount > remainingPaise;

  return (
    <>
    <form
      noValidate
      onSubmit={handleSubmit((v) =>
        run(() => recordPayment(v), (d) => `Payment ${d.voucherNo} recorded${d.lowBalance ? `. ${d.fundName} fund is now below 10% of this year's inflow` : ""}`, () => form.reset({ ...form.getValues(), amountPaise: 0n, chequeNo: "", remark: "", overrideNote: "" })),
      )}
      className="grid gap-4 lg:grid-cols-3"
    >
      <FormField id="pay-cheque" label={mode === "CHEQUE" || mode === "DD" ? "Cheque" : "Reference no."} error={errors.chequeNo?.message} required={mode !== "CASH"}>
        <TextInput id="pay-cheque" className="font-mono" {...register("chequeNo")} invalid={!!errors.chequeNo} />
      </FormField>
      <FormField id="pay-amount" label="INR" error={errors.amountPaise?.message} hint={`${formatINR(remainingPaise)} of the approved amount is left to pay`} required>
        <Controller control={control} name="amountPaise" render={({ field }) => <MoneyInput id="pay-amount" value={field.value as bigint} onChange={(v) => field.onChange(v ?? 0n)} invalid={!!errors.amountPaise} />} />
      </FormField>
      <FormField id="pay-bank" label="Bank" error={errors.bankId?.message} required={mode === "CHEQUE"}>
        <Select id="pay-bank" {...register("bankId")} options={bankList.map((b) => ({ value: b.id, label: b.label }))} placeholder="Choose the bank" invalid={!!errors.bankId} onCreate={addNew.ask("bank")} createLabel={(t) => (t ? `Add new bank “${t}”` : "Add new bank")} />
      </FormField>
      <FormField id="pay-date" label="Payment date" error={errors.paymentDate?.message} required>
        <TextInput id="pay-date" type="date" {...register("paymentDate")} />
      </FormField>
      <FormField id="pay-mode" label="Mode of transfer" required>
        <Select id="pay-mode" {...register("mode")} options={options(PAYMENT_MODE)} />
      </FormField>
      <FormField id="pay-towards" label="Towards" required>
        <Select id="pay-towards" {...register("towards")} options={options(TOWARDS)} />
      </FormField>
      {towards !== "APPLICANT_DIRECT" && (
        <FormField id="pay-hospital" label="Name of the hospital" error={errors.hospitalId?.message} required>
          <Select id="pay-hospital" {...register("hospitalId")} options={hospitals.map((h) => ({ value: h.id, label: h.label }))} placeholder="Choose the hospital" invalid={!!errors.hospitalId} />
        </FormField>
      )}
      {/* Fund selector hidden while only one fund is active; the fund is applied automatically. */}
      {funds.length > 1 && (
        <FormField id="pay-fund" label="Fund" required>
          <Select id="pay-fund" {...register("fundId")} options={funds.map((f) => ({ value: f.id, label: f.name }))} placeholder="Choose a fund" />
        </FormField>
      )}
      <FormField id="pay-remark" label="Remark" className="lg:col-span-3">
        <TextInput id="pay-remark" {...register("remark")} />
      </FormField>
      {over && (
        <FormField id="pay-override" label="Override note" hint="This is more than the approved amount left. Say why." className="lg:col-span-3" required>
          <TextInput id="pay-override" {...register("overrideNote")} />
        </FormField>
      )}
      <div className="lg:col-span-3">
        <Button type="submit" disabled={pending}>Record payment</Button>
      </div>
    </form>
    {addNew.dialog}
    </>
  );
}

export function PaymentRowActions({ id, voucherNo, status, canManage }: { id: string; voucherNo: string; status: PaymentStatus; canManage: boolean }) {
  const { pending, run } = useRun();
  const [dialog, setDialog] = useState<null | "bounce" | "cancel" | "clear">(null);
  const [reason, setReason] = useState("");
  const [date, setDate] = useState(toDateInput(new Date()));
  const live = status !== "CANCELLED" && status !== "BOUNCED";
  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button size="icon" variant="ghost" aria-label={`Actions for ${voucherNo}`} disabled={pending}><MoreHorizontal aria-hidden /></Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem asChild><a href={`/api/export/voucher?id=${id}`} target="_blank" rel="noopener">Print voucher</a></DropdownMenuItem>
          {canManage && status === "PENDING" && <DropdownMenuItem onSelect={() => run(() => markIssued({ id }), `Payment ${voucherNo} issued`)}>Mark issued</DropdownMenuItem>}
          {canManage && (status === "ISSUED" || status === "PENDING") && <DropdownMenuItem onSelect={() => setDialog("clear")}>Mark cleared</DropdownMenuItem>}
          {canManage && status === "ISSUED" && <DropdownMenuItem onSelect={() => setDialog("bounce")}>Mark bounced</DropdownMenuItem>}
          {canManage && live && <DropdownMenuItem className="text-rejected" onSelect={() => setDialog("cancel")}>{status === "CLEARED" ? "Reverse payment" : "Cancel payment"}</DropdownMenuItem>}
        </DropdownMenuContent>
      </DropdownMenu>
      <Dialog open={dialog !== null} onOpenChange={(o) => !o && setDialog(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{dialog === "clear" ? `Mark ${voucherNo} cleared` : dialog === "bounce" ? `Mark ${voucherNo} bounced` : status === "CLEARED" ? `Reverse ${voucherNo}` : `Cancel ${voucherNo}`}</DialogTitle>
            <DialogDescription>
              {dialog === "cancel" && status === "CLEARED" ? "A cleared payment is never edited. A reversal entry for the same amount is added to the register." : dialog === "clear" ? "Use the date the amount left the bank." : "The case returns to payment pending."}
            </DialogDescription>
          </DialogHeader>
          {dialog === "clear" ? (
            <FormField id="clear-date" label="Cleared on" required><TextInput id="clear-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} /></FormField>
          ) : (
            <FormField id="pay-reason" label="Reason" required><TextArea id="pay-reason" value={reason} onChange={(e) => setReason(e.target.value)} /></FormField>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialog(null)}>Go back</Button>
            <Button
              variant={dialog === "clear" ? "default" : "destructive"}
              disabled={pending}
              onClick={() => {
                const d = dialog;
                setDialog(null);
                if (d === "clear") run(() => markCleared({ ids: [id], clearedOn: date }), `Payment ${voucherNo} cleared`);
                else if (d === "bounce") run(() => markBounced({ id, reason }), `Payment ${voucherNo} marked bounced`);
                else run(() => cancelPayment({ id, reason }), status === "CLEARED" ? `Payment ${voucherNo} reversed` : `Payment ${voucherNo} cancelled`);
                setReason("");
              }}
            >
              {dialog === "clear" ? "Mark cleared" : dialog === "bounce" ? "Mark bounced" : status === "CLEARED" ? "Reverse payment" : "Cancel payment"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function DiscardDraft({ id }: { id: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild><Button variant="ghost" className="mt-3 text-rejected">Discard draft</Button></DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Discard this draft?</DialogTitle>
          <DialogDescription>The draft is removed from the list. People registered on it stay in the registry. The discard is recorded.</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Keep draft</Button>
          <Button variant="destructive" disabled={pending} onClick={() => start(async () => {
            const r = await deleteDraft({ id });
            if (r.ok) { toast.success("Draft discarded"); router.push("/applications"); }
            else toast.error(r.error);
          })}>Discard draft</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
