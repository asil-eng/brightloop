import type { Tx } from "./db";

const PREFIX: Record<string, (n: number) => string> = {
  subscription: (n) => `SUB/${String(n).padStart(5, "0")}`,
  invoice: (n) => `INV/${new Date().getFullYear()}/${String(n).padStart(5, "0")}`,
  payment: (n) => `PAY/${String(n).padStart(5, "0")}`,
};

/**
 * Take the next number from one of the company's sequences. Call with a
 * company-scoped client (inside a transaction) so each company counts from 1.
 */
export async function nextNumber(tx: Tx, name: keyof typeof PREFIX & string): Promise<string> {
  const bumped = await tx.sequence.updateMany({ where: { name }, data: { next: { increment: 1 } } });
  if (!bumped.count) {
    // First number for this company. The scoped client stamps the orgId.
    await tx.sequence.create({ data: { name, next: 2 } });
    return PREFIX[name](1);
  }
  const seq = await tx.sequence.findFirstOrThrow({ where: { name } });
  return PREFIX[name](seq.next - 1);
}
