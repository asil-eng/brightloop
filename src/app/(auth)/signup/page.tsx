import Link from "next/link";
import { ActionForm, SubmitButton } from "@/components/form";
import { signupAction } from "../actions";
import { PasswordWithRules } from "../password-input";

export const metadata = { title: "Create account" };

export default function SignupPage() {
  return (
    <>
      <h1 className="text-2xl font-semibold">Create your account</h1>
      <p className="mt-1 text-sm text-zinc-500">See and manage your subscriptions and invoices.</p>
      <ActionForm action={signupAction} className="mt-6 space-y-4">
        <div>
          <label className="label" htmlFor="name">Full name</label>
          <input id="name" name="name" required className="input" autoComplete="name" />
        </div>
        <div>
          <label className="label" htmlFor="company">Company (optional)</label>
          <input id="company" name="company" className="input" autoComplete="organization" />
        </div>
        <div>
          <label className="label" htmlFor="email">Email</label>
          <input id="email" name="email" type="email" required className="input" autoComplete="email" />
        </div>
        <PasswordWithRules />
        <div>
          <label className="label" htmlFor="confirm">Confirm password</label>
          <input id="confirm" name="confirm" type="password" required className="input" autoComplete="new-password" />
        </div>
        <SubmitButton className="w-full">Create account</SubmitButton>
      </ActionForm>
      <p className="mt-6 text-sm text-zinc-600">
        Already have an account? <Link href="/login" className="link">Log in</Link>
      </p>
    </>
  );
}
