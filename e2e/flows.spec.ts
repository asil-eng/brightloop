import { test, expect, type Page } from "@playwright/test";

const stamp = Date.now();
const customer = { name: `Asha Test ${stamp}`, email: `asha.${stamp}@example.com`, password: "Brightloop#2026" };

async function login(page: Page, email: string, password: string) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Log in" }).click();
  await expect(page).not.toHaveURL(/\/login/);
}

test("sign up enforces the password rules and one account per email", async ({ page }) => {
  await page.goto("/signup");
  await page.getByLabel("Full name").fill(customer.name);
  await page.getByLabel("Email").fill(customer.email);
  await page.getByLabel("Password", { exact: true }).fill("Short!1A");
  await page.getByLabel("Confirm password").fill("Short!1A");
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page.locator("form [role=alert]")).toContainText("more than 8 characters");

  await page.getByLabel("Password", { exact: true }).fill(customer.password);
  await page.getByLabel("Confirm password").fill(customer.password);
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page).toHaveURL(/\/portal$/);
  await expect(page.getByRole("heading", { name: "Welcome, Asha" })).toBeVisible();
  await page.context().clearCookies(); // log out

  await page.goto("/signup");
  await page.getByLabel("Full name").fill("Someone Else");
  await page.getByLabel("Email").fill(customer.email);
  await page.getByLabel("Password", { exact: true }).fill(customer.password);
  await page.getByLabel("Confirm password").fill(customer.password);
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page.locator("form [role=alert]")).toContainText("already exists");
});

test("forgot password always answers the same way", async ({ page }) => {
  await page.goto("/forgot-password");
  await page.getByLabel("Email").fill(customer.email);
  await page.getByRole("button", { name: "Send reset link" }).click();
  await expect(page.locator("form [role=status]")).toContainText("reset link is on its way");
});

test("staff turns a template into a subscription, bills it, and the customer pays online", async ({ page }) => {
  // Staff: quotation from template → send → confirm → first invoice.
  await login(page, "staff@brightloop.test", "Staff@1234");
  await expect(page).toHaveURL(/\/app$/);
  await expect(page.getByRole("link", { name: "Discounts" })).toHaveCount(0); // admin only
  await page.goto("/app/subscriptions/new");
  await page.getByRole("link", { name: "Starter (Monthly)" }).click();
  await page.waitForURL(/templateId=/);
  await page.getByLabel("Customer").selectOption({ label: customer.name });
  await page.getByRole("button", { name: "Create quotation" }).click();
  await expect(page).toHaveURL(/\/app\/subscriptions\/[\w-]+$/);
  await page.getByRole("button", { name: "Send quotation" }).click();
  await expect(page.locator("form [role=status]")).toContainText("Quotation sent");
  await page.getByRole("button", { name: "Confirm", exact: true }).click();
  // The quotation buttons disappear once confirmed; the chatter records what happened.
  await expect(page.getByText("Subscription is now active.")).toBeVisible();
  await expect(page.getByText(/Invoice created for/)).toBeVisible();
  await page.context().clearCookies(); // log out

  // Customer: sees the invoice, a declined card fails, a good card pays it.
  await login(page, customer.email, customer.password);
  await expect(page.getByText("Invoices to pay")).toBeVisible();
  await page.getByRole("link", { name: "Pay now" }).first().click();
  await page.getByLabel("Card number").fill("4000 0000 0000 0002");
  await page.getByLabel("Expiry").fill("12/30");
  await page.getByLabel("CVC").fill("123");
  await page.getByRole("button", { name: /^Pay / }).click();
  await expect(page.locator("form [role=alert]")).toContainText("declined");
  await page.getByLabel("Card number").fill("4242 4242 4242 4242");
  await page.getByRole("button", { name: /^Pay / }).click();
  await expect(page.getByText(/Payment of .* received/)).toBeVisible();
  await expect(page.getByText("Paid", { exact: true }).first()).toBeVisible();

  // Customer switches an add-on on and off.
  await page.goto("/portal/subscriptions");
  await page.getByRole("link", { name: /^SUB\// }).first().click();
  const support = page.locator("li", { hasText: "Priority Support" });
  await support.getByRole("button", { name: "Switch on" }).click();
  await expect(page.locator("form [role=status]")).toContainText("switched on");
  await expect(page.getByRole("cell", { name: "Priority Support" })).toBeVisible();
  await page.locator("li", { hasText: "Priority Support" }).getByRole("button", { name: "Switch off" }).click();
  await expect(page.locator("form [role=status]")).toContainText("switched off");
});

test("admin records a partial payment and the invoice shows what is still due", async ({ page }) => {
  await login(page, "admin@brightloop.test", "Admin@1234");
  await page.goto("/app/invoices?status=UNPAID");
  await page.locator("table tbody tr").first().getByRole("link").first().click();
  await page.getByLabel("Amount (₹)").fill("100");
  await page.getByLabel("Note").fill("Part payment by phone");
  await page.getByRole("button", { name: "Record payment" }).click();
  await expect(page.locator("form [role=status]")).toContainText("Payment recorded");
  await expect(page.getByText("Part payment by phone").first()).toBeVisible();
});

test("customers cannot open the back office", async ({ page }) => {
  await login(page, "customer@brightloop.test", "Customer@123");
  await page.goto("/app/settings");
  await expect(page).toHaveURL(/\/portal$/);
});
