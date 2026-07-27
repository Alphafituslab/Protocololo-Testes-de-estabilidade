import {
  db,
  pool,
  ativoReferencesTable,
  methodologiesTable,
  bibliographicReferencesTable,
  protocolReferencesTable,
  protocolsTable,
  containerTypesTable,
  capsuleTypesTable,
  productTypesTable,
} from "@workspace/db";
import { eq, sql } from "drizzle-orm";
import { logger } from "./lib/logger";
import { downloadCloudBackup } from "./lib/backup-scheduler";
import { runRestore } from "./lib/backup-restore";

// ── Ativos ANVISA ─────────────────────────────────────────────────────────────
const DEFAULT_ATIVOS = [
  "Ácido Hialurônico", "Beta-Glucana", "Biotina (Vitamina H)", "Cálcio",
  "Coenzima Q10", "Colágeno Hidrolisado", "Cobre", "Creatina", "Cromo",
  "Extrato de Açaí", "Extrato de Cúrcuma", "Extrato de Própolis", "Ferro",
  "Inulina", "Iodo", "L-Carnitina", "L-Glutamina", "Licopeno", "Luteína",
  "Magnésio", "Manganês", "Ômega-3 (EPA+DHA)", "Potássio",
  "Probióticos (UFC/g)", "Resveratrol", "Selênio", "Vitamina A (Retinol)",
  "Vitamina B1 (Tiamina)", "Vitamina B2 (Riboflavina)", "Vitamina B3 (Niacina)",
  "Vitamina B5 (Ác. Pantotênico)", "Vitamina B6 (Piridoxina)",
  "Vitamina B9 (Ác. Fólico)", "Vitamina B12 (Cobalamina)",
  "Vitamina C (Ácido Ascórbico)", "Vitamina D", "Vitamina E (Tocoferol)",
  "Vitamina K", "Zeaxantina", "Zinco",
];

// ── Metodologias analíticas ───────────────────────────────────────────────────
const DEFAULT_METHODOLOGIES = [
  // Físico-química
  { shortName: "FB 7ª ed.", citation: "BRASIL. ANVISA. Farmacopeia Brasileira, 7ª edição. Brasília: ANVISA, 2019.", category: "Fisico-Quimica", subject: "Geral", parameter: "", criteria: "" },
  { shortName: "PH", citation: "Métodos físico-químicos para análise de alimentos, 4. ed. São Paulo: Instituto Adolfo Lutz, 2008. Método: 017/IV.", category: "Fisico-Quimica", subject: "pH", parameter: "PH", criteria: "Conforme especificação do produto" },
  { shortName: "Umidade", citation: "Métodos físico-químicos para análise de alimentos, 4. ed. São Paulo: Instituto Adolfo Lutz, 2008. Método: 012/IV.", category: "Fisico-Quimica", subject: "Umidade", parameter: "Umidade", criteria: "≤ 5%" },
  { shortName: "Cor", citation: "Métodos físico-químicos para análise de alimentos, 4. ed. São Paulo: Instituto Adolfo Lutz, 2008. Método: 060/IV.", category: "Fisico-Quimica", subject: "Cor / Aspecto visual", parameter: "Cor", criteria: "Conforme padrão aprovado" },
  { shortName: "Odor", citation: "Métodos físico-químicos para análise de alimentos, 4. ed. São Paulo: Instituto Adolfo Lutz, 2008. Método: 060/IV.", category: "Fisico-Quimica", subject: "Odor", parameter: "Odor", criteria: "Conforme padrão aprovado" },
  { shortName: "Aparência", citation: "Métodos físico-químicos para análise de alimentos, 4. ed. São Paulo: Instituto Adolfo Lutz, 2008. Método: 060/IV.", category: "Fisico-Quimica", subject: "Aparência", parameter: "Aparência", criteria: "Conforme padrão aprovado" },
  { shortName: "Cinzas", citation: "Métodos físico-químicos para análise de alimentos, 4. ed. São Paulo: Instituto Adolfo Lutz, 2008. Método: 018/IV.", category: "Fisico-Quimica", subject: "Cinzas", parameter: "Cinzas", criteria: "≤ 50%" },
  { shortName: "Dissolução", citation: "Farmacopeia Brasileira, 7ª edição (2024), Método Geral 5.5.1.5 – Dissolução.\nAplicação: ensaios de dissolução aplicáveis a formas farmacêuticas sólidas orais", category: "Fisico-Quimica", subject: "Dissolução de Cápsulas", parameter: "Dissolução", criteria: "Q ≥ 80% em 30 min" },
  { shortName: "Massa media das capsulas", citation: "Farmacopeia Brasileira, 7ª edição (2024), Método Geral 5.1.1 – Determinação de Peso, MG5.1.1-00.\nAplicação: controle de peso aplicável a formas farmacêuticas sólidas e semissólidas, conforme critérios compendiais.", category: "Fisico-Quimica", subject: "Massa média das cápsulas", parameter: "Massa media das capsulas", criteria: "± 7,5%" },
  { shortName: "Kcal", citation: "Métodos físico-químicos para análise de alimentos, 4. ed. São Paulo: Instituto Adolfo Lutz, 2008.", category: "Fisico-Quimica", subject: "Valor energético", parameter: "Kcal", criteria: "Conforme declaração do rótulo" },
  { shortName: "Sodio", citation: "Métodos físico-químicos para análise de alimentos, 4. ed. São Paulo: Instituto Adolfo Lutz, 2008. Método: 017/IV.", category: "Fisico-Quimica", subject: "Sódio", parameter: "Sodio", criteria: "≤ 5 mg — declarar 0" },
  { shortName: "Sódio", citation: "Métodos físico-químicos para análise de alimentos, 4. ed. São Paulo: Instituto Adolfo Lutz, 2008. Método: 017/IV.", category: "Fisico-Quimica", subject: "Sódio", parameter: "Sódio", criteria: "≤ 5 mg — declarar 0" },
  // Microbiológica
  { shortName: "RDC 724/2022", citation: "BRASIL. ANVISA. Resolução RDC nº 724, de 1º de julho de 2022. Dispõe sobre os padrões microbiológicos de alimentos e sua aplicação. Brasília: ANVISA, 2022.", category: "Microbiologica", subject: "Padrões microbiológicos", parameter: "Coliformes totais", criteria: "≤ 10 UFC/g" },
  { shortName: "Coliformes totais", citation: "CompactDry™ CF: Instructions for Use. Tokyo: Nissui Pharmaceutical Co., Ltd., ano vigente.", category: "Microbiologica", subject: "Coliformes totais", parameter: "Coliformes totais", criteria: "≤ 10 UFC/g" },
  { shortName: "Salmonella spp.", citation: "CompactDry™ SL: Instructions for Use. Tokyo: Nissui Pharmaceutical Co., Ltd., ano vigente.", category: "Microbiologica", subject: "Salmonella spp.", parameter: "Salmonella spp.", criteria: "Ausente em 25 g" },
  { shortName: "Estafilococos coagulase+", citation: "CompactDry™ X-SA: Instructions for Use. Tokyo: Nissui Pharmaceutical Co., Ltd., ano vigente.", category: "Microbiologica", subject: "Estafilococos coagulase+", parameter: "Estafilococos coagulase+", criteria: "≤ 10 UFC/g" },
  { shortName: "Bolores e leveduras", citation: "CompactDry™ YMR / YM: Instructions for Use. Tokyo: Nissui Pharmaceutical Co., Ltd., ano vigente.", category: "Microbiologica", subject: "Bolores e leveduras", parameter: "Bolores e leveduras", criteria: "≤ 100 UFC/g" },
  { shortName: "Escherichia coli", citation: "CompactDry™ EC: Instructions for Use. Tokyo: Nissui Pharmaceutical Co., Ltd., ano vigente.", category: "Microbiologica", subject: "Escherichia coli", parameter: "Escherichia coli", criteria: "Ausente em 1 g" },
  { shortName: "Enterobacteriaceae", citation: "CompactDry™ ETB: Instructions for Use. Tokyo: Nissui Pharmaceutical Co., Ltd., ano vigente.", category: "Microbiologica", subject: "Enterobacteriaceae", parameter: "Enterobacteriaceae", criteria: "Ausente" },
  { shortName: "Contagem de Micro-organismos Aeróbios Mesófilos", citation: "INTERNATIONAL ORGANIZATION FOR STANDARDIZATION. ISO 4833-1:2013 — Microbiology of the food chain — Horizontal method for the enumeration of microorganisms — Part 1: Colony count at 30°C by the pour plate technique. Geneva: ISO, 2013.", category: "Microbiologica", subject: "Aeróbios mesófilos", parameter: "Contagem de Micro-organismos Aeróbios Mesófilos", criteria: "≤ 1000 UFC/g" },
  // Teor do ativo
  { shortName: "Calcio", citation: "Farmacopeia Brasileira, 7ª edição (2024), Método Geral IF077-00 – Determinação de Cálcio por Titulação Complexométricas.", category: "Teor do Ativo", subject: "Cálcio", parameter: "Calcio", criteria: "Mín. 80% do valor declarado" },
  { shortName: "Cálcio", citation: "Farmacopeia Brasileira, 7ª edição (2024), Método Geral IF077-00 – Determinação de Cálcio por Titulação Complexométricas.", category: "Teor do Ativo", subject: "Cálcio", parameter: "Cálcio", criteria: "Mín. 80% do valor declarado" },
  { shortName: "Vitamina D", citation: "Japanese Pharmacopoeia (JP), 18th ed. Tokyo: Ministry of Health, Labour and Welfare (MHLW), 2021. Monograph \"Cholecalciferol\" – Compendial criteria for identity, purity and assay.", category: "Teor do Ativo", subject: "Vitamina D", parameter: "Vitamina D", criteria: "Mín. 80% do valor declarado" },
  { shortName: "Vitamina C (Ácido Ascórbico)", citation: "Farmacopeia Brasileira, 7ª edição. Método Geral IF011-01 – Determinação de Ácido Ascórbico por Cromatografia Líquida de Alta Eficiência (CLAE/HPLC).", category: "Teor do Ativo", subject: "Vitamina C", parameter: "Vitamina C (Ácido Ascórbico)", criteria: "Mín. 80% do valor declarado" },
  { shortName: "Vitamina E (Tocoferol)", citation: "United States Pharmacopeia–National Formulary (USP–NF), 2023, Monografia \"Vitamin E\"", category: "Teor do Ativo", subject: "Vitamina E", parameter: "Vitamina E (Tocoferol)", criteria: "Mín. 80% do valor declarado" },
  { shortName: "HPLC — Vitaminas B", citation: "Farmacopeia Brasileira, 6ª edição (2019), Monografia IF145-00 – Cloridrato de Tiamina", category: "Teor do Ativo", subject: "Complexo B", parameter: "Vitamina B1 (Tiamina)", criteria: "Mín. 80% do valor declarado" },
  { shortName: "Magnesio", citation: "Farmacopeia Brasileira, 7ª edição, Volume 1, Capítulo Geral MG.5.3.3.4 (Titulações Complexométricas)", category: "Teor do Ativo", subject: "Magnésio", parameter: "Magnesio", criteria: "Mín. 80% do valor declarado" },
  { shortName: "Magnésio", citation: "Farmacopeia Brasileira, 7ª edição, Volume 1, Capítulo Geral MG.5.3.3.4 (Titulações Complexométricas)", category: "Teor do Ativo", subject: "Magnésio", parameter: "Magnésio", criteria: "Mín. 80% do valor declarado" },
  { shortName: "Zinco", citation: "Farmacopeia Brasileira, 7ª edição (2024), Método Geral 5.3.3.4 – Titulações Complexométricas, aplicado à determinação de zinco", category: "Teor do Ativo", subject: "Zinco", parameter: "Zinco", criteria: "Mín. 80% do valor declarado" },
  { shortName: "Ferro", citation: "Farmacopeia Brasileira, 6ª edição (2019), Monografia IF316-00 – Sulfato Ferroso Heptaidratado", category: "Teor do Ativo", subject: "Ferro", parameter: "Ferro", criteria: "Mín. 80% do valor declarado" },
  { shortName: "GC-FID — Ômega-3", citation: "", category: "Teor do Ativo", subject: "Ômega-3", parameter: "Ômega-3 (EPA+DHA)", criteria: "Mín. 80% do valor declarado" },
  // Embalagem
  { shortName: "Torque de tampa", citation: "Procedimento Operacional Padrão (POP) nº 047. Içara: Alphafitus Suplementos Ltda., 2024. Documento interno.", category: "Embalagem", subject: "Torque de tampa", parameter: "Torque de tampa", criteria: "Conforme especificação do fabricante" },
  { shortName: "Selagem por indução", citation: "Procedimento Operacional Padrão (POP) nº 049. Içara: Alphafitus Suplementos Ltda., 2024. Documento interno.", category: "Embalagem", subject: "Selagem por indução", parameter: "Selagem por indução", criteria: "Sem falhas de selagem" },
  { shortName: "Integridade selagem", citation: "Procedimento Operacional Padrão (POP) nº 050. Içara: Alphafitus Suplementos Ltda., 2024. Documento interno.", category: "Embalagem", subject: "Integridade de embalagem", parameter: "Integridade selagem", criteria: "Ausência de vazamento" },
  { shortName: "Headspace", citation: "BRASIL. Agência Nacional de Vigilância Sanitária. Farmacopeia Brasileira. 6. ed. Brasília: ANVISA, 2019. v. 1.", category: "Embalagem", subject: "Headspace", parameter: "Headspace", criteria: "15% - 20%" },
  // Estabilidade
  { shortName: "ICH Q1A(R2)", citation: "INTERNATIONAL COUNCIL FOR HARMONISATION. ICH Q1A(R2) — Stability Testing of New Drug Substances and Products. Geneva: ICH, 2003.", category: "Estabilidade", subject: "Condições de armazenamento", parameter: "", criteria: "" },
  { shortName: "RDC 318/2019", citation: "BRASIL. ANVISA. Resolução RDC nº 318, de 6 de novembro de 2019. Dispõe sobre os estudos de estabilidade de suplementos alimentares. Brasília: ANVISA, 2019.", category: "Estabilidade", subject: "Estabilidade de suplementos", parameter: "", criteria: "" },
];

// ── Referências bibliográficas ────────────────────────────────────────────────
const DEFAULT_BIBLIOGRAPHIC = [
  { titulo: "Farmacopeia Brasileira, 7ª edição", autores: null, ano: 2019, fonte: "ANVISA — Agência Nacional de Vigilância Sanitária", volume: null, numero: null, paginas: null, doi: "https://www.gov.br/anvisa/pt-br/assuntos/farmacopeia/farmacopeia-brasileira/publicacoes-vigentes", descricao: "Compêndio oficial de métodos analíticos adotados no Brasil para controle de qualidade de medicamentos e correlatos.", tipoReferencia: "regulamentacao", autoInclude: true },
  { titulo: "Resolução RDC nº 724/2022 — Padrões microbiológicos de alimentos", autores: null, ano: 2022, fonte: "ANVISA — Agência Nacional de Vigilância Sanitária", volume: null, numero: null, paginas: null, doi: "https://www.in.gov.br/en/web/dou/-/resolucao-rdc-n-724-de-1-de-julho-de-2022", descricao: "Estabelece os padrões microbiológicos para alimentos destinados ao consumo humano e os critérios para sua aplicação.", tipoReferencia: "regulamentacao", autoInclude: true },
  { titulo: "Resolução RDC nº 243/2018 — Suplementos Alimentares", autores: null, ano: 2018, fonte: "ANVISA — Agência Nacional de Vigilância Sanitária", volume: null, numero: null, paginas: null, doi: "https://bvsms.saude.gov.br/bvs/saudelegis/anvisa/2018/rdc0243_26_07_2018.html", descricao: "Dispõe sobre os requisitos sanitários dos suplementos alimentares.", tipoReferencia: "regulamentacao", autoInclude: true },
  { titulo: "Resolução RDC nº 429/2020 — Rotulagem Nutricional", autores: null, ano: 2020, fonte: "ANVISA — Agência Nacional de Vigilância Sanitária", volume: null, numero: null, paginas: null, doi: "https://www.in.gov.br/en/web/dou/-/resolucao-rdc-n-429-de-8-de-outubro-de-2020-282070599", descricao: "Dispõe sobre a rotulagem nutricional dos alimentos embalados.", tipoReferencia: "regulamentacao", autoInclude: true },
  { titulo: "Resolução RDC nº 318/2019 — Estudos de Estabilidade de Suplementos Alimentares", autores: null, ano: 2019, fonte: "ANVISA — Agência Nacional de Vigilância Sanitária", volume: null, numero: null, paginas: null, doi: "https://bvsms.saude.gov.br/bvs/saudelegis/anvisa/2019/rdc0318_06_11_2019.html", descricao: "Dispõe sobre os estudos de estabilidade de suplementos alimentares.", tipoReferencia: "regulamentacao", autoInclude: true },
  { titulo: "Instrução Normativa nº 76/2020 — Limites de nutrientes para suplementos", autores: null, ano: 2020, fonte: "ANVISA — Agência Nacional de Vigilância Sanitária", volume: null, numero: null, paginas: null, doi: "https://www.in.gov.br/en/web/dou/-/instrucao-normativa-in-n-76-de-5-de-novembro-de-2020-287116874", descricao: "Estabelece as listas de constituintes, de limites de uso, de alegações e de rotulagem complementar dos suplementos alimentares.", tipoReferencia: "regulamentacao", autoInclude: true },
  { titulo: "Instrução Normativa nº 28/2018 — Suplementos vitamínicos e minerais", autores: null, ano: 2018, fonte: "ANVISA — Agência Nacional de Vigilância Sanitária", volume: null, numero: null, paginas: null, doi: "https://bvsms.saude.gov.br/bvs/saudelegis/anvisa/2018/int0028_26_07_2018.html", descricao: "Estabelece listas de vitaminas e minerais com seus respectivos valores de ingestão diária de referência.", tipoReferencia: "regulamentacao", autoInclude: true },
  { titulo: "ICH Q1A(R2) — Stability Testing of New Drug Substances and Products", autores: null, ano: 2003, fonte: "International Council for Harmonisation (ICH)", volume: null, numero: null, paginas: null, doi: "https://database.ich.org/sites/default/files/Q1A%28R2%29%20Guideline.pdf", descricao: "Guia para estudos de estabilidade de novos fármacos e produtos farmacêuticos. Base para os estudos acelerados (40°C/75% UR) e de longa duração.", tipoReferencia: "norma" },
  { titulo: "AOAC Official Methods of Analysis, 21st Edition", autores: "AOAC INTERNATIONAL", ano: 2019, fonte: "AOAC International", volume: null, numero: null, paginas: null, doi: "https://www.aoac.org/official-methods-of-analysis/", descricao: "Coletânea de métodos analíticos oficiais validados para alimentos, suplementos e produtos afins.", tipoReferencia: "livro" },
  { titulo: "USP–NF (United States Pharmacopeia — National Formulary)", autores: null, ano: 2024, fonte: "United States Pharmacopeial Convention (USP)", volume: null, numero: null, paginas: null, doi: "https://www.usp.org/pharmacopoeia", descricao: "Compêndio farmacêutico americano com métodos para ensaios de dissolução <711>, desintegração <701> e suplementos alimentares.", tipoReferencia: "norma" },
  { titulo: "Instrução Normativa MAPA nº 46/2019 — Suplementos para Nutrição Animal", autores: null, ano: 2019, fonte: "MAPA — Ministério da Agricultura, Pecuária e Abastecimento", volume: null, numero: null, paginas: null, doi: "https://www.in.gov.br/en/web/dou/-/instrucao-normativa-n-46-de-6-de-novembro-de-2019", descricao: "Estabelece os critérios para fabricação e controle de qualidade de suplementos para alimentação animal — referência para métodos analíticos.", tipoReferencia: "regulamentacao" },
];

// ── Tipos de embalagem (container) ────────────────────────────────────────────
const DEFAULT_CONTAINER_TYPES = [
  { name: "Frasco PEAD 30 ml c/ tampa inviolável", description: "Polietileno de alta densidade, 30 ml, com tampa de rosca e anel de inviolabilidade" },
  { name: "Frasco PEAD 60 ml c/ tampa inviolável", description: "Polietileno de alta densidade, 60 ml, com tampa de rosca e anel de inviolabilidade" },
  { name: "Frasco PEAD 100 ml c/ tampa inviolável", description: "Polietileno de alta densidade, 100 ml, com tampa de rosca e anel de inviolabilidade" },
  { name: "Frasco PEAD 120 ml c/ tampa inviolável", description: "Polietileno de alta densidade, 120 ml, com tampa de rosca e anel de inviolabilidade" },
  { name: "Frasco PEAD 175 ml c/ tampa inviolável", description: "Polietileno de alta densidade, 175 ml, com tampa de rosca e anel de inviolabilidade" },
  { name: "Frasco PEAD 250 ml c/ tampa inviolável", description: "Polietileno de alta densidade, 250 ml, com tampa de rosca e anel de inviolabilidade" },
  { name: "Frasco de vidro âmbar 30 ml c/ tampa", description: "Vidro âmbar tipo III, 30 ml, com tampa de rosca plástica" },
  { name: "Frasco de vidro âmbar 60 ml c/ tampa", description: "Vidro âmbar tipo III, 60 ml, com tampa de rosca plástica" },
  { name: "Frasco de vidro âmbar 100 ml c/ tampa", description: "Vidro âmbar tipo III, 100 ml, com tampa de rosca plástica" },
  { name: "Frasco PET transparente 100 ml", description: "Politereftalato de etileno, 100 ml, com tampa de rosca" },
  { name: "Frasco PET transparente 250 ml", description: "Politereftalato de etileno, 250 ml, com tampa de rosca" },
  { name: "Sachê laminado alumínio/polietileno", description: "Sachê com filme laminado alumínio + polietileno, selagem por calor, barreira a umidade e luz" },
  { name: "Blister alumínio/PVC 10 cápsulas", description: "Blister termoformado PVC com selagem alumínio, 10 unidades por cartela" },
  { name: "Blister alumínio/PVC 15 cápsulas", description: "Blister termoformado PVC com selagem alumínio, 15 unidades por cartela" },
  { name: "Blister alumínio/alumínio (alu-alu) 10 cápsulas", description: "Blister alumínio frio prensado com selagem alumínio, alta barreira" },
  { name: "Caixa cartonada c/ envelope interno", description: "Caixa de papelão com envelope interno de alumínio ou polietileno" },
];

// ── Tipos de cápsula ──────────────────────────────────────────────────────────
const DEFAULT_CAPSULE_TYPES = [
  { name: "Cápsula gelatinosa dura nº 0 (680 mg)", description: "Cápsula de gelatina bovina dura, tamanho 0, capacidade aproximada 680 mg de pó" },
  { name: "Cápsula gelatinosa dura nº 1 (500 mg)", description: "Cápsula de gelatina bovina dura, tamanho 1, capacidade aproximada 500 mg de pó" },
  { name: "Cápsula gelatinosa dura nº 2 (360 mg)", description: "Cápsula de gelatina bovina dura, tamanho 2, capacidade aproximada 360 mg de pó" },
  { name: "Cápsula gelatinosa dura nº 3 (280 mg)", description: "Cápsula de gelatina bovina dura, tamanho 3, capacidade aproximada 280 mg de pó" },
  { name: "Cápsula gelatinosa dura nº 4 (200 mg)", description: "Cápsula de gelatina bovina dura, tamanho 4, capacidade aproximada 200 mg de pó" },
  { name: "Cápsula HPMC (vegetal) nº 0 (680 mg)", description: "Cápsula de hidroxipropilmetilcelulose, tamanho 0 — opção vegana/vegetariana" },
  { name: "Cápsula HPMC (vegetal) nº 1 (500 mg)", description: "Cápsula de hidroxipropilmetilcelulose, tamanho 1 — opção vegana/vegetariana" },
  { name: "Cápsula HPMC (vegetal) nº 2 (360 mg)", description: "Cápsula de hidroxipropilmetilcelulose, tamanho 2 — opção vegana/vegetariana" },
  { name: "Cápsula entérica nº 0", description: "Cápsula com revestimento entérico para liberação no intestino delgado, tamanho 0" },
  { name: "Cápsula entérica nº 1", description: "Cápsula com revestimento entérico para liberação no intestino delgado, tamanho 1" },
  { name: "Cápsula softgel oval 500 mg", description: "Cápsula mole de gelatina (softgel) oval, adequada para óleos e líquidos — 500 mg" },
  { name: "Cápsula softgel redonda 200 mg", description: "Cápsula mole de gelatina (softgel) redonda, adequada para óleos e líquidos — 200 mg" },
  { name: "Cápsula softgel oblong 1000 mg", description: "Cápsula mole de gelatina (softgel) oblonga, Ômega-3 e similares — 1000 mg" },
  { name: "Cápsula gelatinosa colorida nº 0 (decorativa)", description: "Cápsula de gelatina dura com coloração personalizada, tamanho 0" },
];

// ── Tipos de produto ──────────────────────────────────────────────────────────
const DEFAULT_PRODUCT_TYPES = [
  { name: "Suplemento Alimentar em Cápsula", description: "Suplemento alimentar na forma farmacêutica de cápsula dura ou softgel, conforme RDC 243/2018.", isPowder: false },
  { name: "Suplemento Alimentar em Comprimido", description: "Suplemento alimentar na forma de comprimido simples ou revestido, conforme RDC 243/2018.", isPowder: false },
  { name: "Suplemento Alimentar em Pó — Sachê", description: "Suplemento alimentar em pó acondicionado em sachê laminado, conforme RDC 243/2018.", isPowder: true },
  { name: "Suplemento Alimentar em Pó — Pote", description: "Suplemento alimentar em pó acondicionado em pote, conforme RDC 243/2018.", isPowder: true },
  { name: "Suplemento Alimentar em Solução Oral", description: "Suplemento alimentar em forma líquida (solução, xarope ou suspensão oral), conforme RDC 243/2018.", isPowder: false },
  { name: "Suplemento Alimentar em Goma", description: "Suplemento alimentar na forma de goma mastigável (gummy), conforme RDC 243/2018.", isPowder: false },
  { name: "Alimento para Fins Especiais — Cápsula", description: "Produto destinado a grupos populacionais específicos (gestantes, esportistas, idosos), forma de cápsula.", isPowder: false },
  { name: "Alimento para Fins Especiais — Pó", description: "Produto destinado a grupos populacionais específicos, forma em pó.", isPowder: true },
  { name: "Fitoterápico em Cápsula", description: "Produto fitoterápico registrado ou notificado na ANVISA, na forma de cápsula.", isPowder: false },
  { name: "Medicamento em Cápsula (uso magistral)", description: "Formulação magistral de uso individual, na forma de cápsula dura.", isPowder: false },
];

// ── Seed functions ────────────────────────────────────────────────────────────

export async function seedAtivoReferences(): Promise<void> {
  try {
    const [row] = await db.select({ count: sql<number>`count(*)::int` }).from(ativoReferencesTable);
    if ((row?.count ?? 0) > 0) {
      logger.info({ existing: row?.count }, "ativo_references already seeded, skipping");
      return;
    }
    await db.insert(ativoReferencesTable).values(
      DEFAULT_ATIVOS.map((name) => ({ parameter: name, minValue: null, maxValue: null, unit: "mg", notes: null }))
    );
    logger.info({ count: DEFAULT_ATIVOS.length }, "ativo_references seeded");
  } catch (err) {
    logger.error({ err }, "Failed to seed ativo_references");
  }
}

export async function seedMethodologies(): Promise<void> {
  try {
    const existing = await db.select({ shortName: methodologiesTable.shortName }).from(methodologiesTable);
    const existingSet = new Set(existing.map((r) => r.shortName));
    const toInsert = DEFAULT_METHODOLOGIES.filter((m) => !existingSet.has(m.shortName));
    if (toInsert.length === 0) {
      logger.info({ existing: existingSet.size }, "methodologies already seeded, skipping");
      return;
    }
    await db.insert(methodologiesTable).values(toInsert);
    logger.info({ inserted: toInsert.length, skipped: existingSet.size }, "methodologies seeded");
  } catch (err) {
    logger.error({ err }, "Failed to seed methodologies");
  }
}

export async function seedBibliographicReferences(): Promise<void> {
  try {
    const [row] = await db.select({ count: sql<number>`count(*)::int` }).from(bibliographicReferencesTable);
    if ((row?.count ?? 0) > 0) {
      logger.info({ existing: row?.count }, "bibliographic_references already seeded, skipping");
      return;
    }
    await db.insert(bibliographicReferencesTable).values(DEFAULT_BIBLIOGRAPHIC);
    logger.info({ count: DEFAULT_BIBLIOGRAPHIC.length }, "bibliographic_references seeded");
  } catch (err) {
    logger.error({ err }, "Failed to seed bibliographic_references");
  }
}

export async function seedContainerTypes(): Promise<void> {
  try {
    const [row] = await db.select({ count: sql<number>`count(*)::int` }).from(containerTypesTable);
    if ((row?.count ?? 0) > 0) {
      logger.info({ existing: row?.count }, "container_types already seeded, skipping");
      return;
    }
    await db.insert(containerTypesTable).values(DEFAULT_CONTAINER_TYPES);
    logger.info({ count: DEFAULT_CONTAINER_TYPES.length }, "container_types seeded");
  } catch (err) {
    logger.error({ err }, "Failed to seed container_types");
  }
}

export async function seedCapsuleTypes(): Promise<void> {
  try {
    const [row] = await db.select({ count: sql<number>`count(*)::int` }).from(capsuleTypesTable);
    if ((row?.count ?? 0) > 0) {
      logger.info({ existing: row?.count }, "capsule_types already seeded, skipping");
      return;
    }
    await db.insert(capsuleTypesTable).values(DEFAULT_CAPSULE_TYPES);
    logger.info({ count: DEFAULT_CAPSULE_TYPES.length }, "capsule_types seeded");
  } catch (err) {
    logger.error({ err }, "Failed to seed capsule_types");
  }
}

export async function seedProductTypes(): Promise<void> {
  try {
    const [row] = await db.select({ count: sql<number>`count(*)::int` }).from(productTypesTable);
    if ((row?.count ?? 0) > 0) {
      logger.info({ existing: row?.count }, "product_types already seeded, skipping");
      return;
    }
    await db.insert(productTypesTable).values(DEFAULT_PRODUCT_TYPES);
    logger.info({ count: DEFAULT_PRODUCT_TYPES.length }, "product_types seeded");
  } catch (err) {
    logger.error({ err }, "Failed to seed product_types");
  }
}

// ── Deduplicação: remove duplicatas de protocol_references antes do backfill ──
// Mantém o registro com menor id por (protocol_id, reference_id).
// Idempotente — não faz nada se não houver duplicatas.
async function deduplicateProtocolReferences(): Promise<void> {
  try {
    const result = await db.execute(sql`
      DELETE FROM protocol_references
      WHERE id NOT IN (
        SELECT MIN(id)
        FROM protocol_references
        GROUP BY protocol_id, reference_id
      )
    `);
    const deleted = result.rowCount ?? 0;
    if (deleted > 0) {
      logger.info({ deleted }, "protocol_references: duplicatas removidas");
    }
  } catch (err) {
    logger.error({ err }, "Failed to deduplicate protocol_references");
  }
}

// ── Backfill: garante que refs auto_include estejam em TODOS os protocolos ────
// Idempotente: ON CONFLICT DO NOTHING — nunca duplica, nunca apaga refs manuais.
export async function backfillAutoIncludeRefs(): Promise<void> {
  try {
    const autoRefs = await db
      .select({ id: bibliographicReferencesTable.id })
      .from(bibliographicReferencesTable)
      .where(eq(bibliographicReferencesTable.autoInclude, true));

    if (autoRefs.length === 0) return;

    const protocols = await db.select({ id: protocolsTable.id }).from(protocolsTable);
    if (protocols.length === 0) return;

    const toInsert = protocols.flatMap((p) =>
      autoRefs.map((r) => ({ protocolId: p.id, referenceId: r.id, sortOrder: 10000 + r.id }))
    );

    // Inserir em lotes de 500 para não estourar o limite do driver
    let added = 0;
    const BATCH = 500;
    for (let i = 0; i < toInsert.length; i += BATCH) {
      const result = await db
        .insert(protocolReferencesTable)
        .values(toInsert.slice(i, i + BATCH))
        .onConflictDoNothing();
      added += result.rowCount ?? 0;
    }

    if (added > 0) {
      logger.info({ added, protocols: protocols.length, autoRefs: autoRefs.length }, "backfill auto-include refs: links added");
    } else {
      logger.info({ protocols: protocols.length, autoRefs: autoRefs.length }, "backfill auto-include refs: all up-to-date");
    }
  } catch (err) {
    logger.error({ err }, "Failed to backfill auto-include refs");
  }
}

/**
 * Restauração de emergência: se o banco tiver menos de 40 protocolos,
 * baixa o backup de 24-07-2026 20h00 da nuvem e restaura automaticamente.
 * Deve ser chamada em background (setImmediate/setTimeout) APÓS o servidor
 * já estar respondendo ao healthcheck, para não ser morta pelo timeout do deploy.
 */
export async function emergencyRestoreIfNeeded(): Promise<void> {
  try {
    const [protRows, lotRows] = await Promise.all([
      db.select({ id: protocolsTable.id }).from(protocolsTable).limit(40),
      db.select({ id: sql`id` }).from(sql`lots`).limit(50),
    ]);
    // Banco OK se tiver >= 40 protocolos E >= 50 lotes
    if (protRows.length >= 40 && lotRows.length >= 50) return;

    logger.warn({ protocols: protRows.length, lots: lotRows.length }, "emergency-restore: banco incompleto — iniciando restauração automática do backup");

    const BACKUP_FILENAME = "backup - protocolo de testes de estabilidade - 24-07-2026 20h00.json";
    const data = await downloadCloudBackup(BACKUP_FILENAME);
    const result = await runRestore(data);

    logger.info(result, "emergency-restore: restauração concluída");
  } catch (err) {
    logger.error({ err }, "emergency-restore: falhou — verifique o Object Storage e as credenciais");
  }
}

/**
 * Garante que a sequence de analysis_results está sincronizada com MAX(id).
 * Roda em todo boot (dev e produção) para evitar "duplicate key on pkey" após
 * backup/restore com IDs explícitos que avançam além do last_value da sequence.
 */
async function fixSequences(): Promise<void> {
  try {
    await pool.query(`
      SELECT setval(
        'analysis_results_id_seq',
        GREATEST(
          COALESCE((SELECT MAX(id) FROM analysis_results), 0) + 1,
          (SELECT last_value + 1 FROM analysis_results_id_seq)
        ),
        false
      )
    `);
    logger.info("analysis_results sequence verified/fixed");
  } catch (err) {
    logger.error({ err }, "fixSequences: failed to reset sequence");
  }
}

export async function runAllSeeds(): Promise<void> {
  // Corrige sequence antes de tudo para evitar pkey conflict em produção
  await fixSequences();
  await Promise.all([
    seedAtivoReferences(),
    seedMethodologies(),
    seedBibliographicReferences(),
    seedContainerTypes(),
    seedCapsuleTypes(),
    seedProductTypes(),
  ]);
  // Roda após os seeds: primeiro remove duplicatas, depois preenche faltantes
  await deduplicateProtocolReferences();
  await backfillAutoIncludeRefs();
}
