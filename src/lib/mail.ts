import nodemailer from "nodemailer";
import type { Organization } from "@prisma/client";
import { rootDb, type Db } from "./db";
import { unseal } from "./secret-box";

type Attachment = { filename: string; content: Buffer | Uint8Array; contentType?: string };

/**
 * company: to the company's customers (logins, quotes, invoices, receipts, reminders).
 *          Sent only through the company's own connected email account.
 * account: password resets, welcome and staff-invite emails. Sent by the platform
 *          sender (SMTP_* env), with daily caps so it can't be used for spam.
 */
export type MailKind = "company" | "account";

type SendOptions = {
  to: string;
  subject: string;
  heading: string;
  paragraphs: string[];
  button?: { label: string; url: string };
  attachments?: Attachment[];
  entity?: { type: string; id: string };
  kind?: MailKind;
};

/** Platform-wide cap on account emails per day, and per recipient. */
const PLATFORM_DAILY_LIMIT = Number(process.env.PLATFORM_EMAIL_DAILY_LIMIT ?? 200);
const PER_RECIPIENT_DAILY_LIMIT = 10;

export const appUrl = () =>
  process.env.APP_URL ||
  (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : "http://localhost:3000");

/** Outside production, emails that can't be sent are printed to the console so local demos work. */
const devConsole = () => (process.env.EMAIL_DEV_CONSOLE ?? (process.env.NODE_ENV === "production" ? "0" : "1")) === "1";

export type SmtpSettings = { host: string; port: number; user: string; pass: string };

export function createTransport(s: SmtpSettings) {
  return nodemailer.createTransport({
    host: s.host,
    port: s.port,
    secure: s.port === 465,
    auth: { user: s.user, pass: s.pass },
    connectionTimeout: 15_000,
    greetingTimeout: 15_000,
  });
}

export function companyEmailConnected(org: Pick<Organization, "smtpHost" | "smtpUser" | "smtpPassword">) {
  return Boolean(org.smtpHost && org.smtpUser && org.smtpPassword);
}

function platformSettings(): SmtpSettings | null {
  const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS } = process.env;
  if (!SMTP_HOST || !SMTP_USER || !SMTP_PASS) return null;
  return { host: SMTP_HOST, port: Number(SMTP_PORT ?? 587), user: SMTP_USER, pass: SMTP_PASS };
}

function escapeHtml(s: string) {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

function renderHtml(o: SendOptions, companyName: string) {
  const body = o.paragraphs.map((p) => `<p style="margin:0 0 14px;line-height:1.5">${escapeHtml(p)}</p>`).join("");
  const button = o.button
    ? `<p style="margin:24px 0"><a href="${escapeHtml(o.button.url)}" style="background:#074ce0;color:#fff;padding:12px 20px;border-radius:6px;text-decoration:none;font-weight:600">${escapeHtml(o.button.label)}</a></p>`
    : "";
  return `<div style="font-family:Arial,Helvetica,sans-serif;background:#f3f4f6;padding:24px">
  <div style="max-width:560px;margin:0 auto;background:#fff;border-radius:12px;overflow:hidden;border:1px solid #dde0e6">
    <div style="background:#16191f;color:#fcfcfd;padding:16px 24px;font-weight:700;font-size:18px">${escapeHtml(companyName)}</div>
    <div style="padding:24px;color:#16191f">
      <h2 style="margin:0 0 16px;font-size:20px">${escapeHtml(o.heading)}</h2>
      ${body}${button}
    </div>
  </div>
</div>`;
}

const quote = (name: string) => `"${name.replace(/["\\]/g, "")}"`;

/** Why an account email can't go out right now, or null if it can. */
async function accountLimitReason(to: string): Promise<string | null> {
  const since = new Date(Date.now() - 86_400_000);
  const [total, toRecipient] = await Promise.all([
    rootDb.emailLog.count({ where: { kind: "account", status: "sent", createdAt: { gte: since } } }),
    rootDb.emailLog.count({ where: { kind: "account", to, createdAt: { gte: since } } }),
  ]);
  if (total >= PLATFORM_DAILY_LIMIT) return "Platform daily email limit reached.";
  if (toRecipient >= PER_RECIPIENT_DAILY_LIMIT) return "Too many emails to this address today.";
  return null;
}

/**
 * Send an email and record it in the company's email log. Never throws: an email
 * that can't be sent is logged with the reason, instead of breaking the action.
 * Returns true only if the email was handed to a mail server (or printed in dev).
 */
export async function sendMail(db: Db, o: SendOptions): Promise<boolean> {
  const kind = o.kind ?? "company";
  const company = await db.organization.findFirstOrThrow();
  const html = renderHtml(o, company.name);
  const text = [o.heading, "", ...o.paragraphs, o.button ? `${o.button.label}: ${o.button.url}` : ""].join("\n");

  let settings: SmtpSettings | null = null;
  let from = "";
  let replyTo: string | undefined;
  let blocked: string | null = null;

  if (kind === "company") {
    if (companyEmailConnected(company)) {
      settings = { host: company.smtpHost, port: company.smtpPort, user: company.smtpUser, pass: unseal(company.smtpPassword) };
      from = `${quote(company.name)} <${company.smtpFrom || company.smtpUser}>`;
    } else {
      blocked = "Company email is not connected (Settings → Email).";
    }
  } else {
    settings = platformSettings();
    from = `${quote(`${company.name} via Brightloop`)} <${process.env.MAIL_FROM_ADDRESS || process.env.SMTP_USER}>`;
    replyTo = company.email || undefined;
    blocked = settings ? await accountLimitReason(o.to) : "Platform email is not configured.";
  }

  let status: string;
  let error = "";
  if (blocked && devConsole()) {
    console.log(`\n📧 [email:dev] (${kind}) To: ${o.to}\nSubject: ${o.subject}\n${text}\n`);
    status = "logged";
  } else if (blocked || !settings) {
    status = "not_sent";
    error = blocked ?? "Not configured.";
  } else {
    status = "failed";
    const transport = createTransport(settings);
    for (let attempt = 1; attempt <= 2 && status !== "sent"; attempt++) {
      try {
        await transport.sendMail({
          from,
          replyTo,
          to: o.to,
          subject: o.subject,
          html,
          text,
          attachments: o.attachments?.map((a) => ({ ...a, content: Buffer.from(a.content) })),
        });
        status = "sent";
        error = "";
      } catch (e) {
        error = e instanceof Error ? e.message : String(e);
      }
    }
  }

  await db.emailLog.create({
    data: { to: o.to, subject: o.subject, status, error: error.slice(0, 500), kind, entityType: o.entity?.type, entityId: o.entity?.id },
  });
  return status === "sent" || status === "logged";
}
