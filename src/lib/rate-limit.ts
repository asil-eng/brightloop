import { rootDb } from "./db";

/**
 * Count recent hits for a key (stored in the database, so it works across
 * serverless instances). Returns true when the limit is reached.
 */
export async function isLimited(key: string, max: number, windowMinutes: number): Promise<boolean> {
  const since = new Date(Date.now() - windowMinutes * 60_000);
  return (await rootDb.rateLimitHit.count({ where: { key, createdAt: { gte: since } } })) >= max;
}

export async function recordHit(key: string) {
  await rootDb.rateLimitHit.create({ data: { key } });
  // Opportunistic clean-up of old rows.
  if (Math.random() < 0.02) await rootDb.rateLimitHit.deleteMany({ where: { createdAt: { lt: new Date(Date.now() - 86_400_000) } } });
}

export async function clearHits(key: string) {
  await rootDb.rateLimitHit.deleteMany({ where: { key } });
}
