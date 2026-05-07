import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, analysisResultsTable, lotsTable } from "@workspace/db";
import { GetKineticsParams } from "@workspace/api-zod";

const router: IRouter = Router();

function calcKinetics(
  t0: number | null,
  t3: number | null,
  t6: number | null,
  minThresholdPercent: number,
) {
  if (t3 == null || t6 == null || t3 <= 0 || t6 <= 0) {
    return { deltaLn: null, k: null, estimatedShelfLifeMonths: null, tObserved: null };
  }

  // Δln = -ln(avgT6 / avgT3)  [Excel: I3 = -LN(G4/G3)]
  const deltaLn = -Math.log(t6 / t3);

  // k per month = Δln / 3  [Excel: L3 = K3/3]
  const k = deltaLn / 3;

  if (k <= 0) {
    return { deltaLn, k, estimatedShelfLifeMonths: null, tObserved: null };
  }

  const c0 = t0 ?? t6;

  // t_validade = -ln(threshold / avgT0) / k  [Excel: K8 = -LN(G10/G8), L8 = K8/M3]
  // threshold and c0 must be in the same units (both % or both fraction)
  const lnNumerator = -Math.log(minThresholdPercent / c0);
  const estimatedShelfLifeMonths = lnNumerator > 0 ? lnNumerator / k : null;

  // t_observado = -ln(avgT6 / avgT0) / k  [Excel Sheet 2: K8 = -LN(G4/G8), L8 = K8/M3]
  const lnObserved = -Math.log(t6 / c0);
  const tObserved = lnObserved > 0 && lnObserved / k > 0 ? lnObserved / k : null;

  return { deltaLn, k, estimatedShelfLifeMonths, tObserved };
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

  const activeParams = ["Calcio", "Vitamina D"];
  const kineticData: Record<string, { t0vals: number[]; t3vals: number[]; t6vals: number[]; criterion: string | null }> = {};
  for (const p of activeParams) {
    kineticData[p] = { t0vals: [], t3vals: [], t6vals: [], criterion: null };
  }

  for (const r of results) {
    if (!activeParams.includes(r.parameter)) continue;
    const entry = kineticData[r.parameter];
    if (!entry) continue;
    if (!entry.criterion && r.criterion) entry.criterion = r.criterion;
    const val = r.numericResult;
    if (val == null) continue;
    if (r.period === 0) entry.t0vals.push(val);
    if (r.period === 3) entry.t3vals.push(val);
    if (r.period === 6) entry.t6vals.push(val);
  }

  const avg = (arr: number[]) =>
    arr.length > 0 ? arr.reduce((a, b) => a + b, 0) / arr.length : null;

  // Thresholds in the same units as stored results (% of declared value, e.g. 80 = 80%)
  const minThresholds: Record<string, number> = {
    Calcio: 80,
    "Vitamina D": 80,
  };

  const kineticParameters = activeParams
    .map((p) => {
      const d = kineticData[p];
      if (!d) return null;
      const t0 = avg(d.t0vals);
      const t3 = avg(d.t3vals);
      const t6 = avg(d.t6vals);
      const threshold = minThresholds[p] ?? 80;
      const { deltaLn, k, estimatedShelfLifeMonths, tObserved } = calcKinetics(
        t0,
        t3,
        t6,
        threshold,
      );
      return {
        parameter: p,
        t0,
        t3,
        t6,
        deltaLn,
        k,
        estimatedShelfLifeMonths,
        tObserved,
        minThresholdPercent: threshold,
        criterion: d.criterion ?? null,
      };
    })
    .filter(Boolean);

  const validShelfLives = kineticParameters
    .filter(
      (p): p is NonNullable<typeof p> => p !== null && p.estimatedShelfLifeMonths != null,
    )
    .map((p) => p.estimatedShelfLifeMonths as number);

  const minShelfLife = validShelfLives.length > 0 ? Math.min(...validShelfLives) : null;
  const limitingParam = kineticParameters.find(
    (p) => p !== null && p.estimatedShelfLifeMonths === minShelfLife,
  );

  res.json({
    protocolId: params.data.id,
    parameters: kineticParameters,
    limitingParameter: limitingParam?.parameter ?? null,
    estimatedShelfLifeMonths: minShelfLife,
    // Direct shelf-life in whole months — no arbitrary safety factor
    recommendedValidityMonths: minShelfLife ? Math.floor(minShelfLife) : null,
  });
});

export default router;
