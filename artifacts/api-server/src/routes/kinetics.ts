import { Router, type IRouter } from "express";
import { eq, and, isNull } from "drizzle-orm";
import { db, analysisResultsTable, lotsTable, protocolsTable } from "@workspace/db";
import { GetKineticsParams } from "@workspace/api-zod";

const router: IRouter = Router();

/** Gas constant J/(mol·K) */
const R = 8.314;

/**
 * Minimum content threshold for shelf-life estimation.
 * Changed to 90 % per product specification (stricter than ICH Q1A(R2) default of 80 %).
 */
const ICH_MIN_THRESHOLD_PERCENT = 90;

/**
 * First-order kinetics (ICH Q1A(R2)):
 *   Δln = −ln(T6 / T0)
 *   k   = Δln / 6   [months⁻¹]   (full T0→T6 interval)
 *   t_val = −ln(threshold / C0) / k   where C0 = T0
 */
function calcKinetics(
  t0: number | null,
  t3: number | null,
  t6: number | null,
  minThresholdPercent: number,
) {
  if (t0 == null || t6 == null || t0 <= 0 || t6 <= 0) {
    return { deltaLn: null, k: null, estimatedShelfLifeMonths: null, tObserved: null };
  }

  const deltaLn = -Math.log(t6 / t0);
  const k = deltaLn / 6;

  if (k <= 0) {
    return { deltaLn, k, estimatedShelfLifeMonths: null, tObserved: null };
  }

  const c0 = t0;

  const lnNumerator = -Math.log(minThresholdPercent / c0);
  const estimatedShelfLifeMonths = lnNumerator > 0 ? lnNumerator / k : null;

  const lnObserved = -Math.log(t6 / c0);
  const tObserved = lnObserved > 0 ? lnObserved / k : null;

  return { deltaLn, k, estimatedShelfLifeMonths, tObserved };
}

const avg = (arr: number[]) =>
  arr.length > 0 ? arr.reduce((a, b) => a + b, 0) / arr.length : null;

router.get("/protocols/:id/kinetics", async (req, res): Promise<void> => {
  const params = GetKineticsParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [protocol] = await db
    .select({ customParamsJson: protocolsTable.customParamsJson })
    .from(protocolsTable)
    .where(eq(protocolsTable.id, params.data.id));

  const results = await db
    .select()
    .from(analysisResultsTable)
    .where(eq(analysisResultsTable.protocolId, params.data.id));

  // Fetch lots to obtain study condition and temperature per lot
  const lots = await db
    .select()
    .from(lotsTable)
    .where(and(eq(lotsTable.protocolId, params.data.id), isNull(lotsTable.deletedAt)));

  // Map lotId → { studyCondition, temperatureC, humidityRh }
  const lotInfoMap = new Map<number, { studyCondition: string | null; temperatureC: number | null; humidityRh: number | null }>();
  for (const lot of lots) {
    lotInfoMap.set(lot.id, {
      studyCondition: lot.studyCondition ?? null,
      temperatureC: lot.temperatureC ?? null,
      humidityRh: lot.humidityRh ?? null,
    });
  }

  // Determine authoritative teor_ativo parameter names
  let activeParamNames: string[];
  const criterionFromParams: Record<string, string> = {};
  try {
    if (protocol?.customParamsJson) {
      const parsed = JSON.parse(protocol.customParamsJson) as Array<{
        parameter: string;
        category: string;
        criterion?: string;
      }>;
      const registered = parsed
        .filter((p) => p.category === "teor_ativo")
        .map((p) => p.parameter);

      for (const p of parsed) {
        if (p.category === "teor_ativo" && p.parameter && p.criterion) {
          criterionFromParams[p.parameter] = p.criterion;
        }
      }

      if (registered.length > 0) {
        activeParamNames = registered.filter((name) =>
          results.some((r) => r.category === "teor_ativo" && r.parameter === name),
        );
      } else {
        activeParamNames = Array.from(
          new Set(results.filter((r) => r.category === "teor_ativo").map((r) => r.parameter)),
        ).sort();
      }
    } else {
      activeParamNames = Array.from(
        new Set(results.filter((r) => r.category === "teor_ativo").map((r) => r.parameter)),
      ).sort();
    }
  } catch {
    activeParamNames = Array.from(
      new Set(results.filter((r) => r.category === "teor_ativo").map((r) => r.parameter)),
    ).sort();
  }

  type CondBucket = { t0: number[]; t3: number[]; t6: number[]; temps: number[]; hums: number[] };
  const emptyBucket = (): CondBucket => ({ t0: [], t3: [], t6: [], temps: [], hums: [] });

  const kineticParameters = activeParamNames
    .map((paramName) => {
      const criterion = criterionFromParams[paramName] ?? null;

      // Split results into long-term, accelerated, and all-lots buckets
      const lt = emptyBucket();
      const acc = emptyBucket();
      const all = emptyBucket();

      for (const r of results) {
        if (r.category !== "teor_ativo" || r.parameter !== paramName) continue;
        if (r.numericResult == null) continue;
        const val = r.numericResult;
        const info = lotInfoMap.get(r.lotId);
        const cond = info?.studyCondition ?? null;
        const tempC = info?.temperatureC ?? null;
        const humRh = info?.humidityRh ?? null;

        // Always accumulate in "all" (fallback / ICH Q1A overall)
        if (r.period === 0) all.t0.push(val);
        if (r.period === 3) all.t3.push(val);
        if (r.period === 6) all.t6.push(val);

        if (cond === "longa_duracao") {
          if (r.period === 0) lt.t0.push(val);
          if (r.period === 3) lt.t3.push(val);
          if (r.period === 6) lt.t6.push(val);
          if (tempC !== null) lt.temps.push(tempC);
          if (humRh !== null) lt.hums.push(humRh);
        } else if (cond === "acelerado") {
          if (r.period === 0) acc.t0.push(val);
          if (r.period === 3) acc.t3.push(val);
          if (r.period === 6) acc.t6.push(val);
          if (tempC !== null) acc.temps.push(tempC);
          if (humRh !== null) acc.hums.push(humRh);
        }
      }

      // Average temperatures per condition
      const condTempLt = avg(lt.temps);
      const condTempAcc = avg(acc.temps);
      const condHumLt = avg(lt.hums);
      const condHumAcc = avg(acc.hums);

      // Choose primary data source for main ICH Q1A calculation:
      // prefer long-term bucket, fall back to all-lots
      const hasLt = lt.t3.length > 0 || lt.t6.length > 0;
      const primaryBucket = hasLt ? lt : all;

      const t0 = avg(primaryBucket.t0);
      const t3 = avg(primaryBucket.t3);
      const t6 = avg(primaryBucket.t6);

      const { deltaLn, k, estimatedShelfLifeMonths, tObserved } = calcKinetics(
        t0, t3, t6, ICH_MIN_THRESHOLD_PERCENT,
      );

      // ── Condition-specific k values ──
      const ltKinetics = calcKinetics(avg(lt.t0), avg(lt.t3), avg(lt.t6), ICH_MIN_THRESHOLD_PERCENT);
      const accKinetics = calcKinetics(avg(acc.t0), avg(acc.t3), avg(acc.t6), ICH_MIN_THRESHOLD_PERCENT);
      const kLongTerm = ltKinetics.k;
      const kAccelerated = accKinetics.k;

      // ── Arrhenius: requires k at two temps and ΔT > 1°C ──
      let ea: number | null = null;
      let arrheniusA: number | null = null;
      let shelfLifeArrhenius: number | null = null;

      if (
        kLongTerm !== null && kLongTerm > 0 &&
        kAccelerated !== null && kAccelerated > 0 &&
        condTempLt !== null && condTempAcc !== null &&
        Math.abs(condTempAcc - condTempLt) > 1
      ) {
        const T1 = condTempLt + 273.15;   // Long-term in Kelvin
        const T2 = condTempAcc + 273.15;  // Accelerated in Kelvin

        // Ea = R × ln(k_acc / k_lt) / (1/T1 - 1/T2)  [J/mol]
        const eaJmol = R * Math.log(kAccelerated / kLongTerm) / (1 / T1 - 1 / T2);

        if (eaJmol > 0) {
          ea = eaJmol / 1000; // Convert to kJ/mol for display
          arrheniusA = kLongTerm * Math.exp((eaJmol) / (R * T1));

          // Shelf life at long-term temperature using k_lt
          const c0lt = avg(lt.t0) ?? avg(lt.t6) ?? avg(all.t0) ?? avg(all.t6);
          if (c0lt !== null) {
            const lnNum = -Math.log(ICH_MIN_THRESHOLD_PERCENT / c0lt);
            shelfLifeArrhenius = lnNum > 0 ? lnNum / kLongTerm : null;
          }
        }
      }

      return {
        parameter: paramName,
        // Use primary-bucket averages (long-term preferred) so displayed T0/T3/T6
        // are consistent with the k and shelf-life calculation inputs.
        t0: avg(primaryBucket.t0),
        t3: avg(primaryBucket.t3),
        t6: avg(primaryBucket.t6),
        deltaLn,
        k,
        estimatedShelfLifeMonths,
        tObserved,
        minThresholdPercent: ICH_MIN_THRESHOLD_PERCENT,
        criterion: criterion ??
          (results.find((r) => r.category === "teor_ativo" && r.parameter === paramName && r.criterion)?.criterion ?? null),
        kLongTerm,
        kAccelerated,
        conditionTempLt: condTempLt,
        conditionTempAcc: condTempAcc,
        conditionHumLt: condHumLt,
        conditionHumAcc: condHumAcc,
        ea,
        arrheniusA,
        shelfLifeArrhenius,
      };
    })
    .filter(Boolean);

  // Limiting parameter: prefer Arrhenius shelf life if available, else ICH Q1A
  const getEffectiveShelfLife = (p: (typeof kineticParameters)[0]) =>
    p?.shelfLifeArrhenius ?? p?.estimatedShelfLifeMonths ?? null;

  const validShelfLives = kineticParameters
    .map((p) => getEffectiveShelfLife(p))
    .filter((v): v is number => v !== null);

  const minShelfLife = validShelfLives.length > 0 ? Math.min(...validShelfLives) : null;
  const limitingParam = kineticParameters.find(
    (p) => getEffectiveShelfLife(p) === minShelfLife,
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
