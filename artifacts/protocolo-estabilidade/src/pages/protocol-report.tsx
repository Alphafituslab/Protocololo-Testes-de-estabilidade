import { useParams, Link } from "wouter";
import { fmtDate, addMonthsToIso } from "@/lib/utils";
import { useState, useRef, useEffect, useMemo } from "react";
import {
  useGetCertificate, getGetCertificateQueryKey,
  useGetProtocol, getGetProtocolQueryKey,
  useListLots, getListLotsQueryKey,
  useGetKinetics, getGetKineticsQueryKey,
  useListSignatures, getListSignaturesQueryKey,
  useListProtocolBibliographicReferences,
  getListProtocolBibliographicReferencesQueryKey,
  useListAttachments, getListAttachmentsQueryKey,
  type BibliographicReference,
} from "@workspace/api-client-react";
import { AuditTrail } from "@/components/audit-trail";
import { Button } from "@/components/ui/button";
import { Loader2, Printer, ArrowLeft, CheckCircle2, XCircle, AlertCircle, Clock, Settings2, Paperclip, FileText, File, Image as ImageIcon } from "lucide-react";

const STATUS_LABEL: Record<string, string> = {
  aprovado: "Aprovado",
  reprovado: "Reprovado",
  aprovado_com_ressalva: "Aprovado c/ Ressalva",
  em_andamento: "Em Andamento",
  rascunho: "Rascunho",
};

// Ordem canônica dos parâmetros — igual à tabela de Resultados (protocol-detail.tsx)
const PARAM_ORDER = [
  "pH", "Perda por dessecação", "Cor", "Odor", "Aparência",
  "Cinzas totais", "Dissolução", "Massa média", "Kcal", "Sódio",
  "Coliformes totais", "Salmonella spp.", "Estafilococos coagulase+",
  "Bolores e leveduras", "Escherichia coli", "Enterobacteriaceae",
  "Cálcio", "Vitamina D",
  "Torque de tampa", "Selagem por indução", "Integridade selagem",
];

function sortParams(params: string[]): string[] {
  return [...params].sort((a, b) => {
    const ia = PARAM_ORDER.indexOf(a);
    const ib = PARAM_ORDER.indexOf(b);
    if (ia === -1 && ib === -1) return a.localeCompare(b, "pt");
    if (ia === -1) return 1;
    if (ib === -1) return -1;
    return ia - ib;
  });
}

const PRINT_SECTIONS = [
  { key: "s1",  label: "1. Identificação da Empresa" },
  { key: "s2",  label: "2. Identificação do Produto" },
  { key: "s3",  label: "3. Plano de Estabilidade" },
  { key: "s4",  label: "4. Lotes Piloto do Estudo" },
  { key: "s5",  label: "5. Resultados — Síntese" },
  { key: "s5b", label: "5b. Resultados Detalhados" },
  { key: "s6",  label: "6. Cinética de Estabilidade" },
  { key: "s7",  label: "7. Metodologias Analíticas" },
  { key: "s8",  label: "8. Conclusão" },
  { key: "s9",  label: "9. Assinaturas Eletrônicas" },
  { key: "s10", label: "10. Histórico de Rastreabilidade" },
  { key: "s11", label: "11. Referências Bibliográficas" },
  { key: "s12", label: "12. Documentos Anexos" },
];

function formatAbntRef(r: BibliographicReference): string {
  const parts: string[] = [];
  if (r.autores) parts.push(r.autores + ".");
  if (r.titulo) parts.push(r.titulo + ".");
  if (r.fonte) parts.push(r.fonte + (r.volume || r.numero || r.paginas || r.ano ? "," : "."));
  if (r.volume) parts.push(`v. ${r.volume}${r.numero || r.paginas || r.ano ? "," : "."}`);
  if (r.numero) parts.push(`n. ${r.numero}${r.paginas || r.ano ? "," : "."}`);
  if (r.paginas) parts.push(`p. ${r.paginas}${r.ano ? "," : "."}`);
  if (r.ano) parts.push(`${r.ano}.`);
  if (r.doi) parts.push(`Disponível em: ${r.doi}.`);
  return parts.join(" ");
}

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

function ReportField({
  value,
  onChange,
  className,
}: {
  value: string;
  onChange: (v: string) => void;
  className?: string;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  return (
    <span
      ref={ref}
      contentEditable
      suppressContentEditableWarning
      onBlur={e => onChange(e.currentTarget.textContent ?? "")}
      className={`outline-none border-b border-dashed border-gray-400 min-w-[4rem] inline-block cursor-text print:border-none ${className ?? ""}`}
    >
      {value}
    </span>
  );
}

function Section({ num, title, children }: { num: string; title: string; children: React.ReactNode }) {
  return (
    <div className="report-section mb-4 print:mb-2 border border-gray-200 rounded overflow-hidden">
      <div className="report-section-header bg-slate-700 px-4 py-1.5">
        <h2 className="text-[10px] font-semibold uppercase tracking-wider text-slate-100">{num}. {title}</h2>
      </div>
      <div className="px-4 py-2.5 print:px-3 print:py-1.5">{children}</div>
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
  "Conforme": "Conforme",
  "Nao Conforme": "Não Conforme",
  "Aprovado com Ressalva": "Aprovado com Ressalva",
  "N/A": "N/A",
  conforme: "Conforme",
  nao_conforme: "Não Conforme",
  aprovado_com_ressalva: "Aprovado com Ressalva",
  na: "N/A",
  nd: "Não Detectado",
  lq: "Limite de Quantificação",
};

const RESULT_COLOR: Record<string, string> = {
  "Conforme": "text-emerald-700",
  "Nao Conforme": "text-red-600 font-bold",
  "Aprovado com Ressalva": "text-amber-600",
  "N/A": "text-gray-400",
  conforme: "text-emerald-700",
  nao_conforme: "text-red-600 font-bold",
  aprovado_com_ressalva: "text-amber-600",
  na: "text-gray-400",
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
    query: { enabled: !!id, queryKey: getGetCertificateQueryKey(numId), staleTime: 0, refetchOnWindowFocus: true },
  });
  const { data: protocol, isLoading: protLoading } = useGetProtocol(numId, {
    query: { enabled: !!id, queryKey: getGetProtocolQueryKey(numId), staleTime: 0, refetchOnWindowFocus: true },
  });
  const { data: lotsRaw = [] } = useListLots(numId, {
    query: { enabled: !!id, queryKey: getListLotsQueryKey(numId), staleTime: 0, refetchOnWindowFocus: true },
  });
  const { data: kineticsData } = useGetKinetics(numId, {
    query: { enabled: !!id, queryKey: getGetKineticsQueryKey(numId), staleTime: 0, refetchOnWindowFocus: true },
  });
  const { data: signatures = [] } = useListSignatures(numId, {
    query: { enabled: !!id, queryKey: getListSignaturesQueryKey(numId), staleTime: 0, refetchOnWindowFocus: true },
  });
  const { data: protocolRefs = [] } = useListProtocolBibliographicReferences(numId, {
    query: { enabled: !!id, staleTime: 0, queryKey: getListProtocolBibliographicReferencesQueryKey(numId) },
  });
  const { data: attachmentsList = [] } = useListAttachments(numId, {
    query: { enabled: !!id, staleTime: 0, queryKey: getListAttachmentsQueryKey(numId) },
  });
  const sortedAttachments = useMemo(
    () => [...attachmentsList].sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()),
    [attachmentsList]
  );
  const [attachmentBlobUrls, setAttachmentBlobUrls] = useState<Record<number, string>>({});

  // ── Todos os hooks ANTES de qualquer early return ────────────────────────

  // Data de emissão: prioridade = cert edit > cert.issueDate do banco > hoje
  // Usa cert?.issueDate pois cert pode ser undefined antes do loading terminar
  const computeEmissionDate = (certIssueDate: string | null | undefined) => {
    try {
      const edits = JSON.parse(localStorage.getItem(`cert_edits_v4_${id}`) ?? "{}") as Record<string, string>;
      if (edits["issueDate"]) return edits["issueDate"];
    } catch { /* ignore */ }
    if (certIssueDate) return certIssueDate;
    return new Date().toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" });
  };
  const [emissionDate, setEmissionDate] = useState<string>(() => computeEmissionDate(cert?.issueDate));
  useEffect(() => {
    setEmissionDate(computeEmissionDate(cert?.issueDate));
    const handler = (e: StorageEvent) => {
      if (e.key === `cert_edits_v4_${id}`) setEmissionDate(computeEmissionDate(cert?.issueDate));
    };
    window.addEventListener("storage", handler);
    return () => window.removeEventListener("storage", handler);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, cert?.issueDate]);

  // Edições locais do relatório (override por protocolo)
  const [reportEdits, setReportEditsState] = useState<Record<string, string>>(() => {
    try {
      const raw = localStorage.getItem(`report_overrides_${id}`);
      return raw ? (JSON.parse(raw) as Record<string, string>) : {};
    } catch { return {}; }
  });
  const setReportEdit = (key: string, val: string) => {
    setReportEditsState(prev => {
      const next = { ...prev, [key]: val };
      try { localStorage.setItem(`report_overrides_${id}`, JSON.stringify(next)); } catch { /* ignore */ }
      return next;
    });
  };
  const getReportEdit = (key: string, fallback: string): string =>
    reportEdits[key] !== undefined && reportEdits[key] !== "" ? reportEdits[key] : fallback;

  // ── Configurações de impressão ───────────────────────────────────────────
  const PRINT_PREFS_KEY = `report_print_prefs_${id}`;
  const [printSections, setPrintSections] = useState<Record<string, boolean>>(() => {
    try {
      const raw = localStorage.getItem(PRINT_PREFS_KEY);
      if (raw) return JSON.parse(raw) as Record<string, boolean>;
    } catch { /* ignore */ }
    return {};
  });
  const [showPrintSettings, setShowPrintSettings] = useState(false);
  const printSettingsRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!showPrintSettings) return;
    const handler = (e: MouseEvent) => {
      if (printSettingsRef.current && !printSettingsRef.current.contains(e.target as Node))
        setShowPrintSettings(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [showPrintSettings]);

  // Pre-fetch image + PDF blobs for inline viewing
  useEffect(() => {
    if (!id || sortedAttachments.length === 0) return;
    if (printSections["s12"] === false) return;
    const token = localStorage.getItem("alphafitus_token");
    const fetchable = sortedAttachments.filter(
      a => a.fileType.startsWith("image/") || a.fileType === "application/pdf"
    );
    if (fetchable.length === 0) return;
    let cancelled = false;
    (async () => {
      const urls: Record<number, string> = {};
      for (const att of fetchable) {
        try {
          const r = await fetch(`/api/storage${att.objectPath}`, {
            headers: token ? { Authorization: `Bearer ${token}` } : {},
          });
          if (!r.ok || cancelled) continue;
          const blob = await r.blob();
          if (cancelled) continue;
          urls[att.id] = URL.createObjectURL(blob);
        } catch { /* ignore */ }
      }
      if (!cancelled) setAttachmentBlobUrls(urls);
    })();
    return () => { cancelled = true; };
  }, [id, sortedAttachments, printSections]);

  // ── Early returns DEPOIS de todos os hooks ───────────────────────────────
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
  const isPrint = (key: string) => printSections[key] !== false;
  const toggleSection = (key: string) => {
    setPrintSections(prev => {
      const next = { ...prev, [key]: !isPrint(key) };
      try { localStorage.setItem(PRINT_PREFS_KEY, JSON.stringify(next)); } catch { /* */ }
      return next;
    });
  };
  const setAllSections = (val: boolean) => {
    const next = Object.fromEntries(PRINT_SECTIONS.map(s => [s.key, val]));
    try { localStorage.setItem(PRINT_PREFS_KEY, JSON.stringify(next)); } catch { /* */ }
    setPrintSections(next);
  };

  const normSigName = (s: string) =>
    s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, " ").trim();
  const sigNameMatches = (a: string, b: string) => {
    const na = normSigName(a), nb = normSigName(b);
    return na === nb || na.includes(nb) || nb.includes(na);
  };
  const hasSigned = (name: string | null | undefined) => {
    if (!name?.trim()) return true;
    return signatures.some(s => sigNameMatches(s.userDisplay, name));
  };
  const someSigned = signatures.length > 0;
  const allSigned = someSigned && hasSigned(cert?.issuedBy) && hasSigned(cert?.seniorAnalyst);

  // Resolve method com mesma prioridade do certificado:
  // cert_overrides > param_methods_citations > param_methods > API default
  const resolvedMethod = (param: string, apiMethod: string | null | undefined): string => {
    try {
      const overrides = JSON.parse(localStorage.getItem(`cert_overrides_${id}`) ?? "{}") as Record<string, Record<string, string>>;
      if (overrides[param]?.method) return overrides[param].method;
      const citations = JSON.parse(localStorage.getItem(`param_methods_citations_${id}`) ?? "{}") as Record<string, string>;
      if (citations[param]) return citations[param];
      const methods = JSON.parse(localStorage.getItem(`param_methods_${id}`) ?? "{}") as Record<string, string>;
      if (methods[param]) return methods[param];
    } catch { /* ignore */ }
    return apiMethod ?? "";
  };

  // Wrapper: quando desmarcada, não renderiza o nó (sem DOM = sem página em branco)
  const ps = (key: string, node: React.ReactNode) =>
    isPrint(key) ? node : null;

  const lots = [...lotsRaw].sort((a, b) => a.lotNumber.localeCompare(b.lotNumber));

  // Datas das análises por período — lê localStorage da aba de resultados (fonte primária)
  // e cai para os dados do banco (cert.analysisDates) como fallback
  const periodDatesLS: Record<string, string> = (() => {
    try {
      const raw = localStorage.getItem(`period_analysis_dates_${id}`);
      return raw ? JSON.parse(raw) : {};
    } catch { return {}; }
  })();
  const getAnalysisDate = (period: number, apiDate: string | null | undefined): string => {
    const raw = periodDatesLS[String(period)] || apiDate || "";
    return fmtDate(raw) as string || raw;
  };

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
    <div className="min-h-screen bg-gray-50 print:min-h-0 print:bg-white">
      {/* ── Toolbar (screen only) ────────────────────────────────────── */}
      <div className="report-toolbar print:hidden sticky top-0 z-10 bg-white border-b border-gray-200 px-6 py-3 flex items-center justify-between shadow-sm">
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
          {/* Configurações de impressão */}
          <div className="relative" ref={printSettingsRef}>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowPrintSettings(v => !v)}
              className="gap-1.5 text-xs"
            >
              <Settings2 className="h-3.5 w-3.5" />
              Seções
              {PRINT_SECTIONS.some(s => !isPrint(s.key)) && (
                <span className="ml-0.5 inline-flex items-center justify-center w-4 h-4 rounded-full bg-primary text-white text-[9px] font-bold">
                  {PRINT_SECTIONS.filter(s => !isPrint(s.key)).length}
                </span>
              )}
            </Button>
            {showPrintSettings && (
              <div className="absolute right-0 top-full mt-1 w-60 bg-white border border-gray-200 rounded-lg shadow-lg z-50 p-3">
                <div className="flex items-center justify-between mb-2 pb-2 border-b border-gray-100">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-gray-500">Seções na impressão</p>
                  <div className="flex gap-2">
                    <button onClick={() => setAllSections(true)} className="text-[10px] text-primary hover:underline">Todas</button>
                    <span className="text-gray-300">|</span>
                    <button onClick={() => setAllSections(false)} className="text-[10px] text-gray-400 hover:underline">Nenhuma</button>
                  </div>
                </div>
                <div className="space-y-1">
                  {PRINT_SECTIONS.map(s => (
                    <label key={s.key} className="flex items-center gap-2 cursor-pointer py-0.5 px-1 rounded hover:bg-gray-50">
                      <input
                        type="checkbox"
                        checked={isPrint(s.key)}
                        onChange={() => toggleSection(s.key)}
                        className="w-3.5 h-3.5 accent-primary"
                      />
                      <span className={`text-[11px] ${isPrint(s.key) ? "text-gray-800" : "text-gray-400 line-through"}`}>
                        {s.label}
                      </span>
                    </label>
                  ))}
                </div>
              </div>
            )}
          </div>
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
        <div className="px-8 pt-7 pb-5 print:px-0 print:pt-2 print:pb-3 border-b-2 border-gray-800">
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
        <div className="px-8 py-6 print:px-0 print:py-3 space-y-0">

          {/* 1. Empresa */}
          {ps("s1", <Section num="1" title="Identificação da Empresa">
            <InfoGrid>
              <InfoRow label="Empresa" value={cert.companyName} wide />
              <InfoRow label="CNPJ" value={cert.cnpj} />
              <InfoRow label="IE" value={(cert as any).ie} />
              <InfoRow label="E-mail" value={cert.email} wide />
              <InfoRow label="Endereço" value={cert.address} wide />
            </InfoGrid>
          </Section>)}

          {/* 2. Produto */}
          {ps("s2", <Section num="2" title="Identificação do Produto">
            <InfoGrid>
              <InfoRow label="Produto" value={cert.productName} wide />
              <InfoRow label="Apresentação" value={cert.presentation} />
              <InfoRow label="Tipo de Embalagem" value={cert.packagingType} />
              <InfoRow label="Validade Praticada" value={cert.validityMonths ? `${cert.validityMonths} meses` : "—"} />
              <InfoRow label="Ingredientes Ativos" value={cert.activeIngredients} wide />
              <InfoRow label="Excipientes" value={cert.excipients} wide />
              <InfoRow label="Composição da Cápsula" value={cert.capsuleComposition} wide />
            </InfoGrid>
            {lots.length > 0 && (
              <div className="mt-3 pt-3 border-t border-gray-100">
                <p className="text-[8px] font-bold uppercase tracking-widest text-gray-400 mb-1.5">Lotes Piloto Incluídos neste Estudo</p>
                <div className="space-y-0.5">
                  {lots.map((lot, i) => (
                    <div key={lot.id} className="grid text-[10px]" style={{ gridTemplateColumns: "1fr auto auto auto", gap: "0 12px" }}>
                      <span className="font-semibold">{i + 1} — {lot.lotNumber}</span>
                      <span className="text-gray-500 text-right">{lot.manufacturingDate ? `Fab. ${fmtDate(lot.manufacturingDate)}` : ""}</span>
                      <span className="text-gray-800 font-semibold text-right">{cert.validityMonths ? `Val. ${cert.validityMonths} meses` : ""}</span>
                      <span className="text-gray-500 text-right">{lot.quantity ? `${lot.quantity} un.` : ""}</span>
                    </div>
                  ))}
                </div>
                <div className="mt-2 flex items-start gap-1.5 rounded border-l-2 border-gray-800 bg-gray-50 px-2 py-1.5 print:bg-gray-50">
                  <span className="text-gray-800 text-[8.5px] leading-none mt-px shrink-0">★</span>
                  <p className="text-[8.5px] font-bold text-black leading-snug underline">
                    Alimento está sendo testado em embalagem equivalente e sistema de fechamento nos quais será comercializado.
                  </p>
                </div>
              </div>
            )}
          </Section>)}

          {/* 3. Plano de Estabilidade */}
          {ps("s3", <Section num="3" title="Plano de Estabilidade Acelerada (ICH Q1A(R2))">
            <div className="grid grid-cols-4 gap-3 mb-3">
              {[
                { label: "Temperatura", value: cert.storageTemp ?? "40°C ± 2°C" },
                { label: "Umidade Relativa", value: cert.storageHumidity ?? "75% UR ± 5% UR" },
                { label: "Período do Estudo", value: cert.studyPeriodMonths ? `${cert.studyPeriodMonths} meses` : "—" },
                { label: "Intervalos", value: cert.testIntervals ?? "—" },
              ].map(({ label, value }) => (
                <div key={label} className="rounded border border-gray-200 px-3 py-2 bg-gray-50 print:bg-gray-50">
                  <p className="text-[8px] font-bold tracking-normal text-gray-400 mb-0.5">{label}</p>
                  <p className="text-[10px] font-semibold text-gray-800">{value}</p>
                </div>
              ))}
            </div>
            {/* Datas das análises por período */}
            <div className="grid grid-cols-3 gap-3">
              {([0, 3, 6] as const).map(period => {
                const date = getAnalysisDate(period, (cert.analysisDates as Record<string, string | null> | undefined)?.[period === 0 ? "t0" : period === 3 ? "t3" : "t6"]);
                return (
                  <div key={period} className="rounded border border-gray-200 px-3 py-2 bg-gray-50 print:bg-gray-50">
                    <p className="text-[8px] font-bold tracking-normal text-gray-400 mb-0.5">Data da Análise — T{period}</p>
                    <p className="text-[10px] font-semibold text-gray-800">{date || "—"}</p>
                  </div>
                );
              })}
            </div>
          </Section>)}

          {/* 4. Lotes */}
          {lots.length > 0 && ps("s4", (
            <Section num="4" title="Lotes Piloto do Estudo">
              <table className="w-full border-collapse">
                <thead>
                  <tr>
                    <Th>Nº Lote</Th>
                    <Th>Fabricação</Th>
                    <Th>Validade</Th>
                    <Th>Qtd.</Th>
                    <Th>Observações</Th>
                  </tr>
                </thead>
                <tbody>
                  {lots.map((lot, i) => {
                    const validityCell = cert.validityMonths ? `${cert.validityMonths} meses` : "—";
                    return (
                    <tr key={lot.id} className={i % 2 === 0 ? "" : "bg-gray-50/70"}>
                      <Td bold>{lot.lotNumber}</Td>
                      <Td>{fmtDate(lot.manufacturingDate) ?? "—"}</Td>
                      <Td bold>{validityCell}</Td>
                      <Td>{lot.quantity ?? "—"}</Td>
                      <Td className="text-gray-500">{lot.notes ?? "—"}</Td>
                    </tr>
                    );
                  })}
                </tbody>
              </table>
            </Section>
          ))}

          {/* 5. Resultados — síntese por categoria */}
          {ps("s5", <Section num="5" title="Resultados das Análises — Síntese (Médias dos Lotes)">
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
                          const isNC = a.status === "Nao Conforme" || a.status === "reprovado" || a.status === "nao_conforme";
                          return (
                            <tr key={a.parameter} className={isNC ? "bg-red-50 print:bg-red-50" : i % 2 !== 0 ? "bg-gray-50/70" : ""}>
                              <Td bold className={isNC ? "text-red-800" : ""}>{a.parameter}</Td>
                              <Td mono className="text-[8.5px]">{a.specification || "—"}</Td>
                              <Td mono bold className={`${RESULT_COLOR[a.status ?? ""] ?? "text-gray-700"} text-[8.5px]`}>
                                {a.result || "—"}
                              </Td>
                              <Td className="text-gray-500 text-[8px] leading-snug">{resolvedMethod(a.parameter, a.method) || "—"}</Td>
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
          </Section>)}

          {/* 5b. Resultados por lote×período (se houver) */}
          {results.length > 0 && lots.length > 0 && periods.length > 0 && ps("s5b", (
            <Section num="5b" title="Resultados Detalhados por Lote e Período">
              <div className="overflow-x-auto print:overflow-visible">
                <table className="border-collapse section-5b-table" style={{ tableLayout: "auto", minWidth: "100%" }}>
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
                    {sortParams([...new Set(results.map(r => r.parameter))]).map((param, i) => (
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
          ))}

          {/* 6. Cinética */}
          {validKParams.length > 0 && ps("s6", (
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
                        <Td center bold>{estimated != null ? `${Number(estimated).toFixed(2)}` : "—"}</Td>
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
              <div className="flex gap-6 text-[9px] text-gray-600 mb-3">
                {(kineticsData as any)?.limitingParameter && (
                  <p><span className="text-gray-400">Ativo limitante:</span> <span className="font-semibold text-amber-700">★ {(kineticsData as any).limitingParameter}</span></p>
                )}
                {(kineticsData as any)?.estimatedShelfLifeMonths != null && (
                  <p><span className="text-gray-400">Validade calculada:</span> <span className="font-semibold">{Number((kineticsData as any).estimatedShelfLifeMonths).toFixed(2)} meses</span></p>
                )}
                {(kineticsData as any)?.recommendedValidityMonths != null && (
                  <p><span className="text-gray-400">Recomendada:</span> <span className="font-semibold">{(kineticsData as any).recommendedValidityMonths} meses</span></p>
                )}
              </div>
              <div className="rounded border border-green-300 bg-green-50 print:bg-green-50 px-4 py-3 flex items-center justify-between">
                <div>
                  <p className="text-[8px] font-bold uppercase tracking-widest text-green-700 mb-0.5">Validade Praticada — Valor Adotado no Produto</p>
                  <p className="text-[9px] text-green-600">Valor registrado pelo responsável técnico, conforme análise cinética acima.</p>
                </div>
                <div className="text-right ml-6 shrink-0">
                  <span className="text-3xl font-extrabold text-green-800">{cert.validityMonths ?? "—"}</span>
                  <span className="text-sm font-semibold text-green-700 ml-1">meses</span>
                </div>
              </div>
              {cert.kineticsNotes && (
                <p className="text-[9px] text-gray-600 mt-2 border-l-2 border-gray-200 pl-2">{cert.kineticsNotes}</p>
              )}
            </Section>
          ))}

          {/* 7. Metodologias */}
          {cert.analyses.some(a => resolvedMethod(a.parameter, a.method)) && ps("s7", (
            <Section num="7" title="Metodologias Analíticas Utilizadas">
              <table className="w-full border-collapse">
                <thead>
                  <tr>
                    <Th>Parâmetro</Th>
                    <Th>Método Oficial / Referência Normativa</Th>
                  </tr>
                </thead>
                <tbody>
                  {cert.analyses.filter(a => resolvedMethod(a.parameter, a.method)).map((a, i) => (
                    <tr key={a.parameter} className={i % 2 === 0 ? "" : "bg-gray-50/70"}>
                      <Td bold>{a.parameter}</Td>
                      <Td className="text-gray-600 leading-snug">{resolvedMethod(a.parameter, a.method)}</Td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Section>
          ))}

          {/* 8. Conclusão */}
          {cert.conclusion && ps("s8", (
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
          ))}

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
          {signatures.length > 0 && ps("s9", (
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
                      <Td>{s.displayDate ?? new Date(s.signedAt).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit", second: "2-digit" })}</Td>
                      <Td center><span className="text-[8.5px] text-emerald-700 font-semibold">✓ Verificada</span></Td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Section>
          ))}

          {/* 10. Histórico */}
          {ps("s10", (
            <Section num="10" title="Histórico de Rastreabilidade">
              {/* Cabeçalho com datas replicadas do certificado (editáveis) */}
              <div className="flex items-start justify-between mb-3 pb-3 border-b border-gray-200">
                <div>
                  <p className="text-[9px] font-bold uppercase tracking-widest text-gray-400 mb-0.5">Produto / Certificado</p>
                  <p className="text-[10px] font-semibold text-gray-800">{cert.productName}</p>
                  <p className="text-[10px] text-gray-500">{cert.certNumber}</p>
                </div>
                <div className="text-right">
                  <p className="text-[9px] font-bold uppercase tracking-widest text-gray-400 mb-0.5 print:hidden">Data de Emissão</p>
                  <ReportField
                    value={getReportEdit("issueDate", emissionDate)}
                    onChange={v => setReportEdit("issueDate", v)}
                    className="text-[10px] font-semibold text-gray-800"
                  />
                </div>
              </div>
              <AuditTrail protocolId={numId} printMode />
            </Section>
          ))}

          {/* 11. Referências Bibliográficas */}
          {protocolRefs.length > 0 && ps("s11", (
            <Section num="11" title="Referências Bibliográficas">
              <p className="text-[9px] text-gray-500 mb-3">
                Referências técnicas e científicas que fundamentam as metodologias analíticas e os critérios de estabilidade adotados neste protocolo, apresentadas conforme ABNT NBR 6023.
              </p>
              <ol className="space-y-2 text-[10px] text-gray-700">
                {protocolRefs.map((ref, i) => (
                  <li key={ref.id} className="leading-relaxed flex gap-2">
                    <span className="font-semibold text-gray-900 shrink-0">[{i + 1}]</span>
                    <span>{formatAbntRef(ref)}</span>
                  </li>
                ))}
              </ol>
            </Section>
          ))}

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
            {someSigned && (
              <p className={`text-[7.5px] text-center mt-1 font-semibold ${allSigned ? "text-emerald-600" : "text-red-600"}`}>
                {allSigned
                  ? "✓ Documento assinado eletronicamente por todos os responsáveis."
                  : "⚠ Documento com assinatura eletrônica pendente — nem todos os responsáveis assinaram."
                }
              </p>
            )}
            {/* Documento gerado em — mesma lógica do certificado */}
            {(() => {
              const lastSig = [...signatures].sort(
                (a, b) => new Date(b.signedAt).getTime() - new Date(a.signedAt).getTime()
              )[0];
              const lastSigDate = lastSig
                ? (lastSig.displayDate
                    ?? new Date(lastSig.signedAt).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit", second: "2-digit" }))
                : new Date().toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit", second: "2-digit" });
              return (
                <div className="mt-4 pt-3 border-t border-gray-200 text-center text-[9px] text-gray-400 leading-relaxed">
                  <span className="font-medium text-gray-500">Documento gerado em</span>
                  <br />
                  <span>{lastSigDate}</span>
                  <br />
                  <span>— Sistema Protocolo Técnico ANVISA — ALPHAFITUS Laboratório Nutracêutico — CNPJ {cert.cnpj} —</span>
                </div>
              );
            })()}
          </div>
        </div>

        {/* ══ 12. DOCUMENTOS ANEXOS ══════════════════════════════════ */}
        {sortedAttachments.length > 0 && ps("s12", (
          <div className="px-8 pb-6 print:px-0 print:pb-3 mt-4">
            <div className="report-section border border-gray-200 rounded overflow-hidden">
              <div className="report-section-header bg-slate-700 px-4 py-1.5 flex items-center gap-2">
                <Paperclip className="h-3.5 w-3.5 text-slate-300" />
                <h2 className="text-[10px] font-semibold uppercase tracking-wider text-slate-100">12. Documentos Anexos</h2>
                <span className="ml-auto text-[9px] text-slate-400">{sortedAttachments.length} documento(s)</span>
              </div>
              <div className="px-4 py-3 print:px-3 print:py-2 space-y-4">
                {/* Index table */}
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "10px" }}>
                  <thead>
                    <tr style={{ background: "#374151", color: "#fff" }}>
                      <th style={{ padding: "4px 8px", border: "1px solid #374151", textAlign: "center", width: "28px" }}>#</th>
                      <th style={{ padding: "4px 8px", border: "1px solid #374151", textAlign: "left" }}>Nome do Documento</th>
                      <th style={{ padding: "4px 8px", border: "1px solid #374151", textAlign: "left", width: "120px" }}>Descrição</th>
                      <th style={{ padding: "4px 8px", border: "1px solid #374151", textAlign: "left", width: "48px" }}>Tipo</th>
                      <th style={{ padding: "4px 8px", border: "1px solid #374151", textAlign: "left", width: "88px" }}>Responsável</th>
                      <th style={{ padding: "4px 8px", border: "1px solid #374151", textAlign: "left", width: "68px" }}>Data</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sortedAttachments.map((att, i) => {
                      const typeLabel = att.fileType === "application/pdf" ? "PDF"
                        : att.fileType.includes("word") || att.fileType.includes("officedocument") ? "Word"
                        : att.fileType.startsWith("image/") ? "Imagem"
                        : att.fileType;
                      return (
                        <tr key={att.id} style={{ background: i % 2 === 0 ? "#f9fafb" : "#fff" }}>
                          <td style={{ padding: "3px 8px", border: "1px solid #e5e7eb", textAlign: "center", color: "#6b7280" }}>{i + 1}</td>
                          <td style={{ padding: "3px 8px", border: "1px solid #e5e7eb", fontWeight: 600 }}>{att.fileName}</td>
                          <td style={{ padding: "3px 8px", border: "1px solid #e5e7eb", color: "#6b7280" }}>{att.description || "—"}</td>
                          <td style={{ padding: "3px 8px", border: "1px solid #e5e7eb", color: "#6b7280" }}>{typeLabel}</td>
                          <td style={{ padding: "3px 8px", border: "1px solid #e5e7eb", color: "#6b7280" }}>{att.uploadedByName}</td>
                          <td style={{ padding: "3px 8px", border: "1px solid #e5e7eb", color: "#6b7280" }}>{new Date(att.createdAt).toLocaleDateString("pt-BR")}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>

                {/* Inline viewers — screen only */}
                <div className="space-y-4 print:hidden">
                  {sortedAttachments.map((att, i) => {
                    const isImg = att.fileType.startsWith("image/");
                    const isPdf = att.fileType === "application/pdf";
                    const isWord = att.fileType.includes("word") || att.fileType.includes("officedocument");
                    const blobUrl = attachmentBlobUrls[att.id];
                    return (
                      <div key={att.id} className="border border-gray-200 rounded-lg overflow-hidden">
                        <div className="flex items-center gap-2 px-3 py-2 bg-gray-50 border-b border-gray-200">
                          {isImg ? <ImageIcon className="h-4 w-4 text-green-600 shrink-0" /> : isPdf ? <FileText className="h-4 w-4 text-red-500 shrink-0" /> : <File className="h-4 w-4 text-gray-400 shrink-0" />}
                          <span className="text-sm font-semibold text-gray-800">{i + 1}. {att.fileName}</span>
                          {att.description && <span className="text-xs text-gray-500 italic ml-1">— {att.description}</span>}
                          <span className="ml-auto text-xs text-gray-400">{att.uploadedByName} · {new Date(att.createdAt).toLocaleDateString("pt-BR")}</span>
                        </div>
                        {blobUrl && isImg && (
                          <div className="p-3 bg-white flex justify-center">
                            <img src={blobUrl} alt={att.fileName} className="max-w-full max-h-[520px] object-contain border rounded" />
                          </div>
                        )}
                        {blobUrl && isPdf && (
                          <iframe src={blobUrl} title={att.fileName} className="w-full border-0" style={{ height: 680 }} />
                        )}
                        {!blobUrl && (isImg || isPdf) && (
                          <div className="p-4 text-xs text-gray-400 italic bg-white text-center">Carregando visualização…</div>
                        )}
                        {isWord && (
                          <div className="p-3 text-xs text-gray-500 bg-white">
                            Documentos Word não podem ser visualizados inline. Abra-os pela aba <strong>Documentos</strong> do protocolo.
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>

                {/* Print note for PDFs */}
                <div className="hidden print:block mt-2 pt-2 border-t border-gray-200">
                  <p className="text-[8px] text-gray-400 italic">
                    Imagens incorporadas acima. PDFs e documentos Word: disponíveis na aba Documentos do sistema.
                  </p>
                  {/* Inline image previews in print */}
                  {sortedAttachments.filter(a => a.fileType.startsWith("image/") && attachmentBlobUrls[a.id]).map((att, i) => (
                    <div key={att.id} style={{ pageBreakInside: "avoid", marginTop: 12 }}>
                      <p style={{ fontSize: "9px", color: "#6b7280", marginBottom: 4 }}>
                        <strong>{i + 1}.</strong> {att.fileName}{att.description ? ` — ${att.description}` : ""}
                      </p>
                      <img
                        src={attachmentBlobUrls[att.id]}
                        alt={att.fileName}
                        style={{ maxWidth: "100%", maxHeight: "240px", objectFit: "contain", border: "1px solid #e5e7eb", display: "block" }}
                      />
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* ── CSS de Impressão ─────────────────────────────────────────── */}
      <style>{`
        @page {
          size: A4 portrait;
          margin: 12mm 14mm 10mm 14mm;
        }

        @media print {
          /* ── 1. Reset html/body/root ── */
          html, body {
            height: auto !important;
            min-height: 0 !important;
            overflow: visible !important;
            margin: 0 !important;
            padding: 0 !important;
            background: white !important;
          }

          #root {
            height: auto !important;
            min-height: 0 !important;
            overflow: visible !important;
          }

          /* ── 2. Container da página (min-h-screen bg-gray-50) ── */
          #root > div {
            height: auto !important;
            min-height: 0 !important;
            background: white !important;
            padding: 0 !important;
            overflow: visible !important;
          }

          /* ── 3. Esconde toolbar de impressão ── */
          .report-toolbar {
            display: none !important;
          }

          /* ── 4. Documento: remove sombra, border-radius, margens de tela ── */
          #report-document {
            display: block !important;
            position: static !important;
            width: 100% !important;
            max-width: 100% !important;
            margin: 0 !important;
            padding: 0 !important;
            box-shadow: none !important;
            border-radius: 0 !important;
            border: none !important;
            background: white !important;
            font-size: 8pt !important;
            line-height: 1.4 !important;
            overflow: visible !important;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }

          /* ── 5. Cabeçalho e corpo do documento: zeramos padding lateral ── */
          #report-document > div {
            padding-left: 0 !important;
            padding-right: 0 !important;
            overflow: visible !important;
          }

          /* ── 6. Seções: fluxo natural de página (sem gaps por break-inside) ── */
          .report-section {
            break-inside: auto !important;
            page-break-inside: auto !important;
            overflow: visible !important;
            margin-bottom: 7pt !important;
            border: 0.5pt solid rgb(229, 231, 235) !important;
            border-radius: 3pt !important;
          }

          /* Barra de título: nunca fica sozinha no final da página + cor navy no print */
          .report-section-header {
            break-after: avoid !important;
            page-break-after: avoid !important;
            background-color: rgb(51, 65, 85) !important;
            color: rgb(226, 232, 240) !important;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
            padding: 4pt 8pt !important;
          }

          .report-section-header h2 {
            color: rgb(226, 232, 240) !important;
          }

          /* ── 7. Tabelas ── */
          table {
            width: 100% !important;
            table-layout: auto !important;
            border-collapse: collapse !important;
            overflow: visible !important;
          }

          thead {
            display: table-header-group !important;
          }

          tr {
            break-inside: avoid !important;
            page-break-inside: avoid !important;
          }

          td, th {
            overflow: visible !important;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }

          /* ── 8. Remove overflow que corta conteúdo ── */
          .overflow-x-auto,
          .overflow-hidden,
          .overflow-auto {
            overflow: visible !important;
          }

          /* ── 9. Tabela 5b (Resultados por Lote × Período) — cabe na largura A4 ── */
          .section-5b-table {
            width: 100% !important;
            min-width: 0 !important;
            font-size: 6.5pt !important;
            table-layout: fixed !important;
          }

          .section-5b-table th {
            white-space: normal !important;
            word-break: break-word !important;
            overflow-wrap: break-word !important;
            padding: 2px 3px !important;
            font-size: 6.5pt !important;
          }

          .section-5b-table td {
            white-space: normal !important;
            word-break: break-word !important;
            overflow-wrap: break-word !important;
            padding: 2px 3px !important;
            font-size: 6.5pt !important;
          }
        }
      `}</style>
    </div>
  );
}
