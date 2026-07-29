import { Router, type IRouter } from "express";
import { eq, inArray } from "drizzle-orm";
import { db, methodologiesTable, protocolsTable, protocolSignaturesTable } from "@workspace/db";
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
  /** When false, signed protocols are skipped and returned in skippedSigned */
  propagateSignedProtocols: z.boolean().optional(),
});

const PropagateToSignedBody = z.object({
  protocolIds: z.array(z.number().int().positive()),
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

  // Only overwrite category / subject / parameter / criteria when they are
  // explicitly provided (non-undefined). A missing field means "keep existing".
  const [updated] = await db
    .update(methodologiesTable)
    .set({
      shortName: body.data.shortName,
      citation: body.data.citation,
      category:  body.data.category  !== undefined ? body.data.category  : old.category,
      subject:   body.data.subject   !== undefined ? body.data.subject   : old.subject,
      parameter: body.data.parameter !== undefined ? body.data.parameter : old.parameter,
      criteria:  body.data.criteria  !== undefined ? body.data.criteria  : old.criteria,
    })
    .where(eq(methodologiesTable.id, params.data.id))
    .returning();
  if (!updated) {
    res.status(404).json({ error: "Methodology not found" });
    return;
  }

  const oldShortName = old.shortName;
  const newShortName = body.data.shortName;
  const newCitation = body.data.citation;
  // Use the new criteria if explicitly provided; otherwise fall back to the old value
  const newCriteria = body.data.criteria !== undefined ? body.data.criteria : old.criteria;
  const propagateSignedProtocols = body.data.propagateSignedProtocols ?? true;

  const skippedSigned: Array<{ id: number; productName: string }> = [];

  try {
    // Determine which protocol IDs have at least one signature
    const signedRows = await db
      .select({ protocolId: protocolSignaturesTable.protocolId })
      .from(protocolSignaturesTable);
    const signedProtocolIds = new Set(signedRows.map(r => r.protocolId));

    const allProtocols = await db
      .select({
        id: protocolsTable.id,
        productName: protocolsTable.productName,
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

      // Skip signed protocols when propagateSignedProtocols is false
      if (!propagateSignedProtocols && signedProtocolIds.has(protocol.id)) {
        skippedSigned.push({ id: protocol.id, productName: protocol.productName });
        continue;
      }

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

  res.json({ ...updated, skippedSigned });
});

/** Propagate the current methodology criteria/citation to specific signed protocols */
router.post("/methodologies/:id/propagate-to-signed", requireAuth, async (req, res): Promise<void> => {
  const params = MethodologyIdParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }

  const body = PropagateToSignedBody.safeParse(req.body);
  if (!body.success) { res.status(400).json({ error: body.error.message }); return; }

  const [methodology] = await db
    .select()
    .from(methodologiesTable)
    .where(eq(methodologiesTable.id, params.data.id));
  if (!methodology) { res.status(404).json({ error: "Methodology not found" }); return; }

  const { shortName, citation, criteria } = methodology;

  const protocols = await db
    .select({
      id: protocolsTable.id,
      paramMethodsJson: protocolsTable.paramMethodsJson,
      paramMethodsCitationsJson: protocolsTable.paramMethodsCitationsJson,
      customParamsJson: protocolsTable.customParamsJson,
    })
    .from(protocolsTable)
    .where(inArray(protocolsTable.id, body.data.protocolIds));

  let updatedCount = 0;

  for (const protocol of protocols) {
    let paramMethods: Record<string, string> = {};
    try {
      if (protocol.paramMethodsJson) paramMethods = JSON.parse(protocol.paramMethodsJson) as Record<string, string>;
    } catch { continue; }

    const affectedParams = Object.entries(paramMethods)
      .filter(([, method]) => method === shortName)
      .map(([paramName]) => paramName);

    if (affectedParams.length === 0) continue;

    let paramCitations: Record<string, string> = {};
    try {
      if (protocol.paramMethodsCitationsJson) paramCitations = JSON.parse(protocol.paramMethodsCitationsJson) as Record<string, string>;
    } catch {}
    for (const paramName of affectedParams) {
      paramCitations[paramName] = citation;
    }

    let customParams: Array<{ parameter: string; criterion?: string; [key: string]: unknown }> = [];
    let customParamsChanged = false;
    try {
      if (protocol.customParamsJson) customParams = JSON.parse(protocol.customParamsJson) as typeof customParams;
    } catch {}
    if (criteria) {
      customParams = customParams.map((p) => {
        if (affectedParams.includes(p.parameter)) {
          customParamsChanged = true;
          return { ...p, criterion: criteria };
        }
        return p;
      });
    }

    await db
      .update(protocolsTable)
      .set({
        paramMethodsCitationsJson: JSON.stringify(paramCitations),
        ...(customParamsChanged ? { customParamsJson: JSON.stringify(customParams) } : {}),
      })
      .where(eq(protocolsTable.id, protocol.id));

    updatedCount++;
  }

  res.json({ updated: updatedCount });
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
