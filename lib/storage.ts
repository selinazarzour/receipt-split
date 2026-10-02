import { env } from "cloudflare:workers";
import type { SplitItem } from "./receipt";

export type StoredReceipt = {
  id: string; owner_id: string; invite_token: string; receipt_date: string;
  paid_total: number; people_json: string; items_json: string;
  filename: string | null; content_type: string | null;
  created_at: string; updated_at: string; revision: number;
};

export function db() {
  if (!env.DB) throw new Error("Receipt history is temporarily unavailable.");
  return env.DB;
}
export function bucket() {
  if (!env.BUCKET) throw new Error("Receipt file storage is temporarily unavailable.");
  return env.BUCKET;
}
export function receiptView(row: StoredReceipt) {
  return { id: row.id, date: row.receipt_date, total: row.paid_total,
    people: JSON.parse(row.people_json) as string[], items: JSON.parse(row.items_json) as SplitItem[],
    filename: row.filename, createdAt: row.created_at, updatedAt: row.updated_at, revision: row.revision,
    token: row.invite_token };
}
export function checkPayload(value: unknown): { date: string; total: number; people: string[]; items: SplitItem[] } | null {
  if (!value || typeof value !== "object") return null;
  const p = value as Record<string, unknown>;
  if (typeof p.date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(p.date) ||
      !Number.isInteger(p.total) || (p.total as number) < 0 || (p.total as number) > 10_000_000 ||
      !Array.isArray(p.people) || p.people.length < 2 || p.people.length > 12 ||
      !p.people.every((x) => typeof x === "string" && x.trim().length > 0 && x.trim().length <= 50) ||
      !Array.isArray(p.items) || p.items.length < 1 || p.items.length > 300) return null;
  const people = (p.people as string[]).map((s) => s.trim());
  if (new Set(people.map((s) => s.toLowerCase())).size !== people.length) return null;
  const items = p.items as SplitItem[];
  const ids = new Set<string>();
  for (const item of items) {
    if (!item || typeof item.id !== "string" || item.id.length > 80 || ids.has(item.id) ||
        typeof item.name !== "string" || !item.name.trim() || item.name.length > 120 ||
        typeof item.category !== "string" || item.category.length > 50 ||
        ![item.original, item.itemDiscount, item.categoryDiscount, item.tax].every((n) => Number.isInteger(n) && Math.abs(n) <= 10_000_000) ||
        !Array.isArray(item.people) || item.people.some((n) => !Number.isInteger(n) || n < 0 || n >= people.length) ||
        new Set(item.people).size !== item.people.length) return null;
    ids.add(item.id);
  }
  const sum = items.reduce((s, i) => s + i.original - i.itemDiscount - i.categoryDiscount + i.tax, 0);
  if (sum !== p.total) return null;
  return { date: p.date, total: p.total as number, people, items };
}
export const errorResponse = (error: unknown) => {
  console.error("Receipt request failed", error);
  return Response.json({ error: "Could not load or save this receipt right now. Please try again." }, { status: 503 });
};
