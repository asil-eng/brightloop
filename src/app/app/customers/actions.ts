"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireBackoffice } from "@/lib/auth";
import { rootDb } from "@/lib/db";
import { sendPortalInvite } from "@/lib/portal-access";
import { EMAIL_RE, UserError, required, safeAction, str } from "@/lib/action";
import { logActivity } from "@/lib/activity";

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
  const { db } = user;
  const values = readCustomer(data);
  // Every customer gets a portal login, and an email can only have one account.
  if (await rootDb.user.findUnique({ where: { email: values.email } })) {
    throw new UserError("This email already has an account. Use a different email for this customer.");
  }
  const c = await db.customer.create({ data: values });
  await logActivity(db, "customer", c.id, "Customer created.", user.id);
  await sendPortalInvite(db, c, user.id);
  redirect(`/app/customers/${c.id}`);
});

export const updateCustomer = safeAction(async (data) => {
  const user = await requireBackoffice();
  const { db } = user;
  const id = required(data, "id", "Customer");
  const values = readCustomer(data);
  const current = await db.customer.findUniqueOrThrow({ where: { id } });
  if (values.email !== current.email) {
    const taken = await rootDb.user.findUnique({ where: { email: values.email } });
    if (taken && taken.id !== current.userId) throw new UserError("Another account already uses this email.");
    if (current.userId) await db.user.update({ where: { id: current.userId }, data: { email: values.email } });
  }
  await db.customer.update({ where: { id }, data: values });
  await logActivity(db, "customer", id, "Customer details updated.", user.id);
  revalidatePath(`/app/customers/${id}`);
  return { ok: "Customer saved." };
});

/** Email the customer their login link again (or for the first time, for older contacts). */
export const resendLogin = safeAction(async (data) => {
  const staff = await requireBackoffice();
  const { db } = staff;
  const id = required(data, "id", "Customer");
  const c = await db.customer.findUniqueOrThrow({ where: { id } });
  try {
    const ok = await sendPortalInvite(db, c, staff.id);
    revalidatePath(`/app/customers/${id}`);
    return { ok };
  } catch (e) {
    if (e instanceof Error && e.message === "EMAIL_TAKEN") throw new UserError("Another account already uses this email.");
    throw e;
  }
});
