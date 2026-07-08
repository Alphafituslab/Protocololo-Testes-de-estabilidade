import { pgTable, text, serial, timestamp, integer } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { coaDocumentsTable } from "./coa_documents";

export const coaResultsTable = pgTable("coa_results", {
  id: serial("id").primaryKey(),
  coaId: integer("coa_id").notNull().references(() => coaDocumentsTable.id, { onDelete: "cascade" }),
  category: text("category").notNull().default(""),
  parameter: text("parameter").notNull().default(""),
  result: text("result").notNull().default(""),
  unit: text("unit").notNull().default(""),
  spec: text("spec").notNull().default(""),
  method: text("method").notNull().default(""),
  status: text("status").notNull().default("pendente"),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertCoaResultSchema = createInsertSchema(coaResultsTable).omit({ id: true, createdAt: true });
export type InsertCoaResult = z.infer<typeof insertCoaResultSchema>;
export type DbCoaResult = typeof coaResultsTable.$inferSelect;
