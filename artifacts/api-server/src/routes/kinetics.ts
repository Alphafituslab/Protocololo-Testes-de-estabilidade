import { Router, type IRouter } from "express";
import { eq, and } from "drizzle-orm";
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
  const lnNumerator = -Math.log(minThresholdPercent / c0);
  const estimatedShelfLifeMonths = lnNumerator > 0 ? lnNumerator / k : null;

  // t_observado = -ln(avgT6 / avgT0) / k
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

  // Dynamically discover all teor_ativo parameters present in this protocol's results.
  // This replaces the previous hardcoded ["Calcio", "Vitamina D"] list so that any
  // active ingredient — Creatina, Magnésio, Vitamina C, etc. — is handled automatically.
  const activeParamNames = Array.from(
    new Set(
      results
        .filter((r) => r.category === "teor_ativo")
        .map((r) => r.parameter),
    ),
  ).sort();

  const kineticData: Record<string, { t0vals: number[]; t3vals: number[]; t6vals: number[]; criterion: string | null }> = {};
  for (const p of activeParamNames) {
    kineticData[p] = { t0vals: [], t3vals: [], t6vals: [], criterion: null };
  }

  for (const r of results) {
    if (r.category !== "teor_ativo") continue;
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

  // ICH Q1A(R2): minimum acceptable content = 80% of declared value for all active ingredients.
  // Applied uniformly to every teor_ativo parameter discovered.
  const MIN_THRESHOLD_PERCENT = 80;

  const kineticParameters = activeParamNames
    .map((p) => {
      const d = kineticData[p];
      if (!d) return null;
      const t0 = avg(d.t0vals);
      const t3 = avg(d.t3vals);
      const t6 = avg(d.t6vals);
      const { deltaLn, k, estimatedShelfLifeMonths, tObserved } = calcKinetics(
        t0,
        t3,
        t6,
        MIN_THRESHOLD_PERCENT,
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
        minThresholdPercent: MIN_THRESHOLD_PERCENT,
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
    recommendedValidityMonths: minShelfLife ? Math.floor(minShelfLife) : null,
  });
});

export default router;
