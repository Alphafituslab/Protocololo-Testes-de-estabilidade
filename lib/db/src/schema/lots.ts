import { pgTable, text, serial, timestamp, integer, real } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { protocolsTable } from "./protocols";

export const lotsTable = pgTable("lots", {
  id: serial("id").primaryKey(),
  protocolId: integer("protocol_id").notNull().references(() => protocolsTable.id, { onDelete: "cascade" }),
  lotNumber: text("lot_number").notNull(),
  manufacturingDate: text("manufacturing_date").notNull(),
  expiryDate: text("expiry_date"),
  quantity: integer("quantity").notNull(),
  notes: text("notes"),
  /** Condição do estudo: 'longa_duracao' | 'acelerado' | null */
  studyCondition: text("study_condition"),
  /** Temperatura de armazenamento da condição (°C) */
  temperatureC: real("temperature_c"),
  /** Umidade relativa da condição (%UR) */
  humidityRh: real("humidity_rh"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
});

export const insertLotSchema = createInsertSchema(lotsTable).omit({ id: true, createdAt: true, deletedAt: true });
export type InsertLot = z.infer<typeof insertLotSchema>;
export type DbLot = typeof lotsTable.$inferSelect;
