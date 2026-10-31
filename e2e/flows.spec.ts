import { test, expect, type Page } from "@playwright/test";
import crypto from "node:crypto";
import { PrismaClient } from "@prisma/client";

// Talks to the same dev database as the app (DATABASE_URL from .env).
const prisma = new PrismaClient();
const stamp = Date.now();
const owner = { company: `Acme Gyms ${stamp}`, name: "Owen Owner", email: `owner.${stamp}@example.com`, password: "Brightloop#2026" };
const customer = { name: `Asha Test ${stamp}`, email: `asha.${stamp}@example.com`, password: "Customer#2026" };

const alert = (page: Page) => page.locator("form [role=alert]");
const status = (page: Page) => page.locator("form [role=status]");

async function login(page: Page, email: string, password: string) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Log in" }).click();
  await expect(page).not.toHaveURL(/\/login/);
}

/** Stand-in for clicking the link in the login email: issue a known one-time token for the user. */
async function emailedLink(email: string) {
  const user = await prisma.user.findUniqueOrThrow({ where: { email } });
  const token = `e2e-${crypto.randomUUID()}`;
  await prisma.passwordResetToken.create({
    data: { tokenHash: crypto.createHash("sha256").update(token).digest("hex"), userId: user.id, purpose: "invite", expiresAt: new Date(Date.now() + 3600_000) },
  });
  return `/reset-password?token=${token}&invite=1`;
}

test.afterAll(() => prisma.$disconnect());

test("a business registers and gets its own empty workspace", async ({ page }) => {
  await page.goto("/signup");
  await expect(page.getByRole("heading", { name: "Register your business" })).toBeVisible();
  await page.getByLabel("Company name").fill(owner.company);
  await page.getByLabel("Your name").fill(owner.name);
  await page.getByLabel("Work email").fill(owner.email);
  await page.getByLabel("Password", { exact: true }).fill("Short!1A");
  await page.getByLabel("Confirm password").fill("Short!1A");
  await page.getByRole("button", { name: "Create company account" }).click();
  await expect(alert(page)).toContainText("more than 8 characters");

  await page.getByLabel("Password", { exact: true }).fill(owner.password);
  await page.getByLabel("Confirm password").fill(owner.password);
  await page.getByRole("button", { name: "Create company account" }).click();
  await expect(page).toHaveURL(/\/app$/);
  await expect(page.locator("aside").getByText(owner.company)).toBeVisible();
  await expect(page.getByText(/Get started · 0 of 6 done/)).toBeVisible();

  // The new company sees none of the demo companies' data.
  await page.goto("/app/subscriptions");
  await expect(page.getByText("No subscriptions found")).toBeVisible();
  await page.goto("/app/customers");
  await expect(page.getByText("No customers found")).toBeVisible();

  // One account per email across the platform.
  await page.context().clearCookies();
  await page.goto("/signup");
  await page.getByLabel("Company name").fill("Copycat Ltd");
  await page.getByLabel("Your name").fill("Someone");
  await page.getByLabel("Work email").fill(owner.email);
  await page.getByLabel("Password", { exact: true }).fill(owner.password);
  await page.getByLabel("Confirm password").fill(owner.password);
  await page.getByRole("button", { name: "Create company account" }).click();
  await expect(alert(page)).toContainText("already exists");
});

test("forgot password always answers the same way", async ({ page }) => {
  await page.goto("/forgot-password");
  await page.getByLabel("Email").fill(owner.email);
  await page.getByRole("button", { name: "Send reset link" }).click();
  await expect(status(page)).toContainText("reset link is on its way");
});

test("staff add a customer, who gets a login by email, then quote-to-cash and online payment", async ({ page }) => {
  // Staff create the customer: their login email goes out automatically.
  await login(page, "staff@brightloop.test", "Staff@1234");
  await expect(page.getByRole("link", { name: "Discounts" })).toHaveCount(0); // admin only
  await page.goto("/app/customers/new");
  await page.getByLabel("Name").fill(customer.name);
  await page.getByLabel("Email").fill(customer.email);
  await page.getByRole("button", { name: "Create customer" }).click();
  await expect(page.getByText(`Login details emailed to ${customer.email}.`)).toBeVisible();
  const sent = await prisma.emailLog.findFirst({ where: { to: customer.email }, orderBy: { createdAt: "desc" } });
  expect(sent?.subject).toBe("Your Brightloop Software customer account");

  // Quotation from a template → send → confirm → first invoice.
  await page.goto("/app/subscriptions/new");
  await page.getByRole("link", { name: "Starter (Monthly)" }).click();
  await page.waitForURL(/templateId=/);
  await page.getByLabel("Customer").selectOption({ label: customer.name });
  await page.getByRole("button", { name: "Create quotation" }).click();
  await expect(page).toHaveURL(/\/app\/subscriptions\/[\w-]+$/);
  await page.getByRole("button", { name: "Send quotation" }).click();
  await expect(status(page)).toContainText("Quotation sent");
  await page.getByRole("button", { name: "Confirm", exact: true }).click();
  await expect(page.getByText("Subscription is now active.")).toBeVisible();
  await page.context().clearCookies();

  // Customer clicks the emailed link, sets a password and lands in the portal.
  await page.goto(await emailedLink(customer.email));
  await expect(page.getByRole("heading", { name: "Set up your account" })).toBeVisible();
  await page.getByLabel("New password", { exact: true }).fill(customer.password);
  await page.getByLabel("Confirm password").fill(customer.password);
  await page.getByRole("button", { name: "Save password" }).click();
  await expect(page).toHaveURL(/\/portal$/);
  await expect(page.getByText("Brightloop Software").first()).toBeVisible();
  await expect(page.getByText("Invoices to pay")).toBeVisible();

  // Pay online: a declined card fails, a good card pays.
  await page.getByRole("link", { name: "Pay now" }).first().click();
  await page.getByLabel("Card number").fill("4000 0000 0000 0002");
  await page.getByLabel("Expiry").fill("12/30");
  await page.getByLabel("CVC").fill("123");
  await page.getByRole("button", { name: /^Pay / }).click();
  await expect(alert(page)).toContainText("declined");
  await page.getByLabel("Card number").fill("4242 4242 4242 4242");
  await page.getByRole("button", { name: /^Pay / }).click();
  await expect(page.getByText(/Payment of .* received/)).toBeVisible();

  // Switch an add-on on and off.
  await page.goto("/portal/subscriptions");
  await page.getByRole("link", { name: /^SUB\// }).first().click();
  await page.locator("li", { hasText: "Priority Support" }).getByRole("button", { name: "Switch on" }).click();
  await expect(status(page)).toContainText("switched on");
  await page.locator("li", { hasText: "Priority Support" }).getByRole("button", { name: "Switch off" }).click();
  await expect(status(page)).toContainText("switched off");

  // The customer logs in normally next time.
  await page.context().clearCookies();
  await login(page, customer.email, customer.password);
  await expect(page).toHaveURL(/\/portal$/);
});

test("admin records a partial payment", async ({ page }) => {
  await login(page, "admin@brightloop.test", "Admin@1234");
  await page.goto("/app/invoices?status=UNPAID");
  await page.locator("table tbody tr").first().getByRole("link").first().click();
  await page.getByLabel("Amount (₹)").fill("100");
  await page.getByLabel("Note").fill("Part payment by phone");
  await page.getByRole("button", { name: "Record payment" }).click();
  await expect(status(page)).toContainText("Payment recorded");
});

test("one company can't open another company's records", async ({ page }) => {
  const brightloop = await prisma.organization.findFirstOrThrow({ where: { name: "Brightloop Software" } });
  const invoice = await prisma.invoice.findFirstOrThrow({ where: { orgId: brightloop.id } });
  const sub = await prisma.subscription.findFirstOrThrow({ where: { orgId: brightloop.id } });
  await login(page, "admin@nimbusfitness.test", "Admin@1234");
  await expect(page.locator("aside").getByText("Nimbus Fitness")).toBeVisible();
  for (const url of [`/app/invoices/${invoice.id}`, `/app/subscriptions/${sub.id}`]) {
    const res = await page.goto(url);
    expect(res?.status()).toBe(404);
  }
  const pdf = await page.request.get(`/api/invoices/${invoice.id}/pdf`);
  expect(pdf.status()).toBe(404);
});

test("customers cannot open the back office", async ({ page }) => {
  await login(page, "customer@brightloop.test", "Customer@123");
  await page.goto("/app/settings");
  await expect(page).toHaveURL(/\/portal$/);
});

test("repeated wrong passwords lock the login for a while", async ({ page }) => {
  const email = `nobody.${stamp}@example.com`;
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  for (let i = 0; i < 8; i++) {
    await page.getByLabel("Password", { exact: true }).fill(`Wrong#${i}xyz`);
    await page.getByRole("button", { name: "Log in" }).click();
    await expect(alert(page)).toContainText("Incorrect email or password");
  }
  await page.getByRole("button", { name: "Log in" }).click();
  await expect(alert(page)).toContainText("Too many failed attempts");
});
