import { requireAdmin } from "@/lib/auth";
import { formatDateTime } from "@/lib/dates";
import { Badge, Card, Field, PageHeader } from "@/components/ui";
import { ActionForm, SubmitButton } from "@/components/form";
import { companyEmailConnected } from "@/lib/mail";
import { disconnectEmail, disconnectPayments, saveEmailSettings, savePaymentSettings, addCloseReason, inviteStaff, runJobsNow, saveCompany, savePaymentTerm, saveTax, toggleUser } from "./actions";

export const metadata = { title: "Settings" };

const EMAIL_STATUS: Record<string, React.ReactNode> = {
  sent: <Badge status="PAID" label="Sent" />,
  logged: <Badge status="DRAFT" label="Dev console" />,
  not_sent: <Badge status="PAUSED" label="Not sent" />,
  failed: <Badge status="CANCELLED" label="Failed" />,
};

export default async function SettingsPage() {
  const me = await requireAdmin();
  const { db } = me;
  const [company, taxes, terms, reasons, staff, emails] = await Promise.all([
    db.organization.findFirst(),
    db.tax.findMany({ orderBy: { name: "asc" } }),
    db.paymentTerm.findMany({ orderBy: { dueDays: "asc" } }),
    db.closeReason.findMany({ orderBy: { name: "asc" } }),
    db.user.findMany({ where: { role: { in: ["ADMIN", "STAFF"] } }, orderBy: [{ role: "asc" }, { name: "asc" }] }),
    db.emailLog.findMany({ orderBy: { createdAt: "desc" }, take: 15 }),
  ]);
  const connected = company ? companyEmailConnected(company) : false;

  return (
    <>
      <PageHeader title="Settings" subtitle="Company, invoicing, taxes, staff and automation." />
      <div className="grid gap-5 xl:grid-cols-2">
        <Card title="Company & invoicing">
          <ActionForm action={saveCompany} className="grid gap-4 sm:grid-cols-2">
            <Field label="Company name"><input name="name" defaultValue={company?.name} required className="input" /></Field>
            <Field label="Billing email"><input name="email" type="email" defaultValue={company?.email} className="input" /></Field>
            <Field label="Phone"><input name="phone" defaultValue={company?.phone} className="input" /></Field>
            <Field label="Currency"><input value={company?.currency ?? "INR"} disabled className="input" /></Field>
            <Field label="Address" className="sm:col-span-2"><textarea name="address" rows={2} defaultValue={company?.address} className="input" /></Field>
            <label className="flex items-start gap-2 text-sm sm:col-span-2">
              <input type="checkbox" name="autoConfirmInvoices" defaultChecked={company?.autoConfirmInvoices} className="mt-0.5" />
              <span><span className="font-medium">Confirm invoices automatically</span><span className="block text-xs text-ink-secondary">Off: billing day creates drafts for the team to review.</span></span>
            </label>
            <label className="flex items-start gap-2 text-sm sm:col-span-2">
              <input type="checkbox" name="autoSendInvoices" defaultChecked={company?.autoSendInvoices} className="mt-0.5" />
              <span><span className="font-medium">Email invoices automatically</span><span className="block text-xs text-ink-secondary">Sends each confirmed invoice with its PDF and a pay-online link.</span></span>
            </label>
            <Field label="Overdue reminder after (days)"><input name="overdueReminderDays" type="number" min="0" defaultValue={company?.overdueReminderDays} className="input" /></Field>
            <Field label="Renewal reminder before (days)"><input name="renewalReminderDays" type="number" min="0" defaultValue={company?.renewalReminderDays} className="input" /></Field>
            <div className="sm:col-span-2"><SubmitButton>Save settings</SubmitButton></div>
          </ActionForm>
        </Card>

        <div id="email" className="scroll-mt-6">
          <Card title="Email">
            <p className="text-sm text-ink-secondary">
              Invoices, quotations, receipts, reminders and customer logins are sent from <strong className="font-medium text-ink">your own email account</strong>,
              so they come from your address and replies reach you.
            </p>
            {connected ? (
              <div className="mt-3 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900">
                ✓ Connected. Sending from <strong className="font-medium">{company?.smtpFrom}</strong> via {company?.smtpHost}
                {company?.emailConnectedAt ? ` since ${formatDateTime(company.emailConnectedAt)}` : ""}.
              </div>
            ) : (
              <div className="mt-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
                Not connected. Customer emails are not sent until you connect an account. You can still share customer login links by hand.
              </div>
            )}
            <ActionForm action={saveEmailSettings} className="mt-4 grid gap-4 sm:grid-cols-2">
              <Field label="Mail server (SMTP)" hint="Gmail: smtp.gmail.com · Outlook: smtp.office365.com · Zoho: smtp.zoho.in">
                <input name="smtpHost" defaultValue={company?.smtpHost || "smtp.gmail.com"} required className="input" />
              </Field>
              <Field label="Port" hint="465 (SSL) or 587">
                <input name="smtpPort" type="number" defaultValue={company?.smtpPort ?? 465} required className="input" />
              </Field>
              <Field label="Username" hint="Usually your full email address.">
                <input name="smtpUser" defaultValue={company?.smtpUser} required autoComplete="off" className="input" />
              </Field>
              <Field label="Password" hint={connected ? "Leave empty to keep the saved password." : "For Gmail, create an app password at myaccount.google.com/apppasswords."}>
                <input name="smtpPass" type="password" autoComplete="new-password" placeholder={connected ? "••••••••••••" : ""} className="input" />
              </Field>
              <Field label="Send from" hint="Defaults to the username." className="sm:col-span-2">
                <input name="smtpFrom" type="email" defaultValue={company?.smtpFrom} className="input" />
              </Field>
              <div className="flex flex-wrap items-center gap-3 sm:col-span-2">
                <SubmitButton>{connected ? "Save & send test email" : "Connect & send test email"}</SubmitButton>
                <span className="text-[13px] text-ink-secondary">Your password is stored encrypted.</span>
              </div>
            </ActionForm>
            {connected && (
              <ActionForm action={disconnectEmail} confirm="Disconnect your email? Customer emails will stop until you connect again." className="mt-3">
                <SubmitButton size="sm" variant="danger">Disconnect</SubmitButton>
              </ActionForm>
            )}
          </Card>
        </div>

        <div id="payments" className="scroll-mt-6">
          <Card title="Payments (Razorpay)" actions={<Badge status="PAUSED" label="Test mode" />}>
            <p className="text-sm text-ink-secondary">
              Connect <strong className="font-medium text-ink">your own Razorpay account</strong> so customers can pay invoices online by card,
              UPI or netbanking, straight into your account. Payments are verified with Razorpay before they&apos;re recorded.
            </p>
            {company?.razorpayKeyId ? (
              <div className="mt-3 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900">
                ✓ Connected with key <strong className="font-medium">{company.razorpayKeyId}</strong>
                {company.razorpayConnectedAt ? ` since ${formatDateTime(company.razorpayConnectedAt)}` : ""}.
              </div>
            ) : (
              <div className="mt-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
                Not connected. Customers see the demo checkout instead.
              </div>
            )}
            <ActionForm action={savePaymentSettings} className="mt-4 grid gap-4 sm:grid-cols-2">
              <Field label="Key ID" hint="Razorpay Dashboard → Test Mode → Account & Settings → API Keys.">
                <input name="keyId" defaultValue={company?.razorpayKeyId} placeholder="rzp_test_…" required autoComplete="off" className="input" />
              </Field>
              <Field label="Key secret" hint={company?.razorpayKeyId ? "Leave empty to keep the saved secret." : "Stored encrypted."}>
                <input name="keySecret" type="password" autoComplete="new-password" placeholder={company?.razorpayKeyId ? "••••••••••••" : ""} className="input" />
              </Field>
              <div className="sm:col-span-2">
                <SubmitButton>{company?.razorpayKeyId ? "Save keys" : "Connect Razorpay"}</SubmitButton>
              </div>
            </ActionForm>
            {company?.razorpayKeyId && (
              <ActionForm action={disconnectPayments} confirm="Disconnect Razorpay? Customers will see the demo checkout." className="mt-3">
                <SubmitButton size="sm" variant="danger">Disconnect</SubmitButton>
              </ActionForm>
            )}
          </Card>
        </div>

        <Card title="Automation">
          <p className="text-sm text-ink-secondary">
            Every day the system starts subscriptions that reached their start date, creates and sends invoices for everything due,
            closes or renews expired subscriptions, expires discounts and sends overdue and renewal reminders. It runs on its own
            every day; you can also run it now.
          </p>
          <ActionForm action={runJobsNow} className="mt-4">
            <SubmitButton variant="accent">Run billing &amp; reminders now</SubmitButton>
          </ActionForm>
          <div className="mt-5 border-t border-rule/60 pt-4">
            <p className="label">Recent emails</p>
            <table className="table mt-2">
              <thead><tr><th>When</th><th>To</th><th>Subject</th><th>Status</th></tr></thead>
              <tbody>
                {emails.map((e) => (
                  <tr key={e.id}>
                    <td className="whitespace-nowrap text-xs text-ink-secondary">{formatDateTime(e.createdAt)}</td>
                    <td className="text-xs">{e.to}</td>
                    <td className="text-xs">{e.subject}</td>
                    <td title={e.error}>{EMAIL_STATUS[e.status] ?? <Badge status="DRAFT" label={e.status} />}</td>
                  </tr>
                ))}
                {emails.length === 0 && <tr><td colSpan={4} className="text-sm text-ink-secondary">No emails yet.</td></tr>}
              </tbody>
            </table>
          </div>
        </Card>

        <Card title="Taxes">
          <div className="space-y-2">
            {taxes.map((t) => (
              <ActionForm key={t.id} action={saveTax} className="flex flex-wrap items-center gap-2">
                <input type="hidden" name="id" value={t.id} />
                <input name="name" defaultValue={t.name} className="input w-36" aria-label="Tax name" />
                <input name="rate" type="number" step="0.01" defaultValue={t.rate} className="input w-24" aria-label="Rate %" />
                <span className="text-sm text-ink-secondary">%</span>
                <label className="flex items-center gap-1 text-xs"><input type="checkbox" name="priceIncluded" defaultChecked={t.priceIncluded} /> Included in price</label>
                <label className="flex items-center gap-1 text-xs"><input type="checkbox" name="active" defaultChecked={t.active} /> Active</label>
                <SubmitButton size="sm" variant="secondary">Save</SubmitButton>
              </ActionForm>
            ))}
            <ActionForm action={saveTax} resetOnSuccess className="flex flex-wrap items-center gap-2 border-t border-rule/60 pt-3">
              <input name="name" placeholder="New tax, e.g. IGST 18%" required className="input w-36" />
              <input name="rate" type="number" step="0.01" placeholder="Rate" required className="input w-24" />
              <span className="text-sm text-ink-secondary">%</span>
              <label className="flex items-center gap-1 text-xs"><input type="checkbox" name="priceIncluded" /> Included in price</label>
              <SubmitButton size="sm">Add tax</SubmitButton>
            </ActionForm>
          </div>
        </Card>

        <Card title="Staff & administrators">
          <table className="table">
            <thead><tr><th>Name</th><th>Email</th><th>Role</th><th /></tr></thead>
            <tbody>
              {staff.map((u) => (
                <tr key={u.id}>
                  <td>{u.name}{!u.passwordHash && <span className="ml-1 text-xs text-amber-700">(invited)</span>}</td>
                  <td className="text-ink-secondary">{u.email}</td>
                  <td><Badge status={u.role} /></td>
                  <td className="text-right">
                    {u.id !== me.id && (
                      <ActionForm action={toggleUser}>
                        <input type="hidden" name="id" value={u.id} />
                        <SubmitButton size="sm" variant={u.active ? "danger" : "secondary"}>{u.active ? "Deactivate" : "Reactivate"}</SubmitButton>
                      </ActionForm>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <ActionForm action={inviteStaff} resetOnSuccess className="mt-4 grid gap-2 border-t border-rule/60 pt-4 sm:grid-cols-2">
            <p className="text-sm font-medium sm:col-span-2">Add a team member</p>
            <input name="name" placeholder="Full name" required className="input" />
            <input name="email" type="email" placeholder="Email" required className="input" />
            <select name="role" className="input" defaultValue="STAFF">
              <option value="STAFF">Internal staff (limited access)</option>
              <option value="ADMIN">Administrator (full access)</option>
            </select>
            <SubmitButton>Send invitation</SubmitButton>
          </ActionForm>
        </Card>

        <Card title="Payment terms">
          <div className="space-y-2">
            {terms.map((t) => (
              <ActionForm key={t.id} action={savePaymentTerm} className="flex flex-wrap items-center gap-2">
                <input type="hidden" name="id" value={t.id} />
                <input name="name" defaultValue={t.name} className="input w-48" aria-label="Name" />
                <input name="dueDays" type="number" min="0" defaultValue={t.dueDays} className="input w-24" aria-label="Due days" />
                <span className="text-sm text-ink-secondary">days</span>
                <SubmitButton size="sm" variant="secondary">Save</SubmitButton>
              </ActionForm>
            ))}
            <ActionForm action={savePaymentTerm} resetOnSuccess className="flex flex-wrap items-center gap-2 border-t border-rule/60 pt-3">
              <input name="name" placeholder="e.g. 45 days" required className="input w-48" />
              <input name="dueDays" type="number" min="0" placeholder="Days" required className="input w-24" />
              <SubmitButton size="sm">Add</SubmitButton>
            </ActionForm>
          </div>
        </Card>

        <Card title="Close reasons">
          <ul className="mb-3 flex flex-wrap gap-2">
            {reasons.map((r) => <li key={r.id} className="rounded-full bg-ground-muted px-3 py-1 text-sm">{r.name}</li>)}
          </ul>
          <ActionForm action={addCloseReason} resetOnSuccess className="flex gap-2">
            <input name="name" placeholder="New reason" required className="input" />
            <SubmitButton size="sm">Add</SubmitButton>
          </ActionForm>
        </Card>
      </div>
    </>
  );
}
