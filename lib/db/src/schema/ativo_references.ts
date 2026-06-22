import { pgTable, text, serial, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const ativoReferencesTable = pgTable("ativo_references", {
  id: serial("id").primaryKey(),
  parameter: text("parameter").notNull(),
  minValue: text("min_value"),
  maxValue: text("max_value"),
  unit: text("unit").notNull().default("mg"),
  source: text("source"),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertAtivoReferenceSchema = createInsertSchema(ativoReferencesTable).omit({ id: true, createdAt: true });
export type InsertAtivoReference = z.infer<typeof insertAtivoReferenceSchema>;
export type DbAtivoReference = typeof ativoReferencesTable.$inferSelect;
