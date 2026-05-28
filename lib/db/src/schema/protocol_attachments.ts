import { pgTable, serial, integer, text, timestamp } from "drizzle-orm/pg-core";
import { protocolsTable } from "./protocols";
import { usersTable } from "./users";

export const protocolAttachmentsTable = pgTable("protocol_attachments", {
  id: serial("id").primaryKey(),
  protocolId: integer("protocol_id").notNull().references(() => protocolsTable.id, { onDelete: "cascade" }),
  fileName: text("file_name").notNull(),
  fileType: text("file_type").notNull(),
  fileSizeBytes: integer("file_size_bytes"),
  objectPath: text("object_path").notNull(),
  uploadedBy: integer("uploaded_by").references(() => usersTable.id, { onDelete: "set null" }),
  uploadedByName: text("uploaded_by_name").notNull().default(""),
  description: text("description"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type DbProtocolAttachment = typeof protocolAttachmentsTable.$inferSelect;
