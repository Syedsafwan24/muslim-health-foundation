"use client";

import { useActionState } from "react";
import { FormField, TextInput } from "@/components/app/inputs";
import { Button } from "@/components/ui/button";
import { changePasswordAction } from "./actions";

export function PasswordForm() {
  const [state, formAction, pending] = useActionState(changePasswordAction, null);
  const err = (k: string) => state?.fieldErrors?.[k]?.[0];
  return (
    <form action={formAction} className="space-y-4">
      <FormField id="current" label="Current password" required error={err("current")}>
        <TextInput id="current" name="current" type="password" autoComplete="current-password" required autoFocus />
      </FormField>
      <FormField id="next" label="New password" required hint="At least 10 characters." error={err("next")}>
        <TextInput id="next" name="next" type="password" autoComplete="new-password" minLength={10} required />
      </FormField>
      <FormField id="confirm" label="Confirm new password" required error={err("confirm")}>
        <TextInput id="confirm" name="confirm" type="password" autoComplete="new-password" required />
      </FormField>
      {state?.error && <p role="alert" className="rounded-control bg-rejected-bg px-3 py-2 text-ui text-rejected">{state.error}</p>}
      <Button type="submit" className="h-10" disabled={pending}>
        {pending ? "Saving…" : "Change password"}
      </Button>
    </form>
  );
}
