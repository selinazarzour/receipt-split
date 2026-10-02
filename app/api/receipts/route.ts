import { ownerUser } from "../../../lib/firebase-server";
import { bucket, checkPayload, db, errorResponse, receiptView, type StoredReceipt } from "../../../lib/storage";

export async function GET(request: Request) {
  const user = await ownerUser(request);
  if (!user) return Response.json({ error: "Sign in to see your history." }, { status: 401 });
  try {
    const result = await db().prepare("SELECT * FROM receipts WHERE owner_id = ? ORDER BY receipt_date DESC, created_at DESC LIMIT 100").bind(user.userId).all<StoredReceipt>();
    return Response.json({ receipts: result.results.map(receiptView) });
  } catch (error) { return errorResponse(error); }
}

export async function POST(request: Request) {
  const user = await ownerUser(request);
  if (!user) return Response.json({ error: "Sign in before saving." }, { status: 401 });
  let id: string | null = null;
  try {
    const form = await request.formData();
    const payload = checkPayload(JSON.parse(String(form.get("receipt") || "null")));
    const fileValue = form.get("file");
    const file = fileValue instanceof File ? fileValue : null;
    if (!payload || (fileValue && !file)) return Response.json({ error: "Check the receipt date, people, amounts, and paid total." }, { status: 400 });
    if (file && (file.size > 12_000_000 || !["application/pdf", "image/png", "image/jpeg", "image/webp"].includes(file.type)))
      return Response.json({ error: "Upload a PDF or image smaller than 12 MB." }, { status: 400 });
    id = crypto.randomUUID();
    const token = `${crypto.randomUUID()}${crypto.randomUUID().replaceAll("-", "")}`;
    const now = new Date().toISOString();
    if (file) await bucket().put(`receipts/${id}`, file.stream(), { httpMetadata: { contentType: file.type } });
    await db().prepare(`INSERT INTO receipts (id, owner_id, invite_token, receipt_date, paid_total, people_json, items_json, filename, content_type, created_at, updated_at, revision)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)`).bind(id, user.userId, token, payload.date, payload.total,
      JSON.stringify(payload.people), JSON.stringify(payload.items), file?.name || null, file?.type || null, now, now).run();
    return Response.json({ receipt: { id, date: payload.date, total: payload.total, people: payload.people, items: payload.items,
      filename: file?.name || null, createdAt: now, updatedAt: now, revision: 0, token } }, { status: 201 });
  } catch (error) {
    if (id) await bucket().delete(`receipts/${id}`).catch(() => {});
    return errorResponse(error);
  }
}
