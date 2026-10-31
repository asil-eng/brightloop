import { unstable_rethrow } from "next/navigation";
import { Prisma } from "@prisma/client";
import type { ActionState } from "@/components/form";
import { BillingError } from "./billing";

/** An error whose message is safe to show to the user. */
export class UserError extends Error {}

/**
 * Wrap a server action so expected failures come back as `{ error }` for the form
 * to display, while redirects and notFound() still work.
 */
export function safeAction(fn: (data: FormData) => Promise<ActionState | void>) {
  return async (_prev: ActionState, data: FormData): Promise<ActionState> => {
    try {
      return (await fn(data)) ?? undefined;
    } catch (e) {
      unstable_rethrow(e);
      if (e instanceof UserError || e instanceof BillingError) return { error: e.message };
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
        return { error: "A record with this value already exists." };
      }
      console.error(e);
      return { error: "Something went wrong. Please try again." };
    }
  };
}

export function str(data: FormData, key: string): string {
  const v = data.get(key);
  return typeof v === "string" ? v.trim() : "";
}

export function required(data: FormData, key: string, label: string): string {
  const v = str(data, key);
  if (!v) throw new UserError(`${label} is required.`);
  return v;
}

export function int(data: FormData, key: string, fallback = 0): number {
  const v = Number(str(data, key));
  return Number.isFinite(v) && str(data, key) !== "" ? Math.trunc(v) : fallback;
}

export function bool(data: FormData, key: string): boolean {
  return data.get(key) === "on" || data.get(key) === "true";
}

export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export { owned, ownedOne } from "./owned";
