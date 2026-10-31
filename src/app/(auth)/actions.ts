"use server";

import { redirect } from "next/navigation";
import { rootDb, scopedDb } from "@/lib/db";
import {
  createSession,
  destroySession,
  hashPassword,
  homeFor,
  passwordError,
  randomToken,
  sha256,
  verifyPassword,
} from "@/lib/auth";
import { EMAIL_RE, UserError, required, safeAction, str } from "@/lib/action";
import { appUrl, sendMail } from "@/lib/mail";
import { setUpCompany } from "@/lib/company";

const RESET_HOURS = 1;

export const loginAction = safeAction(async (data) => {
  const email = required(data, "email", "Email").toLowerCase();
  const password = required(data, "password", "Password");
  const user = await rootDb.user.findUnique({ where: { email } });
  if (!user?.passwordHash || !(await verifyPassword(password, user.passwordHash))) {
    throw new UserError("Incorrect email or password.");
  }
  if (!user.active) throw new UserError("This account has been deactivated.");
  await createSession(user.id);
  const next = str(data, "next");
  redirect(next.startsWith("/") && !next.startsWith("//") ? next : homeFor(user.role));
});

/**
 * A business registers to use the system. It gets its own company workspace,
 * and the person registering becomes its administrator.
 */
export const registerCompanyAction = safeAction(async (data) => {
  const companyName = required(data, "company", "Company name");
  const name = required(data, "name", "Your name");
  const email = required(data, "email", "Email").toLowerCase();
  const password = required(data, "password", "Password");
  if (!EMAIL_RE.test(email)) throw new UserError("Enter a valid email address.");
  const pwError = passwordError(password);
  if (pwError) throw new UserError(pwError);
  if (password !== str(data, "confirm")) throw new UserError("The passwords do not match.");

  // One account per email, across the whole platform.
  if (await rootDb.user.findUnique({ where: { email } })) {
    throw new UserError("An account with this email already exists. Try logging in or resetting your password.");
  }

  const { org, admin } = await setUpCompany({ companyName, ownerName: name, ownerEmail: email, passwordHash: await hashPassword(password) });

  await sendMail(scopedDb(org.id), {
    to: email,
    subject: `Welcome to Brightloop, ${companyName}`,
    heading: `Your workspace for ${companyName} is ready`,
    paragraphs: [
      `Hello ${name},`,
      "You're the administrator. Add your products and plans, invite your team and add your customers. Your customers get their own login to see and pay their invoices.",
    ],
    button: { label: "Open my workspace", url: `${appUrl()}/app` },
  });

  await createSession(admin.id);
  redirect("/app");
});

export const forgotPasswordAction = safeAction(async (data) => {
  const email = required(data, "email", "Email").toLowerCase();
  const user = await rootDb.user.findUnique({ where: { email } });
  if (user?.active) {
    const token = randomToken();
    await rootDb.passwordResetToken.create({
      data: { tokenHash: sha256(token), userId: user.id, expiresAt: new Date(Date.now() + RESET_HOURS * 3600_000) },
    });
    await sendMail(scopedDb(user.orgId), {
      to: user.email,
      subject: "Reset your password",
      heading: "Reset your password",
      paragraphs: [
        `Hello ${user.name},`,
        `We received a request to reset your password. This link is valid for ${RESET_HOURS} hour and can be used once.`,
        "If you didn't ask for this, you can ignore this email.",
      ],
      button: { label: "Choose a new password", url: `${appUrl()}/reset-password?token=${token}` },
    });
  }
  // Same answer whether or not the account exists, so emails can't be probed.
  return { ok: "If an account exists for that email, a reset link is on its way. Check your inbox." };
});

/** Used both for "forgot password" and for the set-password link in invitation emails. */
export const resetPasswordAction = safeAction(async (data) => {
  const token = required(data, "token", "Reset link");
  const password = required(data, "password", "Password");
  const pwError = passwordError(password);
  if (pwError) throw new UserError(pwError);
  if (password !== str(data, "confirm")) throw new UserError("The passwords do not match.");

  const record = await rootDb.passwordResetToken.findUnique({ where: { tokenHash: sha256(token) }, include: { user: true } });
  if (!record || record.usedAt || record.expiresAt < new Date()) {
    throw new UserError("This link is invalid or has expired. Please ask for a new one.");
  }
  await rootDb.$transaction([
    rootDb.user.update({ where: { id: record.userId }, data: { passwordHash: await hashPassword(password) } }),
    rootDb.passwordResetToken.update({ where: { id: record.id }, data: { usedAt: new Date() } }),
    // Log out everywhere else after a password change.
    rootDb.session.deleteMany({ where: { userId: record.userId } }),
  ]);
  await createSession(record.userId);
  redirect(homeFor(record.user.role));
});

export async function logoutAction() {
  await destroySession();
  redirect("/login");
}
