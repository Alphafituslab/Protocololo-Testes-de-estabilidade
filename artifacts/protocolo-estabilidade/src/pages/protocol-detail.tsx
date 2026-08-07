import { useParams, Link, useLocation } from "wouter";
import { fmtDate } from "@/lib/utils";
import React, { useState, useRef, useEffect, useCallback, useMemo, Fragment, lazy, Suspense } from "react";
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
  upsertResult as upsertResultDirect,
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
  useListProtocols,
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
  useUpdateBibliographicReference,
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
  useListDeletedLots,
  useRestoreLot,
  usePermanentDeleteLot,
  getListDeletedLotsQueryKey,
  type DeletedLot,
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
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ArrowLeft, Plus, Pencil, Trash2, FileText, CheckCircle2, XCircle, Loader2, FlaskConical, BarChart3, Award, Lock, Unlock, BookOpen, History, Paperclip, ExternalLink, Upload, Download, X, File, GripVertical, Search, SaveAll, RotateCcw, ShieldAlert, Eye, EyeOff, Bell, ShieldCheck, PenLine, Building2, Database, ChevronDown, ChevronRight, Save } from "lucide-react";
import { AuditTrail } from "@/components/audit-trail";
import { AuditBadge } from "@/components/audit-badge";
import { useToast } from "@/hooks/use-toast";
import { useLabelOverrides } from "@/hooks/use-label-overrides";
import { useAuth } from "@/contexts/use-auth";

// ── Shared constants & types (extracted to reduce this file's size) ───────────
import {
  STATUS_LABELS, STATUS_COLORS, RESULT_STATUS_COLORS,
  ANALYSIS_PARAMETERS, MICRO_PARAMS_CAPSULA, MICRO_PARAMS_PO, PERIODS,
  lotSchema, finalizeSchema,
  isToday, getDefaultParams,
  PARAM_CATALOG_KEY, getCatalogEntries, addToCatalog, getParamsForMethodology, getPresetsForCategory, normalizeSearch,
  PRODUCT_TEMPLATES, CATEGORY_PRESETS,
  parseCriterionRange, calcKineticOverride, calcMedia, buildKineticOverride,
} from "@/components/protocol/shared";
import type {
  ActiveCell, EditableParam, KineticOverride, KineticApiParam, KineticsOverridesDB, CatalogEntry, ProductTemplateParam, ProductTemplate,
} from "@/components/protocol/shared";

// ── Lazy-loaded heavy tab components ─────────────────────────────────────────
const ResultsTab = lazy(() => import("@/components/protocol/results-tab").then(m => ({ default: m.ResultsTab })));
const KineticsTab = lazy(() => import("@/components/protocol/kinetics-tab").then(m => ({ default: m.KineticsTab })));
const MethodologiaTab = lazy(() => import("@/components/protocol/metodologia-tab").then(m => ({ default: m.MethodologiaTab })));
const FinalizeSection = lazy(() => import("@/components/protocol/finalize-section").then(m => ({ default: m.FinalizeSection })));
const VersionsTab = lazy(() => import("@/components/protocol/versions-tab").then(m => ({ default: m.VersionsTab })));
const DocumentosTab = lazy(() => import("@/components/protocol/documentos-tab").then(m => ({ default: m.DocumentosTab })));
const ReferencesTab = lazy(() => import("@/components/protocol/references-tab").then(m => ({ default: m.ReferencesTab })));
const AnvisaTab = lazy(() => import("@/components/protocol/anvisa-tab").then(m => ({ default: m.AnvisaTab })));

function TabFallback() {
  return <div className="flex items-center justify-center py-12 text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin mr-2" />Carregando...</div>;
}

class TabErrorBoundary extends React.Component<
  { children: React.ReactNode; tabName?: string; protocolId?: number | null },
  { hasError: boolean; error: Error | null }
> {
  constructor(props: { children: React.ReactNode; tabName?: string; protocolId?: number | null }) {
    super(props);
    this.state = { hasError: false, error: null };
  }
  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }
  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error(`[TabErrorBoundary] Erro na aba "${this.props.tabName ?? "?"}"`, error, info);
    // POST assíncrono para o servidor — falha silenciosa para não atrapalhar o usuário
    fetch("/api/error-logs/tab-error", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({
        protocolId: this.props.protocolId ?? null,
        tabName: this.props.tabName ?? null,
        errorMessage: error.message,
        errorStack: error.stack ?? null,
        componentStack: info.componentStack ?? null,
      }),
    }).catch(() => {/* ignorar falhas de rede */});
  }
  render() {
    if (this.state.hasError) {
      return (
        <div className="flex flex-col items-center justify-center py-12 gap-3 text-center">
          <span className="text-destructive font-medium text-sm">
            Erro ao carregar {this.props.tabName ? `a aba "${this.props.tabName}"` : "esta aba"}.
          </span>
          <span className="text-muted-foreground text-xs max-w-sm">
            {this.state.error?.message ?? "Erro desconhecido"}
          </span>
          <button
            className="text-xs underline text-muted-foreground hover:text-foreground"
            onClick={() => this.setState({ hasError: false, error: null })}
          >
            Tentar novamente
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

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
  const canEditLotNumber = hasPermission("lots:edit_number");
  const { data: lots = [], isLoading } = useListLots(protocolId, {
    query: { queryKey: getListLotsQueryKey(protocolId) },
  });
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [editLot, setEditLot] = useState<typeof lots[number] | null>(null);
  const [lastAdded, setLastAdded] = useState<string | null>(null);
  const [pendingLotValues, setPendingLotValues] = useState<z.infer<typeof lotSchema> | null>(null);
  const [unlockLotOpen, setUnlockLotOpen] = useState(false);

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
      onError: (err: unknown) => {
        const msg = (err as { response?: { data?: { error?: string } }; message?: string })
          ?.response?.data?.error
          ?? (err instanceof Error ? err.message : null)
          ?? "Erro ao criar lote. Verifique suas permissões.";
        toast({ title: "Erro ao adicionar lote", description: msg, variant: "destructive" });
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
        queryClient.invalidateQueries({ queryKey: getListDeletedLotsQueryKey(protocolId) });
        toast({ title: "Lote removido" });
      },
    },
  });

  // ── Trash (lixeira) ──────────────────────────────────────────────────────
  const [trashOpen, setTrashOpen] = useState(false);
  const { data: deletedLots = [], isLoading: isLoadingDeleted } = useListDeletedLots(protocolId, {
    query: { queryKey: getListDeletedLotsQueryKey(protocolId), enabled: trashOpen },
  });

  // Count analysis results per lot so the dialog can warn before the user confirms permanent deletion
  const { data: allResults = [] } = useListResults(protocolId, {
    query: { queryKey: getListResultsQueryKey(protocolId) },
  });
  const resultCountByLotId = useMemo(() => {
    const map: Record<number, number> = {};
    for (const r of allResults) {
      map[r.lotId] = (map[r.lotId] ?? 0) + 1;
    }
    return map;
  }, [allResults]);

  const restoreLot = useRestoreLot({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListLotsQueryKey(protocolId) });
        queryClient.invalidateQueries({ queryKey: getListDeletedLotsQueryKey(protocolId) });
        queryClient.invalidateQueries({ queryKey: getGetKineticsQueryKey(protocolId) });
        toast({ title: "Lote restaurado", description: "O lote voltou para a lista ativa." });
      },
      onError: (err: unknown) => {
        const msg = (err as { response?: { data?: { error?: string } }; message?: string })
          ?.response?.data?.error
          ?? (err instanceof Error ? err.message : null)
          ?? "Erro ao restaurar lote.";
        toast({ title: "Erro ao restaurar", description: msg, variant: "destructive" });
      },
    },
  });

  const permanentDeleteLot = usePermanentDeleteLot({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListDeletedLotsQueryKey(protocolId) });
        toast({ title: "Lote excluído permanentemente" });
      },
      onError: (err: unknown) => {
        const msg = (err as { response?: { data?: { error?: string } }; message?: string })
          ?.response?.data?.error
          ?? (err instanceof Error ? err.message : null)
          ?? "Erro ao excluir permanentemente.";
        toast({ title: "Erro ao excluir", description: msg, variant: "destructive" });
      },
    },
  });

  const onSubmit = (values: z.infer<typeof lotSchema>) => {
    if (editLot) {
      // Editing: require password confirmation before saving
      setPendingLotValues(values);
      setUnlockLotOpen(true);
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

      {/* ── Lixeira ─────────────────────────────────────────────────────────── */}
      <Collapsible open={trashOpen} onOpenChange={setTrashOpen}>
        <CollapsibleTrigger asChild>
          <button
            type="button"
            className="mt-2 flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            {trashOpen ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
            <Trash2 className="h-3.5 w-3.5" />
            Lixeira
          </button>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <div className="mt-2 rounded-md border border-destructive/20 bg-destructive/5 p-3">
            {isLoadingDeleted ? (
              <div className="text-center py-4 text-xs text-muted-foreground">Carregando lixeira...</div>
            ) : deletedLots.length === 0 ? (
              <div className="text-center py-4 text-xs text-muted-foreground">Nenhum lote na lixeira.</div>
            ) : (
              <div className="space-y-1">
                <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide mb-2">
                  Lotes excluídos ({deletedLots.length})
                </p>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-xs">Número do Lote</TableHead>
                      <TableHead className="text-xs">Fabricação</TableHead>
                      <TableHead className="text-xs">Qtd.</TableHead>
                      <TableHead className="text-xs">Excluído em</TableHead>
                      <TableHead className="w-24 text-xs"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {deletedLots.map((lot: DeletedLot) => (
                      <TableRow key={lot.id} className="opacity-70">
                        <TableCell className="font-mono font-medium text-xs">{lot.lotNumber}</TableCell>
                        <TableCell className="text-xs">{fmtDate(lot.manufacturingDate)}</TableCell>
                        <TableCell className="text-xs">{lot.quantity} un.</TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {lot.deletedAt ? new Date(lot.deletedAt).toLocaleDateString("pt-BR") : "—"}
                        </TableCell>
                        <TableCell>
                          {canManageLots && (
                            <div className="flex gap-1">
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-7 px-2 text-xs text-green-700 hover:text-green-800 hover:bg-green-50"
                                onClick={() => restoreLot.mutate({ id: protocolId, lotId: lot.id })}
                                disabled={restoreLot.isPending}
                              >
                                <RotateCcw className="h-3 w-3 mr-1" />
                                Restaurar
                              </Button>
                              <AlertDialog>
                                <AlertDialogTrigger asChild>
                                  <Button variant="ghost" size="sm" className="h-7 px-2 text-xs text-destructive hover:text-destructive hover:bg-destructive/10">
                                    <Trash2 className="h-3 w-3 mr-1" />
                                    Excluir
                                  </Button>
                                </AlertDialogTrigger>
                                <AlertDialogContent>
                                  <AlertDialogHeader>
                                    <AlertDialogTitle>Excluir permanentemente?</AlertDialogTitle>
                                    <AlertDialogDescription asChild>
                                      <div className="space-y-2">
                                        <p>
                                          O lote <strong className="font-mono">{lot.lotNumber}</strong> será removido definitivamente do banco de dados. Esta ação não pode ser desfeita.
                                        </p>
                                        {(resultCountByLotId[lot.id] ?? 0) > 0 && (
                                          <p className="rounded-md bg-destructive/10 border border-destructive/30 px-3 py-2 text-sm text-destructive font-medium">
                                            ⚠️ Este lote possui {resultCountByLotId[lot.id]} resultado(s) de análise associado(s). Exclua os resultados primeiro antes de remover o lote permanentemente.
                                          </p>
                                        )}
                                      </div>
                                    </AlertDialogDescription>
                                  </AlertDialogHeader>
                                  <AlertDialogFooter>
                                    <AlertDialogCancel>Cancelar</AlertDialogCancel>
                                    <AlertDialogAction
                                      className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                                      onClick={() => permanentDeleteLot.mutate({ id: protocolId, lotId: lot.id })}
                                      disabled={(resultCountByLotId[lot.id] ?? 0) > 0}
                                    >
                                      Excluir permanentemente
                                    </AlertDialogAction>
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
              </div>
            )}
          </div>
        </CollapsibleContent>
      </Collapsible>

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
                  <FormControl>
                    <Input
                      data-testid="input-lotNumber"
                      placeholder="LP-20241210-639"
                      {...field}
                      disabled={!!editLot && !canEditLotNumber}
                      title={!!editLot && !canEditLotNumber ? "Você não tem permissão para editar o número do lote" : undefined}
                    />
                  </FormControl>
                  {!!editLot && !canEditLotNumber && (
                    <p className="text-xs text-muted-foreground">Número do lote bloqueado — sem permissão <code>lots:edit_number</code></p>
                  )}
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

      {/* ── UnlockDialog para confirmar edição de lote ── */}
      <UnlockDialog
        open={unlockLotOpen}
        onOpenChange={(next) => {
          setUnlockLotOpen(next);
          if (!next) setPendingLotValues(null);
        }}
        title="Confirmar alteração do lote"
        description={`Informe sua senha para salvar as alterações no lote${editLot ? ` "${editLot.lotNumber}"` : ""}.`}
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
        onSuccess={() => {
          if (!editLot || !pendingLotValues) return;
          updateLot.mutate({ id: protocolId, lotId: editLot.id, data: pendingLotValues });
          setPendingLotValues(null);
        }}
      />
    </div>
  );
}

// ActiveCell type imported from @/components/protocol/shared


export default function ProtocolDetail() {
  const { id } = useParams<{ id: string }>();
  const [, setLocation] = useLocation();
  const numId = Number(id);
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { hasPermission, token, user } = useAuth();
  const { unlocked, unlock, lock } = useUnlock();

  // Protocolos com alterações não dispensadas — mesma query key do dashboard/lista (cache compartilhado)
  const { data: pendingChangesData } = useQuery<{ protocolIds: number[]; changedAt: Record<string, string> }>({
    queryKey: ["audit-today-changed"],
    queryFn: async () => {
      const res = await fetch("/api/audit-logs/today-changed", {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        credentials: "include",
      });
      if (!res.ok) return { protocolIds: [], changedAt: {} };
      return res.json();
    },
    staleTime: 60_000,
    refetchInterval: 60_000,
  });
  const pendingChangedIds = new Set<number>(pendingChangesData?.protocolIds ?? []);
  const pendingChangedAt: Record<string, string> = pendingChangesData?.changedAt ?? {};
  const [unlockDialogOpen, setUnlockDialogOpen] = useState(false);
  const [pendingAction, setPendingAction] = useState<(() => void) | null>(null);
  const [finalizeDialogOpen, setFinalizeDialogOpen] = useState(false);
  const [deletePasswordOpen, setDeletePasswordOpen] = useState(false);
  // Tab permission map — tabs not listed here are always accessible
  const tabPermissions: Record<string, string> = {
    kinetics: "kinetics:view",
    metodologia: "methodology:view",
    historico: "audit:view",
    documentos: "documents:manage",
    referencias: "references:manage",
    versoes: "versions:view",
    anvisa: "anvisa:manage",
  };
  const knownTabs = ["info", "lots", "results", ...Object.keys(tabPermissions)];

  // Initialise from ?tab= URL param; fall back to "info" for unknown values.
  // Permission validation is deferred to the useEffect below because auth may
  // not have loaded yet at this point.
  const [activeTab, setActiveTab] = useState(() => {
    const params = new URLSearchParams(window.location.search);
    const tab = params.get("tab");
    return tab && knownTabs.includes(tab) ? tab : "info";
  });

  // Reset to "info" whenever the active tab requires a permission the user
  // doesn't have. This also fires when auth finishes loading (user changes),
  // ensuring a ?tab= deep-link to a restricted tab is caught after auth resolves.
  const userPermissions = user?.permissions;
  useEffect(() => {
    const perm = tabPermissions[activeTab];
    if (perm && !hasPermission(perm as Parameters<typeof hasPermission>[0])) {
      setActiveTab("info");
      toast({
        title: "Acesso negado",
        description: "Você não tem permissão para acessar esta aba.",
        variant: "destructive",
      });
    }
  }, [activeTab, userPermissions]); // eslint-disable-line react-hooks/exhaustive-deps

  // Lazy tab mounting: each tab only mounts when first visited, then stays mounted.
  // Prevents all heavy tab components from loading simultaneously on page open.
  const [visitedTabs, setVisitedTabs] = useState<Set<string>>(() => new Set(["info"]));
  const handleTabChange = (tab: string) => {
    // Guard: never navigate to a tab the user lacks permission for
    const perm = tabPermissions[tab];
    if (perm && !hasPermission(perm as Parameters<typeof hasPermission>[0])) return;
    setActiveTab(tab);
    setVisitedTabs(prev => { const next = new Set(prev); next.add(tab); return next; });
  };
  const mounted = (tab: string) => activeTab === tab || visitedTabs.has(tab);
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved'>('idle');

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

  const handleSaveNow = () => {
    setSaveState('saving');
    window.dispatchEvent(new CustomEvent('protocol:save-now'));
    setTimeout(() => {
      setSaveState('saved');
      setTimeout(() => setSaveState('idle'), 1200);
    }, 1500);
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
    type KineticsOvDB = { savedAt?: string; params?: Record<string, KineticOvEntry>; customShelfLife?: string; selectedShelfBox?: string; validityLocked?: boolean; cardValidity?: string };
    let kineticsOverridesPayload: string | null = null;
    try {
      const kinLsKey = `kinetics_overrides_${numId}`;
      const kinRaw = localStorage.getItem(kinLsKey);
      if (kinRaw) {
        const stored = JSON.parse(kinRaw) as { overrides?: Record<string, KineticOvEntry>; customShelfLife?: string; validityLockedByUser?: boolean; cardValidity?: string };
        if (stored.overrides && Object.keys(stored.overrides).length > 0) {
          const payload: KineticsOvDB = {
            savedAt: new Date().toISOString(),
            params: {},
            customShelfLife: stored.customShelfLife || undefined,
            selectedShelfBox: (stored as Record<string, unknown>).selectedShelfBox as string | undefined,
            validityLocked: stored.validityLockedByUser || undefined,
            cardValidity: stored.validityLockedByUser ? stored.cardValidity : undefined,
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
              {/* Badge de alteração — persiste até ser dispensado manualmente */}
              {pendingChangedIds.has(protocol.id) && (
                <AuditBadge protocolId={protocol.id} changedAt={pendingChangedAt[String(protocol.id)]} />
              )}
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
          <Button
            variant={saveState === 'saved' ? 'default' : 'outline'}
            size="sm"
            onClick={handleSaveNow}
            disabled={saveState === 'saving'}
            className={saveState === 'saved' ? 'bg-green-600 hover:bg-green-700 text-white border-green-600' : ''}
          >
            {saveState === 'saving' && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
            {saveState === 'saved' && <CheckCircle2 className="h-4 w-4 mr-1" />}
            {saveState === 'idle' && <Save className="h-4 w-4 mr-1" />}
            {saveState === 'saving' ? 'Salvando…' : saveState === 'saved' ? 'Salvo!' : 'Salvar'}
          </Button>
          {hasPermission("protocols:finalize") && (
            <Suspense fallback={<TabFallback />}>
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
            </Suspense>
          )}
          {(() => {
            const hasNC = protocol.results?.some(r => r.status === "nao_conforme") ?? false;
            const isApproved = protocol.status === "aprovado" || protocol.status === "aprovado_com_ressalva" || protocol.status === "reprovado";
            const certBlocked = hasNC && !isApproved;
            return (
              <>
                {hasPermission("certificate:view") && (certBlocked ? (
                  <Button
                    variant="outline"
                    size="sm"
                    disabled
                    title="Certificado bloqueado: existem parâmetros não conformes nos resultados"
                    className="opacity-50 cursor-not-allowed"
                  >
                    <Award className="h-4 w-4 mr-1" /> Certificado
                  </Button>
                ) : (
                  <Link href={`/protocols/${id}/certificate`}>
                    <Button variant="outline" size="sm" data-testid="button-view-certificate">
                      <Award className="h-4 w-4 mr-1" /> Certificado
                    </Button>
                  </Link>
                ))}
                {hasPermission("report:view") && !certBlocked && (
                  <Link href={`/protocols/${id}/report`}>
                    <Button variant="outline" size="sm">
                      <FileText className="h-4 w-4 mr-1" /> Relatório ANVISA
                    </Button>
                  </Link>
                )}
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

      <Tabs value={activeTab} onValueChange={handleTabChange} className="space-y-4">
        <TabsList>
          <TabsTrigger value="info" data-testid="tab-info">Informações</TabsTrigger>
          <TabsTrigger value="lots" data-testid="tab-lots">Lotes</TabsTrigger>
          <TabsTrigger value="results" data-testid="tab-results">Resultado das Análises</TabsTrigger>
          {hasPermission("kinetics:view") && <TabsTrigger value="kinetics" data-testid="tab-kinetics">Cinética</TabsTrigger>}
          {hasPermission("methodology:view") && <TabsTrigger value="metodologia" data-testid="tab-metodologia">Metodologia</TabsTrigger>}
          {hasPermission("audit:view") && <TabsTrigger value="historico" data-testid="tab-historico"><History className="h-3.5 w-3.5 mr-1" />Histórico</TabsTrigger>}
          {hasPermission("documents:manage") && <TabsTrigger value="documentos" data-testid="tab-documentos"><Paperclip className="h-3.5 w-3.5 mr-1" />Documentos</TabsTrigger>}
          {hasPermission("references:manage") && <TabsTrigger value="referencias" data-testid="tab-referencias"><BookOpen className="h-3.5 w-3.5 mr-1" />Referências</TabsTrigger>}
          {hasPermission("versions:view") && <TabsTrigger value="versoes" data-testid="tab-versoes"><SaveAll className="h-3.5 w-3.5 mr-1" />Versões</TabsTrigger>}
          {hasPermission("anvisa:manage") && <TabsTrigger value="anvisa" data-testid="tab-anvisa"><ShieldCheck className="h-3.5 w-3.5 mr-1" />ANVISA</TabsTrigger>}
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
              {mounted("lots") && <LotsTab protocolId={numId} />}
            </CardContent>
          </Card>
        </TabsContent>
        <TabsContent value="results">
          <Card>
            <CardContent className="pt-6">
              {mounted("results") && <TabErrorBoundary tabName="Resultados" protocolId={numId}><Suspense fallback={<TabFallback />}><ResultsTab
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
              /></Suspense></TabErrorBoundary>}
            </CardContent>
          </Card>
        </TabsContent>
        {hasPermission("kinetics:view") && <TabsContent value="kinetics">
          <Card>
            <CardContent className="pt-6">
              {mounted("kinetics") && <TabErrorBoundary tabName="Cinética" protocolId={numId}><Suspense fallback={<TabFallback />}><KineticsTab
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
              /></Suspense></TabErrorBoundary>}
            </CardContent>
          </Card>
        </TabsContent>}
        {hasPermission("methodology:view") && <TabsContent value="metodologia">
          <Card>
            <CardContent className="pt-6">
              {mounted("metodologia") && <TabErrorBoundary tabName="Metodologia" protocolId={numId}><Suspense fallback={<TabFallback />}><MethodologiaTab protocolId={numId} initialCustomParamsJson={protocol.customParamsJson} protocolStatus={protocol.status} /></Suspense></TabErrorBoundary>}
            </CardContent>
          </Card>
        </TabsContent>}
        {hasPermission("audit:view") && <TabsContent value="historico">
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <History className="h-4 w-4" /> Histórico de Alterações
              </CardTitle>
            </CardHeader>
            <CardContent>
              {mounted("historico") && <AuditTrail protocolId={numId} />}
            </CardContent>
          </Card>
        </TabsContent>}
        {hasPermission("documents:manage") && <TabsContent value="documentos">
          {mounted("documentos") && <TabErrorBoundary tabName="Documentos" protocolId={numId}><Suspense fallback={<TabFallback />}><DocumentosTab protocolId={numId} /></Suspense></TabErrorBoundary>}
        </TabsContent>}
        {hasPermission("references:manage") && <TabsContent value="referencias">
          {mounted("referencias") && <TabErrorBoundary tabName="Referências" protocolId={numId}><Suspense fallback={<TabFallback />}><ReferencesTab protocolId={numId} /></Suspense></TabErrorBoundary>}
        </TabsContent>}
        {hasPermission("versions:view") && <TabsContent value="versoes">
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <SaveAll className="h-4 w-4" /> Versões Salvas
              </CardTitle>
            </CardHeader>
            <CardContent>
              {mounted("versoes") && <TabErrorBoundary tabName="Versões" protocolId={numId}><Suspense fallback={<TabFallback />}><VersionsTab protocolId={numId} /></Suspense></TabErrorBoundary>}
            </CardContent>
          </Card>
        </TabsContent>}
        {hasPermission("anvisa:manage") && <TabsContent value="anvisa">
          {mounted("anvisa") && <TabErrorBoundary tabName="ANVISA" protocolId={numId}><Suspense fallback={<TabFallback />}><AnvisaTab protocolId={numId} protocolInfo={{
            companyName: protocol.companyName,
            cnpj: protocol.cnpj,
            productName: protocol.productName,
            productType: protocol.productType ?? null,
            activeIngredients: protocol.activeIngredients ?? null,
            approvedBy: protocol.approvedBy ?? null,
            certNumber: protocol.certNumber ?? "",
          }} /></Suspense></TabErrorBoundary>}
        </TabsContent>}
      </Tabs>
    </div>
  );
}


