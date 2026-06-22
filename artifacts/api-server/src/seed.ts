import { db, ativoReferencesTable } from "@workspace/db";
import { sql } from "drizzle-orm";
import { logger } from "./lib/logger";

const DEFAULT_ATIVOS = [
  "Ácido Hialurônico",
  "Beta-Glucana",
  "Biotina (Vitamina H)",
  "Cálcio",
  "Coenzima Q10",
  "Colágeno Hidrolisado",
  "Cobre",
  "Creatina",
  "Cromo",
  "Extrato de Açaí",
  "Extrato de Cúrcuma",
  "Extrato de Própolis",
  "Ferro",
  "Iodo",
  "Inulina",
  "L-Carnitina",
  "L-Glutamina",
  "Licopeno",
  "Luteína",
  "Magnésio",
  "Manganês",
  "Ômega-3 (EPA+DHA)",
  "Potássio",
  "Probióticos (UFC/g)",
  "Resveratrol",
  "Selênio",
  "Vitamina A (Retinol)",
  "Vitamina B1 (Tiamina)",
  "Vitamina B2 (Riboflavina)",
  "Vitamina B3 (Niacina)",
  "Vitamina B5 (Ác. Pantotênico)",
  "Vitamina B6 (Piridoxina)",
  "Vitamina B9 (Ác. Fólico)",
  "Vitamina B12 (Cobalamina)",
  "Vitamina C (Ácido Ascórbico)",
  "Vitamina D",
  "Vitamina E (Tocoferol)",
  "Vitamina K",
  "Zeaxantina",
  "Zinco",
];

export async function seedAtivoReferences(): Promise<void> {
  try {
    const [row] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(ativoReferencesTable);
    const existing = row?.count ?? 0;

    if (existing > 0) {
      logger.info({ existing }, "ativo_references already seeded, skipping");
      return;
    }

    const rows = DEFAULT_ATIVOS.map((name) => ({
      parameter: name,
      minValue: null,
      maxValue: null,
      unit: "mg",
      notes: null,
    }));

    await db.insert(ativoReferencesTable).values(rows);
    logger.info({ count: rows.length }, "ativo_references seeded with default list");
  } catch (err) {
    logger.error({ err }, "Failed to seed ativo_references — continuing startup");
  }
}
