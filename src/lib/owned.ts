type IdModel = { findMany(args: { where: { id: { in: string[] } }; select: { id: true } }): Promise<{ id: string }[]> };

/**
 * Keep only the ids that exist for the current company. Pass a delegate from a
 * company-scoped client, e.g. `owned(db.tax, ids)`, so another company's ids are dropped.
 */
export async function owned(model: IdModel, ids: string[]): Promise<string[]> {
  if (!ids.length) return [];
  const rows = await model.findMany({ where: { id: { in: [...new Set(ids)] } }, select: { id: true } });
  return rows.map((r) => r.id);
}

/** Same as `owned` for a single optional id: returns null if it isn't the company's. */
export async function ownedOne(model: IdModel, id: string | null | undefined): Promise<string | null> {
  if (!id) return null;
  return (await owned(model, [id]))[0] ?? null;
}
