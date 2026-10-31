"use server";

import { redirect } from "next/navigation";
import { db } from "@/lib/db";
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

const RESET_HOURS = 1;

export const loginAction = safeAction(async (data) => {
  const email = required(data, "email", "Email").toLowerCase();
  const password = required(data, "password", "Password");
  const user = await db.user.findUnique({ where: { email } });
  if (!user?.passwordHash || !(await verifyPassword(password, user.passwordHash))) {
    throw new UserError("Incorrect email or password.");
  }
  if (!user.active) throw new UserError("This account has been deactivated.");
  await createSession(user.id);
  const next = str(data, "next");
  redirect(next.startsWith("/") && !next.startsWith("//") ? next : homeFor(user.role));
});

export const signupAction = safeAction(async (data) => {
  const name = required(data, "name", "Name");
  const email = required(data, "email", "Email").toLowerCase();
  const password = required(data, "password", "Password");
  if (!EMAIL_RE.test(email)) throw new UserError("Enter a valid email address.");
  const pwError = passwordError(password);
  if (pwError) throw new UserError(pwError);
  if (password !== str(data, "confirm")) throw new UserError("The passwords do not match.");

  // One account per email.
  if (await db.user.findUnique({ where: { email } })) {
    throw new UserError("An account with this email already exists. Try logging in or resetting your password.");
  }

  const user = await db.$transaction(async (tx) => {
    const u = await tx.user.create({
      data: { email, name, role: "CUSTOMER", passwordHash: await hashPassword(password) },
    });
    // Link to an existing contact the team already created for this email, or make one.
    const existing = await tx.customer.findFirst({ where: { email, userId: null } });
    if (existing) {
      await tx.customer.update({ where: { id: existing.id }, data: { userId: u.id } });
    } else {
      await tx.customer.create({
        data: { name, email, company: str(data, "company"), userId: u.id },
      });
    }
    return u;
  });

  await sendMail({
    to: email,
    subject: "Welcome to Brightloop",
    heading: `Welcome, ${name}!`,
    paragraphs: [
      "Your account is ready. From your portal you can see your subscriptions, download invoices and pay online.",
    ],
    button: { label: "Open my portal", url: `${appUrl()}/portal` },
  });

  await createSession(user.id);
  redirect("/portal");
});

export const forgotPasswordAction = safeAction(async (data) => {
  const email = required(data, "email", "Email").toLowerCase();
  const user = await db.user.findUnique({ where: { email } });
  if (user?.active) {
    const token = randomToken();
    await db.passwordResetToken.create({
      data: { tokenHash: sha256(token), userId: user.id, expiresAt: new Date(Date.now() + RESET_HOURS * 3600_000) },
    });
    await sendMail({
      to: user.email,
      subject: "Reset your Brightloop password",
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

export const resetPasswordAction = safeAction(async (data) => {
  const token = required(data, "token", "Reset link");
  const password = required(data, "password", "Password");
  const pwError = passwordError(password);
  if (pwError) throw new UserError(pwError);
  if (password !== str(data, "confirm")) throw new UserError("The passwords do not match.");

  const record = await db.passwordResetToken.findUnique({ where: { tokenHash: sha256(token) }, include: { user: true } });
  if (!record || record.usedAt || record.expiresAt < new Date()) {
    throw new UserError("This link is invalid or has expired. Please request a new one.");
  }
  await db.$transaction([
    db.user.update({ where: { id: record.userId }, data: { passwordHash: await hashPassword(password) } }),
    db.passwordResetToken.update({ where: { id: record.id }, data: { usedAt: new Date() } }),
    // Log out everywhere else after a password change.
    db.session.deleteMany({ where: { userId: record.userId } }),
  ]);
  await createSession(record.userId);
  redirect(homeFor(record.user.role));
});

export async function logoutAction() {
  await destroySession();
  redirect("/login");
}
