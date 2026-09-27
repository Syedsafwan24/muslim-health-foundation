"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import type { z } from "zod";
import { toast } from "sonner";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { FormField, MoneyInput, Select, TextInput } from "@/components/app/inputs";
import { FUND_TYPE, options } from "@/lib/labels";
import { fundSchema } from "@/lib/validators";
import { saveFund } from "./actions";

type Input = z.input<typeof fundSchema>;

export function FundDialog({ initial }: { initial?: Input }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const { register, handleSubmit, control, watch, formState: { errors } } = useForm<Input>({
    resolver: zodResolver(fundSchema),
    defaultValues: initial ?? { name: "", type: "GENERAL", isRestricted: false, allowsExpenses: true, isActive: true, openingBalancePaise: 0n, password: "" },
  });
  const type = watch("type");
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{initial ? <Button variant="outline" size="sm">Change fund</Button> : <Button><Plus aria-hidden /> Add fund</Button>}</DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <form onSubmit={handleSubmit((v) => start(async () => {
          const r = await saveFund(v);
          if (r.ok) { toast.success(initial ? "Fund updated" : "Fund added"); setOpen(false); router.refresh(); }
          else toast.error(r.error);
        }))} className="space-y-4">
          <DialogHeader>
            <DialogTitle>{initial ? `Change ${initial.name}` : "Add fund"}</DialogTitle>
            <DialogDescription>Fund changes are audited and need your password.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField id="f-name" label="Name" error={errors.name?.message} required><TextInput id="f-name" {...register("name")} /></FormField>
            <FormField id="f-type" label="Type"><Select id="f-type" {...register("type")} options={options(FUND_TYPE)} disabled={!!initial} /></FormField>
            <FormField id="f-open" label="Opening balance" className="sm:col-span-2">
              <Controller control={control} name="openingBalancePaise" render={({ field }) => <MoneyInput id="f-open" value={field.value as bigint} onChange={(v) => field.onChange(v ?? 0n)} />} />
            </FormField>
            <label className="flex items-center gap-2 text-ui"><input type="checkbox" {...register("isActive")} /> Active</label>
            <label className="flex items-center gap-2 text-ui"><input type="checkbox" {...register("isRestricted")} /> Restricted (aid only)</label>
            <label className="flex items-center gap-2 text-ui sm:col-span-2">
              <input type="checkbox" {...register("allowsExpenses")} disabled={type === "ZAKAT"} /> Can pay the trust&apos;s running costs
              {type === "ZAKAT" && <span className="text-caption text-slate-body">— never for Zakat</span>}
            </label>
            {errors.allowsExpenses && <p role="alert" className="text-caption text-rejected sm:col-span-2">{errors.allowsExpenses.message}</p>}
            <FormField id="f-pass" label="Your password" error={errors.password?.message} required className="sm:col-span-2"><TextInput id="f-pass" type="password" autoComplete="current-password" {...register("password")} /></FormField>
          </div>
          <DialogFooter><Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancel</Button><Button type="submit" disabled={pending}>{initial ? "Save fund" : "Add fund"}</Button></DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
