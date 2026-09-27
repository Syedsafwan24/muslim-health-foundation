"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { Role } from "@prisma/client";
import { toast } from "sonner";
import { Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { FormField, Select, TextInput } from "@/components/app/inputs";
import type { ActionResult } from "@/lib/action";
import type { ChecklistKey } from "@/lib/validators";
import { ROLE_LABEL } from "@/lib/auth/permissions";
import { CASE_DOCUMENTS } from "@/lib/labels";
import { setDensity, setTheme } from "../prefs-actions";
import {
  deleteMaster, saveDocumentSettings, saveMaster, saveOrganisation, saveUser, setForceMeetingMode, setMeetingMode, setRevealMinutes,
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

export function RevealMinutes({ minutes, readOnly }: { minutes: number; readOnly: boolean }) {
  const { pending, run } = useRun();
  return (
    <Select id="reveal-minutes" aria-label="Reveal expires after" value={String(minutes)} disabled={readOnly || pending} className="w-40"
      onChange={(e) => run(() => setRevealMinutes({ minutes: Number(e.target.value) }), "Reveal expiry saved")}
      options={[1, 2, 5, 10, 15].map((m) => ({ value: String(m), label: `${m} minutes` }))} />
  );
}

export function PinnedAccounts({ pinned, others, readOnly }: { pinned: { id: string; name: string; role: Role }[]; others: { id: string; name: string; role: Role }[]; readOnly: boolean }) {
  const { pending, run } = useRun();
  const [pick, setPick] = useState(others[0]?.id ?? "");
  return (
    <div className="space-y-3">
      <ul className="divide-y divide-rule rounded-control border border-rule">
        {pinned.length === 0 && <li className="px-3 py-2.5 text-ui text-slate-body">No accounts are pinned.</li>}
        {pinned.map((u) => (
          <li key={u.id} className="flex items-center gap-3 px-3 py-2.5 text-ui">
            <span className="font-medium">{u.name}</span>
            <span className="text-slate-body">{ROLE_LABEL[u.role]}</span>
            <span className="ml-auto text-label text-redacted">always hidden</span>
            {!readOnly && <Button size="icon" variant="ghost" aria-label={`Stop always hiding identities for ${u.name}`} disabled={pending} onClick={() => run(() => setForceMeetingMode({ userId: u.id, on: false }), `${u.name} unpinned`)}><X aria-hidden /></Button>}
          </li>
        ))}
      </ul>
      {!readOnly && others.length > 0 && (
        <div className="flex flex-wrap items-end gap-2">
          <FormField id="pin-user" label="Add an account"><Select id="pin-user" value={pick} onChange={(e) => setPick(e.target.value)} options={others.map((u) => ({ value: u.id, label: `${u.name} · ${ROLE_LABEL[u.role]}` }))} /></FormField>
          <Button variant="outline" disabled={pending || !pick} onClick={() => run(() => setForceMeetingMode({ userId: pick, on: true }), "Account pinned to meeting mode")}><Plus aria-hidden /> Always hide for this account</Button>
        </div>
      )}
    </div>
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
          <DialogHeader><DialogTitle>{user ? `Edit ${user.name}` : "Add user"}</DialogTitle><DialogDescription>User changes need your own password.</DialogDescription></DialogHeader>
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField id="u-name" label="Name" required><TextInput id="u-name" value={v.name} onChange={(e) => setV({ ...v, name: e.target.value })} /></FormField>
            <FormField id="u-email" label="Email" required><TextInput id="u-email" type="email" value={v.email} onChange={(e) => setV({ ...v, email: e.target.value })} /></FormField>
            <FormField id="u-role" label="Role"><Select id="u-role" value={v.role} onChange={(e) => setV({ ...v, role: e.target.value as Role })} options={Object.entries(ROLE_LABEL).map(([value, label]) => ({ value, label }))} /></FormField>
            <FormField id="u-pass" label={user ? "Reset password" : "Starting password"} hint="At least 10 characters"><TextInput id="u-pass" type="password" autoComplete="new-password" value={v.newPassword} onChange={(e) => setV({ ...v, newPassword: e.target.value })} /></FormField>
            <label className="flex items-center gap-2 text-ui"><input type="checkbox" checked={v.isActive} onChange={(e) => setV({ ...v, isActive: e.target.checked })} /> Active</label>
            <label className="flex items-center gap-2 text-ui"><input type="checkbox" checked={v.forceMeetingMode} onChange={(e) => setV({ ...v, forceMeetingMode: e.target.checked })} /> Always hide identities</label>
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

export function DocumentSettings({ maxFileMb, maxFilesPerCase, readOnly }: { maxFileMb: number; maxFilesPerCase: number; readOnly: boolean }) {
  const [mb, setMb] = useState(maxFileMb);
  const [files, setFiles] = useState(maxFilesPerCase);
  const { pending, run } = useRun();
  return (
    <form className="space-y-5" onSubmit={(e) => { e.preventDefault(); run(() => saveDocumentSettings({ required: CASE_DOCUMENTS.map((d) => d.type as ChecklistKey), maxFileMb: mb, maxFilesPerCase: files }), "Document rules saved"); }}>
      <p className="text-ui text-slate-body">Every case needs: {CASE_DOCUMENTS.map((d) => d.label).join(", ")}.</p>
      <div className="grid max-w-md grid-cols-2 gap-4">
        <FormField id="doc-mb" label="Max file size (MB)"><TextInput id="doc-mb" type="number" min={1} max={15} disabled={readOnly} value={mb} onChange={(e) => setMb(Number(e.target.value))} /></FormField>
        <FormField id="doc-files" label="Max files per case"><TextInput id="doc-files" type="number" min={5} max={40} disabled={readOnly} value={files} onChange={(e) => setFiles(Number(e.target.value))} /></FormField>
      </div>
      <p className="text-ui text-slate-body">Accepted: PDF, JPG, PNG, HEIC, WebP. Photos are re-encoded on upload, which removes location data (always on). Images over 2500px are scaled down.</p>
      {!readOnly && <Button type="submit" disabled={pending}>Save document rules</Button>}
    </form>
  );
}

// ─────────────────────────── appearance ───────────────────────────

export function Appearance({ theme, density }: { theme: string; density: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <div className="grid max-w-md gap-4">
      <FormField id="theme" label="Theme">
        <Select id="theme" value={theme} disabled={pending} onChange={(e) => start(async () => { await setTheme(e.target.value as "light"); router.refresh(); })}
          options={[{ value: "light", label: "Light" }, { value: "dark", label: "Dark" }, { value: "system", label: "Same as this computer" }]} />
      </FormField>
      <FormField id="density" label="Density" hint="Compact rows suit long data-entry sessions.">
        <Select id="density" value={density} disabled={pending} onChange={(e) => start(async () => { await setDensity(e.target.value as "compact"); router.refresh(); })}
          options={[{ value: "comfortable", label: "Comfortable" }, { value: "compact", label: "Compact" }]} />
      </FormField>
    </div>
  );
}
