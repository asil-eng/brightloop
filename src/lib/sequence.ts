import type { Prisma } from "@prisma/client";
import { db } from "./db";

type Tx = Prisma.TransactionClient;

const PREFIX: Record<string, (n: number) => string> = {
  subscription: (n) => `SUB/${String(n).padStart(5, "0")}`,
  invoice: (n) => `INV/${new Date().getFullYear()}/${String(n).padStart(5, "0")}`,
  payment: (n) => `PAY/${String(n).padStart(5, "0")}`,
};

/** Atomically take the next number from a named sequence. */
export async function nextNumber(name: keyof typeof PREFIX & string, tx: Tx = db): Promise<string> {
  const seq = await tx.sequence.upsert({
    where: { name },
    create: { name, next: 2 },
    update: { next: { increment: 1 } },
  });
  return PREFIX[name](seq.next - 1);
}
