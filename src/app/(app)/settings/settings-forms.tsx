"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { Role } from "@prisma/client";
import { toast } from "sonner";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { FormField, Select, TextInput } from "@/components/app/inputs";
import type { ActionResult } from "@/lib/action";
import { ROLE_LABEL } from "@/lib/auth/permissions";
import {
  deleteMaster, saveMaster, saveOrganisation, saveUser, setMeetingMode,
} from "./actions";

function useRun(done?: () => void) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return {
    pending,
    run: <T,>(fn: () => Promise<ActionResult<T>>, msg: string) =>
      start(async () => {
        const r = await fn();
        if (r.ok) { toast.success(msg); done?.(); router.refresh(); }
        else toast.error(r.error);
      }),
  };
}

// ─────────────────────────── organisation ───────────────────────────

export function OrgForm({ initial, readOnly }: { initial: { name: string; address: string; phone: string; email: string; registrationNo: string; eightyGNo: string }; readOnly: boolean }) {
  const [v, setV] = useState(initial);
  const { pending, run } = useRun();
  const field = (k: keyof typeof v, label: string, hint?: string) => (
    <FormField id={`org-${k}`} label={label} hint={hint}>
      <TextInput id={`org-${k}`} value={v[k]} disabled={readOnly} onChange={(e) => setV({ ...v, [k]: e.target.value })} />
    </FormField>
  );
  return (
    <form className="grid gap-4 lg:grid-cols-2" onSubmit={(e) => { e.preventDefault(); run(() => saveOrganisation(v), "Organisation details saved"); }}>
      <div className="lg:col-span-2">{field("name", "Name")}</div>
      <div className="lg:col-span-2">{field("address", "Address")}</div>
      {field("phone", "Phone")}
      {field("email", "Email")}
      {field("registrationNo", "Trust registration no.")}
      {field("eightyGNo", "80G registration no.", "When set, receipts carry the 80G block and the donor's PAN (open question 5).")}
      {!readOnly && <div className="lg:col-span-2"><Button type="submit" disabled={pending}>Save organisation details</Button></div>}
    </form>
  );
}

// ─────────────────────────── privacy ───────────────────────────

export function GlobalSwitch({ on, readOnly }: { on: boolean; readOnly: boolean }) {
  const { pending, run } = useRun();
  return (
    <Switch checked={on} disabled={readOnly || pending} aria-label="Hide identities for everyone"
      onCheckedChange={(v) => run(() => setMeetingMode({ on: v }), v ? "Identities hidden for everyone" : "Meeting mode turned off")} />
  );
}

// ─────────────────────────── users ───────────────────────────

type UserRow = { id: string; name: string; email: string; role: Role; isActive: boolean; forceMeetingMode: boolean };

export function UserDialog({ user }: { user?: UserRow }) {
  const [open, setOpen] = useState(false);
  const [v, setV] = useState({ name: user?.name ?? "", email: user?.email ?? "", role: user?.role ?? ("OPERATOR" as Role), isActive: user?.isActive ?? true, forceMeetingMode: user?.forceMeetingMode ?? false, newPassword: "", adminPassword: "" });
  const { pending, run } = useRun(() => setOpen(false));
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{user ? <Button size="sm" variant="outline">Edit</Button> : <Button><Plus aria-hidden /> Add user</Button>}</DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); run(() => saveUser({ ...v, id: user?.id }), user ? "Account updated" : "Account created"); }}>
          <DialogHeader><DialogTitle>{user ? `Edit ${user.name}` : "Add user"}</DialogTitle><DialogDescription>To confirm, enter your own password at the bottom.</DialogDescription></DialogHeader>
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField id="u-name" label="Name" required><TextInput id="u-name" value={v.name} onChange={(e) => setV({ ...v, name: e.target.value })} /></FormField>
            <FormField id="u-email" label="Email" required><TextInput id="u-email" type="email" value={v.email} onChange={(e) => setV({ ...v, email: e.target.value })} /></FormField>
            <FormField id="u-role" label="Job"><Select id="u-role" value={v.role} onChange={(e) => setV({ ...v, role: e.target.value as Role })} options={Object.entries(ROLE_LABEL).map(([value, label]) => ({ value, label }))} /></FormField>
            <FormField id="u-pass" label={user ? "Reset password" : "Starting password"} hint="At least 10 characters"><TextInput id="u-pass" type="password" autoComplete="new-password" value={v.newPassword} onChange={(e) => setV({ ...v, newPassword: e.target.value })} /></FormField>
            <label className="flex items-center gap-2 text-ui"><input type="checkbox" checked={v.isActive} onChange={(e) => setV({ ...v, isActive: e.target.checked })} /> Active</label>
            <label className="flex items-center gap-2 text-ui"><input type="checkbox" checked={v.forceMeetingMode} onChange={(e) => setV({ ...v, forceMeetingMode: e.target.checked })} /> Always hide names</label>
            <FormField id="u-admin" label="Your password" required className="sm:col-span-2"><TextInput id="u-admin" type="password" autoComplete="current-password" value={v.adminPassword} onChange={(e) => setV({ ...v, adminPassword: e.target.value })} /></FormField>
          </div>
          <DialogFooter><Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancel</Button><Button type="submit" disabled={pending}>{user ? "Save account" : "Create account"}</Button></DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ─────────────────────────── masters ───────────────────────────

type Kind = "area" | "bank" | "category" | "disease";
export function MasterRow({ kind, id, name, label, uses, extra, categories, readOnly }: {
  kind: Kind; id?: string; name?: string; label?: string; uses?: number; readOnly: boolean;
  extra?: { taluk?: string | null; branch?: string | null; accountLast4?: string | null; isOwnAccount?: boolean; sortOrder?: number; categoryId?: string; isChronic?: boolean };
  categories?: { id: string; name: string }[];
}) {
  const [editing, setEditing] = useState(!id);
  const [v, setV] = useState({ name: name ?? "", taluk: extra?.taluk ?? "", branch: extra?.branch ?? "", accountLast4: extra?.accountLast4 ?? "", isOwnAccount: extra?.isOwnAccount ?? false, sortOrder: extra?.sortOrder ?? 0, categoryId: extra?.categoryId ?? categories?.[0]?.id ?? "", isChronic: extra?.isChronic ?? false });
  const { pending, run } = useRun(() => { if (!id) setV({ ...v, name: "" }); else setEditing(false); });
  const payload = () => {
    switch (kind) {
      case "area": return { kind, id, name: v.name, taluk: v.taluk };
      case "bank": return { kind, id, name: v.name, branch: v.branch, accountLast4: v.accountLast4, isOwnAccount: v.isOwnAccount };
      case "category": return { kind, id, name: v.name, sortOrder: v.sortOrder };
      case "disease": return { kind, id, name: v.name, categoryId: v.categoryId, isChronic: v.isChronic };
    }
  };
  if (!editing) {
    return (
      <li className="flex items-center gap-3 px-3 py-2 text-ui">
        <span className="flex-1">{label ?? name}{kind === "bank" && extra?.isOwnAccount && <span className="ml-2 text-caption text-approved">MHF account</span>}{kind === "disease" && extra?.isChronic && <span className="ml-2 text-caption text-info">chronic</span>}</span>
        <span className="text-caption tabular-nums text-slate-body">{uses} in use</span>
        {!readOnly && <Button size="sm" variant="ghost" onClick={() => setEditing(true)}>Edit</Button>}
        {!readOnly && !uses && <Button size="sm" variant="ghost" className="text-rejected" disabled={pending} onClick={() => run(() => deleteMaster({ kind, id: id! }), `${name} removed`)}>Remove</Button>}
      </li>
    );
  }
  return (
    <li className="flex flex-wrap items-end gap-2 bg-navy-50 px-3 py-2">
      <FormField id={`m-${kind}-${id ?? "new"}`} label="Name" className="min-w-48 flex-1"><TextInput id={`m-${kind}-${id ?? "new"}`} value={v.name} onChange={(e) => setV({ ...v, name: e.target.value })} /></FormField>
      {kind === "bank" && <FormField id={`m-branch-${id ?? "new"}`} label="Branch"><TextInput id={`m-branch-${id ?? "new"}`} value={v.branch} onChange={(e) => setV({ ...v, branch: e.target.value })} /></FormField>}
      {kind === "bank" && <label className="flex h-10 items-center gap-2 text-ui"><input type="checkbox" checked={v.isOwnAccount} onChange={(e) => setV({ ...v, isOwnAccount: e.target.checked })} /> MHF account</label>}
      {kind === "disease" && categories && <FormField id={`m-cat-${id ?? "new"}`} label="Category"><Select id={`m-cat-${id ?? "new"}`} value={v.categoryId} onChange={(e) => setV({ ...v, categoryId: e.target.value })} options={categories.map((c) => ({ value: c.id, label: c.name }))} /></FormField>}
      {kind === "disease" && <label className="flex h-10 items-center gap-2 text-ui"><input type="checkbox" checked={v.isChronic} onChange={(e) => setV({ ...v, isChronic: e.target.checked })} /> Chronic</label>}
      <Button disabled={pending || v.name.trim().length < 2} onClick={() => run(() => saveMaster(payload()), id ? `${v.name} saved` : `${v.name} added`)}>{id ? "Save" : "Add"}</Button>
      {id && <Button variant="ghost" onClick={() => setEditing(false)}>Cancel</Button>}
    </li>
  );
}

// ─────────────────────────── documents ───────────────────────────


