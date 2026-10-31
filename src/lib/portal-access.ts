import "server-only";
import type { Customer } from "@prisma/client";
import { rootDb, type Db } from "./db";
import { randomToken, sha256 } from "./auth";
import { appUrl, sendMail } from "./mail";
import { logActivity } from "./activity";

const INVITE_HOURS = 72;

/**
 * Give a customer their portal login: create the account (if needed) and email a
 * one-time link to set their password. Customers never sign up themselves.
 * Returns a message for staff, plus the link itself when it couldn't be emailed
 * (e.g. the company hasn't connected its email yet) so staff can share it.
 * Throws if the email already belongs to another account.
 */
export async function sendPortalInvite(db: Db, customer: Customer, invitedBy?: string | null): Promise<{ message: string; link?: string }> {
  let userId = customer.userId;
  if (!userId) {
    // One account per email across the platform.
    const existing = await rootDb.user.findUnique({ where: { email: customer.email } });
    if (existing) throw new Error("EMAIL_TAKEN");
    const user = await db.user.create({ data: { email: customer.email, name: customer.name, role: "CUSTOMER" } });
    await db.customer.update({ where: { id: customer.id }, data: { userId: user.id } });
    userId = user.id;
  } else {
    const user = await db.user.findUniqueOrThrow({ where: { id: userId } });
    if (user.passwordHash) return { message: "This customer already has portal access." };
  }

  const token = randomToken();
  // Older links stop working when a new one is sent.
  await rootDb.passwordResetToken.updateMany({ where: { userId, usedAt: null }, data: { usedAt: new Date() } });
  await rootDb.passwordResetToken.create({
    data: { tokenHash: sha256(token), userId, purpose: "invite", expiresAt: new Date(Date.now() + INVITE_HOURS * 3600_000) },
  });
  const company = await db.organization.findFirstOrThrow();
  const link = `${appUrl()}/reset-password?token=${token}&invite=1`;
  const sent = await sendMail(db, {
    to: customer.email,
    subject: `Your ${company.name} customer account`,
    heading: "Your customer account is ready",
    paragraphs: [
      `Hello ${customer.name},`,
      `${company.name} has created an account for you. You can see your subscriptions, download invoices and pay online.`,
      `Your login email is ${customer.email}. Click the button to choose your password and log in (link valid for ${INVITE_HOURS} hours).`,
    ],
    button: { label: "Set my password & log in", url: link },
    entity: { type: "customer", id: customer.id },
  });
  if (!sent) {
    await logActivity(db, "customer", customer.id, "Login link created (not emailed: company email not connected).", invitedBy);
    return { message: `Your company email isn't connected, so nothing was emailed. Send this one-time login link to ${customer.email} yourself (valid for ${INVITE_HOURS} hours):`, link };
  }
  await logActivity(db, "customer", customer.id, `Login details emailed to ${customer.email}.`, invitedBy);
  return { message: `Login details sent to ${customer.email}.` };
}
