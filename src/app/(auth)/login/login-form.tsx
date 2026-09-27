"use client";

import { useActionState } from "react";
import { FormField, TextInput } from "@/components/app/inputs";
import { Button } from "@/components/ui/button";
import { loginAction } from "./actions";

export function LoginForm() {
  const [state, formAction, pending] = useActionState(loginAction, null);
  return (
    <form action={formAction} className="space-y-4">
      <h2 className="text-h3 text-navy-900">Sign in</h2>
      <FormField id="email" label="Email">
        <TextInput id="email" name="email" type="email" autoComplete="username" required autoFocus />
      </FormField>
      <FormField id="password" label="Password">
        <TextInput id="password" name="password" type="password" autoComplete="current-password" required />
      </FormField>
      {state?.error && <p role="alert" className="rounded-control bg-rejected-bg px-3 py-2 text-ui text-rejected">{state.error}</p>}
      <Button type="submit" className="h-10 w-full" disabled={pending}>
        {pending ? "Signing in…" : "Sign in"}
      </Button>
    </form>
  );
}
