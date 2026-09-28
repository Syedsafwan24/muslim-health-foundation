"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { FormField, TextArea, TextInput } from "@/components/app/inputs";
import type { ActionResult } from "@/lib/action";
import { closeFiscalYear, reopenFiscalYear, startFiscalYear, updateFiscalYearDates } from "./actions";

/** A confirm dialog that asks for the password again, then runs the action. */
function Confirm({ trigger, title, description, button, destructive, note, dates, run }: {
  trigger: React.ReactNode;
  title: string;
  description: React.ReactNode;
  button: string;
  destructive?: boolean;
  /** Label of the optional (or required) text field, e.g. a reason. */
  note?: { label: string; required?: boolean };
  /** First and last day fields (yyyy-MM-dd), pre-filled. */
  dates?: { first: string; last: string };
  run: (password: string, note: string, dates: { first: string; last: string }) => Promise<ActionResult<{ code: string }>>;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [password, setPassword] = useState("");
  const [text, setText] = useState("");
  const [first, setFirst] = useState(dates?.first ?? "");
  const [last, setLast] = useState(dates?.last ?? "");
  const [pending, start] = useTransition();
  const submit = () => start(async () => {
    const r = await run(password, text, { first, last });
    if (!r.ok) return void toast.error(r.error);
    toast.success(`${title.replace(/\?$/, "")} — done`);
    setOpen(false);
    setPassword("");
    setText("");
    router.refresh();
  });
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); submit(); }}>
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
            <DialogDescription asChild><div className="space-y-2">{description}</div></DialogDescription>
          </DialogHeader>
          {dates && (
            <div className="grid gap-4 sm:grid-cols-2">
              <FormField id="fy-first" label="First day" required>
                <TextInput id="fy-first" type="date" value={first} onChange={(e) => setFirst(e.target.value)} />
              </FormField>
              <FormField id="fy-last" label="Last day" required>
                <TextInput id="fy-last" type="date" value={last} onChange={(e) => setLast(e.target.value)} />
              </FormField>
            </div>
          )}
          {note && (
            <FormField id="fy-note" label={note.label} required={note.required}>
              <TextArea id="fy-note" value={text} onChange={(e) => setText(e.target.value)} />
            </FormField>
          )}
          <FormField id="fy-password" label="Your password" required>
            <TextInput id="fy-password" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />
          </FormField>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button type="submit" variant={destructive ? "destructive" : "default"} disabled={pending || !password || (!!dates && (!first || !last))}>{button}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function StartYear({ first, last }: { first: string; last: string }) {
  return (
    <Confirm
      trigger={<Button size="sm"><Plus aria-hidden /> Start a new fiscal year</Button>}
      title="Start a new fiscal year"
      description={<p>Choose its first and last day. The suggested dates follow on from the latest year. Its name comes from the dates (for example 2026-27, or 2027 for a calendar year), and case, voucher and receipt numbers start again from 1.</p>}
      dates={{ first, last }}
      button="Start the year"
      run={(password, _note, d) => startFiscalYear({ password, startsOn: d.first, lastDay: d.last })}
    />
  );
}

export function EditYearDates({ code, first, last }: { code: string; first: string; last: string }) {
  return (
    <Confirm
      trigger={<Button size="sm" variant="outline">Edit dates</Button>}
      title={`Change the dates of FY ${code}`}
      description={<p>Records already entered in FY {code} must still fall inside the new dates, and the dates cannot overlap another year.</p>}
      dates={{ first, last }}
      button="Save dates"
      run={(password, _note, d) => updateFiscalYearDates({ code, password, startsOn: d.first, lastDay: d.last })}
    />
  );
}

export function CloseYear({ code, drafts, unissued, running }: { code: string; drafts: number; unissued: number; running: boolean }) {
  return (
    <Confirm
      trigger={<Button size="sm" variant="outline">Close year</Button>}
      title={`Close FY ${code}?`}
      destructive
      description={<>
        <p>Nothing new can be recorded with a date in FY {code} after it is closed. Existing records stay as they are and can still be viewed and exported.</p>
        {running && <p className="font-medium text-pending">This year has not ended yet. Closing it now stops today&apos;s entries too.</p>}
        {(drafts > 0 || unissued > 0) && (
          <p className="font-medium text-pending">
            Still open in this year: {[drafts && `${drafts} unfinished ${drafts === 1 ? "entry" : "entries"}`, unissued && `${unissued} receipt${unissued === 1 ? "" : "s"} not issued`].filter(Boolean).join(", ")}.
          </p>
        )}
      </>}
      note={{ label: "Note (optional)" }}
      button={`Close FY ${code}`}
      run={(password, note) => closeFiscalYear({ code, password, note })}
    />
  );
}

export function ReopenYear({ code }: { code: string }) {
  return (
    <Confirm
      trigger={<Button size="sm" variant="outline">Reopen</Button>}
      title={`Reopen FY ${code}?`}
      description={<p>Entries dated in FY {code} can be recorded again until you close it. The reason is kept in the audit log.</p>}
      note={{ label: "Reason", required: true }}
      button={`Reopen FY ${code}`}
      run={(password, reason) => reopenFiscalYear({ code, password, reason })}
    />
  );
}
