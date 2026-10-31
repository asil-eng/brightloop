import nodemailer, { type Transporter } from "nodemailer";
import type { Db } from "./db";

type Attachment = { filename: string; content: Buffer | Uint8Array; contentType?: string };

type SendOptions = {
  to: string;
  subject: string;
  heading: string;
  paragraphs: string[];
  button?: { label: string; url: string };
  attachments?: Attachment[];
  entity?: { type: string; id: string };
};

export const appUrl = () => process.env.APP_URL ?? "http://localhost:3000";

let transporter: Transporter | null = null;
function getTransporter() {
  if (!process.env.SMTP_HOST) return null;
  if (!transporter) {
    const port = Number(process.env.SMTP_PORT ?? 587);
    transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port,
      secure: port === 465,
      auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } : undefined,
    });
  }
  return transporter;
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
    <div style="padding:24px;color:#222">
      <h2 style="margin:0 0 16px;font-size:20px">${escapeHtml(o.heading)}</h2>
      ${body}${button}
    </div>
  </div>
</div>`;
}

/**
 * Send an email and record it in the email log. Never throws: a failed email is
 * logged with its error so staff can see it, instead of breaking the action.
 * Without SMTP settings the email is printed to the server console (dev mode).
 */
export async function sendMail(db: Db, o: SendOptions): Promise<boolean> {
  // Emails go out under the sending company's name, with replies going to its own address.
  const company = await db.organization.findFirstOrThrow();
  const html = renderHtml(o, company.name);
  const text = [o.heading, "", ...o.paragraphs, o.button ? `${o.button.label}: ${o.button.url}` : ""].join("\n");
  const from = `"${company.name.replace(/"/g, "")}" <${process.env.MAIL_FROM_ADDRESS ?? "billing@brightloop.test"}>`;
  const replyTo = company.email || undefined;

  let status = "sent";
  let error = "";
  const t = getTransporter();
  if (!t) {
    console.log(`\n📧 [email:dev] To: ${o.to}\nSubject: ${o.subject}\n${text}\n`);
  } else {
    for (let attempt = 1; attempt <= 2; attempt++) {
      try {
        await t.sendMail({
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
        break;
      } catch (e) {
        status = "failed";
        error = e instanceof Error ? e.message : String(e);
      }
    }
  }

  await db.emailLog.create({
    data: { to: o.to, subject: o.subject, status, error, entityType: o.entity?.type, entityId: o.entity?.id },
  });
  return status === "sent";
}
