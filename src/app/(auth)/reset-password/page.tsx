import Link from "next/link";
import { ActionForm, SubmitButton } from "@/components/form";
import { resetPasswordAction } from "../actions";
import { PasswordWithRules } from "../password-input";

export const metadata = { title: "Set password" };

export default async function ResetPasswordPage({ searchParams }: { searchParams: Promise<{ token?: string; invite?: string }> }) {
  const { token, invite } = await searchParams;
  if (!token) {
    return (
      <p className="text-sm">
        This link is missing its token. <Link href="/forgot-password" className="link">Request a new one</Link>.
      </p>
    );
  }
  return (
    <>
      <h1 className="font-display text-[28px] font-bold tracking-tight text-ink">{invite ? "Set up your account" : "Choose a new password"}</h1>
      <p className="mt-1.5 text-[15px] text-ink-secondary">{invite ? "Pick a password to finish joining the Brightloop team." : "Your new password replaces the old one."}</p>
      <ActionForm action={resetPasswordAction} className="mt-6 space-y-4">
        <input type="hidden" name="token" value={token} />
        <PasswordWithRules label="New password" />
        <div>
          <label className="label" htmlFor="confirm">Confirm password</label>
          <input id="confirm" name="confirm" type="password" required className="input" autoComplete="new-password" />
        </div>
        <SubmitButton className="w-full">Save password</SubmitButton>
      </ActionForm>
    </>
  );
}
