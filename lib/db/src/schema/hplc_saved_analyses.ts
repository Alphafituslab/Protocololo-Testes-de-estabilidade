import { pgTable, text, integer, timestamp } from "drizzle-orm/pg-core";
import { usersTable } from "./users";

export const hplcSavedAnalysesTable = pgTable("hplc_saved_analyses", {
  id: text("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  name: text("name").notNull().default(""),
  analysisData: text("analysis_data").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  archivedAt: timestamp("archived_at", { withTimezone: true }),
});

export type DbHplcSavedAnalysis = typeof hplcSavedAnalysesTable.$inferSelect;
