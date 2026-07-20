import { pgTable, text, serial, timestamp, integer } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const coaDocumentsTable = pgTable("coa_documents", {
  id: serial("id").primaryKey(),
  productName: text("product_name").notNull().default(""),
  lotNumber: text("lot_number").notNull().default(""),
  manufacturingDate: text("manufacturing_date").notNull().default(""),
  expiryDate: text("expiry_date").notNull().default(""),
  company: text("company").notNull().default(""),
  responsibleTech: text("responsible_tech").notNull().default(""),
  responsibleTechCrq: text("responsible_tech_crq").notNull().default(""),
  cnpj: text("cnpj").notNull().default(""),
  ie: text("ie").notNull().default(""),
  address: text("address").notNull().default(""),
  cep: text("cep").notNull().default(""),
  notes: text("notes"),
  status: text("status").notNull().default("rascunho"),
  linkedProtocolId: integer("linked_protocol_id"),
  linkedLotId: integer("linked_lot_id"),
  signedAt: timestamp("signed_at", { withTimezone: true }),
  signedBy: text("signed_by"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertCoaDocumentSchema = createInsertSchema(coaDocumentsTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertCoaDocument = z.infer<typeof insertCoaDocumentSchema>;
export type DbCoaDocument = typeof coaDocumentsTable.$inferSelect;
