import { ownerUser } from "../../../../lib/firebase-server";
import { bucket, checkPayload, db, errorResponse, receiptView, type StoredReceipt } from "../../../../lib/storage";

type Context = { params: Promise<{ id: string }> };
async function own(id: string, userId: string) {
  return db().prepare("SELECT * FROM receipts WHERE id = ? AND owner_id = ?").bind(id, userId).first<StoredReceipt>();
}
export async function GET(request: Request, context: Context) {
  const user = await ownerUser(request);
  if (!user) return Response.json({ error: "Sign in to view this receipt." }, { status: 401 });
  try {
    const { id } = await context.params;
    const row = await own(id, user.userId);
    if (!row) return Response.json({ error: "Receipt not found." }, { status: 404 });
    if (new URL(request.url).searchParams.has("file")) {
      const file = await bucket().get(`receipts/${id}`);
      if (!file) return Response.json({ error: "Original file unavailable." }, { status: 404 });
      return new Response(file.body, { headers: { "content-type": row.content_type || "application/octet-stream",
        "content-disposition": `inline; filename="receipt${row.content_type === "application/pdf" ? ".pdf" : ".jpg"}"`,
        "cache-control": "private, no-store", "x-content-type-options": "nosniff" } });
    }
    return Response.json({ receipt: receiptView(row) });
  } catch (error) { return errorResponse(error); }
}
export async function PUT(request: Request, context: Context) {
  const user = await ownerUser(request);
  if (!user) return Response.json({ error: "Sign in before editing." }, { status: 401 });
  try {
    const { id } = await context.params;
    const row = await own(id, user.userId);
    if (!row) return Response.json({ error: "Receipt not found." }, { status: 404 });
    const raw = await request.json() as Record<string, unknown>;
    const payload = checkPayload(raw);
    if (!payload) return Response.json({ error: "Check the amounts. Items must add up to the receipt total." }, { status: 400 });
    if (!Number.isInteger(raw.revision) || raw.revision !== row.revision)
      return Response.json({ error: "This receipt changed. Reload it before saving." }, { status: 409 });
    const now = new Date().toISOString();
    const result = await db().prepare(`UPDATE receipts SET receipt_date=?, paid_total=?, people_json=?, items_json=?, updated_at=?, revision=revision+1
      WHERE id=? AND owner_id=? AND revision=?`).bind(payload.date, payload.total, JSON.stringify(payload.people), JSON.stringify(payload.items), now, id, user.userId, row.revision).run();
    if (!result.meta.changes) return Response.json({ error: "Someone updated this receipt. Reload it." }, { status: 409 });
    return Response.json({ receipt: { ...receiptView(row), date: payload.date, total: payload.total, people: payload.people, items: payload.items, updatedAt: now, revision: row.revision + 1 } });
  } catch (error) { return errorResponse(error); }
}
export async function DELETE(request: Request, context: Context) {
  const user = await ownerUser(request);
  if (!user) return Response.json({ error: "Sign in before deleting." }, { status: 401 });
  try {
    const { id } = await context.params;
    const row = await own(id, user.userId);
    if (!row) return Response.json({ error: "Receipt not found." }, { status: 404 });
    await db().prepare("DELETE FROM receipts WHERE id = ? AND owner_id = ?").bind(id, user.userId).run();
    if (row.filename) await bucket().delete(`receipts/${id}`);
    return Response.json({ ok: true });
  } catch (error) { return errorResponse(error); }
}
