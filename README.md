# Brightloop: Subscription Management System

One system to run plans, subscriptions and recurring billing in one place. Built for the **Odoo hackathon** brief
*"Subscription Management System"*. It follows the way **Odoo Subscriptions** works, but is built from scratch.

Brightloop Software sells software on subscription. The admin sets up products, plans, taxes and discounts. Internal staff
handle customers day to day. Customers see and manage their own subscriptions in a portal and pay online.

## Features

| Area | What it does |
|---|---|
| **Accounts & roles** | Sign up (one account per email; password must be **more than 8 characters** with an uppercase letter, a lowercase letter and a special character), log in, **forgot-password email with a one-time reset link**. Three roles: **Admin** (everything), **Internal staff** (day-to-day work, no settings or discounts), **Customer** (portal, own data only). **Only the admin can add staff** (email invitation). Checked on the server for every request. |
| **Products & variants** | Name, type (service / add-on / goods), sales price, cost price, notes, taxes. Attributes with values that add an extra price, e.g. **Brand: Odoo → +₹560**. Variants are generated from every combination. |
| **Recurring plans** | Price, billing period (**daily, weekly, monthly, yearly**, every N), **minimum quantity**, **availability dates**, and per-plan options: **closes automatically**, **can be closed early**, **can be paused**, **can be renewed**. |
| **Quotation templates** | Plan, product lines, **validity in days** and payment terms. One click turns a template into a quotation. |
| **Subscriptions** | Auto number, customer, plan, start/expiry date, payment terms, lines (product, qty, unit price, taxes, amount). Status flow **Draft → Quotation → Confirmed → Active → Closed** (plus Paused) shown as an Odoo-style status bar, with a list view, a Kanban view by status, smart buttons and a chatter. Send quotation, confirm, start, pause, resume, renew, upsell (edit lines), close with a reason. |
| **Billing day** | An hourly job invoices every subscription that is due, catching up on missed periods. Invoices are filled in from the subscription (customer, lines, taxes, discounts, totals), then **confirmed and emailed with a PDF** (configurable). **Never billed twice:** a unique billing key per subscription and period is enforced by the database. **Never skipped:** missed periods are caught up. |
| **Invoices** | **Draft → Confirmed → Paid** (or Cancelled), with *Partially paid* and *Overdue* labels. Confirm, cancel, **send by email**, **print / download PDF**, record payments. Confirmed invoices are locked. |
| **Taxes** | Rules set by the admin (rate, included in or added to the price), calculated automatically on every line. |
| **Discounts** (admin only) | Fixed or percentage, minimum purchase or quantity, start/end dates, **usage limit**. Applies to **specific products** or to **whole subscriptions**. Added to the next invoice **automatically** and stops when it expires or runs out. |
| **Payments** | Recorded with **method, amount, date, reference and note** against an invoice. Partial payments are supported. Customers **pay online in the portal** (demo card/UPI provider, like Odoo's *Demo* provider). Every payment emails a receipt. |
| **Customer portal** | Overview, subscriptions, **accept or decline quotations**, **switch add-ons on/off**, pause/resume/renew/close (when the plan allows), invoices with PDF and **Pay now**, payment history, profile and password. |
| **Reports** | Dashboard with active subscriptions, **MRR/ARR**, collected this month, still owed, overdue, churn; revenue chart; overdue invoices to chase. Reports by subscription status/plan, revenue and payments by method and date range, an **overdue ageing** report, and **CSV export**. |
| **Automation & email** | Daily jobs: start subscriptions, invoice, close or auto-renew expired subscriptions, expire quotations and discounts, **overdue reminders**, **renewal reminders**. Every email is logged. Admins can run the jobs now from Settings. |

**Performance:** with **5,000 subscriptions, 23,000 invoices and 20,000 payments**, every page responds in **under 0.15 s**
on a laptop in production mode (target: under 2 s). Lists are paginated, filtered columns are indexed, and totals are
calculated in the database.

## Tech stack

- **Next.js 15** (App Router, server actions) + **TypeScript**
- **Prisma** ORM with **SQLite** for development (switch to PostgreSQL by changing one line)
- **Tailwind CSS v4**, **Recharts** for charts, **lucide** icons
- **Nodemailer** for email (SMTP, or printed to the console in development), **pdf-lib** for invoice PDFs
- Tests: Node's test runner (unit + billing integration) and **Playwright** (end-to-end)

Money is stored as integers in paise, so there are no rounding errors.

## Getting started

```bash
git clone https://github.com/asil-eng/brightloop.git
cd brightloop
npm install
cp .env.example .env
npx prisma migrate dev      # creates prisma/dev.db
npm run db:seed             # demo data: ~1,200 subscriptions with a year of history
npm run dev                 # http://localhost:3000
```

### Demo logins

| Role | Email | Password |
|---|---|---|
| Admin | `admin@brightloop.test` | `Admin@1234` |
| Internal staff | `staff@brightloop.test` | `Staff@1234` |
| Customer (portal) | `customer@brightloop.test` | `Customer@123` |

For a bigger dataset: `SEED_SUBSCRIPTIONS=5000 npm run db:seed`.

**Demo payments:** pay with any 16-digit card (e.g. `4242 4242 4242 4242`, any future expiry, any CVC) or any UPI ID.
Card `4000 0000 0000 0002` is declined, to show the failure path. No real money moves.

### Email

Without SMTP settings, emails are printed to the server console and logged under **Settings → Email delivery**.
To send real emails, set these in `.env`:

```bash
# Gmail (create an App Password in your Google account)
SMTP_HOST="smtp.gmail.com"
SMTP_PORT="465"
SMTP_USER="you@gmail.com"
SMTP_PASS="your-app-password"
MAIL_FROM="Brightloop Billing <you@gmail.com>"
```

For a local inbox, run [Mailpit](https://mailpit.axllent.org/) and use `SMTP_HOST=localhost SMTP_PORT=1025`.

### Scheduled jobs

The server runs the billing and reminder jobs every hour (set `DISABLE_SCHEDULER=1` to turn this off). An external
scheduler can call `GET /api/cron` with the header `Authorization: Bearer $CRON_SECRET`. Admins can also click
**Settings → Run billing & reminders now**.

## Tests

```bash
npm test            # unit tests + billing engine integration tests (throwaway database)
npm run test:e2e    # Playwright browser tests against the seeded dev database
npm run typecheck
npm run lint
```

The integration tests cover the rules that matter most: no double billing, catching up on missed periods, discount
usage limits, partial payments, cancel-and-rebill, pause stopping billing, and plan rules (auto-close vs. auto-renew,
closable, pausable).

The end-to-end tests cover sign-up and password rules, forgot password, staff turning a template into a subscription
and billing it, a customer paying online (declined then approved), switching add-ons on and off, staff recording a
partial payment, and customers being kept out of the back office.

## Project structure

```
prisma/
  schema.prisma          data model
  seed.ts                demo data
src/
  lib/
    pricing.ts           taxes and discounts (pure functions)
    billing.ts           invoice generation, payments, renewals
    subscriptions.ts     subscription lifecycle (confirm, pause, resume, close…)
    jobs.ts              daily jobs: billing run, expiry, reminders
    auth.ts, password.ts sessions, roles, password rules
    mail.ts, pdf.ts      email and invoice PDFs
    metrics.ts           MRR/ARR, revenue and dashboard numbers
  app/
    (auth)/              login, sign-up, forgot/reset password
    app/                 back office (admin + staff)
    portal/              customer portal
    api/                 invoice PDF, CSV reports, cron
  components/            UI kit, line editor, chatter, charts
tests/                   unit + integration tests
e2e/                     Playwright tests
```

### Data model

`User` · `Session` · `PasswordResetToken` · `Company` · `Customer` · `Product` · `Attribute` · `AttributeValue` ·
`ProductVariant` · `Tax` · `RecurringPlan` · `PaymentTerm` · `QuotationTemplate` / `TemplateLine` · `Subscription` /
`SubscriptionLine` · `Discount` · `Invoice` / `InvoiceLine` · `Payment` · `CloseReason` · `Activity` (chatter) ·
`EmailLog` · `Sequence` (document numbers)

### Using PostgreSQL

In `prisma/schema.prisma`, set `provider = "postgresql"`, point `DATABASE_URL` at your database, delete
`prisma/migrations` and run `npx prisma migrate dev --name init`. With PostgreSQL, add `mode: "insensitive"` to the
`contains` searches for case-insensitive search (SQLite's `LIKE` is already case-insensitive).
