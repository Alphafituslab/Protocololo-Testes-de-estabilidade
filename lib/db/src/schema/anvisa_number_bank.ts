import { pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";

export const anvisaNumberBank = pgTable("anvisa_number_bank", {
  id: serial("id").primaryKey(),
  label: text("label"),
  expedienteNumber: text("expediente_number"),
  processNumber: text("process_number"),
  transactionNumber: text("transaction_number"),
  protocolNumber: text("protocol_number"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export type AnvisaNumberBankEntry = typeof anvisaNumberBank.$inferSelect;
export type NewAnvisaNumberBankEntry = typeof anvisaNumberBank.$inferInsert;
