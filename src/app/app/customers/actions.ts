"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { randomToken, requireBackoffice, sha256 } from "@/lib/auth";
import { EMAIL_RE, UserError, required, safeAction, str } from "@/lib/action";
import { logActivity } from "@/lib/activity";
import { appUrl, sendMail } from "@/lib/mail";

function readCustomer(data: FormData) {
  const email = required(data, "email", "Email").toLowerCase();
  if (!EMAIL_RE.test(email)) throw new UserError("Enter a valid email address.");
  return {
    name: required(data, "name", "Name"),
    email,
    phone: str(data, "phone"),
    company: str(data, "company"),
    address: str(data, "address"),
    taxId: str(data, "taxId"),
  };
}

export const createCustomer = safeAction(async (data) => {
  const user = await requireBackoffice();
  const c = await db.customer.create({ data: readCustomer(data) });
  await logActivity("customer", c.id, "Customer created.", user.id);
  redirect(`/app/customers/${c.id}`);
});

export const updateCustomer = safeAction(async (data) => {
  const user = await requireBackoffice();
  const id = required(data, "id", "Customer");
  const values = readCustomer(data);
  const current = await db.customer.findUniqueOrThrow({ where: { id } });
  if (current.userId && values.email !== current.email) {
    if (await db.user.findFirst({ where: { email: values.email, NOT: { id: current.userId } } })) {
      throw new UserError("Another account already uses this email.");
    }
    await db.user.update({ where: { id: current.userId }, data: { email: values.email } });
  }
  await db.customer.update({ where: { id }, data: values });
  await logActivity("customer", id, "Customer details updated.", user.id);
  revalidatePath(`/app/customers/${id}`);
  return { ok: "Customer saved." };
});

/** Give a customer contact a portal login: creates the account and emails a set-password link. */
export const inviteToPortal = safeAction(async (data) => {
  const staff = await requireBackoffice();
  const id = required(data, "id", "Customer");
  const c = await db.customer.findUniqueOrThrow({ where: { id } });
  if (c.userId) throw new UserError("This customer already has portal access.");
  if (await db.user.findUnique({ where: { email: c.email } })) throw new UserError("An account with this email already exists.");

  const token = randomToken();
  await db.$transaction(async (tx) => {
    const u = await tx.user.create({ data: { email: c.email, name: c.name, role: "CUSTOMER" } });
    await tx.customer.update({ where: { id }, data: { userId: u.id } });
    await tx.passwordResetToken.create({
      data: { tokenHash: sha256(token), userId: u.id, purpose: "invite", expiresAt: new Date(Date.now() + 72 * 3600_000) },
    });
  });
  await sendMail({
    to: c.email,
    subject: "Your Brightloop customer portal",
    heading: "You're invited to the customer portal",
    paragraphs: [`Hello ${c.name},`, "See your subscriptions, download invoices and pay online. Set a password to get started (link valid for 72 hours)."],
    button: { label: "Set my password", url: `${appUrl()}/reset-password?token=${token}&invite=1` },
    entity: { type: "customer", id },
  });
  await logActivity("customer", id, "Invited to the customer portal.", staff.id);
  revalidatePath(`/app/customers/${id}`);
  return { ok: `Invitation sent to ${c.email}.` };
});
