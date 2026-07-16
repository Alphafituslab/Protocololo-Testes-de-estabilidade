import { pgTable, text, serial, integer, timestamp, boolean } from "drizzle-orm/pg-core";
import { protocolsTable } from "./protocols";

export const bibliographicReferencesTable = pgTable("bibliographic_references", {
  id: serial("id").primaryKey(),
  titulo: text("titulo").notNull(),
  autores: text("autores"),
  ano: integer("ano"),
  fonte: text("fonte"),
  volume: text("volume"),
  numero: text("numero"),
  paginas: text("paginas"),
  doi: text("doi"),
  descricao: text("descricao"),
  tipoReferencia: text("tipo_referencia").notNull().default("geral"),
  ativoRelacionado: text("ativo_relacionado"),
  autoInclude: boolean("auto_include").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const protocolReferencesTable = pgTable("protocol_references", {
  id: serial("id").primaryKey(),
  protocolId: integer("protocol_id").notNull().references(() => protocolsTable.id, { onDelete: "cascade" }),
  referenceId: integer("reference_id").notNull().references(() => bibliographicReferencesTable.id, { onDelete: "cascade" }),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type DbBibliographicReference = typeof bibliographicReferencesTable.$inferSelect;
export type DbProtocolReference = typeof protocolReferencesTable.$inferSelect;
