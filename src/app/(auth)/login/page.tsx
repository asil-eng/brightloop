import Link from "next/link";
import { redirect } from "next/navigation";
import { ActionForm, SubmitButton } from "@/components/form";
import { getCurrentUser, homeFor } from "@/lib/auth";
import { loginAction } from "../actions";

export const metadata = { title: "Log in" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const user = await getCurrentUser();
  if (user) redirect(homeFor(user.role));
  const { next } = await searchParams;
  return (
    <>
      <h1 className="text-2xl font-semibold">Log in</h1>
      <p className="mt-1 text-sm text-zinc-500">Welcome back to Brightloop.</p>
      <ActionForm action={loginAction} className="mt-6 space-y-4">
        <input type="hidden" name="next" value={next ?? ""} />
        <div>
          <label className="label" htmlFor="email">Email</label>
          <input id="email" name="email" type="email" required className="input" autoComplete="email" />
        </div>
        <div>
          <div className="flex items-center justify-between">
            <label className="label" htmlFor="password">Password</label>
            <Link href="/forgot-password" className="mb-1 text-xs link">Forgot password?</Link>
          </div>
          <input id="password" name="password" type="password" required className="input" autoComplete="current-password" />
        </div>
        <SubmitButton className="w-full">Log in</SubmitButton>
      </ActionForm>
      <p className="mt-6 text-sm text-zinc-600">
        New customer? <Link href="/signup" className="link">Create an account</Link>
      </p>
    </>
  );
}
