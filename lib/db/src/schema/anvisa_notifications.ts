import { pgTable, serial, integer, text, boolean, timestamp } from "drizzle-orm/pg-core";
import { protocolsTable } from "./protocols";

export const anvisaNotifications = pgTable("anvisa_notifications", {
  id: serial("id").primaryKey(),
  protocolId: integer("protocol_id").notNull().references(() => protocolsTable.id, { onDelete: "cascade" }),
  companyName: text("company_name").notNull(),
  notifiedAt: text("notified_at").notNull(),
  confirmed: boolean("confirmed").notNull().default(false),
  // Protocolo ANVISA (obrigatório quando confirmado)
  attachmentObjectPath: text("attachment_object_path"),
  attachmentFileName: text("attachment_file_name"),
  attachmentFileType: text("attachment_file_type"),
  // Rótulo (opcional)
  rotuloObjectPath: text("rotulo_object_path"),
  rotuloFileName: text("rotulo_file_name"),
  rotuloFileType: text("rotulo_file_type"),
  // Padronização (opcional)
  padronizacaoObjectPath: text("padronizacao_object_path"),
  padronizacaoFileName: text("padronizacao_file_name"),
  padronizacaoFileType: text("padronizacao_file_type"),
  notes: text("notes"),
  createdBy: text("created_by"),
  createdByName: text("created_by_name"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export type AnvisaNotification = typeof anvisaNotifications.$inferSelect;
export type NewAnvisaNotification = typeof anvisaNotifications.$inferInsert;
