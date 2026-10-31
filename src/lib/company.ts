import { rootDb, scopedDb } from "./db";

function slugify(name: string) {
  return (
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 40) || "company"
  );
}

/**
 * Create a company workspace with sensible defaults (GST taxes, payment terms and
 * close reasons) and its first administrator. Products, plans and customers are
 * left for the company to add.
 */
export async function setUpCompany(input: { companyName: string; ownerName: string; ownerEmail: string; passwordHash: string | null }) {
  const base = slugify(input.companyName);
  let slug = base;
  for (let i = 2; await rootDb.organization.findUnique({ where: { slug } }); i++) slug = `${base}-${i}`;

  const org = await rootDb.organization.create({ data: { name: input.companyName, slug, email: input.ownerEmail } });
  const db = scopedDb(org.id);
  const admin = await db.user.create({
    data: { email: input.ownerEmail, name: input.ownerName, role: "ADMIN", passwordHash: input.passwordHash },
  });
  await db.tax.createMany({
    data: [
      { name: "GST 18%", rate: 18 },
      { name: "GST 12%", rate: 12 },
      { name: "GST 5%", rate: 5 },
    ],
  });
  await db.paymentTerm.createMany({
    data: [
      { name: "Immediate payment", dueDays: 0 },
      { name: "15 days", dueDays: 15 },
      { name: "30 days", dueDays: 30 },
    ],
  });
  // "Contract ended" and "Quotation expired" are used by the daily jobs.
  await db.closeReason.createMany({
    data: ["Too expensive", "Switched to another provider", "No longer needed", "Contract ended", "Quotation expired"].map((name) => ({ name })),
  });
  return { org, admin, db };
}
