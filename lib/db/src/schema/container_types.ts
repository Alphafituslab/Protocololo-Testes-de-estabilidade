import { pgTable, text, serial, timestamp } from "drizzle-orm/pg-core";

export const containerTypesTable = pgTable("container_types", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  description: text("description"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export type DbContainerType = typeof containerTypesTable.$inferSelect;
