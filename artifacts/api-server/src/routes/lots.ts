import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, lotsTable } from "@workspace/db";
import {
  CreateLotBody,
  CreateLotParams,
  UpdateLotParams,
  DeleteLotParams,
  ListLotsParams,
} from "@workspace/api-zod";

const router: IRouter = Router();

router.get("/protocols/:id/lots", async (req, res): Promise<void> => {
  const params = ListLotsParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const lots = await db
    .select()
    .from(lotsTable)
    .where(eq(lotsTable.protocolId, params.data.id))
    .orderBy(lotsTable.createdAt);
  res.json(lots);
});

router.post("/protocols/:id/lots", async (req, res): Promise<void> => {
  const params = CreateLotParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const parsed = CreateLotBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const [lot] = await db
    .insert(lotsTable)
    .values({ ...parsed.data, protocolId: params.data.id })
    .returning();
  res.status(201).json(lot);
});

router.put("/protocols/:id/lots/:lotId", async (req, res): Promise<void> => {
  const params = UpdateLotParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const parsed = CreateLotBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const [lot] = await db
    .update(lotsTable)
    .set(parsed.data)
    .where(eq(lotsTable.id, params.data.lotId))
    .returning();
  if (!lot) {
    res.status(404).json({ error: "Lot not found" });
    return;
  }
  res.json(lot);
});

router.delete("/protocols/:id/lots/:lotId", async (req, res): Promise<void> => {
  const params = DeleteLotParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const [deleted] = await db
    .delete(lotsTable)
    .where(eq(lotsTable.id, params.data.lotId))
    .returning();
  if (!deleted) {
    res.status(404).json({ error: "Lot not found" });
    return;
  }
  res.sendStatus(204);
});

export default router;
