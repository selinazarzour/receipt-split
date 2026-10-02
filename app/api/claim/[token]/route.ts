import { db, errorResponse, receiptView, type StoredReceipt } from "../../../../lib/storage";
import type { SplitItem } from "../../../../lib/receipt";

type Context = { params: Promise<{ token: string }> };
export async function GET(_request: Request, context: Context) {
  try {
    const { token } = await context.params;
    const row = await db().prepare("SELECT * FROM receipts WHERE invite_token = ?").bind(token).first<StoredReceipt>();
    if (!row) return Response.json({ error: "This share link was not found." }, { status: 404 });
    const { id, date, total, people, items, revision } = receiptView(row);
    return Response.json({ receipt: { id, date, total, people, items, revision } }, { headers: { "cache-control": "no-store" } });
  } catch (error) { return errorResponse(error); }
}
export async function PATCH(request: Request, context: Context) {
  try {
    const { token } = await context.params;
    const body = await request.json() as { person?: number; itemIds?: string[] };
    if (!Number.isInteger(body.person) || !Array.isArray(body.itemIds) || body.itemIds.length > 300 ||
        !body.itemIds.every((x) => typeof x === "string" && x.length <= 80))
      return Response.json({ error: "Choose a person and their items." }, { status: 400 });
    for (let attempt = 0; attempt < 3; attempt++) {
      const row = await db().prepare("SELECT * FROM receipts WHERE invite_token = ?").bind(token).first<StoredReceipt>();
      if (!row) return Response.json({ error: "This share link was not found." }, { status: 404 });
      const people = JSON.parse(row.people_json) as string[];
      const person = body.person!;
      if (person < 0 || person >= people.length) return Response.json({ error: "Choose a listed person." }, { status: 400 });
      const items = JSON.parse(row.items_json) as SplitItem[];
      const known = new Set(items.map((i) => i.id));
      if (body.itemIds!.some((id) => !known.has(id))) return Response.json({ error: "An item changed. Reload the receipt." }, { status: 409 });
      const selected = new Set(body.itemIds);
      const updated = items.map((item) => ({ ...item, people: [...item.people.filter((p) => p !== person), ...(selected.has(item.id) ? [person] : [])].sort((a, b) => a - b) }));
      const now = new Date().toISOString();
      const result = await db().prepare("UPDATE receipts SET items_json=?, updated_at=?, revision=revision+1 WHERE id=? AND revision=?")
        .bind(JSON.stringify(updated), now, row.id, row.revision).run();
      if (result.meta.changes) return Response.json({ receipt: { id: row.id, date: row.receipt_date, total: row.paid_total,
        people, items: updated, revision: row.revision + 1 } });
    }
    return Response.json({ error: "Someone else saved at the same time. Try again." }, { status: 409 });
  } catch (error) { return errorResponse(error); }
}
