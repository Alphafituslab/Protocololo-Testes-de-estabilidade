import { pgTable, text, serial, timestamp, integer, doublePrecision } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { protocolsTable } from "./protocols";
import { lotsTable } from "./lots";

export const analysisResultsTable = pgTable("analysis_results", {
  id: serial("id").primaryKey(),
  protocolId: integer("protocol_id").notNull().references(() => protocolsTable.id, { onDelete: "cascade" }),
  lotId: integer("lot_id").notNull().references(() => lotsTable.id, { onDelete: "cascade" }),
  period: integer("period").notNull(),
  analysisDate: text("analysis_date").notNull(),
  category: text("category").notNull(),
  parameter: text("parameter").notNull(),
  criterion: text("criterion").notNull(),
  result: text("result").notNull(),
  numericResult: doublePrecision("numeric_result"),
  status: text("status").notNull().default("conforme"),
  observation: text("observation"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
});

export const insertAnalysisResultSchema = createInsertSchema(analysisResultsTable).omit({ id: true, createdAt: true, updatedAt: true, deletedAt: true });
export type InsertAnalysisResult = z.infer<typeof insertAnalysisResultSchema>;
export type DbAnalysisResult = typeof analysisResultsTable.$inferSelect;
