/** Case-insensitive "contains" filter for text search (PostgreSQL compares case-sensitively by default). */
export const ci = (q: string) => ({ contains: q, mode: "insensitive" as const });
