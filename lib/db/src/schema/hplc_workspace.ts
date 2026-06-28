import { pgTable, integer, text, timestamp } from "drizzle-orm/pg-core";
import { usersTable } from "./users";

/** One row per user — stores all HPLC workspace data (formulas, lots,
 *  compound library, standards, padrão config, presets, calibrations).
 *  Updated in full on every workspace save. */
export const hplcWorkspaceTable = pgTable("hplc_workspace", {
  userId: integer("user_id").primaryKey().references(() => usersTable.id, { onDelete: "cascade" }),
  workspaceData: text("workspace_data").notNull().default("{}"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export type DbHplcWorkspace = typeof hplcWorkspaceTable.$inferSelect;
