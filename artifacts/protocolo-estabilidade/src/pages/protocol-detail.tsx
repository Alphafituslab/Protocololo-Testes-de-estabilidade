import { useParams, Link, useLocation } from "wouter";
import { fmtDate } from "@/lib/utils";
import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { useUnlock } from "@/hooks/use-unlock";
import { useUnsavedChangesGuard } from "@/hooks/use-unsaved-changes-guard";
import { UnlockDialog } from "@/components/unlock-dialog";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  useGetProtocol,
  type GetProtocolQueryResult,
  useListLots,
  useListResults,
  useGetKinetics,
  useCreateLot,
  useUpdateLot,
  useDeleteLot,
  useUpsertResult,
  useDeleteResult,
  useFinalizeProtocol,
  useDeleteProtocol,
  useUpdateProtocol,
  getGetProtocolQueryKey,
  getListLotsQueryKey,
  getListResultsQueryKey,
  getGetKineticsQueryKey,
  getGetCertificateQueryKey,
  getListProtocolsQueryKey,
  getGetProtocolStatsQueryKey,
  useListMethodologies,
  useCreateMethodology,
  useUpdateMethodology,
  useDeleteMethodology,
  getListMethodologiesQueryKey,
  useListAttachments,
  useCreateAttachment,
  useUpdateAttachment,
  useDeleteAttachment,
  getListAttachmentsQueryKey,
  useListSignatures,
  getListSignaturesQueryKey,
  useListBibliographicReferences,
  useCreateBibliographicReference,
  getListBibliographicReferencesQueryKey,
  useListProtocolBibliographicReferences,
  useAddProtocolBibliographicReference,
  useRemoveProtocolBibliographicReference,
  useBulkAddProtocolBibliographicReferences,
  useReorderProtocolBibliographicReferences,
  getListProtocolBibliographicReferencesQueryKey,
  type BibliographicReference,
  type BibliographicReferenceInput,
  useListAtivoReferences,
  useCreateAtivoReference,
  useUpdateAtivoReference,
  useDeleteAtivoReference,
  getListAtivoReferencesQueryKey,
  type AtivoReference,
} from "@workspace/api-client-react";
import { useQueryClient, useQuery } from "@tanstack/react-query";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Separator } from "@/components/ui/separator";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ArrowLeft, Plus, Pencil, Trash2, FileText, CheckCircle2, XCircle, Loader2, FlaskConical, BarChart3, Award, Lock, Unlock, BookOpen, History, Paperclip, ExternalLink, Upload, Download, X, File, GripVertical, Search, SaveAll, RotateCcw, ShieldAlert, Eye, EyeOff, Bell, ShieldCheck, PenLine, Building2, Database, ChevronDown, ChevronRight, Save } from "lucide-react";
import { AuditTrail } from "@/components/audit-trail";
import { useToast } from "@/hooks/use-toast";
import { useLabelOverrides } from "@/hooks/use-label-overrides";
import { useAuth } from "@/contexts/use-auth";


const STATUS_LABELS: Record<string, string> = {
  rascunho: "Rascunho",
  em_andamento: "Em Andamento",
  concluido: "Concluído",
  aprovado: "Aprovado",
  reprovado: "Reprovado",
  aprovado_com_ressalva: "Aprovado c/ Ressalva",
};

const STATUS_COLORS: Record<string, string> = {
  rascunho: "bg-slate-100 text-slate-700 border-slate-200",
  em_andamento: "bg-blue-100 text-blue-700 border-blue-200",
  concluido: "bg-purple-100 text-purple-700 border-purple-200",
  aprovado: "bg-green-100 text-green-700 border-green-200",
  reprovado: "bg-red-100 text-red-700 border-red-200",
  aprovado_com_ressalva: "bg-amber-100 text-amber-700 border-amber-200",
};

const RESULT_STATUS_COLORS: Record<string, string> = {
  conforme: "text-green-700 bg-green-50 border-green-200",
  nao_conforme: "text-red-700 bg-red-50 border-red-200",
  na: "text-slate-500 bg-slate-50 border-slate-200",
  aprovado_com_ressalva: "text-amber-700 bg-amber-50 border-amber-200",
};

const ANALYSIS_PARAMETERS = [
  { parameter: "pH", category: "fisico_quimica", criterion: "8,90 – 9,40" },
  { parameter: "Perda por dessecação", category: "fisico_quimica", criterion: "≤ 5%" },
  { parameter: "Cor", category: "fisico_quimica", criterion: "Branco" },
  { parameter: "Odor", category: "fisico_quimica", criterion: "Característico" },
  { parameter: "Aparência", category: "fisico_quimica", criterion: "Homogênea" },
  { parameter: "Cinzas totais", category: "fisico_quimica", criterion: "≤ 50%" },
  { parameter: "Dissolução", category: "fisico_quimica", criterion: "Q ≥ 80% em 30 min" },
  { parameter: "Massa média", category: "fisico_quimica", criterion: "± 7,5%" },
  { parameter: "Kcal", category: "fisico_quimica", criterion: "≤ 4 kcal declara 0" },
  { parameter: "Sódio", category: "fisico_quimica", criterion: "≤ 5 mg declara 0" },
  { parameter: "Salmonella spp. em 10 g", category: "microbiologica", criterion: "Ausente em 10 g" },
  { parameter: "Bolores e leveduras", category: "microbiologica", criterion: "≤ 10² UFC/g" },
  { parameter: "Escherichia coli", category: "microbiologica", criterion: "Ausente em 1 g" },
  { parameter: "Contagem de Micro-organismos Aeróbios Mesófilos", category: "microbiologica", criterion: "≤ 10³ UFC/g" },
  { parameter: "Cálcio", category: "teor_ativo", criterion: "98,50% - 100,50%" },
  { parameter: "Vitamina D", category: "teor_ativo", criterion: "97,00% - 103,00%" },
  { parameter: "Torque de tampa", category: "embalagem", criterion: "2 unidades a cada 100" },
  { parameter: "Selagem por indução", category: "embalagem", criterion: "2 unidades a cada 100" },
  { parameter: "Integridade selagem", category: "embalagem", criterion: "2 unidades a cada 100" },
  { parameter: "Headspace", category: "embalagem", criterion: "15% - 20%" },
];

// ── Parâmetros microbiológicos padrão por forma farmacêutica ─────────────────
const MICRO_PARAMS_CAPSULA = [
  { parameter: "Salmonella spp. em 10 g", category: "microbiologica", criterion: "Ausente em 10 g" },
  { parameter: "Bolores e leveduras", category: "microbiologica", criterion: "≤ 10² UFC/g" },
  { parameter: "Escherichia coli", category: "microbiologica", criterion: "Ausente em 1 g" },
  { parameter: "Contagem de Micro-organismos Aeróbios Mesófilos", category: "microbiologica", criterion: "≤ 10³ UFC/g" },
] as const;

const MICRO_PARAMS_PO = [
  { parameter: "Salmonella spp. em 25 g", category: "microbiologica", criterion: "Ausente em 25 g" },
  { parameter: "Bolores e leveduras", category: "microbiologica", criterion: "≤ 10³ UFC/g" },
  { parameter: "Escherichia coli", category: "microbiologica", criterion: "Ausente em 1 g" },
  { parameter: "Enterobacteriaceae", category: "microbiologica", criterion: "≤ 10² UFC/g" },
  { parameter: "Estafilococos coagulase positiva por g", category: "microbiologica", criterion: "≤ 10² UFC/g" },
] as const;

/** Retorna a lista de parâmetros padrão combinando params fixos + micro correto pela forma farmacêutica. */
function getDefaultParams(isPowder: boolean): Array<{ parameter: string; category: string; criterion: string; uid: string }> {
  const micro = isPowder ? [...MICRO_PARAMS_PO] : [...MICRO_PARAMS_CAPSULA];
  const all = [
    ...ANALYSIS_PARAMETERS.filter(p => p.category === "fisico_quimica"),
    ...micro,
    ...ANALYSIS_PARAMETERS.filter(p => p.category === "teor_ativo"),
    ...ANALYSIS_PARAMETERS.filter(p => p.category === "embalagem"),
  ];
  return all.map((p, i) => ({ ...p, uid: `${p.category}_${i}` }));
}

const PERIODS = [0, 3, 6];

const lotSchema = z.object({
  lotNumber: z.string().min(1, "Número do lote obrigatório"),
  manufacturingDate: z.string().min(1, "Data obrigatória"),
  expiryDate: z.string().optional(),
  quantity: z.coerce.number().min(1),
  notes: z.string().optional(),
  studyCondition: z.preprocess(
    (v) => (v === "" ? undefined : v),
    z.enum(["longa_duracao", "acelerado"]).optional(),
  ),
  temperatureC: z.preprocess(
    (v) => (v === "" || v === null || v === undefined ? null : Number(v)),
    z.number().nullable().optional(),
  ),
  humidityRh: z.preprocess(
    (v) => (v === "" || v === null || v === undefined ? null : Number(v)),
    z.number().nullable().optional(),
  ),
});

const finalizeSchema = z.object({
  finalStatus: z.enum(["aprovado", "reprovado", "aprovado_com_ressalva", "em_andamento"]),
  conclusion: z.string().optional(),
  validityMonths: z.coerce.number().optional(),
  issueDate: z.string().optional(),
  ressalva: z.string().optional(),
  progressPercent: z.coerce.number().min(0).max(100).optional(),
}).superRefine((data, ctx) => {
  if (data.finalStatus !== "em_andamento" && (!data.conclusion || data.conclusion.trim().length < 1)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Conclusão obrigatória",
      path: ["conclusion"],
    });
  }
  if (data.finalStatus === "aprovado_com_ressalva" && (!data.ressalva || data.ressalva.trim().length < 10)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Obrigatório descrever a ressalva (mínimo 10 caracteres) para aprovar com ressalva.",
      path: ["ressalva"],
    });
  }
});

function InfoField({ label, value }: { label: string; value?: string | null }) {
  if (!value) return null;
  return (
    <div className="border-b border-border pb-2">
      <dt className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{label}</dt>
      <dd className="mt-0.5 text-sm font-medium">{value}</dd>
    </div>
  );
}

function EditableInfoField({ label, value, onChange, onBlur, placeholder }: { label: string; value: string; onChange: (v: string) => void; onBlur?: () => void; placeholder?: string }) {
  return (
    <div className="border-b border-border pb-2">
      <dt className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1">{label}</dt>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onBlur={onBlur}
        placeholder={placeholder}
        className="w-full text-sm font-medium bg-transparent border-0 border-b border-dashed border-primary/40 focus:outline-none focus:border-primary py-0.5 placeholder:text-muted-foreground/40"
      />
    </div>
  );
}

function InfoFieldEL({ labelKey, def, value, lbl, setLabel }: {
  labelKey: string;
  def: string;
  value?: string | null;
  lbl: (key: string, def: string) => string;
  setLabel: (key: string, value: string) => void;
}) {
  const current = lbl(labelKey, def);
  return (
    <div className="border-b border-border pb-2">
      <input
        value={current}
        onChange={e => setLabel(labelKey, e.target.value)}
        title="Clique para editar o rótulo deste campo"
        className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground bg-transparent border-0 border-b border-dashed border-transparent hover:border-primary/40 focus:outline-none focus:border-primary/60 w-full cursor-text"
      />
      <dd className="mt-0.5 text-sm font-medium text-foreground">
        {value || <span className="text-muted-foreground/50 text-xs italic">não preenchido</span>}
      </dd>
    </div>
  );
}

function ProtocolInfoTab({ protocol }: { protocol: GetProtocolQueryResult }) {
  const { hasPermission } = useAuth();
  const { lbl, setLabel } = useLabelOverrides();
  const queryClient = useQueryClient();
  const updateProtocol = useUpdateProtocol();
  const { toast } = useToast();

  const [issueDateLocal, setIssueDateLocal] = useState(protocol.issueDate ?? "");
  const [isDirty, setIsDirty] = useState(false);
  const [savedAt, setSavedAt] = useState<Date | null>(null);
  useUnsavedChangesGuard(isDirty);

  // Environmental conditions — now persisted in the database.
  // We clean up the old localStorage key on mount so stale values are gone.
  const [samplingTemp, setSamplingTempRaw] = useState(protocol.samplingTemp ?? "22,8°C");
  const [samplingHumidity, setSamplingHumidityRaw] = useState(protocol.samplingHumidity ?? "60% UR");
  const [receptionTemp, setReceptionTempRaw] = useState(protocol.receptionTemp ?? "22,8°C");
  const [receptionHumidity, setReceptionHumidityRaw] = useState(protocol.receptionHumidity ?? "60% UR");

  useEffect(() => {
    try { localStorage.removeItem(`cert_env_${protocol.id}`); } catch { /* ignore */ }
  }, [protocol.id]);

  const markDirty = () => setIsDirty(true);

  const saveField = useCallback((field: string, value: string) => {
    updateProtocol.mutate(
      { id: protocol.id, data: { [field]: value } },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getGetProtocolQueryKey(protocol.id) });
          queryClient.invalidateQueries({ queryKey: getGetCertificateQueryKey(protocol.id) });
        },
      }
    );
  }, [protocol.id, updateProtocol, queryClient]);

  const saveAll = useCallback(() => {
    const data: Record<string, string> = {
      samplingTemp,
      samplingHumidity,
      receptionTemp,
      receptionHumidity,
      ...(issueDateLocal ? { issueDate: issueDateLocal } : {}),
    };
    updateProtocol.mutate(
      { id: protocol.id, data },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getGetProtocolQueryKey(protocol.id) });
          queryClient.invalidateQueries({ queryKey: getGetCertificateQueryKey(protocol.id) });
          setIsDirty(false);
          setSavedAt(new Date());
          toast({ title: "Salvo com sucesso", description: "Informações do protocolo atualizadas.", duration: 2500 });
        },
        onError: () => {
          toast({ title: "Erro ao salvar", description: "Tente novamente.", variant: "destructive", duration: 3000 });
        },
      }
    );
  }, [protocol.id, samplingTemp, samplingHumidity, receptionTemp, receptionHumidity, issueDateLocal, updateProtocol, queryClient, toast]);

  const fieldsTop: { labelKey: string; def: string; value?: string | null }[] = [
    { labelKey: "certNumber", def: "Número do Certificado de Análise", value: protocol.certNumber },
    { labelKey: "companyName", def: "Nome da Empresa", value: protocol.companyName },
    { labelKey: "cnpj", def: "CNPJ", value: protocol.cnpj },
    { labelKey: "ie", def: "IE", value: protocol.ie },
    { labelKey: "address", def: "Endereço", value: protocol.address },
    { labelKey: "cep", def: "CEP", value: protocol.cep },
    { labelKey: "productName", def: "Nome do Produto", value: protocol.productName },
    { labelKey: "productType", def: "Tipo de Produto", value: protocol.productType },
    { labelKey: "packagingType", def: "Tipo de Pote", value: protocol.packagingType },
    { labelKey: "activeIngredients", def: "Ingredientes Ativos", value: protocol.activeIngredients },
    { labelKey: "excipients", def: "Excipientes", value: protocol.excipients },
    { labelKey: "capsuleComposition", def: "Composição da Cápsula", value: protocol.capsuleComposition },
  ];

  const fieldsBottom: { labelKey: string; def: string; value?: string | null }[] = [
    { labelKey: "studyStartDate", def: "Data de Início", value: fmtDate(protocol.studyStartDate) as string | null | undefined },
    { labelKey: "studyEndDate", def: "Data Final", value: fmtDate(protocol.studyEndDate) as string | null | undefined },
    { labelKey: "storageTemp", def: "Temperatura de Armazenamento", value: protocol.storageTemp },
    { labelKey: "storageHumidity", def: "Umidade Relativa", value: protocol.storageHumidity },
    { labelKey: "studyPeriodMonths", def: "Período do Estudo (meses)", value: protocol.studyPeriodMonths?.toString() },
    { labelKey: "testIntervals", def: "Intervalos de Teste", value: protocol.testIntervals },
    { labelKey: "elaboratedBy", def: "Elaboração", value: protocol.elaboratedBy },
    { labelKey: "approvedBy", def: "Aprovação", value: protocol.approvedBy },
    { labelKey: "issuedBy", def: "Laudo emitido por", value: protocol.issuedBy },
    { labelKey: "seniorAnalyst", def: "Analista Sênior", value: protocol.seniorAnalyst },
  ];

  return (
    <div className="space-y-6">
      {hasPermission("protocols:edit") && (
        <div className="flex justify-end">
          <Link href={`/protocols/${protocol.id}/edit`}>
            <Button variant="outline" size="sm">
              <Pencil className="h-3.5 w-3.5 mr-1.5" /> Editar Informações
            </Button>
          </Link>
        </div>
      )}

      <div className="grid grid-cols-2 gap-x-8 gap-y-3">
        {fieldsTop.map(f => <InfoFieldEL key={f.labelKey} {...f} lbl={lbl} setLabel={setLabel} />)}
      </div>

      <div className="rounded-md border border-amber-200 bg-amber-50/60 p-4 space-y-4">
        <p className="text-xs font-semibold uppercase tracking-wide text-amber-800">Condições Ambientais e de Recebimento</p>
        <div className="grid grid-cols-2 gap-x-8 gap-y-3">
          <EditableInfoField
            label="Condições ambientais durante amostragem — Temperatura"
            value={samplingTemp}
            onChange={v => { setSamplingTempRaw(v); markDirty(); }}
            onBlur={() => saveField("samplingTemp", samplingTemp)}
            placeholder="ex: 22,8°C"
          />
          <EditableInfoField
            label="Condições ambientais durante amostragem — Umidade"
            value={samplingHumidity}
            onChange={v => { setSamplingHumidityRaw(v); markDirty(); }}
            onBlur={() => saveField("samplingHumidity", samplingHumidity)}
            placeholder="ex: 60% UR"
          />
          <EditableInfoField
            label="Condições de recebimento da amostra — Temperatura"
            value={receptionTemp}
            onChange={v => { setReceptionTempRaw(v); markDirty(); }}
            onBlur={() => saveField("receptionTemp", receptionTemp)}
            placeholder="ex: 22,8°C"
          />
          <EditableInfoField
            label="Condições de recebimento da amostra — Umidade"
            value={receptionHumidity}
            onChange={v => { setReceptionHumidityRaw(v); markDirty(); }}
            onBlur={() => saveField("receptionHumidity", receptionHumidity)}
            placeholder="ex: 60% UR"
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-x-8 gap-y-3">
        {fieldsBottom.map(f => <InfoFieldEL key={f.labelKey} {...f} lbl={lbl} setLabel={setLabel} />)}
      </div>

      {/* Data de Emissão — editável retroativamente */}
      <div className="rounded-md border border-primary/20 bg-primary/5 p-4">
        <p className="text-xs font-semibold uppercase tracking-wide text-primary/80 mb-3">
          Data de Emissão do Laudo
        </p>
        <div className="flex flex-wrap items-end gap-4">
          <div className="flex flex-col gap-1">
            <label className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
              Data de emissão
            </label>
            <input
              type="date"
              value={issueDateLocal}
              onChange={e => { setIssueDateLocal(e.target.value); markDirty(); }}
              onBlur={() => { if (issueDateLocal) saveField("issueDate", issueDateLocal); }}
              className="text-sm font-medium bg-white border border-primary/30 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-primary/50 focus:border-primary/60"
            />
          </div>
          <p className="text-[10px] text-muted-foreground leading-snug max-w-xs pb-1">
            Usada no Certificado de Análise e no Relatório ANVISA.
            Pode ser retroativa.
          </p>
        </div>
      </div>

      {/* Botão Salvar — visível sempre, destaque quando há alterações pendentes */}
      <div className="flex items-center justify-between rounded-md border border-dashed border-primary/30 bg-primary/5 px-4 py-3">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          {updateProtocol.isPending && (
            <span className="flex items-center gap-1.5 text-primary">
              <svg className="animate-spin h-3.5 w-3.5" viewBox="0 0 24 24" fill="none"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/></svg>
              Salvando…
            </span>
          )}
          {!updateProtocol.isPending && savedAt && !isDirty && (
            <span className="flex items-center gap-1 text-green-700">
              <svg className="h-3.5 w-3.5" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd"/></svg>
              Salvo às {savedAt.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
            </span>
          )}
          {!updateProtocol.isPending && isDirty && (
            <span className="text-amber-700 font-medium">● Alterações não salvas</span>
          )}
          {!updateProtocol.isPending && !isDirty && !savedAt && (
            <span>Salvo automaticamente a cada campo</span>
          )}
        </div>
        <Button
          onClick={saveAll}
          disabled={updateProtocol.isPending}
          size="sm"
          className={isDirty ? "bg-primary text-white hover:bg-primary/90" : ""}
          variant={isDirty ? "default" : "outline"}
        >
          {updateProtocol.isPending ? "Salvando…" : "Salvar"}
        </Button>
      </div>
    </div>
  );
}

function LotsTab({ protocolId }: { protocolId: number }) {
  const { hasPermission } = useAuth();
  const canManageLots = hasPermission("lots:manage");
  const { data: lots = [], isLoading } = useListLots(protocolId, {
    query: { queryKey: getListLotsQueryKey(protocolId) },
  });
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [editLot, setEditLot] = useState<typeof lots[number] | null>(null);
  const [lastAdded, setLastAdded] = useState<string | null>(null);

  const form = useForm<z.infer<typeof lotSchema>>({
    resolver: zodResolver(lotSchema),
    defaultValues: { lotNumber: "", manufacturingDate: "", expiryDate: "", quantity: 20, notes: "", studyCondition: undefined, temperatureC: null, humidityRh: null },
  });

  const createLot = useCreateLot({
    mutation: {
      onSuccess: () => {
        const justAdded = form.getValues().lotNumber;
        // Defer ONLY form reset / focus to next tick (avoids concurrent portal
        // DOM operations during React's commit phase). The lots query is NOT
        // invalidated here — doing so while the Dialog is mounted triggers a
        // LotsTab re-render that can cause the error boundary to reset open=false
        // and close the dialog. The query is invalidated in onOpenChange instead.
        setTimeout(() => {
          setLastAdded(justAdded);
          form.reset({ lotNumber: "", manufacturingDate: "", expiryDate: "", quantity: 20, notes: "", studyCondition: undefined, temperatureC: null, humidityRh: null });
          form.setFocus("lotNumber");
        }, 0);
      },
    },
  });

  const updateLot = useUpdateLot({
    mutation: {
      onSuccess: () => {
        setOpen(false);
        setEditLot(null);
        form.reset();
        toast({ title: "Lote atualizado" });
        setTimeout(() => {
          queryClient.invalidateQueries({ queryKey: getListLotsQueryKey(protocolId) });
          queryClient.invalidateQueries({ queryKey: getGetKineticsQueryKey(protocolId) });
        }, 0);
      },
    },
  });

  const deleteLot = useDeleteLot({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListLotsQueryKey(protocolId) });
        queryClient.invalidateQueries({ queryKey: getListResultsQueryKey(protocolId) });
        queryClient.invalidateQueries({ queryKey: getGetKineticsQueryKey(protocolId) });
        toast({ title: "Lote removido" });
      },
    },
  });

  const onSubmit = (values: z.infer<typeof lotSchema>) => {
    if (editLot) {
      updateLot.mutate({ id: protocolId, lotId: editLot.id, data: values });
    } else {
      createLot.mutate({ id: protocolId, data: values });
    }
  };

  const openEdit = (lot: typeof lots[number]) => {
    setEditLot(lot);
    form.reset({
      lotNumber: lot.lotNumber,
      manufacturingDate: lot.manufacturingDate,
      expiryDate: lot.expiryDate ?? "",
      quantity: lot.quantity,
      notes: lot.notes ?? "",
      studyCondition: (lot.studyCondition as "longa_duracao" | "acelerado" | undefined) ?? undefined,
      temperatureC: lot.temperatureC ?? null,
      humidityRh: lot.humidityRh ?? null,
    });
    setOpen(true);
  };

  const openNew = () => {
    setEditLot(null);
    setLastAdded(null);
    form.reset({ lotNumber: "", manufacturingDate: "", expiryDate: "", quantity: 20, notes: "", studyCondition: undefined, temperatureC: null, humidityRh: null });
    setOpen(true);
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <p className="text-sm text-muted-foreground">Lotes piloto incluídos neste estudo</p>
        {canManageLots && (
          <Button size="sm" onClick={openNew} data-testid="button-add-lot">
            <Plus className="h-4 w-4 mr-1" /> Adicionar Lote
          </Button>
        )}
      </div>

      {isLoading ? (
        <div className="text-center py-8 text-muted-foreground">Carregando...</div>
      ) : lots.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground border rounded-md">
          Nenhum lote cadastrado. Adicione um lote para começar.
        </div>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Número do Lote</TableHead>
              <TableHead>Fabricação</TableHead>
              <TableHead>Validade</TableHead>
              <TableHead>Qtd.</TableHead>
              <TableHead>Condição</TableHead>
              <TableHead>Notas</TableHead>
              <TableHead className="w-20"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {lots.map((lot) => (
              <TableRow key={lot.id} data-testid={`row-lot-${lot.id}`}>
                <TableCell className="font-mono font-medium">{lot.lotNumber}</TableCell>
                <TableCell>{fmtDate(lot.manufacturingDate)}</TableCell>
                <TableCell>{lot.expiryDate ? fmtDate(lot.expiryDate) : "—"}</TableCell>
                <TableCell>{lot.quantity} un.</TableCell>
                <TableCell className="text-sm">
                  {lot.studyCondition ? (
                    <div className="space-y-0.5">
                      <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold ${lot.studyCondition === "longa_duracao" ? "bg-blue-100 text-blue-700" : "bg-orange-100 text-orange-700"}`}>
                        {lot.studyCondition === "longa_duracao" ? "Longa Duração" : "Acelerado"}
                      </span>
                      {(lot.temperatureC != null || lot.humidityRh != null) && (
                        <div className="text-[10px] text-muted-foreground">
                          {lot.temperatureC != null && `${lot.temperatureC}°C ± 2°C`}
                          {lot.temperatureC != null && lot.humidityRh != null && " / "}
                          {lot.humidityRh != null && `${lot.humidityRh}%UR ± 5%`}
                        </div>
                      )}
                    </div>
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  )}
                </TableCell>
                <TableCell className="text-muted-foreground text-sm">{lot.notes ?? "—"}</TableCell>
                <TableCell>
                  {canManageLots && (
                    <div className="flex gap-1">
                      <Button variant="ghost" size="icon" onClick={() => openEdit(lot)} data-testid={`button-edit-lot-${lot.id}`}>
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button variant="ghost" size="icon" data-testid={`button-delete-lot-${lot.id}`}>
                            <Trash2 className="h-3.5 w-3.5 text-destructive" />
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Remover lote?</AlertDialogTitle>
                            <AlertDialogDescription>Isso também removerá todos os resultados associados a este lote.</AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Cancelar</AlertDialogCancel>
                            <AlertDialogAction onClick={() => deleteLot.mutate({ id: protocolId, lotId: lot.id })}>Remover</AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </div>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      <div className="mt-4 rounded-md border border-blue-100 bg-blue-50 p-4 text-xs text-blue-800 leading-relaxed space-y-2">
        <p>
          Os lotes piloto foram produzidos em datas distintas, sob condições equivalentes de fabricação, visando assegurar a independência entre os lotes, a rastreabilidade do estudo e a minimização do risco de desvios operacionais ou interferências de processo.
        </p>
        <p>
          Alimento está sendo testado em embalagem equivalente e sistema de fechamento nos quais será comercializado.
        </p>
      </div>

      <Dialog open={open} onOpenChange={(next) => {
        setOpen(next);
        if (!next) {
          // Invalidate queries only when the dialog closes — never while it
          // is open. Invalidating with a mounted Dialog portal can trigger a
          // LotsTab re-render that causes the error boundary to reset open=false.
          queryClient.invalidateQueries({ queryKey: getGetProtocolQueryKey(protocolId) });
          queryClient.invalidateQueries({ queryKey: getListLotsQueryKey(protocolId) });
          queryClient.invalidateQueries({ queryKey: getGetKineticsQueryKey(protocolId) });
          setLastAdded(null);
        }
      }}>
        <DialogContent
          className="max-w-lg flex flex-col max-h-[90vh] p-0 gap-0"
          onInteractOutside={e => { if (!editLot) e.preventDefault(); }}
          onEscapeKeyDown={e => { if (!editLot) e.preventDefault(); }}
        >
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="flex flex-col flex-1 min-h-0">
            {/* ── Scrollable area ── */}
            <div className="overflow-y-auto flex-1 px-6 pt-6 pb-4 space-y-4">
              <DialogHeader>
                <DialogTitle>{editLot ? "Editar Lote" : "Adicionar Lotes"}</DialogTitle>
                {!editLot && (
                  <div className="mt-1.5 rounded-md bg-blue-50 border border-blue-200 px-3 py-2 text-xs text-blue-800 flex items-start gap-2">
                    <Plus className="h-3.5 w-3.5 shrink-0 mt-0.5 text-blue-600" />
                    <span>
                      Preencha os campos e clique em <strong>Adicionar +</strong> para cada lote.
                      A tela <strong>permanece aberta</strong> — clique em <strong>Fechar</strong> apenas quando terminar de incluir todos os lotes.
                    </span>
                  </div>
                )}
              </DialogHeader>

              {/* Success feedback — shown right after a lot is added */}
              {!editLot && lastAdded && (
                <div className="flex items-center gap-2 rounded-md bg-green-50 border border-green-200 px-3 py-2 text-xs text-green-700">
                  <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-green-600" />
                  <span>Lote <strong className="font-mono">{lastAdded}</strong> cadastrado. Preencha os campos abaixo para adicionar o próximo.</span>
                </div>
              )}

              {/* Already-added lots list (visible only when creating, not editing) */}
              {!editLot && lots.length > 0 && (
                <div className="rounded-md border bg-muted/30 px-3 py-2 space-y-1 max-h-32 overflow-y-auto">
                  <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide mb-1">
                    Lotes cadastrados ({lots.length})
                  </p>
                  {lots.map((lot) => (
                    <div key={lot.id} className="flex items-center justify-between text-xs">
                      <span className={`font-mono font-medium ${lot.lotNumber === lastAdded ? "text-green-700" : "text-foreground"}`}>
                        {lot.lotNumber === lastAdded && "✓ "}{lot.lotNumber}
                      </span>
                      <span className="text-muted-foreground">{fmtDate(lot.manufacturingDate)} · {lot.quantity} un.</span>
                    </div>
                  ))}
                </div>
              )}
              <FormField control={form.control} name="lotNumber" render={({ field }) => (
                <FormItem>
                  <FormLabel>Número do Lote</FormLabel>
                  <FormControl><Input data-testid="input-lotNumber" placeholder="LP-20241210-639" {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              <div className="grid grid-cols-2 gap-4">
                <FormField control={form.control} name="manufacturingDate" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Data de Fabricação</FormLabel>
                    <FormControl><Input type="date" data-testid="input-manufacturingDate" {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={form.control} name="expiryDate" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Validade do Lote</FormLabel>
                    <FormControl><Input type="date" data-testid="input-expiryDate" {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
              </div>
              <FormField control={form.control} name="quantity" render={({ field }) => (
                <FormItem>
                  <FormLabel>Quantidade (potes/unidades)</FormLabel>
                  <FormControl><Input type="number" data-testid="input-quantity" {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={form.control} name="notes" render={({ field }) => (
                <FormItem>
                  <FormLabel>Notas</FormLabel>
                  <FormControl><Input data-testid="input-notes" {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />

              {/* Condições do estudo de estabilidade */}
              <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-3 space-y-3">
                <p className="text-xs font-semibold text-slate-600 uppercase tracking-wide">Condição do Estudo (opcional)</p>
                <FormField control={form.control} name="studyCondition" render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-xs">Tipo de estudo</FormLabel>
                    <FormControl>
                      <select
                        data-testid="input-studyCondition"
                        value={field.value ?? ""}
                        onChange={(e) => {
                          const val = e.target.value;
                          field.onChange(val === "" ? undefined : val);
                          if (val === "longa_duracao") {
                            form.setValue("temperatureC", 25);
                            form.setValue("humidityRh", 60);
                          } else if (val === "acelerado") {
                            form.setValue("temperatureC", 40);
                            form.setValue("humidityRh", 75);
                          }
                        }}
                        className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
                      >
                        <option value="">Não especificado</option>
                        <option value="longa_duracao">Longa Duração — 25 °C / 60 %UR</option>
                        <option value="acelerado">Acelerado — 40 °C / 75 %UR</option>
                      </select>
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
                <div className="grid grid-cols-2 gap-3">
                  <FormField control={form.control} name="temperatureC" render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-xs">Temperatura (°C)</FormLabel>
                      <FormControl>
                        <Input
                          type="number"
                          step="0.1"
                          data-testid="input-temperatureC"
                          placeholder="ex: 25.0"
                          value={field.value ?? ""}
                          onChange={(e) => field.onChange(e.target.value)}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />
                  <FormField control={form.control} name="humidityRh" render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-xs">Umidade (%UR)</FormLabel>
                      <FormControl>
                        <Input
                          type="number"
                          step="0.1"
                          data-testid="input-humidityRh"
                          placeholder="ex: 60.0"
                          value={field.value ?? ""}
                          onChange={(e) => field.onChange(e.target.value)}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />
                </div>
                <p className="text-[10px] text-slate-500">Preencha para habilitar o cálculo de Arrhenius na aba Cinética quando houver lotes nas duas condições.</p>
              </div>
            </div>{/* end scrollable area */}

            {/* ── Sticky footer — always visible ── */}
            <div className="shrink-0 border-t border-border px-6 py-4 flex justify-between gap-2 bg-background">
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                {editLot ? "Cancelar" : "Fechar"}
              </Button>
              <Button type="submit" disabled={createLot.isPending || updateLot.isPending}>
                {(createLot.isPending || updateLot.isPending) && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                {editLot ? "Salvar" : "Adicionar +"}
              </Button>
            </div>
            </form>
          </Form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

type ActiveCell = { lotId: number; period: number; parameter: string; category: string; criterion: string };

function CellImages({ storageKey }: { storageKey: string }) {
  const [images, setImages] = useState<string[]>(() => {
    try { return JSON.parse(localStorage.getItem(storageKey) ?? "[]"); } catch { return []; }
  });
  const [open, setOpen] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const addImage = (file: File) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const src = e.target?.result as string;
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement("canvas");
        const max = 600;
        const ratio = Math.min(max / img.width, max / img.height, 1);
        canvas.width = img.width * ratio;
        canvas.height = img.height * ratio;
        canvas.getContext("2d")!.drawImage(img, 0, 0, canvas.width, canvas.height);
        const compressed = canvas.toDataURL("image/jpeg", 0.75);
        const next = [...images, compressed];
        setImages(next);
        try { localStorage.setItem(storageKey, JSON.stringify(next)); } catch {}
      };
      img.src = src;
    };
    reader.readAsDataURL(file);
  };

  const removeImage = (i: number) => {
    const next = images.filter((_, idx) => idx !== i);
    setImages(next);
    try { localStorage.setItem(storageKey, JSON.stringify(next)); } catch {}
  };

  return (
    <div className="relative" onClick={(e) => e.stopPropagation()}>
      <input
        type="file"
        accept="image/*"
        ref={fileRef}
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) addImage(f);
          e.target.value = "";
        }}
      />
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={`text-[9px] flex items-center gap-0.5 px-1 py-0.5 rounded transition-colors ${images.length > 0 ? "text-blue-600 hover:bg-blue-50" : "text-muted-foreground/20 hover:text-muted-foreground/50"}`}
        title={images.length > 0 ? `${images.length} imagem(ns) anexada(s)` : "Anexar imagem"}
      >
        📎{images.length > 0 && <span className="font-semibold ml-0.5">{images.length}</span>}
      </button>
      {open && (
        <div className="absolute bottom-full left-0 z-50 bg-white border border-gray-200 rounded-lg shadow-xl p-3 min-w-56">
          {images.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mb-2">
              {images.map((img, i) => (
                <div key={i} className="relative group">
                  <img src={img} alt="" className="w-16 h-16 object-cover rounded border cursor-pointer" onClick={() => window.open(img)} />
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); e.preventDefault(); removeImage(i); }}
                    className="absolute -top-1.5 -right-1.5 bg-red-500 hover:bg-red-600 text-white rounded-full w-5 h-5 text-xs flex items-center justify-center leading-none shadow-md z-10 border border-white"
                    title="Remover imagem"
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
          )}
          {images.length === 0 && <p className="text-xs text-muted-foreground mb-2">Nenhuma imagem ainda.</p>}
          <button
            type="button"
            onClick={() => { fileRef.current?.click(); setOpen(false); }}
            className="text-xs text-primary hover:underline flex items-center gap-1"
          >
            + Anexar imagem
          </button>
        </div>
      )}
    </div>
  );
}

function InlineCell({
  lotId, period, param, result, protocolId, lots, periodDate,
  editUnlocked, onUnlock, onSaved,
}: {
  lotId: number;
  period: number;
  param: { parameter: string; category: string; criterion: string };
  result: { id?: number; result: string; status: string; observation?: string | null } | undefined;
  protocolId: number;
  lots: { id: number; lotNumber: string }[];
  periodDate?: string;
  editUnlocked: boolean;
  onUnlock: () => void;
  onSaved: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(result?.result ?? "");
  const [status, setStatus] = useState<"conforme" | "nao_conforme" | "na" | "aprovado_com_ressalva" | "nd" | "lq">(
    (result?.status as "conforme" | "nao_conforme" | "na" | "aprovado_com_ressalva" | "nd" | "lq") ?? "conforme"
  );
  const [observation, setObservation] = useState(result?.observation ?? "");
  const queryClient = useQueryClient();
  const [delConfirm, setDelConfirm] = useState(false);
  const deleteResult = useDeleteResult({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListResultsQueryKey(protocolId) });
        queryClient.invalidateQueries({ queryKey: getGetKineticsQueryKey(protocolId) });
        queryClient.invalidateQueries({ queryKey: getGetProtocolQueryKey(protocolId) });
        setEditing(false);
        setDelConfirm(false);
      },
    },
  });

  // Pede senha antes de reeditar resultado já salvo
  const [pwdOpen, setPwdOpen] = useState(false);
  const [pwdLoading, setPwdLoading] = useState(false);
  const [pwdError, setPwdError] = useState("");
  const [pwdValue, setPwdValue] = useState("");
  const [showPwd, setShowPwd] = useState(false);

  const openEditing = () => {
    if (!result) { open(); return; }
    if (editUnlocked) { open(); return; }
    setPwdOpen(true);
    setPwdValue("");
    setPwdError("");
  };

  const confirmPwd = async () => {
    if (!pwdValue.trim()) return;
    setPwdLoading(true);
    setPwdError("");
    try {
      const res = await fetch("/api/auth/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: pwdValue }),
      });
      if (res.ok) {
        setPwdOpen(false);
        setPwdValue("");
        onUnlock();
        open();
      } else {
        setPwdError("Senha incorreta.");
        setPwdValue("");
      }
    } catch {
      setPwdError("Erro de conexão.");
    }
    setPwdLoading(false);
  };

  useEffect(() => {
    if (!editing) {
      setValue(result?.result ?? "");
      setStatus((result?.status as "conforme" | "nao_conforme" | "na" | "aprovado_com_ressalva" | "nd" | "lq") ?? "conforme");
      setObservation(result?.observation ?? "");
    }
  }, [result, editing]);
  const { toast } = useToast();

  const upsertResult = useUpsertResult({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListResultsQueryKey(protocolId) });
        queryClient.invalidateQueries({ queryKey: getGetKineticsQueryKey(protocolId) });
        queryClient.invalidateQueries({ queryKey: getGetProtocolQueryKey(protocolId) });
        setEditing(false);
        onSaved();
      },
      onError: (err: unknown) => {
        const apiMsg = (err as { data?: { error?: string } })?.data?.error;
        toast({ title: "Erro ao salvar", description: apiMsg ?? "Tente novamente.", variant: "destructive" });
        setEditing(false);
      },
    },
  });

  const bulkUpsert = useUpsertResult();

  const save = () => {
    if (!value.trim()) { setEditing(false); return; }
    if (status === "aprovado_com_ressalva" && !observation.trim()) {
      toast({ title: "Justificativa obrigatória", description: "Descreva o motivo para liberar com ressalva antes de salvar.", variant: "destructive" });
      return;
    }
    upsertResult.mutate({
      id: protocolId,
      data: {
        lotId,
        period,
        analysisDate: periodDate ?? new Date().toISOString().split("T")[0],
        category: param.category as "fisico_quimica" | "microbiologica" | "teor_ativo" | "embalagem",
        parameter: param.parameter,
        criterion: param.criterion,
        result: value,
        numericResult: (() => { const n = parseFloat(value.replace(",", ".")); return isNaN(n) ? undefined : n; })(),
        status,
        observation: observation.trim() || undefined,
      },
    });
  };

  const open = () => {
    setValue(result?.result ?? "");
    setStatus((result?.status as "conforme" | "nao_conforme" | "na" | "aprovado_com_ressalva" | "nd" | "lq") ?? "conforme");
    setObservation(result?.observation ?? "");
    setEditing(true);
  };

  const statusColors: Record<string, string> = {
    conforme: "text-green-700 bg-green-50 border-green-200",
    nao_conforme: "text-red-700 bg-red-50 border-red-200",
    na: "text-slate-500 bg-slate-50 border-slate-200",
    aprovado_com_ressalva: "text-amber-700 bg-amber-50 border-amber-200",
    nd: "text-blue-600 bg-blue-50 border-blue-200",
    lq: "text-purple-600 bg-purple-50 border-purple-200",
  };

  const statusBtnColors: Record<string, string> = {
    conforme: "bg-green-100 text-green-700 border-green-300 font-bold",
    nao_conforme: "bg-red-100 text-red-700 border-red-300 font-bold",
    na: "bg-slate-100 text-slate-500 border-slate-300 font-bold",
    aprovado_com_ressalva: "bg-amber-100 text-amber-700 border-amber-300 font-bold",
    nd: "bg-blue-100 text-blue-700 border-blue-300 font-bold",
    lq: "bg-purple-100 text-purple-700 border-purple-300 font-bold",
  };

  const STATUS_LABEL: Record<string, string> = {
    conforme: "C",
    nao_conforme: "NC",
    na: "NA",
    aprovado_com_ressalva: "AR",
    nd: "ND",
    lq: "LQ",
  };

  if (editing) {
    return (
      <div className="flex flex-col gap-1 p-0.5 min-w-28" data-inline-cell onClick={(e) => e.stopPropagation()}>
        <input
          autoFocus
          type="text"
          value={value}
          onChange={(e) => {
            const v = e.target.value;
            setValue(v);
            const shortcutMap: Record<string, typeof status> = {
              c: "conforme", nc: "nao_conforme", na: "na",
              ar: "aprovado_com_ressalva", nd: "nd", lq: "lq",
            };
            const mapped = shortcutMap[v.toLowerCase().trim()];
            if (mapped) setStatus(mapped);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") { e.preventDefault(); save(); }
            if (e.key === "Escape") setEditing(false);
            if (e.key === "Tab") {
              e.preventDefault();
              save();
              const allCells = Array.from(document.querySelectorAll<HTMLElement>("[data-inline-cell]"));
              const thisCell = (e.currentTarget as HTMLElement).closest<HTMLElement>("[data-inline-cell]");
              const idx = thisCell ? allCells.indexOf(thisCell) : -1;
              const next = e.shiftKey ? allCells[idx - 1] : allCells[idx + 1];
              if (next) { setEditing(false); setTimeout(() => { next.focus(); next.click(); }, 30); }
            }
          }}
          autoComplete="new-password"
          autoCorrect="off"
          autoCapitalize="off"
          spellCheck={false}
          data-form-type="other"
          data-lpignore="true"
          className="w-full border border-primary rounded px-1.5 py-0.5 text-xs font-mono text-center focus:outline-none focus:ring-1 focus:ring-primary"
          placeholder="Resultado ou C/NC/NA/ND/LQ/AR"
          data-testid="input-inline-result"
        />
        <div className="flex gap-0.5 justify-center flex-wrap" translate="no">
          {(["conforme", "nao_conforme", "na", "aprovado_com_ressalva", "nd", "lq"] as const).map((s) => (
            <button
              type="button"
              key={s}
              translate="no"
              lang="pt-BR"
              onClick={() => {
                setStatus(s);
                setValue(STATUS_LABEL[s] ?? s);
              }}
              className={`text-[9px] px-1 py-0.5 rounded border transition-all ${status === s ? statusBtnColors[s] : "bg-white text-muted-foreground border-border"}`}
            >
              <span translate="no">{STATUS_LABEL[s] ?? s}</span>
            </button>
          ))}
        </div>
        {status === "aprovado_com_ressalva" && (
          <div className="flex flex-col gap-0.5">
            <label className="text-[9px] font-semibold text-amber-700 flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-amber-500 inline-block" />
              Justificativa de liberação <span className="text-red-600">*</span>
            </label>
            <textarea
              autoFocus
              value={observation}
              onChange={e => setObservation(e.target.value)}
              rows={2}
              className="w-full border border-amber-400 rounded px-1.5 py-0.5 text-[9px] focus:outline-none focus:ring-1 focus:ring-amber-400 resize-none"
              placeholder="Descreva o motivo para liberar com ressalva…"
            />
            {!observation.trim() && (
              <p className="text-[9px] text-red-600">Campo obrigatório para liberar com ressalva.</p>
            )}
          </div>
        )}
        <div className="flex gap-0.5 justify-center flex-wrap">
          <button
            type="button"
            onClick={save}
            disabled={upsertResult.isPending}
            className="text-[9px] px-2 py-0.5 rounded bg-primary text-white hover:bg-primary/80 disabled:opacity-50"
          >
            {upsertResult.isPending ? "..." : "OK"}
          </button>
          <button
            type="button"
            onClick={() => { setEditing(false); setDelConfirm(false); }}
            className="text-[9px] px-2 py-0.5 rounded bg-muted text-muted-foreground hover:bg-muted/80"
          >
            ✕
          </button>
          {result?.id && !delConfirm && (
            <button
              type="button"
              onClick={() => setDelConfirm(true)}
              className="text-[9px] px-2 py-0.5 rounded bg-red-50 text-red-600 hover:bg-red-100 border border-red-200"
            >
              Excluir
            </button>
          )}
          {delConfirm && (
            <>
              <button
                type="button"
                onClick={() => { if (result?.id) deleteResult.mutate({ id: protocolId, resultId: result.id }); }}
                disabled={deleteResult.isPending}
                className="text-[9px] px-2 py-0.5 rounded bg-red-600 text-white hover:bg-red-700 disabled:opacity-50"
              >
                {deleteResult.isPending ? "..." : "Confirmar excluir"}
              </button>
              <button
                type="button"
                onClick={() => setDelConfirm(false)}
                className="text-[9px] px-2 py-0.5 rounded bg-muted text-muted-foreground hover:bg-muted/80"
              >
                Não
              </button>
            </>
          )}
        </div>
        {value.trim() && (
          <button
            type="button"
            onClick={async () => {
              const tasks = lots.flatMap((lot) =>
                ([0, 3, 6] as const).map((p) => ({ lotId: lot.id, period: p }))
              );
              await Promise.all(
                tasks.map(({ lotId, period: p }) =>
                  bulkUpsert.mutateAsync({
                    id: protocolId,
                    data: {
                      lotId,
                      period: p,
                      analysisDate: periodDate ?? new Date().toISOString().split("T")[0],
                      category: param.category as "fisico_quimica" | "microbiologica" | "teor_ativo" | "embalagem",
                      parameter: param.parameter,
                      criterion: param.criterion,
                      result: value,
                      numericResult: (() => { const n = parseFloat(value.replace(",", ".")); return isNaN(n) ? undefined : n; })(),
                      status,
                    },
                  })
                )
              );
              queryClient.invalidateQueries({ queryKey: getListResultsQueryKey(protocolId) });
              queryClient.invalidateQueries({ queryKey: getGetKineticsQueryKey(protocolId) });
              queryClient.invalidateQueries({ queryKey: getGetProtocolQueryKey(protocolId) });
              setEditing(false);
              onSaved();
            }}
            disabled={bulkUpsert.isPending}
            className="text-[9px] px-1.5 py-0.5 rounded bg-blue-50 text-blue-700 hover:bg-blue-100 border border-blue-200 w-full mt-0.5 disabled:opacity-50"
            title="Preenche todos os lotes e períodos com este valor"
          >
            {bulkUpsert.isPending ? "Salvando..." : "↕ replicar todos"}
          </button>
        )}
      </div>
    );
  }

  const imgKey = `imgs_${protocolId}_${param.parameter}_${lotId}_${period}`;
  return (
    <div className="flex flex-col items-center gap-0.5" data-testid={`cell-${param.parameter}-${lotId}-${period}`}>
      {/* Dialog de confirmação de senha para reeditar resultado já salvo */}
      {pwdOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={() => { setPwdOpen(false); setPwdError(""); }}>
          <div className="bg-white rounded-lg shadow-xl w-80 p-5 space-y-4" onClick={e => e.stopPropagation()}>
            <div className="flex items-center gap-2">
              <Lock className="h-5 w-5 text-amber-600 shrink-0" />
              <p className="font-semibold text-sm">Alterar resultado já salvo</p>
            </div>
            <p className="text-xs text-muted-foreground">
              O parâmetro <strong>{param.parameter}</strong> já possui resultado salvo. Digite a senha para autorizar a alteração de <strong>todos os resultados</strong> desta análise.
            </p>
            <div className="relative">
              <input
                type={showPwd ? "text" : "password"}
                value={pwdValue}
                onChange={e => { setPwdValue(e.target.value); setPwdError(""); }}
                onKeyDown={e => { if (e.key === "Enter") confirmPwd(); if (e.key === "Escape") { setPwdOpen(false); } }}
                placeholder="Senha mestra"
                autoFocus
                className="w-full border border-border rounded px-3 py-1.5 text-sm pr-9 focus:outline-none focus:ring-1 focus:ring-primary"
              />
              <button type="button" onClick={() => setShowPwd(s => !s)} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground">
                {showPwd ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
            {pwdError && <p className="text-xs text-destructive font-medium -mt-2">{pwdError}</p>}
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => { setPwdOpen(false); setPwdError(""); }} className="text-xs px-3 py-1.5 rounded border border-border hover:bg-muted">Cancelar</button>
              <button type="button" onClick={confirmPwd} disabled={pwdLoading || !pwdValue.trim()} className="text-xs px-3 py-1.5 rounded bg-primary text-white hover:bg-primary/80 disabled:opacity-50">
                {pwdLoading ? "Verificando…" : "Confirmar"}
              </button>
            </div>
          </div>
        </div>
      )}
      <div
        onClick={openEditing}
        onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); openEditing(); } }}
        tabIndex={0}
        data-inline-cell
        className="cursor-pointer group flex items-center justify-center min-h-8 focus:outline-none focus:ring-2 focus:ring-primary/40 focus:ring-inset rounded w-full"
        title={result ? (editUnlocked ? "Clique para alterar (desbloqueado)" : "Clique para alterar (exige senha)") : "Clique para inserir resultado"}
      >
        {result ? (
          <span className={`inline-flex flex-col items-center gap-0.5 px-1.5 py-0.5 rounded text-xs border font-medium group-hover:opacity-80 transition-opacity ${statusColors[result.status] ?? "text-slate-600 bg-slate-50 border-slate-200"}`}>
            <span>{result.result}</span>
            {result.status === "aprovado_com_ressalva" && (
              <span
                className="text-[8px] font-bold tracking-wide text-amber-700"
                title={result.observation ? `Justificativa: ${result.observation}` : "Aprovado com Ressalva"}
              >
                AR {result.observation ? "ℹ" : ""}
              </span>
            )}
            {result.status === "nd" && (
              <span className="text-[8px] font-bold tracking-wide text-blue-600">ND</span>
            )}
            {result.status === "lq" && (
              <span className="text-[8px] font-bold tracking-wide text-purple-600">LQ</span>
            )}
          </span>
        ) : (
          <span className="text-muted-foreground/30 group-hover:text-muted-foreground/60 text-lg leading-none transition-colors">+</span>
        )}
      </div>
      <CellImages storageKey={imgKey} />
    </div>
  );
}

type EditableParam = { uid: string; parameter: string; category: string; criterion: string; methodologyShort?: string; methodologyCitation?: string };

function normalizeSearch(s: string) {
  return s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
}

function ParamMethodSelector({
  paramName,
  selected,
  methodologies,
  catalogEntries = [],
  onSelect,
  compact = false,
  hideRemove = false,
}: {
  paramName: string;
  selected: string | null;
  methodologies: { id: number; shortName: string; citation: string; category?: string | null; subject?: string | null }[];
  catalogEntries?: { shortName: string; citation: string }[];
  onSelect: (shortName: string | null, citation: string | null) => void;
  /** Quando true, renderiza apenas um ícone de edição (para uso ao lado de texto visível). */
  compact?: boolean;
  /** Quando true, esconde o botão "× Remover seleção" dentro do popover. */
  hideRemove?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const hasCatalog = catalogEntries.length > 0;

  const norm = normalizeSearch(search);
  const filteredCatalog = catalogEntries.filter(
    m => normalizeSearch(m.shortName).includes(norm) || normalizeSearch(m.citation).includes(norm)
  );
  const filteredMethodologies = methodologies.filter(
    m => normalizeSearch(m.shortName).includes(norm) || normalizeSearch(m.citation).includes(norm) || normalizeSearch(m.subject ?? "").includes(norm)
  );

  return (
    <Popover open={open} onOpenChange={(v) => { setOpen(v); if (!v) setSearch(""); }}>
      <PopoverTrigger asChild>
        {compact ? (
          <button
            type="button"
            className="flex items-center justify-center h-5 w-5 rounded text-muted-foreground/40 hover:text-primary hover:bg-primary/10 transition-colors flex-shrink-0 mt-0.5"
            title={selected ? "Alterar metodologia" : "Selecionar metodologia"}
            onClick={(e) => e.stopPropagation()}
          >
            <Pencil className="h-3 w-3" />
          </button>
        ) : (
          <button
            type="button"
            className={`flex items-start gap-1 mt-0.5 text-[11px] rounded px-1 py-0.5 transition-colors text-left ${
              selected
                ? "text-primary/90 hover:text-primary font-medium"
                : "text-muted-foreground/50 hover:text-muted-foreground"
            }`}
            title={selected ? `Clique para alterar metodologia` : "Clique para selecionar metodologia"}
            onClick={(e) => e.stopPropagation()}
          >
            <BookOpen className="h-3 w-3 flex-shrink-0 mt-0.5" />
            <span className="whitespace-normal leading-tight">
              {selected ?? (
                <span className="italic text-[10px]">
                  selecionar{hasCatalog && (
                    <span className="ml-1 not-italic bg-primary/15 text-primary rounded px-1 py-0 text-[9px] font-semibold">
                      {catalogEntries.length}
                    </span>
                  )}
                </span>
              )}
            </span>
          </button>
        )}
      </PopoverTrigger>
      <PopoverContent className="w-80 p-2 z-50" side="right" align="start">
        <p className="text-xs font-semibold text-muted-foreground mb-2 px-1">
          Metodologia — <span className="font-normal italic">{paramName || "parâmetro"}</span>
        </p>

        {/* Campo de busca */}
        <div className="relative mb-2">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-primary/50 pointer-events-none" />
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Buscar por nome..."
            className="w-full pl-7 pr-2 py-1.5 text-xs border-2 border-primary/30 rounded-md bg-background focus:outline-none focus:border-primary placeholder:text-muted-foreground/50"
          />
          {search && (
            <button
              type="button"
              onClick={() => setSearch("")}
              className="absolute right-1.5 top-1/2 -translate-y-1/2 text-muted-foreground/50 hover:text-foreground"
            >
              <X className="h-3 w-3" />
            </button>
          )}
        </div>

        {/* Entradas do catálogo para este parâmetro */}
        {hasCatalog && filteredCatalog.length > 0 && (
          <>
            <p className="text-[9px] uppercase tracking-widest text-primary/60 font-bold px-1 mb-1">
              Cadastradas para este parâmetro
            </p>
            <div className="space-y-0.5 mb-2">
              {filteredCatalog.map((m, i) => (
                <button
                  type="button"
                  key={i}
                  onClick={() => { onSelect(m.shortName, m.citation); setOpen(false); setSearch(""); }}
                  className={`w-full text-left text-xs px-2 py-1.5 rounded border transition-colors hover:bg-primary/10 ${
                    selected === m.shortName
                      ? "border-primary/40 bg-primary/10 text-primary font-semibold"
                      : "border-primary/15 bg-primary/5"
                  }`}
                >
                  <div className="flex items-center gap-1">
                    <BookOpen className="h-2.5 w-2.5 text-primary/50 flex-shrink-0" />
                    <span className="font-medium text-[11px]">{m.shortName}</span>
                  </div>
                  <div className="text-[9px] text-muted-foreground truncate leading-tight pl-3.5">{m.citation}</div>
                </button>
              ))}
            </div>
            {filteredMethodologies.length > 0 && (
              <>
                <div className="border-t my-1.5" />
                <p className="text-[9px] uppercase tracking-widest text-muted-foreground/50 font-bold px-1 mb-1">
                  Biblioteca geral
                </p>
              </>
            )}
          </>
        )}

        {/* Todas as metodologias cadastradas */}
        {filteredMethodologies.length === 0 && filteredCatalog.length === 0 ? (
          <p className="text-xs text-muted-foreground italic px-1 py-2 text-center">
            {search ? `Nenhuma metodologia encontrada para "${search}"` : "Nenhuma metodologia cadastrada."}
          </p>
        ) : filteredMethodologies.length > 0 ? (
          <div className="space-y-0.5 max-h-48 overflow-y-auto">
            {filteredMethodologies.map((m) => (
              <button
                type="button"
                key={m.id}
                onClick={() => { onSelect(m.shortName, m.citation); setOpen(false); setSearch(""); }}
                className={`w-full text-left text-xs px-2 py-1.5 rounded hover:bg-muted transition-colors ${
                  selected === m.shortName && !hasCatalog ? "bg-primary/10 text-primary font-semibold" : ""
                }`}
              >
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className="font-medium text-[11px]">{m.shortName}</span>
                  {m.subject && <span className="text-[9px] bg-primary/10 text-primary/80 px-1 py-0 rounded font-medium leading-tight">{m.subject}</span>}
                </div>
                <div className="text-[9px] text-muted-foreground truncate leading-tight">{m.citation}</div>
              </button>
            ))}
          </div>
        ) : null}

        {selected && !hideRemove && (
          <div className="border-t mt-1.5 pt-1">
            <button
              type="button"
              onClick={() => { onSelect(null, null); setOpen(false); setSearch(""); }}
              className="w-full text-left text-[10px] px-2 py-1 rounded hover:bg-destructive/10 text-destructive"
            >
              × Remover seleção
            </button>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}

// ── Catálogo global de metodologias por parâmetro ─────────────────────────
// Suporta múltiplas metodologias por parâmetro; auto-preenche ao reutilizar
const PARAM_CATALOG_KEY = "param_catalog_v2";
type CatalogEntry = { shortName: string; citation: string };

function getCatalogEntries(paramName: string): CatalogEntry[] {
  if (!paramName.trim()) return [];
  try {
    const raw = localStorage.getItem(PARAM_CATALOG_KEY);
    if (!raw) return [];
    const catalog = JSON.parse(raw) as Record<string, CatalogEntry[]>;
    return catalog[paramName.trim().toLowerCase()] ?? [];
  } catch { return []; }
}

function addToCatalog(paramName: string, shortName: string, citation: string) {
  if (!paramName.trim() || !shortName) return;
  try {
    const raw = localStorage.getItem(PARAM_CATALOG_KEY);
    const catalog: Record<string, CatalogEntry[]> = raw ? JSON.parse(raw) : {};
    const key = paramName.trim().toLowerCase();
    const existing = catalog[key] ?? [];
    // Deduplicar por shortName
    if (!existing.some(e => e.shortName === shortName)) {
      catalog[key] = [...existing, { shortName, citation }];
      localStorage.setItem(PARAM_CATALOG_KEY, JSON.stringify(catalog));
    }
  } catch { /* ignore */ }
}

/**
 * Lookup reverso: dado um shortName de metodologia, retorna os parâmetros
 * que já usaram essa metodologia (nome de exibição + critério de aceitação).
 * Usado para auto-preencher nome e critério ao selecionar metodologia em parâmetro em branco.
 */
function getParamsForMethodology(shortName: string): { paramName: string; criterion: string }[] {
  if (!shortName) return [];
  try {
    const raw = localStorage.getItem(PARAM_CATALOG_KEY);
    if (!raw) return [];
    const catalog = JSON.parse(raw) as Record<string, CatalogEntry[]>;
    // Todos os presets para reverse-lookup de nome de exibição e critério
    const allPresets = [
      ...Object.values(CATEGORY_PRESETS).flat(),
      ...ANALYSIS_PARAMETERS.map(p => ({ parameter: p.parameter, criterion: p.criterion })),
    ];
    const results: { paramName: string; criterion: string }[] = [];
    for (const [normalizedKey, entries] of Object.entries(catalog)) {
      if (entries.some(e => e.shortName === shortName)) {
        const preset = allPresets.find(p => p.parameter.trim().toLowerCase() === normalizedKey);
        const displayName = preset?.parameter
          ?? normalizedKey.replace(/\b\w/g, c => c.toUpperCase());
        results.push({ paramName: displayName, criterion: preset?.criterion ?? "" });
      }
    }
    return results;
  } catch { return []; }
}

/** Retorna todos os presets disponíveis para uma categoria, combinando CATEGORY_PRESETS com ANALYSIS_PARAMETERS. */
function getPresetsForCategory(category: string): { parameter: string; criterion: string }[] {
  const fromPresets = CATEGORY_PRESETS[category] ?? [];
  const fromAnalysis = ANALYSIS_PARAMETERS
    .filter(p => p.category === category)
    .map(p => ({ parameter: p.parameter, criterion: p.criterion }));
  const seen = new Set(fromPresets.map(p => p.parameter));
  return [...fromPresets, ...fromAnalysis.filter(p => !seen.has(p.parameter))];
}

/** Banco de parâmetros pré-definidos por categoria. */
// ── Tipos e templates de produto ─────────────────────────────────────────
interface ProductTemplateParam {
  parameter: string;
  category: string;
  criterion: string;
  methodologyShort: string;
  methodologyCitation: string;
}
interface ProductTemplate {
  id: string;
  name: string;
  description: string;
  params: ProductTemplateParam[];
}

const PRODUCT_TEMPLATES: ProductTemplate[] = [
  {
    id: "colageno_ha_vitc_sache",
    name: "Colágeno + Ácido Hialurônico + Vitamina C — Pó / Sachê",
    description: "Suplemento alimentar em pó — Colágeno hidrolisado, Ácido Hialurônico e Vitamina C em sachê de 10g",
    params: [
      // Físico-química
      { parameter: "Cor", category: "fisico_quimica", criterion: "Característico (branco/creme)", methodologyShort: "Organoléptico", methodologyCitation: "Análise organoléptica — inspeção visual" },
      { parameter: "Odor", category: "fisico_quimica", criterion: "Característico", methodologyShort: "Organoléptico", methodologyCitation: "Análise organoléptica" },
      { parameter: "Solubilidade", category: "fisico_quimica", criterion: "≥ 95% em água a 20°C", methodologyShort: "Visual", methodologyCitation: "Avaliação visual — dissolução em água" },
      { parameter: "pH", category: "fisico_quimica", criterion: "4,5 – 7,5 (solução 1%)", methodologyShort: "AOAC 981.12", methodologyCitation: "AOAC 981.12 / Farmacopeia Brasileira 5ª Ed. — Determinação de pH" },
      { parameter: "Umidade", category: "fisico_quimica", criterion: "≤ 5,0%", methodologyShort: "AOAC 934.01", methodologyCitation: "AOAC 934.01 / Farmacopeia Brasileira 5ª Ed. — Umidade por dessecação" },
      { parameter: "Cinzas", category: "fisico_quimica", criterion: "≤ 3,0%", methodologyShort: "AOAC 942.05", methodologyCitation: "AOAC 942.05 — Cinzas totais por incineração" },
      { parameter: "Kcal", category: "fisico_quimica", criterion: "Conforme rotulagem ± 20%", methodologyShort: "Cálculo Atwater", methodologyCitation: "Cálculo pelos fatores de Atwater / AOAC 2011.25" },
      { parameter: "Sódio", category: "fisico_quimica", criterion: "≤ 5 mg declara 0", methodologyShort: "AOAC 984.27", methodologyCitation: "AOAC 984.27 — Sódio por ICP-OES / absorção atômica" },
      { parameter: "Massa média", category: "fisico_quimica", criterion: "10,0 g ± 5%", methodologyShort: "FB 5ª Ed.", methodologyCitation: "Farmacopeia Brasileira 5ª Ed. — Determinação de massa média" },
      { parameter: "Peso médio sachê", category: "fisico_quimica", criterion: "10,0 g ± 5%", methodologyShort: "Gravimétrico", methodologyCitation: "Método gravimétrico — pesagem direta (balança analítica)" },
      // Microbiológica
      { parameter: "Salmonella spp. em 25 g", category: "microbiologica", criterion: "Ausente em 25 g", methodologyShort: "AOAC 996.08", methodologyCitation: "AOAC 996.08 / RDC 331/2019 — Salmonella spp. em 25 g" },
      { parameter: "Bolores e leveduras", category: "microbiologica", criterion: "≤ 10³ UFC/g", methodologyShort: "AOAC 997.02", methodologyCitation: "AOAC 997.02 / RDC 331/2019 — Contagem de bolores e leveduras" },
      { parameter: "Escherichia coli", category: "microbiologica", criterion: "Ausente em 1 g", methodologyShort: "AOAC 991.14", methodologyCitation: "AOAC 991.14 / RDC 331/2019 — Escherichia coli (MPN)" },
      { parameter: "Enterobacteriaceae", category: "microbiologica", criterion: "≤ 10² UFC/g", methodologyShort: "ISO 21528-2", methodologyCitation: "ISO 21528-2 / ABNT NBR — Contagem de Enterobacteriaceae" },
      { parameter: "Estafilococos coagulase positiva por g", category: "microbiologica", criterion: "≤ 10² UFC/g", methodologyShort: "AOAC 975.55", methodologyCitation: "AOAC 975.55 / RDC 331/2019 — Estafilococos coagulase positiva" },
      // Teor do Ativo
      { parameter: "Gelatina hidrolisada/Colágeno hidrolisado", category: "teor_ativo", criterion: "≥ 80% do valor declarado", methodologyShort: "AOAC 990.03", methodologyCitation: "AOAC 990.03 — Proteína total (Kjeldahl) / Colágeno hidrolisado" },
      { parameter: "Vitamina C - Ácido Ascórbico", category: "teor_ativo", criterion: "≥ 80% do valor declarado", methodologyShort: "AOAC 967.21", methodologyCitation: "AOAC 967.21 — Ácido Ascórbico por HPLC / titulação iodométrica" },
      { parameter: "Ácido Hialurônico", category: "teor_ativo", criterion: "≥ 80% do valor declarado", methodologyShort: "HPLC", methodologyCitation: "HPLC / Método colorimétrico (ácido carbazólico) — Ácido Hialurônico" },
      // Embalagem
      { parameter: "Integridade selagem", category: "embalagem", criterion: "Íntegra, sem vazamentos", methodologyShort: "Visual", methodologyCitation: "Inspeção visual / Teste de vedação (vácuo ou pressão)" },
      { parameter: "Headspace", category: "embalagem", criterion: "15% - 20%", methodologyShort: "Headspace GC", methodologyCitation: "Cromatografia gasosa de headspace — análise do espaço livre no frasco" },
    ],
  },
  {
    id: "multivitaminico_capsula_dura",
    name: "Multivitamínico + Minerais — Cápsula Dura",
    description: "Suplemento alimentar em cápsula dura com vitaminas do complexo B, C, D, E e minerais (Zinco, Magnésio, Ferro, Cálcio)",
    params: [
      // Físico-química
      { parameter: "Aparência", category: "fisico_quimica", criterion: "Cápsulas íntegras, sem deformação, cor uniforme", methodologyShort: "Visual", methodologyCitation: "Inspeção visual / análise organoléptica" },
      { parameter: "Cor", category: "fisico_quimica", criterion: "Característico", methodologyShort: "Organoléptico", methodologyCitation: "Análise organoléptica — inspeção visual" },
      { parameter: "Odor", category: "fisico_quimica", criterion: "Característico, sem odor rançoso", methodologyShort: "Organoléptico", methodologyCitation: "Análise organoléptica" },
      { parameter: "Perda por dessecação", category: "fisico_quimica", criterion: "≤ 5,0%", methodologyShort: "FB 7ª Ed.", methodologyCitation: "Farmacopeia Brasileira 7ª Ed. — Perda por dessecação (105°C, 2h)" },
      { parameter: "Massa média", category: "fisico_quimica", criterion: "Conforme especificação ± 5%", methodologyShort: "FB 7ª Ed.", methodologyCitation: "Farmacopeia Brasileira 7ª Ed. — Determinação de massa média de cápsulas" },
      { parameter: "Dissolução", category: "fisico_quimica", criterion: "≥ 75% em 45 min (aparato Pá, 50 rpm)", methodologyShort: "FB 7ª Ed.", methodologyCitation: "Farmacopeia Brasileira 7ª Ed. — Ensaio de dissolução (Aparato 2 — Pá)" },
      { parameter: "Cinzas totais", category: "fisico_quimica", criterion: "≤ 5,0%", methodologyShort: "AOAC 942.05", methodologyCitation: "AOAC 942.05 — Cinzas totais por incineração" },
      { parameter: "Kcal", category: "fisico_quimica", criterion: "Conforme rotulagem ± 20%", methodologyShort: "Cálculo Atwater", methodologyCitation: "Cálculo pelos fatores de Atwater / AOAC 2011.25" },
      { parameter: "Sódio", category: "fisico_quimica", criterion: "Conforme rotulagem ± 20%", methodologyShort: "AOAC 984.27", methodologyCitation: "AOAC 984.27 — Sódio por ICP-OES / absorção atômica" },
      // Microbiológica
      { parameter: "Salmonella spp. em 10 g", category: "microbiologica", criterion: "Ausente em 10 g", methodologyShort: "AOAC 996.08", methodologyCitation: "AOAC 996.08 / RDC 724/2022 — Salmonella spp. em 10 g" },
      { parameter: "Bolores e leveduras", category: "microbiologica", criterion: "≤ 10² UFC/g", methodologyShort: "AOAC 997.02", methodologyCitation: "AOAC 997.02 / RDC 724/2022 — Contagem de bolores e leveduras" },
      { parameter: "Escherichia coli", category: "microbiologica", criterion: "Ausente em 1 g", methodologyShort: "AOAC 991.14", methodologyCitation: "AOAC 991.14 / RDC 724/2022 — Escherichia coli (MPN)" },
      { parameter: "Contagem de Micro-organismos Aeróbios Mesófilos", category: "microbiologica", criterion: "≤ 10³ UFC/g", methodologyShort: "ISO 4833-1", methodologyCitation: "ISO 4833-1 / ABNT NBR — Contagem de micro-organismos aeróbios mesófilos a 30°C" },
      // Teor do Ativo
      { parameter: "Vitamina C (Ácido Ascórbico)", category: "teor_ativo", criterion: "≥ 80% do valor declarado", methodologyShort: "AOAC 967.21", methodologyCitation: "AOAC 967.21 — Ácido Ascórbico por HPLC / titulação iodométrica" },
      { parameter: "Vitamina D3 (Colecalciferol)", category: "teor_ativo", criterion: "≥ 80% do valor declarado", methodologyShort: "HPLC-UV", methodologyCitation: "HPLC-UV / AOAC 995.05 — Vitamina D por cromatografia líquida de alta eficiência" },
      { parameter: "Vitamina E (Tocoferol)", category: "teor_ativo", criterion: "≥ 80% do valor declarado", methodologyShort: "HPLC", methodologyCitation: "HPLC / AOAC 971.30 — Vitamina E (alfa-tocoferol) por cromatografia" },
      { parameter: "Vitamina B1 (Tiamina)", category: "teor_ativo", criterion: "≥ 80% do valor declarado", methodologyShort: "HPLC", methodologyCitation: "HPLC / AOAC 942.23 — Tiamina por cromatografia líquida" },
      { parameter: "Vitamina B6 (Piridoxina)", category: "teor_ativo", criterion: "≥ 80% do valor declarado", methodologyShort: "HPLC", methodologyCitation: "HPLC / AOAC 985.32 — Piridoxina por cromatografia líquida" },
      { parameter: "Vitamina B12 (Cobalamina)", category: "teor_ativo", criterion: "≥ 80% do valor declarado", methodologyShort: "HPLC", methodologyCitation: "HPLC / AOAC 2011.10 — Vitamina B12 por cromatografia líquida" },
      { parameter: "Zinco", category: "teor_ativo", criterion: "≥ 80% do valor declarado", methodologyShort: "ICP-OES", methodologyCitation: "ICP-OES / AOAC 985.35 — Zinco por espectrometria de emissão atômica" },
      { parameter: "Magnésio", category: "teor_ativo", criterion: "≥ 80% do valor declarado", methodologyShort: "ICP-OES", methodologyCitation: "ICP-OES / AOAC 985.35 — Magnésio por espectrometria de emissão atômica" },
      // Embalagem
      { parameter: "Torque de tampa", category: "embalagem", criterion: "2,0 – 4,5 N·m", methodologyShort: "Torquímetro", methodologyCitation: "Ensaio de torque com torquímetro calibrado — remoção de tampa" },
      { parameter: "Selagem por indução", category: "embalagem", criterion: "Lacre íntegro, sem vazamentos ou danos", methodologyShort: "Visual", methodologyCitation: "Inspeção visual / Teste de pressão positiva" },
      { parameter: "Integridade selagem", category: "embalagem", criterion: "Sem deformação, bolhas ou ruptura", methodologyShort: "Visual", methodologyCitation: "Inspeção visual do lacre indutivo e da embalagem primária" },
    ],
  },
  {
    id: "omega3_softgel",
    name: "Ômega-3 (EPA + DHA) — Softgel / Cápsula Mole",
    description: "Suplemento alimentar de óleo de peixe em cápsula gelatinosa mole (softgel), 1g por cápsula",
    params: [
      // Físico-química
      { parameter: "Aparência", category: "fisico_quimica", criterion: "Cápsulas íntegras, translúcidas, sem vazamentos ou deformação", methodologyShort: "Visual", methodologyCitation: "Inspeção visual — integridade física da cápsula mole" },
      { parameter: "Cor", category: "fisico_quimica", criterion: "Amarelo âmbar a dourado", methodologyShort: "Organoléptico", methodologyCitation: "Análise organoléptica — inspeção visual" },
      { parameter: "Odor", category: "fisico_quimica", criterion: "Característico de óleo de peixe, sem rancidez intensa", methodologyShort: "Organoléptico", methodologyCitation: "Análise organoléptica" },
      { parameter: "Massa média", category: "fisico_quimica", criterion: "1,0 g ± 5%", methodologyShort: "FB 7ª Ed.", methodologyCitation: "Farmacopeia Brasileira 7ª Ed. — Determinação de massa média de cápsulas moles" },
      { parameter: "Índice de peróxido", category: "fisico_quimica", criterion: "≤ 5 mEq O₂/kg", methodologyShort: "AOAC 965.33", methodologyCitation: "AOAC 965.33 / AOCS Cd 8b-90 — Índice de peróxido (rancidez primária)" },
      { parameter: "Índice de anisidina (p-AV)", category: "fisico_quimica", criterion: "≤ 20", methodologyShort: "AOCS Cd 18-90", methodologyCitation: "AOCS Cd 18-90 — Índice de p-anisidina (rancidez secundária)" },
      { parameter: "TOTOX", category: "fisico_quimica", criterion: "≤ 26 (2×PV + AV)", methodologyShort: "Cálculo", methodologyCitation: "Cálculo TOTOX = 2 × Índice de Peróxido + Índice de Anisidina (GOED)" },
      { parameter: "Índice de acidez", category: "fisico_quimica", criterion: "≤ 3,0 mg KOH/g", methodologyShort: "AOCS Cd 3d-63", methodologyCitation: "AOCS Cd 3d-63 / AOAC 940.28 — Índice de acidez por titulação" },
      { parameter: "Dissolução", category: "fisico_quimica", criterion: "≥ 75% em 60 min (aparato Pá, 50 rpm)", methodologyShort: "FB 7ª Ed.", methodologyCitation: "Farmacopeia Brasileira 7ª Ed. — Ensaio de dissolução para cápsulas moles" },
      { parameter: "Sódio", category: "fisico_quimica", criterion: "Conforme rotulagem ± 20%", methodologyShort: "AOAC 984.27", methodologyCitation: "AOAC 984.27 — Sódio por ICP-OES / absorção atômica" },
      { parameter: "Kcal", category: "fisico_quimica", criterion: "Conforme rotulagem ± 20%", methodologyShort: "Cálculo Atwater", methodologyCitation: "Cálculo pelos fatores de Atwater / AOAC 2011.25" },
      // Microbiológica
      { parameter: "Salmonella spp. em 10 g", category: "microbiologica", criterion: "Ausente em 10 g", methodologyShort: "AOAC 996.08", methodologyCitation: "AOAC 996.08 / RDC 724/2022 — Salmonella spp. em 10 g" },
      { parameter: "Bolores e leveduras", category: "microbiologica", criterion: "≤ 10² UFC/g", methodologyShort: "AOAC 997.02", methodologyCitation: "AOAC 997.02 / RDC 724/2022 — Contagem de bolores e leveduras" },
      { parameter: "Escherichia coli", category: "microbiologica", criterion: "Ausente em 1 g", methodologyShort: "AOAC 991.14", methodologyCitation: "AOAC 991.14 / RDC 724/2022 — Escherichia coli (MPN)" },
      { parameter: "Contagem de Micro-organismos Aeróbios Mesófilos", category: "microbiologica", criterion: "≤ 10³ UFC/g", methodologyShort: "ISO 4833-1", methodologyCitation: "ISO 4833-1 / ABNT NBR — Contagem de micro-organismos aeróbios mesófilos a 30°C" },
      // Teor do Ativo
      { parameter: "EPA (Ácido Eicosapentaenoico)", category: "teor_ativo", criterion: "≥ 80% do valor declarado", methodologyShort: "GC-FID", methodologyCitation: "GC-FID / AOCS Ce 1b-89 — Ésteres metílicos de ácidos graxos (FAME) por cromatografia gasosa" },
      { parameter: "DHA (Ácido Docosahexaenoico)", category: "teor_ativo", criterion: "≥ 80% do valor declarado", methodologyShort: "GC-FID", methodologyCitation: "GC-FID / AOCS Ce 1b-89 — Ésteres metílicos de ácidos graxos (FAME) por cromatografia gasosa" },
      { parameter: "Ômega-3 Total (EPA + DHA)", category: "teor_ativo", criterion: "≥ 80% do valor declarado", methodologyShort: "GC-FID", methodologyCitation: "GC-FID / AOCS Ce 1b-89 — Somatório EPA + DHA por cromatografia gasosa" },
      // Embalagem
      { parameter: "Torque de tampa", category: "embalagem", criterion: "2,0 – 4,5 N·m", methodologyShort: "Torquímetro", methodologyCitation: "Ensaio de torque com torquímetro calibrado — remoção de tampa" },
      { parameter: "Selagem por indução", category: "embalagem", criterion: "Lacre íntegro, sem vazamentos ou danos", methodologyShort: "Visual", methodologyCitation: "Inspeção visual / Teste de pressão positiva" },
      { parameter: "Integridade selagem", category: "embalagem", criterion: "Sem deformação, bolhas ou ruptura", methodologyShort: "Visual", methodologyCitation: "Inspeção visual do lacre indutivo e da embalagem primária" },
    ],
  },
  {
    id: "probiotico_capsula_dura",
    name: "Probiótico — Cápsula Dura",
    description: "Suplemento alimentar de cepas probióticas liofilizadas em cápsula dura (Lactobacillus / Bifidobacterium)",
    params: [
      // Físico-química
      { parameter: "Aparência", category: "fisico_quimica", criterion: "Cápsulas íntegras, pó homogêneo internamente, cor uniforme", methodologyShort: "Visual", methodologyCitation: "Inspeção visual / análise organoléptica" },
      { parameter: "Cor", category: "fisico_quimica", criterion: "Característico (branco a levemente bege)", methodologyShort: "Organoléptico", methodologyCitation: "Análise organoléptica — inspeção visual" },
      { parameter: "Odor", category: "fisico_quimica", criterion: "Característico, sem odor de deterioração", methodologyShort: "Organoléptico", methodologyCitation: "Análise organoléptica" },
      { parameter: "Perda por dessecação", category: "fisico_quimica", criterion: "≤ 5,0%", methodologyShort: "FB 7ª Ed.", methodologyCitation: "Farmacopeia Brasileira 7ª Ed. — Perda por dessecação (105°C, 2h)" },
      { parameter: "Massa média", category: "fisico_quimica", criterion: "Conforme especificação ± 5%", methodologyShort: "FB 7ª Ed.", methodologyCitation: "Farmacopeia Brasileira 7ª Ed. — Determinação de massa média de cápsulas" },
      { parameter: "Dissolução", category: "fisico_quimica", criterion: "≥ 75% em 45 min (aparato Pá, 50 rpm)", methodologyShort: "FB 7ª Ed.", methodologyCitation: "Farmacopeia Brasileira 7ª Ed. — Ensaio de dissolução (Aparato 2 — Pá)" },
      { parameter: "Sódio", category: "fisico_quimica", criterion: "Conforme rotulagem ± 20%", methodologyShort: "AOAC 984.27", methodologyCitation: "AOAC 984.27 — Sódio por ICP-OES / absorção atômica" },
      // Microbiológica
      { parameter: "Salmonella spp. em 10 g", category: "microbiologica", criterion: "Ausente em 10 g", methodologyShort: "AOAC 996.08", methodologyCitation: "AOAC 996.08 / RDC 724/2022 — Salmonella spp. em 10 g" },
      { parameter: "Bolores e leveduras", category: "microbiologica", criterion: "≤ 10² UFC/g", methodologyShort: "AOAC 997.02", methodologyCitation: "AOAC 997.02 / RDC 724/2022 — Contagem de bolores e leveduras" },
      { parameter: "Escherichia coli", category: "microbiologica", criterion: "Ausente em 1 g", methodologyShort: "AOAC 991.14", methodologyCitation: "AOAC 991.14 / RDC 724/2022 — Escherichia coli (MPN)" },
      { parameter: "Contagem de Micro-organismos Aeróbios Mesófilos", category: "microbiologica", criterion: "≤ 10³ UFC/g", methodologyShort: "ISO 4833-1", methodologyCitation: "ISO 4833-1 / ABNT NBR — Contagem de micro-organismos aeróbios mesófilos a 30°C" },
      // Teor do Ativo
      { parameter: "Contagem de UFC — cepa probiótica total", category: "teor_ativo", criterion: "≥ 80% do valor declarado (UFC/cápsula)", methodologyShort: "ISO 19344", methodologyCitation: "ISO 19344 / IDF 232 — Contagem de bactérias probióticas viáveis por qPCR ou plaqueamento seletivo" },
      { parameter: "Viabilidade das cepas (identidade)", category: "teor_ativo", criterion: "Cepas declaradas identificadas e viáveis", methodologyShort: "PCR / Sequenc.", methodologyCitation: "PCR / Sequenciamento 16S rRNA — identificação e confirmação de identidade das cepas" },
      // Embalagem
      { parameter: "Torque de tampa", category: "embalagem", criterion: "2,0 – 4,5 N·m", methodologyShort: "Torquímetro", methodologyCitation: "Ensaio de torque com torquímetro calibrado — remoção de tampa" },
      { parameter: "Selagem por indução", category: "embalagem", criterion: "Lacre íntegro, sem vazamentos ou danos", methodologyShort: "Visual", methodologyCitation: "Inspeção visual / Teste de pressão positiva" },
      { parameter: "Integridade selagem", category: "embalagem", criterion: "Sem deformação, bolhas ou ruptura", methodologyShort: "Visual", methodologyCitation: "Inspeção visual do lacre indutivo e da embalagem primária" },
    ],
  },
  {
    id: "proteina_whey_po",
    name: "Proteína Whey / Vegetal — Pó (Frasco ou Sachê)",
    description: "Suplemento alimentar proteico em pó — Whey Protein (concentrado, isolado ou hidrolisado) ou proteína vegetal",
    params: [
      // Físico-química
      { parameter: "Aparência", category: "fisico_quimica", criterion: "Pó homogêneo, sem grumos, cor uniforme", methodologyShort: "Visual", methodologyCitation: "Inspeção visual / análise organoléptica" },
      { parameter: "Cor", category: "fisico_quimica", criterion: "Característico (branco a levemente amarelado)", methodologyShort: "Organoléptico", methodologyCitation: "Análise organoléptica — inspeção visual" },
      { parameter: "Odor", category: "fisico_quimica", criterion: "Característico, sem odor de deterioração ou rancidez", methodologyShort: "Organoléptico", methodologyCitation: "Análise organoléptica" },
      { parameter: "pH", category: "fisico_quimica", criterion: "6,0 – 7,5 (solução 1%)", methodologyShort: "AOAC 981.12", methodologyCitation: "AOAC 981.12 / Farmacopeia Brasileira 7ª Ed. — Determinação de pH" },
      { parameter: "Umidade", category: "fisico_quimica", criterion: "≤ 5,0%", methodologyShort: "AOAC 934.01", methodologyCitation: "AOAC 934.01 / Farmacopeia Brasileira 7ª Ed. — Umidade por dessecação" },
      { parameter: "Cinzas totais", category: "fisico_quimica", criterion: "≤ 5,0%", methodologyShort: "AOAC 942.05", methodologyCitation: "AOAC 942.05 — Cinzas totais por incineração" },
      { parameter: "Massa média", category: "fisico_quimica", criterion: "Conforme embalagem ± 5%", methodologyShort: "Gravimétrico", methodologyCitation: "Método gravimétrico — pesagem direta (balança analítica)" },
      { parameter: "Kcal", category: "fisico_quimica", criterion: "Conforme rotulagem ± 20%", methodologyShort: "Cálculo Atwater", methodologyCitation: "Cálculo pelos fatores de Atwater / AOAC 2011.25" },
      { parameter: "Sódio", category: "fisico_quimica", criterion: "Conforme rotulagem ± 20%", methodologyShort: "AOAC 984.27", methodologyCitation: "AOAC 984.27 — Sódio por ICP-OES / absorção atômica" },
      // Microbiológica
      { parameter: "Salmonella spp. em 25 g", category: "microbiologica", criterion: "Ausente em 25 g", methodologyShort: "AOAC 996.08", methodologyCitation: "AOAC 996.08 / RDC 724/2022 — Salmonella spp. em 25 g" },
      { parameter: "Bolores e leveduras", category: "microbiologica", criterion: "≤ 10³ UFC/g", methodologyShort: "AOAC 997.02", methodologyCitation: "AOAC 997.02 / RDC 724/2022 — Contagem de bolores e leveduras" },
      { parameter: "Escherichia coli", category: "microbiologica", criterion: "Ausente em 1 g", methodologyShort: "AOAC 991.14", methodologyCitation: "AOAC 991.14 / RDC 724/2022 — Escherichia coli (MPN)" },
      { parameter: "Enterobacteriaceae", category: "microbiologica", criterion: "≤ 10² UFC/g", methodologyShort: "ISO 21528-2", methodologyCitation: "ISO 21528-2 / ABNT NBR — Contagem de Enterobacteriaceae" },
      { parameter: "Estafilococos coagulase positiva por g", category: "microbiologica", criterion: "≤ 10² UFC/g", methodologyShort: "AOAC 975.55", methodologyCitation: "AOAC 975.55 / RDC 724/2022 — Estafilococos coagulase positiva" },
      // Teor do Ativo
      { parameter: "Proteína total", category: "teor_ativo", criterion: "≥ 80% do valor declarado", methodologyShort: "AOAC 990.03", methodologyCitation: "AOAC 990.03 — Proteína total pelo método de Kjeldahl" },
      { parameter: "BCAA total (Leucina + Isoleucina + Valina)", category: "teor_ativo", criterion: "≥ 80% do valor declarado", methodologyShort: "HPLC", methodologyCitation: "HPLC / AOAC 982.30 — Perfil de aminoácidos por cromatografia líquida" },
      // Embalagem
      { parameter: "Torque de tampa", category: "embalagem", criterion: "2,0 – 5,0 N·m", methodologyShort: "Torquímetro", methodologyCitation: "Ensaio de torque com torquímetro calibrado — remoção de tampa" },
      { parameter: "Selagem por indução", category: "embalagem", criterion: "Lacre íntegro, sem vazamentos ou danos", methodologyShort: "Visual", methodologyCitation: "Inspeção visual / Teste de pressão positiva" },
      { parameter: "Integridade selagem", category: "embalagem", criterion: "Sem deformação, bolhas ou ruptura", methodologyShort: "Visual", methodologyCitation: "Inspeção visual do lacre indutivo e da embalagem primária" },
    ],
  },
  {
    id: "vitamina_d_calcio_capsula",
    name: "Vitamina D3 + Cálcio — Cápsula Dura",
    description: "Suplemento alimentar de Vitamina D3 (colecalciferol) e Cálcio (carbonato ou citrato) em cápsula dura",
    params: [
      // Físico-química
      { parameter: "Aparência", category: "fisico_quimica", criterion: "Cápsulas íntegras, pó homogêneo, cor uniforme", methodologyShort: "Visual", methodologyCitation: "Inspeção visual / análise organoléptica" },
      { parameter: "Cor", category: "fisico_quimica", criterion: "Característico (branco a creme)", methodologyShort: "Organoléptico", methodologyCitation: "Análise organoléptica — inspeção visual" },
      { parameter: "Odor", category: "fisico_quimica", criterion: "Característico, inodoro", methodologyShort: "Organoléptico", methodologyCitation: "Análise organoléptica" },
      { parameter: "Perda por dessecação", category: "fisico_quimica", criterion: "≤ 5,0%", methodologyShort: "FB 7ª Ed.", methodologyCitation: "Farmacopeia Brasileira 7ª Ed. — Perda por dessecação (105°C, 2h)" },
      { parameter: "Massa média", category: "fisico_quimica", criterion: "Conforme especificação ± 5%", methodologyShort: "FB 7ª Ed.", methodologyCitation: "Farmacopeia Brasileira 7ª Ed. — Determinação de massa média de cápsulas" },
      { parameter: "Dissolução", category: "fisico_quimica", criterion: "≥ 75% em 45 min (aparato Pá, 50 rpm)", methodologyShort: "FB 7ª Ed.", methodologyCitation: "Farmacopeia Brasileira 7ª Ed. — Ensaio de dissolução (Aparato 2 — Pá)" },
      { parameter: "Cinzas totais", category: "fisico_quimica", criterion: "≤ 40,0% (cálcio carbonato contribui)", methodologyShort: "AOAC 942.05", methodologyCitation: "AOAC 942.05 — Cinzas totais por incineração" },
      { parameter: "Sódio", category: "fisico_quimica", criterion: "Conforme rotulagem ± 20%", methodologyShort: "AOAC 984.27", methodologyCitation: "AOAC 984.27 — Sódio por ICP-OES / absorção atômica" },
      // Microbiológica
      { parameter: "Salmonella spp. em 10 g", category: "microbiologica", criterion: "Ausente em 10 g", methodologyShort: "AOAC 996.08", methodologyCitation: "AOAC 996.08 / RDC 724/2022 — Salmonella spp. em 10 g" },
      { parameter: "Bolores e leveduras", category: "microbiologica", criterion: "≤ 10² UFC/g", methodologyShort: "AOAC 997.02", methodologyCitation: "AOAC 997.02 / RDC 724/2022 — Contagem de bolores e leveduras" },
      { parameter: "Escherichia coli", category: "microbiologica", criterion: "Ausente em 1 g", methodologyShort: "AOAC 991.14", methodologyCitation: "AOAC 991.14 / RDC 724/2022 — Escherichia coli (MPN)" },
      { parameter: "Contagem de Micro-organismos Aeróbios Mesófilos", category: "microbiologica", criterion: "≤ 10³ UFC/g", methodologyShort: "ISO 4833-1", methodologyCitation: "ISO 4833-1 / ABNT NBR — Contagem de micro-organismos aeróbios mesófilos a 30°C" },
      // Teor do Ativo
      { parameter: "Vitamina D3 (Colecalciferol)", category: "teor_ativo", criterion: "≥ 80% do valor declarado", methodologyShort: "HPLC-UV", methodologyCitation: "HPLC-UV / AOAC 995.05 — Vitamina D por cromatografia líquida de alta eficiência" },
      { parameter: "Cálcio", category: "teor_ativo", criterion: "≥ 80% do valor declarado", methodologyShort: "ICP-OES", methodologyCitation: "ICP-OES / AOAC 985.35 — Cálcio por espectrometria de emissão atômica com plasma indutivo" },
      // Embalagem
      { parameter: "Torque de tampa", category: "embalagem", criterion: "2,0 – 4,5 N·m", methodologyShort: "Torquímetro", methodologyCitation: "Ensaio de torque com torquímetro calibrado — remoção de tampa" },
      { parameter: "Selagem por indução", category: "embalagem", criterion: "Lacre íntegro, sem vazamentos ou danos", methodologyShort: "Visual", methodologyCitation: "Inspeção visual / Teste de pressão positiva" },
      { parameter: "Integridade selagem", category: "embalagem", criterion: "Sem deformação, bolhas ou ruptura", methodologyShort: "Visual", methodologyCitation: "Inspeção visual do lacre indutivo e da embalagem primária" },
    ],
  },
  {
    id: "comprimido_revestido_ferro_folico",
    name: "Ferro + Ácido Fólico — Comprimido Revestido",
    description: "Suplemento alimentar de Sulfato Ferroso e Ácido Fólico em comprimido revestido (drágea)",
    params: [
      // Físico-química
      { parameter: "Aparência", category: "fisico_quimica", criterion: "Comprimidos íntegros, revestimento uniforme, sem lascas ou fraturas", methodologyShort: "Visual", methodologyCitation: "Inspeção visual / análise organoléptica" },
      { parameter: "Cor", category: "fisico_quimica", criterion: "Característico (verde a verde-escuro uniforme)", methodologyShort: "Organoléptico", methodologyCitation: "Análise organoléptica — inspeção visual" },
      { parameter: "Odor", category: "fisico_quimica", criterion: "Característico, inodoro ou característico do revestimento", methodologyShort: "Organoléptico", methodologyCitation: "Análise organoléptica" },
      { parameter: "Perda por dessecação", category: "fisico_quimica", criterion: "≤ 5,0%", methodologyShort: "FB 7ª Ed.", methodologyCitation: "Farmacopeia Brasileira 7ª Ed. — Perda por dessecação (105°C, 2h)" },
      { parameter: "Massa média", category: "fisico_quimica", criterion: "Conforme especificação ± 5%", methodologyShort: "FB 7ª Ed.", methodologyCitation: "Farmacopeia Brasileira 7ª Ed. — Determinação de massa média de comprimidos" },
      { parameter: "Dissolução", category: "fisico_quimica", criterion: "≥ 75% em 45 min (aparato Pá, 50 rpm)", methodologyShort: "FB 7ª Ed.", methodologyCitation: "Farmacopeia Brasileira 7ª Ed. — Ensaio de dissolução (Aparato 2 — Pá)" },
      { parameter: "Dureza", category: "fisico_quimica", criterion: "≥ 40 N", methodologyShort: "FB 7ª Ed.", methodologyCitation: "Farmacopeia Brasileira 7ª Ed. — Determinação de dureza de comprimidos" },
      { parameter: "Friabilidade", category: "fisico_quimica", criterion: "≤ 1,5%", methodologyShort: "FB 7ª Ed.", methodologyCitation: "Farmacopeia Brasileira 7ª Ed. — Determinação de friabilidade de comprimidos" },
      { parameter: "Sódio", category: "fisico_quimica", criterion: "Conforme rotulagem ± 20%", methodologyShort: "AOAC 984.27", methodologyCitation: "AOAC 984.27 — Sódio por ICP-OES / absorção atômica" },
      // Microbiológica
      { parameter: "Salmonella spp. em 10 g", category: "microbiologica", criterion: "Ausente em 10 g", methodologyShort: "AOAC 996.08", methodologyCitation: "AOAC 996.08 / RDC 724/2022 — Salmonella spp. em 10 g" },
      { parameter: "Bolores e leveduras", category: "microbiologica", criterion: "≤ 10² UFC/g", methodologyShort: "AOAC 997.02", methodologyCitation: "AOAC 997.02 / RDC 724/2022 — Contagem de bolores e leveduras" },
      { parameter: "Escherichia coli", category: "microbiologica", criterion: "Ausente em 1 g", methodologyShort: "AOAC 991.14", methodologyCitation: "AOAC 991.14 / RDC 724/2022 — Escherichia coli (MPN)" },
      { parameter: "Contagem de Micro-organismos Aeróbios Mesófilos", category: "microbiologica", criterion: "≤ 10³ UFC/g", methodologyShort: "ISO 4833-1", methodologyCitation: "ISO 4833-1 / ABNT NBR — Contagem de micro-organismos aeróbios mesófilos a 30°C" },
      // Teor do Ativo
      { parameter: "Ferro (Sulfato Ferroso)", category: "teor_ativo", criterion: "≥ 80% do valor declarado", methodologyShort: "ICP-OES", methodologyCitation: "ICP-OES / AOAC 985.35 — Ferro por espectrometria de emissão atômica" },
      { parameter: "Ácido Fólico (Vitamina B9)", category: "teor_ativo", criterion: "≥ 80% do valor declarado", methodologyShort: "HPLC", methodologyCitation: "HPLC / AOAC 2004.05 — Ácido Fólico por cromatografia líquida de alta eficiência" },
      // Embalagem
      { parameter: "Torque de tampa", category: "embalagem", criterion: "2,0 – 4,5 N·m", methodologyShort: "Torquímetro", methodologyCitation: "Ensaio de torque com torquímetro calibrado — remoção de tampa" },
      { parameter: "Selagem por indução", category: "embalagem", criterion: "Lacre íntegro, sem vazamentos ou danos", methodologyShort: "Visual", methodologyCitation: "Inspeção visual / Teste de pressão positiva" },
      { parameter: "Integridade selagem", category: "embalagem", criterion: "Sem deformação, bolhas ou ruptura", methodologyShort: "Visual", methodologyCitation: "Inspeção visual do lacre indutivo e da embalagem primária" },
    ],
  },
];

const CATEGORY_PRESETS: Record<string, { parameter: string; criterion: string }[]> = {
  microbiologica: [
    { parameter: "Salmonella spp. em 10 g", criterion: "Ausente em 10 g" },
    { parameter: "Salmonella spp. em 25 g", criterion: "Ausente em 25 g" },
    { parameter: "Bolores e leveduras", criterion: "≤ 10² UFC/g" },
    { parameter: "Escherichia coli", criterion: "Ausente em 1 g" },
    { parameter: "Contagem de Micro-organismos Aeróbios Mesófilos", criterion: "≤ 10³ UFC/g" },
    { parameter: "Enterobacteriaceae", criterion: "≤ 10² UFC/g" },
    { parameter: "Estafilococos coagulase positiva por g", criterion: "≤ 10² UFC/g" },
    { parameter: "Coliformes totais", criterion: "≤ 10² UFC/g" },
    { parameter: "Estafilococos coagulase+", criterion: "≤ 10² UFC/g" },
  ],
  teor_ativo: [
    { parameter: "Cálcio", criterion: "Mín. 80% do valor declarado" },
    { parameter: "Vitamina D", criterion: "Mín. 80% do valor declarado" },
    { parameter: "Vitamina C (Ácido Ascórbico)", criterion: "Mín. 80% do valor declarado" },
    { parameter: "Vitamina E (Tocoferol)", criterion: "Mín. 80% do valor declarado" },
    { parameter: "Vitamina K", criterion: "Mín. 80% do valor declarado" },
    { parameter: "Vitamina A (Retinol)", criterion: "Mín. 80% do valor declarado" },
    { parameter: "Vitamina B1 (Tiamina)", criterion: "Mín. 80% do valor declarado" },
    { parameter: "Vitamina B2 (Riboflavina)", criterion: "Mín. 80% do valor declarado" },
    { parameter: "Vitamina B3 (Niacina)", criterion: "Mín. 80% do valor declarado" },
    { parameter: "Vitamina B5 (Ác. Pantotênico)", criterion: "Mín. 80% do valor declarado" },
    { parameter: "Vitamina B6 (Piridoxina)", criterion: "Mín. 80% do valor declarado" },
    { parameter: "Vitamina B9 (Ác. Fólico)", criterion: "Mín. 80% do valor declarado" },
    { parameter: "Vitamina B12 (Cobalamina)", criterion: "Mín. 80% do valor declarado" },
    { parameter: "Biotina (Vitamina H)", criterion: "Mín. 80% do valor declarado" },
    { parameter: "Magnésio", criterion: "Mín. 80% do valor declarado" },
    { parameter: "Ferro", criterion: "Mín. 80% do valor declarado" },
    { parameter: "Zinco", criterion: "Mín. 80% do valor declarado" },
    { parameter: "Selênio", criterion: "Mín. 80% do valor declarado" },
    { parameter: "Potássio", criterion: "Mín. 80% do valor declarado" },
    { parameter: "Manganês", criterion: "Mín. 80% do valor declarado" },
    { parameter: "Cromo", criterion: "Mín. 80% do valor declarado" },
    { parameter: "Cobre", criterion: "Mín. 80% do valor declarado" },
    { parameter: "Iodo", criterion: "Mín. 80% do valor declarado" },
    { parameter: "Coenzima Q10", criterion: "Mín. 80% do valor declarado" },
    { parameter: "Ômega-3 (EPA+DHA)", criterion: "Mín. 80% do valor declarado" },
    { parameter: "Colágeno Hidrolisado", criterion: "Mín. 80% do valor declarado" },
    { parameter: "Creatina", criterion: "Mín. 80% do valor declarado" },
    { parameter: "Extrato de Cúrcuma", criterion: "Mín. 80% do valor declarado" },
    { parameter: "Extrato de Própolis", criterion: "Mín. 80% do valor declarado" },
    { parameter: "Probióticos (UFC/g)", criterion: "Mín. 80% do valor declarado" },
    { parameter: "Ácido Hialurônico", criterion: "Mín. 80% do valor declarado" },
    { parameter: "Resveratrol", criterion: "Mín. 80% do valor declarado" },
    { parameter: "Extrato de Açaí", criterion: "Mín. 80% do valor declarado" },
    { parameter: "Licopeno", criterion: "Mín. 80% do valor declarado" },
    { parameter: "Luteína", criterion: "Mín. 80% do valor declarado" },
    { parameter: "Zeaxantina", criterion: "Mín. 80% do valor declarado" },
    { parameter: "L-Glutamina", criterion: "Mín. 80% do valor declarado" },
    { parameter: "L-Carnitina", criterion: "Mín. 80% do valor declarado" },
    { parameter: "Beta-Glucana", criterion: "Mín. 80% do valor declarado" },
    { parameter: "Inulina", criterion: "Mín. 80% do valor declarado" },
  ],
};

function ResultsTab({ protocolId, isPowder, initialCustomParamsJson, initialPeriodDatesJson, initialParamMethodsJson, initialParamMethodsCitationsJson, protocolFinalStatus, protocolStatus, initialAtivoLimitsJson, initialKineticsOverridesJson, recommendedKineticsOverages, onAtivoLimitsSync }: { protocolId: number; isPowder?: boolean; initialCustomParamsJson?: string | null; initialPeriodDatesJson?: string | null; initialParamMethodsJson?: string | null; initialParamMethodsCitationsJson?: string | null; protocolFinalStatus?: string | null; protocolStatus?: string | null; initialAtivoLimitsJson?: string | null; initialKineticsOverridesJson?: string | null; recommendedKineticsOverages?: Record<string, number>; onAtivoLimitsSync?: (json: string) => void }) {
  const protocolIsAR = protocolFinalStatus === "aprovado_com_ressalva";
  const isCriterionLocked = protocolFinalStatus != null || protocolStatus === "aprovado" || protocolStatus === "reprovado" || protocolStatus === "aprovado_com_ressalva";
  const [editUnlocked, setEditUnlocked] = useState(false);
  const [overageUndo, setOverageUndo] = useState<{ param: string; prevValue: string } | null>(null);
  const [criterionConfirmPending, setCriterionConfirmPending] = useState<{
    applyFn: (replace: boolean) => void;
    currentCriterion: string; newCriterion: string;
    paramName: string; methodName: string;
  } | null>(null);
  const [paramNameConfirmPending, setParamNameConfirmPending] = useState<{
    onChangeName: () => void;
    onKeepName: () => void;
    currentName: string; newName: string; methodName: string;
  } | null>(null);
  const [templateDialogOpen, setTemplateDialogOpen] = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState<ProductTemplate | null>(null);
  const [clearParamsConfirmOpen, setClearParamsConfirmOpen] = useState(false);
  const { data: lots = [] } = useListLots(protocolId, { query: { queryKey: getListLotsQueryKey(protocolId) } });
  const { data: results = [], isLoading } = useListResults(protocolId, { query: { queryKey: getListResultsQueryKey(protocolId) } });
  const { data: methodologies = [] } = useListMethodologies();
  const { data: ativoRefs = [] } = useListAtivoReferences({ query: { queryKey: getListAtivoReferencesQueryKey(), staleTime: 0 } });
  const { data: kineticsForConf } = useGetKinetics(protocolId, { query: { queryKey: getGetKineticsQueryKey(protocolId), staleTime: 30_000 } });

  // Build T6 map: same merge logic as KineticsTab (API base + DB manual override)
  const kineticT6Map = useMemo<Record<string, string>>(() => {
    let dbParams: Record<string, { t6?: string; manualFields?: string[] }> = {};
    if (initialKineticsOverridesJson) {
      try {
        const db = JSON.parse(initialKineticsOverridesJson) as { params?: Record<string, { t6?: string; manualFields?: string[] }> };
        dbParams = db.params ?? {};
      } catch { /* ignore */ }
    }
    const map: Record<string, string> = {};
    for (const p of kineticsForConf?.parameters ?? []) {
      const dbParam = dbParams[p.parameter];
      const t6 = (dbParam?.manualFields?.includes("t6") && dbParam.t6)
        ? dbParam.t6
        : p.t6 != null ? (p.t6 as number).toFixed(2) : "";
      if (t6) map[p.parameter] = t6;
    }
    return map;
  }, [kineticsForConf, initialKineticsOverridesJson]);

  const [editableParams, setEditableParams] = useState<EditableParam[]>(() => {
    if (initialCustomParamsJson) {
      try { return JSON.parse(initialCustomParamsJson) as EditableParam[]; } catch { /* fall through */ }
    }
    return getDefaultParams(isPowder ?? false);
  });

  const [paramMethods, setParamMethods] = useState<Record<string, string>>(() => {
    if (initialParamMethodsJson) {
      try { return JSON.parse(initialParamMethodsJson); } catch { /* fall through */ }
    }
    try {
      const raw = localStorage.getItem(`param_methods_${protocolId}`);
      return raw ? JSON.parse(raw) : {};
    } catch { return {}; }
  });

  const [paramMethodsCitations, setParamMethodsCitations] = useState<Record<string, string>>(() => {
    if (initialParamMethodsCitationsJson) {
      try { return JSON.parse(initialParamMethodsCitationsJson); } catch { /* fall through */ }
    }
    try {
      const raw = localStorage.getItem(`param_methods_citations_${protocolId}`);
      return raw ? JSON.parse(raw) : {};
    } catch { return {}; }
  });

  // ── Limites ANVISA por ativo (min/max/unidade/declarado) ─────────────────
  const ATIVO_LIMITS_KEY = `ativo_limits_${protocolId}`;
  const [ativoLimits, setAtivoLimitsState] = useState<Record<string, { min: string; max: string; unit: string; declared: string; overage: string; norma: string }>>(() => {
    type LimEntry = { min: string; max: string; unit: string; declared: string; overage: string; norma: string };
    let fromDb: Record<string, LimEntry> = {};
    let fromStorage: Record<string, LimEntry> = {};
    if (initialAtivoLimitsJson) {
      try { fromDb = JSON.parse(initialAtivoLimitsJson); } catch { /* ignore */ }
    }
    try {
      const raw = localStorage.getItem(`ativo_limits_${protocolId}`);
      fromStorage = raw ? JSON.parse(raw) : {};
    } catch { /* ignore */ }
    // Merge: localStorage is the base; DB fields take priority per-field.
    // `declared` and `overage` fall back to localStorage when DB has them empty —
    // prevents data loss when a previous save succeeded in localStorage but not in DB.
    const merged = { ...fromStorage };
    for (const [param, dbLim] of Object.entries(fromDb)) {
      const sl = fromStorage[param];
      merged[param] = {
        min: dbLim.min || sl?.min || "",
        max: dbLim.max || sl?.max || "",
        unit: dbLim.unit || sl?.unit || "mg",
        declared: dbLim.declared || sl?.declared || "",
        overage: dbLim.overage || sl?.overage || "",
        norma: dbLim.norma || sl?.norma || "",
      };
    }
    return merged;
  });
  // Ref used by the one-shot DB-sync effect below.
  const didSyncFromStorageRef = useRef(false);
  // Ref tracking the latest ativoLimits value for debounced DB saves (avoids stale closures).
  const latestAtivoLimitsRef = useRef(ativoLimits);
  latestAtivoLimitsRef.current = ativoLimits;
  // Ref to latest editableParams — lets the bank-sync effect read current params
  // without adding editableParams to its dependency array (which would re-run on every keystroke).
  const editableParamsRef = useRef(editableParams);
  editableParamsRef.current = editableParams;
  // Timer for debounced protocol save when ativoLimitsJson changes.
  const saveAtivoTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const setAtivoLimit = (param: string, field: "min" | "max" | "unit" | "declared" | "overage" | "norma", value: string) => {
    // 1. Compute next state using the always-fresh ref as base.
    const next = {
      ...latestAtivoLimitsRef.current,
      [param]: { ...(latestAtivoLimitsRef.current[param] ?? { min: "", max: "", unit: "mg", declared: "", overage: "", norma: "" }), [field]: value }
    };
    const nextJson = JSON.stringify(next);

    // 2. Update local state + localStorage immediately (for UI responsiveness).
    setAtivoLimitsState(next);
    try { localStorage.setItem(ATIVO_LIMITS_KEY, nextJson); } catch { /* ignore */ }
    // Keep ref in sync so the debounced DB-save picks up the final value.
    latestAtivoLimitsRef.current = next;

    // 3. Propagate to KineticsTab immediately — sem esperar o DB.
    //    Garante que "Valor em mg/mcg (T6)" atualiza no mesmo instante.
    onAtivoLimitsSync?.(nextJson);

    // 4. Debounce the protocol DB save (600 ms after last keystroke).
    //    Moving mutate OUTSIDE setState prevents side effects inside a reducer and
    //    eliminates the HTTP race condition caused by firing a PUT on every keystroke.
    clearTimeout(saveAtivoTimerRef.current);
    saveAtivoTimerRef.current = setTimeout(() => {
      updateProtocol.mutate(
        { id: protocolId, data: { ativoLimitsJson: JSON.stringify(latestAtivoLimitsRef.current) } },
        {
          onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: getGetProtocolQueryKey(protocolId) });
            queryClient.invalidateQueries({ queryKey: getGetCertificateQueryKey(protocolId) });
            queryClient.invalidateQueries({ queryKey: getGetKineticsQueryKey(protocolId) });
          },
          onError: () => {
            toast({
              variant: "destructive",
              title: "Erro ao salvar faixa ANVISA",
              description: "Não foi possível salvar os limites. Verifique sua conexão e tente novamente.",
            });
          },
        }
      );
    }, 600);

    // 3. Debounced upsert to global ativo_references bank (1200 ms after last change per ativo)
    if (field === "min" || field === "max" || field === "unit" || field === "overage" || field === "norma") {
      const existing = bankSyncTimersRef.current[param];
      if (existing) clearTimeout(existing);
      bankSyncTimersRef.current[param] = setTimeout(() => {
        delete bankSyncTimersRef.current[param];
        // Use ref (not captured `next`) to get the value at the time of execution.
        const limit = latestAtivoLimitsRef.current[param];
        const bankEntry = ativoRefs.find(r => r.parameter === param);
        if (bankEntry) {
          updateRef.mutate({
            id: bankEntry.id,
            data: {
              parameter: bankEntry.parameter,
              minValue: limit.min || null,
              maxValue: limit.max || null,
              unit: limit.unit || "mg",
              overage: limit.overage || null,
              source: limit.norma || null,
            },
          }, {
            onSuccess: () => queryClient.invalidateQueries({ queryKey: getListAtivoReferencesQueryKey() }),
          });
        } else if (limit.min || limit.max || limit.overage || limit.norma) {
          createRef.mutate({
            data: {
              parameter: param,
              minValue: limit.min || null,
              maxValue: limit.max || null,
              unit: limit.unit || "mg",
              overage: limit.overage || null,
              source: limit.norma || null,
            },
          }, {
            onSuccess: () => queryClient.invalidateQueries({ queryKey: getListAtivoReferencesQueryKey() }),
          });
        }
      }, 1200);
    }
  };

  // Auto-populate ativoLimits from reference bank. Bank is always source of truth for min/max/unit/overage/norma.
  // Uses latestAtivoLimitsRef so we always read the freshest local state (no stale closure).
  // Also calls onAtivoLimitsSync immediately so KineticsTab updates without waiting for DB round-trip.
  useEffect(() => {
    if (!ativoRefs.length) return;
    const prev = latestAtivoLimitsRef.current;
    let changed = false;
    const next = { ...prev };
    for (const ref of ativoRefs) {
      const existing = prev[ref.parameter] ?? { min: "", max: "", unit: "mg", declared: "", overage: "", norma: "" };
      const updated = {
        min:      ref.minValue != null ? ref.minValue : existing.min,
        max:      ref.maxValue != null ? ref.maxValue : existing.max,
        unit:     ref.unit     != null ? ref.unit     : existing.unit,
        declared: existing.declared, // NEVER overridden by bank
        overage:  ref.overage  != null ? ref.overage  : existing.overage,
        norma:    ref.source   != null ? ref.source   : existing.norma,
      };
      if (
        updated.min     !== existing.min     ||
        updated.max     !== existing.max     ||
        updated.unit    !== existing.unit    ||
        updated.overage !== existing.overage ||
        updated.norma   !== existing.norma
      ) {
        next[ref.parameter] = updated;
        changed = true;
      }
    }
    if (!changed) return;
    const nextJson = JSON.stringify(next);
    setAtivoLimitsState(next);
    try { localStorage.setItem(ATIVO_LIMITS_KEY, nextJson); } catch { /* ignore */ }
    updateProtocol.mutate({ id: protocolId, data: { ativoLimitsJson: nextJson } });
    // Immediately propagate to KineticsTab (via ProtocolDetail state) — no DB round-trip needed.
    onAtivoLimitsSync?.(nextJson);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ativoRefs]);

  // One-shot sync: if the merged initial state (localStorage + DB) has `declared`
  // or `overage` values that weren't in the DB JSON, persist them so the
  // certificate API (server-side) can see them.
  useEffect(() => {
    if (didSyncFromStorageRef.current) return;
    didSyncFromStorageRef.current = true;
    if (Object.keys(ativoLimits).length === 0) return;
    try {
      const fromDb = initialAtivoLimitsJson ? (JSON.parse(initialAtivoLimitsJson) as Record<string, { declared?: string; overage?: string }>) : {};
      const needsSync = Object.entries(ativoLimits).some(([param, lim]) => {
        const dbLim = fromDb[param];
        return !dbLim || (lim.declared && !dbLim.declared) || (lim.overage && !dbLim.overage);
      });
      if (needsSync) {
        try { localStorage.setItem(ATIVO_LIMITS_KEY, JSON.stringify(ativoLimits)); } catch { /* ignore */ }
        updateProtocol.mutate(
          { id: protocolId, data: { ativoLimitsJson: JSON.stringify(ativoLimits) } },
          {
            onSuccess: () => {
              queryClient.invalidateQueries({ queryKey: getGetProtocolQueryKey(protocolId) });
              queryClient.invalidateQueries({ queryKey: getGetCertificateQueryKey(protocolId) });
            },
          }
        );
      }
    } catch { /* ignore */ }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Reference bank management state ───────────────────────────────────────
  type RefForm = { parameter: string; minValue: string; maxValue: string; unit: string; overage: string; source: string; notes: string };
  const emptyRefForm: RefForm = { parameter: "", minValue: "", maxValue: "", unit: "mg", overage: "", source: "", notes: "" };
  const [refBankOpen, setRefBankOpen] = useState(false);
  const [refEditingId, setRefEditingId] = useState<number | null>(null);
  const [refForm, setRefForm] = useState<RefForm>(emptyRefForm);
  const [refSaving, setRefSaving] = useState(false);
  const [pendingDeleteBankRef, setPendingDeleteBankRef] = useState<AtivoReference | null>(null);
  const [bankSearch, setBankSearch] = useState("");

  const createRef = useCreateAtivoReference();
  const updateRef = useUpdateAtivoReference();
  const deleteRef = useDeleteAtivoReference();

  const saveRefForm = async () => {
    setRefSaving(true);
    try {
      const payload = {
        parameter: refForm.parameter.trim(),
        minValue: refForm.minValue || null,
        maxValue: refForm.maxValue || null,
        unit: refForm.unit || "mg",
        overage: refForm.overage || null,
        source: refForm.source || null,
        notes: refForm.notes || null,
      };
      if (refEditingId !== null) {
        await updateRef.mutateAsync({ id: refEditingId, data: payload });
      } else {
        await createRef.mutateAsync({ data: payload });
      }
      queryClient.invalidateQueries({ queryKey: getListAtivoReferencesQueryKey() });

      // Immediately replicate new bank values to this protocol's ativoLimits
      // so the kinetics column recalculates without needing a page reload.
      const param = payload.parameter;
      setAtivoLimitsState(prev => {
        const existing = prev[param];
        if (!existing) return prev; // param not in this protocol — skip
        const next = {
          ...prev,
          [param]: {
            ...existing,
            min: payload.minValue ?? "",
            max: payload.maxValue ?? "",
            unit: payload.unit ?? "mg",
            overage: payload.overage ?? existing.overage ?? "",
            norma: payload.source ?? existing.norma ?? "",
          },
        };
        try { localStorage.setItem(ATIVO_LIMITS_KEY, JSON.stringify(next)); } catch { /* ignore */ }
        updateProtocol.mutate(
          { id: protocolId, data: { ativoLimitsJson: JSON.stringify(next) } },
          {
            onSuccess: () => {
              queryClient.invalidateQueries({ queryKey: getGetProtocolQueryKey(protocolId) });
              queryClient.invalidateQueries({ queryKey: getGetCertificateQueryKey(protocolId) });
              queryClient.invalidateQueries({ queryKey: getGetKineticsQueryKey(protocolId) });
            },
          }
        );
        return next;
      });

      setRefForm(emptyRefForm);
      setRefEditingId(null);
    } finally {
      setRefSaving(false);
    }
  };

  const applyRefToLimit = (ref: AtivoReference) => {
    setAtivoLimitsState(prev => {
      const existing = prev[ref.parameter] ?? { min: "", max: "", unit: "mg", declared: "", overage: "", norma: "" };
      const next = {
        ...prev,
        [ref.parameter]: {
          ...existing,
          min: ref.minValue ?? "",
          max: ref.maxValue ?? "",
          unit: ref.unit ?? "mg",
          overage: ref.overage ?? "",
          norma: ref.source ?? "",
        },
      };
      try { localStorage.setItem(ATIVO_LIMITS_KEY, JSON.stringify(next)); } catch { /* ignore */ }
      updateProtocol.mutate(
        { id: protocolId, data: { ativoLimitsJson: JSON.stringify(next) } },
        { onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: getGetProtocolQueryKey(protocolId) });
            queryClient.invalidateQueries({ queryKey: getGetCertificateQueryKey(protocolId) });
          },
        }
      );
      return next;
    });
  };

  // Immediately saves current form values for a param to the global bank (ativo_references).
  // Cancels any pending debounced sync for the same param first.
  const saveLimitToBank = (param: string) => {
    const limit = latestAtivoLimitsRef.current[param];
    if (!limit) return;
    // Cancel any pending debounced sync so we don't double-save
    const timer = bankSyncTimersRef.current[param];
    if (timer) { clearTimeout(timer); delete bankSyncTimersRef.current[param]; }

    const bankEntry = ativoRefs.find(r => r.parameter === param);
    const payload = {
      parameter: param,
      minValue: limit.min || null,
      maxValue: limit.max || null,
      unit: limit.unit || "mg",
      overage: limit.overage || null,
      source: limit.norma || null,
    };
    if (bankEntry) {
      updateRef.mutate(
        { id: bankEntry.id, data: payload },
        {
          onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: getListAtivoReferencesQueryKey() });
            toast({ title: "✓ Salvo no banco", description: `Faixa de "${param}" atualizada no banco global.`, duration: 2000 });
          },
          onError: () => toast({ variant: "destructive", title: "Erro ao salvar no banco" }),
        }
      );
    } else {
      createRef.mutate(
        { data: payload },
        {
          onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: getListAtivoReferencesQueryKey() });
            toast({ title: "✓ Criado no banco", description: `"${param}" adicionado ao banco global de referências.`, duration: 2000 });
          },
          onError: () => toast({ variant: "destructive", title: "Erro ao criar no banco" }),
        }
      );
    }
  };

  // ── Datas por período (T0, T3, T6) — salvas no DB e localStorage ─────────
  const PERIOD_DATES_KEY = `period_analysis_dates_${protocolId}`;
  const [periodDates, setPeriodDatesState] = useState<Record<number, string>>(() => {
    if (initialPeriodDatesJson) {
      try { return JSON.parse(initialPeriodDatesJson); } catch { /* fall through */ }
    }
    try {
      const raw = localStorage.getItem(`period_analysis_dates_${protocolId}`);
      return raw ? JSON.parse(raw) : {};
    } catch { return {}; }
  });

  const setPeriodDate = useCallback((period: number, date: string) => {
    setPeriodDatesState(prev => {
      const next = { ...prev, [period]: date };
      try { localStorage.setItem(PERIOD_DATES_KEY, JSON.stringify(next)); } catch { /* ignore */ }
      return next;
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [PERIOD_DATES_KEY]);

  // ── Períodos incluídos no certificado (localStorage) ──────────────────────
  const CERT_PERIODS_KEY = `cert_periods_${protocolId}`;
  const [certPeriods, setCertPeriodsState] = useState<number[]>(() => {
    try {
      const raw = localStorage.getItem(`cert_periods_${protocolId}`);
      if (raw) { const p = JSON.parse(raw); if (Array.isArray(p)) return p; }
    } catch { /* ignore */ }
    return [0, 3, 6];
  });
  const toggleCertPeriod = (p: number) => {
    setCertPeriodsState(prev => {
      const next = prev.includes(p) ? prev.filter(x => x !== p) : [...prev, p].sort((a, b) => a - b);
      try { localStorage.setItem(CERT_PERIODS_KEY, JSON.stringify(next)); } catch { /* ignore */ }
      return next;
    });
  };

  const setParamMethod = (paramName: string, shortName: string | null, citation: string | null = null) => {
    setParamMethods((prev) => {
      const next = { ...prev };
      if (shortName === null) {
        delete next[paramName];
      } else {
        next[paramName] = shortName;
      }
      try { localStorage.setItem(`param_methods_${protocolId}`, JSON.stringify(next)); } catch { /* ignore */ }
      return next;
    });
    setParamMethodsCitations((prev) => {
      const next = { ...prev };
      if (citation === null) {
        delete next[paramName];
      } else {
        next[paramName] = citation;
        if (paramName.trim() && shortName) addToCatalog(paramName, shortName, citation);
      }
      try { localStorage.setItem(`param_methods_citations_${protocolId}`, JSON.stringify(next)); } catch { /* ignore */ }
      return next;
    });
  };

  const isMountedParamsRef = useRef(false);
  const updateProtocol = useUpdateProtocol();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  // Undo refs for parameter removal
  const lastRemovedParamRef = useRef<{ param: EditableParam; index: number } | null>(null);
  const undoTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const undoHandlerRef = useRef<() => void>(() => {});
  const bankSyncTimersRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  undoHandlerRef.current = () => {
    if (!lastRemovedParamRef.current) return;
    const { param, index } = lastRemovedParamRef.current;
    lastRemovedParamRef.current = null;
    if (undoTimerRef.current) { clearTimeout(undoTimerRef.current); undoTimerRef.current = null; }
    setEditableParams(prev => {
      const next = [...prev];
      next.splice(index, 0, param);
      const newJson = JSON.stringify(next);
      updateProtocol.mutate({ id: protocolId, data: { customParamsJson: newJson } });
      queryClient.setQueryData(
        getGetProtocolQueryKey(protocolId),
        (old: Record<string, unknown> | undefined) => old ? { ...old, customParamsJson: newJson } : old,
      );
      return next;
    });
    toast({ title: "Parâmetro restaurado", description: param.parameter ? `"${param.parameter}" foi recuperado.` : "Parâmetro recuperado." });
  };
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'z' && lastRemovedParamRef.current) {
        e.preventDefault();
        undoHandlerRef.current();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Refs and hooks for parameter rename → propagate to DB results
  const focusedOriginalName = useRef<string | null>(null);
  const renameUpsert = useUpsertResult({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListResultsQueryKey(protocolId) });
        queryClient.invalidateQueries({ queryKey: getGetKineticsQueryKey(protocolId) });
        queryClient.invalidateQueries({ queryKey: getGetProtocolQueryKey(protocolId) });
      },
      onError: (err: unknown) => {
        const apiMsg = (err as { data?: { error?: string } })?.data?.error;
        toast({ title: "Erro ao salvar", description: apiMsg ?? "Tente novamente.", variant: "destructive" });
      },
    },
  });
  const renameDelete = useDeleteResult({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListResultsQueryKey(protocolId) });
        queryClient.invalidateQueries({ queryKey: getGetKineticsQueryKey(protocolId) });
        queryClient.invalidateQueries({ queryKey: getGetProtocolQueryKey(protocolId) });
        queryClient.invalidateQueries({ queryKey: getGetCertificateQueryKey(protocolId) });
      },
    },
  });

  const renameResultParam = useCallback((oldName: string, newName: string) => {
    if (!oldName.trim() || !newName.trim() || oldName === newName) return;
    const oldResults = results.filter((r) => r.parameter === oldName);
    for (const r of oldResults) {
      // Upsert under new name first, then delete old record
      renameUpsert.mutate({
        id: protocolId,
        data: {
          lotId: r.lotId,
          period: r.period,
          analysisDate: r.analysisDate ?? new Date().toISOString().split("T")[0],
          category: r.category as "fisico_quimica" | "microbiologica" | "teor_ativo" | "embalagem",
          parameter: newName,
          criterion: r.criterion ?? "",
          result: r.result,
          numericResult: r.numericResult ?? undefined,
          status: r.status as "conforme" | "nao_conforme" | "na" | "aprovado_com_ressalva",
        },
      });
      renameDelete.mutate({ id: protocolId, resultId: r.id });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [protocolId, results]);

  useEffect(() => {
    if (!isMountedParamsRef.current) {
      isMountedParamsRef.current = true;
      return;
    }
    const timer = setTimeout(() => {
      updateProtocol.mutate({ id: protocolId, data: { customParamsJson: JSON.stringify(editableParams) } });
    }, 800);
    return () => clearTimeout(timer);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editableParams, protocolId]);

  // ── Hydrate localStorage from DB values on mount (once) ───────────────────
  useEffect(() => {
    if (initialPeriodDatesJson) {
      try { localStorage.setItem(`period_analysis_dates_${protocolId}`, initialPeriodDatesJson); } catch { /* ignore */ }
    }
    if (initialParamMethodsJson) {
      try { localStorage.setItem(`param_methods_${protocolId}`, initialParamMethodsJson); } catch { /* ignore */ }
    }
    if (initialParamMethodsCitationsJson) {
      try { localStorage.setItem(`param_methods_citations_${protocolId}`, initialParamMethodsCitationsJson); } catch { /* ignore */ }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const isMountedPeriodDatesRef = useRef(false);
  const isMountedParamMethodsRef = useRef(false);

  // ── Debounced DB save — period dates ──────────────────────────────────────
  useEffect(() => {
    if (!isMountedPeriodDatesRef.current) {
      isMountedPeriodDatesRef.current = true;
      return;
    }
    const timer = setTimeout(() => {
      updateProtocol.mutate({ id: protocolId, data: { periodDatesJson: JSON.stringify(periodDates) } });
    }, 800);
    return () => clearTimeout(timer);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [periodDates, protocolId]);

  // ── Debounced DB save — param methods + citations ────────────────────────
  useEffect(() => {
    if (!isMountedParamMethodsRef.current) {
      isMountedParamMethodsRef.current = true;
      return;
    }
    const timer = setTimeout(() => {
      updateProtocol.mutate({
        id: protocolId,
        data: {
          paramMethodsJson: JSON.stringify(paramMethods),
          paramMethodsCitationsJson: JSON.stringify(paramMethodsCitations),
        },
      });
    }, 800);
    return () => clearTimeout(timer);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paramMethods, paramMethodsCitations, protocolId]);

  const updateParam = (uid: string, field: "parameter" | "criterion", val: string) => {
    setEditableParams((prev) => prev.map((p) => (p.uid === uid ? { ...p, [field]: val } : p)));
  };

  const addParam = (category: string, parameter = "", criterion = "") => {
    const uid = `${category}_${Date.now()}`;
    const entries = parameter.trim() ? getCatalogEntries(parameter) : [];
    // Auto-fill se houver exatamente uma entrada no catálogo
    const autoEntry = entries.length === 1 ? entries[0] : undefined;
    setEditableParams((prev) => [...prev, {
      uid, parameter, criterion, category,
      methodologyShort: autoEntry?.shortName,
      methodologyCitation: autoEntry?.citation,
    }]);
    if (autoEntry && parameter.trim()) {
      setParamMethods(prev => {
        const next = { ...prev, [parameter]: autoEntry.shortName };
        try { localStorage.setItem(`param_methods_${protocolId}`, JSON.stringify(next)); } catch { /* ignore */ }
        return next;
      });
    }
  };

  const removeParam = (uid: string) => {
    setEditableParams((prev) => {
      const idx = prev.findIndex(p => p.uid === uid);
      const removed = prev[idx];
      const next = prev.filter((p) => p.uid !== uid);
      const newJson = JSON.stringify(next);
      if (undoTimerRef.current) clearTimeout(undoTimerRef.current);
      lastRemovedParamRef.current = { param: removed, index: idx };
      undoTimerRef.current = setTimeout(() => { lastRemovedParamRef.current = null; }, 10000);
      toast({ title: "Parâmetro removido", description: "Pressione Ctrl+Z para desfazer (10s)" });
      updateProtocol.mutate({ id: protocolId, data: { customParamsJson: newJson } });
      queryClient.setQueryData(
        getGetProtocolQueryKey(protocolId),
        (old: Record<string, unknown> | undefined) =>
          old ? { ...old, customParamsJson: newJson } : old,
      );
      // Delete all analysis_results in the DB for this parameter so it stops
      // appearing in the certificate (which reads directly from analysis_results).
      if (removed?.parameter) {
        const paramResults = results.filter((r) => r.parameter === removed.parameter);
        for (const r of paramResults) {
          if (r.id) renameDelete.mutate({ id: protocolId, resultId: r.id });
        }
      }
      return next;
    });
  };

  const [draggingParamUid, setDraggingParamUid] = useState<string | null>(null);
  const [dragOverParamUid, setDragOverParamUid] = useState<string | null>(null);
  const draggingParamRef = useRef<string | null>(null);
  const dragOverParamRef = useRef<string | null>(null);
  const setDraggingParam = (uid: string | null) => { draggingParamRef.current = uid; setDraggingParamUid(uid); };
  const setDragOverParam = (uid: string | null) => { dragOverParamRef.current = uid; setDragOverParamUid(uid); };

  useEffect(() => {
    const onPointerUp = () => {
      const from = draggingParamRef.current;
      const to = dragOverParamRef.current;
      if (from && to && from !== to) {
        setEditableParams(prev => {
          const fromIdx = prev.findIndex(p => p.uid === from);
          const toIdx = prev.findIndex(p => p.uid === to);
          if (fromIdx < 0 || toIdx < 0 || prev[fromIdx].category !== prev[toIdx].category) return prev;
          const next = [...prev];
          const [item] = next.splice(fromIdx, 1);
          next.splice(toIdx, 0, item);
          const newJson = JSON.stringify(next);
          updateProtocol.mutate({ id: protocolId, data: { customParamsJson: newJson } });
          queryClient.setQueryData(
            getGetProtocolQueryKey(protocolId),
            (old: Record<string, unknown> | undefined) => old ? { ...old, customParamsJson: newJson } : old,
          );
          return next;
        });
      }
      setDraggingParam(null);
      setDragOverParam(null);
    };
    window.addEventListener('pointerup', onPointerUp);
    return () => window.removeEventListener('pointerup', onPointerUp);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const getResult = (lotId: number, period: number, parameter: string) =>
    results.find((r) => r.lotId === lotId && r.period === period && r.parameter === parameter);

  const applyTemplate = (template: ProductTemplate) => {
    const now = Date.now();
    const newParams: EditableParam[] = template.params.map((p, i) => ({
      uid: `tpl_${p.category}_${i}_${now}`,
      parameter: p.parameter,
      category: p.category,
      criterion: p.criterion,
    }));
    const newMethods: Record<string, string> = {};
    const newCitations: Record<string, string> = {};
    template.params.forEach(p => {
      if (p.methodologyShort) newMethods[p.parameter] = p.methodologyShort;
      if (p.methodologyCitation) newCitations[p.parameter] = p.methodologyCitation;
    });
    setEditableParams(newParams);
    setParamMethods(newMethods);
    setParamMethodsCitations(newCitations);
    const newParamsJson = JSON.stringify(newParams);
    updateProtocol.mutate({ id: protocolId, data: { customParamsJson: newParamsJson } });
    try { localStorage.setItem(`param_methods_${protocolId}`, JSON.stringify(newMethods)); } catch { /* ignore */ }
    try { localStorage.setItem(`param_methods_citations_${protocolId}`, JSON.stringify(newCitations)); } catch { /* ignore */ }
    setTemplateDialogOpen(false);
    setSelectedTemplate(null);
  };

  const clearParams = () => {
    setEditableParams([]);
    setParamMethods({});
    setParamMethodsCitations({});
    updateProtocol.mutate({ id: protocolId, data: { customParamsJson: "[]" } });
    try { localStorage.setItem(`param_methods_${protocolId}`, "{}"); } catch { /* ignore */ }
    try { localStorage.setItem(`param_methods_citations_${protocolId}`, "{}"); } catch { /* ignore */ }
    setClearParamsConfirmOpen(false);
  };

  if (lots.length === 0) {
    return (
      <div className="text-center py-12 text-muted-foreground border rounded-md">
        Adicione lotes na aba "Lotes" antes de inserir resultados.
      </div>
    );
  }

  if (isLoading) {
    return <div className="text-center py-8 text-muted-foreground">Carregando resultados...</div>;
  }

  const categories = [
    { label: "Fisico-Quimica", key: "fisico_quimica" },
    { label: "Microbiologica", key: "microbiologica" },
    { label: "Teor do Ativo", key: "teor_ativo" },
    { label: "Embalagem", key: "embalagem" },
  ];

  return (
    <div className="space-y-6">
      {/* ── Datas das análises por período ──────────────────────────────────── */}
      <div className="rounded border border-blue-200 bg-blue-50 p-2">
        <p className="text-[11px] font-semibold text-blue-700 mb-1 uppercase tracking-wide">Datas das Análises por Período</p>
        <div className="flex flex-wrap gap-3">
          {PERIODS.map((period) => (
            <label key={period} className="flex items-center gap-1.5 text-xs text-blue-800">
              <span className="font-bold w-5">T{period}</span>
              <input
                type="date"
                value={periodDates[period] ?? ""}
                onChange={e => setPeriodDate(period, e.target.value)}
                className="border border-blue-300 rounded px-1.5 py-0.5 text-xs bg-white focus:outline-none focus:ring-1 focus:ring-blue-400"
              />
            </label>
          ))}
        </div>
      </div>

      {/* ── Períodos no certificado ───────────────────────────────────────────── */}
      <div className="rounded border border-indigo-200 bg-indigo-50 p-2">
        <p className="text-[11px] font-semibold text-indigo-700 mb-0.5 uppercase tracking-wide">Períodos no Certificado de Análise</p>
        <p className="text-[10px] text-indigo-500 mb-1.5">Selecione quais períodos serão exibidos nas datas e no apêndice de fotos do PDF:</p>
        <div className="flex gap-4">
          {PERIODS.map((p) => (
            <label key={p} className="flex items-center gap-1.5 text-xs text-indigo-800 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={certPeriods.includes(p)}
                onChange={() => toggleCertPeriod(p)}
                className="w-3.5 h-3.5 accent-indigo-600 cursor-pointer"
              />
              <span className="font-bold">T{p}m</span>
            </label>
          ))}
        </div>
      </div>

      <div className="flex flex-wrap items-start gap-x-6 gap-y-1">
        <p className="text-xs text-muted-foreground">
          Clique em qualquer célula para digitar o resultado. Use{" "}
          <kbd className="px-1 py-0.5 rounded bg-green-100 border border-green-300 text-green-700 text-xs">C</kbd> = Conforme ·{" "}
          <kbd className="px-1 py-0.5 rounded bg-red-100 border border-red-300 text-red-700 text-xs">NC</kbd> = Não Conforme ·{" "}
          <kbd className="px-1 py-0.5 rounded bg-muted border text-xs">NA</kbd> = Não se aplica ·{" "}
          <kbd className="px-1 py-0.5 rounded bg-blue-100 border border-blue-300 text-blue-700 text-xs">ND</kbd> = Não detectado ·{" "}
          <kbd className="px-1 py-0.5 rounded bg-purple-100 border border-purple-300 text-purple-700 text-xs">LQ</kbd> = Limite de quantificação ·{" "}
          <kbd className="px-1 py-0.5 rounded bg-amber-100 border border-amber-300 text-amber-700 text-xs">AR</kbd> = Aprovado com Ressalva.{" "}
          Confirme com Enter ou OK.
        </p>
        <p className="text-xs text-primary/70 whitespace-nowrap">Parâmetros e critérios são editáveis. Clique para alterar.</p>
      </div>

      {/* ── Template de Produto ──────────────────────────────────────────── */}
      {!isCriterionLocked && (
        <div className="flex items-center justify-between rounded-md border border-amber-200 bg-amber-50 px-3 py-2 gap-3">
          <div className="min-w-0">
            <p className="text-xs font-semibold text-amber-800">📋 Template de Produto</p>
            <p className="text-xs text-amber-600 mt-0.5">
              {editableParams.length > 0
                ? `${editableParams.length} parâmetro(s) carregado(s). Troque o template ou limpe para recomeçar do zero.`
                : "Preencha automaticamente os parâmetros, Especificação e Método para um produto padrão — você só precisa digitar os Resultados."}
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {editableParams.length > 0 && (
              <Button
                size="sm"
                variant="ghost"
                className="text-red-600 hover:bg-red-50 hover:text-red-700 text-xs border border-red-200"
                onClick={() => setClearParamsConfirmOpen(true)}
              >
                Limpar
              </Button>
            )}
            <Button
              size="sm"
              variant="outline"
              className="border-amber-300 text-amber-800 hover:bg-amber-100 text-xs"
              onClick={() => { setSelectedTemplate(null); setTemplateDialogOpen(true); }}
            >
              {editableParams.length > 0 ? "Trocar Template" : "Selecionar Template"}
            </Button>
          </div>
        </div>
      )}

      {/* Template selection dialog */}
      <AlertDialog open={templateDialogOpen} onOpenChange={setTemplateDialogOpen}>
        <AlertDialogContent className="max-w-lg max-h-[90vh] flex flex-col">
          <AlertDialogHeader>
            <AlertDialogTitle>Selecionar Template de Produto</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div>
                <p className="mb-3">Escolha um template para preencher automaticamente os parâmetros, <strong>Especificação</strong> e <strong>Método</strong> de acordo com o produto. Os resultados continuam em branco para preenchimento manual.</p>
                {editableParams.length > 0 && (
                  <p className="text-amber-700 bg-amber-50 border border-amber-200 rounded px-2 py-1.5 text-xs">⚠️ Os {editableParams.length} parâmetros atuais serão substituídos. Resultados já inseridos nos lotes <strong>não</strong> serão apagados.</p>
                )}
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-2 my-1 overflow-y-auto flex-1 pr-1">
            {PRODUCT_TEMPLATES.map(t => (
              <button
                key={t.id}
                onClick={() => setSelectedTemplate(prev => prev?.id === t.id ? null : t)}
                className={`w-full text-left rounded-md border px-3 py-2.5 text-sm transition-colors ${selectedTemplate?.id === t.id ? 'border-primary bg-primary/5 ring-1 ring-primary' : 'border-border hover:bg-muted/60'}`}
              >
                <p className="font-medium text-foreground">{t.name}</p>
                <p className="text-xs text-muted-foreground mt-0.5">{t.description}</p>
                {selectedTemplate?.id === t.id && (
                  <p className="text-xs text-primary font-medium mt-1">✓ {t.params.length} parâmetros · {t.params.filter(p => p.methodologyShort).length} com Método definido</p>
                )}
              </button>
            ))}
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setSelectedTemplate(null)}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              disabled={!selectedTemplate}
              onClick={() => { if (selectedTemplate) applyTemplate(selectedTemplate); }}
              className="bg-amber-600 hover:bg-amber-700 text-white"
            >
              Aplicar Template
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Clear params confirmation */}
      <AlertDialog open={clearParamsConfirmOpen} onOpenChange={setClearParamsConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Limpar todos os parâmetros?</AlertDialogTitle>
            <AlertDialogDescription>
              Isso removerá os {editableParams.length} parâmetros, especificações e métodos configurados. Os resultados já inseridos nos lotes <strong>não</strong> serão apagados. Você poderá adicionar parâmetros manualmente ou aplicar um novo template.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={clearParams} className="bg-red-600 hover:bg-red-700 text-white">
              Sim, limpar tudo
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {categories.map(({ label, key }) => {
        const catParams = editableParams.filter((p) => p.category === key);
        return (
          <div key={key}>
            <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground mb-2">{label}</h3>
            {key === "teor_ativo" && (
              <div className="mb-3 rounded-md border border-indigo-200 bg-indigo-50 p-3">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-xs font-semibold text-indigo-700 uppercase tracking-wide">
                    Faixa de Conformidade por Ativo — ANVISA (RDC 269/2005)
                  </p>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      title="Atualizar página para recarregar todos os dados"
                      onClick={() => window.location.reload()}
                      className="flex items-center gap-1 text-[10px] font-medium text-slate-500 hover:text-slate-700 border border-slate-300 rounded px-2 py-0.5 bg-white hover:bg-slate-50 transition-colors"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                      </svg>
                      Atualizar página
                    </button>
                    <button
                      type="button"
                      onClick={() => setRefBankOpen(o => !o)}
                      className="flex items-center gap-1 text-[10px] font-medium text-indigo-600 hover:text-indigo-800 border border-indigo-300 rounded px-2 py-0.5 bg-white hover:bg-indigo-50 transition-colors"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M4 7h16M4 12h16M4 17h16" />
                      </svg>
                      {refBankOpen ? "Fechar banco" : "Gerenciar banco"}
                      {ativoRefs.length > 0 && (
                        <span className="ml-1 bg-indigo-100 text-indigo-700 rounded-full px-1.5 py-px text-[9px] font-semibold">{ativoRefs.length}</span>
                      )}
                    </button>
                  </div>
                </div>
                <div className="overflow-x-auto">
                  <table className="text-xs w-full">
                    <thead>
                      <tr className="text-indigo-600 font-medium border-b border-indigo-200">
                        <th className="text-left pr-3 pb-1.5">Ativo</th>
                        <th className="text-right pr-2 pb-1.5">Qtd declarada</th>
                        <th className="text-right pr-2 pb-1.5">
                          Overage
                          <span className="block text-[9px] font-normal text-indigo-400 normal-case">% (opcional)</span>
                        </th>
                        <th className="text-right pr-2 pb-1.5">
                          Mín. ANVISA
                          <span className="block text-[9px] font-normal text-indigo-400 normal-case">opcional</span>
                        </th>
                        <th className="text-right pr-2 pb-1.5">
                          Máx. ANVISA
                          <span className="block text-[9px] font-normal text-indigo-400 normal-case">opcional</span>
                        </th>
                        <th className="text-left pr-2 pb-1.5">
                          Norma
                          <span className="block text-[9px] font-normal text-indigo-400 normal-case">salva no banco</span>
                        </th>
                        <th className="text-left pb-1.5 pl-1">Unidade</th>
                        <th className="text-left pb-1.5 pl-2"></th>
                        <th className="text-right pb-1.5 pl-3 border-l border-indigo-200">
                          Conf. T6
                          <span className="block text-[9px] font-normal text-indigo-400 normal-case">média lotes</span>
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {catParams.map(param => {
                        const lim = ativoLimits[param.parameter] ?? { min: "", max: "", unit: "mg", declared: "", overage: "" };
                        const hasMin = !!lim.min;
                        const hasMax = !!lim.max;
                        const bankRef = ativoRefs.find(r => r.parameter === param.parameter);
                        return (
                          <tr key={param.parameter} className="border-t border-indigo-100">
                            <td className="pr-3 py-1 font-medium text-indigo-900 whitespace-nowrap">
                              {param.parameter}
                              {lim.declared && (
                                <span className="block text-[10px] font-normal text-indigo-500">
                                  {hasMin && !hasMax && "só mínimo (≥)"}
                                  {!hasMin && hasMax && "só máximo (≤)"}
                                  {hasMin && hasMax && "min – max"}
                                  {!hasMin && !hasMax && "sem faixa"}
                                </span>
                              )}
                            </td>
                            <td className="pr-2 py-1">
                              <input
                                type="number"
                                step="any"
                                value={lim.declared}
                                onChange={e => setAtivoLimit(param.parameter, "declared", e.target.value)}
                                placeholder="qtd declarada"
                                className="w-24 border border-indigo-200 rounded px-1.5 py-0.5 text-xs focus:outline-none focus:ring-1 focus:ring-indigo-400 text-right bg-white"
                              />
                            </td>
                            <td className="pr-2 py-1">
                              <div className="flex items-center gap-0.5">
                                <input
                                  type="number"
                                  step="any"
                                  min="0"
                                  max="100"
                                  value={lim.overage}
                                  onChange={e => setAtivoLimit(param.parameter, "overage", e.target.value)}
                                  placeholder="0"
                                  title="Overage (%): quantidade extra adicionada na manufatura para garantir o teor mínimo ao final do prazo de validade"
                                  className="w-16 border border-amber-300 rounded px-1.5 py-0.5 text-xs focus:outline-none focus:ring-1 focus:ring-amber-400 text-right bg-amber-50"
                                />
                                <span className="text-[10px] text-amber-600 font-medium">%</span>
                              </div>
                              {lim.overage && lim.declared && (() => {
                                const d = parseFloat(lim.declared.replace(",", "."));
                                const o = parseFloat(lim.overage.replace(",", "."));
                                if (!isNaN(d) && !isNaN(o) && o > 0) {
                                  const mfg = d * (1 + o / 100);
                                  return (
                                    <span className="block text-[9px] text-amber-600 text-right mt-0.5" title="Qtd manufaturada = declarada × (1 + overage%)">
                                      Mfg: {mfg % 1 === 0 ? mfg : mfg.toFixed(2)} {lim.unit}
                                    </span>
                                  );
                                }
                                return null;
                              })()}
                              {/* Recomendação automática de overage calculada pela aba Cinética */}
                              {(() => {
                                const rec = (recommendedKineticsOverages ?? {})[param.parameter];
                                if (rec == null) return null;
                                const currentOvg = lim.overage ? parseFloat(lim.overage.replace(",", ".")) : 0;
                                if (rec === 0) {
                                  return (
                                    <span className="block text-[9px] text-green-600 mt-0.5 text-right">
                                      ✓ sem overage necessário
                                    </span>
                                  );
                                }
                                if (!isNaN(currentOvg) && currentOvg >= rec) {
                                  return (
                                    <span className="block text-[9px] text-green-600 mt-0.5 text-right">
                                      ✓ +{currentOvg}% suficiente
                                    </span>
                                  );
                                }
                                return (
                                  <>
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setOverageUndo({ param: param.parameter, prevValue: lim.overage ?? "" });
                                        setAtivoLimit(param.parameter, "overage", rec.toFixed(1));
                                      }}
                                      className="mt-0.5 text-[9px] px-1.5 py-0.5 rounded border border-amber-400 bg-amber-50 text-amber-800 hover:bg-amber-100 font-semibold transition-colors whitespace-nowrap block ml-auto"
                                      title={`Cinética recomenda +${rec}% de overage para garantir o mínimo ao fim da validade adotada`}
                                    >
                                      ↑ aplicar +{rec}%
                                    </button>
                                    {overageUndo?.param === param.parameter && (
                                      <button
                                        type="button"
                                        onClick={() => {
                                          setAtivoLimit(overageUndo.param, "overage", overageUndo.prevValue);
                                          setOverageUndo(null);
                                        }}
                                        className="mt-0.5 text-[9px] px-1.5 py-0.5 rounded border border-slate-300 bg-white text-slate-600 hover:bg-slate-50 font-semibold transition-colors whitespace-nowrap block ml-auto"
                                        title="Desfazer — voltar ao overage anterior"
                                      >
                                        ↩ desfazer
                                      </button>
                                    )}
                                  </>
                                );
                              })()}
                            </td>
                            <td className="pr-2 py-1">
                              <input
                                type="text"
                                value={lim.min}
                                onChange={e => setAtivoLimit(param.parameter, "min", e.target.value)}
                                placeholder="livre"
                                className={`w-24 border rounded px-1.5 py-0.5 text-xs focus:outline-none focus:ring-1 text-right bg-white ${
                                  hasMin
                                    ? "border-indigo-300 focus:ring-indigo-400"
                                    : "border-dashed border-indigo-200 text-indigo-300 focus:ring-indigo-300"
                                }`}
                              />
                            </td>
                            <td className="pr-2 py-1">
                              <input
                                type="text"
                                value={lim.max}
                                onChange={e => setAtivoLimit(param.parameter, "max", e.target.value)}
                                placeholder="livre"
                                className={`w-24 border rounded px-1.5 py-0.5 text-xs focus:outline-none focus:ring-1 text-right bg-white ${
                                  hasMax
                                    ? "border-indigo-300 focus:ring-indigo-400"
                                    : "border-dashed border-indigo-200 text-indigo-300 focus:ring-indigo-300"
                                }`}
                              />
                            </td>
                            <td className="pr-2 py-1">
                              <input
                                type="text"
                                value={lim.norma ?? ""}
                                onChange={e => setAtivoLimit(param.parameter, "norma", e.target.value)}
                                placeholder="ex: IN 28/2018"
                                title="Norma de referência ANVISA (salva no banco do composto)"
                                className="w-28 border border-violet-200 rounded px-1.5 py-0.5 text-xs focus:outline-none focus:ring-1 focus:ring-violet-400 bg-violet-50 placeholder:text-violet-300"
                              />
                            </td>
                            <td className="py-1 pl-1">
                              <select
                                value={lim.unit}
                                onChange={e => setAtivoLimit(param.parameter, "unit", e.target.value)}
                                className="border border-indigo-200 rounded px-1.5 py-0.5 text-xs focus:outline-none focus:ring-1 focus:ring-indigo-400 bg-white"
                              >
                                <option value="mg">mg</option>
                                <option value="mcg">mcg</option>
                                <option value="UI">UI</option>
                                <option value="UFC/g">UFC/g</option>
                                <option value="g">g</option>
                              </select>
                            </td>
                            <td className="py-1 pl-2">
                              {(lim.min || lim.max || lim.norma || lim.unit !== "mg") ? (
                                <button
                                  type="button"
                                  title="Salvar estes valores no banco global de referências ANVISA"
                                  onClick={() => saveLimitToBank(param.parameter)}
                                  disabled={updateRef.isPending || createRef.isPending}
                                  className="text-[10px] px-1.5 py-0.5 rounded border border-indigo-300 bg-white text-indigo-600 hover:bg-indigo-100 hover:text-indigo-800 transition-colors whitespace-nowrap disabled:opacity-40"
                                >
                                  ↩ banco
                                </button>
                              ) : (
                                <span className="text-[10px] text-indigo-200">—</span>
                              )}
                            </td>
                            {/* ── Conf. T6: avgT6% × Mfg vs spec (T6 from kinetics) ── */}
                            {(() => {
                              const declaredNum = parseFloat(lim.declared.replace(",", "."));
                              const overagePct = lim.overage ? parseFloat(lim.overage.replace(",", ".")) : 0;
                              const minNum = lim.min ? parseFloat(lim.min.replace(",", ".")) : null;
                              const maxNum = lim.max ? parseFloat(lim.max.replace(",", ".")) : null;
                              if (!lim.declared || isNaN(declaredNum)) {
                                return (
                                  <td className="py-1 pl-3 border-l border-indigo-100 text-right">
                                    <span className="text-[10px] text-indigo-200">—</span>
                                  </td>
                                );
                              }
                              // Use the already-computed T6 average from the kinetics tab
                              // (same value shown in "Média T6 (%)" — includes manual overrides)
                              const kT6Str = kineticT6Map[param.parameter];
                              if (!kT6Str) {
                                return (
                                  <td className="py-1 pl-3 border-l border-indigo-100 text-right">
                                    <span className="text-[10px] text-indigo-300 italic">sem T6</span>
                                  </td>
                                );
                              }
                              const avgT6 = parseFloat(kT6Str);
                              if (isNaN(avgT6)) {
                                return (
                                  <td className="py-1 pl-3 border-l border-indigo-100 text-right">
                                    <span className="text-[10px] text-indigo-300 italic">sem T6</span>
                                  </td>
                                );
                              }
                              const hasOvg = !isNaN(overagePct) && overagePct > 0;
                              const mfg = hasOvg ? declaredNum * (1 + overagePct / 100) : declaredNum;
                              const effectiveQty = (avgT6 / 100) * mfg;
                              // Regra 1: fora da faixa ANVISA (min/max cadastrada)
                              const belowMin = minNum !== null && effectiveQty < minNum - 0.005;
                              const aboveMax = maxNum !== null && effectiveQty > maxNum + 0.005;
                              const hasSpec = minNum !== null || maxNum !== null;
                              // Regra 2: não pode cair mais de 20% abaixo do declarado (< 80% do declarado)
                              const limit80 = declaredNum * 0.80;
                              const below80 = effectiveQty < limit80 - 0.005;
                              const isOk = !belowMin && !aboveMax && !below80;
                              const failReason = belowMin
                                ? "✗ abaixo do mín ANVISA"
                                : aboveMax
                                ? "✗ acima do máx ANVISA"
                                : below80
                                ? "✗ < 80% do declarado"
                                : "";
                              const tooltipParts = [
                                `Média T6 (cinética): ${avgT6.toFixed(2)}%`,
                                hasOvg
                                  ? `Base Mfg = ${declaredNum} × (1 + ${overagePct}%) = ${mfg.toFixed(3)} ${lim.unit}`
                                  : `Base = ${declaredNum} ${lim.unit}`,
                                `Efetivo T6 = ${avgT6.toFixed(2)}% × ${mfg.toFixed(3)} = ${effectiveQty.toFixed(3)} ${lim.unit}`,
                                `Limite 80% declarado: ${limit80.toFixed(3)} ${lim.unit}`,
                                minNum !== null ? `Mín ANVISA: ${minNum} ${lim.unit}` : "",
                                maxNum !== null ? `Máx ANVISA: ${maxNum} ${lim.unit}` : "",
                              ].filter(Boolean).join("\n");
                              return (
                                <td className="py-1 pl-3 border-l border-indigo-100 text-right" title={tooltipParts}>
                                  <div className="flex flex-col items-end gap-0.5">
                                    <span className={`text-[10px] font-semibold ${isOk ? "text-emerald-700" : "text-red-600"}`}>
                                      {effectiveQty.toFixed(2)} {lim.unit}
                                    </span>
                                    <span className="text-[9px] text-slate-400">
                                      {avgT6.toFixed(1)}%{hasOvg ? ` × Mfg` : ""} · ≥{limit80.toFixed(1)}
                                    </span>
                                    <span className={`text-[9px] font-bold ${isOk ? "text-emerald-600" : "text-red-600"}`}>
                                      {isOk ? "✓ Aprovado" : failReason}
                                    </span>
                                  </div>
                                </td>
                              );
                            })()}
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                <p className="text-[10px] text-indigo-500 mt-2">
                  ✓ Salvo automaticamente. Os limites são usados na aba Cinética para calcular o valor em mg/mcg e alertar quando fora da faixa ANVISA. Use "↩ banco" para restaurar o valor padrão cadastrado.
                </p>

                {/* ── Banco de Referências — CRUD ───────────────────────── */}
                {refBankOpen && (
                  <div className="mt-3 border-t border-indigo-200 pt-3">
                    <p className="text-xs font-semibold text-indigo-700 mb-2">Banco de Referências de Limites</p>

                    {/* Form */}
                    <div className="bg-white border border-indigo-200 rounded p-2 mb-3">
                      <p className="text-[10px] font-semibold text-indigo-600 uppercase tracking-wide mb-1.5">
                        {refEditingId !== null ? "Editar entrada" : "Nova entrada"}
                      </p>
                      <div className="flex flex-wrap gap-2 items-end">
                        <div className="flex flex-col gap-0.5">
                          <label className="text-[9px] text-indigo-500 uppercase">Ativo *</label>
                          <input
                            value={refForm.parameter}
                            onChange={e => setRefForm(f => ({ ...f, parameter: e.target.value }))}
                            placeholder="ex: Cálcio"
                            className="border border-indigo-200 rounded px-1.5 py-0.5 text-xs focus:outline-none focus:ring-1 focus:ring-indigo-400 w-36"
                          />
                        </div>
                        <div className="flex flex-col gap-0.5">
                          <label className="text-[9px] text-indigo-500 uppercase">Mín. (opcional)</label>
                          <input
                            type="text"
                            value={refForm.minValue}
                            onChange={e => setRefForm(f => ({ ...f, minValue: e.target.value }))}
                            placeholder="livre"
                            className="border border-indigo-200 rounded px-1.5 py-0.5 text-xs focus:outline-none focus:ring-1 focus:ring-indigo-400 w-20 text-right"
                          />
                        </div>
                        <div className="flex flex-col gap-0.5">
                          <label className="text-[9px] text-indigo-500 uppercase">Máx. (opcional)</label>
                          <input
                            type="text"
                            value={refForm.maxValue}
                            onChange={e => setRefForm(f => ({ ...f, maxValue: e.target.value }))}
                            placeholder="livre"
                            className="border border-indigo-200 rounded px-1.5 py-0.5 text-xs focus:outline-none focus:ring-1 focus:ring-indigo-400 w-20 text-right"
                          />
                        </div>
                        <div className="flex flex-col gap-0.5">
                          <label className="text-[9px] text-indigo-500 uppercase">Unidade</label>
                          <select
                            value={refForm.unit}
                            onChange={e => setRefForm(f => ({ ...f, unit: e.target.value }))}
                            className="border border-indigo-200 rounded px-1.5 py-0.5 text-xs focus:outline-none focus:ring-1 focus:ring-indigo-400"
                          >
                            <option value="mg">mg</option>
                            <option value="mcg">mcg</option>
                            <option value="UI">UI</option>
                            <option value="UFC/g">UFC/g</option>
                            <option value="g">g</option>
                          </select>
                        </div>
                        <div className="flex flex-col gap-0.5">
                          <label className="text-[9px] text-amber-600 uppercase font-semibold">Overage %</label>
                          <div className="flex items-center gap-0.5">
                            <input
                              type="number"
                              step="any"
                              min="0"
                              max="100"
                              value={refForm.overage}
                              onChange={e => setRefForm(f => ({ ...f, overage: e.target.value }))}
                              placeholder="0"
                              title="Overage (%)"
                              className="border border-amber-300 rounded px-1.5 py-0.5 text-xs focus:outline-none focus:ring-1 focus:ring-amber-400 w-16 text-right bg-amber-50"
                            />
                            <span className="text-[10px] text-amber-600">%</span>
                          </div>
                        </div>
                        <div className="flex flex-col gap-0.5">
                          <label className="text-[9px] text-violet-600 uppercase font-semibold">Norma de referência</label>
                          <input
                            value={refForm.source}
                            onChange={e => setRefForm(f => ({ ...f, source: e.target.value }))}
                            placeholder="ex: IN 28/2018, RDC 269/2005"
                            className="border border-violet-300 rounded px-1.5 py-0.5 text-xs focus:outline-none focus:ring-1 focus:ring-violet-400 w-44 bg-violet-50"
                          />
                        </div>
                        <div className="flex flex-col gap-0.5">
                          <label className="text-[9px] text-indigo-500 uppercase">Observações</label>
                          <input
                            value={refForm.notes}
                            onChange={e => setRefForm(f => ({ ...f, notes: e.target.value }))}
                            placeholder="observações livres..."
                            className="border border-indigo-200 rounded px-1.5 py-0.5 text-xs focus:outline-none focus:ring-1 focus:ring-indigo-400 w-40"
                          />
                        </div>
                        <div className="flex gap-1 items-end">
                          <button
                            type="button"
                            disabled={!refForm.parameter.trim() || refSaving}
                            onClick={saveRefForm}
                            className="px-3 py-0.5 rounded bg-indigo-600 text-white text-xs font-medium hover:bg-indigo-700 disabled:opacity-40 transition-colors"
                          >
                            {refSaving ? "Salvando…" : refEditingId !== null ? "Atualizar" : "Adicionar"}
                          </button>
                          {refEditingId !== null && (
                            <button
                              type="button"
                              onClick={() => { setRefForm(emptyRefForm); setRefEditingId(null); }}
                              className="px-2 py-0.5 rounded border border-indigo-200 text-indigo-600 text-xs hover:bg-indigo-50 transition-colors"
                            >
                              Cancelar
                            </button>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* List */}
                    {ativoRefs.length === 0 ? (
                      <p className="text-[10px] text-indigo-400 italic">Nenhuma entrada cadastrada ainda.</p>
                    ) : (
                      <div className="overflow-x-auto">
                        {/* Search */}
                        <div className="relative mb-2">
                          <svg className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-indigo-400 pointer-events-none" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                            <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
                          </svg>
                          <input
                            type="text"
                            value={bankSearch}
                            onChange={e => setBankSearch(e.target.value)}
                            placeholder="Buscar ativo…"
                            className="w-full pl-6 pr-2 py-0.5 text-xs border border-indigo-200 rounded focus:outline-none focus:ring-1 focus:ring-indigo-400 bg-white"
                          />
                          {bankSearch && (
                            <button
                              type="button"
                              onClick={() => setBankSearch("")}
                              className="absolute right-1.5 top-1/2 -translate-y-1/2 text-indigo-300 hover:text-indigo-500 text-xs leading-none"
                            >✕</button>
                          )}
                        </div>
                        <table className="text-xs w-full">
                          <thead>
                            <tr className="text-indigo-500 font-medium border-b border-indigo-100">
                              <th className="text-left pr-3 pb-1">Ativo</th>
                              <th className="text-right pr-2 pb-1">Mín.</th>
                              <th className="text-right pr-2 pb-1">Máx.</th>
                              <th className="text-left pr-2 pb-1">Unidade</th>
                              <th className="text-right pr-2 pb-1 text-amber-500">Overage</th>
                              <th className="text-left pr-2 pb-1 text-violet-600">Norma</th>
                              <th className="text-left pb-1">Observações</th>
                              <th className="pb-1"></th>
                            </tr>
                          </thead>
                          <tbody>
                            {ativoRefs
                              .filter(r => !bankSearch.trim() || r.parameter.toLowerCase().includes(bankSearch.trim().toLowerCase()))
                              .map(ref => (
                              <tr key={ref.id} className="border-t border-indigo-50 hover:bg-indigo-50/40">
                                <td className="pr-3 py-1 font-medium text-indigo-900 whitespace-nowrap">{ref.parameter}</td>
                                <td className="pr-2 py-1 text-right text-indigo-700">{ref.minValue ?? "—"}</td>
                                <td className="pr-2 py-1 text-right text-indigo-700">{ref.maxValue ?? "—"}</td>
                                <td className="pr-2 py-1 text-indigo-600">{ref.unit}</td>
                                <td className="pr-2 py-1 text-right">
                                  {ref.overage ? (
                                    <span className="text-amber-600 font-medium text-[10px]">{ref.overage}%</span>
                                  ) : (
                                    <span className="text-indigo-200 text-[10px]">—</span>
                                  )}
                                </td>
                                <td className="pr-2 py-1 text-violet-700 text-[10px] max-w-[140px] truncate font-medium" title={ref.source ?? ""}>
                                  {ref.source ?? <span className="text-indigo-200">—</span>}
                                </td>
                                <td className="py-1 text-indigo-400 text-[10px] max-w-[120px] truncate">{ref.notes ?? ""}</td>
                                <td className="py-1 pl-2 flex gap-1 whitespace-nowrap">
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setRefEditingId(ref.id);
                                      setRefForm({
                                        parameter: ref.parameter,
                                        minValue: ref.minValue ?? "",
                                        maxValue: ref.maxValue ?? "",
                                        unit: ref.unit ?? "mg",
                                        overage: ref.overage ?? "",
                                        source: ref.source ?? "",
                                        notes: ref.notes ?? "",
                                      });
                                    }}
                                    className="text-[10px] px-1.5 py-0.5 rounded border border-indigo-200 text-indigo-600 hover:bg-indigo-100 transition-colors"
                                  >
                                    Editar
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => setPendingDeleteBankRef(ref)}
                                    className="text-[10px] px-1.5 py-0.5 rounded border border-red-200 text-red-500 hover:bg-red-50 transition-colors"
                                  >
                                    Remover
                                  </button>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                )}

                {/* Master password dialog for bank delete */}
                <UnlockDialog
                  open={pendingDeleteBankRef !== null}
                  onOpenChange={open => { if (!open) setPendingDeleteBankRef(null); }}
                  onUnlock={async (password) => {
                    try {
                      const res = await fetch("/api/auth/verify", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ password }),
                      });
                      if (res.ok) return { ok: true };
                      const body = await res.json().catch(() => ({})) as { error?: string };
                      return { ok: false, error: body.error ?? "Senha incorreta." };
                    } catch {
                      return { ok: false, error: "Erro de conexão." };
                    }
                  }}
                  onSuccess={async () => {
                    if (!pendingDeleteBankRef) return;
                    await deleteRef.mutateAsync({ id: pendingDeleteBankRef.id });
                    queryClient.invalidateQueries({ queryKey: getListAtivoReferencesQueryKey() });
                    if (refEditingId === pendingDeleteBankRef.id) {
                      setRefForm(emptyRefForm);
                      setRefEditingId(null);
                    }
                    setPendingDeleteBankRef(null);
                  }}
                  title="Confirmar exclusão"
                  description={`Remover "${pendingDeleteBankRef?.parameter}" do banco de limites? Esta ação não pode ser desfeita. Digite a senha mestra para confirmar.`}
                  submitLabel="Confirmar exclusão"
                />
              </div>
            )}
            <div className="rounded-md border overflow-x-auto">
              <Table style={{ minWidth: 680 }}>
                <TableHeader>
                  <TableRow className="bg-muted">
                    <TableHead className="w-36 text-xs sticky left-0 z-20 bg-muted border-r border-border/60">Parâmetro</TableHead>
                    <TableHead className="w-40 text-xs sticky left-36 z-20 bg-muted border-r border-border/60">
                      {key === "teor_ativo" ? "% de aceitação da matéria prima" : "Critérios de Aceitação"}
                    </TableHead>
                    <TableHead className="w-6 text-xs sticky left-[19rem] z-20 bg-muted border-r border-border/40"></TableHead>
                    <TableHead className="text-xs text-center font-semibold border-l border-border/30 w-20">Lote</TableHead>
                    {PERIODS.map((period) => (
                      <TableHead
                        key={period}
                        className="text-xs text-center font-semibold whitespace-nowrap px-1 py-1.5 border-l border-border/30 w-24"
                      >
                        T{period}m
                      </TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {catParams.map((param) => {
                    const rowHasNonConforming = !protocolIsAR && results.some(
                      (r) => r.parameter === param.parameter && r.status === "nao_conforme",
                    );
                    const rowHasAR = protocolIsAR && results.some(
                      (r) => r.parameter === param.parameter && r.status === "nao_conforme",
                    );
                    const stickyBg = rowHasNonConforming
                      ? "bg-red-50"
                      : rowHasAR
                      ? "bg-amber-50"
                      : "bg-background";
                    const rowClass = rowHasNonConforming ? "bg-red-50 hover:bg-red-100" : rowHasAR ? "bg-amber-50 hover:bg-amber-100" : "";
                    return lots.map((lot, lotIdx) => (
                      <TableRow
                        key={`${param.uid}-${lot.id}`}
                        data-testid={lotIdx === 0 ? `row-param-${param.parameter}` : undefined}
                        className={rowClass}
                      >
                        {/* Param + criterion + delete cells only on first lot row */}
                        {lotIdx === 0 && (
                          <>
                            <TableCell
                              rowSpan={lots.length}
                              className={`py-1 pr-1 sticky left-0 z-10 border-r border-border/60 align-top transition-colors ${stickyBg}${dragOverParamUid === param.uid && draggingParamUid !== param.uid ? ' border-t-2 border-t-primary' : ''}`}
                              onPointerEnter={() => { if (draggingParamUid && draggingParamUid !== param.uid) setDragOverParam(param.uid); }}
                            >
                              <div className="flex items-start gap-1">
                                <div
                                  className={`cursor-grab active:cursor-grabbing touch-none mt-0.5 text-muted-foreground/30 hover:text-primary p-0.5 transition-colors select-none${draggingParamUid === param.uid ? ' opacity-30' : ''}`}
                                  onPointerDown={(e) => { e.preventDefault(); setDraggingParam(param.uid); }}
                                  title="Arrastar para reordenar"
                                >
                                  <GripVertical className="h-3.5 w-3.5" />
                                </div>
                                <div className="flex-1 min-w-0">
                                  <input
                                    value={param.parameter}
                                    onChange={(e) => updateParam(param.uid, "parameter", e.target.value)}
                                    onFocus={() => { focusedOriginalName.current = param.parameter; }}
                                    onBlur={() => {
                                      const orig = focusedOriginalName.current;
                                      focusedOriginalName.current = null;
                                      if (orig !== null && orig !== param.parameter && param.parameter.trim()) {
                                        renameResultParam(orig, param.parameter);
                                      }
                                    }}
                                    autoComplete="new-password"
                                    autoCorrect="off"
                                    autoCapitalize="off"
                                    spellCheck={false}
                                    data-form-type="other"
                                    data-lpignore="true"
                                    className="w-full text-xs font-medium bg-transparent border-b border-dashed border-transparent hover:border-muted-foreground/30 focus:border-primary focus:outline-none py-0.5 placeholder:text-muted-foreground/40"
                                    placeholder="Nome do parâmetro"
                                  />
                                  <ParamMethodSelector
                                    paramName={param.parameter}
                                    selected={paramMethods[param.parameter] ?? null}
                                    methodologies={methodologies}
                                    catalogEntries={getCatalogEntries(param.parameter)}
                                    onSelect={(s, c) => {
                                      const libEntry = s ? methodologies.find(m => m.shortName === s) : undefined;
                                      const libParam = (libEntry as (typeof libEntry & { parameter?: string | null }) | undefined)?.parameter ?? null;
                                      const libCriteria = (libEntry as (typeof libEntry & { criteria?: string | null }) | undefined)?.criteria ?? null;

                                      const _fallbackName = param.parameter || (s ? (getParamsForMethodology(s)[0]?.paramName ?? "") : "");
                                      const finalName = libParam ?? _fallbackName;

                                      // Nome e critério que a metodologia traria
                                      const revMatches = s && !libParam ? getParamsForMethodology(s) : [];
                                      const newParamName = libParam ?? (revMatches.length === 1 ? revMatches[0].paramName : null);
                                      const nameWouldChange = !!(newParamName && newParamName !== param.parameter && param.parameter.trim() !== "");

                                      let pendingCrit: string | null = null;
                                      if (s) {
                                        if (libCriteria) pendingCrit = libCriteria;
                                        else if (!libParam && revMatches.length === 1 && revMatches[0].criterion) pendingCrit = revMatches[0].criterion;
                                      }

                                      const doApply = (replaceCriterion: boolean, changeName: boolean) => {
                                        if (s) {
                                          if (libParam) {
                                            if (changeName) updateParam(param.uid, "parameter", libParam);
                                          } else {
                                            if (revMatches.length === 1) {
                                              if (changeName) updateParam(param.uid, "parameter", revMatches[0].paramName);
                                              if (replaceCriterion) updateParam(param.uid, "criterion", revMatches[0].criterion);
                                            }
                                          }
                                          if (libCriteria && replaceCriterion) updateParam(param.uid, "criterion", libCriteria);
                                        }
                                        setParamMethod(finalName, s, c);
                                      };

                                      const existCrit = param.criterion.trim();
                                      const handleAfterNameDecision = (changeName: boolean) => {
                                        if (pendingCrit && existCrit && pendingCrit !== existCrit) {
                                          setCriterionConfirmPending({ applyFn: (rc) => doApply(rc, changeName), currentCriterion: existCrit, newCriterion: pendingCrit, paramName: param.parameter, methodName: s ?? "" });
                                        } else {
                                          doApply(true, changeName);
                                        }
                                      };

                                      if (nameWouldChange) {
                                        setParamNameConfirmPending({ onChangeName: () => handleAfterNameDecision(true), onKeepName: () => handleAfterNameDecision(false), currentName: param.parameter, newName: newParamName!, methodName: s ?? "" });
                                      } else {
                                        handleAfterNameDecision(true);
                                      }
                                    }}
                                  />
                                </div>
                              </div>
                            </TableCell>
                            <TableCell
                              rowSpan={lots.length}
                              className={`py-1 pr-1 sticky left-36 z-10 border-r border-border/60 align-top ${stickyBg}`}
                            >
                              <input
                                value={param.criterion}
                                onChange={(e) => !isCriterionLocked && updateParam(param.uid, "criterion", e.target.value)}
                                readOnly={isCriterionLocked}
                                autoComplete="new-password"
                                autoCorrect="off"
                                autoCapitalize="off"
                                spellCheck={false}
                                data-form-type="other"
                                data-lpignore="true"
                                title={isCriterionLocked ? "Critério bloqueado — protocolo já finalizado" : undefined}
                                className={`w-full text-xs text-muted-foreground bg-transparent border-b border-dashed py-0.5 placeholder:text-muted-foreground/40 ${isCriterionLocked ? "border-transparent cursor-default select-text" : "border-transparent hover:border-muted-foreground/30 focus:border-primary focus:outline-none"}`}
                                placeholder="Critério de aceitação"
                              />
                            </TableCell>
                            <TableCell
                              rowSpan={lots.length}
                              className={`py-1 px-1 text-center sticky left-[19rem] z-10 border-r border-border/40 align-top ${stickyBg}`}
                            >
                              <AlertDialog>
                                <AlertDialogTrigger asChild>
                                  <button
                                    type="button"
                                    className="text-muted-foreground/20 hover:text-destructive text-base leading-none transition-colors"
                                    title="Remover parâmetro"
                                  >
                                    ×
                                  </button>
                                </AlertDialogTrigger>
                                <AlertDialogContent>
                                  <AlertDialogHeader>
                                    <AlertDialogTitle>Remover parâmetro?</AlertDialogTitle>
                                    <AlertDialogDescription asChild>
                                      <div>
                                        <p className="font-bold text-destructive uppercase mb-2">
                                          ⚠ ATENÇÃO: ESTA OPERAÇÃO É IRREVERSÍVEL!
                                        </p>
                                        <p>
                                          {param.parameter ? `"${param.parameter}" e todos os seus resultados serão excluídos permanentemente.` : "Este parâmetro e todos os seus resultados serão excluídos permanentemente."}
                                          {" "}Use <strong>Ctrl+Z</strong> logo após para desfazer (10s).
                                        </p>
                                      </div>
                                    </AlertDialogDescription>
                                  </AlertDialogHeader>
                                  <AlertDialogFooter>
                                    <AlertDialogCancel>Cancelar</AlertDialogCancel>
                                    <AlertDialogAction
                                      className="bg-destructive text-white hover:bg-destructive/90"
                                      onClick={() => removeParam(param.uid)}
                                    >
                                      Remover
                                    </AlertDialogAction>
                                  </AlertDialogFooter>
                                </AlertDialogContent>
                              </AlertDialog>
                            </TableCell>
                          </>
                        )}
                        {/* Lot label */}
                        <TableCell
                          className={`py-1 px-2 text-xs text-muted-foreground whitespace-nowrap border-l border-border/30 ${lotIdx < lots.length - 1 ? "" : "border-b border-border/20"} ${stickyBg}`}
                        >
                          {lot.lotNumber}
                        </TableCell>
                        {/* T0, T3, T6 cells */}
                        {PERIODS.map((period) => {
                          const cellResult = getResult(lot.id, period, param.parameter);
                          const isNC = !protocolIsAR && cellResult?.status === "nao_conforme";
                          const isNCtreatedAsAR = protocolIsAR && cellResult?.status === "nao_conforme";
                          return (
                            <TableCell
                              key={`${lot.id}-${period}`}
                              className={[
                                "py-1 text-center align-middle border-l border-border/20",
                                isNC ? "bg-red-200 border-x border-red-400" : isNCtreatedAsAR ? "bg-amber-100 border-x border-amber-300" : "",
                              ].join(" ")}
                            >
                              <InlineCell
                                lotId={lot.id}
                                period={period}
                                param={param}
                                result={cellResult}
                                protocolId={protocolId}
                                lots={lots}
                                periodDate={periodDates[period] || undefined}
                                editUnlocked={editUnlocked}
                                onUnlock={() => setEditUnlocked(true)}
                                onSaved={() => {}}
                              />
                            </TableCell>
                          );
                        })}
                      </TableRow>
                    ));
                  })}
                </TableBody>
              </Table>
            </div>
            {/* ── Banco de parâmetros (teor_ativo) ─────────────────────── */}
            {CATEGORY_PRESETS[key] && (() => {
              const alreadyAdded = new Set(catParams.map(p => p.parameter));
              const available = CATEGORY_PRESETS[key].filter(p => !alreadyAdded.has(p.parameter));
              if (available.length === 0) return null;
              return (
                <div className="mt-2 px-1 pb-1">
                  <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1">
                    Banco de parâmetros — clique para adicionar com critério pré-preenchido:
                  </p>
                  <div className="flex flex-wrap gap-1">
                    {available.map(p => (
                      <button
                        key={p.parameter}
                        type="button"
                        onClick={() => addParam(key, p.parameter, p.criterion)}
                        className="text-[10px] px-2 py-0.5 rounded-full border border-primary/25 text-primary/70 hover:bg-primary/8 hover:border-primary/50 hover:text-primary transition-colors"
                      >
                        + {p.parameter}
                      </button>
                    ))}
                  </div>
                </div>
              );
            })()}
            <div className="flex justify-end mt-1 pr-1">
              <button
                type="button"
                onClick={() => addParam(key)}
                className="text-xs text-muted-foreground/60 hover:text-primary flex items-center gap-1 py-1 px-2 rounded hover:bg-muted transition-colors"
              >
                <Plus className="h-3 w-3" /> Adicionar parâmetro em branco
              </button>
            </div>
          </div>
        );
      })}
      {/* Dialog — metodologia alteraria nome do parâmetro já digitado */}
      {paramNameConfirmPending && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={() => setParamNameConfirmPending(null)}>
          <div className="bg-white rounded-lg shadow-xl w-96 p-5 space-y-3" onClick={e => e.stopPropagation()}>
            <p className="font-semibold text-sm">Alterar nome do parâmetro?</p>
            <p className="text-xs text-muted-foreground">Nome atual: <span className="font-medium text-foreground">"{paramNameConfirmPending.currentName}"</span></p>
            <p className="text-xs text-muted-foreground">A metodologia <strong>{paramNameConfirmPending.methodName}</strong> sugere: <span className="font-medium text-foreground">"{paramNameConfirmPending.newName}"</span></p>
            <div className="flex justify-end gap-2 pt-1">
              <button type="button" onClick={() => { paramNameConfirmPending.onKeepName(); setParamNameConfirmPending(null); }} className="text-xs px-3 py-1.5 rounded border border-border hover:bg-muted">Manter o digitado</button>
              <button type="button" onClick={() => { paramNameConfirmPending.onChangeName(); setParamNameConfirmPending(null); }} className="text-xs px-3 py-1.5 rounded bg-primary text-white hover:opacity-90">Alterar nome</button>
            </div>
          </div>
        </div>
      )}
      {/* Dialog — metodologia sobrescreveria critério já preenchido */}
      {criterionConfirmPending && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={() => setCriterionConfirmPending(null)}>
          <div className="bg-white rounded-lg shadow-xl w-96 p-5 space-y-3" onClick={e => e.stopPropagation()}>
            <p className="font-semibold text-sm">Substituir critério?</p>
            <p className="text-xs text-muted-foreground">O parâmetro <strong>{criterionConfirmPending.paramName}</strong> já tem critério preenchido:<br /><span className="font-medium text-foreground">"{criterionConfirmPending.currentCriterion}"</span></p>
            <p className="text-xs text-muted-foreground">A metodologia <strong>{criterionConfirmPending.methodName}</strong> traz:<br /><span className="font-medium text-foreground">"{criterionConfirmPending.newCriterion}"</span></p>
            <div className="flex justify-end gap-2 pt-1">
              <button type="button" onClick={() => { criterionConfirmPending.applyFn(false); setCriterionConfirmPending(null); }} className="text-xs px-3 py-1.5 rounded border border-border hover:bg-muted">Manter atual</button>
              <button type="button" onClick={() => { criterionConfirmPending.applyFn(true); setCriterionConfirmPending(null); }} className="text-xs px-3 py-1.5 rounded bg-amber-600 text-white hover:bg-amber-700">Substituir critério</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

type KineticOverride = {
  t0: string; t3: string; t6: string;
  deltaLn: string; k: string;
  ichThreshold: string;   // Minimum content threshold % — used in t_val formula (default: 90)
  specMin: string;        // Specification/criterion range min — informational only, NOT used in calc
  specMax: string;        // Specification/criterion range max — informational only
  shelfLife: string; validadePraticada: string;
};

function parseCriterionRange(criterion: string | null | undefined): { min: string; max: string } {
  if (!criterion) return { min: "", max: "" };
  const normalized = criterion.replace(/,/g, ".").replace(/[–—]/g, "-").replace(/%/g, "").trim();

  // Case 1: full range "X - Y" (e.g. "98.50 - 100.50")
  const rangeMatch = normalized.match(/(\d+\.?\d*)\s*-\s*(\d+\.?\d*)/);
  if (rangeMatch) return { min: rangeMatch[1], max: rangeMatch[2] };

  // Case 2: minimum-only spec "Mín. X" / "Min X" / "≥ X" (e.g. "Mín. 80 do valor declarado")
  const minOnlyMatch = normalized.match(/(?:m[íi]n\.?\s*|>=?\s*|≥\s*)(\d+\.?\d*)/i);
  if (minOnlyMatch) return { min: minOnlyMatch[1], max: "" };

  // Case 3: bare single number
  const singleMatch = normalized.match(/^(\d+\.?\d*)$/);
  if (singleMatch) return { min: singleMatch[1], max: "" };

  return { min: "", max: "" };
}

/**
 * Compute kinetic values from raw inputs.
 *
 * Formula (T0→T6 full interval):
 *   Δln = −ln(T6 / T0)
 *   k   = Δln / 6   (months⁻¹)
 *   t_val = −ln(ichThreshold / C0) / k   where C0 = T0
 *
 * ichThreshold is the ICH minimum content threshold (default 80 %).
 * It is SEPARATE from the specification/criterion range (specMin/specMax)
 * which is purely informational and must NOT be used here.
 */
function calcKineticOverride(
  t0s: string, t3s: string, t6s: string, ichThresholds: string,
): Partial<KineticOverride> {
  const t0 = parseFloat(t0s.replace(",", "."));
  const t6 = parseFloat(t6s.replace(",", "."));
  const ichThreshold = parseFloat(ichThresholds.replace(",", "."));

  if (isNaN(t0) || isNaN(t6) || t0 <= 0 || t6 <= 0) return {};

  // Δln = −ln(T6/T0)
  const deltaLn = -Math.log(t6 / t0);
  // k = Δln / 6  (T0→T6 = 6 months)
  const k = deltaLn / 6;

  if (k <= 0 || isNaN(k)) return { deltaLn: deltaLn.toFixed(6), k: "" };

  const c0 = t0;

  // t_val = −ln(ichThreshold / C0) / k
  const lnNum = isNaN(ichThreshold) || ichThreshold <= 0 ? NaN : -Math.log(ichThreshold / c0);
  const shelfLife = !isNaN(lnNum) && lnNum > 0 ? (lnNum / k).toFixed(2) : "";

  return {
    deltaLn: deltaLn.toFixed(6),
    k: k.toFixed(6),
    shelfLife,
  };
}

function calcMedia(t0s: string, t3s: string, t6s: string): string {
  const vals = [t0s, t3s, t6s].map((s) => parseFloat(s.replace(",", "."))).filter((v) => !isNaN(v));
  if (vals.length === 0) return "";
  return (vals.reduce((a, b) => a + b, 0) / vals.length).toFixed(2);
}

function EditableNum({
  value, onChange, width = "w-20", placeholder = "—", highlighted = false,
}: { value: string; onChange: (v: string) => void; width?: string; placeholder?: string; highlighted?: boolean }) {
  return (
    <input
      value={value}
      onChange={(e) => onChange(e.target.value)}
      autoComplete="new-password"
      autoCorrect="off"
      autoCapitalize="off"
      spellCheck={false}
      data-form-type="other"
      data-lpignore="true"
      className={`${width} border rounded px-1.5 py-0.5 text-xs font-mono text-right focus:outline-none bg-white ${highlighted ? "border-amber-400 ring-1 ring-amber-300 bg-amber-50 focus:ring-amber-500" : "border-border focus:ring-1 focus:ring-primary"}`}
      placeholder={placeholder}
      title={highlighted ? "Valor editado manualmente — fonte: correção manual na aba Cinética" : undefined}
    />
  );
}

type KineticApiParam = {
  t0?: number | null; t3?: number | null; t6?: number | null;
  deltaLn?: number | null; k?: number | null;
  estimatedShelfLifeMonths?: number | null;
  minThresholdPercent: number;
  criterion?: string | null;
  kLongTerm?: number | null;
  kAccelerated?: number | null;
  conditionTempLt?: number | null;
  conditionTempAcc?: number | null;
  conditionHumLt?: number | null;
  conditionHumAcc?: number | null;
  ea?: number | null;
  arrheniusA?: number | null;
  shelfLifeArrhenius?: number | null;
};

function buildKineticOverride(p: KineticApiParam): KineticOverride {
  const t0 = p.t0 != null ? p.t0.toFixed(2) : "";
  const t3 = p.t3 != null ? p.t3.toFixed(2) : "";
  const t6 = p.t6 != null ? p.t6.toFixed(2) : "";
  const { min: specMin, max: specMax } = parseCriterionRange(p.criterion);
  // Prefer Arrhenius-corrected shelf life (at long-term temp) when available;
  // fall back to raw ICH Q1A estimate (at the bucket's measurement temperature).
  const effectiveShelfLife = p.shelfLifeArrhenius ?? p.estimatedShelfLifeMonths;
  return {
    t0, t3, t6,
    deltaLn: p.deltaLn != null ? p.deltaLn.toFixed(6) : "",
    k: p.k != null ? p.k.toFixed(6) : "",
    ichThreshold: p.minThresholdPercent.toString(),
    specMin,
    specMax,
    shelfLife: effectiveShelfLife != null ? effectiveShelfLife.toFixed(2) : "",
    validadePraticada: "",
  };
}

type KineticsOverridesDB = {
  savedAt?: string;
  params?: Record<string, {
    t0?: string; t3?: string; t6?: string;
    specMin?: string; specMax?: string;
    validadePraticada?: string; ichThreshold?: string;
    manualFields?: string[];
  }>;
  customShelfLife?: string;
  selectedShelfBox?: "standard" | "overage" | "extrap_std" | "extrap_overage" | null;
};

function KineticsTab({ protocolId, productName, initialKineticsNotes, initialValidityMonths, customParamsJson, initialKineticsOverridesJson, ativoLimitsJson, onApplyOverage, onRecommendedOverages, onSyncCertificate, isSyncingCertificate }: {
  protocolId: number;
  productName: string;
  initialKineticsNotes?: string | null;
  initialValidityMonths?: number | null;
  customParamsJson?: string | null;
  initialKineticsOverridesJson?: string | null;
  ativoLimitsJson?: string | null;
  onApplyOverage?: (param: string, overage: string) => void;
  onRecommendedOverages?: (recs: Record<string, number>) => void;
  onSyncCertificate?: () => void;
  isSyncingCertificate?: boolean;
}) {
  const { data: kinetics, isLoading } = useGetKinetics(protocolId, {
    query: { queryKey: getGetKineticsQueryKey(protocolId), staleTime: 0 },
  });

  const updateProtocol = useUpdateProtocol();
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const debouncedSave = useCallback((data: { kineticsNotes?: string; validityMonths?: number | null }) => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      updateProtocol.mutate({ id: protocolId, data });
    }, 800);
  }, [protocolId, updateProtocol]);

  const LS_KEY = `kinetics_overrides_${protocolId}`;

  const readLs = () => {
    try {
      const raw = localStorage.getItem(LS_KEY);
      return raw ? JSON.parse(raw) : {};
    } catch { return {}; }
  };

  const [overrides, setOverrides] = useState<Record<string, KineticOverride>>({});
  const [cardValidity, setCardValidity] = useState<string>(() => {
    const ls = readLs();
    if (typeof ls.cardValidity === "string" && ls.cardValidity !== "") return ls.cardValidity;
    return initialValidityMonths != null ? String(initialValidityMonths) : "";
  });
  // Quando true, nenhum clique nas caixinhas pode mudar o valor — só o input manual.
  const [validityLockedByUser, setValidityLockedByUser] = useState<boolean>(() => {
    const ls = readLs();
    return !!ls.validityLockedByUser;
  });
  const [kineticsObs, setKineticsObs] = useState<string>(() => {
    const ls = readLs();
    if (typeof ls.kineticsObs === "string") return ls.kineticsObs;
    return initialKineticsNotes ?? "";
  });
  const [customShelfLife, setCustomShelfLife] = useState<string>("");
  const [selectedShelfBox, setSelectedShelfBox] = useState<"standard" | "overage" | "extrap_std" | "extrap_overage" | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<{ param: string } | null>(null);
  const [deletePassword, setDeletePassword] = useState("");
  const [deleteError, setDeleteError] = useState("");
  const [isDeleting, setIsDeleting] = useState(false);
  const [showPassoCalculo, setShowPassoCalculo] = useState(false);
  const [hiddenPassoSteps, setHiddenPassoSteps] = useState<Set<number>>(new Set());
  const togglePassoStep = (i: number) => setHiddenPassoSteps(prev => {
    const next = new Set(prev);
    if (next.has(i)) next.delete(i); else next.add(i);
    return next;
  });

  const [manualFields, setManualFields] = useState<Record<string, string[]>>(() => {
    try {
      const db: KineticsOverridesDB = JSON.parse(initialKineticsOverridesJson ?? "{}");
      const mf: Record<string, string[]> = {};
      for (const [param, pdata] of Object.entries(db.params ?? {})) {
        if (Array.isArray(pdata.manualFields)) mf[param] = pdata.manualFields;
      }
      return mf;
    } catch { return {}; }
  });
  const [isDirty, setIsDirty] = useState(false);
  useUnsavedChangesGuard(isDirty);
  const [kineticOverageUndo, setKineticOverageUndo] = useState<{ param: string; prevValue: string } | null>(null);
  const [saveConfirmOpen, setSaveConfirmOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  // Sessão de edição desbloqueada na aba cinética (pede senha uma vez por sessão)
  const [kineticsUnlocked, setKineticsUnlocked] = useState(false);
  const [kineticsPwdOpen, setKineticsPwdOpen] = useState(false);
  const [kineticsPwdValue, setKineticsPwdValue] = useState("");
  const [kineticsPwdError, setKineticsPwdError] = useState("");
  const [kineticsPwdLoading, setKineticsPwdLoading] = useState(false);
  const [kineticsPwdShowPwd, setKineticsPwdShowPwd] = useState(false);
  const [pendingFieldChange, setPendingFieldChange] = useState<{ param: string; field: keyof KineticOverride; val: string } | null>(null);
  const hasSavedOverrides = !!initialKineticsOverridesJson;

  const ativoLimits = useMemo<Record<string, { min: string; max: string; unit: string; declared: string; overage: string }>>(() => {
    if (!ativoLimitsJson) return {};
    try { return JSON.parse(ativoLimitsJson); } catch { return {}; }
  }, [ativoLimitsJson]);

  // Overage recomendado por parâmetro — cálculo reverso ICH Q1A(R2):
  //   T0_necessário = specMin% × e^(k × validadeMeses)
  //   overageNecessário = max(0, T0_necessário − 100)
  // Atualiza automaticamente quando overrides ou ativoLimits mudam.
  const recommendedOverages = useMemo<Record<string, number>>(() => {
    const result: Record<string, number> = {};
    // Arrhenius correction: estudo acelerado-only (40°C) → k precisa ser dividido pelo FA
    // para projetar corretamente na validade real (30°C). Se houver dados long-term, k já
    // está nas condições reais e fa = 1 (sem correção).
    const params = kinetics?.parameters ?? [];
    const isAccelOnly = params.some(p => (p.kAccelerated ?? 0) > 0)
      && !params.some(p => (p.kLongTerm ?? 0) > 0);
    const fa = isAccelOnly
      ? Math.exp((83140 / 8.314) * (1 / 303.15 - 1 / 313.15))
      : 1;
    for (const [param, ov] of Object.entries(overrides)) {
      const k = parseFloat(ov.k);
      if (isNaN(k) || k <= 0) continue;
      const lim = ativoLimits[param];
      if (!lim) continue;
      const validadeMeses = parseFloat(ov.validadePraticada);
      if (isNaN(validadeMeses) || validadeMeses <= 0) continue;
      const kReal = k / fa;
      const specMinPct = parseFloat(ov.ichThreshold) || 90;
      const t0Required = specMinPct * Math.exp(kReal * validadeMeses);
      const overageRequired = Math.max(0, t0Required - 100);
      result[param] = parseFloat((Math.ceil(overageRequired * 10) / 10).toFixed(1));
    }
    return result;
  }, [overrides, ativoLimits, kinetics?.parameters]);

  // Informa o componente pai sempre que as recomendações mudarem
  useEffect(() => {
    onRecommendedOverages?.(recommendedOverages);
  }, [recommendedOverages, onRecommendedOverages]);

  // Decisão para parâmetros fora da faixa ANVISA
  const [ativoDecision, setAtivoDecision] = useState<Record<string, "reprova" | "refaz" | null>>({});

  const confirmKineticsPwd = async () => {
    if (!kineticsPwdValue.trim()) return;
    setKineticsPwdLoading(true);
    setKineticsPwdError("");
    try {
      const res = await fetch("/api/auth/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: kineticsPwdValue }),
      });
      if (res.ok) {
        setKineticsUnlocked(true);
        setKineticsPwdOpen(false);
        setKineticsPwdValue("");
        // Aplica a mudança pendente após desbloquear
        if (pendingFieldChange) {
          const { param, field, val } = pendingFieldChange;
          setPendingFieldChange(null);
          applyFieldChange(param, field, val);
        }
      } else {
        setKineticsPwdError("Senha incorreta.");
        setKineticsPwdValue("");
      }
    } catch {
      setKineticsPwdError("Erro de conexão.");
    }
    setKineticsPwdLoading(false);
  };

  const queryClient = useQueryClient();

  const handleDeleteParam = async () => {
    setDeleteError("");
    setIsDeleting(true);
    try {
      const resp = await fetch("/api/auth/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: deletePassword }),
      });
      if (!resp.ok) {
        setDeleteError("Senha incorreta.");
        setIsDeleting(false);
        return;
      }
    } catch {
      setDeleteError("Erro ao verificar senha.");
      setIsDeleting(false);
      return;
    }

    try {
      const parsed: Array<{ parameter: string; category: string; uid: string }> =
        customParamsJson ? JSON.parse(customParamsJson) : [];
      const updated = parsed.filter(
        (p) => !(p.category === "teor_ativo" && p.parameter === deleteConfirm?.param),
      );
      await updateProtocol.mutateAsync({
        id: protocolId,
        data: { customParamsJson: JSON.stringify(updated) },
      });
      queryClient.invalidateQueries({ queryKey: getGetKineticsQueryKey(protocolId) });
    } catch {
      setDeleteError("Erro ao remover parâmetro.");
      setIsDeleting(false);
      return;
    }

    setDeleteConfirm(null);
    setDeletePassword("");
    setDeleteError("");
    setIsDeleting(false);
  };

  // Sync manualFields + reset isDirty when DB overrides change (e.g. after a save)
  useEffect(() => {
    try {
      const db: KineticsOverridesDB = JSON.parse(initialKineticsOverridesJson ?? "{}");
      const mf: Record<string, string[]> = {};
      for (const [param, pdata] of Object.entries(db.params ?? {})) {
        if (Array.isArray(pdata.manualFields)) mf[param] = pdata.manualFields;
      }
      setManualFields(mf);
      setIsDirty(false);
    } catch { /* ignore */ }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialKineticsOverridesJson]);

  // Re-runs every time the kinetics API data changes (i.e. after a result upsert
  // invalidates the query). DB-saved manual T overrides take priority over fresh
  // API values for fields that were manually edited; all other fields come fresh.
  useEffect(() => {
    if (!kinetics) return;

    type SavedPartial = Partial<Omit<KineticOverride, "t0" | "t3" | "t6">>;
    let savedOverrides: Record<string, SavedPartial> = {};
    let savedCustomShelfLife = "";
    let savedCardValidity = "";
    let dbOverrides: KineticsOverridesDB | null = null;
    try {
      const stored = readLs();
      if (stored.overrides) savedOverrides = stored.overrides;
      if (stored.customShelfLife != null) savedCustomShelfLife = stored.customShelfLife;
      if (typeof stored.cardValidity === "string") savedCardValidity = stored.cardValidity;
    } catch { /* ignore */ }
    try {
      if (initialKineticsOverridesJson) {
        dbOverrides = JSON.parse(initialKineticsOverridesJson) as KineticsOverridesDB;
        if (dbOverrides?.customShelfLife) savedCustomShelfLife = dbOverrides.customShelfLife;
      }
    } catch { /* ignore */ }

    // When no user-set validity exists (neither in localStorage nor DB), fall back
    // to the kinetics-recommended value so overage can be calculated immediately.
    const kineticsFallback = (kinetics as any).recommendedValidityMonths != null
      ? String((kinetics as any).recommendedValidityMonths) : "";
    const effectiveCardValidity = savedCardValidity || kineticsFallback;

    const next: Record<string, KineticOverride> = {};
    for (const p of kinetics.parameters) {
      const base = buildKineticOverride(p);
      const saved = savedOverrides[p.parameter] ?? {};
      const dbParam = dbOverrides?.params?.[p.parameter];

      // ichThreshold: ALWAYS use the fresh API value — never let a stale DB/localStorage
      // value (e.g. saved when the default was 80%) override the current system default.
      const ichThreshold = base.ichThreshold;

      // T0/T3/T6: use DB-saved value ONLY when that field was explicitly edited by the user.
      const anyManualTxT = dbParam?.manualFields?.some(f => ["t0", "t3", "t6"].includes(f)) ?? false;
      const t0 = (dbParam?.manualFields?.includes("t0") && dbParam.t0) ? dbParam.t0 : base.t0;
      const t3 = (dbParam?.manualFields?.includes("t3") && dbParam.t3) ? dbParam.t3 : base.t3;
      const t6 = (dbParam?.manualFields?.includes("t6") && dbParam.t6) ? dbParam.t6 : base.t6;

      // Recompute k/deltaLn/shelfLife from user-edited values ONLY when t0/t3/t6 were
      // manually changed. Otherwise use the API's pre-calculated values, which correctly
      // compute k from the long-term bucket (not the all-lots average) per ICH Q1A(R2).
      const recomputed = anyManualTxT ? calcKineticOverride(t0, t3, t6, ichThreshold) : null;

      next[p.parameter] = {
        t0, t3, t6,
        deltaLn: recomputed?.deltaLn ?? base.deltaLn,
        k: recomputed?.k ?? base.k,
        shelfLife: recomputed?.shelfLife ?? base.shelfLife,
        validadePraticada: dbParam?.validadePraticada || saved.validadePraticada || base.validadePraticada || effectiveCardValidity,
        ichThreshold,
        specMin: dbParam?.specMin || saved.specMin || base.specMin,
        specMax: dbParam?.specMax || saved.specMax || base.specMax,
      };
    }
    setOverrides(next);
    setCustomShelfLife(savedCustomShelfLife);
    // Auto-fill only when user never manually locked the field.
    if (effectiveCardValidity && !validityLockedByUser) {
      setCardValidity(cv => cv || effectiveCardValidity);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kinetics, LS_KEY]);

  const persistOverrides = (
    next: Record<string, KineticOverride>,
    shelf = customShelfLife,
    cv = cardValidity,
    obs = kineticsObs,
  ) => {
    try {
      localStorage.setItem(LS_KEY, JSON.stringify({ overrides: next, customShelfLife: shelf, cardValidity: cv, kineticsObs: obs, selectedShelfBox: selectedShelfBox ?? undefined, validityLockedByUser }));
    } catch { /* ignore */ }
  };

  const applyShelfToValidade = (valStr: string, box?: "standard" | "overage" | "extrap_std" | "extrap_overage") => {
    // Se o usuário fixou a validade manualmente, apenas atualiza o indicador "Origem" — nunca muda o valor.
    if (validityLockedByUser) {
      if (box !== undefined) {
        try {
          const stored = readLs();
          localStorage.setItem(LS_KEY, JSON.stringify({ ...stored, selectedShelfBox: box, validityLockedByUser: true }));
        } catch { /* ignore */ }
      }
      return;
    }
    setCardValidity(valStr);
    setOverrides(prev => {
      const next: Record<string, KineticOverride> = {};
      for (const [key, ov] of Object.entries(prev)) {
        next[key] = { ...ov, validadePraticada: valStr };
      }
      persistOverrides(next, customShelfLife, valStr);
      return next;
    });
    setIsDirty(true);
    try {
      const stored = readLs();
      const updatedOvs: Record<string, KineticOverride> = {};
      for (const [key, ov] of Object.entries(stored.overrides ?? {})) {
        updatedOvs[key] = { ...(ov as KineticOverride), validadePraticada: valStr };
      }
      const next: Record<string, unknown> = { ...stored, cardValidity: valStr, overrides: updatedOvs };
      if (box !== undefined) next.selectedShelfBox = box;
      localStorage.setItem(LS_KEY, JSON.stringify(next));
    } catch { /* ignore */ }
    const num = parseInt(valStr, 10);
    debouncedSave({ validityMonths: isNaN(num) ? null : num });
  };

  const applyFieldChange = (param: string, field: keyof KineticOverride, val: string) => {
    setIsDirty(true);
    if (field === "t0" || field === "t3" || field === "t6") {
      setManualFields((prev) => {
        const existing = prev[param] ?? [];
        if (!existing.includes(field)) return { ...prev, [param]: [...existing, field] };
        return prev;
      });
    }
    setOverrides((prev) => {
      const ov = { ...prev[param], [field]: val };
      if (["t0", "t3", "t6", "ichThreshold"].includes(field)) {
        const computed = calcKineticOverride(ov.t0, ov.t3, ov.t6, ov.ichThreshold);
        Object.assign(ov, computed);
      }
      const next = { ...prev, [param]: ov };
      persistOverrides(next);
      return next;
    });
  };

  const setField = (param: string, field: keyof KineticOverride, val: string) => {
    // Se já existem overrides salvos no DB e a sessão não foi desbloqueada, pede senha
    if (hasSavedOverrides && !kineticsUnlocked) {
      setPendingFieldChange({ param, field, val });
      setKineticsPwdOpen(true);
      setKineticsPwdValue("");
      setKineticsPwdError("");
      return;
    }
    applyFieldChange(param, field, val);
  };

  const resetToCalculated = () => {
    if (!kinetics) return;
    const reset: Record<string, KineticOverride> = {};
    for (const p of kinetics.parameters) {
      reset[p.parameter] = buildKineticOverride(p);
    }
    setOverrides(reset);
    setCustomShelfLife("");
    setCardValidity(initialValidityMonths != null ? String(initialValidityMonths) : "");
    setValidityLockedByUser(false);
    setKineticsObs(initialKineticsNotes ?? "");
    setManualFields({});
    setIsDirty(false);
    try { localStorage.removeItem(LS_KEY); } catch { /* ignore */ }
    // Clear DB overrides too
    updateProtocol.mutate({ id: protocolId, data: { kineticsOverridesJson: null } });
  };

  const saveOverridesToDb = () => {
    setIsSaving(true);
    const payload: KineticsOverridesDB = {
      savedAt: new Date().toISOString(),
      params: {},
      customShelfLife: customShelfLife || undefined,
      selectedShelfBox: selectedShelfBox ?? undefined,
    };
    for (const [param, ov] of Object.entries(overrides)) {
      payload.params![param] = {
        t0: ov.t0, t3: ov.t3, t6: ov.t6,
        specMin: ov.specMin, specMax: ov.specMax,
        validadePraticada: ov.validadePraticada,
        ichThreshold: ov.ichThreshold,
        manualFields: manualFields[param] ?? [],
      };
    }
    updateProtocol.mutate(
      { id: protocolId, data: { kineticsOverridesJson: JSON.stringify(payload) } },
      {
        onSuccess: () => {
          setIsDirty(false);
          setSaveConfirmOpen(false);
          setIsSaving(false);
          try { localStorage.removeItem(LS_KEY); } catch { /* ignore */ }
        },
        onError: () => { setIsSaving(false); },
      },
    );
  };

  if (isLoading) return <div className="text-center py-8 text-muted-foreground">Calculando...</div>;
  if (!kinetics || kinetics.parameters.length === 0) return (
    <div className="text-center py-12 text-muted-foreground space-y-2">
      <p className="font-medium">Nenhum parâmetro de Teor do Ativo encontrado.</p>
      <p className="text-sm">Insira resultados numéricos na aba <strong>Resultados</strong> para os parâmetros da categoria <strong>Teor do Ativo</strong> (ex: Creatina, Cálcio, Vitamina D, etc.).</p>
    </div>
  );

  const missingPeriods = kinetics.parameters.filter((p) => p.t0 == null || p.t6 == null);
  const missingMsg = missingPeriods.length > 0 ? (
    <div className="rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 space-y-1">
      <p className="font-semibold">⚠ Dados insuficientes para calcular a cinética completa</p>
      <p>Os parâmetros abaixo precisam de resultados numéricos em <strong>T0m</strong> e/ou <strong>T6m</strong> na aba <strong>Resultados</strong>:</p>
      <ul className="list-disc ml-5 space-y-0.5">
        {missingPeriods.map((p) => (
          <li key={p.parameter}>
            <strong>{(p as { parameter: string }).parameter}</strong>
            {" — "}
            {p.t0 == null && p.t6 == null ? "faltam T0 e T6" : p.t0 == null ? "falta T0" : "falta T6"}
          </li>
        ))}
      </ul>
      <p className="text-xs text-amber-700">Os valores podem ser inseridos manualmente na tabela abaixo apenas para simulação. Para persistir os resultados, use a aba Resultados.</p>
    </div>
  ) : null;

  // Vida útil SEM sobreformulação: c₀ = 100% (quantidade declarada exata, sem overage).
  // Fórmula: t = −ln(limiar/100) / k
  // → Responde à pergunta: "se o produto fosse fabricado exatamente no 100% declarado,
  //   até quando ficaria dentro do spec?"
  const baselineShelfLivesMap: Record<string, number> = {};
  for (const [param, ov] of Object.entries(overrides)) {
    const k = parseFloat(ov.k);
    if (isNaN(k) || k <= 0) continue;
    const threshold = parseFloat(ov.ichThreshold) || 90;
    const t = -Math.log(threshold / 100) / k;
    if (isFinite(t) && t > 0) baselineShelfLivesMap[param] = t;
  }
  const baselineShelfLifeValues = Object.values(baselineShelfLivesMap).filter(v => v > 0);
  const minBaselineShelfLife = baselineShelfLifeValues.length > 0 ? Math.min(...baselineShelfLifeValues) : null;
  const limitingBaselineParam = Object.entries(baselineShelfLivesMap).find(([, v]) => v === minBaselineShelfLife)?.[0] ?? null;

  // Detect accelerated-only study: all parameters have kAccelerated but none have kLongTerm.
  // In this case the k used in calculations was measured at the accelerated temperature (e.g. 40°C),
  // NOT at the intended storage temperature (25°C). Arrhenius correction requires long-term lots.
  const hasAnyAccelerated = kinetics.parameters.some((p) => p.kAccelerated != null && p.kAccelerated > 0);
  const hasAnyLongTerm = kinetics.parameters.some((p) => p.kLongTerm != null && p.kLongTerm > 0);
  const isAcceleratedOnly = hasAnyAccelerated && !hasAnyLongTerm;
  const accTempC = isAcceleratedOnly
    ? (kinetics.parameters.find((p) => p.conditionTempAcc != null)?.conditionTempAcc ?? null)
    : null;

  // minShelfLife (API c0=T0) — mantido como referência interna, mas não exibido no BOX 1 diretamente
  const shelfLives = Object.values(overrides)
    .map((o) => parseFloat(o.shelfLife))
    .filter((v) => !isNaN(v) && v > 0);
  const minShelfLife = shelfLives.length > 0 ? Math.min(...shelfLives) : null;

  // Overage-adjusted shelf life per parameter — ICH Q1A(R2):
  //   t_val_overage = −ln(ichThreshold / C0_overage) / k
  //
  // C0_overage = 100 + overage_efetivo%
  //   → base declarada (100%) + overage planejado
  //   → NÃO multiplica pelo T0 real (evita double-counting quando T0 > 100%)
  //
  // overage_efetivo:
  //   • Se o usuário informou overage manual > 0 → usa o manual
  //   • Se T0 > 100% → overage implícito = T0 − 100 (auto-detectado, sem entrada manual)
  //   • Caso contrário → sem overage, coluna omitida
  const overageAdjustedShelfLives: Record<string, number> = {};
  for (const [param, ov] of Object.entries(overrides)) {
    const k = parseFloat(ov.k);
    if (isNaN(k) || k <= 0) continue;
    const lim = ativoLimits[param];
    const manualOveragePct = lim?.overage ? parseFloat(lim.overage.replace(",", ".")) : NaN;
    const actualT0 = parseFloat(ov.t0) || 100;
    // Overage implícito detectado automaticamente quando T0 > 100%
    const implicitOveragePct = Math.max(0, actualT0 - 100);
    // Prioridade: manual > implícito
    const effectiveOverage = (!isNaN(manualOveragePct) && manualOveragePct > 0)
      ? manualOveragePct
      : implicitOveragePct;
    if (effectiveOverage <= 0) continue;
    const ichThreshold = parseFloat(ov.ichThreshold) || 90;
    // C0 = 100 (declarado) + overage efetivo — fórmula correta sem double-counting
    const c0WithOverage = 100 + effectiveOverage;
    if (c0WithOverage <= ichThreshold) continue;
    const lnNum = -Math.log(ichThreshold / c0WithOverage);
    if (lnNum > 0) overageAdjustedShelfLives[param] = lnNum / k;
  }
  const overageValues = Object.values(overageAdjustedShelfLives).filter(v => v > 0);
  const minOverageShelfLife = overageValues.length > 0 ? Math.min(...overageValues) : null;
  const limitingOverageParam = Object.entries(overageAdjustedShelfLives).find(([, v]) => v === minOverageShelfLife)?.[0] ?? null;
  // Show overage estimate only when EVERY parameter with a non-zero k has overage configured
  const parametersWithK = Object.entries(overrides).filter(([, o]) => { const k = parseFloat(o.k); return !isNaN(k) && k > 0; });
  const allHaveOverage = parametersWithK.length > 0 && parametersWithK.every(([p]) => overageAdjustedShelfLives[p] != null);

  // ── Arrhenius extrapolação: 40°C → 30°C ──
  // Ea = 83140 J/mol (fixo), R = 8,314 J/(mol·K)
  // FA = e^[ Ea/R · (1/T30 − 1/T40) ]
  const ARRHENIUS_EA_JMOL = 83140;
  const ARRHENIUS_R = 8.314;
  const T_30_K = 303.15;
  const T_40_K = 313.15;
  const arrheniusFactor = Math.exp(
    (ARRHENIUS_EA_JMOL / ARRHENIUS_R) * (1 / T_30_K - 1 / T_40_K)
  );
  const minBaselineExtrap30 = minBaselineShelfLife != null ? minBaselineShelfLife * arrheniusFactor : null;
  const minOverageExtrap30 = minOverageShelfLife != null ? minOverageShelfLife * arrheniusFactor : null;

  // Extrap 30°C por parâmetro (para exibir na tabela)
  const baselineExtrap30Map: Record<string, number> = {};
  for (const [param, shelf] of Object.entries(baselineShelfLivesMap)) {
    baselineExtrap30Map[param] = shelf * arrheniusFactor;
  }
  const overageExtrap30Map: Record<string, number> = {};
  for (const [param, shelf] of Object.entries(overageAdjustedShelfLives)) {
    overageExtrap30Map[param] = shelf * arrheniusFactor;
  }

  return (
    <div className="space-y-6">
      {/* Dialog de senha para desbloquear edição da cinética */}
      {kineticsPwdOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={() => { setKineticsPwdOpen(false); setPendingFieldChange(null); }}>
          <div className="bg-white rounded-lg shadow-xl w-80 p-5 space-y-4" onClick={e => e.stopPropagation()}>
            <div className="flex items-center gap-2">
              <Lock className="h-5 w-5 text-amber-600 shrink-0" />
              <p className="font-semibold text-sm">Editar correções já salvas</p>
            </div>
            <p className="text-xs text-muted-foreground">
              Esta aba possui correções gravadas no banco. Digite a senha mestra para liberar edições nesta sessão.
            </p>
            <div className="relative">
              <input
                type={kineticsPwdShowPwd ? "text" : "password"}
                value={kineticsPwdValue}
                onChange={e => { setKineticsPwdValue(e.target.value); setKineticsPwdError(""); }}
                onKeyDown={e => { if (e.key === "Enter") confirmKineticsPwd(); if (e.key === "Escape") { setKineticsPwdOpen(false); setPendingFieldChange(null); } }}
                placeholder="Senha mestra"
                autoFocus
                className="w-full border border-border rounded px-3 py-1.5 text-sm pr-9 focus:outline-none focus:ring-1 focus:ring-primary"
              />
              <button type="button" onClick={() => setKineticsPwdShowPwd(s => !s)} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground">
                {kineticsPwdShowPwd ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
            {kineticsPwdError && <p className="text-xs text-destructive font-medium -mt-2">{kineticsPwdError}</p>}
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => { setKineticsPwdOpen(false); setPendingFieldChange(null); }} className="text-xs px-3 py-1.5 rounded border border-border hover:bg-muted">Cancelar</button>
              <button type="button" onClick={confirmKineticsPwd} disabled={kineticsPwdLoading || !kineticsPwdValue.trim()} className="text-xs px-3 py-1.5 rounded bg-primary text-white hover:bg-primary/80 disabled:opacity-50">
                {kineticsPwdLoading ? "Verificando…" : "Desbloquear"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Product header */}
      <div className="flex items-center justify-between gap-4 pb-3 border-b border-border">
        <div>
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Produto</p>
          <p className="text-lg font-bold text-foreground">{productName}</p>
          <p className="text-xs text-muted-foreground mt-0.5">
            {kinetics.parameters.length} parâmetro(s) de Teor do Ativo analisados via cinética de 1ª ordem (ICH Q1A)
          </p>
        </div>
        <div className="flex items-center gap-2">
          {hasSavedOverrides && !kineticsUnlocked && (
            <span className="flex items-center gap-1 text-xs text-amber-700 border border-amber-300 bg-amber-50 px-2 py-1 rounded">
              <Lock className="h-3 w-3" /> Edição bloqueada — clique em um campo para desbloquear
            </span>
          )}
          {hasSavedOverrides && kineticsUnlocked && (
            <span className="flex items-center gap-1 text-xs text-green-700 border border-green-300 bg-green-50 px-2 py-1 rounded">
              <Unlock className="h-3 w-3" /> Edição desbloqueada nesta sessão
            </span>
          )}
          {isDirty && (
            <Button
              variant="default"
              size="sm"
              onClick={() => setSaveConfirmOpen(true)}
              className="gap-1.5 bg-primary text-primary-foreground"
            >
              <SaveAll className="h-3.5 w-3.5" />
              Salvar correções
            </Button>
          )}
          <Button variant="outline" size="sm" onClick={resetToCalculated}>
            <RotateCcw className="h-3.5 w-3.5 mr-1.5" />
            Restaurar valores calculados
          </Button>
          {onSyncCertificate && (
            <Button
              variant="default"
              size="sm"
              onClick={onSyncCertificate}
              disabled={isSyncingCertificate}
              className="gap-1.5 bg-emerald-700 hover:bg-emerald-800 text-white"
            >
              {isSyncingCertificate ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <CheckCircle2 className="h-3.5 w-3.5" />
              )}
              {isSyncingCertificate ? "Sincronizando…" : "Sincronizar com Certificado"}
            </Button>
          )}
        </div>
      </div>
      {isDirty && (
        <p className="text-xs text-amber-700 -mt-2 flex items-center gap-1">
          <ShieldAlert className="h-3.5 w-3.5 shrink-0" />
          Há correções não salvas. Clique em <strong>Salvar correções</strong> para persistir no banco de dados.
        </p>
      )}
      {!isDirty && (
        <p className="text-xs text-muted-foreground -mt-2">Todos os valores são editáveis diretamente nas células — os cálculos são atualizados automaticamente.</p>
      )}

      <AlertDialog open={saveConfirmOpen} onOpenChange={setSaveConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmar gravação das correções</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3 text-sm">
                <p>As correções manuais feitas nesta sessão serão gravadas no banco de dados.</p>
                <div className="rounded-md border border-blue-200 bg-blue-50 px-3 py-2 text-blue-800 text-xs">
                  <p className="font-semibold mb-1">ℹ Sobre a fonte dos dados</p>
                  <p>Campos de T0/T3/T6 editados manualmente serão marcados como <strong>"editado manualmente"</strong> (indicados em âmbar) e substituirão os valores calculados automaticamente. Os demais campos (Espec. mín/máx, Validade Praticada, Vida Útil Personalizada) também são persistidos.</p>
                </div>
                <p className="text-muted-foreground text-xs">Para reverter, use o botão <strong>Restaurar valores calculados</strong>.</p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isSaving}>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={saveOverridesToDb} disabled={isSaving}>
              {isSaving ? "Salvando…" : "Sim, salvar"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {missingMsg}

      {/* Alerta ANVISA — parâmetros fora da faixa de conformidade */}
      {(() => {
        const outOfRange = kinetics?.parameters.flatMap(p => {
          const ov = overrides[p.parameter];
          const lim = ativoLimits[p.parameter];
          if (!ov || !lim?.declared) return [];
          const t6Num = parseFloat(ov.t6);
          const t0Num = parseFloat(ov.t0);
          const declaredNum = parseFloat(lim.declared.replace(",", "."));
          if (isNaN(t6Num) || isNaN(declaredNum)) return [];

          // Aplicar overage exatamente como o quadro de conformidade (ResultsTab)
          const overagePct = lim.overage ? parseFloat(lim.overage.replace(",", ".")) : NaN;
          const hasOvg = !isNaN(overagePct) && overagePct > 0;
          const mfg = hasOvg ? declaredNum * (1 + overagePct / 100) : declaredNum;
          const actualMg = (t6Num / 100) * mfg;

          const minNum = lim.min ? parseFloat(lim.min.replace(",", ".")) : null;
          const maxNum = lim.max ? parseFloat(lim.max.replace(",", ".")) : null;
          const degradation = !isNaN(t0Num) && t0Num > 0 ? ((t0Num - t6Num) / t0Num) * 100 : null;
          const belowMin = minNum !== null && actualMg < minNum - 0.005;
          const aboveMax = maxNum !== null && actualMg > maxNum + 0.005;
          const hasExplicitMin = minNum !== null;
          const highDegradation = !hasExplicitMin && degradation !== null && degradation > 20;
          if (!belowMin && !aboveMax && !highDegradation) return [];

          return [{ param: p.parameter, actualMg, unit: lim.unit, minNum, maxNum, minText: lim.min, maxText: lim.max, degradation, belowMin, aboveMax, highDegradation, hasOvg, overagePct, mfg, declaredNum }];
        }) ?? [];
        if (outOfRange.length === 0) return null;
        return (
          <div className="rounded-md border border-red-300 bg-red-50 px-4 py-4 space-y-4">
            <p className="font-semibold text-sm text-red-800 flex items-center gap-2">
              ⚠ Parâmetro(s) fora da faixa ANVISA — decisão necessária
            </p>
            {outOfRange.map(item => (
              <div key={item.param} className="space-y-2 border-t border-red-200 pt-3 first:border-0 first:pt-0">
                <p className="text-xs text-red-700">
                  <strong>{item.param}</strong>: T6 calculado = <strong>{item.actualMg.toFixed(2)} {item.unit}</strong>
                  {item.belowMin && <span className="ml-2 text-red-600">↓ abaixo do mínimo ANVISA ({item.minText || item.minNum} {item.unit})</span>}
                  {item.aboveMax && <span className="ml-2 text-red-600">↑ acima do máximo ANVISA ({item.maxText || item.maxNum} {item.unit})</span>}
                  {item.highDegradation && <span className="ml-2 text-amber-700">⚡ degradação {item.degradation?.toFixed(1)}% {">"} 20%</span>}
                </p>
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-xs text-red-700 font-medium">Decisão do técnico:</span>
                  <button
                    onClick={() => setAtivoDecision(prev => ({ ...prev, [item.param]: prev[item.param] === "reprova" ? null : "reprova" }))}
                    className={`text-xs px-3 py-1.5 rounded border font-semibold transition-colors ${
                      ativoDecision[item.param] === "reprova"
                        ? "bg-red-600 text-white border-red-600"
                        : "bg-white text-red-700 border-red-300 hover:bg-red-50"
                    }`}
                  >
                    ✗ Reprovar lote
                  </button>
                  <button
                    onClick={() => setAtivoDecision(prev => ({ ...prev, [item.param]: prev[item.param] === "refaz" ? null : "refaz" }))}
                    className={`text-xs px-3 py-1.5 rounded border font-semibold transition-colors ${
                      ativoDecision[item.param] === "refaz"
                        ? "bg-amber-500 text-white border-amber-500"
                        : "bg-white text-amber-700 border-amber-300 hover:bg-amber-50"
                    }`}
                  >
                    ↺ Refazer análise
                  </button>
                  {ativoDecision[item.param] === "reprova" && (
                    <span className="text-xs text-red-700 font-medium">→ Encaminhe para reprovação na aba de finalização do protocolo.</span>
                  )}
                  {ativoDecision[item.param] === "refaz" && (
                    <span className="text-xs text-amber-700 font-medium">→ Agende nova coleta e reanálise antes de gerar o certificado.</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        );
      })()}

      {/* Accelerated-only study warning banner */}
      {isAcceleratedOnly && (
        <div className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 flex gap-3 items-start">
          <span className="text-amber-500 text-lg leading-none mt-0.5">⚠️</span>
          <div className="space-y-1 text-[12px]">
            <p className="font-semibold text-amber-800">
              Estudo 100% acelerado{accTempC != null ? ` (${accTempC}°C)` : ""} — vida útil calculada <em>na temperatura acelerada</em>, não a 25°C
            </p>
            <p className="text-amber-700">
              Os valores abaixo refletem a cinética a {accTempC != null ? `${accTempC}°C` : "temperatura acelerada"}.
              Para obter a vida útil corrigida às condições reais de armazenamento (25°C/60%UR),
              adicione lotes de <strong>longa duração</strong> com os resultados correspondentes —
              o sistema calculará automaticamente a correção de Arrhenius (ICH Q1A(R2)).
            </p>
          </div>
        </div>
      )}

      {/* Summary card */}
      <Card className="border-green-200 bg-green-50">
        <CardContent className="pt-4">
          {/* Instruction when overage boxes are shown */}
          {(minOverageShelfLife != null || minBaselineExtrap30 != null) && (
            <p className="text-[11px] text-slate-500 mb-3 flex items-center gap-1">
              <span>👆</span> Clique em uma das caixas abaixo para usar aquele valor como <strong>Validade Adotada</strong> na tabela. A validade extrapolada a 30°C está no card roxo abaixo.
            </p>
          )}
          <div className={`flex items-start gap-4 ${minOverageShelfLife != null ? "flex-wrap" : ""}`}>

            {/* BOX 1 — Vida Útil Estimada SEM sobreformulação (c₀ = 100%) */}
            {(() => {
              const isSelectable = minBaselineShelfLife != null;
              const isSelected = selectedShelfBox === "standard";
              const stdVal = customShelfLife !== "" ? customShelfLife : (minBaselineShelfLife != null ? minBaselineShelfLife.toFixed(2) : "");
              return (
                <div
                  onClick={isSelectable ? () => {
                    const changing = selectedShelfBox !== "standard";
                    setSelectedShelfBox("standard");
                    if (changing && stdVal) applyShelfToValidade(stdVal, "standard");
                    else if (!changing) applyShelfToValidade(cardValidity, "standard");
                  } : undefined}
                  className={`flex-1 min-w-[160px] rounded-lg px-4 py-3 transition-all
                    ${isSelectable ? "cursor-pointer" : ""}
                    ${isSelected
                      ? "border-2 border-green-500 bg-green-100 shadow-md ring-2 ring-green-300"
                      : isSelectable
                        ? "border-2 border-green-200 bg-green-50 hover:border-green-400 hover:bg-green-100/70"
                        : "border-0 bg-transparent"
                    }`}
                >
                  <p className="text-xs text-green-700 font-medium uppercase tracking-wide mb-1 flex items-center gap-1.5">
                    Vida Útil Estimada (t<sub>validade</sub>)
                    {isSelected && <span className="text-[10px] bg-green-600 text-white rounded-full px-1.5 py-0.5 font-semibold normal-case">✓ em uso</span>}
                  </p>
                  <div className="flex items-center gap-2">
                    <input
                      value={stdVal}
                      onClick={(e) => e.stopPropagation()}
                      onChange={(e) => {
                        const val = e.target.value;
                        setCustomShelfLife(val);
                        persistOverrides(overrides, val);
                        if (selectedShelfBox === "standard" && val) applyShelfToValidade(val);
                      }}
                      className="w-28 text-3xl font-bold text-green-800 bg-green-100 border border-green-300 rounded px-2 py-0.5 focus:outline-none focus:ring-2 focus:ring-green-500 text-right tabular-nums"
                      placeholder={minBaselineShelfLife != null ? minBaselineShelfLife.toFixed(2) : "—"}
                    />
                    <span className="text-xl font-semibold text-green-700">meses</span>
                  </div>
                  {limitingBaselineParam && (
                    <div className="mt-2 inline-flex items-center gap-1.5 bg-amber-100 border border-amber-300 rounded-md px-2.5 py-1">
                      <span className="text-amber-600 text-xs">⚠</span>
                      <span className="text-xs font-semibold text-amber-800">Item limitante:</span>
                      <span className="text-xs font-bold text-amber-900">{limitingBaselineParam}</span>
                    </div>
                  )}
                  <p className="text-xs text-green-600 mt-1.5 opacity-60">
                    {customShelfLife !== ""
                      ? "Valor editado manualmente"
                      : "Sem sobreformulação — c₀ = 100%"}
                  </p>
                  {isSelectable && !isSelected && (
                    <p className="text-[10px] text-green-600 mt-1 font-medium">Clique para usar este valor ↓</p>
                  )}
                </div>
              );
            })()}

            {/* BOX 2 — Com Sobreformulação (exibido quando há overage implícito ou explícito) */}
            {minOverageShelfLife != null && (() => {
              const isSelected = selectedShelfBox === "overage";
              const overageVal = minOverageShelfLife.toFixed(2);
              // Determina origem do overage para o parâmetro limitante
              const limitingOv = limitingOverageParam ? overrides[limitingOverageParam] : null;
              const limitingLim = limitingOverageParam ? ativoLimits[limitingOverageParam] : null;
              const limitingManual = limitingLim?.overage ? parseFloat(limitingLim.overage.replace(",", ".")) : NaN;
              const limitingActualT0 = limitingOv ? (parseFloat(limitingOv.t0) || 100) : 100;
              const limitingImplicit = Math.max(0, limitingActualT0 - 100);
              const overageIsImplicit = (isNaN(limitingManual) || limitingManual <= 0) && limitingImplicit > 0;
              const effectiveOveragePct = overageIsImplicit ? limitingImplicit : (!isNaN(limitingManual) ? limitingManual : 0);
              return (
                <div
                  onClick={() => {
                    const changing = selectedShelfBox !== "overage";
                    setSelectedShelfBox("overage");
                    if (changing) applyShelfToValidade(overageVal, "overage");
                    else applyShelfToValidade(cardValidity, "overage");
                  }}
                  className={`flex-1 min-w-[160px] rounded-lg px-4 py-3 cursor-pointer transition-all
                    ${isSelected
                      ? "border-2 border-blue-500 bg-blue-100 shadow-md ring-2 ring-blue-300"
                      : "border-2 border-blue-200 bg-blue-50 hover:border-blue-400 hover:bg-blue-100/70"
                    }`}
                >
                  <p className="text-xs text-blue-700 font-medium uppercase tracking-wide mb-1 flex items-center gap-1.5">
                    <span>📦</span>
                    {allHaveOverage ? "Com Sobreformulação" : "Com Sobreformulação (parcial)"}
                    {isSelected && <span className="text-[10px] bg-blue-600 text-white rounded-full px-1.5 py-0.5 font-semibold normal-case">✓ em uso</span>}
                  </p>
                  <div className="flex items-center gap-2">
                    <span className="text-3xl font-bold text-blue-800 tabular-nums">
                      {overageVal}
                    </span>
                    <span className="text-xl font-semibold text-blue-700">meses</span>
                  </div>
                  {limitingOverageParam && (
                    <div className="mt-2 inline-flex items-center gap-1.5 bg-blue-100 border border-blue-300 rounded-md px-2.5 py-1">
                      <span className="text-blue-600 text-xs">⚠</span>
                      <span className="text-xs font-semibold text-blue-800">Item limitante:</span>
                      <span className="text-xs font-bold text-blue-900">{limitingOverageParam}</span>
                    </div>
                  )}
                  <p className="text-xs text-blue-600 mt-1.5 opacity-80">
                    {overageIsImplicit
                      ? `c₀ = T₀ = ${limitingActualT0.toFixed(2)}% (+${limitingImplicit.toFixed(2)}% impl.)`
                      : `c₀ = 100 + ${effectiveOveragePct.toFixed(2)}% declarado`}
                  </p>
                  {!allHaveOverage && (
                    <p className="text-[10px] text-blue-500 mt-0.5">⚠ Valor parcial — nem todos os ativos têm overage</p>
                  )}
                  {!isSelected && (
                    <p className="text-[10px] text-blue-600 mt-1 font-medium">Clique para usar este valor ↓</p>
                  )}
                </div>
              );
            })()}

            {/* BOX 3 — Validade Praticada */}
            <div className="flex-1 min-w-[160px] text-right">
              <p className="text-xs text-green-700 font-medium uppercase tracking-wide mb-1">Validade Praticada</p>
              <div className="flex items-center gap-2 justify-end">
                <input
                  value={cardValidity}
                  onChange={(e) => {
                    const val = e.target.value;
                    // Digitar manualmente fixa o valor — caixinhas não podem mais sobrescrever.
                    setValidityLockedByUser(true);
                    setCardValidity(val);
                    setOverrides(prev => {
                      const next: Record<string, KineticOverride> = {};
                      for (const [key, ov] of Object.entries(prev)) {
                        next[key] = { ...ov, validadePraticada: val };
                      }
                      return next;
                    });
                    setIsDirty(true);
                    try {
                      const stored = readLs();
                      const updatedOvs: Record<string, KineticOverride> = {};
                      for (const [key, ov] of Object.entries(stored.overrides ?? {})) {
                        updatedOvs[key] = { ...(ov as KineticOverride), validadePraticada: val };
                      }
                      localStorage.setItem(LS_KEY, JSON.stringify({ ...stored, cardValidity: val, validityLockedByUser: true, overrides: updatedOvs }));
                    } catch { /* ignore */ }
                    const num = parseInt(val, 10);
                    debouncedSave({ validityMonths: isNaN(num) ? null : num });
                  }}
                  className="w-20 text-2xl font-bold text-green-800 bg-green-100 border border-green-300 rounded px-2 py-0.5 focus:outline-none focus:ring-2 focus:ring-green-500 text-right"
                  placeholder="—"
                />
                <span className="text-lg font-semibold text-green-700">meses</span>
              </div>
              <p className="text-xs text-green-700 mt-1">valor adotado no produto</p>
              <p className="text-[11px] text-green-600/80 mt-0.5 flex items-center gap-1 justify-end">
                <span>✓</span> Exibido no Certificado de Análise e Relatório ANVISA
              </p>
              {selectedShelfBox != null && (
                <p className="text-[10px] text-slate-500 mt-1">
                  Origem: {
                    selectedShelfBox === "overage" ? "📦 Com overage (40°C)" :
                    selectedShelfBox === "extrap_std" ? "📐 Extrapolado 30°C — sem overage" :
                    selectedShelfBox === "extrap_overage" ? "📐 Extrapolado 30°C — com overage" :
                    "Sem overage (40°C)"
                  }
                </p>
              )}
            </div>

          </div>
        </CardContent>
      </Card>

      {/* ── Arrhenius Extrapolation Card — 30°C ── */}
      {minBaselineExtrap30 != null && (
        <Card className="border-violet-200 bg-violet-50">
          <CardContent className="pt-4">
            {/* Header + FA info */}
            <div className="flex flex-wrap items-start justify-between gap-3 mb-4">
              <div>
                <p className="text-xs text-violet-700 font-semibold uppercase tracking-wide flex items-center gap-1.5 mb-0.5">
                  <span>📐</span> Validade Extrapolada — Arrhenius 30°C
                </p>
                <p className="text-[11px] text-violet-600">
                  Extrapolação da vida útil calculada a 40°C para 30°C usando equação de Arrhenius (ICH Q1E).
                  Clique em um dos valores para usá-lo como <strong>Validade Adotada</strong>.
                </p>
              </div>
              <div className="rounded-md border border-violet-300 bg-violet-100 px-3 py-2 text-right shrink-0">
                <p className="text-[10px] text-violet-500 uppercase tracking-wide font-medium">Fator de Aceleração (FA)</p>
                <p className="text-xl font-bold text-violet-800 tabular-nums">{arrheniusFactor.toFixed(4)}</p>
                <p className="text-[10px] text-violet-500 mt-0.5">
                  e<sup>[83140/8,314 · (1/303,15 − 1/313,15)]</sup>
                </p>
              </div>
            </div>

            <div className="flex items-start gap-4 flex-wrap">
              {/* BOX Extrapolado — Sem sobreformulação */}
              {(() => {
                const isSelected = selectedShelfBox === "extrap_std";
                const extrapVal = minBaselineExtrap30.toFixed(2);
                return (
                  <div
                    onClick={() => {
                      const changing = selectedShelfBox !== "extrap_std";
                      setSelectedShelfBox("extrap_std");
                      if (changing) applyShelfToValidade(extrapVal, "extrap_std");
                      else applyShelfToValidade(cardValidity, "extrap_std");
                    }}
                    className={`flex-1 min-w-[160px] rounded-lg px-4 py-3 cursor-pointer transition-all
                      ${isSelected
                        ? "border-2 border-violet-500 bg-violet-100 shadow-md ring-2 ring-violet-300"
                        : "border-2 border-violet-200 bg-violet-50 hover:border-violet-400 hover:bg-violet-100/70"
                      }`}
                  >
                    <p className="text-xs text-violet-700 font-medium uppercase tracking-wide mb-1 flex items-center gap-1.5">
                      Extrapolada 30°C — sem overage
                      {isSelected && <span className="text-[10px] bg-violet-600 text-white rounded-full px-1.5 py-0.5 font-semibold normal-case">✓ em uso</span>}
                    </p>
                    <div className="flex items-center gap-2">
                      <span className="text-3xl font-bold text-violet-800 tabular-nums">{extrapVal}</span>
                      <span className="text-xl font-semibold text-violet-700">meses</span>
                    </div>
                    {limitingBaselineParam && (
                      <div className="mt-2 inline-flex items-center gap-1.5 bg-amber-100 border border-amber-300 rounded-md px-2.5 py-1">
                        <span className="text-amber-600 text-xs">⚠</span>
                        <span className="text-xs font-semibold text-amber-800">Item limitante:</span>
                        <span className="text-xs font-bold text-amber-900">{limitingBaselineParam}</span>
                      </div>
                    )}
                    <p className="text-[10px] text-violet-500 mt-1.5">
                      = {minBaselineShelfLife!.toFixed(2)} meses (40°C) × FA {arrheniusFactor.toFixed(4)}
                    </p>
                    {!isSelected && (
                      <p className="text-[10px] text-violet-600 mt-1 font-medium">Clique para usar este valor ↓</p>
                    )}
                  </div>
                );
              })()}

              {/* BOX Extrapolado — Com sobreformulação */}
              {minOverageExtrap30 != null && (() => {
                const isSelected = selectedShelfBox === "extrap_overage";
                const extrapOvVal = minOverageExtrap30.toFixed(2);
                return (
                  <div
                    onClick={() => {
                      const changing = selectedShelfBox !== "extrap_overage";
                      setSelectedShelfBox("extrap_overage");
                      if (changing) applyShelfToValidade(extrapOvVal, "extrap_overage");
                      else applyShelfToValidade(cardValidity, "extrap_overage");
                    }}
                    className={`flex-1 min-w-[160px] rounded-lg px-4 py-3 cursor-pointer transition-all
                      ${isSelected
                        ? "border-2 border-violet-500 bg-violet-100 shadow-md ring-2 ring-violet-300"
                        : "border-2 border-violet-200 bg-violet-50 hover:border-violet-400 hover:bg-violet-100/70"
                      }`}
                  >
                    <p className="text-xs text-violet-700 font-medium uppercase tracking-wide mb-1 flex items-center gap-1.5">
                      <span>📦</span> Extrapolada 30°C — com overage
                      {isSelected && <span className="text-[10px] bg-violet-600 text-white rounded-full px-1.5 py-0.5 font-semibold normal-case">✓ em uso</span>}
                    </p>
                    <div className="flex items-center gap-2">
                      <span className="text-3xl font-bold text-violet-800 tabular-nums">{extrapOvVal}</span>
                      <span className="text-xl font-semibold text-violet-700">meses</span>
                    </div>
                    {limitingOverageParam && (
                      <div className="mt-2 inline-flex items-center gap-1.5 bg-amber-100 border border-amber-300 rounded-md px-2.5 py-1">
                        <span className="text-amber-600 text-xs">⚠</span>
                        <span className="text-xs font-semibold text-amber-800">Item limitante:</span>
                        <span className="text-xs font-bold text-amber-900">{limitingOverageParam}</span>
                      </div>
                    )}
                    <p className="text-[10px] text-violet-500 mt-1.5">
                      = {minOverageShelfLife!.toFixed(2)} meses (40°C) × FA {arrheniusFactor.toFixed(4)}
                    </p>
                    {!isSelected && (
                      <p className="text-[10px] text-violet-600 mt-1 font-medium">Clique para usar este valor ↓</p>
                    )}
                  </div>
                );
              })()}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Calculation matrix — matches Excel layout */}
      <div className="rounded-md border overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/40">
              <TableHead className="text-xs">Parâmetro</TableHead>
              <TableHead className="text-right text-xs whitespace-nowrap">Média T0 (%)</TableHead>
              <TableHead className="text-right text-xs whitespace-nowrap">Média T3 (%)</TableHead>
              <TableHead className="text-right text-xs whitespace-nowrap">Média T6 (%)</TableHead>
              <TableHead className="text-right text-xs bg-amber-50/60 whitespace-nowrap">Vida Útil Calculada (meses)</TableHead>
              <TableHead className="text-right text-xs whitespace-nowrap">Validade Adotada (meses)</TableHead>
              <TableHead className="text-right text-xs whitespace-nowrap">Espec. mín – máx (%)</TableHead>
              <TableHead className="text-right text-xs whitespace-nowrap bg-indigo-50/50">Valor em mg/mcg (T6)</TableHead>
              <TableHead className="text-right text-xs whitespace-nowrap bg-amber-50/80">
                Overage Recomendado
                <span className="block text-[9px] font-normal text-amber-500 normal-case">para ≥ 90% no prazo</span>
              </TableHead>
              <TableHead className="w-8" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {kinetics.parameters.map((p) => {
              const ov = overrides[p.parameter];
              if (!ov) return null;
              const shelfNum = parseFloat(ov.shelfLife);
              const isLimiting = p.parameter === limitingBaselineParam;
              return (
                <TableRow key={p.parameter} className={isLimiting ? "bg-amber-50/40" : ""}>
                  <TableCell className="font-medium text-sm">{p.parameter}</TableCell>
                  <TableCell className="text-right py-2">
                    <EditableNum value={ov.t0} onChange={(v) => setField(p.parameter, "t0", v)} width="w-20" placeholder="T0" highlighted={manualFields[p.parameter]?.includes("t0") ?? false} />
                  </TableCell>
                  <TableCell className="text-right py-2">
                    <EditableNum value={ov.t3} onChange={(v) => setField(p.parameter, "t3", v)} width="w-20" placeholder="T3" highlighted={manualFields[p.parameter]?.includes("t3") ?? false} />
                  </TableCell>
                  <TableCell className="text-right py-2">
                    <EditableNum value={ov.t6} onChange={(v) => setField(p.parameter, "t6", v)} width="w-20" placeholder="T6" highlighted={manualFields[p.parameter]?.includes("t6") ?? false} />
                  </TableCell>
                  {/* Vida Útil Calculada — computed via ICH Q1A(R2); Δln/k/limiar run silently */}
                  <TableCell className="text-right py-2 bg-amber-50/30">
                    {(() => {
                      const overageShelf = overageAdjustedShelfLives[p.parameter];
                      const lim = ativoLimits[p.parameter];
                      const ichThresholdPct = parseFloat(ov.ichThreshold) || 90;
                      const manualOveragePct = lim?.overage ? parseFloat(lim.overage.replace(",", ".")) : NaN;
                      const k = parseFloat(ov.k);
                      const actualT0Display = parseFloat(ov.t0) || 100;
                      const implicitOveragePct = Math.max(0, actualT0Display - 100);
                      // Prioridade: manual > implícito (T0 > 100%)
                      const effectiveOverage = (!isNaN(manualOveragePct) && manualOveragePct > 0)
                        ? manualOveragePct : implicitOveragePct;
                      const isImplicitOverage = (isNaN(manualOveragePct) || manualOveragePct <= 0) && implicitOveragePct > 0;
                      const declaredNum = lim?.declared ? parseFloat(lim.declared.replace(",", ".")) : NaN;
                      const minRaw = lim?.min ? parseFloat((lim.min).replace(",", ".")) : NaN;
                      const maxRaw = lim?.max ? parseFloat((lim.max).replace(",", ".")) : NaN;
                      const hasValidOverage = effectiveOverage > 0 && !isNaN(k) && k > 0 && overageShelf != null;

                      // Quantidade real esperada no fim da validade adotada com overage
                      // C(t) = (100 + effectiveOverage) × e^(−k×t) / 100 × declared
                      const validadeMeses = parseFloat(ov.validadePraticada);
                      const qtyAtEnd = hasValidOverage && !isNaN(validadeMeses) && validadeMeses > 0 && !isNaN(declaredNum) && declaredNum > 0
                        ? ((100 + effectiveOverage) * Math.exp(-k * validadeMeses) / 100) * declaredNum
                        : null;
                      const qtyAtEndPct = hasValidOverage && !isNaN(validadeMeses) && validadeMeses > 0
                        ? (100 + effectiveOverage) * Math.exp(-k * validadeMeses)
                        : null;
                      // Epsilon de 0.005 mg para evitar falso negativo por ponto flutuante
                      const qtyOk = qtyAtEnd != null
                        ? (!isNaN(minRaw) ? qtyAtEnd >= minRaw - 0.005 : true) && (!isNaN(maxRaw) ? qtyAtEnd <= maxRaw + 0.005 : true)
                        : qtyAtEndPct != null ? qtyAtEndPct >= ichThresholdPct - 0.001 : null;

                      return (
                        <div className="flex flex-col items-end gap-0.5">
                          {/* Baseline shelf life — c₀ = 100% (same formula as BOX 1) */}
                          {(() => {
                            const baselineShelf = baselineShelfLivesMap[p.parameter];
                            const displayVal = baselineShelf != null && baselineShelf > 0
                              ? baselineShelf.toFixed(2)
                              : (!isNaN(shelfNum) && shelfNum > 0 ? shelfNum.toFixed(2) : null);
                            const ichThr = parseFloat(ov.ichThreshold) || 90;
                            return (
                              <div className="flex items-center gap-1.5">
                                {hasValidOverage && (
                                  <span
                                    className="text-[9px] text-muted-foreground cursor-help"
                                    title={`Sem sobreformulação: c₀ = 100% → −ln(${ichThr}%/100%) ÷ k = ${displayVal} m`}
                                  >sem overage:</span>
                                )}
                                <span
                                  className={`text-sm font-bold tabular-nums ${isLimiting && !hasValidOverage ? "text-amber-700" : "text-green-700"}`}
                                  title={`c₀ = 100% → −ln(${ichThr}%/100%) ÷ k = ${displayVal} m`}
                                >
                                  {displayVal != null ? `${displayVal} m` : "—"}
                                </span>
                              </div>
                            );
                          })()}
                          {/* Overage-adjusted shelf life */}
                          {hasValidOverage && (
                            <div className="flex flex-col items-end gap-0.5">
                              <div className="flex items-center gap-1">
                                <span className="text-[9px] text-blue-500">
                                  {isImplicitOverage
                                    ? `↑${implicitOveragePct.toFixed(2)}% impl.:`
                                    : `+${effectiveOverage.toFixed(2)}% overage:`}
                                </span>
                                <span className="text-sm font-bold tabular-nums text-blue-700">
                                  {overageShelf.toFixed(2)} m
                                </span>
                              </div>
                              {/* Quantidade real no fim da validade adotada */}
                              {qtyAtEnd != null && !isNaN(validadeMeses) && validadeMeses > 0 && (
                                <div
                                  className={`flex items-center gap-1 text-[9px] cursor-help ${qtyOk ? "text-green-600" : "text-red-600"}`}
                                  title={`C(${validadeMeses}m) = (100+${effectiveOverage}) × e^(−${k.toFixed(6)}×${validadeMeses}) = ${qtyAtEndPct?.toFixed(2)}% → ${qtyAtEnd.toFixed(2)} ${lim?.unit ?? ""}`}
                                >
                                  {qtyOk ? "✓" : "⚠"} {qtyAtEnd.toFixed(2)} {lim?.unit ?? ""} em {validadeMeses}m
                                </div>
                              )}
                              {/* Cálculo em % quando não há quantidade declarada */}
                              {qtyAtEnd == null && qtyAtEndPct != null && !isNaN(validadeMeses) && validadeMeses > 0 && (
                                <div
                                  className={`flex items-center gap-1 text-[9px] cursor-help ${qtyOk ? "text-green-600" : "text-red-600"}`}
                                  title={`C(${validadeMeses}m) = (100+${effectiveOverage}) × e^(−${k.toFixed(6)}×${validadeMeses}) = ${qtyAtEndPct.toFixed(2)}% (especifique quantidade declarada para ver em ${lim?.unit ?? "mg"})`}
                                >
                                  {qtyOk ? "✓" : "⚠"} {qtyAtEndPct.toFixed(2)}% em {validadeMeses}m
                                </div>
                              )}
                              {/* Tooltip com conta completa */}
                              <span
                                className="text-[8px] text-blue-300 tabular-nums cursor-help"
                                title={`−ln(${ichThresholdPct.toFixed(2)}%/(100+${effectiveOverage.toFixed(2)})) / k = ${overageShelf.toFixed(2)} meses${isImplicitOverage ? " [overage implícito: T0−100]" : ""}`}
                              >
                                −ln({ichThresholdPct.toFixed(2)}%/{(100+effectiveOverage).toFixed(2)}%) ÷ k
                              </span>
                            </div>
                          )}

                          {/* Extrapolação Arrhenius 30°C — sem overage */}
                          {baselineExtrap30Map[p.parameter] != null && (
                            <div className={`flex items-center gap-1 mt-1 pt-1 border-t border-violet-200 ${selectedShelfBox === "extrap_std" || selectedShelfBox === "extrap_overage" ? "opacity-100" : "opacity-50"}`}>
                              <span className="text-[9px] text-violet-500">📐 30°C sem ov.:</span>
                              <span className={`text-sm font-bold tabular-nums text-violet-700 ${selectedShelfBox === "extrap_std" ? "underline decoration-violet-400 decoration-2" : ""}`}>
                                {baselineExtrap30Map[p.parameter].toFixed(2)} m
                              </span>
                            </div>
                          )}
                          {/* Extrapolação Arrhenius 30°C — com overage */}
                          {overageExtrap30Map[p.parameter] != null && (
                            <div className={`flex items-center gap-1 ${selectedShelfBox === "extrap_std" || selectedShelfBox === "extrap_overage" ? "opacity-100" : "opacity-50"}`}>
                              <span className="text-[9px] text-violet-500">📐 30°C + ov.:</span>
                              <span className={`text-sm font-bold tabular-nums text-violet-700 ${selectedShelfBox === "extrap_overage" ? "underline decoration-violet-400 decoration-2" : ""}`}>
                                {overageExtrap30Map[p.parameter].toFixed(2)} m
                              </span>
                            </div>
                          )}
                        </div>
                      );
                    })()}
                  </TableCell>
                  <TableCell className="text-right py-2">
                    <EditableNum value={ov.validadePraticada} onChange={(v) => setField(p.parameter, "validadePraticada", v)} placeholder="ex: 24" />
                  </TableCell>
                  {/* Espec. mín–máx — spec/criterion range, informational only */}
                  <TableCell className="text-right py-2">
                    <div className="flex items-center justify-end gap-1">
                      <EditableNum value={ov.specMin} onChange={(v) => setField(p.parameter, "specMin", v)} width="w-14" placeholder="mín" />
                      <span className="text-muted-foreground text-xs">–</span>
                      <EditableNum value={ov.specMax} onChange={(v) => setField(p.parameter, "specMax", v)} width="w-14" placeholder="máx" />
                    </div>
                  </TableCell>
                  {/* Valor absoluto em mg/mcg calculado a partir de T6% × declarado */}
                  <TableCell className="text-right py-2 bg-indigo-50/30">
                    {(() => {
                      const lim = ativoLimits[p.parameter];
                      if (!lim?.declared) return <span className="text-xs text-muted-foreground">—</span>;
                      const t6Num = parseFloat(ov.t6);
                      const declaredNum = parseFloat(lim.declared.replace(",", "."));
                      if (isNaN(t6Num) || isNaN(declaredNum)) return <span className="text-xs text-muted-foreground">—</span>;

                      // Quando overage está definido, o produto foi fabricado com quantidade maior
                      // (Mfg = declarado × (1 + overage%/100)). O T6% é medido sobre essa
                      // quantidade fabricada, portanto actualMg = T6% × Mfg.
                      const overagePctV = lim?.overage ? parseFloat(lim.overage.replace(",", ".")) : NaN;
                      const hasOvg = !isNaN(overagePctV) && overagePctV > 0;
                      const mfgNum = hasOvg ? declaredNum * (1 + overagePctV / 100) : declaredNum;
                      const actualMg = (t6Num / 100) * mfgNum;
                      // T6% efetivo em relação ao declarado (> T6% quando há overage)
                      const effT6Pct = hasOvg ? t6Num * (1 + overagePctV / 100) : t6Num;

                      const minRaw = parseFloat((lim.min ?? "").replace(",", "."));
                      const maxRaw = parseFloat((lim.max ?? "").replace(",", "."));
                      const minNum = isNaN(minRaw) ? null : minRaw;
                      const maxNum = isNaN(maxRaw) ? null : maxRaw;
                      const isNEorLivre = (s: string) => { const u = s.trim().toUpperCase(); return u === "NE" || u === "LIVRE"; };
                      const minIsNE = isNEorLivre(lim.min ?? "");
                      const maxIsNE = isNEorLivre(lim.max ?? "");
                      const t0Num = parseFloat(ov.t0);
                      const degradation = !isNaN(t0Num) && t0Num > 0 ? ((t0Num - effT6Pct) / t0Num) * 100 : null;
                      const belowMin = minNum !== null && !minIsNE && actualMg < minNum;
                      const aboveMax = maxNum !== null && !maxIsNE && actualMg > maxNum;
                      // highDegradation (ICH 80% = >20% queda de T0) só é usado como fallback
                      // quando NÃO há spec min real cadastrada. Se lim.min está preenchido,
                      // belowMin já cobre o critério mínimo com o valor real da faixa.
                      const hasExplicitMin = minNum !== null && !minIsNE;
                      const highDegradation = !hasExplicitMin && degradation !== null && degradation > 20;
                      const isOutOfRange = belowMin || aboveMax || highDegradation;
                      // Build range label — "NE" (Não Especificado) displays as "Livre"
                      const faixaLabel = (() => {
                        if (minNum !== null && maxNum !== null) return `${lim.min} – ${lim.max} ${lim.unit}`;
                        if (minIsNE && maxNum !== null) return `Livre – ${lim.max} ${lim.unit}`;
                        if (maxIsNE && minNum !== null) return `${lim.min} – Livre ${lim.unit}`;
                        if (minNum !== null) return `≥ ${lim.min} ${lim.unit}`;
                        if (maxNum !== null) return `≤ ${lim.max} ${lim.unit}`;
                        if (minIsNE || maxIsNE) return `Livre ${lim.unit}`;
                        return null;
                      })();
                      return (
                        <div className="flex flex-col items-end gap-0.5">
                          {/* Base de cálculo: Mfg quando há overage, declarado caso contrário */}
                          {hasOvg && (
                            <span
                              className="text-[9px] text-amber-600 tabular-nums cursor-help"
                              title={`Mfg = ${declaredNum} × (1 + ${overagePctV}%) = ${mfgNum.toFixed(2)} ${lim.unit} — base de cálculo com overage`}
                            >
                              Mfg: {mfgNum.toFixed(2)} {lim.unit}
                            </span>
                          )}
                          <span
                            className={`text-sm font-bold tabular-nums ${isOutOfRange ? "text-red-700" : "text-indigo-700"}`}
                            title={hasOvg ? `T6 (${t6Num}%) × Mfg (${mfgNum.toFixed(2)} ${lim.unit}) = ${actualMg.toFixed(2)} ${lim.unit}` : undefined}
                          >
                            {actualMg.toFixed(2)} {lim.unit}
                          </span>
                          {/* T6% efetivo vs declarado quando overage está ativo */}
                          {hasOvg && (
                            <span
                              className="text-[9px] text-amber-500 tabular-nums cursor-help"
                              title={`T6 efetivo vs declarado = ${t6Num}% × (1 + ${overagePctV}%) = ${effT6Pct.toFixed(2)}%`}
                            >
                              efetivo: {effT6Pct.toFixed(2)}% vs declarado
                            </span>
                          )}
                          {faixaLabel && (
                            <span className="text-[10px] text-indigo-400 tabular-nums">faixa: {faixaLabel}</span>
                          )}
                          {isOutOfRange && (
                            <span className="text-[10px] text-red-600 font-semibold">⚠ fora da faixa</span>
                          )}
                          {!isOutOfRange && faixaLabel && (
                            <span className="text-[10px] text-green-600">✓ dentro da faixa</span>
                          )}
                        </div>
                      );
                    })()}
                  </TableCell>
                  {/* Overage Recomendado — T0 mínimo para atingir spec min real ao fim da validade */}
                  <TableCell className="text-right py-2 bg-amber-50/20">
                    {(() => {
                      const lim = ativoLimits[p.parameter];
                      const k = parseFloat(ov.k);
                      const t0 = parseFloat(ov.t0);
                      const validadeMeses = parseFloat(ov.validadePraticada);
                      const currentOveragePct = lim?.overage ? parseFloat(lim.overage.replace(",", ".")) : 0;
                      const declaredNum = lim?.declared ? parseFloat(lim.declared.replace(",", ".")) : NaN;
                      const maxRaw = lim?.max ? parseFloat((lim.max).replace(",", ".")) : NaN;
                      const unit = lim?.unit ?? "";

                      // Threshold de estabilidade: sempre segue o ICH Q1A(R2) / Arrhenius — lim.min
                      // representa conformidade de rotulagem ANVISA, não o piso cinético.
                      const isNEorLivre = (s: string) => { const u = (s ?? "").trim().toUpperCase(); return u === "NE" || u === "LIVRE" || u === ""; };
                      const specMinPct: number = parseFloat(ov.ichThreshold) || 90;
                      const specMinLabel: string = `${specMinPct}%`;
                      // Max em % para verificar teto
                      const specMaxPct = !isNaN(maxRaw) && !isNaN(declaredNum) && declaredNum > 0 && !isNEorLivre(lim?.max ?? "")
                        ? (maxRaw / declaredNum) * 100 : null;

                      if (isNaN(validadeMeses) || validadeMeses <= 0) {
                        return <span className="text-[10px] text-muted-foreground">defina a validade adotada</span>;
                      }

                      if (isNaN(k) || k <= 0) {
                        return (
                          <div className="flex flex-col items-end gap-1">
                            <span className="text-xs text-green-600 font-medium">✓ estável</span>
                            <span className="text-[10px] text-green-500">sem overage necessário</span>
                            {onApplyOverage && currentOveragePct > 0 && (
                              <button
                                onClick={() => onApplyOverage(p.parameter, "0")}
                                className="text-[10px] px-1.5 py-0.5 rounded border border-green-300 text-green-700 hover:bg-green-50 transition-colors"
                                title="Zerar overage — ingrediente estável, não precisa"
                              >✗ zerar overage</button>
                            )}
                          </div>
                        );
                      }

                      // T0 mínimo para C(validadeMeses) ≥ specMinPct
                      // C(t) = T0 × e^(−kReal×t) ≥ specMinPct  →  T0 ≥ specMinPct × e^(kReal×t)
                      // kReal: k corrigido pelo Fator de Arrhenius quando estudo é acelerado-only (40°C).
                      // Se o estudo tem dados long-term, k já está nas condições reais → sem correção.
                      const kReal = isAcceleratedOnly ? k / arrheniusFactor : k;
                      const t0Required = specMinPct * Math.exp(kReal * validadeMeses);
                      const overageRequired = Math.max(0, t0Required - 100);

                      // Quantidade real no fabricação (T0 com overage)
                      const mfgQty = !isNaN(declaredNum) && declaredNum > 0
                        ? declaredNum * (1 + overageRequired / 100) : null;

                      // Quantidade real esperada no fim da validade com overage recomendado
                      const qtyAtEndRec = !isNaN(declaredNum) && declaredNum > 0
                        ? (t0Required * Math.exp(-kReal * validadeMeses) / 100) * declaredNum : null;

                      // Projeção com T0 medido atual
                      const projectedCurrent = !isNaN(t0) && t0 > 0 ? t0 * Math.exp(-kReal * validadeMeses) : NaN;
                      const measuredT0Ok = !isNaN(projectedCurrent) && projectedCurrent >= specMinPct
                        && (specMaxPct == null || projectedCurrent <= specMaxPct);

                      // Projeção com overage configurado (100 + currentOveragePct%)
                      const t0WithOverage = 100 + (isNaN(currentOveragePct) ? 0 : currentOveragePct);
                      const projectedWithOverage = t0WithOverage * Math.exp(-kReal * validadeMeses);
                      const qtyWithOverage = !isNaN(declaredNum) && declaredNum > 0
                        ? (projectedWithOverage / 100) * declaredNum : null;
                      // Epsilon de 0.001% para evitar falso negativo por ponto flutuante
                      const configuredOverageOk = currentOveragePct > 0
                        && projectedWithOverage >= specMinPct - 0.001
                        && (specMaxPct == null || projectedWithOverage <= specMaxPct + 0.001);

                      if (overageRequired === 0 || measuredT0Ok) {
                        if (currentOveragePct > 0 && configuredOverageOk) {
                          return (
                            <div className="flex flex-col items-end gap-1">
                              <span className="text-xs text-green-600 font-medium">✓ dentro da faixa</span>
                              <span className="text-[10px] text-green-500">overage +{currentOveragePct}% suficiente</span>
                              {qtyWithOverage != null && (
                                <span className="text-[10px] text-green-600 tabular-nums">
                                  {qtyWithOverage.toFixed(2)} {unit} em {validadeMeses}m
                                </span>
                              )}
                            </div>
                          );
                        }
                        return (
                          <div className="flex flex-col items-end gap-1">
                            <span className="text-xs text-green-600 font-medium">✓ dentro da faixa</span>
                            <span className="text-[10px] text-green-500">sem overage necessário</span>
                            {onApplyOverage && currentOveragePct > 0 && (
                              <button
                                onClick={() => onApplyOverage(p.parameter, "0")}
                                className="text-[10px] px-1.5 py-0.5 rounded border border-green-300 text-green-700 hover:bg-green-50 transition-colors"
                                title="Zerar overage — estável no prazo, não precisa"
                              >✗ zerar overage</button>
                            )}
                          </div>
                        );
                      }

                      // Arredondar para CIMA (teto) em 1 casa decimal para garantir
                      // que o overage aplicado sempre entregue ≥ specMin no prazo.
                      const recStr = (Math.ceil(overageRequired * 10) / 10).toFixed(1);

                      if (currentOveragePct > 0 && !configuredOverageOk) {
                        return (
                          <div className="flex flex-col items-end gap-1">
                            <span className="text-[10px] text-amber-700">atual +{currentOveragePct}% insuficiente</span>
                            <span className="text-xs text-amber-800 font-bold">↑ rec.: +{recStr}%</span>
                            {mfgQty && <span className="text-[10px] text-muted-foreground" title={`Quantidade a fabricar: ${mfgQty.toFixed(2)} ${unit}`}>{mfgQty.toFixed(2)} {unit} mfg.</span>}
                            {qtyAtEndRec != null && (
                              <span className="text-[10px] text-amber-600 tabular-nums">→ {qtyAtEndRec.toFixed(2)} {unit} em {validadeMeses}m</span>
                            )}
                            {onApplyOverage && (
                              <>
                                <button
                                  onClick={() => {
                                    setKineticOverageUndo({ param: p.parameter, prevValue: lim?.overage ?? "" });
                                    onApplyOverage(p.parameter, recStr);
                                  }}
                                  className="text-[10px] px-2 py-0.5 rounded border border-amber-400 bg-amber-50 text-amber-800 hover:bg-amber-100 font-semibold transition-colors"
                                  title={`Aplicar overage de +${recStr}% para garantir ≥ ${specMinLabel} em ${validadeMeses} meses`}
                                >↑ aplicar +{recStr}%</button>
                                {kineticOverageUndo?.param === p.parameter && (
                                  <button
                                    onClick={() => {
                                      onApplyOverage(p.parameter, kineticOverageUndo.prevValue);
                                      setKineticOverageUndo(null);
                                    }}
                                    className="text-[10px] px-2 py-0.5 rounded border border-slate-300 bg-white text-slate-600 hover:bg-slate-50 font-semibold transition-colors"
                                    title="Desfazer — voltar ao overage anterior"
                                  >↩ desfazer</button>
                                )}
                              </>
                            )}
                          </div>
                        );
                      }

                      return (
                        <div className="flex flex-col items-end gap-1">
                          <span className="text-xs text-amber-800 font-bold">↑ rec.: +{recStr}%</span>
                          {mfgQty && <span className="text-[10px] text-muted-foreground">{mfgQty.toFixed(2)} {unit} mfg.</span>}
                          {qtyAtEndRec != null && (
                            <span className="text-[10px] text-amber-600 tabular-nums">→ {qtyAtEndRec.toFixed(2)} {unit} em {validadeMeses}m</span>
                          )}
                          <span className="text-[10px] text-amber-600">para ≥ {specMinLabel} em {validadeMeses}m</span>
                          {onApplyOverage && (
                            <>
                              <button
                                onClick={() => {
                                  setKineticOverageUndo({ param: p.parameter, prevValue: lim?.overage ?? "" });
                                  onApplyOverage(p.parameter, recStr);
                                }}
                                className="text-[10px] px-2 py-0.5 rounded border border-amber-400 bg-amber-50 text-amber-800 hover:bg-amber-100 font-semibold transition-colors"
                                title={`Aplicar overage de +${recStr}% para garantir ≥ ${specMinLabel} em ${validadeMeses} meses`}
                              >↑ aplicar +{recStr}%</button>
                              {kineticOverageUndo?.param === p.parameter && (
                                <button
                                  onClick={() => {
                                    onApplyOverage(p.parameter, kineticOverageUndo.prevValue);
                                    setKineticOverageUndo(null);
                                  }}
                                  className="text-[10px] px-2 py-0.5 rounded border border-slate-300 bg-white text-slate-600 hover:bg-slate-50 font-semibold transition-colors"
                                  title="Desfazer — voltar ao overage anterior"
                                >↩ desfazer</button>
                              )}
                            </>
                          )}
                        </div>
                      );
                    })()}
                  </TableCell>
                  <TableCell className="py-2 text-center">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 text-muted-foreground hover:text-red-600 hover:bg-red-50"
                      title="Remover parâmetro da tabela cinética"
                      onClick={() => {
                        setDeleteConfirm({ param: p.parameter });
                        setDeletePassword("");
                        setDeleteError("");
                      }}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

      {/* Delete parameter confirmation dialog */}
      <AlertDialog open={deleteConfirm !== null} onOpenChange={(open) => { if (!open) { setDeleteConfirm(null); setDeletePassword(""); setDeleteError(""); } }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="text-red-700 flex items-center gap-2">
              <Trash2 className="h-5 w-5" /> Remover parâmetro da cinética
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3">
                <p>
                  Você está prestes a remover <strong className="text-foreground">{deleteConfirm?.param}</strong> da tabela cinética deste protocolo.
                </p>
                <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
                  <p className="font-semibold">⚠ Esta ação é IRREVERSÍVEL.</p>
                  <p className="mt-1">O parâmetro será removido da lista de ativos do protocolo. Os resultados de análise já registrados <strong>não serão apagados</strong>.</p>
                </div>
                <div className="space-y-1.5">
                  <p className="text-sm font-medium text-foreground">Digite a senha mestra para confirmar:</p>
                  <Input
                    type="password"
                    placeholder="Senha mestra"
                    value={deletePassword}
                    onChange={(e) => { setDeletePassword(e.target.value); setDeleteError(""); }}
                    onKeyDown={(e) => { if (e.key === "Enter") handleDeleteParam(); }}
                    autoFocus
                  />
                  {deleteError && <p className="text-xs text-red-600">{deleteError}</p>}
                </div>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting} onClick={() => { setDeleteConfirm(null); setDeletePassword(""); setDeleteError(""); }}>
              Cancelar
            </AlertDialogCancel>
            <Button
              variant="destructive"
              disabled={isDeleting || !deletePassword}
              onClick={handleDeleteParam}
            >
              {isDeleting ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Removendo…</> : "Remover parâmetro"}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Arrhenius panel — shown when any parameter has Ea computed */}
      {kinetics.parameters.some((p) => p.ea != null) && (
        <div className="rounded-md border border-violet-200 bg-violet-50 text-sm text-violet-900 space-y-4 p-4">
          <p className="font-semibold text-sm flex items-center gap-2 text-violet-800">
            🧪 Cinética por Condição — Modelo de Arrhenius
          </p>
          <p className="text-xs text-violet-700">
            Com lotes nas condições <strong>longa duração</strong> e <strong>acelerado</strong> com temperaturas cadastradas, a energia de ativação (Eₐ) foi calculada via equação de Arrhenius (ICH Q1A(R2)).
          </p>
          <div className="space-y-3">
            {kinetics.parameters.filter((p) => p.ea != null).map((p) => (
              <div key={p.parameter} className="rounded-md border border-violet-300 bg-white px-4 py-3 space-y-2.5">
                <p className="font-semibold text-sm text-violet-900">{p.parameter}</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                  <div className="rounded bg-blue-50 border border-blue-200 px-3 py-2 space-y-1">
                    <p className="font-semibold text-blue-700 uppercase tracking-wide text-[10px]">Longa Duração</p>
                    {p.conditionTempLt != null && (
                      <p className="text-blue-800">
                        T = {p.conditionTempLt}°C
                        {p.conditionHumLt != null && ` / ${p.conditionHumLt}%UR`}
                        {" "}({(p.conditionTempLt + 273.15).toFixed(2)} K)
                      </p>
                    )}
                    <p className="font-mono text-blue-900">
                      k<sub>lt</sub> = {p.kLongTerm != null ? p.kLongTerm.toFixed(6) : "—"} /mês
                    </p>
                  </div>
                  <div className="rounded bg-orange-50 border border-orange-200 px-3 py-2 space-y-1">
                    <p className="font-semibold text-orange-700 uppercase tracking-wide text-[10px]">Acelerado</p>
                    {p.conditionTempAcc != null && (
                      <p className="text-orange-800">
                        T = {p.conditionTempAcc}°C
                        {p.conditionHumAcc != null && ` / ${p.conditionHumAcc}%UR`}
                        {" "}({(p.conditionTempAcc + 273.15).toFixed(2)} K)
                      </p>
                    )}
                    <p className="font-mono text-orange-900">
                      k<sub>acc</sub> = {p.kAccelerated != null ? p.kAccelerated.toFixed(6) : "—"} /mês
                    </p>
                  </div>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-xs">
                  <div className="rounded bg-violet-100 border border-violet-200 px-3 py-2 text-center">
                    <p className="text-[10px] text-violet-600 font-semibold uppercase tracking-wide mb-0.5">Eₐ</p>
                    <p className="font-mono font-bold text-violet-900 text-base">{p.ea!.toFixed(2)}</p>
                    <p className="text-[10px] text-violet-600">kJ/mol</p>
                  </div>
                  <div className="rounded bg-violet-100 border border-violet-200 px-3 py-2 text-center">
                    <p className="text-[10px] text-violet-600 font-semibold uppercase tracking-wide mb-0.5">Fator A</p>
                    <p className="font-mono font-bold text-violet-900 text-base" title={p.arrheniusA?.toString()}>
                      {p.arrheniusA != null ? p.arrheniusA.toExponential(3) : "—"}
                    </p>
                    <p className="text-[10px] text-violet-600">mês⁻¹</p>
                  </div>
                  <div className="rounded bg-green-100 border border-green-200 px-3 py-2 text-center">
                    <p className="text-[10px] text-green-700 font-semibold uppercase tracking-wide mb-0.5">Validade (Arrhenius)</p>
                    <p className="font-mono font-bold text-green-900 text-base">
                      {p.shelfLifeArrhenius != null ? `${p.shelfLifeArrhenius.toFixed(1)} m` : "—"}
                    </p>
                    <p className="text-[10px] text-green-600">a {p.conditionTempLt != null ? `${p.conditionTempLt}°C` : "T longa dur."}</p>
                  </div>
                </div>
                <p className="text-[10px] text-violet-500 italic">
                  Eₐ = R · ln(k<sub>acc</sub>/k<sub>lt</sub>) / (1/T<sub>lt</sub> − 1/T<sub>acc</sub>), com R = 8,314 J/(mol·K)
                </p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Step-by-step formula breakdown */}
      <div className="rounded-md bg-slate-50 border border-slate-200 text-sm text-slate-700">
        <button
          type="button"
          onClick={() => setShowPassoCalculo(v => !v)}
          className="w-full flex items-center justify-between px-5 py-3 text-left hover:bg-slate-100 transition-colors rounded-md"
        >
          <p className="font-semibold text-slate-800 text-sm">Passo a Passo do Cálculo — conforme planilha Excel</p>
          <span className="text-slate-400 text-xs ml-2 shrink-0">{showPassoCalculo ? "▲ ocultar" : "▼ exibir"}</span>
        </button>
        {showPassoCalculo && (
        <div className="px-5 pb-5 space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">

            <div className="space-y-3">
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs font-semibold text-slate-600 uppercase tracking-wide">1. Modelo cinético de 1ª ordem</p>
                <button type="button" onClick={() => togglePassoStep(0)} className="shrink-0 text-[10px] px-1.5 py-0.5 rounded border border-slate-300 text-slate-400 hover:text-slate-600 hover:border-slate-400 transition-colors">{hiddenPassoSteps.has(0) ? "exibir" : "ocultar"}</button>
              </div>
              {!hiddenPassoSteps.has(0) && (<>
                <div className="font-mono bg-white border border-slate-200 rounded px-4 py-3 text-sm text-center">
                  C<sub>t</sub> = C<sub>0</sub> · e<sup>−k·t</sup>
                </div>
                <p className="text-xs text-slate-500">Modelo ICH Q1A(R2) — degradação de primeira ordem</p>
              </>)}
            </div>

            <div className="space-y-3">
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs font-semibold text-slate-600 uppercase tracking-wide">2. Constante de degradação k</p>
                <button type="button" onClick={() => togglePassoStep(1)} className="shrink-0 text-[10px] px-1.5 py-0.5 rounded border border-slate-300 text-slate-400 hover:text-slate-600 hover:border-slate-400 transition-colors">{hiddenPassoSteps.has(1) ? "exibir" : "ocultar"}</button>
              </div>
              {!hiddenPassoSteps.has(1) && (<>
                <div className="font-mono bg-white border border-slate-200 rounded px-4 py-3 text-sm text-center">
                  k = −ln(Média<sub>T6</sub> / Média<sub>T0</sub>) / 6
                </div>
                <p className="text-xs text-slate-500">Calculado a partir do intervalo T0→T6 (6 meses)</p>
              </>)}
            </div>

            <div className="space-y-3">
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs font-semibold text-slate-600 uppercase tracking-wide">3. Tempo de validade — método ICH (90%)</p>
                <button type="button" onClick={() => togglePassoStep(2)} className="shrink-0 text-[10px] px-1.5 py-0.5 rounded border border-slate-300 text-slate-400 hover:text-slate-600 hover:border-slate-400 transition-colors">{hiddenPassoSteps.has(2) ? "exibir" : "ocultar"}</button>
              </div>
              {!hiddenPassoSteps.has(2) && (<>
                <div className="font-mono bg-white border border-slate-200 rounded px-4 py-3 text-sm text-center">
                  t<sub>validade</sub> = −ln(90 / Média<sub>T0</sub>) / k
                </div>
                <p className="text-xs text-slate-500">Estimativa até atingir 90% do valor declarado</p>
              </>)}
            </div>

            <div className="space-y-3">
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs font-semibold text-slate-600 uppercase tracking-wide">4. Tempo observado — extrapolação T6</p>
                <button type="button" onClick={() => togglePassoStep(3)} className="shrink-0 text-[10px] px-1.5 py-0.5 rounded border border-slate-300 text-slate-400 hover:text-slate-600 hover:border-slate-400 transition-colors">{hiddenPassoSteps.has(3) ? "exibir" : "ocultar"}</button>
              </div>
              {!hiddenPassoSteps.has(3) && (<>
                <div className="font-mono bg-white border border-slate-200 rounded px-4 py-3 text-sm text-center">
                  t<sub>obs</sub> = −ln(Média<sub>T6</sub> / Média<sub>T0</sub>) / k
                </div>
                <p className="text-xs text-slate-500">Extrapolação da taxa T3→T6 a partir de T0</p>
              </>)}
            </div>

            <div className="space-y-3 md:col-span-2 border-t border-slate-200 pt-4">
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs font-semibold text-slate-600 uppercase tracking-wide">5. Energia de ativação Ea — equação de Arrhenius</p>
                <button type="button" onClick={() => togglePassoStep(4)} className="shrink-0 text-[10px] px-1.5 py-0.5 rounded border border-slate-300 text-slate-400 hover:text-slate-600 hover:border-slate-400 transition-colors">{hiddenPassoSteps.has(4) ? "exibir" : "ocultar"}</button>
              </div>
              {!hiddenPassoSteps.has(4) && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <div className="font-mono bg-white border border-slate-200 rounded px-4 py-3 text-sm text-center">
                      E<sub>a</sub> = R · ln(k<sub>acc</sub> / k<sub>lt</sub>) / (1/T<sub>lt</sub> − 1/T<sub>acc</sub>)
                    </div>
                    <p className="text-xs text-slate-500">R = 8,314 J/(mol·K) · T em Kelvin (°C + 273,15)</p>
                  </div>
                  <div className="space-y-2">
                    <div className="font-mono bg-white border border-slate-200 rounded px-4 py-3 text-sm text-center">
                      A = k<sub>lt</sub> · e<sup>Ea/(R·T<sub>lt</sub>)</sup>
                    </div>
                    <p className="text-xs text-slate-500">Fator pré-exponencial; <em>k</em><sub>lt</sub> e <em>T</em><sub>lt</sub> da condição longa duração</p>
                  </div>
                </div>
              )}
            </div>

          </div>
        </div>
        )}
      </div>

      <div className={`rounded-md border p-4 space-y-2 ${minOverageShelfLife != null && !kineticsObs.trim() ? "border-amber-400 bg-amber-50" : "border-slate-200 bg-white"}`}>
        <div className="flex items-center justify-between">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Conclusão</p>
          {minOverageShelfLife != null && (
            <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${kineticsObs.trim() ? "bg-green-100 border-green-300 text-green-700" : "bg-amber-100 border-amber-400 text-amber-800"}`}>
              {kineticsObs.trim() ? "✓ Justificativa preenchida" : "⚠ Justificativa obrigatória — protocolo usa overage"}
            </span>
          )}
        </div>
        {minOverageShelfLife != null && !kineticsObs.trim() && (
          <div className="rounded-md bg-amber-100 border border-amber-300 px-3 py-2 text-xs text-amber-800 leading-relaxed">
            <strong>Atenção:</strong> Este protocolo utiliza <strong>overage</strong> (sobreformulação) em um ou mais ativos. É obrigatório justificar tecnicamente o uso do overage — ex.: estabilidade do ativo durante a vida útil, perdas no processo, justificativa regulatória.
          </div>
        )}
        <textarea
          value={kineticsObs}
          onChange={(e) => {
            const val = e.target.value;
            setKineticsObs(val);
            try {
              const stored = readLs();
              localStorage.setItem(LS_KEY, JSON.stringify({ ...stored, kineticsObs: val }));
            } catch { /* ignore */ }
            debouncedSave({ kineticsNotes: val });
          }}
          placeholder={minOverageShelfLife != null
            ? "Justifique o uso de overage (sobreformulação): estabilidade do ativo, perdas no processo, justificativa regulatória... Inclua também a conclusão geral sobre os dados cinéticos."
            : "Descreva a conclusão sobre os dados cinéticos: desvios encontrados, condições especiais de armazenamento, lotes atípicos, interferências analíticas ou qualquer informação relevante para o laudo."}
          rows={5}
          className={`w-full text-sm rounded-md px-3 py-2 focus:outline-none focus:ring-1 resize-y placeholder:text-muted-foreground/40 ${minOverageShelfLife != null && !kineticsObs.trim() ? "border-2 border-amber-400 focus:ring-amber-500 bg-white" : "border border-input focus:ring-primary"}`}
        />
      </div>
    </div>
  );
}

type MethodologyDialogState =
  | { mode: "closed" }
  | { mode: "create" }
  | { mode: "edit"; id: number; shortName: string; citation: string; category: string; subject: string; parameter: string; criteria: string };

function MethodologiaTab({
  protocolId,
  initialCustomParamsJson,
  protocolStatus,
}: {
  protocolId: number;
  initialCustomParamsJson?: string | null;
  protocolStatus?: string | null;
}) {
  const isCriterionLocked = protocolStatus === "aprovado" || protocolStatus === "reprovado" || protocolStatus === "aprovado_com_ressalva";
  const [criterionConfirmPending, setCriterionConfirmPending] = useState<{
    applyFn: (replace: boolean) => void;
    currentCriterion: string; newCriterion: string;
    paramName: string; methodName: string;
  } | null>(null);
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { data: methodologies = [], isLoading } = useListMethodologies();
  const { data: ativoRefsLib = [] } = useListAtivoReferences({ query: { queryKey: getListAtivoReferencesQueryKey(), staleTime: 0 } });
  const updateProtocol = useUpdateProtocol();
  const isMountedRef = useRef(false);

  // Undo refs for parameter removal
  const lastRemovedParamRef2 = useRef<{ param: EditableParam; index: number } | null>(null);
  const undoTimerRef2 = useRef<ReturnType<typeof setTimeout> | null>(null);
  const undoHandlerRef2 = useRef<() => void>(() => {});
  undoHandlerRef2.current = () => {
    if (!lastRemovedParamRef2.current) return;
    const { param, index } = lastRemovedParamRef2.current;
    lastRemovedParamRef2.current = null;
    if (undoTimerRef2.current) { clearTimeout(undoTimerRef2.current); undoTimerRef2.current = null; }
    setEditableParams(prev => {
      const next = [...prev];
      next.splice(index, 0, param);
      const newJson = JSON.stringify(next);
      updateProtocol.mutate({ id: protocolId, data: { customParamsJson: newJson } });
      queryClient.setQueryData(
        getGetProtocolQueryKey(protocolId),
        (old: Record<string, unknown> | undefined) => old ? { ...old, customParamsJson: newJson } : old,
      );
      return next;
    });
    toast({ title: "Parâmetro restaurado", description: param.parameter ? `"${param.parameter}" foi recuperado.` : "Parâmetro recuperado." });
  };
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'z' && lastRemovedParamRef2.current) {
        e.preventDefault();
        undoHandlerRef2.current();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Parâmetros editáveis ───────────────────────────────────────────
  const defaultParams = ANALYSIS_PARAMETERS.map((p, i) => ({ ...p, uid: `${p.category}_${i}` }));
  const [editableParams, setEditableParams] = useState<EditableParam[]>(() => {
    if (initialCustomParamsJson) {
      try { return JSON.parse(initialCustomParamsJson) as EditableParam[]; } catch { /* fall */ }
    }
    return defaultParams;
  });

  useEffect(() => {
    if (!isMountedRef.current) { isMountedRef.current = true; return; }
    const t = setTimeout(() => {
      updateProtocol.mutate({ id: protocolId, data: { customParamsJson: JSON.stringify(editableParams) } });
    }, 800);
    return () => clearTimeout(t);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editableParams]);

  const addParam = (category: string, parameter = "", criterion = "") => {
    if (parameter.trim()) {
      const norm = (s: string) => s.trim().toLowerCase();
      const duplicate = editableParams.find(
        p => p.category === category && norm(p.parameter) === norm(parameter)
      );
      if (duplicate) {
        toast({
          title: "Parâmetro já cadastrado",
          description: `"${parameter}" já existe nesta categoria. Não é possível duplicar.`,
          variant: "destructive",
        });
        return;
      }
    }
    const uid = `${category}_${Date.now()}`;
    const entries = parameter.trim() ? getCatalogEntries(parameter) : [];
    const autoEntry = entries.length === 1 ? entries[0] : undefined;
    setEditableParams(prev => [...prev, {
      uid, parameter, criterion, category,
      methodologyShort: autoEntry?.shortName,
      methodologyCitation: autoEntry?.citation,
    }]);
  };

  const updateParam = (uid: string, field: "parameter" | "criterion", val: string) => {
    setEditableParams(prev => prev.map(p => p.uid === uid ? { ...p, [field]: val } : p));
  };

  const setParamMethodInTab = (uid: string, paramName: string, shortName: string | null, citation: string | null, replaceCriterion = true) => {
    // Biblioteca sempre tem prioridade absoluta sobre qualquer valor existente
    const libEntry = shortName ? methodologies.find(m => m.shortName === shortName) : undefined;
    const libParam = libEntry?.parameter ?? null;
    const libCriteria = libEntry?.criteria ?? null;

    // Fallback 1: catálogo local (usado apenas se a biblioteca não tem dados)
    const reverseMatches = shortName && !libParam ? getParamsForMethodology(shortName) : [];
    const catalogFill = reverseMatches.length === 1 ? reverseMatches[0] : null;

    // Fallback 2: para teor_ativo sem libParam e sem catálogo, tenta inferir nome pelo shortName
    const _normKw = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
    let inferredName: string | null = null;

    setEditableParams(prev => {
      const current = prev.find(p => p.uid === uid);
      if (current && !libParam && !catalogFill?.paramName && current.category === "teor_ativo" && shortName) {
        const normShort = _normKw(shortName);
        const presets = CATEGORY_PRESETS.teor_ativo ?? [];
        const match = presets.find(preset => {
          const words = _normKw(preset.parameter)
            .split(/[\s()/-]+/)
            .filter(w => w.length > 3);
          return words.length > 0 && words.some(w => normShort.includes(w));
        });
        inferredName = match?.parameter ?? null;

        // Aviso de duplicata quando o nome inferido já existe
        if (inferredName && inferredName !== current.parameter) {
          const normName = inferredName.trim().toLowerCase();
          const dup = prev.find(
            p => p.uid !== uid && p.category === current.category &&
            p.parameter.trim().toLowerCase() === normName
          );
          if (dup) {
            toast({
              title: "Nome duplicado",
              description: `"${inferredName}" já existe nesta categoria. Renomeie o parâmetro manualmente.`,
              variant: "destructive",
            });
            inferredName = null;
          }
        }
      }

      return prev.map(p => {
        if (p.uid !== uid) return p;
        return {
          ...p,
          parameter: libParam ?? catalogFill?.paramName ?? inferredName ?? p.parameter,
          criterion: replaceCriterion ? (libCriteria ?? catalogFill?.criterion ?? p.criterion) : p.criterion,
          methodologyShort: shortName ?? undefined,
          methodologyCitation: citation ?? undefined,
        };
      });
    });

    const finalName = libParam ?? catalogFill?.paramName ?? inferredName ?? paramName;
    if (shortName && citation && finalName.trim()) {
      addToCatalog(finalName, shortName, citation);
    }
  };

  const applyParamCatalog = (uid: string, paramName: string) => {
    const entries = getCatalogEntries(paramName);
    if (entries.length !== 1) return; // auto-fill apenas quando há exatamente 1 entrada
    const entry = entries[0];
    setEditableParams(prev => prev.map(p =>
      p.uid === uid && !p.methodologyShort
        ? { ...p, methodologyShort: entry.shortName, methodologyCitation: entry.citation }
        : p
    ));
  };

  const removeParam = (uid: string) => {
    setEditableParams(prev => {
      const idx = prev.findIndex(p => p.uid === uid);
      const removed = prev[idx];
      const next = prev.filter(p => p.uid !== uid);
      const newJson = JSON.stringify(next);
      if (undoTimerRef2.current) clearTimeout(undoTimerRef2.current);
      lastRemovedParamRef2.current = { param: removed, index: idx };
      undoTimerRef2.current = setTimeout(() => { lastRemovedParamRef2.current = null; }, 10000);
      toast({ title: "Parâmetro removido", description: "Pressione Ctrl+Z para desfazer (10s)" });
      updateProtocol.mutate({ id: protocolId, data: { customParamsJson: newJson } });
      queryClient.setQueryData(
        getGetProtocolQueryKey(protocolId),
        (old: Record<string, unknown> | undefined) => old ? { ...old, customParamsJson: newJson } : old,
      );
      return next;
    });
  };

  // ── Senha para alterar critério (protocolo em_andamento) ──────────
  const isCriterionPasswordRequired = protocolStatus === "em_andamento";
  const [criterionUnlockedUids, setCriterionUnlockedUids] = useState<Set<string>>(new Set());
  const [criterionPwdPending, setCriterionPwdPending] = useState<string | null>(null);
  const [criterionPwdValue, setCriterionPwdValue] = useState("");
  const [criterionPwdError, setCriterionPwdError] = useState("");
  const [criterionPwdLoading, setCriterionPwdLoading] = useState(false);
  const [criterionPwdShow, setCriterionPwdShow] = useState(false);

  const confirmCriterionPwd = async () => {
    if (!criterionPwdPending) return;
    setCriterionPwdLoading(true);
    setCriterionPwdError("");
    try {
      const res = await fetch("/api/auth/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: criterionPwdValue }),
      });
      if (res.ok) {
        setCriterionUnlockedUids(prev => new Set([...prev, criterionPwdPending]));
        setCriterionPwdPending(null);
        setCriterionPwdValue("");
        setCriterionPwdShow(false);
      } else {
        setCriterionPwdError("Senha incorreta.");
        setCriterionPwdValue("");
      }
    } catch {
      setCriterionPwdError("Erro de conexão.");
    }
    setCriterionPwdLoading(false);
  };

  const [draggingParamUid2, setDraggingParamUid2] = useState<string | null>(null);
  const [dragOverParamUid2, setDragOverParamUid2] = useState<string | null>(null);
  const draggingParamRef2 = useRef<string | null>(null);
  const dragOverParamRef2 = useRef<string | null>(null);
  const setDraggingParam2 = (uid: string | null) => { draggingParamRef2.current = uid; setDraggingParamUid2(uid); };
  const setDragOverParam2 = (uid: string | null) => { dragOverParamRef2.current = uid; setDragOverParamUid2(uid); };

  // Senha para TROCAR metodologia já atribuída
  const [changeMethodConfirm, setChangeMethodConfirm] = useState<{ uid: string; paramName: string; currentShort: string; newShortName: string | null; newCitation: string | null; replaceCriterion?: boolean } | null>(null);
  const [changeMethodPwd, setChangeMethodPwd] = useState("");
  const [changeMethodError, setChangeMethodError] = useState("");
  const [changeMethodLoading, setChangeMethodLoading] = useState(false);
  const [changeMethodShowPwd, setChangeMethodShowPwd] = useState(false);

  const handleChangeMethodology = async () => {
    if (!changeMethodConfirm) return;
    setChangeMethodError("");
    setChangeMethodLoading(true);
    try {
      const resp = await fetch("/api/auth/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: changeMethodPwd }),
      });
      if (!resp.ok) {
        setChangeMethodError("Senha incorreta.");
        setChangeMethodLoading(false);
        setChangeMethodPwd("");
        return;
      }
    } catch {
      setChangeMethodError("Erro ao verificar senha.");
      setChangeMethodLoading(false);
      return;
    }
    const { uid, paramName, newShortName, newCitation, replaceCriterion: replCrit } = changeMethodConfirm;
    setParamMethodInTab(uid, paramName, newShortName, newCitation, replCrit ?? true);
    setChangeMethodConfirm(null);
    setChangeMethodPwd("");
    setChangeMethodError("");
    setChangeMethodLoading(false);
  };

  const [removeMethodConfirm, setRemoveMethodConfirm] = useState<{ uid: string; paramName: string; shortName: string } | null>(null);
  const [removeMethodPwd, setRemoveMethodPwd] = useState("");
  const [removeMethodError, setRemoveMethodError] = useState("");
  const [isRemovingMethod, setIsRemovingMethod] = useState(false);

  const handleRemoveMethodology = async () => {
    if (!removeMethodConfirm) return;
    setRemoveMethodError("");
    setIsRemovingMethod(true);
    try {
      const resp = await fetch("/api/auth/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: removeMethodPwd }),
      });
      if (!resp.ok) {
        setRemoveMethodError("Senha incorreta.");
        setIsRemovingMethod(false);
        return;
      }
    } catch {
      setRemoveMethodError("Erro ao verificar senha.");
      setIsRemovingMethod(false);
      return;
    }
    setEditableParams(prev => prev.map(p =>
      p.uid === removeMethodConfirm.uid
        ? { ...p, methodologyShort: undefined, methodologyCitation: undefined }
        : p
    ));
    setRemoveMethodConfirm(null);
    setRemoveMethodPwd("");
    setRemoveMethodError("");
    setIsRemovingMethod(false);
  };

  useEffect(() => {
    const onPointerUp2 = () => {
      const from = draggingParamRef2.current;
      const to = dragOverParamRef2.current;
      if (from && to && from !== to) {
        setEditableParams(prev => {
          const fromIdx = prev.findIndex(p => p.uid === from);
          const toIdx = prev.findIndex(p => p.uid === to);
          if (fromIdx < 0 || toIdx < 0 || prev[fromIdx].category !== prev[toIdx].category) return prev;
          const next = [...prev];
          const [item] = next.splice(fromIdx, 1);
          next.splice(toIdx, 0, item);
          const newJson = JSON.stringify(next);
          updateProtocol.mutate({ id: protocolId, data: { customParamsJson: newJson } });
          queryClient.setQueryData(
            getGetProtocolQueryKey(protocolId),
            (old: Record<string, unknown> | undefined) => old ? { ...old, customParamsJson: newJson } : old,
          );
          return next;
        });
      }
      setDraggingParam2(null);
      setDragOverParam2(null);
    };
    window.addEventListener('pointerup', onPointerUp2);
    return () => window.removeEventListener('pointerup', onPointerUp2);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const paramCategories = [
    { label: "Físico-Química", key: "fisico_quimica" },
    { label: "Microbiológica", key: "microbiologica" },
    { label: "Teor do Ativo", key: "teor_ativo" },
    { label: "Embalagem", key: "embalagem" },
  ];

  // ── Links de documentos (localStorage) ────────────────────────────
  const [docUrls, setDocUrlsState] = useState<Record<string, string>>(() => {
    try { return JSON.parse(localStorage.getItem("method_doc_urls") ?? "{}"); } catch { return {}; }
  });
  const [editingDocId, setEditingDocId] = useState<number | null>(null);
  const [docUrlInput, setDocUrlInput] = useState("");

  const saveDocUrl = (id: number) => {
    const next = { ...docUrls };
    if (docUrlInput.trim()) next[String(id)] = docUrlInput.trim();
    else delete next[String(id)];
    localStorage.setItem("method_doc_urls", JSON.stringify(next));
    setDocUrlsState(next);
    setEditingDocId(null);
    setDocUrlInput("");
  };

  // ── Dialog de referência bibliográfica ────────────────────────────
  const [dialog, setDialog] = useState<MethodologyDialogState>({ mode: "closed" });
  const isOpen = dialog.mode !== "closed";
  const isEditing = dialog.mode === "edit";

  const [shortName, setShortName] = useState("");
  const [citation, setCitation] = useState("");
  const [category, setCategory] = useState("");
  const [subjectField, setSubjectField] = useState("");
  const [libSearch, setLibSearch] = useState("");
  const [paramSearch, setParamSearch] = useState("");
  const [dupWarning, setDupWarning] = useState<{ match: (typeof methodologies)[0]; proceed: () => void } | null>(null);
  const [parameterField, setParameterField] = useState("");
  const [criteriaField, setCriteriaField] = useState("");

  const openCreate = () => { setShortName(""); setCitation(""); setCategory(""); setSubjectField(""); setParameterField(""); setCriteriaField(""); setDialog({ mode: "create" }); };

  const openEdit = (m: { id: number; shortName: string; citation: string; category?: string | null; subject?: string | null; parameter?: string | null; criteria?: string | null }) => {
    setShortName(m.shortName);
    setCitation(m.citation);
    setCategory(m.category ?? "");
    setSubjectField(m.subject ?? "");
    setParameterField(m.parameter ?? "");
    setCriteriaField(m.criteria ?? "");
    setDialog({ mode: "edit", id: m.id, shortName: m.shortName, citation: m.citation, category: m.category ?? "", subject: m.subject ?? "", parameter: m.parameter ?? "", criteria: m.criteria ?? "" });
  };

  const closeDialog = () => setDialog({ mode: "closed" });
  const invalidate = () => queryClient.invalidateQueries({ queryKey: getListMethodologiesQueryKey() });

  const createMutation = useCreateMethodology({
    mutation: {
      onSuccess: () => { invalidate(); closeDialog(); toast({ title: "Metodologia criada" }); },
      onError: () => toast({ title: "Erro ao criar", variant: "destructive" }),
    },
  });

  const updateMutation = useUpdateMethodology({
    mutation: {
      onSuccess: () => { invalidate(); closeDialog(); toast({ title: "Metodologia atualizada" }); },
      onError: () => toast({ title: "Erro ao atualizar", variant: "destructive" }),
    },
  });

  const deleteMutation = useDeleteMethodology({
    mutation: {
      onSuccess: () => { invalidate(); toast({ title: "Metodologia removida" }); },
      onError: () => toast({ title: "Erro ao remover", variant: "destructive" }),
    },
  });

  const isPending = createMutation.isPending || updateMutation.isPending;

  const _normCit = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/\s+/g, " ").trim();
  const _authorPart = (cit: string) => { const i = cit.indexOf(". "); return _normCit(i > 0 ? cit.slice(0, i) : cit); };

  const doCreate = (data: Parameters<typeof createMutation.mutate>[0]["data"]) => createMutation.mutate({ data });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!shortName.trim() || !citation.trim()) return;
    const data = {
      shortName: shortName.trim(),
      citation: citation.trim(),
      category: category.trim() || null,
      subject: subjectField.trim() || null,
      parameter: parameterField.trim() || null,
      criteria: criteriaField.trim() || null,
    };
    if (isEditing && dialog.mode === "edit") {
      updateMutation.mutate({ id: dialog.id, data });
      return;
    }
    // Duplicate check: same shortName (normalized) or same ABNT author part
    const newAuthor = _authorPart(data.citation);
    const newShort = _normCit(data.shortName);
    const match = methodologies.find((m) =>
      _normCit(m.shortName) === newShort ||
      (newAuthor.length > 4 && _authorPart(m.citation) === newAuthor)
    );
    if (match) {
      setDupWarning({ match, proceed: () => { setDupWarning(null); doCreate(data); } });
      return;
    }
    doCreate(data);
  };

  const _normLib = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  const _libQ = _normLib(libSearch.trim());
  const filteredMethodologies = (_libQ
    ? methodologies.filter((m) =>
        _normLib(m.shortName).includes(_libQ) ||
        _normLib(m.subject ?? "").includes(_libQ) ||
        _normLib(m.category ?? "").includes(_libQ) ||
        _normLib(m.citation).includes(_libQ) ||
        _normLib(m.parameter ?? "").includes(_libQ)
      )
    : [...methodologies]
  ).sort((a, b) => _normLib(a.shortName).localeCompare(_normLib(b.shortName)));

  return (
    <>
      <div className="space-y-6">

      {/* ═══════════════════════════════════════════════════════════════
          SEÇÃO 1 — PARÂMETROS CADASTRADOS
      ═══════════════════════════════════════════════════════════════ */}
      <div>
        <div className="flex items-start justify-between mb-3 gap-2 flex-wrap">
          <div>
            <h3 className="font-semibold">Parâmetros Cadastrados</h3>
            <p className="text-sm text-muted-foreground">
              Todos os parâmetros de análise do protocolo. Clique em qualquer campo para editar o nome ou o critério.
            </p>
          </div>
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground/50 pointer-events-none" />
            <input
              type="text"
              value={paramSearch}
              onChange={e => setParamSearch(e.target.value)}
              placeholder="Procurar parâmetro…"
              className="pl-8 pr-7 py-1.5 text-xs border rounded-md bg-background focus:outline-none focus:ring-1 focus:ring-primary/40 w-52 placeholder:text-muted-foreground/40"
            />
            {paramSearch && (
              <button
                type="button"
                onClick={() => setParamSearch("")}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground/40 hover:text-foreground"
              >
                <X className="h-3 w-3" />
              </button>
            )}
          </div>
        </div>

        <div className="space-y-3">
          {paramCategories.map(({ label, key }) => {
            const _pq = paramSearch.trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
            const catParams = editableParams.filter(p =>
              p.category === key &&
              (!_pq || p.parameter.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").includes(_pq))
            );
            return (
              <div key={key} className="border rounded-lg overflow-hidden">
                <div className="bg-muted/50 px-3 py-1.5 border-b flex items-center justify-between">
                  <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">{label}</span>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-6 text-[10px] px-2 text-muted-foreground hover:text-primary"
                    onClick={() => addParam(key)}
                  >
                    <Plus className="h-3 w-3 mr-0.5" /> Novo em branco
                  </Button>
                </div>
                {/* ── Banco de presets — chips de adição rápida ── */}
                {(() => {
                  const basePresets = getPresetsForCategory(key);
                  // Para teor_ativo, mescla com entradas do Banco de Referências de Limites
                  const extraFromBank: { parameter: string; criterion: string }[] =
                    key === "teor_ativo"
                      ? ativoRefsLib
                          .filter(r => r.parameter?.trim())
                          .filter(r => !basePresets.some(p => p.parameter.trim().toLowerCase() === r.parameter!.trim().toLowerCase()))
                          .map(r => ({ parameter: r.parameter!, criterion: "Mín. 80% do valor declarado" }))
                      : [];
                  const allPresets = [...basePresets, ...extraFromBank];
                  const available = allPresets.filter(
                    preset => !catParams.some(c => c.parameter.trim().toLowerCase() === preset.parameter.trim().toLowerCase())
                  );
                  if (available.length === 0) return null;
                  return (
                    <div className="px-3 pt-2 pb-2 bg-muted/10 border-b">
                      <p className="text-[9px] uppercase tracking-widest text-muted-foreground/55 font-bold mb-1.5">
                        Clique para adicionar — critério e metodologia preenchidos automaticamente:
                      </p>
                      <div className="flex flex-wrap gap-1">
                        {available.map(preset => {
                          const nMethods = getCatalogEntries(preset.parameter).length;
                          return (
                            <button
                              key={preset.parameter}
                              type="button"
                              onClick={() => addParam(key, preset.parameter, preset.criterion)}
                              className="inline-flex items-center gap-0.5 text-[10px] px-2 py-0.5 rounded-full border border-primary/25 text-primary/70 hover:bg-primary/8 hover:border-primary/50 hover:text-primary transition-colors"
                            >
                              <Plus className="h-2.5 w-2.5" />
                              {preset.parameter}
                              {nMethods > 0 && (
                                <span className="text-[8px] bg-primary/15 text-primary rounded px-0.5 font-semibold ml-0.5">
                                  {nMethods}
                                </span>
                              )}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  );
                })()}
                {catParams.length === 0 ? (
                  <p className="text-xs text-muted-foreground italic px-3 py-3">
                    Nenhum parâmetro adicionado ainda. Use os chips acima ou{" "}
                    <button type="button" className="underline hover:text-foreground" onClick={() => addParam(key)}>
                      adicione em branco
                    </button>
                    .
                  </p>
                ) : (
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b bg-muted/20">
                        <th className="px-3 py-1.5 text-left font-semibold w-[28%]">Parâmetro</th>
                        <th className="px-3 py-1.5 text-left font-semibold w-[32%]">Critério / Especificação</th>
                        <th className="px-3 py-1.5 text-left font-semibold w-[36%]">Metodologia</th>
                        <th className="w-6"></th>
                        <th className="w-8"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {catParams.map((p) => (
                        <tr
                          key={p.uid}
                          className={`border-b last:border-0 hover:bg-muted/20 transition-colors group${draggingParamUid2 === p.uid ? ' opacity-40' : ''}${dragOverParamUid2 === p.uid && draggingParamUid2 !== p.uid ? ' border-t-2 border-t-primary' : ''}`}
                          onPointerEnter={() => { if (draggingParamUid2 && draggingParamUid2 !== p.uid) setDragOverParam2(p.uid); }}
                        >
                          <td className="px-3 py-1.5">
                            <input
                              value={p.parameter}
                              onChange={e => updateParam(p.uid, "parameter", e.target.value)}
                              onBlur={e => applyParamCatalog(p.uid, e.target.value)}
                              className="w-full bg-transparent focus:outline-none border-b border-transparent focus:border-primary text-xs font-medium transition-colors placeholder:text-muted-foreground/40"
                              placeholder="Nome do parâmetro"
                            />
                          </td>
                          <td className="px-3 py-1.5">
                            {(() => {
                              const criterionReadOnly = isCriterionLocked ||
                                (isCriterionPasswordRequired && !criterionUnlockedUids.has(p.uid));
                              const criterionTitle = isCriterionLocked
                                ? "Critério bloqueado — protocolo já finalizado"
                                : isCriterionPasswordRequired && !criterionUnlockedUids.has(p.uid)
                                  ? "Clique para alterar o critério (requer senha)"
                                  : undefined;
                              return (
                                <input
                                  value={p.criterion}
                                  onChange={e => !criterionReadOnly && updateParam(p.uid, "criterion", e.target.value)}
                                  readOnly={criterionReadOnly}
                                  onClick={() => {
                                    if (isCriterionPasswordRequired && !criterionUnlockedUids.has(p.uid)) {
                                      setCriterionPwdPending(p.uid);
                                      setCriterionPwdValue("");
                                      setCriterionPwdError("");
                                      setCriterionPwdShow(false);
                                    }
                                  }}
                                  title={criterionTitle}
                                  className={`w-full bg-transparent text-xs text-muted-foreground font-mono placeholder:text-muted-foreground/40 border-b transition-colors ${
                                    isCriterionLocked
                                      ? "border-transparent cursor-default select-text"
                                      : isCriterionPasswordRequired && !criterionUnlockedUids.has(p.uid)
                                        ? "border-transparent cursor-pointer hover:border-amber-400"
                                        : "border-transparent focus:outline-none focus:border-primary"
                                  }`}
                                  placeholder="Critério de aceitação"
                                />
                              );
                            })()}
                          </td>
                          <td className="px-3 py-1.5 min-w-[200px]">
                            {p.methodologyShort ? (
                              <div className="flex items-start gap-1">
                                <div className="flex-1 min-w-0">
                                  <p className="text-xs font-semibold text-primary/80 leading-tight">
                                    {p.methodologyShort}
                                  </p>
                                  {p.methodologyCitation && (
                                    <p className="text-[10px] text-muted-foreground/70 leading-snug mt-0.5 break-words">
                                      {p.methodologyCitation}
                                    </p>
                                  )}
                                </div>
                                <div className="flex items-center gap-0.5 flex-shrink-0 mt-0.5">
                                  <ParamMethodSelector
                                    paramName={p.parameter}
                                    selected={p.methodologyShort ?? null}
                                    methodologies={methodologies}
                                    catalogEntries={getCatalogEntries(p.parameter)}
                                    onSelect={(s, c) => {
                                      const libEnt = s ? methodologies.find(m => m.shortName === s) : undefined;
                                      const libCritM = libEnt?.criteria ?? null;
                                      const revM = s && !libEnt?.parameter ? getParamsForMethodology(s) : [];
                                      const pendingCritM = libCritM ?? (revM.length === 1 ? revM[0].criterion || null : null);
                                      const existCritM = p.criterion.trim();
                                      const proceed = (replaceCriterion: boolean) => {
                                        if (p.methodologyShort) {
                                          setChangeMethodConfirm({ uid: p.uid, paramName: p.parameter, currentShort: p.methodologyShort, newShortName: s, newCitation: c, replaceCriterion });
                                          setChangeMethodPwd("");
                                          setChangeMethodError("");
                                        } else {
                                          setParamMethodInTab(p.uid, p.parameter, s, c, replaceCriterion);
                                        }
                                      };
                                      if (pendingCritM && existCritM && pendingCritM !== existCritM) {
                                        setCriterionConfirmPending({ applyFn: proceed, currentCriterion: existCritM, newCriterion: pendingCritM, paramName: p.parameter, methodName: s ?? "" });
                                      } else {
                                        proceed(true);
                                      }
                                    }}
                                    compact
                                    hideRemove
                                  />
                                  <button
                                    type="button"
                                    title="Remover metodologia (requer senha)"
                                    className="flex items-center justify-center h-5 w-5 rounded text-muted-foreground/30 hover:text-destructive hover:bg-destructive/10 transition-colors"
                                    onClick={() => {
                                      setRemoveMethodConfirm({ uid: p.uid, paramName: p.parameter, shortName: p.methodologyShort! });
                                      setRemoveMethodPwd("");
                                      setRemoveMethodError("");
                                    }}
                                  >
                                    <X className="h-3 w-3" />
                                  </button>
                                </div>
                              </div>
                            ) : (
                              <ParamMethodSelector
                                paramName={p.parameter}
                                selected={null}
                                methodologies={methodologies}
                                catalogEntries={getCatalogEntries(p.parameter)}
                                onSelect={(s, c) => {
                                  const libEnt = s ? methodologies.find(m => m.shortName === s) : undefined;
                                  const libCritM = libEnt?.criteria ?? null;
                                  const revM = s && !libEnt?.parameter ? getParamsForMethodology(s) : [];
                                  const pendingCritM = libCritM ?? (revM.length === 1 ? revM[0].criterion || null : null);
                                  const existCritM = p.criterion.trim();
                                  const proceed = (replaceCriterion: boolean) => {
                                    if (p.methodologyShort) {
                                      setChangeMethodConfirm({ uid: p.uid, paramName: p.parameter, currentShort: p.methodologyShort, newShortName: s, newCitation: c, replaceCriterion });
                                      setChangeMethodPwd("");
                                      setChangeMethodError("");
                                    } else {
                                      setParamMethodInTab(p.uid, p.parameter, s, c, replaceCriterion);
                                    }
                                  };
                                  if (pendingCritM && existCritM && pendingCritM !== existCritM) {
                                    setCriterionConfirmPending({ applyFn: proceed, currentCriterion: existCritM, newCriterion: pendingCritM, paramName: p.parameter, methodName: s ?? "" });
                                  } else {
                                    proceed(true);
                                  }
                                }}
                              />
                            )}
                          </td>
                          <td className="px-1 py-1.5 text-center">
                            <div
                              className="cursor-grab active:cursor-grabbing touch-none text-muted-foreground/30 hover:text-primary opacity-0 group-hover:opacity-100 transition-opacity p-0.5 flex items-center justify-center select-none"
                              onPointerDown={(e) => { e.preventDefault(); setDraggingParam2(p.uid); }}
                              title="Arrastar para reordenar"
                            >
                              <GripVertical className="h-3.5 w-3.5" />
                            </div>
                          </td>
                          <td className="px-2 py-1.5 text-center">
                            <AlertDialog>
                              <AlertDialogTrigger asChild>
                                <button
                                  type="button"
                                  className="text-muted-foreground/30 hover:text-destructive transition-colors opacity-0 group-hover:opacity-100"
                                  title="Remover parâmetro"
                                >
                                  <Trash2 className="h-3 w-3" />
                                </button>
                              </AlertDialogTrigger>
                              <AlertDialogContent>
                                <AlertDialogHeader>
                                  <AlertDialogTitle>Remover parâmetro?</AlertDialogTitle>
                                  <AlertDialogDescription asChild>
                                    <div>
                                      <p className="font-bold text-destructive uppercase mb-2">
                                        ⚠ ATENÇÃO: ESTA OPERAÇÃO É IRREVERSÍVEL!
                                      </p>
                                      <p>
                                        {p.parameter ? `"${p.parameter}" será excluído permanentemente.` : "Este parâmetro será excluído permanentemente."}
                                        {" "}Use <strong>Ctrl+Z</strong> logo após para desfazer (10s).
                                      </p>
                                    </div>
                                  </AlertDialogDescription>
                                </AlertDialogHeader>
                                <AlertDialogFooter>
                                  <AlertDialogCancel>Cancelar</AlertDialogCancel>
                                  <AlertDialogAction
                                    className="bg-destructive text-white hover:bg-destructive/90"
                                    onClick={() => removeParam(p.uid)}
                                  >
                                    Remover
                                  </AlertDialogAction>
                                </AlertDialogFooter>
                              </AlertDialogContent>
                            </AlertDialog>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            );
          })}
        </div>
        <p className="text-[10px] text-muted-foreground mt-2 italic">
          Alterações são salvas automaticamente e refletidas na aba "Resultado das Análises".
        </p>
      </div>

      {/* ═══════════════════════════════════════════════════════════════
          SEÇÃO 2 — BIBLIOTECA DE REFERÊNCIAS METODOLÓGICAS
      ═══════════════════════════════════════════════════════════════ */}
      <div className="border-t pt-5">
        <div className="flex items-center justify-between mb-3">
          <div>
            <h3 className="font-semibold">Biblioteca de Referências Metodológicas</h3>
            <p className="text-sm text-muted-foreground">
              Referências bibliográficas usadas nos ensaios (Farmacopeia Brasileira, AOAC, ISO…).
              Você pode anexar o link de cada documento (POP, manual técnico, PDF).
            </p>
          </div>
          <Button size="sm" onClick={openCreate}>
            <Plus className="h-4 w-4 mr-1" /> Nova Referência
          </Button>
        </div>

        {/* Barra de busca da biblioteca */}
        <div className="relative mb-4">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
          <Input
            className="pl-9 h-9 text-sm bg-background"
            placeholder="Buscar por nome, substância, categoria ou citação…"
            value={libSearch}
            onChange={(e) => setLibSearch(e.target.value)}
          />
          {libSearch && (
            <button
              type="button"
              onClick={() => setLibSearch("")}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>

        {/* Dialog de criação / edição */}
        <Dialog open={isOpen} onOpenChange={(o) => { if (!o) closeDialog(); }}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{isEditing ? "Editar Referência" : "Adicionar Referência Metodológica"}</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4 pt-2">
              <div className="space-y-1">
                <label className="text-sm font-medium">Nome curto *</label>
                <Input
                  placeholder='ex: FB 7ª ed., JP 18ª ed., AOAC 2019'
                  value={shortName}
                  onChange={(e) => setShortName(e.target.value)}
                  required
                  autoFocus
                />
              </div>
              <div className="space-y-1">
                <label className="text-sm font-medium">Citação completa *</label>
                <Textarea
                  placeholder='ex: BRASIL. ANVISA. Farmacopeia Brasileira, 7ª edição. Brasília: ANVISA, 2019.'
                  value={citation}
                  onChange={(e) => setCitation(e.target.value)}
                  rows={3}
                  required
                />
              </div>
              <div className="space-y-1">
                <label className="text-sm font-medium">Substância / Tema</label>
                <Input
                  placeholder='ex: Vitamina D, Cálcio, L-Triptofano, pH, Microbiológico'
                  value={subjectField}
                  onChange={(e) => setSubjectField(e.target.value)}
                />
                <p className="text-[11px] text-muted-foreground">Facilita a busca — identifica o ativo ou tema principal da referência.</p>
              </div>
              <div className="space-y-1">
                <label className="text-sm font-medium">Categoria (opcional)</label>
                <Input
                  placeholder='ex: Fisico-Quimica, Microbiologica, Teor do Ativo'
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-sm font-medium">Parâmetro (opcional)</label>
                  <Input
                    placeholder='ex: pH, Umidade, Vitamina C'
                    value={parameterField}
                    onChange={(e) => setParameterField(e.target.value)}
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-sm font-medium">Critério / Especificação (opcional)</label>
                  <Input
                    placeholder='ex: 5,0 – 7,0, ≤ 5%, ≥ 80%'
                    value={criteriaField}
                    onChange={(e) => setCriteriaField(e.target.value)}
                  />
                </div>
              </div>
              <div className="flex justify-end gap-2">
                <Button type="button" variant="outline" onClick={closeDialog}>Cancelar</Button>
                <Button type="submit" disabled={isPending}>
                  {isPending ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}
                  {isEditing ? "Salvar alterações" : "Adicionar"}
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>

        {/* AlertDialog — referência duplicada */}
        <AlertDialog open={!!dupWarning} onOpenChange={(o) => { if (!o) setDupWarning(null); }}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Referência possivelmente duplicada</AlertDialogTitle>
              <AlertDialogDescription asChild>
                <div className="space-y-2 text-sm">
                  <p>Já existe uma referência semelhante na biblioteca:</p>
                  <div className="rounded-md border bg-muted/50 px-3 py-2 text-xs space-y-0.5">
                    <p className="font-semibold">{dupWarning?.match.shortName}</p>
                    <p className="text-muted-foreground break-words">{dupWarning?.match.citation}</p>
                  </div>
                  <p>Deseja cadastrar mesmo assim?</p>
                </div>
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancelar</AlertDialogCancel>
              <AlertDialogAction onClick={() => dupWarning?.proceed()}>
                Sim, cadastrar mesmo assim
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        {isLoading ? (
          <div className="flex items-center gap-2 text-muted-foreground text-sm">
            <Loader2 className="h-4 w-4 animate-spin" /> Carregando...
          </div>
        ) : methodologies.length === 0 ? (
          <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
            Nenhuma referência cadastrada. Clique em "Nova Referência" para começar.
          </div>
        ) : _libQ && filteredMethodologies.length === 0 ? (
          <div className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
            Nenhuma referência encontrada para "<span className="font-medium">{libSearch}</span>".
          </div>
        ) : (
          <div className="space-y-2">
            {filteredMethodologies.map((m) => {
              const docUrl = docUrls[String(m.id)];
              const isEditingDoc = editingDocId === m.id;
              return (
                <div key={m.id} className="flex items-start gap-3 rounded-lg border bg-muted/30 px-4 py-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium text-sm">{m.shortName}</span>
                      {m.subject && <Badge variant="secondary" className="text-xs font-normal">{m.subject}</Badge>}
                      {m.category && <Badge variant="outline" className="text-xs">{m.category}</Badge>}
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5 break-words">{m.citation}</p>
                    {(m.parameter || m.criteria) && (
                      <div className="flex items-center gap-3 mt-1.5 flex-wrap">
                        {m.parameter && (
                          <span className="text-xs text-foreground/80">
                            <span className="font-medium">Parâm.:</span> {m.parameter}
                          </span>
                        )}
                        {m.criteria && (
                          <span className="text-xs text-foreground/80">
                            <span className="font-medium">Critério:</span> {m.criteria}
                          </span>
                        )}
                      </div>
                    )}

                    {/* Documento anexado */}
                    {isEditingDoc ? (
                      <div className="flex gap-1.5 mt-2 items-center">
                        <Paperclip className="h-3 w-3 text-muted-foreground flex-shrink-0" />
                        <input
                          autoFocus
                          type="url"
                          value={docUrlInput}
                          onChange={e => setDocUrlInput(e.target.value)}
                          onKeyDown={e => {
                            if (e.key === "Enter") { e.preventDefault(); saveDocUrl(m.id); }
                            if (e.key === "Escape") setEditingDocId(null);
                          }}
                          placeholder="https://... (Google Drive, SharePoint, Dropbox, etc.)"
                          className="flex-1 text-xs border border-primary/50 rounded px-1.5 py-0.5 focus:outline-none focus:ring-1 focus:ring-primary"
                        />
                        <button
                          type="button"
                          onClick={() => saveDocUrl(m.id)}
                          className="text-[10px] px-2 py-0.5 rounded bg-primary text-white hover:bg-primary/80 shrink-0"
                        >
                          OK
                        </button>
                        <button
                          type="button"
                          onClick={() => setEditingDocId(null)}
                          className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground shrink-0"
                        >
                          ✕
                        </button>
                      </div>
                    ) : docUrl ? (
                      <div className="flex gap-1.5 mt-1.5 items-center flex-wrap">
                        <Paperclip className="h-3 w-3 text-primary flex-shrink-0" />
                        <a
                          href={docUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-xs text-primary hover:underline flex items-center gap-0.5 truncate max-w-xs"
                        >
                          {docUrl.length > 60 ? docUrl.slice(0, 57) + "…" : docUrl}
                          <ExternalLink className="h-2.5 w-2.5 flex-shrink-0" />
                        </a>
                        <button
                          type="button"
                          onClick={() => { setDocUrlInput(docUrl); setEditingDocId(m.id); }}
                          className="text-[9px] text-muted-foreground hover:text-foreground transition-colors"
                        >
                          editar
                        </button>
                        <button
                          type="button"
                          onClick={() => { setDocUrlInput(""); saveDocUrl(m.id); }}
                          className="text-[9px] text-destructive hover:text-destructive/80 transition-colors"
                        >
                          remover
                        </button>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => { setDocUrlInput(""); setEditingDocId(m.id); }}
                        className="flex items-center gap-1 text-[10px] text-muted-foreground/50 hover:text-muted-foreground mt-1.5 transition-colors"
                      >
                        <Paperclip className="h-2.5 w-2.5" />
                        Anexar link (POP, manual técnico, PDF…)
                      </button>
                    )}
                  </div>

                  <div className="flex items-center gap-1 flex-shrink-0">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 text-muted-foreground hover:text-primary"
                      title="Editar"
                      onClick={() => openEdit(m)}
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive">
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Remover referência?</AlertDialogTitle>
                          <AlertDialogDescription>"{m.shortName}" será removida permanentemente.</AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancelar</AlertDialogCancel>
                          <AlertDialogAction onClick={() => deleteMutation.mutate({ id: m.id })}>Remover</AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>

      {/* AlertDialog — remover metodologia com senha */}
      <AlertDialog
        open={removeMethodConfirm !== null}
        onOpenChange={(open) => {
          if (!open) {
            setRemoveMethodConfirm(null);
            setRemoveMethodPwd("");
            setRemoveMethodError("");
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="text-red-700 flex items-center gap-2">
              <X className="h-5 w-5" /> Remover metodologia
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3">
                <p>
                  Você está prestes a remover a metodologia{" "}
                  <strong className="text-foreground">"{removeMethodConfirm?.shortName}"</strong>{" "}
                  do parâmetro{" "}
                  <strong className="text-foreground">"{removeMethodConfirm?.paramName}"</strong>.
                </p>
                <p className="text-sm">
                  O parâmetro continuará cadastrado; apenas a referência metodológica será desvinculada.
                </p>
                <div className="space-y-1.5">
                  <label className="text-sm font-medium text-foreground">Senha mestra</label>
                  <input
                    type="password"
                    autoFocus
                    value={removeMethodPwd}
                    onChange={(e) => setRemoveMethodPwd(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter") handleRemoveMethodology(); }}
                    className="w-full rounded-md border px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
                    placeholder="Digite a senha mestra"
                  />
                  {removeMethodError && (
                    <p className="text-xs text-red-600 font-medium">{removeMethodError}</p>
                  )}
                </div>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => { setRemoveMethodConfirm(null); setRemoveMethodPwd(""); setRemoveMethodError(""); }}>
              Cancelar
            </AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-white hover:bg-destructive/90"
              onClick={(e) => { e.preventDefault(); handleRemoveMethodology(); }}
              disabled={isRemovingMethod || !removeMethodPwd}
            >
              {isRemovingMethod ? "Verificando…" : "Remover metodologia"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Dialog — confirmar troca de metodologia já atribuída */}
      {changeMethodConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={() => { setChangeMethodConfirm(null); setChangeMethodPwd(""); setChangeMethodError(""); }}>
          <div className="bg-white rounded-lg shadow-xl w-80 p-5 space-y-4" onClick={e => e.stopPropagation()}>
            <div className="flex items-center gap-2">
              <Lock className="h-5 w-5 text-amber-600 shrink-0" />
              <p className="font-semibold text-sm">Alterar metodologia já atribuída</p>
            </div>
            <p className="text-xs text-muted-foreground">
              O parâmetro <strong>{changeMethodConfirm.paramName}</strong> já tem a metodologia{" "}
              <strong>{changeMethodConfirm.currentShort}</strong> atribuída.{" "}
              {changeMethodConfirm.newShortName
                ? <>Será trocada por <strong>{changeMethodConfirm.newShortName}</strong>.</>
                : "Será desvinculada."}
              {" "}Digite a senha mestra para confirmar.
            </p>
            <div className="relative">
              <input
                type={changeMethodShowPwd ? "text" : "password"}
                value={changeMethodPwd}
                onChange={e => { setChangeMethodPwd(e.target.value); setChangeMethodError(""); }}
                onKeyDown={e => { if (e.key === "Enter") handleChangeMethodology(); if (e.key === "Escape") { setChangeMethodConfirm(null); } }}
                placeholder="Senha mestra"
                autoFocus
                className="w-full border border-border rounded px-3 py-1.5 text-sm pr-9 focus:outline-none focus:ring-1 focus:ring-primary"
              />
              <button type="button" onClick={() => setChangeMethodShowPwd(s => !s)} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground">
                {changeMethodShowPwd ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
            {changeMethodError && <p className="text-xs text-destructive font-medium -mt-2">{changeMethodError}</p>}
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => { setChangeMethodConfirm(null); setChangeMethodPwd(""); setChangeMethodError(""); }} className="text-xs px-3 py-1.5 rounded border border-border hover:bg-muted">Cancelar</button>
              <button type="button" onClick={handleChangeMethodology} disabled={changeMethodLoading || !changeMethodPwd.trim()} className="text-xs px-3 py-1.5 rounded bg-primary text-white hover:bg-primary/80 disabled:opacity-50">
                {changeMethodLoading ? "Verificando…" : "Confirmar troca"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Dialog — senha para alterar critério em protocolo em_andamento */}
      {criterionPwdPending && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={() => { setCriterionPwdPending(null); setCriterionPwdError(""); }}>
          <div className="bg-white rounded-lg shadow-xl w-80 p-5 space-y-4" onClick={e => e.stopPropagation()}>
            <div className="flex items-center gap-2">
              <Lock className="h-5 w-5 text-amber-600 shrink-0" />
              <p className="font-semibold text-sm">Alterar critério de aceitação</p>
            </div>
            <p className="text-xs text-muted-foreground">
              Este protocolo está <strong>em andamento</strong>. Alterações no critério de aceitação exigem senha mestra e serão salvas <strong>apenas neste documento</strong>.
            </p>
            <div className="relative">
              <input
                type={criterionPwdShow ? "text" : "password"}
                value={criterionPwdValue}
                onChange={e => { setCriterionPwdValue(e.target.value); setCriterionPwdError(""); }}
                onKeyDown={e => { if (e.key === "Enter") confirmCriterionPwd(); if (e.key === "Escape") setCriterionPwdPending(null); }}
                placeholder="Senha mestra"
                autoFocus
                className="w-full border border-border rounded px-3 py-1.5 text-sm pr-9 focus:outline-none focus:ring-1 focus:ring-primary"
              />
              <button type="button" onClick={() => setCriterionPwdShow(s => !s)} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground">
                {criterionPwdShow ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
            {criterionPwdError && <p className="text-xs text-destructive font-medium -mt-2">{criterionPwdError}</p>}
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => { setCriterionPwdPending(null); setCriterionPwdError(""); }} className="text-xs px-3 py-1.5 rounded border border-border hover:bg-muted">Cancelar</button>
              <button type="button" onClick={confirmCriterionPwd} disabled={criterionPwdLoading || !criterionPwdValue.trim()} className="text-xs px-3 py-1.5 rounded bg-primary text-white hover:bg-primary/80 disabled:opacity-50">
                {criterionPwdLoading ? "Verificando…" : "Desbloquear critério"}
              </button>
            </div>
          </div>
        </div>
      )}
      {/* Dialog — metodologia sobrescreveria critério já preenchido */}
      {criterionConfirmPending && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={() => setCriterionConfirmPending(null)}>
          <div className="bg-white rounded-lg shadow-xl w-96 p-5 space-y-3" onClick={e => e.stopPropagation()}>
            <p className="font-semibold text-sm">Substituir critério?</p>
            <p className="text-xs text-muted-foreground">O parâmetro <strong>{criterionConfirmPending.paramName}</strong> já tem critério preenchido:<br /><span className="font-medium text-foreground">"{criterionConfirmPending.currentCriterion}"</span></p>
            <p className="text-xs text-muted-foreground">A metodologia <strong>{criterionConfirmPending.methodName}</strong> traz:<br /><span className="font-medium text-foreground">"{criterionConfirmPending.newCriterion}"</span></p>
            <div className="flex justify-end gap-2 pt-1">
              <button type="button" onClick={() => { criterionConfirmPending.applyFn(false); setCriterionConfirmPending(null); }} className="text-xs px-3 py-1.5 rounded border border-border hover:bg-muted">Manter atual</button>
              <button type="button" onClick={() => { criterionConfirmPending.applyFn(true); setCriterionConfirmPending(null); }} className="text-xs px-3 py-1.5 rounded bg-amber-600 text-white hover:bg-amber-700">Substituir critério</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function FinalizeSection({
  protocolId,
  status,
  currentFinalStatus,
  currentConclusion,
  currentValidityMonths,
  currentIssueDate,
  currentRessalva,
  currentProgressPercent,
  hasNonConformes,
  missingSigners,
  onNeedsUnlock,
  externalOpen,
  onExternalOpenChange,
}: {
  protocolId: number;
  status: string;
  currentFinalStatus?: string | null;
  currentConclusion?: string | null;
  currentValidityMonths?: number | null;
  currentIssueDate?: string | null;
  currentRessalva?: string | null;
  currentProgressPercent?: number | null;
  hasNonConformes?: boolean;
  missingSigners?: string[];
  onNeedsUnlock?: () => void;
  externalOpen?: boolean;
  onExternalOpenChange?: (v: boolean) => void;
}) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [internalOpen, setInternalOpen] = useState(false);
  const [blockingError, setBlockingError] = useState<string | null>(null);
  const open = externalOpen !== undefined ? externalOpen : internalOpen;
  const setOpen = (v: boolean) => {
    setInternalOpen(v);
    onExternalOpenChange?.(v);
  };

  const isAlreadyFinalized = status === "aprovado" || status === "reprovado" || status === "aprovado_com_ressalva";

  // Se há não-conformes e o status salvo NÃO é aprovado_com_ressalva, força reprovado.
  // AR (aprovado_com_ressalva) é exatamente para protocolos com NC que o operador aprova com ressalva.
  const savedRawStatus = (currentFinalStatus as "aprovado" | "reprovado" | "aprovado_com_ressalva" | "em_andamento") ?? "em_andamento";
  const initStatus: "aprovado" | "reprovado" | "aprovado_com_ressalva" | "em_andamento" = (hasNonConformes && savedRawStatus !== "aprovado_com_ressalva") ? "reprovado" : savedRawStatus;
  const form = useForm<z.infer<typeof finalizeSchema>>({
    resolver: zodResolver(finalizeSchema),
    defaultValues: {
      finalStatus: initStatus,
      conclusion: currentConclusion ?? (initStatus === "aprovado_com_ressalva"
        ? "Aprovado. Produto aprovado com ressalva. Atende aos critérios de especificação, com as devidas observações registradas na justificativa técnica."
        : initStatus === "reprovado"
          ? "Produto reprovado. Não atende aos critérios de especificação estabelecidos para o período de estabilidade avaliado."
          : initStatus === "em_andamento"
            ? ""
            : "Produto aprovado. Atende a todos os critérios de especificação estabelecidos para o período de estabilidade avaliado."),
      validityMonths: currentValidityMonths ?? 24,
      issueDate: currentIssueDate ?? new Date().toISOString().split("T")[0],
      ressalva: currentRessalva ?? "",
      progressPercent: currentProgressPercent ?? undefined,
    },
  });

  const finalStatusWatch = form.watch("finalStatus");

  const CONCLUSION_DEFAULTS: Record<string, string> = {
    aprovado: "Produto aprovado. Atende a todos os critérios de especificação estabelecidos para o período de estabilidade avaliado.",
    aprovado_com_ressalva: "Aprovado. Produto aprovado com ressalva. Atende aos critérios de especificação, com as devidas observações registradas na justificativa técnica.",
    reprovado: "Produto reprovado. Não atende aos critérios de especificação estabelecidos para o período de estabilidade avaliado.",
  };

  // Auto-fill conclusion when finalStatus changes (only if conclusion is empty or matches a default)
  // Also clear any blocking error when the user changes the selection.
  // When switching back to em_andamento, restore progressPercent from saved value so it is never lost.
  // When switching to aprovado/aprovado_com_ressalva with non-conformes, show error immediately.
  useEffect(() => {
    if (!finalStatusWatch) return;
    if (finalStatusWatch === "em_andamento") {
      setBlockingError(null);
      if (currentProgressPercent != null) {
        form.setValue("progressPercent", currentProgressPercent);
      }
    } else if (finalStatusWatch === "aprovado" && hasNonConformes) {
      setBlockingError("Protocolo fora das especificações de liberação. Existem parâmetros não conformes na aba Resultados.");
      const current = form.getValues("conclusion")?.trim() ?? "";
      const isDefaultOrEmpty = !current || Object.values(CONCLUSION_DEFAULTS).some(d => d === current);
      if (isDefaultOrEmpty) form.setValue("conclusion", CONCLUSION_DEFAULTS[finalStatusWatch] ?? "");
    } else {
      setBlockingError(null);
      const current = form.getValues("conclusion")?.trim() ?? "";
      const isDefaultOrEmpty = !current || Object.values(CONCLUSION_DEFAULTS).some(d => d === current);
      if (isDefaultOrEmpty) {
        form.setValue("conclusion", CONCLUSION_DEFAULTS[finalStatusWatch] ?? "");
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [finalStatusWatch]);

  // When the dialog opens, re-sync form values from current protocol data
  const handleOpenChange = (next: boolean) => {
    if (next) {
      const rawSaved = (currentFinalStatus as "aprovado" | "reprovado" | "aprovado_com_ressalva" | "em_andamento") ?? "em_andamento";
      // Protocolo com não-conformes e sem AR → abre como reprovado. Se já era AR, mantém AR.
      const effectiveStatus: "aprovado" | "reprovado" | "aprovado_com_ressalva" | "em_andamento" = (hasNonConformes && rawSaved !== "aprovado_com_ressalva") ? "reprovado" : rawSaved;
      form.reset({
        finalStatus: effectiveStatus,
        conclusion: currentConclusion ?? CONCLUSION_DEFAULTS[effectiveStatus] ?? "",
        validityMonths: currentValidityMonths ?? 24,
        issueDate: currentIssueDate ?? new Date().toISOString().split("T")[0],
        ressalva: currentRessalva ?? "",
        progressPercent: currentProgressPercent ?? undefined,
      });
      // Reprovado já está selecionado quando há não-conformes; blockingError só aparece
      // se o usuário ALTERAR manualmente para aprovado (tratado pelo useEffect abaixo).
      if (effectiveStatus === "aprovado" && hasNonConformes) {
        setBlockingError("Protocolo fora das especificações de liberação. Existem parâmetros não conformes na aba Resultados.");
      } else {
        setBlockingError(null);
      }
    }
    setOpen(next);
  };

  const finalize = useFinalizeProtocol({
    mutation: {
      onSuccess: (data) => {
        // Close dialog first (portal unmounts cleanly), then defer invalidations.
        setOpen(false);
        const autoReprovado = (data as unknown as Record<string, unknown>)._autoReprovado === true;
        if (autoReprovado) {
          toast({
            title: "⚠️ Protocolo salvo como REPROVADO automaticamente",
            description: "A tentativa de aprovação foi bloqueada: existem parâmetros não conformes. O protocolo foi registrado como Reprovado.",
            variant: "destructive",
          });
        } else {
          toast({ title: isAlreadyFinalized ? "Avaliação corrigida com sucesso" : "Protocolo finalizado com sucesso" });
        }
        setTimeout(() => {
          queryClient.invalidateQueries({ queryKey: getGetProtocolQueryKey(protocolId) });
          queryClient.invalidateQueries({ queryKey: getGetCertificateQueryKey(protocolId) });
          queryClient.invalidateQueries({ queryKey: getGetProtocolStatsQueryKey() });
          queryClient.invalidateQueries({ queryKey: getListProtocolsQueryKey() });
        }, 0);
      },
      onError: (err: unknown) => {
        const apiMsg = (err as { data?: { error?: string } })?.data?.error;
        if (apiMsg) {
          setBlockingError(apiMsg);
        } else {
          toast({ title: "Erro ao salvar avaliação", variant: "destructive" });
        }
      },
    },
  });

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        {isAlreadyFinalized ? (
          <Button
            variant="outline"
            size="sm"
            data-testid="button-reopen-finalize"
            onClick={(e) => { if (onNeedsUnlock) { e.preventDefault(); onNeedsUnlock(); } }}
          >
            {onNeedsUnlock ? <Lock className="h-4 w-4 mr-1 text-amber-500" /> : <Pencil className="h-4 w-4 mr-1" />}
            Corrigir Avaliação Final
          </Button>
        ) : (
          <Button variant="default" data-testid="button-finalize">
            <Award className="h-4 w-4 mr-2" /> Finalizar Protocolo
          </Button>
        )}
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {isAlreadyFinalized ? "Corrigir Avaliação Final do Protocolo" : "Avaliação Final do Protocolo"}
          </DialogTitle>
          {isAlreadyFinalized && (
            <p className="text-xs text-muted-foreground pt-1">
              Você pode alterar o status, conclusão, validade e data de emissão. Os resultados de análise devem ser corrigidos na aba Resultados.
            </p>
          )}
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit((v) => {
            // Guarda absoluta: se há erro de bloqueio e status é aprovação, rejeita submissão
            if (blockingError && (v.finalStatus === "aprovado" || v.finalStatus === "aprovado_com_ressalva")) return;
            finalize.mutate({ id: protocolId, data: v });
          })} className="space-y-4">
            <FormField control={form.control} name="finalStatus" render={({ field }) => (
              <FormItem>
                <FormLabel>Status Final</FormLabel>
                <Select onValueChange={field.onChange} value={field.value}>
                  <FormControl>
                    <SelectTrigger data-testid="select-finalStatus">
                      <SelectValue />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    <SelectItem value="em_andamento">
                      <span className="flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full bg-blue-500 inline-block" /> Análises em Andamento
                      </span>
                    </SelectItem>
                    <SelectItem value="aprovado">
                      <span className="flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full bg-green-500 inline-block" /> Aprovado
                      </span>
                    </SelectItem>
                    <SelectItem value="aprovado_com_ressalva">
                      <span className="flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full bg-amber-500 inline-block" /> Aprovado com Ressalva
                      </span>
                    </SelectItem>
                    <SelectItem value="reprovado">
                      <span className="flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full bg-red-500 inline-block" /> Reprovado
                      </span>
                    </SelectItem>
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )} />
            {finalStatusWatch === "em_andamento" && (
              <FormField control={form.control} name="progressPercent" render={({ field }) => (
                <FormItem>
                  <FormLabel className="flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-blue-500 inline-block" />
                    Progresso das Análises (%)
                    <span className="text-xs font-normal text-muted-foreground ml-1">opcional</span>
                  </FormLabel>
                  <FormControl>
                    <Input
                      type="number"
                      min={0}
                      max={100}
                      placeholder="Ex: 50"
                      data-testid="input-progressPercent"
                      {...field}
                    />
                  </FormControl>
                  <p className="text-xs text-blue-700 bg-blue-50 border border-blue-200 rounded px-2 py-1">
                    O protocolo voltará para a fila <strong>Em Andamento</strong> no painel.
                  </p>
                  <FormMessage />
                </FormItem>
              )} />
            )}
            {finalStatusWatch !== "em_andamento" && (
              <FormField control={form.control} name="conclusion" render={({ field }) => (
                <FormItem>
                  <FormLabel>Conclusao</FormLabel>
                  <FormControl><Textarea rows={3} data-testid="input-conclusion" {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
            )}
            {finalStatusWatch === "aprovado_com_ressalva" && (
              <FormField control={form.control} name="ressalva" render={({ field }) => (
                <FormItem>
                  <FormLabel className="flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-amber-500 inline-block" />
                    Justificativa da Ressalva
                    <span className="text-destructive ml-0.5">*</span>
                    <span className="text-xs font-normal text-muted-foreground">(obrigatório)</span>
                  </FormLabel>
                  <FormControl>
                    <Textarea
                      rows={4}
                      data-testid="input-ressalva"
                      placeholder="Descreva detalhadamente o motivo pelo qual o protocolo está sendo aprovado com ressalva, indicando quais parâmetros apresentaram desvio e a justificativa técnica para a liberação. Mínimo 10 caracteres."
                      className="border-amber-400 focus-visible:ring-amber-400 bg-amber-50/50"
                      {...field}
                    />
                  </FormControl>
                  <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded px-2 py-1">
                    Este texto fica registrado para fins de auditoria e rastreabilidade — <strong>não aparece no certificado</strong>.
                  </p>
                  <FormMessage />
                </FormItem>
              )} />
            )}
            {finalStatusWatch !== "em_andamento" && (
              <div className="grid grid-cols-2 gap-4">
                <FormField control={form.control} name="validityMonths" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Validade (meses)</FormLabel>
                    <FormControl><Input type="number" data-testid="input-validityMonths" {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={form.control} name="issueDate" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Data de Emissão</FormLabel>
                    <FormControl><Input type="date" data-testid="input-issueDate" {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
              </div>
            )}
            {missingSigners && missingSigners.length > 0 && finalStatusWatch !== "em_andamento" && (
              <div className="flex items-start gap-2.5 rounded-md border-2 border-amber-500 bg-amber-50 px-4 py-3">
                <svg className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
                </svg>
                <div>
                  <p className="text-sm font-bold text-amber-700 uppercase tracking-wide">Assinaturas Pendentes</p>
                  <p className="text-sm text-amber-700 mt-0.5">
                    Para finalizar o protocolo, todos os membros listados devem assinar o certificado. Pendente(s): <strong>{missingSigners.join(", ")}</strong>.
                  </p>
                </div>
              </div>
            )}
            {blockingError && (
              <div className="flex items-start gap-2.5 rounded-md border-2 border-red-600 bg-red-50 px-4 py-3">
                <svg className="mt-0.5 h-5 w-5 shrink-0 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
                </svg>
                <div>
                  <p className="text-sm font-bold text-red-700 uppercase tracking-wide">Não Autorizado</p>
                  <p className="text-sm text-red-700 mt-0.5">{blockingError}</p>
                </div>
              </div>
            )}
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
              <Button
                type="submit"
                disabled={
                  finalize.isPending ||
                  (!!blockingError && (finalStatusWatch === "aprovado" || finalStatusWatch === "aprovado_com_ressalva"))
                }
              >
                {finalize.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                {isAlreadyFinalized ? "Salvar Correção" : "Confirmar Avaliacao"}
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}

export default function ProtocolDetail() {
  const { id } = useParams<{ id: string }>();
  const [, setLocation] = useLocation();
  const numId = Number(id);
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { hasPermission } = useAuth();
  const { unlocked, unlock, lock } = useUnlock();
  const [unlockDialogOpen, setUnlockDialogOpen] = useState(false);
  const [pendingAction, setPendingAction] = useState<(() => void) | null>(null);
  const [finalizeDialogOpen, setFinalizeDialogOpen] = useState(false);
  const [deletePasswordOpen, setDeletePasswordOpen] = useState(false);
  const [activeTab, setActiveTab] = useState("info");

  const { data: protocol, isLoading } = useGetProtocol(numId, {
    query: { enabled: !!id, queryKey: getGetProtocolQueryKey(numId) },
  });

  const { data: signatures = [] } = useListSignatures(numId, {
    query: { enabled: !!id, queryKey: getListSignaturesQueryKey(numId) },
  });

  const missingSigners = (() => {
    if (!protocol) return [];
    const normName = (s: string) =>
      s.trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, " ");
    const hasSigned = (name: string | null | undefined) => {
      if (!name?.trim()) return true;
      const nn = normName(name);
      return signatures.some(s => {
        const ns = normName(s.userDisplay);
        return ns === nn || ns.includes(nn) || nn.includes(ns);
      });
    };
    const missing: string[] = [];
    if (!hasSigned(protocol.issuedBy)) missing.push(protocol.issuedBy ?? "Responsável Técnico");
    if (!hasSigned(protocol.seniorAnalyst)) missing.push(protocol.seniorAnalyst ?? "Analista Sênior");
    return missing;
  })();

  // "aprovado_com_ressalva" is intentionally excluded — it remains freely editable without password
  const isFinalized = !!(protocol?.finalStatus === "aprovado" || protocol?.finalStatus === "reprovado");
  const needsPassword = isFinalized && !unlocked;

  // Guard: runs action if unlocked, otherwise opens the password dialog first
  const guardedAction = (action: () => void) => {
    if (!needsPassword) { action(); return; }
    setPendingAction(() => action);
    setUnlockDialogOpen(true);
  };

  const updateProtocol = useUpdateProtocol();

  // Estado local para refletir overages aplicados na cinética IMEDIATAMENTE,
  // sem esperar refetch do DB. Sobrescreve protocol.ativoLimitsJson no KineticsTab.
  const [localAtivoLimitsJson, setLocalAtivoLimitsJson] = useState<string | null>(null);

  const deleteProtocol = useDeleteProtocol({
    mutation: {
      onSuccess: () => {
        // Remove the protocol from cache and navigate away BEFORE invalidating
        // other queries. This prevents ProtocolDetail from re-rendering with
        // missing/undefined data (which would trip the error boundary briefly).
        queryClient.removeQueries({ queryKey: getGetProtocolQueryKey(numId) });
        setLocation("/");
        queryClient.invalidateQueries({ queryKey: getListProtocolsQueryKey() });
        queryClient.invalidateQueries({ queryKey: getGetProtocolStatsQueryKey() });
        toast({ title: "Protocolo removido" });
      },
      onError: (err) => {
        const anyErr = err as { data?: { error?: string }; message?: string; status?: number };
        const description =
          anyErr?.status === 401
            ? "Sua sessão expirou. Faça login novamente."
            : anyErr?.data?.error ?? anyErr?.message ?? "Erro ao excluir protocolo. Tente novamente.";
        toast({ variant: "destructive", title: "Erro ao excluir", description });
      },
    },
  });

  // Overage recomendado calculado em tempo real pelo KineticsTab (cálculo reverso ICH).
  // Vive em ProtocolDetail para poder ser passado tanto para KineticsTab quanto para ResultsTab.
  const [recommendedKineticsOverages, setRecommendedKineticsOverages] = useState<Record<string, number>>({});
  const handleRecommendedOverages = useCallback((recs: Record<string, number>) => {
    setRecommendedKineticsOverages(recs);
  }, []);

  // Called by KineticsTab when the user applies an overage % to a parameter.
  // Atualiza localAtivoLimitsJson IMEDIATAMENTE (KineticsTab re-renderiza na hora)
  // e persiste no DB em segundo plano.
  const handleApplyOverage = (param: string, overage: string) => {
    if (!protocol) return;
    type LimEntry = { min: string; max: string; unit: string; declared: string; overage: string };
    // Base: usa o estado local já aplicado (se houver) ou o DB
    let base: Record<string, LimEntry> = {};
    const src = localAtivoLimitsJson ?? protocol.ativoLimitsJson;
    if (src) { try { base = JSON.parse(src); } catch { /* ignore */ } }
    const existing = base[param] ?? { min: "", max: "", unit: "mg", declared: "", overage: "" };
    const next = { ...base, [param]: { ...existing, overage } };
    const nextJson = JSON.stringify(next);
    // Atualiza estado local imediatamente — KineticsTab reage sem delay
    setLocalAtivoLimitsJson(nextJson);
    // Persiste no DB em background
    updateProtocol.mutate(
      { id: protocol.id, data: { ativoLimitsJson: nextJson } },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getGetProtocolQueryKey(protocol.id) });
          queryClient.invalidateQueries({ queryKey: getGetCertificateQueryKey(protocol.id) });
        },
      }
    );
  };

  // ── Sync certificate: merge localStorage + DB and persist ─────────────────
  const [isSyncingCertificate, setIsSyncingCertificate] = useState(false);

  const handleSyncCertificate = () => {
    if (!protocol) return;
    setIsSyncingCertificate(true);

    // ── 1. Merge ativoLimitsJson (declared quantities) ─────────────────────
    type LimEntry = { min: string; max: string; unit: string; declared: string; overage: string };
    const lsKey = `ativo_limits_${numId}`;
    let fromStorage: Record<string, LimEntry> = {};
    let fromDb: Record<string, LimEntry> = {};

    try {
      const raw = localStorage.getItem(lsKey);
      fromStorage = raw ? JSON.parse(raw) : {};
    } catch { /* ignore */ }

    if (protocol.ativoLimitsJson) {
      try { fromDb = JSON.parse(protocol.ativoLimitsJson); } catch { /* ignore */ }
    }

    // Merge: localStorage wins per-field (it holds the most recent user edits).
    // DB values fill in only when localStorage has an empty string for that field.
    // This prevents non-empty DB values like "livre" from overwriting a user's
    // pending edit that hasn't been flushed to the DB yet.
    const merged = { ...fromStorage };
    for (const [param, dbLim] of Object.entries(fromDb)) {
      const sl = fromStorage[param];
      merged[param] = {
        min: sl?.min || dbLim.min || "",
        max: sl?.max || dbLim.max || "",
        unit: sl?.unit || dbLim.unit || "mg",
        declared: sl?.declared || dbLim.declared || "",
        overage: sl?.overage || dbLim.overage || "",
      };
    }

    // Also write back to localStorage so it stays in sync
    try { localStorage.setItem(lsKey, JSON.stringify(merged)); } catch { /* ignore */ }

    // ── 2. Collect kineticsOverridesJson from localStorage (unsaved overrides) ─
    // saveOverridesToDb clears localStorage on success, so any remaining data
    // means the user has unsaved kinetics values (e.g. manual T6 entries).
    // Convert from localStorage format → DB format so the certificate server
    // can read them via getKineticsT6(param).
    type KineticOvEntry = { t0?: string; t3?: string; t6?: string; specMin?: string; specMax?: string; validadePraticada?: string; ichThreshold?: string };
    type KineticsOvDB = { savedAt?: string; params?: Record<string, KineticOvEntry>; customShelfLife?: string; selectedShelfBox?: string };
    let kineticsOverridesPayload: string | null = null;
    try {
      const kinLsKey = `kinetics_overrides_${numId}`;
      const kinRaw = localStorage.getItem(kinLsKey);
      if (kinRaw) {
        const stored = JSON.parse(kinRaw) as { overrides?: Record<string, KineticOvEntry>; customShelfLife?: string };
        if (stored.overrides && Object.keys(stored.overrides).length > 0) {
          const payload: KineticsOvDB = {
            savedAt: new Date().toISOString(),
            params: {},
            customShelfLife: stored.customShelfLife || undefined,
            selectedShelfBox: (stored as Record<string, unknown>).selectedShelfBox as string | undefined,
          };
          for (const [param, ov] of Object.entries(stored.overrides)) {
            payload.params![param] = {
              t0: ov.t0, t3: ov.t3, t6: ov.t6,
              specMin: ov.specMin, specMax: ov.specMax,
              validadePraticada: ov.validadePraticada,
              ichThreshold: ov.ichThreshold,
            };
          }
          kineticsOverridesPayload = JSON.stringify(payload);
        }
      }
    } catch { /* ignore */ }

    const updateData: Record<string, string | null> = { ativoLimitsJson: JSON.stringify(merged) };
    if (kineticsOverridesPayload) updateData.kineticsOverridesJson = kineticsOverridesPayload;

    updateProtocol.mutate(
      { id: numId, data: updateData as Parameters<typeof updateProtocol.mutate>[0]["data"] },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getGetProtocolQueryKey(numId) });
          queryClient.invalidateQueries({ queryKey: getGetCertificateQueryKey(numId) });
          queryClient.invalidateQueries({ queryKey: getGetKineticsQueryKey(numId) });
          setIsSyncingCertificate(false);
          toast({ title: "✓ Sincronizado com sucesso", description: "Todos os valores de teor declarado foram enviados ao certificado." });
        },
        onError: () => {
          setIsSyncingCertificate(false);
          toast({ variant: "destructive", title: "Erro ao sincronizar", description: "Tente novamente." });
        },
      }
    );
  };

  if (isLoading) {
    return (
      <div className="space-y-4 animate-pulse">
        <div className="h-8 w-64 bg-muted rounded" />
        <div className="h-48 bg-muted rounded" />
      </div>
    );
  }

  if (!protocol) {
    return (
      <div className="text-center py-16 text-muted-foreground">
        <p>Protocolo não encontrado.</p>
        <Link href="/"><Button variant="link" className="mt-2">Voltar ao Dashboard</Button></Link>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* ── Unlock dialog ── */}
      <UnlockDialog
        open={unlockDialogOpen}
        onOpenChange={setUnlockDialogOpen}
        onUnlock={unlock}
        onSuccess={() => { pendingAction?.(); setPendingAction(null); }}
      />

      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-4">
          <Link href="/">
            <Button variant="ghost" size="sm" data-testid="button-back">
              <ArrowLeft className="h-4 w-4 mr-1" /> Voltar
            </Button>
          </Link>
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold tracking-tight">{protocol.productName}</h1>
              <span className={`text-xs font-semibold px-2 py-1 rounded border ${STATUS_COLORS[protocol.status]}`} data-testid="status-protocol">
                {STATUS_LABELS[protocol.status] ?? protocol.status}
              </span>
              {/* Lock indicator */}
              {isFinalized && (
                <button
                  type="button"
                  onClick={() => unlocked ? lock() : setUnlockDialogOpen(true)}
                  className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded border transition-colors ${
                    unlocked
                      ? "bg-green-50 border-green-300 text-green-700 hover:bg-red-50 hover:border-red-300 hover:text-red-700"
                      : "bg-amber-50 border-amber-300 text-amber-700 hover:bg-amber-100"
                  }`}
                  title={unlocked ? "Clique para bloquear novamente" : "Clique para desbloquear edição"}
                >
                  {unlocked ? <Unlock className="h-3 w-3" /> : <Lock className="h-3 w-3" />}
                  {unlocked ? "Desbloqueado" : "Protegido"}
                </button>
              )}
            </div>
            <p className="text-sm text-muted-foreground mt-0.5">
              {protocol.certNumber} &bull; {protocol.companyName}
            </p>
          </div>
        </div>
        <div className="flex gap-2 flex-wrap justify-end">
          {hasPermission("protocols:finalize") && (
            <FinalizeSection
              protocolId={numId}
              status={protocol.status}
              currentFinalStatus={protocol.finalStatus}
              currentConclusion={protocol.conclusion}
              currentValidityMonths={protocol.validityMonths}
              currentIssueDate={protocol.issueDate}
              currentRessalva={protocol.ressalva}
              currentProgressPercent={protocol.progressPercent}
              hasNonConformes={protocol.results?.some(r => r.status === "nao_conforme") ?? false}
              missingSigners={missingSigners}
              externalOpen={finalizeDialogOpen}
              onExternalOpenChange={setFinalizeDialogOpen}
              onNeedsUnlock={needsPassword ? () => {
                setPendingAction(() => () => setFinalizeDialogOpen(true));
                setUnlockDialogOpen(true);
              } : undefined}
            />
          )}
          {(() => {
            const hasNC = protocol.results?.some(r => r.status === "nao_conforme") ?? false;
            const isApproved = protocol.status === "aprovado" || protocol.status === "aprovado_com_ressalva" || protocol.status === "reprovado";
            const certBlocked = hasNC && !isApproved;
            if (certBlocked) {
              return (
                <Button
                  variant="outline"
                  size="sm"
                  disabled
                  title="Certificado bloqueado: existem parâmetros não conformes nos resultados"
                  className="opacity-50 cursor-not-allowed"
                >
                  <Award className="h-4 w-4 mr-1" /> Certificado
                </Button>
              );
            }
            return (
              <>
                <Link href={`/protocols/${id}/certificate`}>
                  <Button variant="outline" size="sm" data-testid="button-view-certificate">
                    <Award className="h-4 w-4 mr-1" /> Certificado
                  </Button>
                </Link>
                <Link href={`/protocols/${id}/report`}>
                  <Button variant="outline" size="sm">
                    <FileText className="h-4 w-4 mr-1" /> Relatório ANVISA
                  </Button>
                </Link>
              </>
            );
          })()}
          {hasPermission("protocols:edit") && (
            <Button
              variant="outline"
              size="sm"
              data-testid="button-edit-protocol"
              onClick={() => setLocation(`/protocols/${id}/edit`)}
            >
              <Pencil className="h-4 w-4 mr-1" />
              Editar
            </Button>
          )}
          {hasPermission("protocols:delete") && (
            <Button
              variant="outline"
              size="sm"
              data-testid="button-delete-protocol"
              onClick={() => setDeletePasswordOpen(true)}
            >
              <Trash2 className="h-4 w-4 text-destructive" />
            </Button>
          )}
          {/* Delete: password verification = confirmation. Single dialog avoids portal conflict. */}
          <UnlockDialog
            open={deletePasswordOpen}
            onOpenChange={setDeletePasswordOpen}
            onUnlock={unlock}
            title="Remover protocolo?"
            description="Esta ação é irreversível e removerá todos os lotes e resultados associados. Digite a senha mestra para confirmar a exclusão."
            submitLabel="Remover permanentemente"
            onSuccess={() => {
              setDeletePasswordOpen(false);
              deleteProtocol.mutate({ id: numId });
            }}
          />
        </div>
      </div>

      {(protocol.finalStatus || protocol.status === "reprovado" || protocol.status === "aprovado" || protocol.status === "aprovado_com_ressalva") && (() => {
        // Usa protocol.status como fonte de verdade canônica — nunca mostra "APROVADO" se status é reprovado
        const st = protocol.status;
        const isAprovado = st === "aprovado";
        const isRessalva = st === "aprovado_com_ressalva";
        const isReprovado = st === "reprovado";
        if (!isAprovado && !isRessalva && !isReprovado) return null;
        const cardClass = isAprovado
          ? "border-green-200 bg-green-50"
          : isRessalva
          ? "border-amber-200 bg-amber-50"
          : "border-red-200 bg-red-50";
        const textClass = isAprovado
          ? "text-green-800"
          : isRessalva
          ? "text-amber-800"
          : "text-red-800";
        const icon = isAprovado
          ? <CheckCircle2 className="h-5 w-5 text-green-600 flex-shrink-0" />
          : isRessalva
          ? <CheckCircle2 className="h-5 w-5 text-amber-500 flex-shrink-0" />
          : <XCircle className="h-5 w-5 text-red-600 flex-shrink-0" />;
        const label = isAprovado ? "APROVADO" : isRessalva ? "APROVADO COM RESSALVA" : "REPROVADO";
        // Validade só é exibida para protocolos aprovados — nunca para reprovados
        const showValidity = (isAprovado || isRessalva) && !!protocol.validityMonths;
        return (
          <Card className={cardClass}>
            <CardContent className="pt-4 pb-4">
              <div className="flex items-center gap-3">
                {icon}
                <div>
                  <p className={`font-semibold text-sm ${textClass}`}>
                    STATUS: {label}
                    {showValidity ? ` — Validade: ${protocol.validityMonths} meses` : ""}
                  </p>
                  {protocol.conclusion && <p className="text-xs text-muted-foreground mt-0.5">{protocol.conclusion}</p>}
                </div>
              </div>
            </CardContent>
          </Card>
        );
      })()}

      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
        <TabsList>
          <TabsTrigger value="info" data-testid="tab-info">Informações</TabsTrigger>
          <TabsTrigger value="lots" data-testid="tab-lots">Lotes</TabsTrigger>
          <TabsTrigger value="results" data-testid="tab-results">Resultado das Análises</TabsTrigger>
          <TabsTrigger value="kinetics" data-testid="tab-kinetics">Cinética</TabsTrigger>
          <TabsTrigger value="metodologia" data-testid="tab-metodologia">Metodologia</TabsTrigger>
          <TabsTrigger value="historico" data-testid="tab-historico"><History className="h-3.5 w-3.5 mr-1" />Histórico</TabsTrigger>
          <TabsTrigger value="documentos" data-testid="tab-documentos"><Paperclip className="h-3.5 w-3.5 mr-1" />Documentos</TabsTrigger>
          <TabsTrigger value="referencias" data-testid="tab-referencias"><BookOpen className="h-3.5 w-3.5 mr-1" />Referências</TabsTrigger>
          <TabsTrigger value="versoes" data-testid="tab-versoes"><SaveAll className="h-3.5 w-3.5 mr-1" />Versões</TabsTrigger>
          <TabsTrigger value="anvisa" data-testid="tab-anvisa"><ShieldCheck className="h-3.5 w-3.5 mr-1" />ANVISA</TabsTrigger>
        </TabsList>
        <TabsContent value="info">
          <Card>
            <CardContent className="pt-6">
              <ProtocolInfoTab protocol={protocol} />
            </CardContent>
          </Card>
        </TabsContent>
        <TabsContent value="lots">
          <Card>
            <CardContent className="pt-6">
              <LotsTab protocolId={numId} />
            </CardContent>
          </Card>
        </TabsContent>
        <TabsContent value="results">
          <Card>
            <CardContent className="pt-6">
              <ResultsTab
                protocolId={numId}
                isPowder={/\b(p[oó]|sachê|sachet|powder|granulado)\b/i.test(protocol.productType ?? "")}
                initialCustomParamsJson={protocol.customParamsJson}
                initialPeriodDatesJson={protocol.periodDatesJson}
                initialParamMethodsJson={protocol.paramMethodsJson}
                initialParamMethodsCitationsJson={protocol.paramMethodsCitationsJson}
                protocolFinalStatus={protocol.finalStatus}
                protocolStatus={protocol.status}
                initialAtivoLimitsJson={protocol.ativoLimitsJson}
                initialKineticsOverridesJson={protocol.kineticsOverridesJson}
                recommendedKineticsOverages={recommendedKineticsOverages}
                onAtivoLimitsSync={setLocalAtivoLimitsJson}
              />
            </CardContent>
          </Card>
        </TabsContent>
        <TabsContent value="kinetics">
          <Card>
            <CardContent className="pt-6">
              <KineticsTab
                protocolId={numId}
                productName={protocol.productName}
                initialKineticsNotes={protocol.kineticsNotes}
                initialValidityMonths={protocol.validityMonths}
                customParamsJson={protocol.customParamsJson}
                initialKineticsOverridesJson={protocol.kineticsOverridesJson}
                ativoLimitsJson={localAtivoLimitsJson ?? protocol.ativoLimitsJson}
                onApplyOverage={handleApplyOverage}
                onRecommendedOverages={handleRecommendedOverages}
                onSyncCertificate={handleSyncCertificate}
                isSyncingCertificate={isSyncingCertificate}
              />
            </CardContent>
          </Card>
        </TabsContent>
        <TabsContent value="metodologia">
          <Card>
            <CardContent className="pt-6">
              <MethodologiaTab protocolId={numId} initialCustomParamsJson={protocol.customParamsJson} protocolStatus={protocol.status} />
            </CardContent>
          </Card>
        </TabsContent>
        <TabsContent value="historico">
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <History className="h-4 w-4" /> Histórico de Alterações
              </CardTitle>
            </CardHeader>
            <CardContent>
              <AuditTrail protocolId={numId} />
            </CardContent>
          </Card>
        </TabsContent>
        <TabsContent value="documentos">
          <DocumentosTab protocolId={numId} />
        </TabsContent>
        <TabsContent value="referencias">
          <ReferencesTab protocolId={numId} />
        </TabsContent>
        <TabsContent value="versoes">
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <SaveAll className="h-4 w-4" /> Versões Salvas
              </CardTitle>
            </CardHeader>
            <CardContent>
              <VersionsTab protocolId={numId} />
            </CardContent>
          </Card>
        </TabsContent>
        <TabsContent value="anvisa">
          <AnvisaTab protocolId={numId} protocolInfo={{
            companyName: protocol.companyName,
            cnpj: protocol.cnpj,
            productName: protocol.productName,
            productType: protocol.productType ?? null,
            activeIngredients: protocol.activeIngredients ?? null,
            approvedBy: protocol.approvedBy ?? null,
            certNumber: protocol.certNumber ?? "",
          }} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

type ProtocolSnapshot = {
  id: number;
  protocolId: number;
  label: string;
  createdBy: string;
  createdAt: string;
};

function VersionsTab({ protocolId }: { protocolId: number }) {
  const { token } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: snapshots = [], isLoading, refetch } = useQuery<ProtocolSnapshot[]>({
    queryKey: ["snapshots", protocolId],
    queryFn: async () => {
      const res = await fetch(`/api/protocols/${protocolId}/snapshots`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok) throw new Error("Erro ao carregar versões.");
      return res.json() as Promise<ProtocolSnapshot[]>;
    },
    staleTime: 15_000,
  });

  const [createOpen, setCreateOpen] = useState(false);
  const [createLabel, setCreateLabel] = useState("");
  const [creating, setCreating] = useState(false);

  const [restoreTarget, setRestoreTarget] = useState<ProtocolSnapshot | null>(null);
  const [restorePassword, setRestorePassword] = useState("");
  const [restoreError, setRestoreError] = useState("");
  const [restoring, setRestoring] = useState(false);

  const [deleteTarget, setDeleteTarget] = useState<ProtocolSnapshot | null>(null);
  const [deleting, setDeleting] = useState(false);

  const handleCreate = async () => {
    setCreating(true);
    try {
      const res = await fetch(`/api/protocols/${protocolId}/snapshots`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ label: createLabel.trim() || undefined }),
      });
      if (!res.ok) throw new Error("Erro ao salvar versão.");
      toast({ title: "Versão salva!", description: "O estado atual do protocolo foi salvo." });
      setCreateOpen(false);
      setCreateLabel("");
      queryClient.invalidateQueries({ queryKey: ["snapshots", protocolId] });
    } catch (e: unknown) {
      toast({ title: "Erro", description: e instanceof Error ? e.message : "Erro desconhecido.", variant: "destructive" });
    } finally {
      setCreating(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/protocols/${protocolId}/snapshots/${deleteTarget.id}`, {
        method: "DELETE",
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok) throw new Error("Erro ao excluir versão.");
      toast({ title: "Versão excluída", description: `"${deleteTarget.label}" foi removida.` });
      setDeleteTarget(null);
      queryClient.invalidateQueries({ queryKey: ["snapshots", protocolId] });
    } catch (e: unknown) {
      toast({ title: "Erro", description: e instanceof Error ? e.message : "Erro desconhecido.", variant: "destructive" });
    } finally {
      setDeleting(false);
    }
  };

  const handleRestore = async () => {
    if (!restoreTarget) return;
    setRestoreError("");
    setRestoring(true);
    try {
      const res = await fetch(`/api/protocols/${protocolId}/snapshots/${restoreTarget.id}/restore`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ password: restorePassword }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({ error: "Erro ao restaurar." })) as { error?: string };
        setRestoreError(body.error ?? "Erro ao restaurar.");
        setRestoring(false);
        return;
      }
      toast({
        title: "Protocolo restaurado!",
        description: `Restaurado para "${restoreTarget.label}". Recarregue a página para ver todas as alterações.`,
      });
      setRestoreTarget(null);
      setRestorePassword("");
      queryClient.invalidateQueries({ queryKey: ["snapshots", protocolId] });
      queryClient.invalidateQueries({ queryKey: getGetProtocolQueryKey(protocolId) });
      queryClient.invalidateQueries({ queryKey: getListLotsQueryKey(protocolId) });
      queryClient.invalidateQueries({ queryKey: getListResultsQueryKey(protocolId) });
      queryClient.invalidateQueries({ queryKey: getGetKineticsQueryKey(protocolId) });
    } catch {
      setRestoreError("Erro inesperado. Tente novamente.");
    } finally {
      setRestoring(false);
    }
  };

  const fmtDate = (iso: string) =>
    new Date(iso).toLocaleString("pt-BR", {
      day: "2-digit", month: "2-digit", year: "numeric",
      hour: "2-digit", minute: "2-digit",
    });

  const isAuto = (label: string) => label.startsWith("Auto:");

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-sm text-muted-foreground">
            Salve o estado completo do protocolo a qualquer momento — lotes, resultados e parâmetros.
            Para restaurar uma versão anterior, use o botão <strong>Restaurar</strong> na linha desejada.
          </p>
          <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
            <ShieldAlert className="h-3.5 w-3.5 text-amber-500" />
            Versões automáticas são criadas antes de cada Finalização. A restauração requer senha mestra.
          </p>
        </div>
        <Button onClick={() => { setCreateLabel(""); setCreateOpen(true); }} className="gap-2 shrink-0">
          <SaveAll className="h-4 w-4" /> Salvar versão agora
        </Button>
      </div>

      {/* Create dialog */}
      <AlertDialog open={createOpen} onOpenChange={(o) => { if (!o) setCreateOpen(false); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <SaveAll className="h-5 w-5 text-primary" /> Salvar versão atual
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3">
                <p>Será salvo um snapshot completo do protocolo: dados gerais, lotes e todos os resultados de análise.</p>
                <div className="space-y-1.5">
                  <label className="text-sm font-medium text-foreground">Descrição (opcional)</label>
                  <Input
                    placeholder="ex: Antes de inserir resultados T6"
                    value={createLabel}
                    onChange={(e) => setCreateLabel(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter") handleCreate(); }}
                    autoFocus
                  />
                </div>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={creating} onClick={() => setCreateOpen(false)}>Cancelar</AlertDialogCancel>
            <Button onClick={handleCreate} disabled={creating}>
              {creating ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Salvando…</> : "Salvar versão"}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete dialog */}
      <AlertDialog open={deleteTarget !== null} onOpenChange={(o) => { if (!o) setDeleteTarget(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 text-red-700">
              <Trash2 className="h-5 w-5" /> Excluir versão
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2">
                <p>Tem certeza que deseja excluir a versão <strong className="text-foreground">"{deleteTarget?.label}"</strong>?</p>
                <p className="text-xs text-muted-foreground">Esta ação é permanente e não pode ser desfeita. Os dados do protocolo atual não serão afetados.</p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting} onClick={() => setDeleteTarget(null)}>Cancelar</AlertDialogCancel>
            <Button variant="destructive" onClick={handleDelete} disabled={deleting}>
              {deleting ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Excluindo…</> : "Excluir versão"}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Restore dialog */}
      <AlertDialog open={restoreTarget !== null} onOpenChange={(o) => { if (!o) { setRestoreTarget(null); setRestorePassword(""); setRestoreError(""); } }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 text-red-700">
              <RotateCcw className="h-5 w-5" /> Restaurar versão
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3">
                <p>
                  Restaurar para: <strong className="text-foreground">{restoreTarget?.label}</strong>
                  <br />
                  <span className="text-xs text-muted-foreground">{restoreTarget ? fmtDate(restoreTarget.createdAt) : ""} · por {restoreTarget?.createdBy}</span>
                </p>
                <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800 space-y-1">
                  <p className="font-semibold">⚠ Esta ação é IRREVERSÍVEL.</p>
                  <p>O estado atual do protocolo (lotes + resultados + parâmetros) será substituído pela versão selecionada. Uma cópia do estado atual será salva automaticamente antes de restaurar.</p>
                </div>
                <div className="space-y-1.5">
                  <label className="text-sm font-medium text-foreground">Senha mestra para confirmar:</label>
                  <Input
                    type="password"
                    placeholder="Senha mestra"
                    value={restorePassword}
                    onChange={(e) => { setRestorePassword(e.target.value); setRestoreError(""); }}
                    onKeyDown={(e) => { if (e.key === "Enter") handleRestore(); }}
                    autoFocus
                  />
                  {restoreError && <p className="text-xs text-red-600">{restoreError}</p>}
                </div>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={restoring} onClick={() => { setRestoreTarget(null); setRestorePassword(""); setRestoreError(""); }}>
              Cancelar
            </AlertDialogCancel>
            <Button variant="destructive" onClick={handleRestore} disabled={restoring || !restorePassword}>
              {restoring ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Restaurando…</> : "Restaurar esta versão"}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Snapshots list */}
      {isLoading ? (
        <div className="flex items-center gap-2 py-8 text-muted-foreground justify-center">
          <Loader2 className="h-5 w-5 animate-spin" />
          <span className="text-sm">Carregando versões…</span>
        </div>
      ) : snapshots.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground space-y-2">
          <History className="h-10 w-10 mx-auto opacity-20" />
          <p className="text-sm font-medium">Nenhuma versão salva ainda.</p>
          <p className="text-xs">Clique em <strong>Salvar versão agora</strong> para criar o primeiro checkpoint.</p>
        </div>
      ) : (
        <div className="rounded-md border divide-y divide-border">
          {snapshots.map((snap) => (
            <div key={snap.id} className={`flex items-center justify-between gap-4 px-4 py-3 ${isAuto(snap.label) ? "bg-slate-50/60" : "bg-white"}`}>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  {isAuto(snap.label) ? (
                    <span className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-full bg-slate-100 text-slate-600 border border-slate-200 font-medium">
                      <RotateCcw className="h-2.5 w-2.5" /> AUTO
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-full bg-blue-100 text-blue-700 border border-blue-200 font-medium">
                      <SaveAll className="h-2.5 w-2.5" /> MANUAL
                    </span>
                  )}
                  <span className="text-sm font-medium text-foreground truncate">{snap.label}</span>
                </div>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {fmtDate(snap.createdAt)} · {snap.createdBy}
                </p>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-1.5 h-7 text-xs border-amber-300 text-amber-700 hover:bg-amber-50"
                  onClick={() => { setRestoreTarget(snap); setRestorePassword(""); setRestoreError(""); }}
                >
                  <RotateCcw className="h-3 w-3" /> Restaurar
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 text-slate-400 hover:text-red-500 hover:bg-red-50"
                  title="Excluir esta versão"
                  onClick={() => setDeleteTarget(snap)}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="flex justify-end">
        <Button variant="ghost" size="sm" onClick={() => refetch()} className="text-xs gap-1.5 text-muted-foreground">
          <History className="h-3.5 w-3.5" /> Atualizar lista
        </Button>
      </div>
    </div>
  );
}

function DocumentosTab({ protocolId }: { protocolId: number }) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<{ current: number; total: number; pct: number } | null>(null);
  const [description, setDescription] = useState("");
  const [printing, setPrinting] = useState(false);

  // inline edit state
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editFileName, setEditFileName] = useState("");
  const [editDescription, setEditDescription] = useState("");

  const { data: protocol } = useGetProtocol(protocolId);
  const { data: attachments = [], isLoading } = useListAttachments(protocolId);

  const createAttachment = useCreateAttachment({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListAttachmentsQueryKey(protocolId) });
      },
      onError: () => toast({ title: "Erro ao registrar documento", variant: "destructive" }),
    },
  });

  const updateAttachment = useUpdateAttachment({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListAttachmentsQueryKey(protocolId) });
        setEditingId(null);
        toast({ title: "Documento atualizado" });
      },
      onError: () => toast({ title: "Erro ao atualizar documento", variant: "destructive" }),
    },
  });

  const deleteAttachment = useDeleteAttachment({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListAttachmentsQueryKey(protocolId) });
        toast({ title: "Documento removido" });
      },
      onError: () => toast({ title: "Erro ao remover documento", variant: "destructive" }),
    },
  });

  const allowed = [
    "application/pdf",
    "application/msword",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "image/png", "image/jpeg", "image/webp",
  ];

  async function uploadSingleFile(file: File, token: string | null): Promise<void> {
    if (!allowed.includes(file.type)) {
      toast({ title: `"${file.name}" — tipo não suportado`, description: "Aceito: PDF, Word, imagens", variant: "destructive" });
      return;
    }
    const MAX_MB = 20;
    if (file.size > MAX_MB * 1024 * 1024) {
      toast({ title: `"${file.name}" é muito grande (máx ${MAX_MB} MB)`, variant: "destructive" });
      return;
    }
    const urlRes = await fetch("/api/storage/uploads/request-url", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: JSON.stringify({ name: file.name, size: file.size, contentType: file.type }),
    });
    if (!urlRes.ok) throw new Error(`Erro ao obter URL para "${file.name}"`);
    const { uploadURL, objectPath } = await urlRes.json() as { uploadURL: string; objectPath: string };

    const putRes = await fetch(uploadURL, { method: "PUT", body: file, headers: { "Content-Type": file.type } });
    if (!putRes.ok) throw new Error(`Erro ao enviar "${file.name}"`);

    await createAttachment.mutateAsync({
      id: protocolId,
      data: { fileName: file.name, fileType: file.type, fileSizeBytes: file.size, objectPath, description: description || undefined },
    });
  }

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    e.target.value = "";
    if (files.length === 0) return;

    setUploading(true);
    const token = localStorage.getItem("alphafitus_token");
    let done = 0;
    const total = files.length;
    setUploadProgress({ current: 0, total, pct: 0 });

    const errors: string[] = [];
    for (const file of files) {
      try {
        await uploadSingleFile(file, token);
      } catch (err) {
        errors.push(err instanceof Error ? err.message : `Erro: ${file.name}`);
      }
      done++;
      setUploadProgress({ current: done, total, pct: Math.round((done / total) * 100) });
    }

    queryClient.invalidateQueries({ queryKey: getListAttachmentsQueryKey(protocolId) });
    setDescription("");

    if (errors.length === 0) {
      toast({ title: total === 1 ? "Documento anexado com sucesso" : `${total} documentos anexados com sucesso` });
    } else if (errors.length < total) {
      toast({ title: `${total - errors.length} de ${total} enviados`, description: errors[0], variant: "destructive" });
    } else {
      toast({ title: "Falha no upload", description: errors[0], variant: "destructive" });
    }

    setUploading(false);
    setUploadProgress(null);
  }

  function formatSize(bytes: number | null | undefined) {
    if (!bytes) return "";
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  }

  function fileIcon(fileType: string) {
    if (fileType === "application/pdf") return <FileText className="h-5 w-5 text-red-500" />;
    if (fileType.includes("word")) return <FileText className="h-5 w-5 text-blue-600" />;
    if (fileType.startsWith("image/")) return <File className="h-5 w-5 text-green-600" />;
    return <File className="h-5 w-5 text-slate-500" />;
  }

  const token = localStorage.getItem("alphafitus_token");

  async function handlePrintDossier() {
    if (attachments.length === 0) {
      toast({ title: "Nenhum documento para imprimir", variant: "destructive" });
      return;
    }
    setPrinting(true);
    try {
      type DocItem = {
        att: typeof attachments[number];
        blobUrl: string | null;
        isPdf: boolean;
        isImage: boolean;
        isWord: boolean;
      };
      const docItems: DocItem[] = await Promise.all(
        attachments.map(async (att) => {
          const isPdf = att.fileType === "application/pdf";
          const isImage = att.fileType.startsWith("image/");
          const isWord = att.fileType.includes("word") || att.fileType.includes("officedocument.wordprocessingml");
          try {
            const r = await fetch(`/api/storage${att.objectPath}`, {
              headers: token ? { Authorization: `Bearer ${token}` } : {},
            });
            if (!r.ok) return { att, blobUrl: null, isPdf, isImage, isWord };
            const blob = await r.blob();
            return { att, blobUrl: URL.createObjectURL(blob), isPdf, isImage, isWord };
          } catch {
            return { att, blobUrl: null, isPdf, isImage, isWord };
          }
        })
      );

      const protocolName = protocol?.productName ?? `Protocolo #${protocolId}`;
      const companyName = protocol?.companyName ?? "";
      const certNumber = protocol?.certNumber ?? "";
      const today = new Date().toLocaleDateString("pt-BR");

      const indexRows = attachments.map((att, i) => `
        <tr>
          <td style="padding:6px 10px; border:1px solid #ddd; text-align:center; color:#555;">${i + 1}</td>
          <td style="padding:6px 10px; border:1px solid #ddd; font-weight:600;">${att.fileName}</td>
          <td style="padding:6px 10px; border:1px solid #ddd; color:#555;">${att.description || "—"}</td>
          <td style="padding:6px 10px; border:1px solid #ddd; color:#555;">${att.fileType.includes("pdf") ? "PDF" : att.fileType.includes("word") || att.fileType.includes("officedocument") ? "Word" : att.fileType.startsWith("image/") ? "Imagem" : att.fileType}</td>
          <td style="padding:6px 10px; border:1px solid #ddd; color:#555;">${att.uploadedByName}</td>
          <td style="padding:6px 10px; border:1px solid #ddd; color:#555;">${new Date(att.createdAt).toLocaleDateString("pt-BR")}</td>
        </tr>`).join("");

      const docSections = docItems.map((item, i) => {
        const { att, blobUrl, isPdf, isImage } = item;
        const typeLabel = isPdf ? "PDF" : item.isWord ? "Word" : isImage ? "Imagem" : att.fileType;
        const content = blobUrl && isPdf
          ? `<embed src="${blobUrl}" type="application/pdf" width="100%" style="height:calc(100vh - 120px); min-height:900px; border:none;" />`
          : blobUrl && isImage
          ? `<img src="${blobUrl}" style="max-width:100%; max-height:calc(100vh - 120px); display:block; margin:0 auto; border:1px solid #eee;" alt="${att.fileName}" />`
          : `<div style="border:2px dashed #ccc; border-radius:8px; padding:40px; text-align:center; color:#888; margin-top:20px;">
               <p style="font-size:18px; margin:0 0 8px;">Arquivo ${typeLabel}</p>
               <p style="font-size:14px; margin:0;">${att.fileName}</p>
               <p style="font-size:12px; margin:12px 0 0; color:#aaa;">Este formato não pode ser visualizado inline.<br>Imprima o arquivo separadamente.</p>
             </div>`;
        return `
          <div style="page-break-before:always; padding:24px 40px;">
            <div style="border-bottom:2px solid #1e3a5f; padding-bottom:12px; margin-bottom:16px; display:flex; justify-content:space-between; align-items:flex-end;">
              <div>
                <div style="font-size:10px; color:#888; text-transform:uppercase; letter-spacing:1px; margin-bottom:2px;">Documento ${i + 1} de ${attachments.length}</div>
                <div style="font-size:16px; font-weight:700; color:#1e3a5f;">${att.fileName}</div>
                ${att.description ? `<div style="font-size:12px; color:#555; margin-top:2px;">${att.description}</div>` : ""}
              </div>
              <div style="text-align:right; font-size:11px; color:#888;">
                <div>${typeLabel} &bull; ${att.uploadedByName}</div>
                <div>${new Date(att.createdAt).toLocaleDateString("pt-BR")}</div>
              </div>
            </div>
            ${content}
          </div>`;
      }).join("");

      const html = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8"/>
  <title>Dossiê de Documentos — ${protocolName}</title>
  <style>
    * { box-sizing: border-box; }
    body { margin: 0; font-family: Arial, Helvetica, sans-serif; color: #222; background: #fff; }
    @media print {
      .no-print { display: none !important; }
      @page { margin: 15mm; }
    }
  </style>
</head>
<body>
  <!-- CAPA -->
  <div style="padding:40px; min-height:100vh; display:flex; flex-direction:column;">
    <div style="border-bottom:3px solid #1e3a5f; padding-bottom:16px; margin-bottom:24px; display:flex; justify-content:space-between; align-items:flex-end;">
      <div>
        <div style="font-size:11px; color:#888; text-transform:uppercase; letter-spacing:1px;">Alphafitus Laboratório Nutracêutico</div>
        <div style="font-size:22px; font-weight:800; color:#1e3a5f; margin-top:4px;">Dossiê de Documentos Anexos</div>
      </div>
      <div style="text-align:right; font-size:12px; color:#555;">
        <div>Emitido em ${today}</div>
      </div>
    </div>
    <div style="background:#f5f7fa; border:1px solid #dce3ed; border-radius:8px; padding:20px 24px; margin-bottom:28px;">
      <div style="display:grid; grid-template-columns:1fr 1fr; gap:12px 24px;">
        <div><span style="font-size:10px; color:#888; text-transform:uppercase; display:block;">Produto</span><span style="font-weight:700; font-size:14px;">${protocolName}</span></div>
        ${companyName ? `<div><span style="font-size:10px; color:#888; text-transform:uppercase; display:block;">Empresa</span><span style="font-size:14px;">${companyName}</span></div>` : ""}
        ${certNumber ? `<div><span style="font-size:10px; color:#888; text-transform:uppercase; display:block;">Nº Protocolo</span><span style="font-size:14px;">${certNumber}</span></div>` : ""}
        <div><span style="font-size:10px; color:#888; text-transform:uppercase; display:block;">Total de documentos</span><span style="font-size:14px;">${attachments.length} arquivo(s)</span></div>
      </div>
    </div>
    <div style="font-size:13px; font-weight:700; color:#1e3a5f; margin-bottom:10px; text-transform:uppercase; letter-spacing:0.5px;">Índice de Documentos</div>
    <table style="width:100%; border-collapse:collapse; font-size:12px;">
      <thead>
        <tr style="background:#1e3a5f; color:#fff;">
          <th style="padding:8px 10px; border:1px solid #1e3a5f; text-align:center; width:40px;">#</th>
          <th style="padding:8px 10px; border:1px solid #1e3a5f; text-align:left;">Arquivo</th>
          <th style="padding:8px 10px; border:1px solid #1e3a5f; text-align:left;">Descrição</th>
          <th style="padding:8px 10px; border:1px solid #1e3a5f; text-align:left; width:60px;">Tipo</th>
          <th style="padding:8px 10px; border:1px solid #1e3a5f; text-align:left; width:110px;">Responsável</th>
          <th style="padding:8px 10px; border:1px solid #1e3a5f; text-align:left; width:90px;">Data</th>
        </tr>
      </thead>
      <tbody>${indexRows}</tbody>
    </table>
    <div style="margin-top:auto; padding-top:40px; border-top:1px solid #eee; font-size:10px; color:#aaa; text-align:center;">
      Documento gerado pelo sistema Alphafitus Protocolo de Estabilidade &bull; ${today}
    </div>
  </div>
  ${docSections}
  <script>
    window.addEventListener('load', function() {
      var embeds = document.querySelectorAll('embed');
      if (embeds.length > 0) {
        setTimeout(function() { window.print(); }, 1200);
      } else {
        window.print();
      }
    });
  <\/script>
</body>
</html>`;

      const win = window.open("", "_blank");
      if (!win) {
        toast({ title: "Pop-up bloqueado", description: "Permita pop-ups para este site e tente novamente.", variant: "destructive" });
        return;
      }
      win.document.open();
      win.document.write(html);
      win.document.close();
    } finally {
      setPrinting(false);
    }
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Paperclip className="h-4 w-4" /> Documentos do Protocolo
        </CardTitle>
        <div className="flex items-center gap-2">
          {attachments.length > 0 && (
            <Button variant="outline" size="sm" onClick={handlePrintDossier} disabled={printing || uploading}>
              {printing ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : <FileText className="h-3.5 w-3.5 mr-1" />}
              {printing ? "Preparando..." : "Imprimir Dossiê"}
            </Button>
          )}
          <Input
            placeholder="Descrição p/ novos anexos (opcional)"
            value={description}
            onChange={e => setDescription(e.target.value)}
            className="h-8 text-sm w-56"
            disabled={uploading}
          />
          <Button size="sm" onClick={() => fileInputRef.current?.click()} disabled={uploading}>
            {uploading ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : <Upload className="h-3.5 w-3.5 mr-1" />}
            {uploading && uploadProgress
              ? `${uploadProgress.current}/${uploadProgress.total} (${uploadProgress.pct}%)`
              : "Anexar arquivos"}
          </Button>
          <input ref={fileInputRef} type="file" className="hidden" multiple accept=".pdf,.doc,.docx,.png,.jpg,.jpeg,.webp" onChange={handleFileChange} />
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="flex items-center justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
        ) : attachments.length === 0 ? (
          <div className="text-center py-10 text-muted-foreground text-sm">
            <Paperclip className="h-8 w-8 mx-auto mb-2 opacity-30" />
            <p>Nenhum documento anexado.</p>
            <p className="text-xs mt-1">Selecione um ou mais arquivos (PDF, Word, imagens) para anexar de uma vez.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {attachments.map(att => (
              <div key={att.id} className="rounded-lg border bg-muted/30 hover:bg-muted/50 transition-colors">
                {/* ── view row ── */}
                {editingId !== att.id && (
                  <div className="flex items-center gap-3 p-3">
                    <div className="flex-shrink-0">{fileIcon(att.fileType)}</div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{att.fileName}</p>
                      <p className="text-xs text-muted-foreground">
                        {att.description && <span className="mr-2">{att.description} ·</span>}
                        {formatSize(att.fileSizeBytes)}
                        {att.fileSizeBytes ? " · " : ""}
                        <span>{att.uploadedByName}</span>
                        {" · "}
                        {new Date(att.createdAt).toLocaleDateString("pt-BR")}
                      </p>
                    </div>
                    <div className="flex items-center gap-1 flex-shrink-0">
                      {/* edit button */}
                      <Button
                        variant="ghost" size="sm" className="h-7 w-7 p-0"
                        title="Editar nome / descrição"
                        onClick={() => { setEditingId(att.id); setEditFileName(att.fileName); setEditDescription(att.description ?? ""); }}
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      {/* download */}
                      <a
                        href={`/api/storage${att.objectPath}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        download={att.fileName}
                        className="inline-flex items-center justify-center h-7 w-7 rounded-md hover:bg-muted transition-colors"
                        title="Baixar"
                        onClick={e => {
                          if (token) {
                            e.preventDefault();
                            fetch(`/api/storage${att.objectPath}`, { headers: { Authorization: `Bearer ${token}` } })
                              .then(r => r.blob())
                              .then(blob => {
                                const url = URL.createObjectURL(blob);
                                const a = document.createElement("a");
                                a.href = url; a.download = att.fileName; a.click();
                                URL.revokeObjectURL(url);
                              });
                          }
                        }}
                      >
                        <Download className="h-3.5 w-3.5" />
                      </a>
                      {/* delete */}
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button variant="outline" size="sm" className="h-7 px-2 text-destructive border-destructive/30 hover:bg-destructive/10 hover:border-destructive gap-1">
                            <Trash2 className="h-3.5 w-3.5" />
                            <span className="text-xs">Excluir</span>
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Excluir documento?</AlertDialogTitle>
                            <AlertDialogDescription>
                              O arquivo <strong>{att.fileName}</strong> será removido permanentemente do protocolo.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Cancelar</AlertDialogCancel>
                            <AlertDialogAction
                              className="bg-destructive text-white hover:bg-destructive/90"
                              onClick={() => deleteAttachment.mutate({ id: protocolId, attachmentId: att.id })}
                            >
                              Excluir
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </div>
                  </div>
                )}
                {/* ── inline edit row ── */}
                {editingId === att.id && (
                  <div className="flex flex-col gap-2 p-3">
                    <div className="flex items-center gap-2">
                      <div className="flex-shrink-0">{fileIcon(att.fileType)}</div>
                      <div className="flex-1 flex gap-2">
                        <div className="flex-1">
                          <p className="text-[10px] text-muted-foreground mb-0.5">Nome do arquivo</p>
                          <Input
                            value={editFileName}
                            onChange={e => setEditFileName(e.target.value)}
                            className="h-7 text-sm"
                            autoFocus
                            onKeyDown={e => {
                              if (e.key === "Enter") updateAttachment.mutate({ id: protocolId, attachmentId: att.id, data: { fileName: editFileName.trim() || att.fileName, description: editDescription || undefined } });
                              if (e.key === "Escape") setEditingId(null);
                            }}
                          />
                        </div>
                        <div className="flex-1">
                          <p className="text-[10px] text-muted-foreground mb-0.5">Descrição (opcional)</p>
                          <Input
                            value={editDescription}
                            onChange={e => setEditDescription(e.target.value)}
                            placeholder="ex: Laudo de análise"
                            className="h-7 text-sm"
                            onKeyDown={e => {
                              if (e.key === "Enter") updateAttachment.mutate({ id: protocolId, attachmentId: att.id, data: { fileName: editFileName.trim() || att.fileName, description: editDescription || undefined } });
                              if (e.key === "Escape") setEditingId(null);
                            }}
                          />
                        </div>
                      </div>
                      <div className="flex gap-1 flex-shrink-0 self-end">
                        <Button size="sm" className="h-7 px-3 text-xs" disabled={updateAttachment.isPending}
                          onClick={() => updateAttachment.mutate({ id: protocolId, attachmentId: att.id, data: { fileName: editFileName.trim() || att.fileName, description: editDescription || undefined } })}>
                          {updateAttachment.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : "Salvar"}
                        </Button>
                        <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={() => setEditingId(null)}>
                          <X className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

const TIPO_LABELS_REF: Record<string, string> = {
  geral: "Geral",
  ativo: "Referência do Ativo",
  analitica: "Metodologia Analítica",
  regulatoria: "Regulatória",
  embalagem: "Embalagem",
  degradacao: "Degradação",
  artigo: "Artigo", livro: "Livro", site: "Site/URL",
  regulamentacao: "Regulamentação", norma: "Norma Técnica", outro: "Outro",
};

const TIPO_COLORS_REF: Record<string, { bg: string; text: string; dot: string }> = {
  geral:       { bg: "bg-green-100",  text: "text-green-800",  dot: "🟢" },
  ativo:       { bg: "bg-blue-100",   text: "text-blue-800",   dot: "🔵" },
  analitica:   { bg: "bg-purple-100", text: "text-purple-800", dot: "🟣" },
  regulatoria: { bg: "bg-orange-100", text: "text-orange-800", dot: "🟠" },
  embalagem:   { bg: "bg-yellow-100", text: "text-yellow-800", dot: "🟡" },
  degradacao:  { bg: "bg-red-100",    text: "text-red-800",    dot: "🔴" },
};

const TIPO_ORDER_REF = ["geral", "ativo", "analitica", "regulatoria", "embalagem", "degradacao"] as const;
const TIPO_LEGACY = ["artigo", "livro", "site", "regulamentacao", "norma", "outro"];

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

const EMPTY_NEW_REF: BibliographicReferenceInput = {
  titulo: "", autores: "", ano: undefined, fonte: "",
  tipoReferencia: "geral", ativoRelacionado: "", descricao: "", doi: "",
  volume: "", numero: "", paginas: "",
};

function RefSelectRow({ ref, selectedIds, toggleSelect }: {
  ref: BibliographicReference;
  selectedIds: Set<number>;
  toggleSelect: (id: number) => void;
}) {
  return (
    <label
      className={`flex items-start gap-3 w-full p-3 rounded-lg cursor-pointer transition-colors ${selectedIds.has(ref.id) ? "bg-primary/8 border border-primary/30" : "hover:bg-muted/60"}`}
    >
      <input
        type="checkbox"
        className="mt-0.5 h-4 w-4 accent-primary flex-shrink-0"
        checked={selectedIds.has(ref.id)}
        onChange={() => toggleSelect(ref.id)}
      />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium leading-snug">{ref.titulo}</p>
        {ref.autores && <p className="text-xs text-muted-foreground">{ref.autores}</p>}
        {ref.ano && <p className="text-xs text-muted-foreground">{ref.ano}</p>}
        {ref.autoInclude && (
          <span className="text-xs px-1.5 py-0.5 rounded bg-green-100 text-green-700 font-medium">auto-incluída</span>
        )}
      </div>
    </label>
  );
}

function ReferencesTab({ protocolId }: { protocolId: number }) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [selectorOpen, setSelectorOpen] = useState(false);
  const [search, setSearch] = useState("");
  // "select" = browsing existing refs | "create" = new-ref form
  const [mode, setMode] = useState<"select" | "create">("select");
  const [newRef, setNewRef] = useState<BibliographicReferenceInput>(EMPTY_NEW_REF);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  // Aviso de possível duplicata: guarda a referência encontrada e como foi detectada
  const [dupWarn, setDupWarn] = useState<{
    existing: BibliographicReference;
    byDoi: boolean;
    byAutores: boolean;
    inProtocol: boolean;
  } | null>(null);

  const { data: protocolRefs = [], isLoading } = useListProtocolBibliographicReferences(protocolId);
  const { data: allRefs = [] } = useListBibliographicReferences();

  const addRef = useAddProtocolBibliographicReference({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListProtocolBibliographicReferencesQueryKey(protocolId) });
        toast({ title: "Referência adicionada ao protocolo" });
      },
      onError: () => toast({ title: "Erro ao adicionar referência", variant: "destructive" }),
    },
  });

  const removeRef = useRemoveProtocolBibliographicReference({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListProtocolBibliographicReferencesQueryKey(protocolId) });
        toast({ title: "Referência removida do protocolo" });
      },
      onError: () => toast({ title: "Erro ao remover referência", variant: "destructive" }),
    },
  });

  const createRef = useCreateBibliographicReference({
    mutation: {
      onSuccess: (created) => {
        queryClient.invalidateQueries({ queryKey: getListBibliographicReferencesQueryKey() });
        addRef.mutate({ id: protocolId, data: { referenceId: created.id } });
        toast({ title: "Referência cadastrada e adicionada ao protocolo" });
        setDupWarn(null);
        closeDialog();
      },
      onError: (err) => toast({ title: "Erro ao cadastrar referência", description: (err as Error).message, variant: "destructive" }),
    },
  });

  // Verifica duplicata por DOI ou Autores antes de salvar.
  // Se encontrar, exibe aviso; o usuário pode confirmar para cadastrar mesmo assim.
  function handleTrySave() {
    if (!newRef.titulo.trim() || createRef.isPending) return;
    setDupWarn(null);

    const doiNorm = (newRef.doi ?? "").trim().toLowerCase();
    const autoresNorm = (newRef.autores ?? "").trim().toLowerCase();
    const hasDoi = doiNorm.length > 0;
    const hasAutores = autoresNorm.length > 0;

    if (!hasDoi && !hasAutores) {
      createRef.mutate({ data: { ...newRef, titulo: newRef.titulo.trim() } });
      return;
    }

    const protocolRefIds = new Set(protocolRefs.map(r => r.id));
    // Checar primeiro no protocolo atual, depois no banco global
    const toCheck: BibliographicReference[] = [
      ...protocolRefs,
      ...allRefs.filter(r => !protocolRefIds.has(r.id)),
    ];

    for (const r of toCheck) {
      const rDoi = (r.doi ?? "").trim().toLowerCase();
      const rAutores = (r.autores ?? "").trim().toLowerCase();
      const byDoi = hasDoi && rDoi.length > 0 && doiNorm === rDoi;
      const byAutores = hasAutores && rAutores.length > 0 && autoresNorm === rAutores;
      if (byDoi || byAutores) {
        setDupWarn({ existing: r, byDoi, byAutores, inProtocol: protocolRefIds.has(r.id) });
        return;
      }
    }

    createRef.mutate({ data: { ...newRef, titulo: newRef.titulo.trim() } });
  }

  const bulkAddRefs = useBulkAddProtocolBibliographicReferences({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListProtocolBibliographicReferencesQueryKey(protocolId) });
        toast({ title: `Referências adicionadas ao protocolo` });
        closeDialog();
      },
      onError: () => toast({ title: "Erro ao adicionar referências", variant: "destructive" }),
    },
  });

  const reorderRefs = useReorderProtocolBibliographicReferences({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListProtocolBibliographicReferencesQueryKey(protocolId) });
      },
    },
  });

  function openDialog(startInCreate = false) {
    setSearch("");
    setNewRef(EMPTY_NEW_REF);
    setSelectedIds(new Set());
    setMode(startInCreate ? "create" : "select");
    setSelectorOpen(true);
  }

  function closeDialog() {
    setSelectorOpen(false);
    setMode("select");
    setSearch("");
    setNewRef(EMPTY_NEW_REF);
    setSelectedIds(new Set());
  }

  function toggleSelect(id: number) {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  function moveRef(idx: number, dir: -1 | 1) {
    const newOrder = [...protocolRefs];
    const target = idx + dir;
    if (target < 0 || target >= newOrder.length) return;
    [newOrder[idx], newOrder[target]] = [newOrder[target]!, newOrder[idx]!];
    reorderRefs.mutate({ id: protocolId, data: { orderedIds: newOrder.map(r => r.id) } });
  }

  const linkedIds = new Set(protocolRefs.map(r => r.id));
  const available = allRefs.filter(r =>
    !linkedIds.has(r.id) &&
    (search === "" || r.titulo.toLowerCase().includes(search.toLowerCase()) || (r.autores ?? "").toLowerCase().includes(search.toLowerCase()))
  );

  const noResults = available.length === 0;

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <BookOpen className="h-4 w-4 text-primary" />
            <CardTitle className="text-base">Referências Bibliográficas</CardTitle>
            <span className="text-xs text-muted-foreground">(ABNT NBR 6023)</span>
          </div>
          <div className="flex items-center gap-2">
            <Button size="sm" variant="outline" onClick={() => openDialog(true)}>
              <Plus className="h-3.5 w-3.5 mr-1" /> Nova Referência
            </Button>
            <Button size="sm" variant="outline" onClick={() => openDialog(false)}>
              <BookOpen className="h-3.5 w-3.5 mr-1" /> Selecionar do Banco
            </Button>
          </div>
        </div>
        <p className="text-xs text-muted-foreground mt-1">
          Adicione uma nova referência diretamente aqui ou selecione do banco de cadastros já existente.
        </p>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : protocolRefs.length === 0 ? (
          <div className="text-center py-10 text-muted-foreground text-sm">
            <BookOpen className="h-8 w-8 mx-auto mb-2 opacity-30" />
            <p>Nenhuma referência associada a este protocolo.</p>
            <div className="flex items-center justify-center gap-2 mt-3">
              <Button size="sm" variant="outline" onClick={() => openDialog(false)}>
                <BookOpen className="h-3.5 w-3.5 mr-1" /> Selecionar do banco
              </Button>
              <Button size="sm" variant="outline" onClick={() => openDialog(true)}>
                <Plus className="h-3.5 w-3.5 mr-1" /> Cadastrar nova
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            {protocolRefs.map((ref, idx) => (
              <div key={ref.id} className="flex items-start gap-3 p-3 rounded-lg border bg-muted/20 hover:bg-muted/40 transition-colors group">
                {/* Reorder buttons */}
                <div className="flex flex-col gap-0.5 flex-shrink-0 mt-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button
                    className="h-5 w-5 flex items-center justify-center rounded hover:bg-muted text-muted-foreground hover:text-foreground disabled:opacity-30"
                    onClick={() => moveRef(idx, -1)}
                    disabled={idx === 0}
                    title="Mover para cima"
                  >▲</button>
                  <button
                    className="h-5 w-5 flex items-center justify-center rounded hover:bg-muted text-muted-foreground hover:text-foreground disabled:opacity-30"
                    onClick={() => moveRef(idx, 1)}
                    disabled={idx === protocolRefs.length - 1}
                    title="Mover para baixo"
                  >▼</button>
                </div>
                <span className="text-sm font-bold text-muted-foreground w-6 mt-0.5 flex-shrink-0">{idx + 1}.</span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap mb-1">
                    {(() => {
                      const c = TIPO_COLORS_REF[ref.tipoReferencia];
                      return c ? (
                        <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${c.bg} ${c.text}`}>
                          {c.dot} {TIPO_LABELS_REF[ref.tipoReferencia]}
                          {ref.tipoReferencia === "ativo" && ref.ativoRelacionado ? ` — ${ref.ativoRelacionado}` : ""}
                        </span>
                      ) : (
                        <span className="text-xs px-1.5 py-0.5 rounded bg-primary/10 text-primary font-medium">
                          {TIPO_LABELS_REF[ref.tipoReferencia] ?? ref.tipoReferencia}
                        </span>
                      );
                    })()}
                    {ref.autoInclude && (
                      <span className="text-xs px-1.5 py-0.5 rounded bg-green-100 text-green-700 font-medium">auto-incluída</span>
                    )}
                    {ref.ano && <span className="text-xs text-muted-foreground">{ref.ano}</span>}
                  </div>
                  <p className="text-sm font-semibold leading-snug">{ref.titulo}</p>
                  {ref.autores && <p className="text-xs text-muted-foreground mt-0.5">{ref.autores}</p>}
                  <p className="text-xs text-slate-600 mt-1 leading-relaxed">{formatAbntRef(ref)}</p>
                  {ref.descricao && (
                    <p className="text-xs text-muted-foreground mt-1.5 border-l-2 border-primary/30 pl-2 italic">{ref.descricao}</p>
                  )}
                  {ref.doi && (
                    <a href={ref.doi} target="_blank" rel="noopener noreferrer" className="text-xs text-primary underline mt-1 inline-flex items-center gap-0.5">
                      <ExternalLink className="h-2.5 w-2.5" />
                      {ref.doi.length > 60 ? ref.doi.slice(0, 60) + "…" : ref.doi}
                    </a>
                  )}
                </div>
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 w-7 p-0 text-destructive hover:text-destructive hover:bg-destructive/10 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0 mt-0.5"
                      title="Remover do protocolo"
                    >
                      <X className="h-3.5 w-3.5" />
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Remover referência?</AlertDialogTitle>
                      <AlertDialogDescription>
                        Esta referência será removida deste protocolo (continuará no banco de cadastros).
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancelar</AlertDialogCancel>
                      <AlertDialogAction
                        className="bg-destructive text-white hover:bg-destructive/90"
                        onClick={() => removeRef.mutate({ id: protocolId, refId: ref.id })}
                      >
                        Remover
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </div>
            ))}
          </div>
        )}
      </CardContent>

      {/* ── Dialog ── */}
      {selectorOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={closeDialog}>
          <div
            className="bg-background rounded-xl shadow-2xl w-full max-w-lg max-h-[90vh] flex flex-col mx-4"
            onClick={e => e.stopPropagation()}
          >
            {/* Header with mode toggle */}
            <div className="flex items-center justify-between p-4 border-b gap-3">
              <div className="flex gap-1 bg-muted rounded-lg p-1">
                <button
                  className={`text-xs px-3 py-1.5 rounded-md font-medium transition-colors ${mode === "select" ? "bg-background shadow text-foreground" : "text-muted-foreground hover:text-foreground"}`}
                  onClick={() => setMode("select")}
                >
                  <BookOpen className="h-3 w-3 inline mr-1" />Selecionar do banco
                </button>
                <button
                  className={`text-xs px-3 py-1.5 rounded-md font-medium transition-colors ${mode === "create" ? "bg-background shadow text-foreground" : "text-muted-foreground hover:text-foreground"}`}
                  onClick={() => { setMode("create"); setNewRef(EMPTY_NEW_REF); }}
                >
                  <Plus className="h-3 w-3 inline mr-1" />Cadastrar nova
                </button>
              </div>
              <Button size="sm" variant="ghost" className="h-7 w-7 p-0 shrink-0" onClick={closeDialog}>
                <X className="h-3.5 w-3.5" />
              </Button>
            </div>

            {/* ── SELECT MODE ── */}
            {mode === "select" && (
              <>
                <div className="p-3 border-b">
                  <Input
                    autoFocus
                    placeholder="Buscar por título ou autor..."
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                    className="h-8 text-sm"
                  />
                </div>
                <div className="flex-1 overflow-y-auto p-2 space-y-2">
                  {(() => {
                    if (available.length === 0) return null;
                    const byTipo: Record<string, BibliographicReference[]> = {};
                    for (const r of available) {
                      const t = r.tipoReferencia;
                      if (!byTipo[t]) byTipo[t] = [];
                      byTipo[t]!.push(r);
                    }
                    const orderedTipos = [
                      ...TIPO_ORDER_REF.filter(t => byTipo[t]),
                      ...Object.keys(byTipo).filter(t => !TIPO_ORDER_REF.includes(t as never)),
                    ];
                    return orderedTipos.map(tipo => {
                      const refs = byTipo[tipo]!;
                      const c = TIPO_COLORS_REF[tipo];
                      const label = TIPO_LABELS_REF[tipo] ?? tipo;
                      if (tipo === "ativo") {
                        const byAtivo: Record<string, BibliographicReference[]> = {};
                        for (const r of refs) {
                          const k = r.ativoRelacionado?.trim() || "";
                          if (!byAtivo[k]) byAtivo[k] = [];
                          byAtivo[k]!.push(r);
                        }
                        const ativoKeys = Object.keys(byAtivo).sort((a, b) => a.localeCompare(b));
                        return (
                          <div key={tipo}>
                            <p className={`text-xs font-semibold px-2 py-1 rounded mb-1 ${c?.bg ?? "bg-muted"} ${c?.text ?? "text-foreground"}`}>
                              {c?.dot} {label}
                            </p>
                            {ativoKeys.map(ativo => (
                              <div key={ativo} className="mb-1">
                                {ativo && (
                                  <p className="text-xs text-muted-foreground font-medium px-2 mt-1 mb-0.5">— {ativo} ({byAtivo[ativo]!.length})</p>
                                )}
                                {byAtivo[ativo]!.map(ref => (
                                  <RefSelectRow key={ref.id} ref={ref} selectedIds={selectedIds} toggleSelect={toggleSelect} />
                                ))}
                              </div>
                            ))}
                          </div>
                        );
                      }
                      return (
                        <div key={tipo}>
                          <p className={`text-xs font-semibold px-2 py-1 rounded mb-1 ${c?.bg ?? "bg-muted"} ${c?.text ?? "text-foreground"}`}>
                            {c?.dot ?? ""} {label} ({refs.length})
                          </p>
                          {refs.map(ref => (
                            <RefSelectRow key={ref.id} ref={ref} selectedIds={selectedIds} toggleSelect={toggleSelect} />
                          ))}
                        </div>
                      );
                    });
                  })()}

                  {/* Empty state — prompt to create */}
                  {noResults && (
                    <div className="text-center py-6 space-y-3">
                      <p className="text-sm text-muted-foreground">
                        {allRefs.length === 0
                          ? "Nenhuma referência cadastrada ainda."
                          : search
                            ? `Nenhum resultado para "${search}".`
                            : "Todas as referências do banco já estão neste protocolo."}
                      </p>
                      <Button size="sm" variant="outline" onClick={() => { setMode("create"); setNewRef(r => ({ ...r, titulo: search })); }}>
                        <Plus className="h-3.5 w-3.5 mr-1" />
                        Cadastrar "{search || "nova referência"}"
                      </Button>
                    </div>
                  )}
                </div>
                {/* Sticky footer with bulk-add button */}
                <div className="p-3 border-t bg-background flex items-center justify-between gap-2">
                  <span className="text-xs text-muted-foreground">
                    {selectedIds.size > 0 ? `${selectedIds.size} selecionada(s)` : "Marque uma ou mais referências"}
                  </span>
                  <div className="flex gap-2">
                    <Button size="sm" variant="ghost" onClick={closeDialog}>Cancelar</Button>
                    <Button
                      size="sm"
                      disabled={selectedIds.size === 0 || bulkAddRefs.isPending}
                      onClick={() => bulkAddRefs.mutate({ id: protocolId, data: { referenceIds: Array.from(selectedIds) } })}
                    >
                      {bulkAddRefs.isPending ? "Adicionando..." : `Adicionar ${selectedIds.size > 0 ? selectedIds.size : ""} selecionada(s)`}
                    </Button>
                  </div>
                </div>
              </>
            )}

            {/* ── CREATE MODE ── */}
            {mode === "create" && (
              <div className="flex-1 overflow-y-auto p-4 space-y-3">
                <p className="text-xs text-muted-foreground">
                  A referência será salva no banco de cadastros e automaticamente associada a este protocolo.
                </p>

                {/* Tipo */}
                <div>
                  <label className="text-xs font-medium text-muted-foreground block mb-1">Tipo *</label>
                  <select
                    value={newRef.tipoReferencia ?? "geral"}
                    onChange={e => setNewRef(r => ({ ...r, tipoReferencia: e.target.value, ativoRelacionado: "" }))}
                    className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
                  >
                    {TIPO_ORDER_REF.map(v => (
                      <option key={v} value={v}>{TIPO_COLORS_REF[v]?.dot} {TIPO_LABELS_REF[v]}</option>
                    ))}
                  </select>
                </div>

                {/* Ativo relacionado (apenas para tipo = ativo) */}
                {newRef.tipoReferencia === "ativo" && (
                  <div>
                    <label className="text-xs font-medium text-muted-foreground block mb-1">Ativo relacionado</label>
                    <Input
                      placeholder="Ex: Taurina, Cafeína, Vitamina D..."
                      value={newRef.ativoRelacionado ?? ""}
                      onChange={e => setNewRef(r => ({ ...r, ativoRelacionado: e.target.value }))}
                      className="h-8 text-sm"
                    />
                  </div>
                )}

                {/* Título */}
                <div>
                  <label className="text-xs font-medium text-muted-foreground block mb-1">Título *</label>
                  <Input
                    autoFocus
                    placeholder="Ex: Farmacopeia Brasileira, 6ª Edição"
                    value={newRef.titulo}
                    onChange={e => setNewRef(r => ({ ...r, titulo: e.target.value }))}
                    className="h-8 text-sm"
                  />
                </div>

                {/* Autores */}
                <div>
                  <label className="text-xs font-medium text-muted-foreground block mb-1">Autores / Órgão emissor</label>
                  <Input
                    placeholder="Ex: ANVISA; Ministério da Saúde"
                    value={newRef.autores ?? ""}
                    onChange={e => setNewRef(r => ({ ...r, autores: e.target.value }))}
                    className="h-8 text-sm"
                  />
                </div>

                {/* Ano + Fonte na mesma linha */}
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-xs font-medium text-muted-foreground block mb-1">Ano</label>
                    <Input
                      type="number"
                      placeholder="Ex: 2019"
                      value={newRef.ano ?? ""}
                      onChange={e => setNewRef(r => ({ ...r, ano: e.target.value ? Number(e.target.value) : undefined }))}
                      className="h-8 text-sm"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-medium text-muted-foreground block mb-1">Fonte / Periódico</label>
                    <Input
                      placeholder="Ex: Diário Oficial"
                      value={newRef.fonte ?? ""}
                      onChange={e => setNewRef(r => ({ ...r, fonte: e.target.value }))}
                      className="h-8 text-sm"
                    />
                  </div>
                </div>

                {/* DOI / URL */}
                <div>
                  <label className="text-xs font-medium text-muted-foreground block mb-1">DOI / URL</label>
                  <Input
                    placeholder="https://... ou 10.xxxx/..."
                    value={newRef.doi ?? ""}
                    onChange={e => setNewRef(r => ({ ...r, doi: e.target.value }))}
                    className="h-8 text-sm"
                  />
                </div>

                {/* Descrição */}
                <div>
                  <label className="text-xs font-medium text-muted-foreground block mb-1">Descrição / Observação</label>
                  <textarea
                    rows={2}
                    placeholder="Contexto de uso, capítulo relevante, etc."
                    value={newRef.descricao ?? ""}
                    onChange={e => setNewRef(r => ({ ...r, descricao: e.target.value }))}
                    className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary resize-none"
                  />
                </div>

                {/* Auto-incluir */}
                <label className="flex items-center gap-2 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    className="h-4 w-4 accent-primary"
                    checked={newRef.autoInclude ?? false}
                    onChange={e => { setNewRef(r => ({ ...r, autoInclude: e.target.checked })); setDupWarn(null); }}
                  />
                  <span className="text-xs font-medium text-foreground">Auto-incluir em protocolos novos</span>
                  <span className="text-xs text-muted-foreground">(ex: referências ANVISA obrigatórias)</span>
                </label>

                {/* ── Aviso de duplicata ── */}
                {dupWarn && (
                  <div className="rounded-md border border-amber-300 bg-amber-50 p-3 space-y-2">
                    <div className="flex items-start gap-2">
                      <span className="text-amber-600 text-base leading-none mt-0.5">⚠</span>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-semibold text-amber-800">
                          {dupWarn.inProtocol
                            ? "Referência já adicionada a este protocolo"
                            : "Referência similar já existe no banco"}
                          {dupWarn.byDoi && dupWarn.byAutores
                            ? " (mesmo DOI e mesmos autores)"
                            : dupWarn.byDoi
                            ? " (mesmo DOI)"
                            : " (mesmos autores)"}
                        </p>
                        <p className="text-xs text-amber-900 font-medium mt-1 truncate" title={dupWarn.existing.titulo}>
                          {dupWarn.existing.titulo}
                        </p>
                        {dupWarn.existing.autores && (
                          <p className="text-[11px] text-amber-700 truncate">{dupWarn.existing.autores}</p>
                        )}
                        {dupWarn.existing.doi && (
                          <p className="text-[11px] text-amber-600 font-mono truncate">{dupWarn.existing.doi}</p>
                        )}
                      </div>
                    </div>
                    <p className="text-xs text-amber-800">Deseja cadastrar mesmo assim e permitir a duplicata?</p>
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 text-xs border-amber-400 text-amber-800 hover:bg-amber-100"
                        onClick={() => setDupWarn(null)}
                      >
                        Cancelar
                      </Button>
                      <Button
                        size="sm"
                        className="h-7 text-xs bg-amber-600 hover:bg-amber-700 text-white"
                        disabled={createRef.isPending}
                        onClick={() => createRef.mutate({ data: { ...newRef, titulo: newRef.titulo.trim() } })}
                      >
                        {createRef.isPending ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : null}
                        Cadastrar mesmo assim
                      </Button>
                    </div>
                  </div>
                )}

                {/* Actions */}
                {!dupWarn && (
                  <div className="flex justify-end gap-2 pt-1">
                    <Button size="sm" variant="outline" onClick={() => setMode("select")}>
                      Cancelar
                    </Button>
                    <Button
                      size="sm"
                      disabled={!newRef.titulo.trim() || createRef.isPending}
                      onClick={handleTrySave}
                    >
                      {createRef.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : <Plus className="h-3.5 w-3.5 mr-1" />}
                      Salvar e adicionar
                    </Button>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </Card>
  );
}

// ── AnvisaTab ─────────────────────────────────────────────────────────────────

type AnvisaNotification = {
  id: number;
  protocolId: number;
  companyName: string;
  companyCnpj: string | null;
  brandName: string | null;
  notifiedAt: string;
  confirmed: boolean;
  expedienteNumber: string | null;
  processNumber: string | null;
  transactionNumber: string | null;
  protocolNumber: string | null;
  attachmentObjectPath: string | null;
  attachmentFileName: string | null;
  attachmentFileType: string | null;
  rotuloObjectPath: string | null;
  rotuloFileName: string | null;
  rotuloFileType: string | null;
  padronizacaoObjectPath: string | null;
  padronizacaoFileName: string | null;
  padronizacaoFileType: string | null;
  docTextJson: string | null;
  notes: string | null;
  createdByName: string | null;
  createdAt: string;
  signedByName: string | null;
  signedByRole: string | null;
  signedAt: string | null;
};

type AnvisaProtocolInfo = {
  companyName: string;
  cnpj: string;
  productName: string;
  productType: string | null;
  activeIngredients: string | null;
  approvedBy: string | null;
  certNumber: string;
};

// ── Default doc text values ───────────────────────────────────────────────────
const DEFAULT_DOC_TEXT = {
  assunto: "Documento com a descrição das alterações realizadas",
  descricaoAlteracao: "A presente alteração refere-se à inclusão de nova empresa responsável pela comercialização do produto, previamente notificado junto à ANVISA.\n\nNão houve qualquer modificação em:\nFormulação qualitativa e quantitativa, Composição, Processo produtivo, Especificações técnicas, Métodos analíticos.\n\nO produto permanece tecnicamente idêntico ao originalmente notificado, sendo a alteração restrita exclusivamente à inclusão de empresa comercializadora adicional.",
  validacao: "Os estudos previamente realizados para o produto original permanecem válidos e aplicáveis, incluindo:\nEstudos de estabilidade, Ensaios de qualidade, Avaliações de segurança, Avaliações de desempenho.\n\nConsiderando que não houve alteração na formulação ou no processo produtivo, não há impacto nos resultados analíticos previamente obtidos, mantendo-se os critérios de aceitação estabelecidos.",
  justificativa: "A inclusão da empresa comercializadora visa ampliar a distribuição e alcance do produto no mercado, mantendo-se integralmente suas características técnicas e regulatórias.\n\nA presente alteração possui caráter exclusivamente administrativo/comercial, não impactando a qualidade, segurança ou eficácia do produto.",
};

function parseDocText(json: string | null) {
  try { return { ...DEFAULT_DOC_TEXT, ...(json ? JSON.parse(json) : {}) }; }
  catch { return { ...DEFAULT_DOC_TEXT }; }
}

function escHtml(s: string) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
          .replace(/\n\n/g, "</p><p>").replace(/\n/g, "<br/>");
}

function buildAnvisaDocHtml(
  n: AnvisaNotification,
  p: AnvisaProtocolInfo,
  imgs: { protocolo: string | null; rotulo: string | null; padronizacao: string | null },
  logoSrc?: string
) {
  const today = new Date().toLocaleDateString("pt-BR");
  const dt = parseDocText(n.docTextJson);

  const imgBlock = (src: string | null, label: string, mime: string | null, divId: string) => {
    if (!src) return "";
    if (mime && mime.startsWith("image/")) {
      return `<div style="margin:20px 0;page-break-inside:avoid">
  <p style="font-weight:bold;font-size:10pt;margin-bottom:8px;color:#1e3a5f;border-left:3px solid #1e3a5f;padding-left:8px">${label}</p>
  <img src="${src}" style="max-width:100%;border:1px solid #d1d5db;border-radius:4px;display:block;box-shadow:0 1px 4px rgba(0,0,0,.08)"/>
</div>`;
    }
    if (mime === "application/pdf") {
      return `<div style="margin:20px 0">
  <p style="font-weight:bold;font-size:10pt;margin-bottom:8px;color:#1e3a5f;border-left:3px solid #1e3a5f;padding-left:8px">${label}</p>
  <div id="${divId}" style="border:1px solid #d1d5db;border-radius:4px;background:#f9fafb;min-height:80px;padding:12px;text-align:center">
    <p style="color:#9ca3af;font-size:9pt">⏳ Renderizando páginas do PDF…</p>
  </div>
</div>`;
    }
    return `<p style="color:#9ca3af;font-size:9pt;font-style:italic;margin:8px 0">[${label}: Word/formato não pré-visualizável — abra o arquivo original]</p>`;
  };

  // Build PDF data for JS rendering (only PDFs need canvas rendering)
  const pdfEntries: string[] = [];
  if (imgs.protocolo && n.attachmentFileType === "application/pdf") pdfEntries.push(`"pdf-protocolo":"${imgs.protocolo}"`);
  if (imgs.rotulo && n.rotuloFileType === "application/pdf") pdfEntries.push(`"pdf-rotulo":"${imgs.rotulo}"`);
  if (imgs.padronizacao && n.padronizacaoFileType === "application/pdf") pdfEntries.push(`"pdf-padronizacao":"${imgs.padronizacao}"`);
  const pdfRenderScript = pdfEntries.length > 0 ? `<script>
(async function(){
  const P={${pdfEntries.join(",")}};
  const s=document.createElement('script');
  s.src='https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js';
  document.head.appendChild(s);
  await new Promise(r=>{s.onload=r;s.onerror=r});
  const lib=window['pdfjs-dist/build/pdf'];
  lib.GlobalWorkerOptions.workerSrc='https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
  for(const[id,url]of Object.entries(P)){
    const el=document.getElementById(id);
    if(!el)continue;
    el.innerHTML='';
    try{
      const pdfDoc=await lib.getDocument({data:atob(url.split(',')[1])}).promise;
      for(let pn=1;pn<=pdfDoc.numPages;pn++){
        const page=await pdfDoc.getPage(pn);
        const vp=page.getViewport({scale:1.5});
        const cv=document.createElement('canvas');
        cv.width=vp.width;cv.height=vp.height;
        cv.style.cssText='max-width:100%;width:100%;display:block;margin-bottom:3px;border-radius:2px';
        await page.render({canvasContext:cv.getContext('2d'),viewport:vp}).promise;
        el.appendChild(cv);
        if(pn<pdfDoc.numPages){const hr=document.createElement('div');hr.style.cssText='height:1px;background:#e5e7eb;margin:6px 0';el.appendChild(hr);}
      }
    }catch(e){el.innerHTML='<p style="color:#ef4444;font-size:9pt;padding:8px">Erro ao renderizar PDF — verifique se o arquivo não está protegido por senha.</p>';}
  }
})();
</script>` : "";

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8"/>
<title>Documento ANVISA — ${escHtml(n.companyName)}</title>
<link href="https://fonts.googleapis.com/css2?family=Dancing+Script:wght@600&display=swap" rel="stylesheet"/>
<style>
  *{box-sizing:border-box;margin:0;padding:0}
  body{font-family:Arial,sans-serif;font-size:11pt;color:#000;padding:2.5cm 3cm;line-height:1.6}
  h1{font-size:13pt;font-weight:bold;text-align:center;margin-bottom:24px;text-transform:uppercase;letter-spacing:.5px}
  .section{margin-bottom:20px}
  .section-title{font-size:11pt;font-weight:bold;margin-bottom:8px;border-bottom:1.5px solid #1e3a5f;padding-bottom:2px;color:#1e3a5f}
  p{margin-bottom:6px}
  .field-row{display:flex;gap:8px;margin-bottom:4px}
  .field-label{font-weight:bold;min-width:170px;flex-shrink:0}
  .sig-area{margin-top:40px;display:flex;justify-content:flex-end}
  .sig-box{text-align:center;min-width:240px}
  .sig-line{border-top:1.5px solid #1e3a5f;padding-top:8px}
  .sig-cursiva{font-family:'Dancing Script',cursive;font-size:20pt;font-weight:600;color:#111827;line-height:1.3}
  .sig-verified{color:#16a34a;font-size:8pt;margin:2px 0 8px}
  @media print{body{padding:1.5cm 2cm}button{display:none!important}}
</style>
</head>
<body>
<div style="display:flex;align-items:center;justify-content:space-between;border-bottom:2.5px solid #1e3a5f;padding-bottom:12px;margin-bottom:20px">
  ${logoSrc ? `<img src="${logoSrc}" alt="Alphafitus" style="height:80px;width:auto;object-fit:contain"/>` : `<div style="font-weight:900;font-size:13pt;color:#1e3a5f;letter-spacing:.5px">ALPHAFITUS</div>`}
  <div style="text-align:right;font-size:9.5pt;line-height:1.8;color:#374151">
    ${n.expedienteNumber ? `<div><strong>EXPEDIENTE Nº ${escHtml(n.expedienteNumber)}</strong></div>` : ""}
    ${n.processNumber ? `<div>Nº do Processo: ${escHtml(n.processNumber)}</div>` : ""}
    ${n.transactionNumber ? `<div>Nº de Transação: ${escHtml(n.transactionNumber)}</div>` : ""}
    ${n.protocolNumber ? `<div>Nº de Protocolo: ${escHtml(n.protocolNumber)}</div>` : ""}
    <div style="font-size:8.5pt;color:#9ca3af">Data: ${today}</div>
  </div>
</div>

${(p.certNumber || p.productName) ? `
<div style="background:#f0f4f8;border:1.5px solid #1e3a5f;border-radius:4px;padding:10px 16px;margin-bottom:20px;font-size:10pt">
  <div style="color:#888;font-size:9pt;margin-bottom:2px;text-transform:uppercase;letter-spacing:.5px">Referência do Protocolo</div>
  <div style="font-weight:bold;color:#1e3a5f;font-size:11pt">${escHtml((p.productType ? p.productType + " — " : "") + p.productName)}</div>
  ${p.certNumber ? `<div style="font-family:monospace;color:#1e3a5f;font-size:10.5pt;margin-top:3px">${escHtml(p.certNumber)}</div>` : ""}
</div>` : ""}

<h1>Documento com a Descrição das Alterações Realizadas</h1>

<div class="section">
  <p class="section-title">1. Assunto</p>
  <p>${escHtml(dt.assunto)}</p>
</div>

<div class="section">
  <p class="section-title">2. Identificação do Produto Original</p>
  <div class="field-row"><span class="field-label">Designação do Produto (Outros):</span><span>${escHtml(p.productType ?? "Suplemento Alimentar em Cápsula")}</span></div>
  <div class="field-row"><span class="field-label">Nome do Produto:</span><span>${escHtml(p.productName)}</span></div>
  ${p.activeIngredients ? `<div class="field-row"><span class="field-label">Ativos:</span><span>${escHtml(p.activeIngredients)}</span></div>` : ""}
</div>

<div class="section">
  <p class="section-title">3. Descrição da Alteração</p>
  <p>${escHtml(dt.descricaoAlteracao)}</p>
</div>

<div class="section">
  <p class="section-title">4. Identificação da Empresa Responsável pela Comercialização (Nova Inclusão)</p>
  <div class="field-row"><span class="field-label">Razão Social:</span><span>${escHtml(n.companyName)}</span></div>
  ${n.companyCnpj ? `<div class="field-row"><span class="field-label">CNPJ:</span><span>${escHtml(n.companyCnpj)}</span></div>` : ""}
</div>

<div class="section">
  <p class="section-title">5. Identificação Comercial do Produto</p>
  <div class="field-row"><span class="field-label">Marca / Produto:</span><span>${escHtml(n.brandName ?? n.companyName)}</span></div>
  <div class="field-row"><span class="field-label">Nome do Produto:</span><span>${escHtml(p.productName)}</span></div>
</div>

<div class="section">
  <p class="section-title">6. Validação Analítica e Estudos</p>
  <p>${escHtml(dt.validacao)}</p>
</div>

<div class="section">
  <p class="section-title">7. Justificativa Técnica</p>
  <p>${escHtml(dt.justificativa)}</p>
</div>

${(imgs.protocolo || imgs.rotulo || imgs.padronizacao) ? `
<div class="section">
  <p class="section-title">Anexos</p>
  ${imgBlock(imgs.protocolo, "Protocolo ANVISA", n.attachmentFileType, "pdf-protocolo")}
  ${imgBlock(imgs.rotulo, "Rótulo", n.rotuloFileType, "pdf-rotulo")}
  ${imgBlock(imgs.padronizacao, "Padronização", n.padronizacaoFileType, "pdf-padronizacao")}
</div>` : ""}

<div class="section">
  <p class="section-title">8. Assinatura e Liberação</p>
  <div class="sig-area">
    <div class="sig-box">
      ${n.signedByName ? `
      <p class="sig-cursiva">${escHtml(n.signedByName)}</p>
      <p class="sig-verified">✓ Assinado digitalmente — ${n.signedAt ? new Date(n.signedAt).toLocaleString("pt-BR",{day:"2-digit",month:"2-digit",year:"numeric",hour:"2-digit",minute:"2-digit"}) : today}</p>
      ` : `<div style="height:55px"></div>`}
      <div class="sig-line">
        <p><strong>${escHtml(n.signedByName ?? p.approvedBy ?? "Responsável Técnico")}</strong></p>
        <p>${escHtml(n.signedByRole ?? "Representante Legal")}</p>
        <p style="font-size:9pt;color:#6b7280;margin-top:4px">${escHtml(p.companyName)}</p>
      </div>
    </div>
  </div>
</div>

<div style="text-align:center;margin-top:36px">
  <button onclick="window.print()" style="padding:10px 28px;background:#1e3a5f;color:#fff;border:none;border-radius:4px;font-size:11pt;cursor:pointer">🖨️ Imprimir / Salvar como PDF</button>
</div>
${pdfRenderScript}
</body>
</html>`;
}

function AnvisaTab({ protocolId, protocolInfo }: { protocolId: number; protocolInfo: AnvisaProtocolInfo }) {
  const { token, user: currentUser, isAdmin } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [uploadingField, setUploadingField] = useState<"protocolo" | "rotulo" | "padronizacao" | null>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [generatingDocId, setGeneratingDocId] = useState<number | null>(null);
  const [sigDialogOpen, setSigDialogOpen] = useState(false);
  const [sigTargetId, setSigTargetId] = useState<number | null>(null);
  const [sigRole, setSigRole] = useState("Responsável Técnico");
  const [signing, setSigning] = useState(false);
  const [unsigningId, setUnsigningId] = useState<number | null>(null);
  // ── Banco de Empresas ────────────────────────────────────────────────────
  const [companyMgr, setCompanyMgr] = useState(false);
  const [editCompanyId, setEditCompanyId] = useState<number | null>(null);
  const [editCompanyName, setEditCompanyName] = useState("");
  const [editCompanyCnpj, setEditCompanyCnpj] = useState("");
  const [savingCompany, setSavingCompany] = useState(false);
  const [deletingCompanyId, setDeletingCompanyId] = useState<number | null>(null);
  // ── Banco de Números ANVISA ──────────────────────────────────────────────
  const [numberMgr, setNumberMgr] = useState(false);
  const [editNumberId, setEditNumberId] = useState<number | null>(null);
  const [editNumber, setEditNumber] = useState({ label: "", exp: "", proc: "", trans: "", prot: "" });
  const [savingNumber, setSavingNumber] = useState(false);
  const [deletingNumberId, setDeletingNumberId] = useState<number | null>(null);

  const protocoloInputRef = useRef<HTMLInputElement>(null);
  const rotuloInputRef = useRef<HTMLInputElement>(null);
  const padronizacaoInputRef = useRef<HTMLInputElement>(null);

  const emptyForm = {
    companyName: "", companyCnpj: "", brandName: "",
    notifiedAt: "", notes: "", confirmed: false,
    expedienteNumber: "", processNumber: "", transactionNumber: "", protocolNumber: "",
    attachmentObjectPath: null as string | null, attachmentFileName: null as string | null, attachmentFileType: null as string | null,
    rotuloObjectPath: null as string | null, rotuloFileName: null as string | null, rotuloFileType: null as string | null,
    padronizacaoObjectPath: null as string | null, padronizacaoFileName: null as string | null, padronizacaoFileType: null as string | null,
    docAssunto: DEFAULT_DOC_TEXT.assunto,
    docDescricao: DEFAULT_DOC_TEXT.descricaoAlteracao,
    docValidacao: DEFAULT_DOC_TEXT.validacao,
    docJustificativa: DEFAULT_DOC_TEXT.justificativa,
  };
  const [form, setForm] = useState(emptyForm);

  const { data: notifications = [], isLoading } = useQuery<AnvisaNotification[]>({
    queryKey: ["anvisa-notifications", protocolId],
    queryFn: async () => {
      const res = await fetch(`/api/protocols/${protocolId}/anvisa`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok) throw new Error("Erro ao carregar notificações ANVISA");
      return res.json();
    },
  });

  type CompanyRecord = { id: number; name: string; cnpj: string | null };
  type NumberRecord = { id: number; label: string | null; expedienteNumber: string | null; processNumber: string | null; transactionNumber: string | null; protocolNumber: string | null };

  const { data: savedCompanies = [] } = useQuery<CompanyRecord[]>({
    queryKey: ["companies"],
    queryFn: async () => {
      const res = await fetch("/api/companies", { headers: token ? { Authorization: `Bearer ${token}` } : {} });
      if (!res.ok) throw new Error();
      return res.json();
    },
  });

  const { data: savedNumbers = [] } = useQuery<NumberRecord[]>({
    queryKey: ["anvisa-number-bank", protocolId],
    queryFn: async () => {
      const res = await fetch(`/api/anvisa-number-bank?protocolId=${protocolId}`, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
      if (!res.ok) throw new Error();
      return res.json();
    },
  });

  function resetForm() { setForm(emptyForm); setShowForm(false); setEditingId(null); }

  function startEdit(n: AnvisaNotification) {
    const dt = parseDocText(n.docTextJson);
    const toLocal = (iso: string) => {
      try { return new Date(iso).toISOString().slice(0, 16); } catch { return ""; }
    };
    setForm({
      companyName: n.companyName,
      companyCnpj: n.companyCnpj ?? "",
      brandName: n.brandName ?? "",
      notifiedAt: toLocal(n.notifiedAt),
      notes: n.notes ?? "",
      confirmed: n.confirmed,
      expedienteNumber: n.expedienteNumber ?? "",
      processNumber: n.processNumber ?? "",
      transactionNumber: n.transactionNumber ?? "",
      protocolNumber: n.protocolNumber ?? "",
      attachmentObjectPath: n.attachmentObjectPath,
      attachmentFileName: n.attachmentFileName,
      attachmentFileType: n.attachmentFileType,
      rotuloObjectPath: n.rotuloObjectPath,
      rotuloFileName: n.rotuloFileName,
      rotuloFileType: n.rotuloFileType,
      padronizacaoObjectPath: n.padronizacaoObjectPath,
      padronizacaoFileName: n.padronizacaoFileName,
      padronizacaoFileType: n.padronizacaoFileType,
      docAssunto: dt.assunto,
      docDescricao: dt.descricaoAlteracao,
      docValidacao: dt.validacao,
      docJustificativa: dt.justificativa,
    });
    setEditingId(n.id);
    setShowForm(true);
  }

  async function fetchAsDataUrl(objectPath: string): Promise<string | null> {
    try {
      const hdrs: Record<string, string> = {};
      if (token) hdrs["Authorization"] = `Bearer ${token}`;
      const res = await fetch(`/api/storage/objects/${objectPath}`, { headers: hdrs });
      if (!res.ok) return null;
      const blob = await res.blob();
      return new Promise(resolve => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = () => resolve(null);
        reader.readAsDataURL(blob);
      });
    } catch { return null; }
  }

  async function handleGenerateDoc(n: AnvisaNotification) {
    const win = window.open("", "_blank");
    if (!win) { toast({ title: "Popup bloqueado — libere popups para este site", variant: "destructive" }); return; }
    win.document.write(`<!DOCTYPE html><html><head><meta charset="UTF-8"/><title>Carregando…</title></head><body style="font-family:Arial;display:flex;align-items:center;justify-content:center;height:100vh;font-size:14pt;color:#555">⏳ Carregando anexos e gerando documento…</body></html>`);
    setGeneratingDocId(n.id);
    try {
      const logoSrc = window.location.origin + "/logo-alphafitus.png";
      const [protocolo, rotulo, padronizacao] = await Promise.all([
        n.attachmentObjectPath ? fetchAsDataUrl(n.attachmentObjectPath) : Promise.resolve(null),
        n.rotuloObjectPath ? fetchAsDataUrl(n.rotuloObjectPath) : Promise.resolve(null),
        n.padronizacaoObjectPath ? fetchAsDataUrl(n.padronizacaoObjectPath) : Promise.resolve(null),
      ]);
      const html = buildAnvisaDocHtml(n, protocolInfo, { protocolo, rotulo, padronizacao }, logoSrc);
      win.document.open();
      win.document.write(html);
      win.document.close();
    } catch {
      win.close();
      toast({ title: "Erro ao gerar documento", variant: "destructive" });
    } finally {
      setGeneratingDocId(null);
    }
  }

  async function uploadFile(file: File, field: "protocolo" | "rotulo" | "padronizacao") {
    const allowed = ["application/pdf", "application/msword", "application/vnd.openxmlformats-officedocument.wordprocessingml.document", "image/png", "image/jpeg", "image/webp"];
    if (!allowed.includes(file.type)) {
      toast({ title: "Tipo não suportado", description: "Aceito: PDF, Word, imagens", variant: "destructive" }); return;
    }
    if (file.size > 20 * 1024 * 1024) {
      toast({ title: "Arquivo muito grande (máx 20 MB)", variant: "destructive" }); return;
    }
    setUploadingField(field);
    try {
      const urlRes = await fetch("/api/storage/uploads/request-url", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({ name: file.name, size: file.size, contentType: file.type }),
      });
      if (!urlRes.ok) throw new Error("Erro ao obter URL de upload");
      const { uploadURL, objectPath } = await urlRes.json() as { uploadURL: string; objectPath: string };
      const putRes = await fetch(uploadURL, { method: "PUT", body: file, headers: { "Content-Type": file.type } });
      if (!putRes.ok) throw new Error("Erro ao enviar arquivo");

      if (field === "protocolo") setForm(f => ({ ...f, attachmentObjectPath: objectPath, attachmentFileName: file.name, attachmentFileType: file.type }));
      if (field === "rotulo")    setForm(f => ({ ...f, rotuloObjectPath: objectPath, rotuloFileName: file.name, rotuloFileType: file.type }));
      if (field === "padronizacao") setForm(f => ({ ...f, padronizacaoObjectPath: objectPath, padronizacaoFileName: file.name, padronizacaoFileType: file.type }));

      const labels = { protocolo: "Protocolo ANVISA", rotulo: "Rótulo", padronizacao: "Padronização" };
      toast({ title: `${labels[field]} anexado com sucesso` });
    } catch (err) {
      toast({ title: err instanceof Error ? err.message : "Erro no upload", variant: "destructive" });
    } finally {
      setUploadingField(null);
    }
  }

  function makeFileHandler(field: "protocolo" | "rotulo" | "padronizacao") {
    return (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      e.target.value = "";
      if (file) uploadFile(file, field);
    };
  }

  async function handleSave() {
    if (!form.companyName.trim()) { toast({ title: "Informe o nome da empresa", variant: "destructive" }); return; }
    if (!form.notifiedAt) { toast({ title: "Informe a data/hora da notificação", variant: "destructive" }); return; }
    if (form.confirmed && !form.attachmentObjectPath) {
      toast({ title: "Anexe o protocolo gerado pela ANVISA antes de confirmar", variant: "destructive" }); return;
    }
    setSaving(true);
    const docTextJson = JSON.stringify({
      assunto: form.docAssunto,
      descricaoAlteracao: form.docDescricao,
      validacao: form.docValidacao,
      justificativa: form.docJustificativa,
    });
    const payload = {
      companyName: form.companyName.trim(),
      companyCnpj: form.companyCnpj.trim() || null,
      brandName: form.brandName.trim() || null,
      notifiedAt: form.notifiedAt,
      confirmed: form.confirmed,
      notes: form.notes.trim() || null,
      expedienteNumber: form.expedienteNumber.trim() || null,
      processNumber: form.processNumber.trim() || null,
      transactionNumber: form.transactionNumber.trim() || null,
      protocolNumber: form.protocolNumber.trim() || null,
      attachmentObjectPath: form.attachmentObjectPath, attachmentFileName: form.attachmentFileName, attachmentFileType: form.attachmentFileType,
      rotuloObjectPath: form.rotuloObjectPath, rotuloFileName: form.rotuloFileName, rotuloFileType: form.rotuloFileType,
      padronizacaoObjectPath: form.padronizacaoObjectPath, padronizacaoFileName: form.padronizacaoFileName, padronizacaoFileType: form.padronizacaoFileType,
      docTextJson,
    };
    try {
      const url = editingId !== null
        ? `/api/protocols/${protocolId}/anvisa/${editingId}`
        : `/api/protocols/${protocolId}/anvisa`;
      const method = editingId !== null ? "PUT" : "POST";
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error("Erro ao salvar");
      const saved: AnvisaNotification = await res.json();
      queryClient.invalidateQueries({ queryKey: ["anvisa-notifications", protocolId] });
      toast({ title: editingId !== null ? "Notificação atualizada" : "Notificação ANVISA registrada" });
      const wasNew = editingId === null;
      resetForm();
      if (wasNew) {
        setSigTargetId(saved.id);
        setSigRole("Responsável Técnico");
        setSigDialogOpen(true);
      }
    } catch {
      toast({ title: "Erro ao salvar notificação", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  }

  async function handleSign() {
    if (!sigTargetId) return;
    setSigning(true);
    try {
      const res = await fetch(`/api/protocols/${protocolId}/anvisa/${sigTargetId}/sign`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({ role: sigRole }),
      });
      if (!res.ok) throw new Error();
      queryClient.invalidateQueries({ queryKey: ["anvisa-notifications", protocolId] });
      toast({ title: "Notificação assinada com sucesso" });
      setSigDialogOpen(false);
      setSigTargetId(null);
    } catch {
      toast({ title: "Erro ao registrar assinatura", variant: "destructive" });
    } finally {
      setSigning(false);
    }
  }

  async function handleSaveCompanyToBank() {
    if (!form.companyName.trim()) { toast({ title: "Preencha a Razão Social antes de salvar", variant: "destructive" }); return; }
    setSavingCompany(true);
    try {
      await fetch("/api/companies", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({ name: form.companyName.trim(), cnpj: form.companyCnpj.trim() || null }),
      });
      queryClient.invalidateQueries({ queryKey: ["companies"] });
      toast({ title: "Empresa salva no banco" });
    } catch { toast({ title: "Erro ao salvar empresa", variant: "destructive" }); }
    finally { setSavingCompany(false); }
  }

  async function handleUpdateCompany() {
    if (!editCompanyId || !editCompanyName.trim()) return;
    setSavingCompany(true);
    try {
      await fetch(`/api/companies/${editCompanyId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({ name: editCompanyName.trim(), cnpj: editCompanyCnpj.trim() || null }),
      });
      queryClient.invalidateQueries({ queryKey: ["companies"] });
      setEditCompanyId(null);
      toast({ title: "Empresa atualizada" });
    } catch { toast({ title: "Erro ao atualizar empresa", variant: "destructive" }); }
    finally { setSavingCompany(false); }
  }

  async function handleDeleteCompany(id: number) {
    setDeletingCompanyId(id);
    try {
      await fetch(`/api/companies/${id}`, { method: "DELETE", headers: token ? { Authorization: `Bearer ${token}` } : {} });
      queryClient.invalidateQueries({ queryKey: ["companies"] });
      toast({ title: "Empresa removida" });
    } catch { toast({ title: "Erro ao remover empresa", variant: "destructive" }); }
    finally { setDeletingCompanyId(null); }
  }

  async function handleSaveNumbersToBank() {
    setSavingNumber(true);
    try {
      await fetch("/api/anvisa-number-bank", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({
          protocolId,
          label: form.expedienteNumber.trim() || form.processNumber.trim() || null,
          expedienteNumber: form.expedienteNumber.trim() || null,
          processNumber: form.processNumber.trim() || null,
          transactionNumber: form.transactionNumber.trim() || null,
          protocolNumber: form.protocolNumber.trim() || null,
        }),
      });
      queryClient.invalidateQueries({ queryKey: ["anvisa-number-bank", protocolId] });
      toast({ title: "Números salvos no banco" });
    } catch { toast({ title: "Erro ao salvar números", variant: "destructive" }); }
    finally { setSavingNumber(false); }
  }

  async function handleUpdateNumber() {
    if (!editNumberId) return;
    setSavingNumber(true);
    try {
      await fetch(`/api/anvisa-number-bank/${editNumberId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({ label: editNumber.label || null, expedienteNumber: editNumber.exp || null, processNumber: editNumber.proc || null, transactionNumber: editNumber.trans || null, protocolNumber: editNumber.prot || null }),
      });
      queryClient.invalidateQueries({ queryKey: ["anvisa-number-bank", protocolId] });
      setEditNumberId(null);
      setEditNumber({ label: "", exp: "", proc: "", trans: "", prot: "" });
      toast({ title: "Números atualizados" });
    } catch { toast({ title: "Erro ao atualizar", variant: "destructive" }); }
    finally { setSavingNumber(false); }
  }

  async function handleDeleteNumber(id: number) {
    setDeletingNumberId(id);
    try {
      await fetch(`/api/anvisa-number-bank/${id}`, { method: "DELETE", headers: token ? { Authorization: `Bearer ${token}` } : {} });
      queryClient.invalidateQueries({ queryKey: ["anvisa-number-bank", protocolId] });
      toast({ title: "Registro removido" });
    } catch { toast({ title: "Erro ao remover registro", variant: "destructive" }); }
    finally { setDeletingNumberId(null); }
  }

  async function handleUnsign(notifId: number) {
    setUnsigningId(notifId);
    try {
      await fetch(`/api/protocols/${protocolId}/anvisa/${notifId}/sign`, {
        method: "DELETE",
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      queryClient.invalidateQueries({ queryKey: ["anvisa-notifications", protocolId] });
      toast({ title: "Assinatura removida" });
    } catch {
      toast({ title: "Erro ao remover assinatura", variant: "destructive" });
    } finally {
      setUnsigningId(null);
    }
  }

  async function handleDelete(id: number) {
    setDeletingId(id);
    try {
      await fetch(`/api/protocols/${protocolId}/anvisa/${id}`, { method: "DELETE", headers: token ? { Authorization: `Bearer ${token}` } : {} });
      queryClient.invalidateQueries({ queryKey: ["anvisa-notifications", protocolId] });
      toast({ title: "Registro removido" });
    } catch { toast({ title: "Erro ao remover", variant: "destructive" }); }
    finally { setDeletingId(null); }
  }

  async function handleDownload(objectPath: string, fileName: string) {
    try {
      const res = await fetch(`/api/storage/objects/${objectPath}`, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
      if (!res.ok) throw new Error();
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a"); a.href = url; a.download = fileName; a.click();
      setTimeout(() => URL.revokeObjectURL(url), 5000);
    } catch { toast({ title: "Erro ao baixar arquivo", variant: "destructive" }); }
  }

  function fmtDateTime(iso: string) {
    try { return new Date(iso).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" }); } catch { return iso; }
  }

  const canSave = form.companyName.trim() && form.notifiedAt && (!form.confirmed || !!form.attachmentObjectPath);
  const uploading = uploadingField !== null;

  // ── Reusable inline attachment row ──
  function AttachRow({ label, required, fileName, onClear, onPick, field }: {
    label: string; required?: boolean;
    fileName: string | null;
    onClear: () => void; onPick: () => void;
    field: "protocolo" | "rotulo" | "padronizacao";
  }) {
    const busy = uploadingField === field;
    return (
      <div className="flex items-center gap-2">
        <span className="text-xs text-slate-600 w-32 shrink-0">{label}{required ? " *" : " (opcional)"}</span>
        {fileName ? (
          <div className="flex flex-1 items-center gap-2 text-xs bg-white rounded px-2 py-1.5 border border-green-300 min-w-0">
            <FileText className="h-3.5 w-3.5 text-green-600 shrink-0" />
            <span className="text-green-700 font-medium truncate">{fileName}</span>
            <button className="ml-auto text-slate-400 hover:text-red-500" onClick={onClear}><X className="h-3.5 w-3.5" /></button>
          </div>
        ) : (
          <Button size="sm" variant="outline" disabled={busy || uploading} onClick={onPick} className="h-7 text-xs">
            {busy ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <Upload className="h-3 w-3 mr-1" />}
            {busy ? "Enviando…" : "Anexar"}
          </Button>
        )}
      </div>
    );
  }

  return (
    <>
    {/* ── Signature Dialog ─────────────────────────────────────────────────── */}
    {sigDialogOpen && (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => { if (!signing) setSigDialogOpen(false); }}>
        <div className="bg-white rounded-xl shadow-2xl w-[420px] max-w-[95vw] max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
          <div className="flex items-center justify-between px-6 pt-5 pb-4 border-b border-gray-100">
            <h3 className="font-bold text-base flex items-center gap-2 text-gray-900">
              <PenLine className="h-4 w-4 text-primary" /> Assinar Digitalmente
            </h3>
            <button type="button" onClick={() => setSigDialogOpen(false)} disabled={signing}
              className="text-gray-400 hover:text-gray-700 rounded-full hover:bg-gray-100 w-7 h-7 flex items-center justify-center transition-colors">
              <span className="text-xl leading-none">×</span>
            </button>
          </div>
          <div className="px-6 py-4 space-y-4">
            <p className="text-xs text-gray-500">Confirme para registrar sua assinatura eletrônica nesta notificação ANVISA.</p>
            {/* User card */}
            <div className="border border-gray-200 rounded-lg p-3 flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-primary flex items-center justify-center text-white font-bold text-sm flex-shrink-0">
                {(currentUser?.displayName ?? "?").split(" ").filter(Boolean).slice(0,2).map(n => n[0]?.toUpperCase()).join("")}
              </div>
              <div className="min-w-0">
                <p className="font-semibold text-sm text-gray-900 truncate">{currentUser?.displayName}</p>
                <p className="text-xs text-gray-400 capitalize">{currentUser?.role === "admin" ? "Admin" : "Analista"}</p>
                <p className="text-[10px] text-emerald-600 flex items-center gap-1 mt-0.5"><ShieldCheck className="h-3 w-3" /> Usuário verificado</p>
              </div>
            </div>
            {/* Preview */}
            <div className="border border-gray-200 rounded-lg p-3 bg-gray-50/50">
              <p className="text-[9px] font-semibold uppercase tracking-widest text-gray-400 mb-1 text-center">Prévia da assinatura</p>
              <p style={{ fontFamily: "'Dancing Script', cursive", fontSize: "1.4rem", lineHeight: 1.4, color: "#111827", fontWeight: 600, textAlign: "center" }}>
                {currentUser?.displayName}
              </p>
            </div>
            {/* Role */}
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1.5">Cargo / Função nesta assinatura</label>
              <select value={sigRole} onChange={e => setSigRole(e.target.value)}
                className="w-full border border-input rounded-lg px-3 py-2 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary">
                {["Responsável Técnico", "Representante Legal", "Elaborador", "Aprovador", "Revisor", "Gestor de Qualidade"].map(r => (
                  <option key={r} value={r}>{r}</option>
                ))}
              </select>
            </div>
            <div className="flex gap-2 pt-1">
              <button type="button" onClick={() => setSigDialogOpen(false)} disabled={signing}
                className="flex-1 text-sm px-4 py-2.5 rounded-lg border border-gray-300 text-gray-600 hover:bg-gray-50 font-medium transition-colors">
                Pular por agora
              </button>
              <button type="button" onClick={handleSign} disabled={signing}
                className="flex-1 text-sm px-4 py-2.5 rounded-lg bg-primary text-white hover:bg-primary/90 font-semibold transition-colors flex items-center justify-center gap-2">
                {signing ? <><Loader2 className="h-4 w-4 animate-spin" /> Assinando…</> : <><PenLine className="h-4 w-4" /> Confirmar Assinatura</>}
              </button>
            </div>
          </div>
        </div>
      </div>
    )}

    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <ShieldCheck className="h-5 w-5 text-primary" />
            <CardTitle className="text-base">Notificações ANVISA</CardTitle>
            <Badge variant="secondary" className="text-xs">Uso interno — não aparece no certificado</Badge>
          </div>
          {!showForm && (
            <Button size="sm" onClick={() => setShowForm(true)}>
              <Plus className="h-3.5 w-3.5 mr-1" /> Registrar Notificação
            </Button>
          )}
        </div>
        <p className="text-xs text-muted-foreground mt-1">
          Controle das empresas notificadas na ANVISA. Exclusivamente para uso interno — não consta no certificado de análise.
        </p>
      </CardHeader>
      <CardContent className="space-y-4">

        {/* ── Banco de Dados de Empresas ── */}
        <div className="rounded-lg border border-gray-200 bg-gray-50 overflow-hidden">
          <button type="button" onClick={() => setCompanyMgr(v => !v)}
            className="w-full flex items-center justify-between px-4 py-2.5 text-xs font-semibold text-gray-700 hover:bg-gray-100 transition-colors">
            <span className="flex items-center gap-2">
              <Building2 className="h-3.5 w-3.5 text-gray-500" />
              Banco de Empresas
              <span className="text-[10px] text-gray-400 font-normal">(banco global)</span>
            </span>
            {companyMgr ? <ChevronDown className="h-3.5 w-3.5 text-gray-400" /> : <ChevronRight className="h-3.5 w-3.5 text-gray-400" />}
          </button>
          {companyMgr && (
            <div className="border-t border-gray-200 p-3 space-y-3">
              {/* Add new company */}
              <div className="flex flex-col sm:flex-row gap-2">
                <Input placeholder="Razão Social" value={editCompanyId ? editCompanyName : editCompanyName}
                  onChange={e => setEditCompanyName(e.target.value)} className="h-8 text-xs flex-1" />
                <Input placeholder="CNPJ (opcional)" value={editCompanyCnpj}
                  onChange={e => setEditCompanyCnpj(e.target.value)} className="h-8 text-xs w-44" />
                <button type="button"
                  onClick={editCompanyId ? handleUpdateCompany : async () => {
                    if (!editCompanyName.trim()) return;
                    setSavingCompany(true);
                    try {
                      await fetch("/api/companies", {
                        method: "POST",
                        headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
                        body: JSON.stringify({ name: editCompanyName.trim(), cnpj: editCompanyCnpj.trim() || null }),
                      });
                      queryClient.invalidateQueries({ queryKey: ["companies"] });
                      setEditCompanyName(""); setEditCompanyCnpj(""); setEditCompanyId(null);
                      toast({ title: "Empresa adicionada" });
                    } catch { toast({ title: "Erro ao adicionar", variant: "destructive" }); }
                    finally { setSavingCompany(false); }
                  }}
                  disabled={savingCompany || !editCompanyName.trim()}
                  className="h-8 flex items-center gap-1.5 px-3 rounded border border-gray-300 bg-white text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 whitespace-nowrap">
                  {savingCompany ? <Loader2 className="h-3 w-3 animate-spin" /> : <Save className="h-3 w-3" />}
                  {editCompanyId ? "Atualizar" : "Adicionar"}
                </button>
                {editCompanyId && (
                  <button type="button" onClick={() => { setEditCompanyId(null); setEditCompanyName(""); setEditCompanyCnpj(""); }}
                    className="h-8 flex items-center gap-1 px-2 rounded border border-gray-200 text-xs text-gray-500 hover:bg-gray-100">
                    <X className="h-3 w-3" /> Cancelar
                  </button>
                )}
              </div>
              {/* List */}
              {savedCompanies.length === 0 && <p className="text-xs text-gray-400 text-center py-2">Nenhuma empresa salva ainda</p>}
              {savedCompanies.map(c => (
                <div key={c.id} className="flex items-center justify-between bg-white rounded border border-gray-200 px-3 py-2">
                  <div className="min-w-0">
                    <p className="text-xs font-medium text-gray-800 truncate">{c.name}</p>
                    {c.cnpj && <p className="text-[10px] text-gray-400">{c.cnpj}</p>}
                  </div>
                  <div className="flex gap-1 ml-2 shrink-0">
                    <button type="button" onClick={() => { setEditCompanyId(c.id); setEditCompanyName(c.name); setEditCompanyCnpj(c.cnpj ?? ""); }}
                      className="p-1 rounded hover:bg-gray-100 text-gray-400 hover:text-gray-700 transition-colors" title="Editar">
                      <Pencil className="h-3 w-3" />
                    </button>
                    <button type="button" onClick={() => handleDeleteCompany(c.id)} disabled={deletingCompanyId === c.id}
                      className="p-1 rounded hover:bg-red-50 text-gray-400 hover:text-red-500 transition-colors" title="Remover">
                      {deletingCompanyId === c.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <Trash2 className="h-3 w-3" />}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* ── Banco de Números ANVISA ── */}
        <div className="rounded-lg border border-gray-200 bg-gray-50 overflow-hidden">
          <button type="button" onClick={() => setNumberMgr(v => !v)}
            className="w-full flex items-center justify-between px-4 py-2.5 text-xs font-semibold text-gray-700 hover:bg-gray-100 transition-colors">
            <span className="flex items-center gap-2">
              <Database className="h-3.5 w-3.5 text-gray-500" />
              Números ANVISA deste protocolo
              {savedNumbers.length > 0 && <span className="bg-blue-100 text-blue-700 rounded-full px-1.5 py-0.5 text-[10px] font-bold">{savedNumbers.length}</span>}
            </span>
            {numberMgr ? <ChevronDown className="h-3.5 w-3.5 text-gray-400" /> : <ChevronRight className="h-3.5 w-3.5 text-gray-400" />}
          </button>
          {numberMgr && (
            <div className="border-t border-gray-200 p-3 space-y-3">
              {/* Add/edit form */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <Input placeholder="Rótulo / Descrição (opcional)" value={editNumber.label}
                  onChange={e => setEditNumber(n => ({ ...n, label: e.target.value }))} className="h-8 text-xs sm:col-span-2" />
                <Input placeholder="Nº Expediente" value={editNumber.exp}
                  onChange={e => setEditNumber(n => ({ ...n, exp: e.target.value }))} className="h-8 text-xs" />
                <Input placeholder="Nº Processo" value={editNumber.proc}
                  onChange={e => setEditNumber(n => ({ ...n, proc: e.target.value }))} className="h-8 text-xs" />
                <Input placeholder="Nº Transação" value={editNumber.trans}
                  onChange={e => setEditNumber(n => ({ ...n, trans: e.target.value }))} className="h-8 text-xs" />
                <Input placeholder="Nº Protocolo" value={editNumber.prot}
                  onChange={e => setEditNumber(n => ({ ...n, prot: e.target.value }))} className="h-8 text-xs" />
              </div>
              <div className="flex gap-2">
                <button type="button"
                  onClick={editNumberId ? handleUpdateNumber : async () => {
                    if (!editNumber.exp && !editNumber.proc && !editNumber.trans && !editNumber.prot) return;
                    setSavingNumber(true);
                    try {
                      await fetch("/api/anvisa-number-bank", {
                        method: "POST",
                        headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
                        body: JSON.stringify({ protocolId, label: editNumber.label || null, expedienteNumber: editNumber.exp || null, processNumber: editNumber.proc || null, transactionNumber: editNumber.trans || null, protocolNumber: editNumber.prot || null }),
                      });
                      queryClient.invalidateQueries({ queryKey: ["anvisa-number-bank", protocolId] });
                      setEditNumber({ label: "", exp: "", proc: "", trans: "", prot: "" }); setEditNumberId(null);
                      toast({ title: "Números salvos" });
                    } catch { toast({ title: "Erro ao salvar", variant: "destructive" }); }
                    finally { setSavingNumber(false); }
                  }}
                  disabled={savingNumber || (!editNumber.exp && !editNumber.proc && !editNumber.trans && !editNumber.prot)}
                  className="flex items-center gap-1.5 px-3 h-8 rounded border border-gray-300 bg-white text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50">
                  {savingNumber ? <Loader2 className="h-3 w-3 animate-spin" /> : <Save className="h-3 w-3" />}
                  {editNumberId ? "Atualizar" : "Adicionar"}
                </button>
                {editNumberId && (
                  <button type="button" onClick={() => { setEditNumberId(null); setEditNumber({ label: "", exp: "", proc: "", trans: "", prot: "" }); }}
                    className="flex items-center gap-1 px-2 h-8 rounded border border-gray-200 text-xs text-gray-500 hover:bg-gray-100">
                    <X className="h-3 w-3" /> Cancelar
                  </button>
                )}
              </div>
              {/* List */}
              {savedNumbers.length === 0 && <p className="text-xs text-gray-400 text-center py-2">Nenhum registro salvo ainda</p>}
              {savedNumbers.map(n => (
                <div key={n.id} className="bg-white rounded border border-gray-200 px-3 py-2 flex items-start justify-between gap-2">
                  <div className="min-w-0 text-xs space-y-0.5">
                    {n.label && <p className="font-semibold text-gray-800 truncate">{n.label}</p>}
                    {n.expedienteNumber && <p className="text-gray-500"><span className="text-gray-400">Exp:</span> {n.expedienteNumber}</p>}
                    {n.processNumber && <p className="text-gray-500"><span className="text-gray-400">Proc:</span> {n.processNumber}</p>}
                    {n.transactionNumber && <p className="text-gray-500"><span className="text-gray-400">Trans:</span> {n.transactionNumber}</p>}
                    {n.protocolNumber && <p className="text-gray-500"><span className="text-gray-400">Prot:</span> {n.protocolNumber}</p>}
                  </div>
                  <div className="flex gap-1 shrink-0">
                    <button type="button" onClick={() => { setEditNumberId(n.id); setEditNumber({ label: n.label ?? "", exp: n.expedienteNumber ?? "", proc: n.processNumber ?? "", trans: n.transactionNumber ?? "", prot: n.protocolNumber ?? "" }); }}
                      className="p-1 rounded hover:bg-gray-100 text-gray-400 hover:text-gray-700" title="Editar">
                      <Pencil className="h-3 w-3" />
                    </button>
                    <button type="button" onClick={() => handleDeleteNumber(n.id)} disabled={deletingNumberId === n.id}
                      className="p-1 rounded hover:bg-red-50 text-gray-400 hover:text-red-500" title="Remover">
                      {deletingNumberId === n.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <Trash2 className="h-3 w-3" />}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* ── Formulário ── */}
        {showForm && (
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 space-y-4">
            <p className="text-sm font-semibold text-amber-800 flex items-center gap-1.5">
              <Bell className="h-4 w-4" /> {editingId !== null ? "Editar Notificação ANVISA" : "Nova Notificação ANVISA"}
            </p>

            {/* Empresa */}
            <div className="space-y-3">
              {/* Dropdown carregar empresa salva */}
              {savedCompanies.length > 0 && (
                <div className="flex items-center gap-2 p-2 rounded-lg bg-white border border-amber-200">
                  <Building2 className="h-3.5 w-3.5 text-amber-600 shrink-0" />
                  <select
                    className="flex-1 border-0 bg-transparent text-xs focus:outline-none focus:ring-0 text-gray-700"
                    defaultValue=""
                    onChange={e => {
                      const c = savedCompanies.find(x => x.id === Number(e.target.value));
                      if (c) setForm(f => ({ ...f, companyName: c.name, companyCnpj: c.cnpj ?? "" }));
                      e.target.value = "";
                    }}
                  >
                    <option value="">↓ Selecionar empresa salva…</option>
                    {savedCompanies.map(c => (
                      <option key={c.id} value={c.id}>{c.name}{c.cnpj ? ` — ${c.cnpj}` : ""}</option>
                    ))}
                  </select>
                </div>
              )}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-xs font-medium">Razão Social da Empresa *</label>
                  <Input placeholder="Ex: Blumed Distribuidora de Medicamentos Ltda" value={form.companyName}
                    onChange={e => setForm(f => ({ ...f, companyName: e.target.value }))} />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-medium">CNPJ da Empresa (opcional)</label>
                  <Input placeholder="Ex: 17.911.303/0001-69" value={form.companyCnpj}
                    onChange={e => setForm(f => ({ ...f, companyCnpj: e.target.value }))} />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-medium">Nome Comercial / Marca (opcional)</label>
                  <Input placeholder="Ex: Blumed-NAC-Acetilcisteína 600mg 30 Cápsulas" value={form.brandName}
                    onChange={e => setForm(f => ({ ...f, brandName: e.target.value }))} />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-medium">Data e Hora da Notificação *</label>
                  <Input type="datetime-local" value={form.notifiedAt}
                    onChange={e => setForm(f => ({ ...f, notifiedAt: e.target.value }))} />
                </div>
              </div>
              {/* Salvar empresa no banco */}
              {form.companyName.trim() && (
                <button type="button" onClick={handleSaveCompanyToBank} disabled={savingCompany}
                  className="flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded border border-amber-300 bg-white text-amber-700 hover:bg-amber-50 transition-colors font-medium">
                  {savingCompany ? <Loader2 className="h-3 w-3 animate-spin" /> : <Save className="h-3 w-3" />}
                  Salvar empresa no banco de dados
                </button>
              )}
            </div>

            {/* Números do processo ANVISA */}
            <div className="rounded-md border border-blue-200 bg-blue-50 p-3 space-y-2">
              <div className="flex items-center justify-between">
                <p className="text-xs font-semibold text-blue-800 flex items-center gap-1.5">
                  <ShieldCheck className="h-3.5 w-3.5" /> Números do Processo ANVISA (opcionais)
                </p>
              </div>
              {/* Dropdown carregar números salvos */}
              {savedNumbers.length > 0 && (
                <div className="flex items-center gap-2 p-2 rounded bg-white border border-blue-200">
                  <Database className="h-3.5 w-3.5 text-blue-500 shrink-0" />
                  <select
                    className="flex-1 border-0 bg-transparent text-xs focus:outline-none focus:ring-0 text-gray-700"
                    defaultValue=""
                    onChange={e => {
                      const n = savedNumbers.find(x => x.id === Number(e.target.value));
                      if (n) setForm(f => ({
                        ...f,
                        expedienteNumber: n.expedienteNumber ?? "",
                        processNumber: n.processNumber ?? "",
                        transactionNumber: n.transactionNumber ?? "",
                        protocolNumber: n.protocolNumber ?? "",
                      }));
                      e.target.value = "";
                    }}
                  >
                    <option value="">↓ Carregar números salvos…</option>
                    {savedNumbers.map(n => (
                      <option key={n.id} value={n.id}>
                        {n.label ?? n.expedienteNumber ?? `ID ${n.id}`}
                        {n.expedienteNumber && n.label !== n.expedienteNumber ? ` (Exp: ${n.expedienteNumber})` : ""}
                      </option>
                    ))}
                  </select>
                </div>
              )}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <div className="space-y-1">
                  <label className="text-xs font-medium text-blue-700">Nº do Expediente</label>
                  <Input placeholder="Ex: 0671387260" value={form.expedienteNumber}
                    onChange={e => setForm(f => ({ ...f, expedienteNumber: e.target.value }))} className="h-8 text-xs" />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-medium text-blue-700">Nº do Processo</label>
                  <Input placeholder="Ex: 25351119711202645" value={form.processNumber}
                    onChange={e => setForm(f => ({ ...f, processNumber: e.target.value }))} className="h-8 text-xs" />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-medium text-blue-700">Nº de Transação</label>
                  <Input placeholder="Ex: 8941182026" value={form.transactionNumber}
                    onChange={e => setForm(f => ({ ...f, transactionNumber: e.target.value }))} className="h-8 text-xs" />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-medium text-blue-700">Nº de Protocolo</label>
                  <Input placeholder="Ex: 20260000000600557" value={form.protocolNumber}
                    onChange={e => setForm(f => ({ ...f, protocolNumber: e.target.value }))} className="h-8 text-xs" />
                </div>
              </div>
              {/* Salvar números no banco */}
              {(form.expedienteNumber || form.processNumber || form.transactionNumber || form.protocolNumber) && (
                <button type="button" onClick={handleSaveNumbersToBank} disabled={savingNumber}
                  className="flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded border border-blue-300 bg-white text-blue-700 hover:bg-blue-50 transition-colors font-medium">
                  {savingNumber ? <Loader2 className="h-3 w-3 animate-spin" /> : <Save className="h-3 w-3" />}
                  Salvar estes números no banco de dados
                </button>
              )}
            </div>

            <div className="space-y-1">
              <label className="text-xs font-medium">Anotações (opcional)</label>
              <Textarea placeholder="Observações sobre a notificação..." rows={2} value={form.notes}
                onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} />
            </div>

            {/* ── Textos do documento (editáveis) ── */}
            <div className="rounded-md border border-indigo-200 bg-indigo-50 p-3 space-y-3">
              <p className="text-xs font-semibold text-indigo-800 flex items-center gap-1.5">
                📄 Textos do Documento — edite conforme necessário
              </p>
              <div className="space-y-1">
                <label className="text-xs font-medium text-indigo-700">Seção 1 — Assunto</label>
                <Textarea rows={2} value={form.docAssunto}
                  onChange={e => setForm(f => ({ ...f, docAssunto: e.target.value }))}
                  className="text-xs bg-white" />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium text-indigo-700">Seção 3 — Descrição da Alteração</label>
                <Textarea rows={5} value={form.docDescricao}
                  onChange={e => setForm(f => ({ ...f, docDescricao: e.target.value }))}
                  className="text-xs bg-white" />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium text-indigo-700">Seção 6 — Validação Analítica e Estudos</label>
                <Textarea rows={4} value={form.docValidacao}
                  onChange={e => setForm(f => ({ ...f, docValidacao: e.target.value }))}
                  className="text-xs bg-white" />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium text-indigo-700">Seção 7 — Justificativa Técnica</label>
                <Textarea rows={4} value={form.docJustificativa}
                  onChange={e => setForm(f => ({ ...f, docJustificativa: e.target.value }))}
                  className="text-xs bg-white" />
              </div>
              <p className="text-xs text-indigo-600">
                ℹ️ As seções 2 (Produto), 4 (Empresa), 5 (Identificação Comercial) e 8 (Assinatura) são preenchidas automaticamente com os dados do protocolo e da notificação.
              </p>
            </div>

            {/* Confirmação + Protocolo ANVISA (obrigatório quando confirmado) */}
            <div className="rounded-md border border-amber-300 bg-amber-100 p-3 space-y-3">
              <label className="flex items-start gap-2.5 cursor-pointer select-none">
                <input type="checkbox" className="mt-0.5 h-4 w-4 rounded border-amber-400 accent-amber-600"
                  checked={form.confirmed} onChange={e => setForm(f => ({ ...f, confirmed: e.target.checked }))} />
                <span className="text-sm font-semibold text-amber-900">
                  ✅ Confirmo que a notificação já foi realizada na ANVISA
                </span>
              </label>

              {form.confirmed && (
                <p className="text-xs text-amber-700 font-medium pl-6">
                  Para confirmar é obrigatório anexar o protocolo de petição gerado pela ANVISA.
                </p>
              )}

              <div className="pl-6">
                <AttachRow
                  label="Protocolo ANVISA" required={form.confirmed} field="protocolo"
                  fileName={form.attachmentFileName}
                  onClear={() => setForm(f => ({ ...f, attachmentObjectPath: null, attachmentFileName: null, attachmentFileType: null }))}
                  onPick={() => protocoloInputRef.current?.click()}
                />
              </div>
              <input ref={protocoloInputRef} type="file" accept=".pdf,.doc,.docx,image/*" className="hidden" onChange={makeFileHandler("protocolo")} />
            </div>

            {/* Rótulo e Padronização — sempre visíveis, opcionais */}
            <div className="rounded-md border border-slate-200 bg-slate-50 p-3 space-y-2">
              <p className="text-xs font-medium text-slate-600 mb-1">Documentos adicionais (opcionais)</p>
              <AttachRow
                label="Rótulo" field="rotulo"
                fileName={form.rotuloFileName}
                onClear={() => setForm(f => ({ ...f, rotuloObjectPath: null, rotuloFileName: null, rotuloFileType: null }))}
                onPick={() => rotuloInputRef.current?.click()}
              />
              <AttachRow
                label="Padronização" field="padronizacao"
                fileName={form.padronizacaoFileName}
                onClear={() => setForm(f => ({ ...f, padronizacaoObjectPath: null, padronizacaoFileName: null, padronizacaoFileType: null }))}
                onPick={() => padronizacaoInputRef.current?.click()}
              />
              <input ref={rotuloInputRef}       type="file" accept=".pdf,.doc,.docx,image/*" className="hidden" onChange={makeFileHandler("rotulo")} />
              <input ref={padronizacaoInputRef} type="file" accept=".pdf,.doc,.docx,image/*" className="hidden" onChange={makeFileHandler("padronizacao")} />
            </div>

            <div className="flex justify-end gap-2">
              <Button size="sm" variant="outline" onClick={resetForm}>Cancelar</Button>
              <Button size="sm" disabled={!canSave || saving} onClick={handleSave}>
                {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : <Plus className="h-3.5 w-3.5 mr-1" />}
                {editingId !== null ? "Salvar Alterações" : "Salvar Notificação"}
              </Button>
            </div>
          </div>
        )}

        {/* ── Lista ── */}
        {isLoading ? (
          <div className="flex items-center justify-center py-8 text-muted-foreground text-sm">
            <Loader2 className="h-4 w-4 animate-spin mr-2" /> Carregando…
          </div>
        ) : notifications.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-10 text-muted-foreground">
            <ShieldCheck className="h-8 w-8 mb-2 opacity-30" />
            <p className="text-sm">Nenhuma notificação ANVISA registrada ainda.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {notifications.map(n => (
              <div key={n.id} className={`rounded-lg border p-4 ${n.confirmed ? "border-green-200 bg-green-50" : "border-slate-200 bg-slate-50"}`}>
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0 space-y-1.5">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold text-sm">{n.companyName}</span>
                      {n.confirmed
                        ? <Badge className="bg-green-100 text-green-800 border-green-300 text-xs"><CheckCircle2 className="h-3 w-3 mr-1" /> Confirmada</Badge>
                        : <Badge variant="outline" className="text-xs text-amber-700 border-amber-300 bg-amber-50">Pendente confirmação</Badge>}
                    </div>
                    <div className="text-xs text-muted-foreground flex items-center gap-3 flex-wrap">
                      {n.companyCnpj && <span>CNPJ: <strong>{n.companyCnpj}</strong></span>}
                      {n.brandName && <span>Marca: {n.brandName}</span>}
                    </div>
                    <div className="text-xs text-muted-foreground flex items-center gap-3 flex-wrap">
                      <span>📅 Notificado em: <strong>{fmtDateTime(n.notifiedAt)}</strong></span>
                      {n.createdByName && <span>Registrado por: {n.createdByName}</span>}
                    </div>
                    {(n.expedienteNumber || n.processNumber || n.transactionNumber || n.protocolNumber) && (
                      <div className="text-xs text-blue-700 bg-blue-50 rounded px-2 py-1 border border-blue-200 space-y-0.5">
                        {n.expedienteNumber && <div><strong>Expediente:</strong> {n.expedienteNumber}</div>}
                        {n.processNumber && <div><strong>Processo:</strong> {n.processNumber}</div>}
                        {n.transactionNumber && <div><strong>Transação:</strong> {n.transactionNumber}</div>}
                        {n.protocolNumber && <div><strong>Protocolo ANVISA:</strong> {n.protocolNumber}</div>}
                      </div>
                    )}
                    {n.notes && <p className="text-xs text-slate-600 bg-white rounded px-2 py-1 border border-slate-200">{n.notes}</p>}

                    {/* ── Assinatura eletrônica ── */}
                    {n.signedByName ? (
                      <div className="flex items-center gap-2 bg-green-50 border border-green-200 rounded px-2.5 py-1.5">
                        <ShieldCheck className="h-3.5 w-3.5 text-green-600 shrink-0" />
                        <div className="min-w-0 flex-1">
                          <span style={{ fontFamily: "'Dancing Script', cursive", fontSize: "0.95rem", fontWeight: 600, color: "#111827" }}>
                            {n.signedByName}
                          </span>
                          <span className="text-xs text-green-700 ml-2 font-medium">({n.signedByRole})</span>
                          {n.signedAt && (
                            <span className="text-[10px] text-green-600 ml-2">
                              — {new Date(n.signedAt).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" })}
                            </span>
                          )}
                        </div>
                        {isAdmin && (
                          <button
                            className="text-green-400 hover:text-red-500 transition-colors ml-auto"
                            title="Remover assinatura"
                            onClick={() => handleUnsign(n.id)}
                            disabled={unsigningId === n.id}
                          >
                            {unsigningId === n.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3 w-3" />}
                          </button>
                        )}
                      </div>
                    ) : (
                      <button
                        className="flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded border border-primary/30 bg-primary/5 text-primary hover:bg-primary/15 transition-colors font-medium"
                        onClick={() => { setSigTargetId(n.id); setSigRole("Responsável Técnico"); setSigDialogOpen(true); }}
                        title="Assinar esta notificação digitalmente"
                      >
                        <PenLine className="h-3 w-3" /> Assinar digitalmente
                      </button>
                    )}

                    {/* Anexos */}
                    {(n.attachmentFileName || n.rotuloFileName || n.padronizacaoFileName) && (
                      <div className="flex flex-wrap gap-3 mt-1">
                        {n.attachmentFileName && n.attachmentObjectPath && (
                          <button className="flex items-center gap-1 text-xs text-blue-700 hover:text-blue-900 hover:underline"
                            onClick={() => handleDownload(n.attachmentObjectPath!, n.attachmentFileName!)}>
                            <FileText className="h-3.5 w-3.5 shrink-0" />
                            <span>Protocolo ANVISA</span>
                            <Download className="h-3 w-3" />
                          </button>
                        )}
                        {n.rotuloFileName && n.rotuloObjectPath && (
                          <button className="flex items-center gap-1 text-xs text-violet-700 hover:text-violet-900 hover:underline"
                            onClick={() => handleDownload(n.rotuloObjectPath!, n.rotuloFileName!)}>
                            <FileText className="h-3.5 w-3.5 shrink-0" />
                            <span>Rótulo</span>
                            <Download className="h-3 w-3" />
                          </button>
                        )}
                        {n.padronizacaoFileName && n.padronizacaoObjectPath && (
                          <button className="flex items-center gap-1 text-xs text-teal-700 hover:text-teal-900 hover:underline"
                            onClick={() => handleDownload(n.padronizacaoObjectPath!, n.padronizacaoFileName!)}>
                            <FileText className="h-3.5 w-3.5 shrink-0" />
                            <span>Padronização</span>
                            <Download className="h-3 w-3" />
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                  <div className="flex items-center gap-1 shrink-0 flex-wrap justify-end">
                    <Button
                      size="sm" variant="outline"
                      className="h-7 text-xs gap-1 border-amber-300 text-amber-700 hover:bg-amber-50"
                      onClick={() => { startEdit(n); }}
                      title="Editar esta notificação"
                    >
                      ✏️ Editar
                    </Button>
                    <Button
                      size="sm" variant="outline"
                      className="h-7 text-xs gap-1 border-primary/30 text-primary hover:bg-primary/10"
                      onClick={() => handleGenerateDoc(n)}
                      disabled={generatingDocId === n.id}
                      title="Gerar documento ANVISA para imprimir/PDF"
                    >
                      {generatingDocId === n.id
                        ? <Loader2 className="h-3 w-3 animate-spin" />
                        : <FileText className="h-3 w-3" />}
                      {generatingDocId === n.id ? "Gerando…" : "Gerar Doc"}
                    </Button>
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button size="icon" variant="ghost" className="h-7 w-7 text-slate-400 hover:text-red-500">
                          {deletingId === n.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Remover notificação?</AlertDialogTitle>
                          <AlertDialogDescription>
                            Isso removerá o registro de notificação ANVISA de <strong>{n.companyName}</strong>. Esta ação não pode ser desfeita.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancelar</AlertDialogCancel>
                          <AlertDialogAction onClick={() => handleDelete(n.id)} className="bg-red-600 hover:bg-red-700">Remover</AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
    </>
  );
}
