"use client";

import { useActionState, type ReactNode } from "react";
import { useFormStatus } from "react-dom";
import clsx from "clsx";
import { buttonClass } from "./ui";

export type ActionState = { error?: string; ok?: string } | undefined;
export type FormAction = (prev: ActionState, data: FormData) => Promise<ActionState>;

/** A form bound to a server action that shows the action's error or success message. */
export function ActionForm({
  action,
  children,
  className,
  confirm,
}: {
  action: FormAction;
  children: ReactNode;
  className?: string;
  confirm?: string;
}) {
  const [state, formAction] = useActionState(action, undefined);
  return (
    <form
      action={formAction}
      className={className}
      onSubmit={(e) => {
        if (confirm && !window.confirm(confirm)) e.preventDefault();
      }}
    >
      {state?.error && (
        <div className="mb-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">
          {state.error}
        </div>
      )}
      {state?.ok && (
        <div className="mb-3 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800" role="status">
          {state.ok}
        </div>
      )}
      {children}
    </form>
  );
}

export function SubmitButton({
  children,
  variant = "primary",
  size = "md",
  className,
  name,
  value,
}: {
  children: ReactNode;
  variant?: "primary" | "secondary" | "danger" | "accent";
  size?: "sm" | "md";
  className?: string;
  name?: string;
  value?: string;
}) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" name={name} value={value} disabled={pending} className={clsx(buttonClass(variant, size), className)}>
      {pending ? "Working…" : children}
    </button>
  );
}
