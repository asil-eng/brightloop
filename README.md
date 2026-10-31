# Brightloop: Subscription Management System

A subscription management platform that **any business can register for** and use to run plans, subscriptions and
recurring billing in one place. Built for the **Odoo hackathon** brief *"Subscription Management System"*. It follows
the way **Odoo Subscriptions** works, but is built from scratch.

**How it works:**

1. A business (for example *Brightloop Software*, the company from the brief) **registers** on the sign-up page. It
   gets its own private workspace, and the person who registered becomes its **admin**.
2. The admin sets up products, plans, taxes and discounts, and **invites staff**, who handle customers day to day.
3. Staff **add the company's customers**. Customers don't sign up themselves: each one automatically gets an email with
   a link to set their password, then logs in to the **customer portal** to see, manage and pay for their subscriptions.

Every company's data is kept separate. One company can never see or change another company's records.

## Features

| Area | What it does |
|---|---|
| **Companies** | Any business registers its company (company name, owner, email, password) and gets its own workspace with default GST taxes, payment terms and close reasons, plus a *Get started* checklist. All its data is isolated: every query is filtered to the logged-in user's company in one central place, form-supplied ids are checked to belong to the company, and the database refuses records without a company. Invoices, emails and PDFs carry the company's own name and details, and document numbers (SUB/INV/PAY) count from 1 per company. |
| **Accounts & roles** | One login page for everyone; one account per email; password must be **more than 8 characters** with an uppercase letter, a lowercase letter and a special character; **forgot-password email with a one-time reset link**. Three roles per company: **Admin** (everything), **Internal staff** (day-to-day work, no settings or discounts), **Customer** (portal, own data only). **Only the admin can add staff.** Customers have **no public sign-up**: when staff add a customer, the customer is emailed a one-time link to set their password and log in. Checked on the server for every request. |
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
on a laptop in production mode (target: under 2 s), including the per-company filtering. Lists are paginated, filtered columns are indexed, and totals are
calculated in the database.

## Tech stack

- **Next.js 15** (App Router, server actions) + **TypeScript**
- **Prisma** ORM with **PostgreSQL** (Docker locally, Neon in production)
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

# Local PostgreSQL (matches the URLs in .env.example)
docker run -d --name brightloop-pg -e POSTGRES_USER=brightloop -e POSTGRES_PASSWORD=brightloop \
  -e POSTGRES_DB=brightloop -p 5433:5432 postgres:16-alpine

npx prisma migrate deploy   # create the tables
npm run db:seed             # optional: two demo companies with a year of history
npm run dev                 # http://localhost:3000
```

Without the seed, the system starts empty and the first company registers at `/signup`. The seed deletes all data and
refuses to run against anything but a local database.

### Demo logins

The seed creates two companies so you can see that their data is kept apart. Or register your own company at
`/signup`.

| Company | Role | Email | Password |
|---|---|---|---|
| Brightloop Software (~1,200 subscriptions) | Admin | `admin@brightloop.test` | `Admin@1234` |
| | Internal staff | `staff@brightloop.test` | `Staff@1234` |
| | Customer (portal) | `customer@brightloop.test` | `Customer@123` |
| Nimbus Fitness (~200 subscriptions) | Admin | `admin@nimbusfitness.test` | `Admin@1234` |
| | Internal staff | `staff@nimbusfitness.test` | `Staff@1234` |
| | Customer (portal) | `customer@nimbusfitness.test` | `Customer@123` |

For a bigger dataset: `SEED_SUBSCRIPTIONS=5000 npm run db:seed`.

**Customer logins in development:** when staff add a customer, the login email (with its set-password link) is printed
in the terminal running `npm run dev`, unless SMTP is configured.

**Demo payments:** pay with any 16-digit card (e.g. `4242 4242 4242 4242`, any future expiry, any CVC) or any UPI ID.
Card `4000 0000 0000 0002` is declined, to show the failure path. No real money moves.

## Deploying (Vercel + Neon)

1. **Database:** create a project on [Neon](https://neon.tech). Copy the **pooled** connection string (DATABASE_URL)
   and the **direct** one (DIRECT_URL).
2. **Vercel:** import the GitHub repo at [vercel.com/new](https://vercel.com/new). Vercel runs `npm run vercel-build`,
   which applies database migrations and builds the app.
3. **Environment variables** (Vercel → Project → Settings → Environment Variables):

   | Variable | Value |
   |---|---|
   | `DATABASE_URL` | Neon pooled connection string |
   | `DIRECT_URL` | Neon direct connection string |
   | `CRON_SECRET` | any long random string (protects the daily billing job) |
   | `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `MAIL_FROM_ADDRESS` | email settings (see below) |
   | `APP_URL` | optional: your custom domain, e.g. `https://brightloop.example.com` |

4. **Daily billing:** `vercel.json` schedules Vercel Cron to call `/api/cron` every day at 00:30 UTC. That creates
   invoices, renews or closes subscriptions and sends reminders for every company.

Production starts empty: businesses register at `/signup`.

### Email

Without SMTP settings, emails are printed to the server console and logged under **Settings → Email delivery**.
To send real emails, set these in `.env`:

```bash
# Gmail (create an App Password in your Google account)
SMTP_HOST="smtp.gmail.com"
SMTP_PORT="465"
SMTP_USER="you@gmail.com"
SMTP_PASS="your-app-password"
MAIL_FROM_ADDRESS="you@gmail.com"   # emails show the sending company's name
```

For a local inbox, run [Mailpit](https://mailpit.axllent.org/) and use `SMTP_HOST=localhost SMTP_PORT=1025`.

### Scheduled jobs

Running with `npm run dev` or `npm start`, the server runs the billing and reminder jobs every hour (set
`DISABLE_SCHEDULER=1` to turn this off). On Vercel, Vercel Cron calls `GET /api/cron` daily instead, authenticated with
`Authorization: Bearer $CRON_SECRET`. Admins can also click **Settings → Run billing & reminders now**.

### Security

Passwords are hashed with bcrypt, sessions are random tokens stored hashed, and reset/invite links are one-time and
expire. After 8 failed logins for an email, logins for it pause for 15 minutes; password-reset emails are capped at 5
per hour per address.

## Tests

```bash
npm test            # unit tests + billing engine integration tests (uses a separate brightloop_test database)
npm run test:e2e    # Playwright browser tests against the seeded dev database
npm run typecheck
npm run lint
```

The integration tests cover the rules that matter most: no double billing, catching up on missed periods, discount
usage limits, partial payments, cancel-and-rebill, pause stopping billing, plan rules (auto-close vs. auto-renew,
closable, pausable), and **company isolation** (another company can't read, list, total, update or pay a company's
records, numbering is per company, and records can't exist without a company).

The end-to-end tests cover company registration (password rules, one account per email, empty workspace), forgot
password, staff adding a customer who receives a login link and sets a password, turning a template into a
subscription and billing it, the customer paying online (declined then approved), switching add-ons on and off, staff
recording a partial payment, one company being unable to open another's records, and customers being kept out of the
back office.

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
    db.ts                rootDb + scopedDb(orgId): the company-scoped database client
    company.ts           company registration (workspace + admin + defaults)
    portal-access.ts     customer login emails (one-time set-password link)
    auth.ts, password.ts sessions, roles, password rules
    mail.ts, pdf.ts      email and invoice PDFs
    metrics.ts           MRR/ARR, revenue and dashboard numbers
  app/
    (auth)/              login, company registration, forgot/reset password
    app/                 back office (admin + staff)
    portal/              customer portal
    api/                 invoice PDF, CSV reports, cron
  components/            UI kit, line editor, chatter, charts
tests/                   unit + integration tests
e2e/                     Playwright tests
```

### Data model

`Organization` (company) · `User` · `Session` · `PasswordResetToken` · `Customer` · `Product` · `Attribute` · `AttributeValue` ·
`ProductVariant` · `Tax` · `RecurringPlan` · `PaymentTerm` · `QuotationTemplate` / `TemplateLine` · `Subscription` /
`SubscriptionLine` · `Discount` · `Invoice` / `InvoiceLine` · `Payment` · `CloseReason` · `Activity` (chatter) ·
`EmailLog` · `Sequence` (document numbers)
