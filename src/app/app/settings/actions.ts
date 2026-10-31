"use server";

import { revalidatePath } from "next/cache";
import type { Role } from "@prisma/client";
import { randomToken, requireAdmin, sha256 } from "@/lib/auth";
import { EMAIL_RE, UserError, bool, int, required, safeAction, str } from "@/lib/action";
import { appUrl, createTransport, sendMail } from "@/lib/mail";
import { seal, unseal } from "@/lib/secret-box";
import { checkKeys, isTestKey } from "@/lib/razorpay";
import { runCompanyJobs } from "@/lib/jobs";
import { rootDb } from "@/lib/db";

const done = (ok: string) => {
  revalidatePath("/app/settings");
  return { ok };
};

export const saveCompany = safeAction(async (data) => {
  const { db, orgId } = await requireAdmin();
  await db.organization.update({
    where: { id: orgId },
    data: {
      name: required(data, "name", "Company name"),
      email: str(data, "email"),
      phone: str(data, "phone"),
      address: str(data, "address"),
      autoConfirmInvoices: bool(data, "autoConfirmInvoices"),
      autoSendInvoices: bool(data, "autoSendInvoices"),
      overdueReminderDays: Math.max(0, int(data, "overdueReminderDays", 3)),
      renewalReminderDays: Math.max(0, int(data, "renewalReminderDays", 7)),
    },
  });
  return done("Settings saved.");
});

export const saveTax = safeAction(async (data) => {
  const { db } = await requireAdmin();
  const rate = Number(str(data, "rate"));
  if (!(rate >= 0 && rate <= 100)) throw new UserError("The tax rate must be between 0 and 100.");
  const fields = { name: required(data, "name", "Tax name"), rate, priceIncluded: bool(data, "priceIncluded"), active: data.has("id") ? bool(data, "active") : true };
  const id = str(data, "id");
  if (id) await db.tax.update({ where: { id }, data: fields });
  else await db.tax.create({ data: fields });
  return done("Tax saved.");
});

export const savePaymentTerm = safeAction(async (data) => {
  const { db } = await requireAdmin();
  const dueDays = int(data, "dueDays", -1);
  if (dueDays < 0) throw new UserError("Due days must be zero or more.");
  const fields = { name: required(data, "name", "Name"), dueDays };
  const id = str(data, "id");
  if (id) await db.paymentTerm.update({ where: { id }, data: fields });
  else await db.paymentTerm.create({ data: fields });
  return done("Payment terms saved.");
});

export const addCloseReason = safeAction(async (data) => {
  const { db } = await requireAdmin();
  await db.closeReason.create({ data: { name: required(data, "name", "Reason") } });
  return done("Reason added.");
});

/** Only the admin can add staff: creates the account and emails a set-password link. */
export const inviteStaff = safeAction(async (data) => {
  const { db } = await requireAdmin();
  const email = required(data, "email", "Email").toLowerCase();
  if (!EMAIL_RE.test(email)) throw new UserError("Enter a valid email address.");
  const role = (str(data, "role") || "STAFF") as Role;
  if (role !== "STAFF" && role !== "ADMIN") throw new UserError("Choose a role.");
  // One account per email across the platform.
  if (await rootDb.user.findUnique({ where: { email } })) throw new UserError("An account with this email already exists.");
  const name = required(data, "name", "Name");
  const token = randomToken();
  await db.user.create({
    data: {
      email,
      name,
      role,
      resetTokens: { create: { tokenHash: sha256(token), purpose: "invite", expiresAt: new Date(Date.now() + 72 * 3600_000) } },
    },
  });
  const company = await db.organization.findFirstOrThrow();
  await sendMail(db, {
    to: email,
    subject: `You've been added to ${company.name}`,
    heading: `Join the ${company.name} team`,
    paragraphs: [`Hello ${name},`, `You've been added as ${role === "ADMIN" ? "an administrator" : "a staff member"}. Set your password to get started (link valid for 72 hours).`],
    button: { label: "Set my password", url: `${appUrl()}/reset-password?token=${token}&invite=1` },
    kind: "account",
  });
  return done(`Invitation sent to ${email}.`);
});

export const toggleUser = safeAction(async (data) => {
  const admin = await requireAdmin();
  const { db } = admin;
  const id = required(data, "id", "User");
  if (id === admin.id) throw new UserError("You can't deactivate your own account.");
  const u = await db.user.findUniqueOrThrow({ where: { id } });
  await db.user.update({ where: { id }, data: { active: !u.active } });
  if (u.active) await db.session.deleteMany({ where: { userId: id } });
  return done(u.active ? "User deactivated." : "User reactivated.");
});

export const runJobsNow = safeAction(async () => {
  const { db } = await requireAdmin();
  const results = await runCompanyJobs(db);
  const summary = results.map((r) => `${r.name}: ${r.count}${r.errors.length ? ` (${r.errors.length} error${r.errors.length > 1 ? "s" : ""}: ${r.errors.slice(0, 2).join("; ")})` : ""}`).join(" · ");
  revalidatePath("/app", "layout");
  return { ok: `Done. ${summary}` };
});

/**
 * Connect the company's own email account. The connection is tested and a test
 * email is sent to the admin before anything is saved; the password is encrypted.
 */
export const saveEmailSettings = safeAction(async (data) => {
  const admin = await requireAdmin();
  const { db } = admin;
  const org = await db.organization.findFirstOrThrow();
  const host = required(data, "smtpHost", "Mail server").toLowerCase();
  const port = int(data, "smtpPort", 465);
  const user = required(data, "smtpUser", "Username");
  const from = (str(data, "smtpFrom") || user).toLowerCase();
  if (!EMAIL_RE.test(from)) throw new UserError("Enter a valid sender email address.");
  if (![25, 465, 587, 2525].includes(port)) throw new UserError("Use port 465 (SSL) or 587 (STARTTLS).");
  // Leaving the password empty keeps the saved one.
  const typed = str(data, "smtpPass").replace(/\s+/g, "");
  const pass = typed || (org.smtpPassword ? unseal(org.smtpPassword) : "");
  if (!pass) throw new UserError("Enter the password (for Gmail, an app password).");

  try {
    const transport = createTransport({ host, port, user, pass });
    await transport.verify();
    await transport.sendMail({
      from: `"${org.name.replace(/["\\]/g, "")}" <${from}>`,
      to: admin.email,
      subject: `${org.name}: your email is connected`,
      text: `This is a test from Brightloop. Invoices and customer emails for ${org.name} will now be sent from ${from}.`,
    });
  } catch (e) {
    const reason = e instanceof Error ? e.message : String(e);
    throw new UserError(`Couldn't connect: ${reason.slice(0, 200)}. Check the server, port, username and password.`);
  }

  await db.organization.update({
    where: { id: org.id },
    data: { smtpHost: host, smtpPort: port, smtpUser: user, smtpPassword: seal(pass), smtpFrom: from, emailConnectedAt: new Date() },
  });
  return done(`Connected. A test email was sent to ${admin.email}.`);
});

export const disconnectEmail = safeAction(async () => {
  const { db, orgId } = await requireAdmin();
  await db.organization.update({
    where: { id: orgId },
    data: { smtpHost: "", smtpUser: "", smtpPassword: "", smtpFrom: "", emailConnectedAt: null },
  });
  return done("Email disconnected. Customer emails won't be sent until you connect again.");
});

/** Connect the company's own Razorpay account (test keys only); the keys are checked with Razorpay first. */
export const savePaymentSettings = safeAction(async (data) => {
  const { db, orgId } = await requireAdmin();
  const org = await db.organization.findFirstOrThrow();
  const keyId = required(data, "keyId", "Key ID");
  if (!isTestKey(keyId)) {
    throw new UserError("Use a Razorpay test key (it starts with rzp_test_). This prototype never takes real money.");
  }
  const typed = str(data, "keySecret");
  const keySecret = typed || (org.razorpayKeySecret && keyId === org.razorpayKeyId ? unseal(org.razorpayKeySecret) : "");
  if (!keySecret) throw new UserError("Enter the key secret.");
  try {
    await checkKeys({ keyId, keySecret });
  } catch (e) {
    throw new UserError(`Razorpay didn't accept these keys: ${e instanceof Error ? e.message : String(e)}`);
  }
  await db.organization.update({ where: { id: orgId }, data: { razorpayKeyId: keyId, razorpayKeySecret: seal(keySecret), razorpayConnectedAt: new Date() } });
  return done("Razorpay connected. Customers can now pay invoices online with Razorpay (test mode).");
});

export const disconnectPayments = safeAction(async () => {
  const { db, orgId } = await requireAdmin();
  await db.organization.update({ where: { id: orgId }, data: { razorpayKeyId: "", razorpayKeySecret: "", razorpayConnectedAt: null } });
  return done("Razorpay disconnected. Customers will see the demo checkout.");
});
