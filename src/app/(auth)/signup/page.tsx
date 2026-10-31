import Link from "next/link";
import { ActionForm, SubmitButton } from "@/components/form";
import { registerCompanyAction } from "../actions";
import { PasswordWithRules } from "../password-input";

export const metadata = { title: "Register your business" };

export default function SignupPage() {
  return (
    <>
      <h1 className="text-2xl font-semibold">Register your business</h1>
      <p className="mt-1 text-sm text-zinc-500">Set up your company and start managing subscriptions and recurring billing.</p>
      <ActionForm action={registerCompanyAction} className="mt-6 space-y-4">
        <div>
          <label className="label" htmlFor="company">Company name</label>
          <input id="company" name="company" required className="input" autoComplete="organization" placeholder="e.g. Brightloop Software" />
        </div>
        <div>
          <label className="label" htmlFor="name">Your name</label>
          <input id="name" name="name" required className="input" autoComplete="name" />
        </div>
        <div>
          <label className="label" htmlFor="email">Work email</label>
          <input id="email" name="email" type="email" required className="input" autoComplete="email" />
        </div>
        <PasswordWithRules />
        <div>
          <label className="label" htmlFor="confirm">Confirm password</label>
          <input id="confirm" name="confirm" type="password" required className="input" autoComplete="new-password" />
        </div>
        <SubmitButton className="w-full">Create company account</SubmitButton>
        <p className="text-xs text-zinc-500">You&apos;ll be the administrator. You can invite your team and add your customers afterwards.</p>
      </ActionForm>
      <p className="mt-6 text-sm text-zinc-600">
        Already registered? <Link href="/login" className="link">Log in</Link>
      </p>
    </>
  );
}
