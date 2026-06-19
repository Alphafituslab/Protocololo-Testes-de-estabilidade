import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, methodologiesTable, protocolsTable } from "@workspace/db";
import { z } from "zod";
import { requireAuth } from "../lib/session";

const router: IRouter = Router();

const CreateMethodologyBody = z.object({
  shortName: z.string().min(1),
  citation: z.string().min(1),
  category: z.string().nullable().optional(),
  subject: z.string().nullable().optional(),
  parameter: z.string().nullable().optional(),
  criteria: z.string().nullable().optional(),
});

const MethodologyIdParams = z.object({
  id: z.coerce.number().int().positive(),
});

const UpdateMethodologyBody = z.object({
  shortName: z.string().min(1),
  citation: z.string().min(1),
  category: z.string().nullable().optional(),
  subject: z.string().nullable().optional(),
  parameter: z.string().nullable().optional(),
  criteria: z.string().nullable().optional(),
});

router.get("/methodologies", async (_req, res): Promise<void> => {
  const rows = await db
    .select()
    .from(methodologiesTable)
    .orderBy(methodologiesTable.createdAt);
  res.json(rows);
});

router.post("/methodologies", requireAuth, async (req, res): Promise<void> => {
  const parsed = CreateMethodologyBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const [created] = await db
    .insert(methodologiesTable)
    .values({
      shortName: parsed.data.shortName,
      citation: parsed.data.citation,
      category: parsed.data.category ?? null,
      subject: parsed.data.subject ?? null,
      parameter: parsed.data.parameter ?? null,
      criteria: parsed.data.criteria ?? null,
    })
    .returning();
  res.status(201).json(created);
});

router.put("/methodologies/:id", requireAuth, async (req, res): Promise<void> => {
  const params = MethodologyIdParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const body = UpdateMethodologyBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: body.error.message });
    return;
  }

  // Fetch old methodology before update (need old shortName for propagation)
  const [old] = await db
    .select()
    .from(methodologiesTable)
    .where(eq(methodologiesTable.id, params.data.id));
  if (!old) {
    res.status(404).json({ error: "Methodology not found" });
    return;
  }

  const [updated] = await db
    .update(methodologiesTable)
    .set({
      shortName: body.data.shortName,
      citation: body.data.citation,
      category: body.data.category ?? null,
      subject: body.data.subject ?? null,
      parameter: body.data.parameter ?? null,
      criteria: body.data.criteria ?? null,
    })
    .where(eq(methodologiesTable.id, params.data.id))
    .returning();
  if (!updated) {
    res.status(404).json({ error: "Methodology not found" });
    return;
  }

  // Propagate changes to all protocols that reference this methodology.
  // A protocol references a methodology when paramMethodsJson maps any param → old.shortName.
  const oldShortName = old.shortName;
  const newShortName = body.data.shortName;
  const newCitation = body.data.citation;
  const newCriteria = body.data.criteria ?? null;

  try {
    const allProtocols = await db
      .select({
        id: protocolsTable.id,
        paramMethodsJson: protocolsTable.paramMethodsJson,
        paramMethodsCitationsJson: protocolsTable.paramMethodsCitationsJson,
        customParamsJson: protocolsTable.customParamsJson,
      })
      .from(protocolsTable);

    for (const protocol of allProtocols) {
      let paramMethods: Record<string, string> = {};
      try {
        if (protocol.paramMethodsJson) paramMethods = JSON.parse(protocol.paramMethodsJson) as Record<string, string>;
      } catch { continue; }

      // Find which params in this protocol reference the old methodology
      const affectedParams = Object.entries(paramMethods)
        .filter(([, method]) => method === oldShortName)
        .map(([paramName]) => paramName);

      if (affectedParams.length === 0) continue;

      // 1. Update paramMethodsJson if shortName changed
      if (newShortName !== oldShortName) {
        for (const paramName of affectedParams) {
          paramMethods[paramName] = newShortName;
        }
      }

      // 2. Update paramMethodsCitationsJson
      let paramCitations: Record<string, string> = {};
      try {
        if (protocol.paramMethodsCitationsJson) paramCitations = JSON.parse(protocol.paramMethodsCitationsJson) as Record<string, string>;
      } catch {}
      for (const paramName of affectedParams) {
        paramCitations[paramName] = newCitation;
      }

      // 3. Update customParamsJson: set criterion for affected params when criteria changed
      let customParams: Array<{ parameter: string; category: string; criterion?: string; [key: string]: unknown }> = [];
      let customParamsChanged = false;
      try {
        if (protocol.customParamsJson) customParams = JSON.parse(protocol.customParamsJson) as typeof customParams;
      } catch {}
      if (newCriteria) {
        customParams = customParams.map((p) => {
          if (affectedParams.includes(p.parameter)) {
            customParamsChanged = true;
            return { ...p, criterion: newCriteria };
          }
          return p;
        });
      }

      await db
        .update(protocolsTable)
        .set({
          paramMethodsJson: JSON.stringify(paramMethods),
          paramMethodsCitationsJson: JSON.stringify(paramCitations),
          ...(customParamsChanged ? { customParamsJson: JSON.stringify(customParams) } : {}),
        })
        .where(eq(protocolsTable.id, protocol.id));
    }
  } catch {
    // Propagation errors are non-fatal — the methodology update itself succeeded
  }

  res.json(updated);
});

router.delete("/methodologies/:id", requireAuth, async (req, res): Promise<void> => {
  const params = MethodologyIdParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const [deleted] = await db
    .delete(methodologiesTable)
    .where(eq(methodologiesTable.id, params.data.id))
    .returning();
  if (!deleted) {
    res.status(404).json({ error: "Methodology not found" });
    return;
  }
  res.sendStatus(204);
});

export default router;
