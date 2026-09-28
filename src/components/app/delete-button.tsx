"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { FormField, TextArea, TextInput } from "@/components/app/inputs";
import { deleteCase, deleteDisease, deleteHospital, deletePerson } from "@/app/(app)/delete-actions";

const RUN = { case: deleteCase, person: deletePerson, hospital: deleteHospital, disease: deleteDisease };

/** Super-admin delete: reason + password, then back to the list. The record is hidden, not erased. */
export function DeleteButton({ kind, id, name, backTo }: { kind: keyof typeof RUN; id: string; name: string; backTo: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [password, setPassword] = useState("");
  const [pending, start] = useTransition();
  const [tried, setTried] = useState(false);
  const short = !reason.trim();
  const submit = () => start(async () => {
    setTried(true);
    if (short || !password) return;
    const r = await RUN[kind]({ id, reason, password });
    if (!r.ok) return void toast.error(r.error);
    toast.success(`${name} deleted`);
    setOpen(false);
    router.push(backTo);
  });
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" className="text-rejected"><Trash2 aria-hidden /> Delete</Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); submit(); }}>
          <DialogHeader>
            <DialogTitle>Delete {name}?</DialogTitle>
            <DialogDescription>
              It disappears from every list and report. The activity log keeps a record of who deleted it and why.
            </DialogDescription>
          </DialogHeader>
          <FormField id="del-reason" label="Why are you deleting it?" required error={tried && short ? "Say why, for example: test entry" : undefined}>
            <TextArea id="del-reason" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="For example: test entry, entered twice" />
          </FormField>
          <FormField id="del-password" label="Your password" required error={tried && !password ? "Enter your password" : undefined}>
            <TextInput id="del-password" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />
          </FormField>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button type="submit" variant="destructive" disabled={pending}>{pending ? "Deleting…" : "Delete"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
