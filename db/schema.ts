import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const receipts = sqliteTable("receipts", {
  id: text("id").primaryKey(),
  ownerId: text("owner_id").notNull(),
  inviteToken: text("invite_token").notNull().unique(),
  receiptDate: text("receipt_date").notNull(),
  paidTotal: integer("paid_total").notNull(),
  peopleJson: text("people_json").notNull(),
  itemsJson: text("items_json").notNull(),
  filename: text("filename"),
  contentType: text("content_type"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
  revision: integer("revision").notNull().default(0),
}, (table) => [index("idx_receipts_owner_date").on(table.ownerId, table.receiptDate)]);
