import Link from "next/link";
import type { Prisma } from "@prisma/client";
import { requireBackoffice } from "@/lib/auth";
import { formatMoney } from "@/lib/money";
import { Badge, LinkButton, PageHeader, EmptyState } from "@/components/ui";
import { PAGE_SIZE, Pagination, SearchBar, pageOf, param, type SearchParams } from "@/components/list";

export const metadata = { title: "Products" };

export default async function ProductsPage({ searchParams }: { searchParams: SearchParams }) {
  const user = await requireBackoffice();
  const { db } = user;
  const sp = await searchParams;
  const page = pageOf(sp);
  const q = param(sp, "q");
  const type = param(sp, "type");
  const where: Prisma.ProductWhereInput = {
    ...(q && { name: { contains: q } }),
    ...(type && { type: type as Prisma.EnumProductTypeFilter["equals"] }),
  };
  const [products, total] = await Promise.all([
    db.product.findMany({
      where,
      include: { taxes: true, _count: { select: { variants: { where: { active: true } } } } },
      orderBy: [{ active: "desc" }, { name: "asc" }],
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
    db.product.count({ where }),
  ]);

  return (
    <>
      <PageHeader
        title="Products"
        subtitle="What you sell: services, add-ons and goods."
        actions={user.role === "ADMIN" && <LinkButton href="/app/products/new" variant="primary">New product</LinkButton>}
      />
      <SearchBar
        action="/app/products"
        sp={sp}
        placeholder="Search products…"
        filters={[{ name: "type", label: "Type", options: [{ value: "SERVICE", label: "Service" }, { value: "ADDON", label: "Add-on" }, { value: "GOODS", label: "Goods" }] }]}
      />
      <div className="card overflow-x-auto">
        {products.length === 0 ? (
          <EmptyState title="No products found" />
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Type</th>
                <th className="text-right">Sales price</th>
                <th className="text-right">Cost price</th>
                <th>Variants</th>
                <th>Taxes</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {products.map((p) => (
                <tr key={p.id}>
                  <td>
                    <Link href={`/app/products/${p.id}`} className="link">{p.name}</Link>
                  </td>
                  <td>{{ SERVICE: "Service", ADDON: "Add-on", GOODS: "Goods" }[p.type]}</td>
                  <td className="text-right tabular-nums">{formatMoney(p.salesPrice)}</td>
                  <td className="text-right tabular-nums text-zinc-500">{formatMoney(p.costPrice)}</td>
                  <td>{p._count.variants || "—"}</td>
                  <td className="text-zinc-500">{p.taxes.map((t) => t.name).join(", ") || "—"}</td>
                  <td>{p.active ? <Badge status="ACTIVE" /> : <Badge status="CLOSED" label="Archived" />}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <Pagination base="/app/products" sp={sp} page={page} total={total} />
      </div>
    </>
  );
}
