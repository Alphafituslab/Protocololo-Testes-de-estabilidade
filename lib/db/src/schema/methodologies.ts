import { pgTable, text, serial, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const methodologiesTable = pgTable("methodologies", {
  id: serial("id").primaryKey(),
  shortName: text("short_name").notNull(),
  citation: text("citation").notNull(),
  category: text("category"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertMethodologySchema = createInsertSchema(methodologiesTable).omit({ id: true, createdAt: true });
export type InsertMethodology = z.infer<typeof insertMethodologySchema>;
export type DbMethodology = typeof methodologiesTable.$inferSelect;
