import Link from "next/link";
import { ActionForm, SubmitButton } from "@/components/form";
import { forgotPasswordAction } from "../actions";

export const metadata = { title: "Forgot password" };

export default function ForgotPasswordPage() {
  return (
    <>
      <h1 className="text-2xl font-semibold">Forgot your password?</h1>
      <p className="mt-1 text-sm text-zinc-500">Enter your email and we&apos;ll send you a link to reset it.</p>
      <ActionForm action={forgotPasswordAction} className="mt-6 space-y-4">
        <div>
          <label className="label" htmlFor="email">Email</label>
          <input id="email" name="email" type="email" required className="input" autoComplete="email" />
        </div>
        <SubmitButton className="w-full">Send reset link</SubmitButton>
      </ActionForm>
      <p className="mt-6 text-sm"><Link href="/login" className="link">Back to log in</Link></p>
    </>
  );
}
