"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Banknote, Building2, ClipboardList, HandCoins, Receipt, UserRound } from "lucide-react";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { searchAction } from "@/app/(app)/prefs-actions";

type Results = Awaited<ReturnType<typeof searchAction>>;

export function CommandPalette({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [r, setR] = useState<Results | null>(null);

  useEffect(() => {
    if (q.trim().length < 2) {
      setR(null);
      return;
    }
    let live = true;
    const t = setTimeout(() => searchAction(q).then((x) => live && setR(x)), 200);
    return () => {
      live = false;
      clearTimeout(t);
    };
  }, [q]);

  const go = (href: string) => {
    onOpenChange(false);
    setQ("");
    router.push(href);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="overflow-hidden p-0" showCloseButton={false}>
        <DialogHeader className="sr-only">
          <DialogTitle>Search</DialogTitle>
          <DialogDescription>Search cases, people, hospitals, donors, vouchers and receipts</DialogDescription>
        </DialogHeader>
        {/* Results come from the server already filtered and redacted, so cmdk must not re-filter. */}
        <Command shouldFilter={false}>
      <CommandInput placeholder={r?.namesDisabled ? "Case number or person code…" : "Case number, name, mobile, person code…"} value={q} onValueChange={setQ} />
      <CommandList>
        {r?.namesDisabled && <p className="px-3 py-2 text-caption text-redacted">Name search is off while identities are hidden. Case numbers and person codes still work.</p>}
        <CommandEmpty>{q.trim().length < 2 ? "Type at least two characters." : "Nothing matches that search."}</CommandEmpty>
        {!!r?.cases.length && (
          <CommandGroup heading="Cases">
            {r.cases.map((c) => (
              <CommandItem key={c.id} value={`case-${c.id}`} onSelect={() => go(`/applications/${c.id}`)}>
                <ClipboardList aria-hidden /> <span className="font-mono">{c.caseNo}</span>
              </CommandItem>
            ))}
          </CommandGroup>
        )}
        {!!r?.people.length && (
          <CommandGroup heading="People">
            {r.people.map((p) => (
              <CommandItem key={p.id} value={`person-${p.id}`} onSelect={() => go(`/people/${p.id}`)}>
                <UserRound aria-hidden /> <span className="font-mono">{p.personCode}</span> {!p.isRedacted && <span>{p.displayName}</span>}
              </CommandItem>
            ))}
          </CommandGroup>
        )}
        {!!r?.hospitals.length && (
          <CommandGroup heading="Hospitals">
            {r.hospitals.map((h) => (
              <CommandItem key={h.id} value={`h-${h.id}`} onSelect={() => go(`/hospitals/${h.id}`)}>
                <Building2 aria-hidden /> {h.name}{h.city ? `, ${h.city}` : ""}
              </CommandItem>
            ))}
          </CommandGroup>
        )}
        {!!r?.donors.length && (
          <CommandGroup heading="Donors">
            {r.donors.map((d) => (
              <CommandItem key={d.id} value={`d-${d.id}`} onSelect={() => go(`/donations/donors/${d.id}`)}>
                <HandCoins aria-hidden /> <span className="font-mono">{d.donorCode}</span> {d.name}
              </CommandItem>
            ))}
          </CommandGroup>
        )}
        {!!r?.payments.length && (
          <CommandGroup heading="Vouchers">
            {r.payments.map((p) => (
              <CommandItem key={p.id} value={`p-${p.id}`} onSelect={() => go(`/payments/${p.id}`)}>
                <Banknote aria-hidden /> <span className="font-mono">{p.voucherNo}</span> {p.chequeNo && <span className="text-slate-body">cheque {p.chequeNo}</span>}
              </CommandItem>
            ))}
          </CommandGroup>
        )}
        {!!r?.donations.length && (
          <CommandGroup heading="Receipts">
            {r.donations.map((d) => (
              <CommandItem key={d.id} value={`r-${d.id}`} onSelect={() => go(`/donations/${d.id}`)}>
                <Receipt aria-hidden /> <span className="font-mono">{d.receiptNo}</span>
              </CommandItem>
            ))}
          </CommandGroup>
        )}
      </CommandList>
        </Command>
      </DialogContent>
    </Dialog>
  );
}
