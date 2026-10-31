import { db } from "@/lib/db";
import { formatDateTime } from "@/lib/dates";
import type { EntityType } from "@/lib/activity";
import { ActionForm, SubmitButton } from "./form";
import { Card } from "./ui";
import { addNote } from "@/app/app/chatter-actions";

/** Odoo-style chatter: the record's history plus internal notes. */
export async function Chatter({ entityType, entityId, path }: { entityType: EntityType; entityId: string; path: string }) {
  const activities = await db.activity.findMany({
    where: { entityType, entityId },
    include: { user: { select: { name: true } } },
    orderBy: { createdAt: "desc" },
    take: 50,
  });
  return (
    <Card title="Activity">
      <ActionForm action={addNote} className="mb-4 space-y-2">
        <input type="hidden" name="entityType" value={entityType} />
        <input type="hidden" name="entityId" value={entityId} />
        <input type="hidden" name="path" value={path} />
        <textarea name="message" rows={2} required placeholder="Log an internal note…" className="input" />
        <SubmitButton size="sm" variant="secondary">Log note</SubmitButton>
      </ActionForm>
      <ol className="space-y-3">
        {activities.map((a) => (
          <li key={a.id} className="flex gap-3 text-sm">
            <span className="mt-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-brand-100 text-xs font-semibold text-brand-700">
              {(a.user?.name ?? "System").charAt(0)}
            </span>
            <div className="min-w-0">
              <p className="text-xs text-zinc-500">
                <span className="font-medium text-zinc-700">{a.user?.name ?? "System"}</span> · {formatDateTime(a.createdAt)}
              </p>
              <p className={a.isNote ? "mt-0.5 rounded-md bg-amber-50 px-2 py-1 text-zinc-800" : "text-zinc-700"}>{a.message}</p>
            </div>
          </li>
        ))}
        {activities.length === 0 && <li className="text-sm text-zinc-500">No activity yet.</li>}
      </ol>
    </Card>
  );
}
