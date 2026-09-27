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
import { EXPENSE_CATEGORY, options, PAYMENT_MODE } from "@/lib/labels";
import { toDateInput } from "@/lib/fy";
import { expenseSchema } from "@/lib/validators";
import { createExpense } from "./actions";

type Input = z.input<typeof expenseSchema>;

export function ExpenseDialog({ funds }: { funds: { id: string; name: string }[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const { register, handleSubmit, control, reset, formState: { errors } } = useForm<Input>({
    resolver: zodResolver(expenseSchema),
    defaultValues: { category: "STATIONERY", description: "", amountPaise: 0n, expenseDate: toDateInput(new Date()), fundId: funds.length === 1 ? funds[0].id : "", paidTo: "", mode: "CASH", referenceNo: "" },
  });
  return (
    <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) reset(); }}>
      <DialogTrigger asChild><Button><Plus aria-hidden /> Record expense</Button></DialogTrigger>
      <DialogContent className="sm:max-w-xl">
        <form onSubmit={handleSubmit((v) => start(async () => {
          const r = await createExpense(v);
          if (r.ok) { toast.success(`Expense ${r.data.voucherNo} recorded`); setOpen(false); router.refresh(); }
          else toast.error(r.error);
        }))} className="space-y-4">
          <DialogHeader><DialogTitle>Record expense</DialogTitle><DialogDescription>Expenses can only be charged to a fund that allows them. Zakat never does.</DialogDescription></DialogHeader>
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField id="e-cat" label="Category"><Select id="e-cat" {...register("category")} options={options(EXPENSE_CATEGORY)} /></FormField>
            <FormField id="e-amount" label="Amount" error={errors.amountPaise?.message} required>
              <Controller control={control} name="amountPaise" render={({ field }) => <MoneyInput id="e-amount" value={field.value as bigint} onChange={(v) => field.onChange(v ?? 0n)} />} />
            </FormField>
            <FormField id="e-desc" label="Description" error={errors.description?.message} required className="sm:col-span-2"><TextInput id="e-desc" {...register("description")} /></FormField>
            <FormField id="e-date" label="Date" required><TextInput id="e-date" type="date" {...register("expenseDate")} /></FormField>
            {funds.length > 1 && <FormField id="e-fund" label="Fund" required><Select id="e-fund" {...register("fundId")} options={funds.map((f) => ({ value: f.id, label: f.name }))} placeholder="Choose the fund" /></FormField>}
            <FormField id="e-paidto" label="Paid to"><TextInput id="e-paidto" {...register("paidTo")} /></FormField>
            <FormField id="e-mode" label="Mode"><Select id="e-mode" {...register("mode")} options={options(PAYMENT_MODE)} /></FormField>
            <FormField id="e-ref" label="Reference"><TextInput id="e-ref" {...register("referenceNo")} /></FormField>
          </div>
          <DialogFooter><Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancel</Button><Button type="submit" disabled={pending}>Record expense</Button></DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
