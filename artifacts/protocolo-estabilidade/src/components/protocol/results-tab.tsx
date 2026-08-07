import { useState, useRef, useEffect, useCallback, useMemo, Fragment } from "react";
import { UnlockDialog } from "@/components/unlock-dialog";
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
import { AuditBadge } from "@/components/audit-badge";
import { useToast } from "@/hooks/use-toast";
import { useLabelOverrides } from "@/hooks/use-label-overrides";
import { useAuth } from "@/contexts/use-auth";
import type { ActiveCell, EditableParam, KineticOverride, KineticApiParam, KineticsOverridesDB, CatalogEntry, ProductTemplateParam, ProductTemplate } from "./shared";
import { STATUS_LABELS, STATUS_COLORS, RESULT_STATUS_COLORS, ANALYSIS_PARAMETERS, MICRO_PARAMS_CAPSULA, MICRO_PARAMS_PO, PERIODS, lotSchema, finalizeSchema, isToday, getDefaultParams, PARAM_CATALOG_KEY, getCatalogEntries, addToCatalog, getParamsForMethodology, getPresetsForCategory, normalizeSearch, PRODUCT_TEMPLATES, CATEGORY_PRESETS, parseCriterionRange, calcKineticOverride, calcMedia, buildKineticOverride } from "./shared";
import { ParamMethodSelector } from "./param-method-selector";
import { InlineCell } from "./inline-cell";

function ResultsTab({ protocolId, isPowder, initialCustomParamsJson, initialPeriodDatesJson, initialParamMethodsJson, initialParamMethodsCitationsJson, protocolFinalStatus, protocolStatus, initialAtivoLimitsJson, initialKineticsOverridesJson, recommendedKineticsOverages, onAtivoLimitsSync }: { protocolId: number; isPowder?: boolean; initialCustomParamsJson?: string | null; initialPeriodDatesJson?: string | null; initialParamMethodsJson?: string | null; initialParamMethodsCitationsJson?: string | null; protocolFinalStatus?: string | null; protocolStatus?: string | null; initialAtivoLimitsJson?: string | null; initialKineticsOverridesJson?: string | null; recommendedKineticsOverages?: Record<string, number>; onAtivoLimitsSync?: (json: string) => void }) {
  const protocolIsAR = protocolFinalStatus === "aprovado_com_ressalva";
  const isCriterionLocked = false; // critério sempre editável — aprovação não bloqueia
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

  const setAtivoLimit = (param: string, field: "min" | "max" | "unit" | "declared" | "overage" | "norma", value: string, options?: { skipBankSync?: boolean }) => {
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
    if (!options?.skipBankSync && (field === "min" || field === "max" || field === "unit" || field === "overage" || field === "norma")) {
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

  // ── T0 médio bruto por parâmetro ativo (em unidade de medida, não %) ─────
  const t0RawAvgByParam = useMemo<Record<string, number | null>>(() => {
    const ativoNames = new Set(
      editableParams.filter(p => p.category === "teor_ativo").map(p => p.parameter)
    );
    const out: Record<string, number | null> = {};
    for (const name of ativoNames) {
      const vals = results
        .filter(r => r.period === 0 && r.parameter === name)
        .map(r => r.numericResult ?? parseFloat((r.result ?? "").replace(",", ".")))
        .filter(v => !isNaN(v) && v > 0);
      out[name] = vals.length > 0 ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
    }
    return out;
  }, [results, editableParams]);

  // Ref para evitar loop: rastreia o último overage auto-aplicado por parâmetro
  const lastAutoOvgRef = useRef<Record<string, string>>({});

  // Auto-aplica overage implícito quando T0 médio > 100%
  // Os resultados já são percentuais (ex: 104.25 = 104,25% da qty declarada)
  useEffect(() => {
    for (const [paramName, rawAvg] of Object.entries(t0RawAvgByParam)) {
      if (rawAvg === null) continue;
      const pct = rawAvg; // já é % — não dividir por declared
      if (pct > 100) {
        const newOvg = (pct - 100).toFixed(2);
        if (lastAutoOvgRef.current[paramName] !== newOvg) {
          lastAutoOvgRef.current[paramName] = newOvg;
          // skipBankSync: overage auto-computado pelo T0 não deve sobrescrever o banco de referências
          setAtivoLimit(paramName, "overage", newOvg, { skipBankSync: true });
        }
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [t0RawAvgByParam]);

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
        // Banco só preenche overage se ainda está vazio — nunca sobrescreve valor já definido
        // (T0 auto-fill ou entrada manual têm prioridade sobre o padrão do banco)
        overage:  (ref.overage != null && !existing.overage) ? ref.overage : existing.overage,
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
  const [showPureza, setShowPureza] = useState(false);
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
  const lastParamNameChangeRef = useRef<{ uid: string; prevName: string; currentName: string } | null>(null);
  const paramNameUndoTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const undoParamNameHandlerRef = useRef<() => void>(() => {});
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
      if ((e.ctrlKey || e.metaKey) && e.key === 'z') {
        if (lastRemovedParamRef.current) {
          e.preventDefault();
          undoHandlerRef.current();
        } else if (lastParamNameChangeRef.current) {
          e.preventDefault();
          undoParamNameHandlerRef.current();
        }
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
      // Upsert under new name first; delete old record ONLY after upsert succeeds
      // (previously delete fired in parallel — race condition that lost data)
      const resultId = r.id;
      renameUpsert.mutate(
        {
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
        },
        {
          onSuccess: () => {
            // Delete old record only after new one is safely stored
            if (resultId) renameDelete.mutate({ id: protocolId, resultId });
          },
        },
      );
    }

    // Also rename key in kineticsOverridesJson so T0/T3/T6 overrides survive the rename
    if (initialKineticsOverridesJson) {
      try {
        const kov = JSON.parse(initialKineticsOverridesJson) as {
          savedAt?: string;
          params?: Record<string, unknown>;
          customShelfLife?: string;
          selectedShelfBox?: string;
        };
        if (kov.params && Object.prototype.hasOwnProperty.call(kov.params, oldName)) {
          const entry = kov.params[oldName];
          const updatedParams = { ...kov.params };
          delete updatedParams[oldName];
          updatedParams[newName] = entry;
          updateProtocol.mutate({
            id: protocolId,
            data: { kineticsOverridesJson: JSON.stringify({ ...kov, params: updatedParams }) },
          });
        }
      } catch {
        // JSON malformado — ignora
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [protocolId, results, initialKineticsOverridesJson]);

  useEffect(() => {
    if (!isMountedParamsRef.current) {
      isMountedParamsRef.current = true;
      return;
    }
    const timer = setTimeout(() => {
      const newJson = JSON.stringify(editableParams);
      updateProtocol.mutate({ id: protocolId, data: { customParamsJson: newJson } });
      // Atualiza o cache para que ao voltar à aba o critério persista sem refetch
      queryClient.setQueryData(
        getGetProtocolQueryKey(protocolId),
        (old: Record<string, unknown> | undefined) => old ? { ...old, customParamsJson: newJson } : old,
      );
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

  // ── Save-now: ref sempre atualizado + listener para o evento do botão Salvar ──
  const saveNowResultsRef = useRef({ editableParams, periodDates, paramMethods, paramMethodsCitations });
  useEffect(() => {
    saveNowResultsRef.current = { editableParams, periodDates, paramMethods, paramMethodsCitations };
  }, [editableParams, periodDates, paramMethods, paramMethodsCitations]);
  useEffect(() => {
    const onSaveNow = () => {
      const { editableParams, periodDates, paramMethods, paramMethodsCitations } = saveNowResultsRef.current;
      const customParamsJson = JSON.stringify(editableParams);
      const periodDatesJson = JSON.stringify(periodDates);
      const paramMethodsJson = JSON.stringify(paramMethods);
      const paramMethodsCitationsJson = JSON.stringify(paramMethodsCitations);
      updateProtocol.mutate({ id: protocolId, data: { customParamsJson, periodDatesJson, paramMethodsJson, paramMethodsCitationsJson } });
      queryClient.setQueryData(
        getGetProtocolQueryKey(protocolId),
        (old: Record<string, unknown> | undefined) => old ? { ...old, customParamsJson, periodDatesJson, paramMethodsJson, paramMethodsCitationsJson } : old,
      );
    };
    window.addEventListener('protocol:save-now', onSaveNow);
    return () => window.removeEventListener('protocol:save-now', onSaveNow);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const updateParam = (uid: string, field: "parameter" | "criterion", val: string) => {
    setEditableParams((prev) => prev.map((p) => (p.uid === uid ? { ...p, [field]: val } : p)));
  };

  undoParamNameHandlerRef.current = () => {
    if (!lastParamNameChangeRef.current) return;
    const { uid, prevName, currentName } = lastParamNameChangeRef.current;
    lastParamNameChangeRef.current = null;
    if (paramNameUndoTimerRef.current) { clearTimeout(paramNameUndoTimerRef.current); paramNameUndoTimerRef.current = null; }
    updateParam(uid, "parameter", prevName);
    renameResultParam(currentName, prevName);
    toast({ title: "Nome restaurado", description: prevName ? `Revertido para "${prevName}".` : "Nome revertido." });
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
                  <table className="text-xs w-full [&_td]:align-top [&_th]:align-top">
                    <thead>
                      <tr className="text-indigo-600 font-medium border-b border-indigo-200">
                        <th className="text-left pr-3 pb-1.5">Ativo</th>
                        <th className="text-right pr-2 pb-1.5 w-28">Qtd declarada</th>
                        <th className="text-right pr-2 pb-1.5 w-24">
                          Overage
                          <span className="block text-[9px] font-normal text-indigo-400 normal-case">% (opcional)</span>
                        </th>
                        <th className="text-right pr-2 pb-1.5 w-28">
                          Mín. ANVISA
                          <span className="block text-[9px] font-normal text-indigo-400 normal-case">opcional</span>
                        </th>
                        <th className="text-right pr-2 pb-1.5 w-28">
                          Máx. ANVISA
                          <span className="block text-[9px] font-normal text-indigo-400 normal-case">opcional</span>
                        </th>
                        <th className="text-left pr-2 pb-1.5 w-32">
                          Norma
                          <span className="block text-[9px] font-normal text-indigo-400 normal-case">salva no banco</span>
                        </th>
                        <th className="text-left pb-1.5 pl-1 w-20">Unidade</th>
                        <th className="text-left pb-1.5 pl-2 w-16"></th>
                        <th className="text-right pb-1.5 pl-3 w-28 border-l border-indigo-200">
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
                              {/* ── Indicador T0 → overage implícito ── */}
                              {(() => {
                                const t0Pct = t0RawAvgByParam[param.parameter];
                                if (t0Pct === null || t0Pct === undefined || t0Pct <= 100) return null;
                                const implOvg = t0Pct - 100;
                                return (
                                  <span
                                    className="block text-[9px] text-orange-600 font-semibold text-right mt-0.5"
                                    title={`T0 médio = ${t0Pct.toFixed(2)}% da qtd declarada → overage implícito de ${implOvg.toFixed(2)}% detectado e aplicado automaticamente`}
                                  >
                                    ⬆ T0: {t0Pct.toFixed(2)}% (+{implOvg.toFixed(2)}% auto)
                                  </span>
                                );
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
                              {/* Mín. efetivo com overage */}
                              {(() => {
                                const minNum = parseFloat(lim.min.replace(",", "."));
                                const ovgNum = parseFloat(lim.overage.replace(",", "."));
                                if (isNaN(minNum) || isNaN(ovgNum) || ovgNum <= 0) return null;
                                const effMin = minNum * (1 + ovgNum / 100);
                                return (
                                  <span
                                    className="block text-[9px] text-indigo-500 text-right mt-0.5"
                                    title={`Mín. efetivo = ${lim.min} × (1 + ${ovgNum}%) considerando overage`}
                                  >
                                    c/ ovg: ≥{effMin % 1 === 0 ? effMin : effMin.toFixed(2)} {lim.unit}
                                  </span>
                                );
                              })()}
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

                {/* ── Painel de Pureza Elementar / Correção Estequiométrica ── */}
                {(() => {
                  const ativosComPureza = catParams
                    .map(p => ({ param: p, bankRef: ativoRefs.find(r => r.parameter === p.parameter) }))
                    .filter(({ bankRef }) => bankRef?.pureza);
                  if (ativosComPureza.length === 0) return null;
                  return (
                    <div className="mt-3 rounded-md border border-violet-200 bg-violet-50 p-3">
                      <button
                        type="button"
                        onClick={() => setShowPureza(v => !v)}
                        className="flex items-center gap-2 w-full text-left group"
                      >
                        <span className="text-xs font-semibold text-violet-700 uppercase tracking-wide">
                          % Pureza Elementar — Correção Estequiométrica
                        </span>
                        <span className="text-[9px] bg-violet-100 text-violet-600 border border-violet-200 rounded px-1.5 py-0 font-semibold">
                          ≠ overage
                        </span>
                        <span className="ml-auto text-[10px] text-violet-500 group-hover:text-violet-700 transition-colors">
                          {showPureza ? "▲ ocultar" : "▼ ver detalhes"}
                        </span>
                      </button>
                      {showPureza && (
                      <>
                      <p className="text-[10px] text-violet-600 mb-2 mt-2">
                        A pureza indica quanto do composto é nutriente elementar (ex: CaCO₃ tem ~40% de Ca).
                        <strong> Qtd de composto = Declarada ÷ (Pureza / 100).</strong> Não é overage — é correção da estequiometria do composto.
                      </p>
                      <div className="overflow-x-auto">
                        <table className="text-xs w-full">
                          <thead>
                            <tr className="text-violet-600 font-medium border-b border-violet-200">
                              <th className="text-left pr-4 pb-1.5">Ativo</th>
                              <th className="text-right pr-4 pb-1.5">% Pureza elementar</th>
                              <th className="text-right pr-4 pb-1.5">Qtd declarada</th>
                              <th className="text-right pb-1.5">Qtd composto necessária</th>
                            </tr>
                          </thead>
                          <tbody>
                            {ativosComPureza.map(({ param, bankRef }) => {
                              const lim = ativoLimits[param.parameter] ?? { declared: "", unit: "mg" };
                              const pct = parseFloat((bankRef!.pureza ?? "").replace(",", "."));
                              const declared = parseFloat(lim.declared.replace(",", "."));
                              const valid = !isNaN(pct) && pct > 0 && pct <= 100 && !isNaN(declared) && declared > 0;
                              const qtdComposto = valid ? declared / (pct / 100) : null;
                              return (
                                <tr key={param.parameter} className="border-t border-violet-100">
                                  <td className="pr-4 py-1.5 font-medium text-violet-900">
                                    {param.parameter}
                                  </td>
                                  <td className="pr-4 py-1.5 text-right font-mono font-semibold text-violet-700">
                                    {bankRef!.pureza}%
                                  </td>
                                  <td className="pr-4 py-1.5 text-right font-mono text-slate-600">
                                    {lim.declared ? `${lim.declared} ${lim.unit}` : <span className="text-slate-300">— sem declarada</span>}
                                  </td>
                                  <td className="py-1.5 text-right">
                                    {qtdComposto !== null ? (
                                      <span className="font-mono font-semibold text-violet-800">
                                        {qtdComposto % 1 === 0 ? qtdComposto : qtdComposto.toFixed(2)} {lim.unit} de composto
                                      </span>
                                    ) : (
                                      <span className="text-slate-300 text-[10px]">informe a qtd declarada</span>
                                    )}
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                      </>
                      )}
                    </div>
                  );
                })()}

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
                                        // Renomeia sempre — nunca apaga dados de T0/T3/T6
                                        renameResultParam(orig, param.parameter);
                                        if (paramNameUndoTimerRef.current) clearTimeout(paramNameUndoTimerRef.current);
                                        lastParamNameChangeRef.current = { uid: param.uid, prevName: orig, currentName: param.parameter };
                                        paramNameUndoTimerRef.current = setTimeout(() => { lastParamNameChangeRef.current = null; }, 10000);
                                        toast({ title: "Nome alterado", description: "Resultados mantidos. Pressione Ctrl+Z para desfazer (10s)" });
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
                                otherPeriods={PERIODS.filter(p => p !== period).map(p => ({
                                  period: p,
                                  result: getResult(lot.id, p, param.parameter),
                                  date: periodDates[p] || undefined,
                                }))}
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


export { ResultsTab };
