"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { FormField, TextArea, TextInput } from "@/components/app/inputs";
import type { ActionResult } from "@/lib/action";
import { closeFiscalYear, reopenFiscalYear, startFiscalYear } from "./actions";

/** A confirm dialog that asks for the password again, then runs the action. */
function Confirm({ trigger, title, description, button, destructive, note, run }: {
  trigger: React.ReactNode;
  title: string;
  description: React.ReactNode;
  button: string;
  destructive?: boolean;
  /** Label of the optional (or required) text field, e.g. a reason. */
  note?: { label: string; required?: boolean };
  run: (password: string, note: string) => Promise<ActionResult<{ code: string }>>;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [password, setPassword] = useState("");
  const [text, setText] = useState("");
  const [pending, start] = useTransition();
  const submit = () => start(async () => {
    const r = await run(password, text);
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
            <Button type="submit" variant={destructive ? "destructive" : "default"} disabled={pending || !password}>{button}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function StartYear({ next }: { next: string }) {
  return (
    <Confirm
      trigger={<Button size="sm"><Plus aria-hidden /> Start FY {next}</Button>}
      title={`Start FY ${next}?`}
      description={<p>FY {next} runs from 1 April {next.slice(0, 4)} to 31 March {Number(next.slice(0, 4)) + 1}. Once started, cases, payments, donations and expenses dated in it can be recorded, and its numbers start again from 1.</p>}
      button={`Start FY ${next}`}
      run={(password) => startFiscalYear({ password })}
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
