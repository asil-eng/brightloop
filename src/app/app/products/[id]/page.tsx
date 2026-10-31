import { notFound } from "next/navigation";
import { requireBackoffice } from "@/lib/auth";
import { formatMoney, toMajor } from "@/lib/money";
import { Badge, Card, PageHeader } from "@/components/ui";
import { ActionForm, SubmitButton } from "@/components/form";
import { ProductForm } from "../product-form";
import { deleteAttribute, saveAttribute, updateProduct } from "../actions";

export default async function ProductPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireBackoffice();
  const { db } = user;
  const isAdmin = user.role === "ADMIN";
  const { id } = await params;
  const product = await db.product.findUnique({
    where: { id },
    include: {
      taxes: true,
      attributes: { include: { values: { orderBy: { extraPrice: "asc" } } }, orderBy: { id: "asc" } },
      variants: { where: { active: true }, orderBy: { extraPrice: "asc" } },
      _count: { select: { subscriptionLines: true } },
    },
  });
  if (!product) notFound();
  const taxes = await db.tax.findMany({ where: { active: true }, orderBy: { name: "asc" } });

  return (
    <>
      <PageHeader
        title={product.name}
        subtitle={`Used on ${product._count.subscriptionLines.toLocaleString("en-IN")} subscription lines`}
        breadcrumbs={[{ label: "Products", href: "/app/products" }, { label: product.name }]}
      />
      <div className="grid gap-5 xl:grid-cols-5">
        <Card title="Product details" className="xl:col-span-3">
          <ProductForm action={updateProduct} product={product} taxes={taxes} readOnly={!isAdmin} />
        </Card>

        <div className="space-y-5 xl:col-span-2">
          <Card title="Variants">
            {product.variants.length === 0 ? (
              <p className="text-sm text-ink-secondary">No variants. Add an attribute below to create them.</p>
            ) : (
              <table className="table">
                <thead>
                  <tr>
                    <th>Variant</th>
                    <th className="text-right">Extra</th>
                    <th className="text-right">Price</th>
                  </tr>
                </thead>
                <tbody>
                  {product.variants.map((v) => (
                    <tr key={v.id}>
                      <td>{v.name}</td>
                      <td className="text-right tabular-nums">+{formatMoney(v.extraPrice)}</td>
                      <td className="text-right font-medium tabular-nums">{formatMoney(product.salesPrice + v.extraPrice)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </Card>

          <Card title="Attributes">
            <div className="space-y-4">
              {product.attributes.map((a) => (
                <div key={a.id} className="rounded-md border border-rule p-3">
                  <ActionForm action={saveAttribute} className="space-y-2">
                    <fieldset disabled={!isAdmin} className="space-y-2">
                      <input type="hidden" name="productId" value={product.id} />
                      <input type="hidden" name="attributeId" value={a.id} />
                      <input name="name" defaultValue={a.name} className="input font-medium" />
                      <textarea name="values" rows={Math.max(2, a.values.length)} className="input font-mono text-xs" defaultValue={a.values.map((v) => `${v.name}: ${toMajor(v.extraPrice)}`).join("\n")} />
                      {isAdmin && <SubmitButton size="sm" variant="secondary">Save attribute</SubmitButton>}
                    </fieldset>
                  </ActionForm>
                  {isAdmin && (
                    <ActionForm action={deleteAttribute} confirm={`Remove the attribute "${a.name}"?`} className="mt-2">
                      <input type="hidden" name="attributeId" value={a.id} />
                      <SubmitButton size="sm" variant="danger">Remove</SubmitButton>
                    </ActionForm>
                  )}
                </div>
              ))}
              {isAdmin && (
                <ActionForm action={saveAttribute} className="space-y-2 rounded-md border border-dashed border-rule p-3">
                  <p className="text-sm font-medium">Add an attribute</p>
                  <input type="hidden" name="productId" value={product.id} />
                  <input name="name" placeholder="e.g. Brand" required className="input" />
                  <textarea name="values" rows={3} required placeholder={"One value per line, with optional extra price:\nGeneric\nOdoo: 560"} className="input font-mono text-xs" />
                  <SubmitButton size="sm">Add attribute</SubmitButton>
                </ActionForm>
              )}
              {!isAdmin && product.attributes.length === 0 && <p className="text-sm text-ink-secondary">No attributes.</p>}
            </div>
          </Card>
          {!product.active && <Badge status="CLOSED" label="Archived" />}
        </div>
      </div>
    </>
  );
}
