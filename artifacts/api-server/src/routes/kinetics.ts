import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, analysisResultsTable, lotsTable } from "@workspace/db";
import { GetKineticsParams } from "@workspace/api-zod";

const router: IRouter = Router();

function calcKinetics(t0: number | null, t3: number | null, t6: number | null, minThresholdPercent: number, c0: number | null) {
  if (t3 == null || t6 == null) return { k: null, estimatedShelfLifeMonths: null };
  const k = -Math.log(t6 / t3) / (6 - 3);
  if (k <= 0) return { k, estimatedShelfLifeMonths: null };
  const cInitial = c0 ?? t0 ?? t6;
  const tValidity = -Math.log(minThresholdPercent / cInitial) / k;
  return { k, estimatedShelfLifeMonths: tValidity > 0 ? tValidity : null };
}

router.get("/protocols/:id/kinetics", async (req, res): Promise<void> => {
  const params = GetKineticsParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const results = await db
    .select()
    .from(analysisResultsTable)
    .where(eq(analysisResultsTable.protocolId, params.data.id));

  const activeParams = ["Cálcio", "Vitamina D"];
  const kineticData: Record<string, { t0vals: number[]; t3vals: number[]; t6vals: number[] }> = {};
  for (const p of activeParams) {
    kineticData[p] = { t0vals: [], t3vals: [], t6vals: [] };
  }

  for (const r of results) {
    if (!activeParams.includes(r.parameter)) continue;
    const val = r.numericResult;
    if (val == null) continue;
    const entry = kineticData[r.parameter];
    if (!entry) continue;
    if (r.period === 0) entry.t0vals.push(val);
    if (r.period === 3) entry.t3vals.push(val);
    if (r.period === 6) entry.t6vals.push(val);
  }

  const avg = (arr: number[]) => arr.length > 0 ? arr.reduce((a, b) => a + b, 0) / arr.length : null;

  const minThresholds: Record<string, number> = {
    "Cálcio": 80,
    "Vitamina D": 80,
  };

  const kineticParameters = activeParams.map((p) => {
    const d = kineticData[p];
    if (!d) return null;
    const t0 = avg(d.t0vals);
    const t3 = avg(d.t3vals);
    const t6 = avg(d.t6vals);
    const threshold = minThresholds[p] ?? 80;
    const { k, estimatedShelfLifeMonths } = calcKinetics(t0, t3, t6, threshold, t0);
    return {
      parameter: p,
      t0,
      t3,
      t6,
      k,
      estimatedShelfLifeMonths,
      minThresholdPercent: threshold,
    };
  }).filter(Boolean);

  const validShelfLives = kineticParameters
    .filter((p): p is NonNullable<typeof p> => p !== null && p.estimatedShelfLifeMonths != null)
    .map((p) => p.estimatedShelfLifeMonths as number);

  const minShelfLife = validShelfLives.length > 0 ? Math.min(...validShelfLives) : null;
  const limitingParam = kineticParameters.find((p) => p !== null && p.estimatedShelfLifeMonths === minShelfLife);

  res.json({
    protocolId: params.data.id,
    parameters: kineticParameters,
    limitingParameter: limitingParam?.parameter ?? null,
    estimatedShelfLifeMonths: minShelfLife,
    recommendedValidityMonths: minShelfLife ? Math.floor(minShelfLife * 0.67) : null,
  });
});

export default router;
