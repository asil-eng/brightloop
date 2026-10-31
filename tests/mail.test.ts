import { before, test } from "node:test";
import assert from "node:assert/strict";
import { seal, unseal } from "../src/lib/secret-box";
import { sendMail } from "../src/lib/mail";
import { setUpCompany } from "../src/lib/company";
import type { Db } from "../src/lib/db";

console.log = () => {};
let db: Db;

before(async () => {
  db = (await setUpCompany({ companyName: `Mail Co ${Date.now()}`, ownerName: "Owner", ownerEmail: `mail${Date.now()}@test.dev`, passwordHash: null })).db;
});

test("email passwords are encrypted and tamper-proof", () => {
  const sealed = seal("abcd efgh ijkl mnop");
  assert.ok(!sealed.includes("abcd"));
  assert.notEqual(seal("same"), seal("same"), "a fresh IV every time");
  assert.equal(unseal(sealed), "abcd efgh ijkl mnop");
  const parts = sealed.split(":");
  parts[3] = Buffer.from("tampered").toString("base64");
  assert.throws(() => unseal(parts.join(":")));
});

test("customer emails are never sent without the company's own email account", async () => {
  process.env.EMAIL_DEV_CONSOLE = "0";
  // Even with a platform sender configured, company mail must not fall back to it.
  process.env.SMTP_HOST = "smtp.example.invalid";
  process.env.SMTP_USER = "platform@example.invalid";
  process.env.SMTP_PASS = "x";
  try {
    const sent = await sendMail(db, { to: "victim@example.com", subject: "Invoice", heading: "Invoice", paragraphs: [] });
    assert.equal(sent, false);
    const log = await db.emailLog.findFirstOrThrow({ where: { to: "victim@example.com" } });
    assert.equal(log.status, "not_sent");
    assert.equal(log.kind, "company");
    assert.match(log.error, /not connected/);
  } finally {
    delete process.env.EMAIL_DEV_CONSOLE;
    delete process.env.SMTP_HOST;
    delete process.env.SMTP_USER;
    delete process.env.SMTP_PASS;
  }
});

test("account emails are refused when no platform sender is configured", async () => {
  process.env.EMAIL_DEV_CONSOLE = "0";
  try {
    const sent = await sendMail(db, { to: "owner@example.com", subject: "Reset", heading: "Reset", paragraphs: [], kind: "account" });
    assert.equal(sent, false);
    const log = await db.emailLog.findFirstOrThrow({ where: { to: "owner@example.com" } });
    assert.equal(log.status, "not_sent");
    assert.equal(log.kind, "account");
  } finally {
    delete process.env.EMAIL_DEV_CONSOLE;
  }
});
