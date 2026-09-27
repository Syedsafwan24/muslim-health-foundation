"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { FormField, Select, TextArea, TextInput } from "@/components/app/inputs";
import { GENDER, ID_TYPE, MARITAL, options } from "@/lib/labels";
import { personSchema, type PersonInput } from "@/lib/validators";
import type { PersonFull } from "@/lib/redact";
import { mergePersons, setWatchFlag, updatePerson } from "../actions";
import { searchPeopleAction } from "../../prefs-actions";

export function PersonTools({ person: p, areas, canEdit, canMerge }: { person: PersonFull; areas: { id: string; name: string }[]; canEdit: boolean; canMerge: boolean }) {
  const [open, setOpen] = useState<null | "edit" | "watch" | "merge">(null);
  return (
    <>
      {canEdit && <Button variant="outline" onClick={() => setOpen("watch")}>{p.watchFlag ? "Change watch flag" : "Add to watch list"}</Button>}
      {canMerge && <Button variant="outline" onClick={() => setOpen("merge")}>Merge duplicate</Button>}
      {canEdit && <Button onClick={() => setOpen("edit")}>Edit person</Button>}
      <Dialog open={open !== null} onOpenChange={(o) => !o && setOpen(null)}>
        <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-2xl">
          {open === "edit" && <EditPerson p={p} areas={areas} done={() => setOpen(null)} />}
          {open === "watch" && <WatchFlag p={p} done={() => setOpen(null)} />}
          {open === "merge" && <Merge p={p} done={() => setOpen(null)} />}
        </DialogContent>
      </Dialog>
    </>
  );
}

function useRun(done: () => void) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return {
    pending,
    run: (fn: () => Promise<{ ok: boolean; error?: string }>, msg: string) =>
      start(async () => {
        const r = await fn();
        if (r.ok) {
          toast.success(msg);
          done();
          router.refresh();
        } else toast.error((r as { error: string }).error);
      }),
  };
}

function EditPerson({ p, areas, done }: { p: PersonFull; areas: { id: string; name: string }[]; done: () => void }) {
  const { pending, run } = useRun(done);
  const { register, handleSubmit, formState: { errors } } = useForm<PersonInput>({
    resolver: zodResolver(personSchema),
    defaultValues: {
      personId: p.id, fullName: p.fullName, fatherName: p.fatherName ?? "", husbandName: p.husbandName ?? "", gender: p.gender ?? undefined,
      ageYears: p.age ?? "", maritalStatus: p.maritalStatus, religion: p.religion ?? "", mobile: p.mobile ?? "", altMobile: p.altMobile ?? "",
      addressLine: p.addressLine ?? "", areaId: p.areaId ?? "", city: p.city ?? "", pincode: p.pincode ?? "", idType: p.idType, idNumber: "",
    },
  });
  return (
    <form onSubmit={handleSubmit((v) => run(() => updatePerson(v), `${p.personCode} updated`))} className="space-y-4">
      <DialogHeader><DialogTitle>Edit {p.personCode}</DialogTitle><DialogDescription>Changes apply to every case this person appears on.</DialogDescription></DialogHeader>
      <div className="grid gap-4 sm:grid-cols-2">
        <FormField id="p-name" label="Name" error={errors.fullName?.message} required><TextInput id="p-name" {...register("fullName")} /></FormField>
        <FormField id="p-father" label="Father name"><TextInput id="p-father" {...register("fatherName")} /></FormField>
        <FormField id="p-husband" label="Husband name"><TextInput id="p-husband" {...register("husbandName")} /></FormField>
        <FormField id="p-mobile" label="Mobile no." error={errors.mobile?.message}><TextInput id="p-mobile" inputMode="tel" {...register("mobile")} /></FormField>
        <FormField id="p-alt" label="Alternate mobile" error={errors.altMobile?.message}><TextInput id="p-alt" inputMode="tel" {...register("altMobile")} /></FormField>
        <FormField id="p-area" label="Area"><Select id="p-area" {...register("areaId")} options={areas.map((a) => ({ value: a.id, label: a.name }))} placeholder="Choose the area" /></FormField>
        <FormField id="p-addr" label="Address" className="sm:col-span-2"><TextInput id="p-addr" {...register("addressLine")} /></FormField>
        <FormField id="p-status" label="Status"><Select id="p-status" {...register("maritalStatus")} options={options(MARITAL)} /></FormField>
        <FormField id="p-age" label="Age" error={errors.ageYears?.message}><TextInput id="p-age" inputMode="numeric" {...register("ageYears")} /></FormField>
        <FormField id="p-gender" label="Gender"><Select id="p-gender" {...register("gender", { setValueAs: (v) => v || null })} options={options(GENDER)} placeholder="Choose" /></FormField>
        <FormField id="p-religion" label="Religion"><TextInput id="p-religion" {...register("religion")} /></FormField>
        <FormField id="p-idtype" label="ID type"><Select id="p-idtype" {...register("idType")} options={options(ID_TYPE)} /></FormField>
        <FormField id="p-idno" label="ID number" hint="Leave blank to keep the stored number"><TextInput id="p-idno" {...register("idNumber")} /></FormField>
      </div>
      <DialogFooter><Button type="button" variant="outline" onClick={done}>Cancel</Button><Button type="submit" disabled={pending}>Save person</Button></DialogFooter>
    </form>
  );
}

function WatchFlag({ p, done }: { p: PersonFull; done: () => void }) {
  const { pending, run } = useRun(done);
  const [note, setNote] = useState(p.watchNote ?? "");
  return (
    <div className="space-y-4">
      <DialogHeader>
        <DialogTitle>Watch list</DialogTitle>
        <DialogDescription>A watched person shows an amber banner on every case they appear on.</DialogDescription>
      </DialogHeader>
      <FormField id="watch-note" label="Why this person should be looked at closely"><TextArea id="watch-note" value={note} onChange={(e) => setNote(e.target.value)} /></FormField>
      <DialogFooter>
        {p.watchFlag && <Button variant="outline" disabled={pending} onClick={() => run(() => setWatchFlag({ personId: p.id, watchFlag: false, watchNote: "" }), "Removed from the watch list")}>Remove from watch list</Button>}
        <Button disabled={pending} onClick={() => run(() => setWatchFlag({ personId: p.id, watchFlag: true, watchNote: note }), "Added to the watch list")}>{p.watchFlag ? "Update note" : "Add to watch list"}</Button>
      </DialogFooter>
    </div>
  );
}

function Merge({ p, done }: { p: PersonFull; done: () => void }) {
  const { pending, run } = useRun(done);
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<{ id: string; personCode: string; displayName: string }[]>([]);
  const [other, setOther] = useState<{ id: string; personCode: string; displayName: string } | null>(null);
  const [reason, setReason] = useState("");
  return (
    <div className="space-y-4">
      <DialogHeader>
        <DialogTitle>Merge a duplicate into {p.personCode}</DialogTitle>
        <DialogDescription>Every case and document of the duplicate moves to {p.personCode}. The duplicate record is kept, marked as merged.</DialogDescription>
      </DialogHeader>
      {!other ? (
        <>
          <FormField id="merge-q" label="Find the duplicate">
            <TextInput id="merge-q" value={q} placeholder="Name, mobile or person code" onChange={async (e) => { setQ(e.target.value); setHits(e.target.value.trim().length >= 2 ? (await searchPeopleAction(e.target.value)).filter((h) => h.id !== p.id) : []); }} />
          </FormField>
          <ul className="divide-y divide-rule rounded-control border border-rule">
            {hits.map((h) => (
              <li key={h.id} className="flex items-center justify-between px-3 py-2 text-ui">
                <span><span className="font-mono">{h.personCode}</span> · {h.displayName}</span>
                <Button size="sm" variant="outline" onClick={() => setOther(h)}>Choose</Button>
              </li>
            ))}
          </ul>
        </>
      ) : (
        <>
          <p className="rounded-control bg-pending-bg px-3 py-2 text-ui">Merge <span className="font-mono">{other.personCode}</span> ({other.displayName}) into <span className="font-mono">{p.personCode}</span> ({p.fullName}).</p>
          <FormField id="merge-reason" label="Reason" required><TextArea id="merge-reason" value={reason} onChange={(e) => setReason(e.target.value)} /></FormField>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOther(null)}>Choose someone else</Button>
            <Button variant="destructive" disabled={pending} onClick={() => run(() => mergePersons({ keepId: p.id, mergeId: other.id, reason }), `${other.personCode} merged into ${p.personCode}`)}>Merge records</Button>
          </DialogFooter>
        </>
      )}
    </div>
  );
}
