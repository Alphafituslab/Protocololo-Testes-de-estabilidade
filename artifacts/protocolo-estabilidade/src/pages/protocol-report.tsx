import { useParams, Link } from "wouter";
import { useState } from "react";
import {
  useGetCertificate, getGetCertificateQueryKey,
  useGetProtocol, getGetProtocolQueryKey,
  useListLots, getListLotsQueryKey,
  useGetKinetics, getGetKineticsQueryKey,
  useListSignatures, getListSignaturesQueryKey,
} from "@workspace/api-client-react";
import { AuditTrail } from "@/components/audit-trail";
import { Button } from "@/components/ui/button";
import { Loader2, Printer, ArrowLeft, CheckCircle2, XCircle, AlertCircle, Clock } from "lucide-react";

const STATUS_LABEL: Record<string, string> = {
  aprovado: "Aprovado",
  reprovado: "Reprovado",
  aprovado_com_ressalva: "Aprovado c/ Ressalva",
  em_andamento: "Em Andamento",
  rascunho: "Rascunho",
};

function StatusBadge({ status }: { status: string }) {
  const cfg: Record<string, { cls: string; Icon: React.ElementType }> = {
    aprovado:             { cls: "bg-emerald-50 text-emerald-700 border-emerald-300 print:bg-emerald-50", Icon: CheckCircle2 },
    reprovado:            { cls: "bg-red-50 text-red-700 border-red-300 print:bg-red-50", Icon: XCircle },
    aprovado_com_ressalva:{ cls: "bg-amber-50 text-amber-700 border-amber-300 print:bg-amber-50", Icon: AlertCircle },
    em_andamento:         { cls: "bg-blue-50 text-blue-700 border-blue-300 print:bg-blue-50", Icon: Clock },
    rascunho:             { cls: "bg-gray-50 text-gray-600 border-gray-300", Icon: Clock },
  };
  const { cls, Icon } = cfg[status] ?? cfg.rascunho;
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-[10px] font-semibold ${cls}`}>
      <Icon className="h-3 w-3" />
      {STATUS_LABEL[status] ?? status}
    </span>
  );
}

function Section({ num, title, children }: { num: string; title: string; children: React.ReactNode }) {
  return (
    <div className="report-section mb-5">
      <div className="flex items-center gap-2.5 mb-2">
        <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-primary text-white text-[9px] font-bold flex-shrink-0 print:bg-gray-800">{num}</span>
        <h2 className="text-[11px] font-bold uppercase tracking-widest text-gray-700">{title}</h2>
        <div className="flex-1 border-b border-gray-200" />
      </div>
      <div className="pl-7">{children}</div>
    </div>
  );
}

function InfoGrid({ children }: { children: React.ReactNode }) {
  return <dl className="grid grid-cols-2 gap-x-8 gap-y-0.5 text-[10px]">{children}</dl>;
}

function InfoRow({ label, value, wide }: { label: string; value?: string | number | null; wide?: boolean }) {
  if (!value && value !== 0) return null;
  return (
    <div className={`flex gap-2 py-0.5 ${wide ? "col-span-2" : ""}`}>
      <dt className="text-gray-400 font-semibold uppercase tracking-wide flex-shrink-0 min-w-[9rem]">{label}</dt>
      <dd className="text-gray-800 font-medium">{String(value)}</dd>
    </div>
  );
}

function Th({ children, center }: { children: React.ReactNode; center?: boolean }) {
  return (
    <th className={`border border-gray-300 px-2 py-1.5 text-[9px] font-bold uppercase tracking-wide text-gray-600 bg-gray-100 ${center ? "text-center" : "text-left"} whitespace-nowrap print:bg-gray-100`}>
      {children}
    </th>
  );
}

function Td({ children, center, mono, bold, className = "" }: {
  children: React.ReactNode; center?: boolean; mono?: boolean; bold?: boolean; className?: string;
}) {
  return (
    <td className={`border border-gray-200 px-2 py-1 text-[9px] align-top
      ${center ? "text-center" : ""}
      ${mono ? "font-mono" : ""}
      ${bold ? "font-semibold" : ""}
      ${className}`}>
      {children}
    </td>
  );
}

const RESULT_STATUS: Record<string, string> = {
  aprovado: "Conforme",
  reprovado: "Não Conforme",
  aprovado_com_ressalva: "AR",
};

const RESULT_COLOR: Record<string, string> = {
  aprovado: "text-emerald-700",
  reprovado: "text-red-600 font-bold",
  aprovado_com_ressalva: "text-amber-600",
};

const CATEGORY_LABEL: Record<string, string> = {
  fisico_quimica:  "Físico-Química",
  microbiologica:  "Microbiológica",
  teor_ativo:      "Teor do Ativo",
  embalagem:       "Embalagem",
};

export default function ProtocolReportPage() {
  const { id } = useParams<{ id: string }>();
  const numId = Number(id);
  const [_showAll, _setShowAll] = useState(true);
  const [showRessalva, setShowRessalva] = useState(true);

  const { data: cert, isLoading: certLoading } = useGetCertificate(numId, {
    query: { enabled: !!id, queryKey: getGetCertificateQueryKey(numId), staleTime: 0 },
  });
  const { data: protocol, isLoading: protLoading } = useGetProtocol(numId, {
    query: { enabled: !!id, queryKey: getGetProtocolQueryKey(numId) },
  });
  const { data: lotsRaw = [] } = useListLots(numId, {
    query: { enabled: !!id, queryKey: getListLotsQueryKey(numId) },
  });
  const { data: kineticsData } = useGetKinetics(numId, {
    query: { enabled: !!id, queryKey: getGetKineticsQueryKey(numId) },
  });
  const { data: signatures = [] } = useListSignatures(numId, {
    query: { enabled: !!id, queryKey: getListSignaturesQueryKey(numId) },
  });

  if (certLoading || protLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }
  if (!cert || !protocol) {
    return (
      <div className="min-h-screen flex items-center justify-center text-gray-500">
        Protocolo não encontrado.
      </div>
    );
  }

  const emissionDate = new Date().toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" });
  const lots = [...lotsRaw].sort((a, b) => a.lotNumber.localeCompare(b.lotNumber));

  type ResultRow = {
    lotNumber: string; period: number; parameter: string;
    category: string; result?: string | null; status?: string | null;
  };
  const results: ResultRow[] = (protocol as any).results ?? [];
  const periods = [...new Set(results.map(r => r.period))].sort((a, b) => a - b);
  const pivot: Record<string, Record<number, Record<string, { result?: string | null; status?: string | null }>>> = {};
  for (const r of results) {
    if (!pivot[r.parameter]) pivot[r.parameter] = {};
    if (!pivot[r.parameter][r.period]) pivot[r.parameter][r.period] = {};
    pivot[r.parameter][r.period][r.lotNumber] = { result: r.result, status: r.status };
  }

  const byCategory: Record<string, typeof cert.analyses> = {};
  for (const a of cert.analyses) {
    const cat = a.category ?? "outros";
    if (!byCategory[cat]) byCategory[cat] = [];
    byCategory[cat].push(a);
  }

  const kParams = ((kineticsData as any)?.parameters ?? []) as any[];
  const validKParams = kParams.filter((p: any) => p?.k != null && p.k > 0);

  return (
    <div className="min-h-screen bg-gray-50">
      {/* ── Toolbar (screen only) ────────────────────────────────────── */}
      <div className="print:hidden sticky top-0 z-10 bg-white border-b border-gray-200 px-6 py-3 flex items-center justify-between shadow-sm">
        <div className="flex items-center gap-3">
          <Link href={`/protocols/${id}`}>
            <Button variant="ghost" size="sm">
              <ArrowLeft className="h-4 w-4 mr-1" /> Voltar
            </Button>
          </Link>
          <div className="h-4 w-px bg-gray-200" />
          <span className="text-sm font-semibold text-gray-800">Relatório Técnico — ANVISA</span>
          <StatusBadge status={protocol.status} />
        </div>
        <div className="flex items-center gap-2">
          {protocol.status === "aprovado_com_ressalva" && cert.ressalva && (
            <label className="flex items-center gap-1.5 cursor-pointer select-none px-3 py-1.5 rounded border border-amber-300 bg-amber-50 hover:bg-amber-100 transition-colors">
              <input
                type="checkbox"
                checked={showRessalva}
                onChange={() => setShowRessalva(v => !v)}
                className="w-3.5 h-3.5 accent-amber-600"
              />
              <span className="text-xs font-medium text-amber-800">Nota de Ressalva</span>
            </label>
          )}
          <Button onClick={() => window.print()} className="gap-2">
            <Printer className="h-4 w-4" /> Imprimir / Salvar PDF
          </Button>
        </div>
      </div>

      {/* ── Document ────────────────────────────────────────────────── */}
      <div
        id="report-document"
        className="max-w-4xl mx-auto bg-white my-6 shadow-lg rounded-lg print:my-0 print:shadow-none print:rounded-none print:max-w-none"
      >
        {/* ══ CABEÇALHO ══════════════════════════════════════════════ */}
        <div className="px-8 pt-7 pb-5 border-b-2 border-gray-800">
          <div className="flex items-start gap-6">
            {/* Logo + Título */}
            <img src="/logo-alphafitus.png" alt="Alphafitus"
              className="h-14 w-auto flex-shrink-0 mt-0.5"
              style={{ filter: "drop-shadow(0 1px 2px rgba(0,0,0,0.1))" }} />
            <div className="border-l border-gray-300 pl-5 flex-1 min-w-0">
              <p className="text-[9px] font-bold uppercase tracking-widest text-gray-400 mb-0.5">
                Alphafitus Laboratório Nutracêutico
              </p>
              <h1 className="text-[17px] font-bold uppercase tracking-wide text-gray-800 leading-tight">
                Relatório Técnico de Estabilidade
              </h1>
              <p className="text-[11px] font-semibold text-primary mt-1 leading-snug">
                {cert.productName}
              </p>
              <p className="text-[9px] text-gray-400 mt-1">
                Referência regulatória: RDC ANVISA n° 318/2019 · Protocolo ICH Q1A(R2)
              </p>
            </div>
            {/* Meta info */}
            <div className="flex-shrink-0 text-right space-y-2">
              <div className="bg-gray-50 border border-gray-200 rounded px-3 py-2 whitespace-nowrap">
                <span className="text-[8px] font-bold uppercase tracking-wider text-gray-400 block mb-0.5">Nº Certificado</span>
                <span className="font-bold text-sm text-gray-800 whitespace-nowrap">{cert.certNumber || "—"}</span>
              </div>
              <div className="whitespace-nowrap">
                <span className="text-[8px] font-bold uppercase tracking-wider text-gray-400 block">Emissão</span>
                <span className="text-[10px] font-medium text-gray-700">{emissionDate}</span>
              </div>
              <div>
                <StatusBadge status={protocol.status} />
              </div>
            </div>
          </div>
        </div>

        {/* ══ CORPO DO RELATÓRIO ══════════════════════════════════════ */}
        <div className="px-8 py-6 space-y-0">

          {/* 1. Empresa */}
          <Section num="1" title="Identificação da Empresa">
            <InfoGrid>
              <InfoRow label="Empresa" value={cert.companyName} wide />
              <InfoRow label="CNPJ" value={cert.cnpj} />
              <InfoRow label="IE" value={(cert as any).ie} />
              <InfoRow label="E-mail" value={cert.email} wide />
              <InfoRow label="Endereço" value={cert.address} wide />
            </InfoGrid>
          </Section>

          {/* 2. Produto */}
          <Section num="2" title="Identificação do Produto">
            <InfoGrid>
              <InfoRow label="Produto" value={cert.productName} wide />
              <InfoRow label="Apresentação" value={cert.presentation} />
              <InfoRow label="Tipo de Embalagem" value={cert.packagingType} />
              <InfoRow label="Validade Declarada" value={cert.validityMonths ? `${cert.validityMonths} meses` : undefined} />
              <InfoRow label="Ingredientes Ativos" value={cert.activeIngredients} wide />
              <InfoRow label="Excipientes" value={cert.excipients} wide />
              <InfoRow label="Composição da Cápsula" value={cert.capsuleComposition} wide />
            </InfoGrid>
          </Section>

          {/* 3. Plano de Estabilidade */}
          <Section num="3" title="Plano de Estabilidade Acelerada (ICH Q1A(R2))">
            <div className="grid grid-cols-4 gap-3">
              {[
                { label: "Temperatura", value: cert.storageTemp ?? "40°C ± 2°C" },
                { label: "Umidade Relativa", value: cert.storageHumidity ?? "75% UR ± 5% UR" },
                { label: "Período do Estudo", value: cert.studyPeriodMonths ? `${cert.studyPeriodMonths} meses` : "—" },
                { label: "Intervalos", value: cert.testIntervals ?? "—" },
              ].map(({ label, value }) => (
                <div key={label} className="rounded border border-gray-200 px-3 py-2 bg-gray-50 print:bg-gray-50">
                  <p className="text-[8px] font-bold uppercase tracking-widest text-gray-400 mb-0.5">{label}</p>
                  <p className="text-[10px] font-semibold text-gray-800">{value}</p>
                </div>
              ))}
            </div>
          </Section>

          {/* 4. Lotes */}
          {lots.length > 0 && (
            <Section num="4" title="Lotes Piloto do Estudo">
              <table className="w-full border-collapse">
                <thead>
                  <tr>
                    <Th>Nº Lote</Th>
                    <Th>Fabricação</Th>
                    <Th>Validade</Th>
                    <Th>Tamanho</Th>
                    <Th>Observações</Th>
                  </tr>
                </thead>
                <tbody>
                  {lots.map((lot, i) => (
                    <tr key={lot.id} className={i % 2 === 0 ? "" : "bg-gray-50/70"}>
                      <Td bold>{lot.lotNumber}</Td>
                      <Td>{(lot as any).manufacturingDate ?? "—"}</Td>
                      <Td>{(lot as any).expiryDate ?? "—"}</Td>
                      <Td>{(lot as any).batchSize ?? "—"}</Td>
                      <Td className="text-gray-500">{(lot as any).notes ?? "—"}</Td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Section>
          )}

          {/* 5. Resultados — síntese por categoria */}
          <Section num="5" title="Resultados das Análises — Síntese (Médias dos Lotes)">
            {cert.analyses.length > 0 ? (
              <div className="space-y-4">
                {Object.entries(byCategory).map(([cat, analyses]) => (
                  <div key={cat}>
                    <p className="text-[8px] font-bold uppercase tracking-widest text-primary mb-1.5 flex items-center gap-1.5">
                      <span className="inline-block w-1.5 h-1.5 rounded-full bg-primary" />
                      {CATEGORY_LABEL[cat] ?? cat}
                    </p>
                    <table className="w-full border-collapse">
                      <thead>
                        <tr>
                          <Th>Parâmetro</Th>
                          <Th>Especificação</Th>
                          <Th>Resultado</Th>
                          <Th>Método / Referência</Th>
                          <Th center>Conformidade</Th>
                        </tr>
                      </thead>
                      <tbody>
                        {analyses.map((a, i) => {
                          const isNC = a.status === "reprovado";
                          return (
                            <tr key={a.parameter} className={isNC ? "bg-red-50 print:bg-red-50" : i % 2 !== 0 ? "bg-gray-50/70" : ""}>
                              <Td bold className={isNC ? "text-red-800" : ""}>{a.parameter}</Td>
                              <Td mono className="text-[8.5px]">{a.specification || "—"}</Td>
                              <Td mono bold className={`${RESULT_COLOR[a.status ?? ""] ?? "text-gray-700"} text-[8.5px]`}>
                                {a.result || "—"}
                              </Td>
                              <Td className="text-gray-500 text-[8px] leading-snug">{a.method || "—"}</Td>
                              <Td center>
                                <span className={`text-[8.5px] font-semibold ${RESULT_COLOR[a.status ?? ""] ?? "text-gray-400"}`}>
                                  {RESULT_STATUS[a.status ?? ""] ?? "—"}
                                </span>
                              </Td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-[10px] text-gray-400 italic">Nenhum resultado registrado.</p>
            )}
          </Section>

          {/* 5b. Resultados por lote×período (se houver) */}
          {results.length > 0 && lots.length > 0 && periods.length > 0 && (
            <Section num="5b" title="Resultados Detalhados por Lote e Período">
              <div className="overflow-x-auto print:overflow-visible">
                <table className="border-collapse" style={{ tableLayout: "auto", minWidth: "100%" }}>
                  <thead>
                    <tr>
                      <Th>Parâmetro</Th>
                      {lots.map(lot =>
                        periods.map(p => (
                          <Th key={`${lot.id}-${p}`} center>
                            <span className="block">{lot.lotNumber}</span>
                            <span className="font-normal text-gray-400">T{p}</span>
                          </Th>
                        ))
                      )}
                    </tr>
                  </thead>
                  <tbody>
                    {[...new Set(results.map(r => r.parameter))].map((param, i) => (
                      <tr key={param} className={i % 2 === 0 ? "" : "bg-gray-50/70"}>
                        <Td bold>{param}</Td>
                        {lots.map(lot =>
                          periods.map(p => {
                            const cell = pivot[param]?.[p]?.[lot.lotNumber];
                            const sc = RESULT_COLOR[cell?.status ?? ""] ?? "text-gray-700";
                            return (
                              <Td key={`${lot.id}-${p}`} center mono className={sc}>
                                {cell?.result ?? "—"}
                              </Td>
                            );
                          })
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Section>
          )}

          {/* 6. Cinética */}
          {validKParams.length > 0 && (
            <Section num="6" title="Cinética de Estabilidade e Estimativa de Validade">
              <p className="text-[9px] text-gray-500 mb-3 leading-relaxed">
                Modelo cinético de primeira ordem (ICH Q1A(R2)). &nbsp;
                <span className="font-mono bg-gray-100 px-1 rounded">k = −ln(C₆/C₃) / (6−3)</span> &nbsp;·&nbsp;
                <span className="font-mono bg-gray-100 px-1 rounded">t<sub>val</sub> = −ln(0,80) / k</span> &nbsp;(limiar ICH: 80% de C₀)
              </p>
              <table className="w-full border-collapse mb-3">
                <thead>
                  <tr>
                    <Th>Ativo</Th>
                    <Th center>T0 (%)</Th>
                    <Th center>T3 (%)</Th>
                    <Th center>T6 (%)</Th>
                    <Th center>k (mês⁻¹)</Th>
                    <Th center>Validade Calc. (meses)</Th>
                    <Th center>Situação</Th>
                  </tr>
                </thead>
                <tbody>
                  {validKParams.map((p: any, i: number) => {
                    const limiting = (kineticsData as any)?.limitingParameter === p.parameter;
                    const practiced = (cert as any).validityMonths as number | null;
                    const estimated = p.estimatedShelfLifeMonths ?? p.shelfLifeMonths ?? null;
                    const ok = practiced == null || estimated == null || practiced <= estimated;
                    return (
                      <tr key={p.parameter} className={limiting ? "bg-amber-50 print:bg-amber-50" : i % 2 !== 0 ? "bg-gray-50/70" : ""}>
                        <Td bold className={limiting ? "text-amber-800" : ""}>
                          {p.parameter}{limiting && <span className="ml-1 text-amber-500">★</span>}
                        </Td>
                        <Td center mono>{p.t0 != null ? Number(p.t0).toFixed(2) : "—"}</Td>
                        <Td center mono>{p.t3 != null ? Number(p.t3).toFixed(2) : "—"}</Td>
                        <Td center mono>{p.t6 != null ? Number(p.t6).toFixed(2) : "—"}</Td>
                        <Td center mono>{p.k != null ? Number(p.k).toFixed(5) : "—"}</Td>
                        <Td center bold>{estimated != null ? `${Number(estimated).toFixed(1)}` : "—"}</Td>
                        <Td center>
                          <span className={`text-[8.5px] font-semibold ${ok ? "text-emerald-700" : "text-red-600"}`}>
                            {practiced != null && estimated != null ? (ok ? "✓ Compatível" : "⚠ Excede") : "—"}
                          </span>
                        </Td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              <div className="flex gap-6 text-[9px] text-gray-600">
                {(kineticsData as any)?.limitingParameter && (
                  <p><span className="text-gray-400">Ativo limitante:</span> <span className="font-semibold text-amber-700">★ {(kineticsData as any).limitingParameter}</span></p>
                )}
                {(kineticsData as any)?.estimatedShelfLifeMonths != null && (
                  <p><span className="text-gray-400">Validade calculada:</span> <span className="font-semibold">{Number((kineticsData as any).estimatedShelfLifeMonths).toFixed(1)} meses</span></p>
                )}
                {(kineticsData as any)?.recommendedValidityMonths != null && (
                  <p><span className="text-gray-400">Recomendada:</span> <span className="font-semibold">{(kineticsData as any).recommendedValidityMonths} meses</span></p>
                )}
                {cert.validityMonths != null && (
                  <p><span className="text-gray-400">Praticada (rótulo):</span> <span className="font-semibold">{cert.validityMonths} meses</span></p>
                )}
              </div>
              {cert.kineticsNotes && (
                <p className="text-[9px] text-gray-600 mt-2 border-l-2 border-gray-200 pl-2">{cert.kineticsNotes}</p>
              )}
            </Section>
          )}

          {/* 7. Metodologias */}
          {cert.analyses.some(a => a.method) && (
            <Section num="7" title="Metodologias Analíticas Utilizadas">
              <table className="w-full border-collapse">
                <thead>
                  <tr>
                    <Th>Parâmetro</Th>
                    <Th>Método Oficial / Referência Normativa</Th>
                  </tr>
                </thead>
                <tbody>
                  {cert.analyses.filter(a => a.method).map((a, i) => (
                    <tr key={a.parameter} className={i % 2 === 0 ? "" : "bg-gray-50/70"}>
                      <Td bold>{a.parameter}</Td>
                      <Td className="text-gray-600 leading-snug">{a.method}</Td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Section>
          )}

          {/* 8. Conclusão */}
          {cert.conclusion && (
            <Section num="8" title="Conclusão">
              <div className="border-l-2 border-primary/30 pl-3 bg-gray-50/50 py-2 pr-3 rounded-r print:bg-gray-50">
                <p className="text-[10px] text-gray-800 leading-relaxed whitespace-pre-wrap">{cert.conclusion}</p>
              </div>
              <div className="mt-3 flex items-center gap-6 text-[10px]">
                <div className="flex items-center gap-2">
                  <div className={`w-4 h-4 border-2 flex items-center justify-center ${protocol.status === "aprovado" || protocol.status === "aprovado_com_ressalva" ? "border-gray-800 bg-gray-800" : "border-gray-300"}`}>
                    {(protocol.status === "aprovado" || protocol.status === "aprovado_com_ressalva") && <span className="text-white text-[8px] font-bold">X</span>}
                  </div>
                  <span className="font-semibold">APROVADO{protocol.status === "aprovado_com_ressalva" ? " (COM RESSALVA)" : ""}</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className={`w-4 h-4 border-2 flex items-center justify-center ${protocol.status === "reprovado" ? "border-red-700 bg-red-700" : "border-gray-300"}`}>
                    {protocol.status === "reprovado" && <span className="text-white text-[8px] font-bold">X</span>}
                  </div>
                  <span className={`font-semibold ${protocol.status === "reprovado" ? "text-red-700" : ""}`}>REPROVADO</span>
                </div>
              </div>
            </Section>
          )}

          {/* Nota de Ressalva */}
          {protocol.status === "aprovado_com_ressalva" && cert.ressalva && showRessalva && (
            <div className="report-section mb-5 border border-amber-300 rounded-lg overflow-hidden text-[10px]">
              <div className="bg-amber-50 border-b border-amber-200 px-4 py-2 flex items-center gap-2">
                <span className="text-amber-600">⚠</span>
                <h2 className="text-[10px] font-bold uppercase tracking-widest text-amber-700">Nota de Ressalva</h2>
              </div>
              <div className="px-4 py-3 bg-amber-50/30">
                <p className="text-[10px] text-amber-900 leading-relaxed whitespace-pre-wrap">{cert.ressalva}</p>
              </div>
            </div>
          )}

          {/* 9. Assinaturas */}
          {signatures.length > 0 && (
            <Section num="9" title="Assinaturas Eletrônicas">
              <table className="w-full border-collapse">
                <thead>
                  <tr>
                    <Th>Responsável</Th>
                    <Th>Cargo / Função</Th>
                    <Th>Data e Hora da Assinatura</Th>
                    <Th center>Verificação</Th>
                  </tr>
                </thead>
                <tbody>
                  {signatures.map((s, i) => (
                    <tr key={s.id} className={i % 2 === 0 ? "" : "bg-gray-50/70"}>
                      <Td bold>{s.userDisplay}</Td>
                      <Td>{s.roleLabel}</Td>
                      <Td>{new Date(s.signedAt).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" })}</Td>
                      <Td center><span className="text-[8.5px] text-emerald-700 font-semibold">✓ Verificada</span></Td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Section>
          )}

          {/* 10. Histórico */}
          <Section num="10" title="Histórico de Rastreabilidade">
            <AuditTrail protocolId={numId} printMode />
          </Section>

          {/* ── Rodapé ────────────────────────────────────────────────── */}
          <div className="mt-6 pt-4 border-t-2 border-gray-800">
            <div className="flex items-center justify-between text-[8.5px] text-gray-400">
              <div>
                <p className="font-semibold text-gray-600">Alphafitus Laboratório Nutracêutico</p>
                <p>CNPJ: {cert.cnpj} · {cert.email}</p>
              </div>
              <div className="text-right">
                <p className="font-semibold">{cert.certNumber}</p>
                <p>Emitido em {emissionDate}</p>
              </div>
            </div>
            <p className="text-[7.5px] text-gray-400 text-center mt-2">
              Relatório Técnico de Estabilidade gerado eletronicamente · RDC ANVISA n° 318/2019 · ICH Q1A(R2)
              · Os resultados referem-se exclusivamente às amostras avaliadas e às condições do estudo descritas.
            </p>
          </div>
        </div>
      </div>

      {/* ── CSS de Impressão ─────────────────────────────────────────── */}
      <style>{`
        /* Margens aplicadas a TODAS as páginas, inclusive a 2ª, 3ª… */
        @page {
          size: A4 portrait;
          margin: 15mm 18mm;
        }

        @media print {
          html, body, #root, #root > *, #root > * > * {
            overflow: visible !important;
            height: auto !important;
            min-height: 0 !important;
            display: block !important;
            background: white !important;
          }

          body > * { display: none !important; }
          #root { display: block !important; }
          body * { visibility: hidden !important; }
          #report-document,
          #report-document * { visibility: visible !important; }

          #report-document {
            position: static !important;
            display: block !important;
            width: 100% !important;
            max-width: 100% !important;
            margin: 0 !important;
            padding: 0 !important;
            box-shadow: none !important;
            border: none !important;
            border-radius: 0 !important;
            font-size: 8.5pt !important;
            overflow: visible !important;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }

          td, th {
            overflow: visible !important;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }

          /* Cabeçalho da tabela repete em todas as páginas */
          thead {
            display: table-header-group;
          }

          /* Linhas nunca partem ao meio */
          tr {
            break-inside: avoid;
            page-break-inside: avoid;
          }

          /* Seções pequenas ficam juntas */
          .report-section {
            break-inside: avoid;
            page-break-inside: avoid;
            overflow: visible !important;
          }

          /* Garante que overflow-hidden não corte o conteúdo na impressão */
          .overflow-x-auto,
          .overflow-hidden,
          .overflow-auto {
            overflow: visible !important;
          }

          table {
            width: 100% !important;
            overflow: visible !important;
            table-layout: auto !important;
          }
        }
      `}</style>
    </div>
  );
}
