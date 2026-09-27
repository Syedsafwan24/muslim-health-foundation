"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { FormField, Select, TextInput } from "@/components/app/inputs";
import { HOSPITAL_TYPE, options } from "@/lib/labels";
import { saveHospital } from "../settings/actions";
import { addBank, addDisease, addDiseaseCategory } from "./actions";

type Option = { value: string; label: string };
export type AddKind = "introducer" | "doctor" | "disease" | "hospital" | "bank";

const COPY: Record<AddKind, { title: string; label: string; button: string }> = {
  introducer: { title: "Add who introduced the case", label: "Introduced by", button: "Add name" },
  doctor: { title: "Add a new doctor", label: "Doctor's name", button: "Add doctor" },
  disease: { title: "Add a new disease", label: "Disease", button: "Add disease" },
  hospital: { title: "Add a new hospital", label: "Name of the hospital", button: "Add hospital" },
  bank: { title: "Add a new bank", label: "Bank name", button: "Add bank" },
};

/**
 * The "+ Add new" pop-up behind the form's dropdowns. `ask(kind)` is passed to a dropdown as
 * onCreate: it opens the pop-up and resolves with the new option (or null if cancelled).
 * New hospitals are saved to the hospital list; the other kinds are text saved with the case.
 */
export function useAddDialog(
  categories: { id: string; name: string }[],
  onAdded: (kind: "hospital" | "disease" | "bank", item: { id: string; label: string }) => void,
) {
  const [req, setReq] = useState<{ kind: AddKind; resolve: (o: Option | null) => void } | null>(null);
  const [text, setText] = useState("");
  const [city, setCity] = useState("");
  const [type, setType] = useState<keyof typeof HOSPITAL_TYPE>("PRIVATE");
  const [categoryId, setCategoryId] = useState("");
  // Categories can be added from here too, so the list is local state.
  const [cats, setCats] = useState(categories);
  const [catReq, setCatReq] = useState<{ resolve: (o: Option | null) => void } | null>(null);
  const [catName, setCatName] = useState("");
  const [catError, setCatError] = useState<string | null>(null);
  const [catSaving, setCatSaving] = useState(false);

  const askCategory = (typed: string) =>
    new Promise<Option | null>((resolve) => {
      setCatName(typed);
      setCatError(null);
      setCatReq({ resolve });
    });
  const closeCategory = (o: Option | null) => {
    catReq?.resolve(o);
    setCatReq(null);
  };
  const submitCategory = async () => {
    const name = catName.trim();
    if (name.length < 2) return setCatError("Enter the category name");
    setCatSaving(true);
    const r = await addDiseaseCategory({ name });
    setCatSaving(false);
    if (!r.ok) return setCatError(r.error);
    setCats((list) => (list.some((c) => c.id === r.data.id) ? list : [...list, r.data]));
    toast.success(`Category ${r.data.name} added`);
    closeCategory({ value: r.data.id, label: r.data.name });
  };
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const ask = (kind: AddKind) => (typed: string) =>
    new Promise<Option | null>((resolve) => {
      setText(typed);
      setCity("");
      setType("PRIVATE");
      setCategoryId("");
      setError(null);
      setReq({ kind, resolve });
    });

  const close = (o: Option | null) => {
    req?.resolve(o);
    setReq(null);
  };

  const submit = async () => {
    if (!req) return;
    const value = text.trim();
    if (value.length < 2) return setError(`Enter the ${COPY[req.kind].label.toLowerCase()}`);
    if (req.kind === "disease") {
      if (!categoryId) return setError("Choose the category");
      setSaving(true);
      const r = await addDisease({ name: value, categoryId });
      setSaving(false);
      if (!r.ok) return setError(r.error);
      onAdded("disease", r.data);
      toast.success(`${value} is in the disease list`);
      return close({ value: r.data.id, label: r.data.label });
    }
    if (req.kind === "bank") {
      setSaving(true);
      const r = await addBank({ name: value, branch: city });
      setSaving(false);
      if (!r.ok) return setError(r.error);
      onAdded("bank", r.data);
      toast.success(`${r.data.label} added to the bank list`);
      return close({ value: r.data.id, label: r.data.label });
    }
    if (req.kind !== "hospital") return close({ value, label: value });
    setSaving(true);
    const r = await saveHospital({ name: value, city: city.trim(), type, isEmpanelled: false, isActive: true });
    setSaving(false);
    if (!r.ok) return setError(r.error);
    const label = city.trim() ? `${r.data.name}, ${city.trim()}` : r.data.name;
    onAdded("hospital", { id: r.data.id, label });
    toast.success(`${r.data.name} added to the hospital list`);
    close({ value: r.data.id, label });
  };

  const copy = req ? COPY[req.kind] : null;
  const dialog = (
    <Dialog open={!!req} onOpenChange={(o) => !o && close(null)}>
      <DialogContent className="sm:max-w-lg">
        {copy && req && (
          <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); e.stopPropagation(); void submit(); }}>
            <DialogHeader>
              <DialogTitle>{copy.title}</DialogTitle>
              <DialogDescription>
                {req.kind === "hospital" ? "It is saved to the hospital list. More details can be added later under Hospitals." : req.kind === "disease" ? "It is saved to the disease list, so cases can be counted by disease." : req.kind === "bank" ? "It is saved to the bank list." : "It will be offered in this list on later applications too."}
              </DialogDescription>
            </DialogHeader>
            <FormField id="add-text" label={copy.label} error={error ?? undefined} required>
              <TextInput id="add-text" value={text} onChange={(e) => setText(e.target.value)} autoFocus autoComplete="off" invalid={!!error} />
            </FormField>
            {req.kind === "disease" && (
              <FormField id="add-category" label="Category" required>
                <Select id="add-category" value={categoryId} onChange={(e) => setCategoryId(e.target.value)} options={cats.map((c) => ({ value: c.id, label: c.name }))} placeholder="Choose the category" onCreate={askCategory} createLabel={(t) => (t ? `Add new category “${t}”` : "Add new category")} />
              </FormField>
            )}
            {req.kind === "bank" && (
              <FormField id="add-branch" label="Branch"><TextInput id="add-branch" value={city} onChange={(e) => setCity(e.target.value)} /></FormField>
            )}
            {req.kind === "hospital" && (
              <div className="grid gap-4 sm:grid-cols-2">
                <FormField id="add-city" label="City"><TextInput id="add-city" value={city} onChange={(e) => setCity(e.target.value)} /></FormField>
                <FormField id="add-type" label="Type">
                  <Select id="add-type" value={type} onChange={(e) => setType(e.target.value as keyof typeof HOSPITAL_TYPE)} options={options(HOSPITAL_TYPE)} />
                </FormField>
              </div>
            )}
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => close(null)}>Cancel</Button>
              <Button type="submit" disabled={saving}>{copy.button}</Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
  const categoryDialog = (
    <Dialog open={!!catReq} onOpenChange={(o) => !o && closeCategory(null)}>
      <DialogContent className="sm:max-w-md">
        <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); e.stopPropagation(); void submitCategory(); }}>
          <DialogHeader>
            <DialogTitle>Add a new category</DialogTitle>
            <DialogDescription>Diseases are grouped by category on the Diseases page and in reports.</DialogDescription>
          </DialogHeader>
          <FormField id="add-category-name" label="Category" error={catError ?? undefined} required>
            <TextInput id="add-category-name" value={catName} onChange={(e) => setCatName(e.target.value)} autoFocus autoComplete="off" invalid={!!catError} />
          </FormField>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => closeCategory(null)}>Cancel</Button>
            <Button type="submit" disabled={catSaving}>Add category</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
  return { ask, dialog: <>{dialog}{categoryDialog}</> };
}
