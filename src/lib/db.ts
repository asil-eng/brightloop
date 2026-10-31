import { Prisma, PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

/**
 * Unscoped client. Only for work that is not tied to one company: sessions, login,
 * company registration and looping over companies in the scheduler.
 * Everything else must use `scopedDb(orgId)`.
 */
export const rootDb = globalForPrisma.prisma ?? new PrismaClient();
if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = rootDb;

export type Db = PrismaClient;
export type Tx = Prisma.TransactionClient;

/** Models that belong to a company and carry an `orgId` column. */
const TENANT_MODELS = new Set<string>([
  "User", "Customer", "Tax", "Product", "Attribute", "ProductVariant", "RecurringPlan", "PaymentTerm",
  "QuotationTemplate", "CloseReason", "Subscription", "Discount", "Invoice", "Payment", "Activity",
  "EmailLog", "Sequence",
]);

const FILTERED_OPS = new Set([
  "findUnique", "findUniqueOrThrow", "findFirst", "findFirstOrThrow", "findMany", "count", "aggregate",
  "groupBy", "update", "updateMany", "delete", "deleteMany",
]);

type Args = { where?: object; data?: object | object[]; create?: object };

/**
 * A client that can only see and change one company's data: every read, update and
 * delete is filtered by orgId and every create is stamped with it. Child rows
 * (lines, attribute values) are reached through their company-owned parent.
 */
export function scopedDb(orgId: string): Db {
  const client = rootDb.$extends({
    query: {
      $allModels: {
        async $allOperations({ model, operation, args, query }) {
          const a = (args ?? {}) as Args;
          if (model === "Organization") {
            // A company can only read or change its own organization record.
            if (FILTERED_OPS.has(operation)) a.where = { ...a.where, id: orgId };
            else throw new Error(`Organization.${operation} is not allowed on a scoped client`);
            return query(a);
          }
          if (!TENANT_MODELS.has(model)) return query(a);

          if (operation === "create") a.data = { ...(a.data as object), orgId };
          else if (operation === "createMany" || operation === "createManyAndReturn") {
            a.data = (Array.isArray(a.data) ? a.data : [a.data]).map((d) => ({ ...d, orgId }));
          } else if (operation === "upsert") {
            a.where = { ...a.where, orgId };
            a.create = { ...a.create, orgId };
          } else if (FILTERED_OPS.has(operation)) {
            a.where = { ...a.where, orgId };
          }
          return query(a);
        },
      },
    },
  });
  // Query extensions don't change model types, so the scoped client is used as a PrismaClient.
  return client as unknown as Db;
}
