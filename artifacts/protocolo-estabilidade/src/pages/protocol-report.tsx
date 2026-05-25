import { useParams, Link } from "wouter";
import { useEffect, useState } from "react";
import {
  useGetCertificate, getGetCertificateQueryKey,
  useGetProtocol, getGetProtocolQueryKey,
  useListLots, getListLotsQueryKey,
  useGetKinetics, getGetKineticsQueryKey,
  useListSignatures, getListSignaturesQueryKey,
} from "@workspace/api-client-react";
import { AuditTrail } from "@/components/audit-trail";
import { Button } from "@/components/ui/button";
import { Loader2, Printer, ArrowLeft } from "lucide-react";

// ── HPLC images (saved by simulator via localStorage) ─────────────────────
interface HplcSavedImage {
  id: string;
  sessionId: string;
  sessionName: string;
  formulaName: string;
  createdAt: string;
  imageData: string;
  notes: string;
  certificateNumber?: string;
}

const STATUS_LABEL: Record<string, string> = {
  aprovado: "Aprovado",
  reprovado: "Reprovado",
  aprovado_com_ressalva: "Aprovado c/ Ressalva",
  em_andamento: "Em Andamento",
  rascunho: "Rascunho",
};

const STATUS_COLOR: Record<string, string> = {
  aprovado: "text-emerald-700",
  reprovado: "text-red-600",
  aprovado_com_ressalva: "text-amber-600",
  em_andamento: "text-blue-600",
  rascunho: "text-gray-500",
};

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="report-section mb-6 border border-gray-200 rounded-lg overflow-hidden print:overflow-visible print:rounded-none text-xs">
      <div className="bg-gray-100 border-b border-gray-200 px-4 py-2 print:bg-white">
        <h2 className="text-[10px] font-bold uppercase tracking-widest text-gray-500">{title}</h2>
      </div>
      <div className="px-4 py-3 overflow-visible">{children}</div>
    </div>
  );
}

function Row({ label, value }: { label: string; value?: string | number | null }) {
  if (!value && value !== 0) return null;
  return (
    <div className="flex gap-2 py-0.5">
      <dt className="text-gray-500 min-w-44 flex-shrink-0 font-medium">{label}:</dt>
      <dd className="flex-1 text-gray-800">{String(value)}</dd>
    </div>
  );
}

export default function ProtocolReportPage() {
  const { id } = useParams<{ id: string }>();
  const numId = Number(id);

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

  const [hplcImages, setHplcImages] = useState<HplcSavedImage[]>([]);
  useEffect(() => {
    try {
      const raw = localStorage.getItem("hplc_images_v1");
      const all: HplcSavedImage[] = raw ? JSON.parse(raw) : [];
      const certNum = cert?.certNumber ?? "";
      const filtered = certNum
        ? all.filter(img => !img.certificateNumber || img.certificateNumber === certNum)
        : all;
      setHplcImages(filtered);
    } catch { setHplcImages([]); }
  }, [cert?.certNumber]);

  const isLoading = certLoading || protLoading;

  if (isLoading) {
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

  // Group analyses by category
  const byCategory: Record<string, typeof cert.analyses> = {};
  for (const a of cert.analyses) {
    const cat = a.category ?? "Outros";
    if (!byCategory[cat]) byCategory[cat] = [];
    byCategory[cat].push(a);
  }

  // Group results (protocol.results) by lot+period
  type ResultRow = {
    lotNumber: string; period: number; parameter: string;
    category: string; result?: string | null; status?: string | null;
  };
  const results: ResultRow[] = (protocol as any).results ?? [];

  // Lots sorted by number
  const lots = [...lotsRaw].sort((a, b) => a.lotNumber.localeCompare(b.lotNumber));

  // Unique parameters from results
  const parameters = [...new Set(results.map(r => r.parameter))];
  const periods = [...new Set(results.map(r => r.period))].sort((a, b) => a - b);

  // Pivot: parameter → period → {result, status}
  const pivot: Record<string, Record<number, Record<string, { result?: string | null; status?: string | null }>>> = {};
  for (const r of results) {
    if (!pivot[r.parameter]) pivot[r.parameter] = {};
    if (!pivot[r.parameter][r.period]) pivot[r.parameter][r.period] = {};
    pivot[r.parameter][r.period][r.lotNumber] = { result: r.result, status: r.status };
  }

  const statusColor = (s?: string | null) => {
    if (!s) return "";
    if (s === "aprovado") return "text-emerald-700 font-semibold";
    if (s === "reprovado") return "text-red-600 font-semibold";
    if (s === "aprovado_com_ressalva") return "text-amber-600 font-semibold";
    return "";
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* ── Screen-only toolbar ─────────────────────────────────────────── */}
      <div className="print:hidden sticky top-0 z-10 bg-white border-b border-gray-200 px-6 py-3 flex items-center justify-between shadow-sm">
        <div className="flex items-center gap-3">
          <Link href={`/protocols/${id}`}>
            <Button variant="ghost" size="sm">
              <ArrowLeft className="h-4 w-4 mr-1" /> Voltar
            </Button>
          </Link>
          <span className="text-sm font-medium text-gray-700">Relatório Técnico — ANVISA</span>
        </div>
        <Button onClick={() => window.print()}>
          <Printer className="h-4 w-4 mr-2" /> Imprimir / Salvar PDF
        </Button>
      </div>

      {/* ── Document ────────────────────────────────────────────────────── */}
      <div
        id="report-document"
        className="max-w-4xl mx-auto bg-white my-6 shadow-lg rounded-lg print:my-0 print:shadow-none print:rounded-none print:max-w-none"
      >
        {/* ── Header ──────────────────────────────────────────────────── */}
        <div className="border-b border-gray-200 px-8 py-6 flex items-start gap-6">
          <img
            src="/logo-alphafitus.png"
            alt="Alphafitus"
            className="h-16 w-auto flex-shrink-0"
            style={{ filter: "drop-shadow(0 1px 2px rgba(0,0,0,0.08))" }}
          />
          <div className="border-l border-gray-300 pl-5 flex-1">
            <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-0.5">
              Alphafitus Laboratório Nutracêutico
            </p>
            <h1 className="text-xl font-bold uppercase tracking-wide text-gray-800">
              Relatório Técnico de Estabilidade
            </h1>
            <p className="text-sm font-semibold text-emerald-700 mt-0.5">{cert.productName}</p>
          </div>
          <div className="text-right text-xs space-y-1 flex-shrink-0">
            <div className="bg-gray-50 border border-gray-200 rounded px-3 py-2">
              <span className="text-gray-400 text-[9px] font-semibold uppercase tracking-wider block mb-0.5">Nº Certificado</span>
              <span className="font-bold text-sm">{cert.certNumber || "—"}</span>
            </div>
            <div>
              <span className="text-gray-400 text-[9px] font-semibold uppercase tracking-wider block">Emissão</span>
              <span className="font-medium text-gray-700">{emissionDate}</span>
            </div>
            <div>
              <span className="text-gray-400 text-[9px] font-semibold uppercase tracking-wider block">Status</span>
              <span className={`font-semibold ${STATUS_COLOR[protocol.status] ?? "text-gray-700"}`}>
                {STATUS_LABEL[protocol.status] ?? protocol.status}
              </span>
            </div>
          </div>
        </div>

        <div className="px-8 py-6 space-y-0">

          {/* ── 1. Identificação da Empresa ───────────────────────────── */}
          <Section title="1. Identificação da Empresa">
            <dl className="text-xs space-y-0.5">
              <Row label="Empresa" value={cert.companyName} />
              <Row label="CNPJ" value={cert.cnpj} />
              <Row label="IE" value={(cert as any).ie} />
              <Row label="Endereço" value={cert.address} />
              <Row label="E-mail" value={cert.email} />
            </dl>
          </Section>

          {/* ── 2. Identificação do Produto ───────────────────────────── */}
          <Section title="2. Identificação do Produto">
            <dl className="text-xs space-y-0.5">
              <Row label="Produto" value={cert.productName} />
              <Row label="Apresentação" value={cert.presentation} />
              <Row label="Tipo de Embalagem" value={cert.packagingType} />
              <Row label="Ingredientes Ativos" value={cert.activeIngredients} />
              <Row label="Excipientes" value={cert.excipients} />
              <Row label="Composição da Cápsula" value={cert.capsuleComposition} />
              <Row label="Validade" value={cert.validityMonths ? `${cert.validityMonths} meses` : undefined} />
            </dl>
          </Section>

          {/* ── 3. Plano de Estabilidade ──────────────────────────────── */}
          <Section title="3. Plano de Estabilidade Acelerada (ICH Q1A(R2))">
            <dl className="text-xs space-y-0.5">
              <Row label="Temperatura de Armazenamento" value={cert.storageTemp} />
              <Row label="Umidade Relativa" value={cert.storageHumidity} />
              <Row label="Período do Estudo" value={cert.studyPeriodMonths ? `${cert.studyPeriodMonths} meses` : undefined} />
              <Row label="Intervalos de Teste" value={cert.testIntervals} />
            </dl>
          </Section>

          {/* ── 4. Lotes do Estudo ────────────────────────────────────── */}
          {lots.length > 0 && (
            <Section title="4. Lotes do Estudo">
              <table className="w-full text-xs border-collapse">
                <thead>
                  <tr className="bg-gray-50">
                    <th className="border border-gray-200 px-3 py-1.5 text-left font-semibold text-gray-600">Nº Lote</th>
                    <th className="border border-gray-200 px-3 py-1.5 text-left font-semibold text-gray-600">Data de Fabricação</th>
                    <th className="border border-gray-200 px-3 py-1.5 text-left font-semibold text-gray-600">Data de Validade</th>
                    <th className="border border-gray-200 px-3 py-1.5 text-left font-semibold text-gray-600">Tamanho do Lote</th>
                    <th className="border border-gray-200 px-3 py-1.5 text-left font-semibold text-gray-600">Observações</th>
                  </tr>
                </thead>
                <tbody>
                  {lots.map(lot => (
                    <tr key={lot.id} className="even:bg-gray-50">
                      <td className="border border-gray-200 px-3 py-1.5 font-medium">{lot.lotNumber}</td>
                      <td className="border border-gray-200 px-3 py-1.5">{(lot as any).manufacturingDate ?? "—"}</td>
                      <td className="border border-gray-200 px-3 py-1.5">{(lot as any).expiryDate ?? "—"}</td>
                      <td className="border border-gray-200 px-3 py-1.5">{(lot as any).batchSize ?? "—"}</td>
                      <td className="border border-gray-200 px-3 py-1.5">{(lot as any).notes ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Section>
          )}

          {/* ── 5. Resultados das Análises ────────────────────────────── */}
          <Section title="5. Resultados das Análises">
            {parameters.length > 0 && lots.length > 0 ? (
              <div className="overflow-x-auto print:overflow-visible">
                <table className="w-full text-xs border-collapse">
                  <thead>
                    <tr className="bg-gray-50">
                      <th className="border border-gray-200 px-2 py-1.5 text-left font-semibold text-gray-600">Parâmetro</th>
                      {lots.map(lot =>
                        periods.map(p => (
                          <th key={`${lot.id}-${p}`} className="border border-gray-200 px-2 py-1.5 text-center font-semibold text-gray-600 whitespace-nowrap">
                            {lot.lotNumber}<br />
                            <span className="font-normal text-gray-400">T{p}</span>
                          </th>
                        ))
                      )}
                    </tr>
                  </thead>
                  <tbody>
                    {parameters.map((param, i) => (
                      <tr key={param} className={i % 2 === 0 ? "" : "bg-gray-50"}>
                        <td className="border border-gray-200 px-2 py-1.5 font-medium">{param}</td>
                        {lots.map(lot =>
                          periods.map(p => {
                            const cell = pivot[param]?.[p]?.[lot.lotNumber];
                            return (
                              <td key={`${lot.id}-${p}`} className={`border border-gray-200 px-2 py-1.5 text-center ${statusColor(cell?.status)}`}>
                                {cell?.result ?? "—"}
                              </td>
                            );
                          })
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="text-gray-500 italic">
                Resultados detalhados por lote/período disponíveis no sistema. Consulte a aba Resultados no protocolo.
              </p>
            )}

            {/* Summary from certificate (medium of lots) */}
            {cert.analyses.length > 0 && (
              <div className="mt-4">
                <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-2">Síntese dos Resultados (Médias dos Lotes)</p>
                {Object.entries(byCategory).map(([cat, analyses]) => (
                  <div key={cat} className="mb-3">
                    <p className="text-[9px] font-bold uppercase tracking-widest text-primary mb-1">{cat}</p>
                    <table className="w-full text-xs border-collapse">
                      <thead>
                        <tr className="bg-gray-50">
                          <th className="border border-gray-200 px-2 py-1 text-left font-semibold text-gray-600">Parâmetro</th>
                          <th className="border border-gray-200 px-2 py-1 text-left font-semibold text-gray-600">Especificação</th>
                          <th className="border border-gray-200 px-2 py-1 text-left font-semibold text-gray-600">Resultado</th>
                          <th className="border border-gray-200 px-2 py-1 text-left font-semibold text-gray-600">Método</th>
                          <th className="border border-gray-200 px-2 py-1 text-center font-semibold text-gray-600">Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {analyses.map((a, i) => (
                          <tr key={a.parameter} className={i % 2 === 0 ? "" : "bg-gray-50"}>
                            <td className="border border-gray-200 px-2 py-1 font-medium">{a.parameter}</td>
                            <td className="border border-gray-200 px-2 py-1">{a.specification || "—"}</td>
                            <td className="border border-gray-200 px-2 py-1">{a.result || "—"}</td>
                            <td className="border border-gray-200 px-2 py-1 text-gray-500">{a.method || "—"}</td>
                            <td className={`border border-gray-200 px-2 py-1 text-center ${statusColor(a.status)}`}>
                              {a.status === "aprovado" ? "✓" : a.status === "reprovado" ? "✗" : a.status === "aprovado_com_ressalva" ? "AR" : "—"}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ))}
              </div>
            )}
          </Section>

          {/* ── 6. Cinética e Validade Estimada ──────────────────────── */}
          {kineticsData && (
            <Section title="6. Cinética de Estabilidade e Estimativa de Validade">
              <p className="text-xs text-gray-600 mb-3">
                Modelo cinético de primeira ordem conforme ICH Q1A(R2).
                k = −ln(C₆/C₃) / (6−3) &nbsp;|&nbsp;
                t_validade = −ln(C_min/C₀) / k &nbsp;(C_min = 80% do teor inicial)
              </p>
              {(kineticsData as any).parameters?.length > 0 ? (
                <table className="w-full text-xs border-collapse mb-3">
                  <thead>
                    <tr className="bg-gray-50">
                      <th className="border border-gray-200 px-3 py-1.5 text-left font-semibold text-gray-600">Parâmetro</th>
                      <th className="border border-gray-200 px-3 py-1.5 text-center font-semibold text-gray-600">T0</th>
                      <th className="border border-gray-200 px-3 py-1.5 text-center font-semibold text-gray-600">T3</th>
                      <th className="border border-gray-200 px-3 py-1.5 text-center font-semibold text-gray-600">T6</th>
                      <th className="border border-gray-200 px-3 py-1.5 text-center font-semibold text-gray-600">k (mês⁻¹)</th>
                      <th className="border border-gray-200 px-3 py-1.5 text-center font-semibold text-gray-600">Validade Estimada</th>
                    </tr>
                  </thead>
                  <tbody>
                    {((kineticsData as any).parameters as any[]).map((p: any, i: number) => (
                      <tr key={p.parameter} className={i % 2 === 0 ? "" : "bg-gray-50"}>
                        <td className="border border-gray-200 px-3 py-1.5 font-medium">{p.parameter}</td>
                        <td className="border border-gray-200 px-3 py-1.5 text-center">{p.c0 ?? "—"}</td>
                        <td className="border border-gray-200 px-3 py-1.5 text-center">{p.c3 ?? "—"}</td>
                        <td className="border border-gray-200 px-3 py-1.5 text-center">{p.c6 ?? "—"}</td>
                        <td className="border border-gray-200 px-3 py-1.5 text-center">{p.k != null ? Number(p.k).toFixed(4) : "—"}</td>
                        <td className="border border-gray-200 px-3 py-1.5 text-center font-semibold">
                          {p.shelfLifeMonths != null ? `${Math.floor(p.shelfLifeMonths)} meses` : "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <p className="text-gray-500 italic text-xs">Dados cinéticos insuficientes para cálculo.</p>
              )}
              {(kineticsData as any).notes && (
                <p className="text-xs text-gray-600 mt-2 whitespace-pre-wrap">{(kineticsData as any).notes}</p>
              )}
              {cert.kineticsNotes && (
                <p className="text-xs text-gray-600 mt-2 whitespace-pre-wrap">{cert.kineticsNotes}</p>
              )}
            </Section>
          )}

          {/* ── 7. Metodologias ──────────────────────────────────────── */}
          {cert.analyses.some(a => a.method) && (
            <Section title="7. Metodologias Analíticas Utilizadas">
              <table className="w-full text-xs border-collapse">
                <thead>
                  <tr className="bg-gray-50">
                    <th className="border border-gray-200 px-3 py-1.5 text-left font-semibold text-gray-600">Parâmetro</th>
                    <th className="border border-gray-200 px-3 py-1.5 text-left font-semibold text-gray-600">Método Oficial / Referência</th>
                  </tr>
                </thead>
                <tbody>
                  {cert.analyses.filter(a => a.method).map((a, i) => (
                    <tr key={a.parameter} className={i % 2 === 0 ? "" : "bg-gray-50"}>
                      <td className="border border-gray-200 px-3 py-1.5 font-medium">{a.parameter}</td>
                      <td className="border border-gray-200 px-3 py-1.5 text-gray-700">{a.method}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Section>
          )}

          {/* ── 8. Cromatogramas HPLC ────────────────────────────────── */}
          <Section title="8. Cromatogramas HPLC">
            {hplcImages.length > 0 ? (
              <div className="grid grid-cols-1 gap-6">
                {hplcImages.map(img => (
                  <div key={img.id} className="border border-gray-200 rounded p-3">
                    <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-1">
                      {img.sessionName} — {img.formulaName}
                    </p>
                    <p className="text-[10px] text-gray-400 mb-2">
                      {new Date(img.createdAt).toLocaleDateString("pt-BR")}
                      {img.notes ? ` — ${img.notes}` : ""}
                    </p>
                    <img
                      src={img.imageData}
                      alt={`Cromatograma ${img.sessionName}`}
                      className="w-full border border-gray-100 rounded"
                    />
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-gray-500 italic text-xs">
                Nenhum cromatograma salvo no simulador HPLC para este protocolo.
                Utilize o Simulador HPLC (menu lateral) para gerar e salvar cromatogramas — eles aparecerão aqui automaticamente.
              </p>
            )}
          </Section>

          {/* ── 9. Conclusão ─────────────────────────────────────────── */}
          {cert.conclusion && (
            <Section title="9. Conclusão">
              <p className="text-xs text-gray-700 whitespace-pre-wrap">{cert.conclusion}</p>
            </Section>
          )}

          {/* ── 10. Histórico do Protocolo ────────────────────────────── */}
          <Section title="10. Histórico e Rastreabilidade">
            <AuditTrail protocolId={numId} printMode />
          </Section>

          {/* ── 11. Assinaturas ───────────────────────────────────────── */}
          {signatures.length > 0 && (
            <Section title="11. Assinaturas Eletrônicas">
              <table className="w-full text-xs border-collapse">
                <thead>
                  <tr className="bg-gray-50">
                    <th className="border border-gray-200 px-3 py-1.5 text-left font-semibold text-gray-600">Responsável</th>
                    <th className="border border-gray-200 px-3 py-1.5 text-left font-semibold text-gray-600">Cargo / Função</th>
                    <th className="border border-gray-200 px-3 py-1.5 text-left font-semibold text-gray-600">Data / Hora</th>
                  </tr>
                </thead>
                <tbody>
                  {signatures.map((s, i) => (
                    <tr key={s.id} className={i % 2 === 0 ? "" : "bg-gray-50"}>
                      <td className="border border-gray-200 px-3 py-1.5 font-medium">{s.userDisplay}</td>
                      <td className="border border-gray-200 px-3 py-1.5">{s.roleLabel}</td>
                      <td className="border border-gray-200 px-3 py-1.5 text-gray-500">
                        {new Date(s.signedAt).toLocaleString("pt-BR")}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Section>
          )}

          {/* ── Footer ────────────────────────────────────────────────── */}
          <div className="border-t border-gray-200 pt-4 text-[10px] text-gray-400 text-center space-y-0.5">
            <p>Alphafitus Laboratório Nutracêutico — {cert.companyName}</p>
            <p>CNPJ: {cert.cnpj} — {cert.email}</p>
            <p>Documento gerado em {emissionDate} — Relatório Técnico de Estabilidade para fins regulatórios (ANVISA/RDC 318/2019)</p>
          </div>
        </div>
      </div>

      {/* ── Print CSS ────────────────────────────────────────────────────── */}
      <style>{`
        @page {
          size: A4 portrait;
          margin: 0;
        }

        @media print {
          /* ── Reset all containers so nothing clips the report ─────────────── */
          html, body, #root, #root > *, #root > * > * {
            overflow: visible !important;
            height: auto !important;
            min-height: 0 !important;
            display: block !important;
            background: white !important;
          }

          /* ── Hide everything except the report ────────────────────────────── */
          body > * { display: none !important; }
          #root { display: block !important; }
          body * { visibility: hidden !important; }
          #report-document,
          #report-document * { visibility: visible !important; }

          /* ── Report document: normal flow, full width ─────────────────────── */
          #report-document {
            position: static !important;
            display: block !important;
            width: 100% !important;
            max-width: 100% !important;
            margin: 0 !important;
            box-shadow: none !important;
            border: none !important;
            border-radius: 0 !important;
            padding: 14mm 18mm !important;
            font-size: 9pt !important;
            overflow: visible !important;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }

          /* ── Preserve colours in cells ───────────────────────────────────── */
          td, th {
            overflow: visible !important;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }

          /* ── Avoid splitting table rows across pages ──────────────────────── */
          tr {
            break-inside: avoid;
            page-break-inside: avoid;
          }

          /* ── Section blocks: visible + no clipping ────────────────────────── */
          .report-section {
            break-inside: avoid;
            page-break-inside: avoid;
            overflow: visible !important;
            border-radius: 0 !important;
          }

          /* ── Unclip any overflow containers ──────────────────────────────── */
          .overflow-x-auto,
          .overflow-hidden,
          .overflow-auto {
            overflow: visible !important;
          }

          /* ── Tables: full width, no clipping ─────────────────────────────── */
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
