import { useParams, Link } from "wouter";
import { useGetCertificate, getGetCertificateQueryKey, useListLots, getListLotsQueryKey } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Printer, Settings2, Image as ImageIcon, ChevronDown, ChevronUp } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { useState, useMemo } from "react";

type PhotoEntry = { parameter: string; lotNumber: string; period: number; images: string[]; key: string };

function collectProtocolImages(
  protocolId: number,
  lots: { id: number; lotNumber: string }[],
): PhotoEntry[] {
  const prefix = `imgs_${protocolId}_`;
  const entries: PhotoEntry[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (!key?.startsWith(prefix)) continue;
    const rest = key.slice(prefix.length);
    const parts = rest.split("_");
    if (parts.length < 3) continue;
    const period = parseInt(parts[parts.length - 1]);
    const lotId = parseInt(parts[parts.length - 2]);
    const parameter = parts.slice(0, parts.length - 2).join("_");
    if (isNaN(period) || isNaN(lotId)) continue;
    try {
      const images: string[] = JSON.parse(localStorage.getItem(key) ?? "[]");
      if (!images.length) continue;
      const lot = lots.find((l) => l.id === lotId);
      if (!lot) continue;
      entries.push({ parameter, lotNumber: lot.lotNumber, period, images, key });
    } catch { /* skip malformed */ }
  }
  return entries.sort(
    (a, b) =>
      a.parameter.localeCompare(b.parameter) ||
      a.lotNumber.localeCompare(b.lotNumber) ||
      a.period - b.period,
  );
}

function CertEditField({
  value, onChange, className = "", multiline = false,
}: { value: string; onChange: (v: string) => void; className?: string; multiline?: boolean }) {
  if (multiline) {
    return (
      <textarea
        value={value}
        onChange={e => onChange(e.target.value)}
        rows={2}
        className={`bg-transparent border-b border-dashed border-gray-400 focus:outline-none focus:border-gray-700 w-full resize-none print:border-none ${className}`}
      />
    );
  }
  return (
    <input
      value={value}
      onChange={e => onChange(e.target.value)}
      className={`bg-transparent border-b border-dashed border-gray-400 focus:outline-none focus:border-gray-700 print:border-none ${className}`}
    />
  );
}

type ShowSections = {
  condicoesAmbientais: boolean;
  textoLotes: boolean;
  infoAdicionais: boolean;
  conclusao: boolean;
  fundamentacaoCinetica: boolean;
  registrosFotograficos: boolean;
};

const CATEGORY_LABELS: Record<string, string> = {
  fisico_quimica: "Análises Físico-Químicas",
  microbiologica: "Análises Microbiológicas",
  teor_ativo: "Teor do Ativo",
  embalagem: "Embalagem",
};

const SECTION_LABELS: { key: keyof ShowSections; label: string }[] = [
  { key: "condicoesAmbientais", label: "Condições Ambientais" },
  { key: "textoLotes", label: "Texto Lotes Piloto" },
  { key: "infoAdicionais", label: "Informações Adicionais" },
  { key: "conclusao", label: "Conclusão" },
  { key: "fundamentacaoCinetica", label: "Fundamentação Cinética" },
  { key: "registrosFotograficos", label: "Registros Fotográficos (Anexo)" },
];

export default function CertificatePage() {
  const { id } = useParams<{ id: string }>();
  const { data: cert, isLoading } = useGetCertificate(Number(id), {
    query: { enabled: !!id, queryKey: getGetCertificateQueryKey(Number(id)) },
  });

  const [showSettings, setShowSettings] = useState(false);
  const [show, setShow] = useState<ShowSections>({
    condicoesAmbientais: true,
    textoLotes: true,
    infoAdicionais: true,
    conclusao: true,
    fundamentacaoCinetica: true,
    registrosFotograficos: false,
  });

  const [tempAmostragem, setTempAmostragem] = useState("22,8°C");
  const [umidAmostragem, setUmidAmostragem] = useState("60% UR");
  const [tempRecebimento, setTempRecebimento] = useState("22,8°C");

  const [analyses, setAnalyses] = useState<Array<{ parameter: string; category: string; method: string; specification: string; result: string; status: string; visible: boolean }> | null>(null);

  const { data: lotsRaw = [] } = useListLots(Number(id), {
    query: { enabled: !!id, queryKey: getListLotsQueryKey(Number(id)) },
  });

  if (!isLoading && cert && analyses === null) {
    setAnalyses(cert.analyses.map(a => ({ ...a, visible: true })));
  }

  const allPhotoEntries = useMemo(() => {
    if (!lotsRaw.length) return [] as PhotoEntry[];
    return collectProtocolImages(Number(id), lotsRaw as { id: number; lotNumber: string }[]);
  }, [id, lotsRaw]);

  const [selectedPhotoKeys, setSelectedPhotoKeys] = useState<Set<string> | null>(null);

  const activePhotoKeys = useMemo(() => {
    if (selectedPhotoKeys !== null) return selectedPhotoKeys;
    return new Set(allPhotoEntries.map(e => e.key));
  }, [selectedPhotoKeys, allPhotoEntries]);

  const togglePhotoKey = (key: string) => {
    setSelectedPhotoKeys(prev => {
      const current = prev ?? new Set(allPhotoEntries.map(e => e.key));
      const next = new Set(current);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  };

  const selectAllPhotos = () => setSelectedPhotoKeys(new Set(allPhotoEntries.map(e => e.key)));
  const deselectAllPhotos = () => setSelectedPhotoKeys(new Set());

  const toggle = (key: keyof ShowSections) => setShow(prev => ({ ...prev, [key]: !prev[key] }));

  const updateAnalysis = (i: number, field: "method" | "specification" | "result", val: string) => {
    setAnalyses(prev => {
      if (!prev) return prev;
      const next = [...prev];
      next[i] = { ...next[i], [field]: val };
      return next;
    });
  };

  const toggleRowVisibility = (i: number) => {
    setAnalyses(prev => {
      if (!prev) return prev;
      const next = [...prev];
      next[i] = { ...next[i], visible: !next[i].visible };
      return next;
    });
  };

  const allVisible = analyses?.every(a => a.visible) ?? true;
  const toggleAllRows = () => {
    setAnalyses(prev => prev ? prev.map(a => ({ ...a, visible: !allVisible })) : prev);
  };

  if (isLoading) {
    return (
      <div className="max-w-4xl mx-auto space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }

  if (!cert) {
    return (
      <div className="text-center py-16 text-muted-foreground">
        <p>Certificado nao encontrado.</p>
        <Link href={`/protocols/${id}`}>
          <Button variant="link" className="mt-2">Voltar ao Protocolo</Button>
        </Link>
      </div>
    );
  }

  const isApproved = cert.finalStatus === "aprovado";
  const isRepproved = cert.finalStatus === "reprovado";
  const rows = analyses ?? cert.analyses.map(a => ({ ...a, visible: true }));

  const visiblePhotoEntries = show.registrosFotograficos
    ? allPhotoEntries.filter(e => activePhotoKeys.has(e.key))
    : [];

  const photosByParam = visiblePhotoEntries.reduce<Record<string, PhotoEntry[]>>((acc, e) => {
    (acc[e.parameter] ??= []).push(e);
    return acc;
  }, {});

  const categories = Array.from(new Set(rows.map(r => r.category)));

  return (
    <div className="max-w-5xl mx-auto space-y-4">
      <div className="flex items-center justify-between print:hidden">
        <Link href={`/protocols/${id}`}>
          <Button variant="ghost" size="sm" data-testid="button-back">
            <ArrowLeft className="h-4 w-4 mr-2" /> Voltar ao Protocolo
          </Button>
        </Link>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => setShowSettings(s => !s)}>
            <Settings2 className="h-4 w-4 mr-2" />
            Configurar Impressão
            {showSettings ? <ChevronUp className="h-3 w-3 ml-1" /> : <ChevronDown className="h-3 w-3 ml-1" />}
          </Button>
          <Button onClick={() => window.print()} data-testid="button-print">
            <Printer className="h-4 w-4 mr-2" /> Imprimir / Salvar PDF
          </Button>
        </div>
      </div>

      {showSettings && (
        <div className="print:hidden border rounded-lg bg-white shadow-sm p-5 space-y-5">
          <p className="text-sm font-semibold text-gray-800">Configurações de Impressão / PDF</p>

          {/* Section toggles */}
          <div className="space-y-2">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Seções do documento</p>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {SECTION_LABELS.map(({ key, label }) => (
                <label key={key} className="flex items-center gap-2 cursor-pointer select-none p-2 rounded-md border border-gray-100 hover:bg-gray-50">
                  <input type="checkbox" checked={show[key]} onChange={() => toggle(key)} className="w-4 h-4 accent-primary" />
                  <span className="text-sm text-gray-700">{label}</span>
                  {key === "registrosFotograficos" && allPhotoEntries.length > 0 && (
                    <span className="ml-auto text-xs text-blue-600 font-semibold">{allPhotoEntries.length} imagem(ns)</span>
                  )}
                </label>
              ))}
            </div>
          </div>

          {/* Image selection — shown when registrosFotograficos is on */}
          {show.registrosFotograficos && (
            <div className="space-y-2 border-t pt-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <ImageIcon className="h-4 w-4 text-blue-600" />
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Selecionar imagens para o anexo</p>
                </div>
                <div className="flex gap-2">
                  <button onClick={selectAllPhotos} className="text-xs px-2 py-1 rounded border border-gray-300 hover:bg-gray-50 text-gray-600">Marcar todas</button>
                  <button onClick={deselectAllPhotos} className="text-xs px-2 py-1 rounded border border-gray-300 hover:bg-gray-50 text-gray-600">Desmarcar todas</button>
                </div>
              </div>
              {allPhotoEntries.length === 0 ? (
                <p className="text-xs text-gray-400 italic">Nenhuma imagem anexada a este protocolo. Anexe imagens na aba Resultados.</p>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {allPhotoEntries.map((entry) => (
                    <label key={entry.key} className="flex items-center gap-2 cursor-pointer select-none p-2 rounded-md border border-gray-100 hover:bg-gray-50">
                      <input
                        type="checkbox"
                        checked={activePhotoKeys.has(entry.key)}
                        onChange={() => togglePhotoKey(entry.key)}
                        className="w-4 h-4 accent-primary"
                      />
                      <div className="flex-1 min-w-0">
                        <span className="text-xs font-medium text-gray-700 block truncate">{entry.parameter}</span>
                        <span className="text-[10px] text-gray-400">Lote {entry.lotNumber} · T{entry.period} · {entry.images.length} foto(s)</span>
                      </div>
                      <div className="flex gap-0.5">
                        {entry.images.slice(0, 3).map((img, ii) => (
                          <img key={ii} src={img} alt="" className="w-8 h-8 object-cover rounded border border-gray-200" />
                        ))}
                        {entry.images.length > 3 && <span className="text-[10px] text-gray-400 self-center ml-0.5">+{entry.images.length - 3}</span>}
                      </div>
                    </label>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Row visibility */}
          <div className="space-y-2 border-t pt-4">
            <div className="flex items-center justify-between">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Linhas de análise visíveis no PDF</p>
              <button onClick={toggleAllRows} className="text-xs px-2 py-1 rounded border border-gray-300 hover:bg-gray-50 text-gray-600">
                {allVisible ? "Desmarcar todas" : "Marcar todas"}
              </button>
            </div>
            <p className="text-xs text-gray-400">Desmarque linhas que não devem aparecer na impressão.</p>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-1 max-h-48 overflow-y-auto pr-1">
              {rows.map((row, i) => (
                <label key={i} className="flex items-center gap-2 cursor-pointer select-none p-1.5 rounded hover:bg-gray-50">
                  <input
                    type="checkbox"
                    checked={row.visible}
                    onChange={() => toggleRowVisibility(i)}
                    className="w-3.5 h-3.5 accent-primary"
                  />
                  <span className={`text-xs truncate ${row.visible ? "text-gray-700" : "text-gray-300 line-through"}`}>{row.parameter}</span>
                </label>
              ))}
            </div>
          </div>
        </div>
      )}

      <div
        id="certificate-document"
        className="bg-white text-gray-900 border border-gray-300 shadow-lg rounded-sm p-10 font-sans text-sm leading-relaxed"
        data-testid="certificate-document"
      >
        <div className="flex items-start justify-between border-b-2 border-gray-800 pb-4 mb-6">
          <div>
            <p className="text-xs font-bold uppercase tracking-widest text-gray-500 mb-1">Alphafitus Laboratorio Nutraceutico</p>
            <h1 className="text-2xl font-bold uppercase tracking-wide">Suplemento Alimentar</h1>
            <p className="text-base font-semibold text-gray-600 mt-0.5">{cert.productName}</p>
          </div>
          <div className="text-right text-sm space-y-1 min-w-48">
            <div>
              <span className="text-gray-500 text-xs block">Numero</span>
              <span className="font-bold tracking-wide">{cert.certNumber}</span>
            </div>
            <div>
              <span className="text-gray-500 text-xs block">Data de Emissao</span>
              <span className="font-medium">{cert.issueDate}</span>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-6 mb-6 text-sm">
          <div className="space-y-2">
            <h2 className="text-xs font-bold uppercase tracking-widest text-gray-500 border-b pb-1">Dados do Produto</h2>
            <dl className="space-y-1">
              <div className="flex gap-2"><dt className="text-gray-500 min-w-20">Empresa:</dt><dd className="font-medium">{cert.companyName}</dd></div>
              <div className="flex gap-2"><dt className="text-gray-500 min-w-20">CNPJ:</dt><dd className="font-medium">{cert.cnpj}</dd></div>
              {(cert as any).ie && <div className="flex gap-2"><dt className="text-gray-500 min-w-20">IE:</dt><dd>{(cert as any).ie}</dd></div>}
              {cert.address && <div className="flex gap-2"><dt className="text-gray-500 min-w-20">Endereço:</dt><dd>{cert.address}</dd></div>}
              {(cert as any).cep && <div className="flex gap-2"><dt className="text-gray-500 min-w-20">CEP:</dt><dd>{(cert as any).cep}</dd></div>}
              {cert.email && <div className="flex gap-2"><dt className="text-gray-500 min-w-20">Email:</dt><dd>{cert.email}</dd></div>}
            </dl>
          </div>
          <div className="space-y-2">
            <h2 className="text-xs font-bold uppercase tracking-widest text-gray-500 border-b pb-1">Identificacao</h2>
            <dl className="space-y-1">
              <div className="flex gap-2"><dt className="text-gray-500 min-w-20">Produto:</dt><dd className="font-medium">{cert.productName}</dd></div>
              {cert.presentation && <div className="flex gap-2"><dt className="text-gray-500 min-w-20">Apresentacao:</dt><dd>{cert.presentation}</dd></div>}
              {cert.validityMonths && <div className="flex gap-2"><dt className="text-gray-500 min-w-20">Validade:</dt><dd className="font-semibold">{cert.validityMonths} meses</dd></div>}
              {cert.lotNumbers.length > 0 && (
                <div className="flex gap-2">
                  <dt className="text-gray-500 min-w-20">N° do Lote:</dt>
                  <dd>{cert.lotNumbers.join(", ")}</dd>
                </div>
              )}
            </dl>
          </div>
        </div>

        {show.condicoesAmbientais && (
          <div className="mb-6 border border-gray-200 rounded p-3 bg-gray-50 text-xs space-y-2">
            <p className="font-bold uppercase tracking-widest text-gray-500">Condições Ambientais</p>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-gray-500">Amostragem — Temperatura:</span>
                  <CertEditField value={tempAmostragem} onChange={setTempAmostragem} className="w-20 text-xs" />
                  <span className="text-gray-500 ml-2">Umidade:</span>
                  <CertEditField value={umidAmostragem} onChange={setUmidAmostragem} className="w-20 text-xs" />
                </div>
              </div>
              <div className="space-y-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-gray-500">Recebimento da amostra — Temperatura:</span>
                  <CertEditField value={tempRecebimento} onChange={setTempRecebimento} className="w-20 text-xs" />
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Analysis table grouped by category */}
        <div className="mb-6">
          <h2 className="text-xs font-bold uppercase tracking-widest text-gray-500 border-b pb-1 mb-3">Resultados de Analise</h2>
          <table className="w-full text-xs border-collapse">
            <thead>
              <tr className="bg-gray-100">
                <th className="border border-gray-300 px-2 py-2 text-left font-semibold uppercase tracking-wide w-28">Analise</th>
                <th className="border border-gray-300 px-2 py-2 text-left font-semibold uppercase tracking-wide">Metodo</th>
                <th className="border border-gray-300 px-2 py-2 text-left font-semibold uppercase tracking-wide w-28">Especificacoes</th>
                <th className="border border-gray-300 px-2 py-2 text-center font-semibold uppercase tracking-wide w-20">Resultado</th>
                <th className="border border-gray-300 px-2 py-2 text-center font-semibold uppercase tracking-wide w-24">Status</th>
                <th className="border border-gray-300 px-2 py-2 text-center font-semibold uppercase tracking-wide w-10 print:hidden">
                  <span className="text-[9px] text-gray-400 uppercase tracking-wide">PDF</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {categories.map((cat) => {
                const catRows = rows
                  .map((r, originalIndex) => ({ ...r, originalIndex }))
                  .filter(r => r.category === cat);
                if (catRows.length === 0) return null;
                const allCatHidden = catRows.every(r => !r.visible);
                return (
                  <>
                    {/* Category header row */}
                    <tr key={`cat-${cat}`} className={allCatHidden ? "print:hidden" : ""}>
                      <td
                        colSpan={6}
                        className="border border-gray-300 px-2 py-1 bg-gray-200 font-bold text-[10px] uppercase tracking-widest text-gray-600"
                      >
                        {CATEGORY_LABELS[cat] ?? cat}
                      </td>
                    </tr>
                    {catRows.map((analysis, ci) => (
                      <tr
                        key={`${cat}-${ci}`}
                        className={[
                          ci % 2 === 0 ? "" : "bg-gray-50",
                          !analysis.visible ? "opacity-30 print:hidden" : "",
                        ].join(" ")}
                        data-testid={`row-analysis-${analysis.originalIndex}`}
                      >
                        <td className="border border-gray-300 px-2 py-1.5 font-medium align-top">{analysis.parameter}</td>
                        <td className="border border-gray-300 px-2 py-1.5 text-gray-600 align-top">
                          <CertEditField
                            value={analysis.method}
                            onChange={v => updateAnalysis(analysis.originalIndex, "method", v)}
                            multiline
                            className="text-xs leading-snug"
                          />
                        </td>
                        <td className="border border-gray-300 px-2 py-1.5 font-mono align-top">
                          <CertEditField
                            value={analysis.specification}
                            onChange={v => updateAnalysis(analysis.originalIndex, "specification", v)}
                            className="text-xs w-full font-mono"
                          />
                        </td>
                        <td className="border border-gray-300 px-2 py-1.5 text-center font-mono font-medium align-top">
                          <CertEditField
                            value={analysis.result}
                            onChange={v => updateAnalysis(analysis.originalIndex, "result", v)}
                            className="text-xs text-center w-16 font-mono"
                          />
                        </td>
                        <td className="border border-gray-300 px-2 py-1.5 text-center align-top">
                          <span className={`font-semibold ${analysis.status === "Conforme" ? "text-green-700" : analysis.status === "Nao Conforme" ? "text-red-700" : analysis.status === "Aprovado com Ressalva" ? "text-amber-700" : "text-gray-500"}`}>
                            {analysis.status}
                          </span>
                        </td>
                        <td className="border border-gray-300 px-2 py-1.5 text-center align-middle print:hidden">
                          <input
                            type="checkbox"
                            checked={analysis.visible}
                            onChange={() => toggleRowVisibility(analysis.originalIndex)}
                            title={analysis.visible ? "Ocultar na impressão" : "Incluir na impressão"}
                            className="w-4 h-4 accent-primary cursor-pointer"
                          />
                        </td>
                      </tr>
                    ))}
                    {/* EMBALAGEM footnote after the last embalagem row */}
                    {cat === "embalagem" && !allCatHidden && (
                      <tr key="embalagem-note">
                        <td
                          colSpan={6}
                          className="border border-gray-300 px-2 py-1.5 bg-amber-50 text-[10px] text-amber-800 italic"
                        >
                          * Os resultados de embalagem representam a média dos ensaios realizados ao longo dos 6 meses de estudo de estabilidade (T0, T3 e T6).
                        </td>
                      </tr>
                    )}
                  </>
                );
              })}
            </tbody>
          </table>
        </div>

        {show.textoLotes && (
          <div className="mb-6 border-l-4 border-gray-400 pl-4 bg-gray-50 py-3 pr-3 rounded-r text-xs text-gray-700 space-y-2">
            <p>Os lotes piloto foram produzidos em datas distintas, sob condições equivalentes de fabricação, visando assegurar a independência entre os lotes, a rastreabilidade do estudo e a minimização do risco de desvios operacionais ou interferências de processo.</p>
            <p>Alimento está sendo testado em embalagem equivalente e sistema de fechamento nos quais será comercializado.</p>
          </div>
        )}

        {show.infoAdicionais && (
          <div className="mb-6 border border-gray-200 rounded p-3 bg-gray-50">
            <p className="text-xs text-gray-500 mb-1">Informacoes Adicionais</p>
            <p className="text-xs">Este documento deve ser reproduzido integralmente. A reproducao parcial somente e permitida mediante autorizacao formal e escrita do laboratorio.</p>
            <p className="text-xs mt-1">Os resultados apresentados referem-se exclusivamente as amostras recebidas e foram obtidos e reportados de acordo com as condicoes analiticas estabelecidas e metodologias aplicaveis.</p>
            <p className="text-xs mt-1"><strong>NA</strong> = Nao se aplica &nbsp;&nbsp;<strong>ND</strong> = Nao detectado &nbsp;&nbsp;<strong>LQ</strong> = Limite de quantificacao</p>
          </div>
        )}

        {show.conclusao && cert.conclusion && (
          <div className="mb-6 font-semibold text-center text-sm uppercase tracking-wide border-t border-b border-gray-300 py-3">
            CONCLUSAO: {cert.conclusion}
          </div>
        )}

        <div className="mb-6 flex items-center gap-6">
          <div className="flex items-center gap-3">
            <div className={`w-5 h-5 border-2 flex items-center justify-center ${isApproved ? "border-gray-800 bg-gray-800" : "border-gray-400"}`}>
              {isApproved && <span className="text-white text-xs font-bold">X</span>}
            </div>
            <span className="font-medium">APROVADO</span>
          </div>
          <div className="flex items-center gap-3">
            <div className={`w-5 h-5 border-2 flex items-center justify-center ${isRepproved ? "border-gray-800 bg-gray-800" : "border-gray-400"}`}>
              {isRepproved && <span className="text-white text-xs font-bold">X</span>}
            </div>
            <span className="font-medium">REPROVADO</span>
          </div>
          {cert.issueDate && (
            <span className="ml-auto text-gray-500 text-xs">DATA: {cert.issueDate}</span>
          )}
        </div>

        {show.fundamentacaoCinetica && (
          <div className="mb-6 rounded border border-gray-200 bg-gray-50 p-4 text-xs text-gray-700 space-y-3">
            <p className="font-semibold text-gray-800 uppercase tracking-wide">Fundamentação do Modelo Cinético</p>
            <p className="leading-relaxed">Para a estimativa do tempo de validade do produto, foi empregado o modelo cinético de degradação de primeira ordem, amplamente descrito na literatura para substâncias bioativas submetidas à avaliação de estabilidade sob condições de estresse controlado, como temperatura e umidade. A modelagem foi conduzida a partir da equação geral de primeira ordem:</p>
            <p className="font-mono bg-white border border-gray-200 rounded px-3 py-1.5 inline-block">
              C<sub>t</sub> = C<sub>0</sub> · e<sup>−kt</sup>
            </p>
            <div className="pl-3 border-l-2 border-gray-300 space-y-0.5 leading-relaxed">
              <p>C<sub>t</sub> = concentração do ativo no tempo <em>t</em></p>
              <p>C<sub>0</sub> = concentração inicial do ativo</p>
              <p><em>k</em> = constante de velocidade de degradação</p>
              <p><em>t</em> = tempo de armazenamento</p>
            </div>
            <p className="leading-relaxed">A constante de degradação (<em>k</em>) é dependente da temperatura e pode ser descrita matematicamente pela equação de Arrhenius:</p>
            <p className="font-mono bg-white border border-gray-200 rounded px-3 py-1.5 inline-block">
              k = A · e<sup>−E<sub>a</sub>/RT</sup>
            </p>
            <div className="pl-3 border-l-2 border-gray-300 space-y-0.5 leading-relaxed">
              <p>A = fator pré-exponencial</p>
              <p>E<sub>a</sub> = energia de ativação</p>
              <p>R = constante universal dos gases</p>
              <p>T = temperatura absoluta (Kelvin)</p>
            </div>
          </div>
        )}

        <div className="grid grid-cols-2 gap-8 pt-4 border-t border-gray-300">
          {cert.issuedBy && (
            <div>
              <p className="font-semibold text-sm">{cert.issuedBy}</p>
              <p className="text-xs text-gray-500">Responsavel Tecnico</p>
              {cert.seniorAnalystEmail && <p className="text-xs text-gray-500">{cert.seniorAnalystEmail}</p>}
              <div className="mt-8 border-t border-gray-400 w-64">
                <p className="text-xs text-gray-400 mt-1">Assinatura</p>
              </div>
            </div>
          )}
          {cert.seniorAnalyst && (
            <div>
              <p className="font-semibold text-sm">{cert.seniorAnalyst}</p>
              <p className="text-xs text-gray-500">Analista Senior / Representante Legal</p>
              <div className="mt-8 border-t border-gray-400 w-64">
                <p className="text-xs text-gray-400 mt-1">Assinatura</p>
              </div>
            </div>
          )}
        </div>

        {/* Photo appendix */}
        {show.registrosFotograficos && Object.keys(photosByParam).length > 0 && (
          <div className="mt-8 pt-6 border-t-2 border-gray-800">
            <p className="text-xs font-bold uppercase tracking-widest text-gray-500 text-center mb-6">
              ANEXO — REGISTROS FOTOGRÁFICOS DOS ENSAIOS
            </p>
            {Object.entries(photosByParam).map(([param, entries]) => (
              <div key={param} className="mb-8 break-inside-avoid">
                <p className="text-xs font-bold text-gray-700 border-b border-gray-300 pb-1 mb-3 uppercase tracking-wide">
                  Parâmetro: {param}
                </p>
                <div className="space-y-4">
                  {entries.map((entry, ei) => (
                    <div key={ei}>
                      <p className="text-xs text-gray-500 mb-2">
                        Lote: <span className="font-semibold text-gray-700">{entry.lotNumber}</span>
                        &nbsp;·&nbsp;
                        Período: <span className="font-semibold text-gray-700">T{entry.period}</span>
                      </p>
                      <div className="flex flex-wrap gap-3">
                        {entry.images.map((img, ii) => (
                          <div key={ii} className="border border-gray-200 rounded overflow-hidden">
                            <img
                              src={img}
                              alt={`${param} — Lote ${entry.lotNumber} — T${entry.period} — imagem ${ii + 1}`}
                              className="w-40 h-40 object-cover block"
                            />
                            <p className="text-[9px] text-center text-gray-400 py-0.5 bg-gray-50">
                              Img {ii + 1}
                            </p>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}

        {show.registrosFotograficos && allPhotoEntries.length > 0 && Object.keys(photosByParam).length === 0 && (
          <div className="mt-8 pt-6 border-t-2 border-gray-300 text-center text-xs text-gray-400">
            Nenhuma imagem selecionada para o anexo.
          </div>
        )}

        {show.registrosFotograficos && allPhotoEntries.length === 0 && (
          <div className="mt-8 pt-6 border-t-2 border-gray-300 text-center text-xs text-gray-400">
            Nenhuma imagem anexada para este protocolo.
          </div>
        )}
      </div>

      <style>{`
        @media print {
          body * { visibility: hidden; }
          #certificate-document, #certificate-document * { visibility: visible; }
          #certificate-document { position: absolute; left: 0; top: 0; width: 100%; box-shadow: none; border: none; padding: 20px; }
          input, textarea { border: none !important; background: transparent !important; }
          img { max-width: 100%; break-inside: avoid; }
          .break-inside-avoid { break-inside: avoid; }
        }
      `}</style>
    </div>
  );
}
