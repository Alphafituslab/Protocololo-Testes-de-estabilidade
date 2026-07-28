import app from "./app";
import { logger } from "./lib/logger";
import { runAllSeeds, emergencyRestoreIfNeeded } from "./seed";
import { startBackupScheduler } from "./lib/backup-scheduler";
import { db, protocolsTable } from "@workspace/db";
import { sql } from "drizzle-orm";

/** ONE-TIME FIX: reset updated_at = created_at for any protocol where
 *  updated_at was set today by spurious debounced auto-saves (no real edit).
 *  Safe to run multiple times (idempotent after the first run). */
async function resetSpuriousUpdatedAt(): Promise<void> {
  try {
    const result = await db.execute(
      sql`UPDATE protocols SET updated_at = created_at WHERE updated_at::date = CURRENT_DATE`
    );
    const count = (result as unknown as { rowCount?: number }).rowCount ?? 0;
    if (count > 0) logger.info({ count }, "resetSpuriousUpdatedAt: cleared today timestamps");
  } catch (e) {
    logger.warn({ err: e }, "resetSpuriousUpdatedAt: skipped");
  }
}

/** ONE-TIME FIX: restore company identification data for protocol ID 3
 *  (Menaquinona-7 / Vitamina K2) which lost its identification fields.
 *  Data recovered from protocol ID 45 (same product, same company).
 *  Idempotent — skips if company_name is already fully populated. */
async function restoreProtocol3Identification(): Promise<void> {
  try {
    const rows = await db.execute(sql`SELECT company_name FROM protocols WHERE id = 3 LIMIT 1`);
    const existing = (rows as unknown as { rows?: {company_name?: string}[] }).rows?.[0]?.company_name ?? "";
    if (existing.includes("LABORATÓRIO")) { return; } // already restored
    await db.execute(sql`UPDATE protocols SET
      company_name        = 'ALPHAFITUS LABORATÓRIO NUTRACÊUTICO LTDA',
      cnpj                = '01.481.057/0001-12',
      ie                  = '253385210',
      address             = 'Agenor Martinho Lima 41',
      cep                 = '88823290',
      product_type        = 'suplemento Alimentar em Capsula',
      packaging_type      = 'Pote Pead -Polietileno de alta densidade 220 ml',
      active_ingredients  = 'Menaquinona-7 (vitamina k).',
      excipients          = 'Antiumectante dióxido de silicio, lubrificante estearato de Magnesio e formador de massa talco.',
      capsule_composition = 'Cápsula: Água purificada, gelificante gelatina e opacificante dióxido de titânio.',
      study_objective     = 'O presente estudo tem como objetivo avaliar a estabilidade físico-química e microbiológica do Suplemento Alimentar em Cápsulas com Menaquinona -7 (vitamina k2) 60 capsulas, quando submetido a condições aceleradas de armazenamento (40°C ± 2°C / 75% ± 5% UR), assegurando que o produto mantenha suas características de qualidade, segurança, eficácia e o teor do ativo ao longo do período de estudo.',
      test_intervals      = '0, 3, 6 meses',
      sampling_temp       = '23,1°C',
      sampling_humidity   = '55% UR',
      reception_temp      = '23,2°C',
      reception_humidity  = '56% UR',
      elaborated_by       = 'Edson Zaldguer — Representante Legal CRQ: 13303282',
      approved_by         = 'Clayton Borges da Silva — Representante Legal CRF: 18580',
      issued_by           = 'Edson Zaldguer — Responsável Técnica CRQ: 13303282',
      senior_analyst      = 'Clayton Borges da Silva — Representante Legal CRF: 18580',
      issued_by_email     = 'edsonzaldguer@alphafitus.com.br',
      senior_analyst_email= 'claytonborges@alphafitus.com',
      validity_months     = 24,
      study_start_date    = '2024-11-29',
      study_end_date      = '2025-05-28'
    WHERE id = 3`);
    logger.info("restoreProtocol3Identification: completed");
  } catch (e) {
    logger.warn({ err: e }, "restoreProtocol3Identification: skipped");
  }
}

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

app.listen(port, (err) => {
  if (err) {
    logger.error({ err }, "Error listening on port");
    process.exit(1);
  }

  logger.info({ port }, "Server listening");
  resetSpuriousUpdatedAt().catch((e) => logger.error({ err: e }, "resetSpuriousUpdatedAt error"));
  restoreProtocol3Identification().catch((e) => logger.error({ err: e }, "restoreProtocol3 error"));
  runAllSeeds().catch((e) => logger.error({ err: e }, "Seed error"));
  startBackupScheduler();
  // Restauração de emergência em background — roda APÓS o servidor já
  // estar respondendo ao healthcheck, para não ser morta pelo timeout do deploy.
  setTimeout(() => {
    emergencyRestoreIfNeeded().catch((e) => logger.error({ err: e }, "Emergency restore error"));
  }, 5000);
});
