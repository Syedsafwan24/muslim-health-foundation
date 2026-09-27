"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import type { z } from "zod";
import { toast } from "sonner";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { FormField, Select, TextArea, TextInput } from "@/components/app/inputs";
import { HOSPITAL_TYPE, options } from "@/lib/labels";
import { hospitalSchema } from "@/lib/validators";
import { saveHospital } from "@/app/(app)/settings/actions";

type Input = z.input<typeof hospitalSchema>;

export function HospitalDialog({ initial }: { initial?: Input }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const { register, handleSubmit, formState: { errors } } = useForm<Input>({
    resolver: zodResolver(hospitalSchema),
    defaultValues: initial ?? { name: "", type: "PRIVATE", city: "", state: "Karnataka", isEmpanelled: false, isActive: true },
  });
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {initial ? <Button variant="outline">Edit hospital</Button> : <Button><Plus aria-hidden /> Add hospital</Button>}
      </DialogTrigger>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-2xl">
        <form
          onSubmit={handleSubmit((v) => start(async () => {
            const r = await saveHospital(v);
            if (r.ok) { toast.success(initial ? "Hospital updated" : "Hospital added"); setOpen(false); router.refresh(); }
            else toast.error(r.error);
          }))}
          className="space-y-4"
        >
          <DialogHeader>
            <DialogTitle>{initial ? "Edit hospital" : "Add hospital"}</DialogTitle>
            <DialogDescription>Bank details are kept to the last 4 digits only.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField id="h-name" label="Name" error={errors.name?.message} required className="sm:col-span-2"><TextInput id="h-name" {...register("name")} /></FormField>
            <FormField id="h-type" label="Type"><Select id="h-type" {...register("type")} options={options(HOSPITAL_TYPE)} /></FormField>
            <FormField id="h-city" label="City"><TextInput id="h-city" {...register("city")} /></FormField>
            <FormField id="h-addr" label="Address" className="sm:col-span-2"><TextInput id="h-addr" {...register("addressLine")} /></FormField>
            <FormField id="h-phone" label="Phone"><TextInput id="h-phone" {...register("phone")} /></FormField>
            <FormField id="h-email" label="Email"><TextInput id="h-email" {...register("email")} /></FormField>
            <FormField id="h-contact" label="Contact person"><TextInput id="h-contact" {...register("contactPerson")} /></FormField>
            <FormField id="h-cphone" label="Contact phone"><TextInput id="h-cphone" {...register("contactPhone")} /></FormField>
            <FormField id="h-bank" label="Bank name"><TextInput id="h-bank" {...register("bankName")} /></FormField>
            <FormField id="h-last4" label="Account, last 4 digits" error={errors.bankAccountLast4?.message}><TextInput id="h-last4" inputMode="numeric" maxLength={4} {...register("bankAccountLast4")} /></FormField>
            <FormField id="h-discount" label="Discount arrangement" className="sm:col-span-2"><TextInput id="h-discount" {...register("discountNote")} /></FormField>
            <FormField id="h-notes" label="Notes" className="sm:col-span-2"><TextArea id="h-notes" {...register("notes")} /></FormField>
            <label className="flex items-center gap-2 text-ui"><input type="checkbox" {...register("isEmpanelled")} /> Empanelled with MHF</label>
            <label className="flex items-center gap-2 text-ui"><input type="checkbox" {...register("isActive")} /> Active</label>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button type="submit" disabled={pending}>{initial ? "Save hospital" : "Add hospital"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
