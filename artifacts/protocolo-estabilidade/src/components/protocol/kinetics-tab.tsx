import { useState, useRef, useEffect, useCallback, useMemo, Fragment } from "react";
import { useUnsavedChangesGuard } from "@/hooks/use-unsaved-changes-guard";
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

  // Timer para salvar kineticsOverridesJson quando a validade praticada muda via input direto
  const validityDbSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latestOverridesRef = useRef<Record<string, KineticOverride>>({});
  const latestCardValidityRef = useRef<string>("");

  const debouncedSaveKineticsValidity = useCallback((
    val: string,
    currentOverrides: Record<string, KineticOverride>,
    extraProps?: Partial<KineticsOverridesDB>,
  ) => {
    latestCardValidityRef.current = val;
    latestOverridesRef.current = currentOverrides;
    if (validityDbSaveTimer.current) clearTimeout(validityDbSaveTimer.current);
    validityDbSaveTimer.current = setTimeout(() => {
      const payload: KineticsOverridesDB = {
        savedAt: new Date().toISOString(),
        validityLocked: true,
        cardValidity: latestCardValidityRef.current,
        params: Object.fromEntries(
          Object.entries(latestOverridesRef.current).map(([param, ov]) => [param, {
            t0: ov.t0, t3: ov.t3, t6: ov.t6,
            specMin: ov.specMin, specMax: ov.specMax,
            validadePraticada: latestCardValidityRef.current,
            ichThreshold: ov.ichThreshold,
          }]),
        ),
        ...extraProps,
      };
      updateProtocol.mutate({ id: protocolId, data: { kineticsOverridesJson: JSON.stringify(payload) } });
    }, 1200);
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
    // Restore from DB synchronously (cross-device, survives localStorage clear)
    try {
      if (initialKineticsOverridesJson) {
        const db = JSON.parse(initialKineticsOverridesJson) as KineticsOverridesDB;
        if (typeof db?.cardValidity === "string" && db.cardValidity !== "") return db.cardValidity;
      }
    } catch { /* ignore */ }
    return initialValidityMonths != null ? String(initialValidityMonths) : "";
  });
  // Quando true, nenhum clique nas caixinhas pode mudar o valor — só o input manual.
  const [pendingValiditySwap, setPendingValiditySwap] = useState<{
    newValue: string;
    newBox: "standard" | "overage" | "extrap_std" | "extrap_overage";
    apply: () => void;
  } | null>(null);
  const [validitySwapPwdValue, setValiditySwapPwdValue] = useState("");
  const [validitySwapPwdError, setValiditySwapPwdError] = useState("");
  const [validitySwapPwdLoading, setValiditySwapPwdLoading] = useState(false);
  const [validitySwapPwdShow, setValiditySwapPwdShow] = useState(false);
  // Unlock direto do campo Validade Praticada via senha
  const [validityDirectEditOpen, setValidityDirectEditOpen] = useState(false);
  const [validityDirectEditPwd, setValidityDirectEditPwd] = useState("");
  const [validityDirectEditPwdError, setValidityDirectEditPwdError] = useState("");
  const [validityDirectEditPwdLoading, setValidityDirectEditPwdLoading] = useState(false);
  const [validityDirectEditPwdShow, setValidityDirectEditPwdShow] = useState(false);
  const [validityDirectEditing, setValidityDirectEditing] = useState(false); // true após senha correta

  const confirmValiditySwapPwd = async () => {
    if (!validitySwapPwdValue.trim()) return;
    setValiditySwapPwdLoading(true);
    setValiditySwapPwdError("");
    try {
      const res = await fetch("/api/auth/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: validitySwapPwdValue }),
      });
      if (res.ok) {
        // Apply the swap without calling apply() which would unlock.
        // Instead: set the new value, keep it locked, and persist to DB.
        const swapNewValue = pendingValiditySwap!.newValue;
        const swapNewBox = pendingValiditySwap!.newBox;
        setSelectedShelfBox(swapNewBox);
        setCardValidity(swapNewValue);
        validityLockedRef.current = true;
        setValidityLockedByUser(true);
        // Persist new locked value to DB immediately
        debouncedSaveKineticsValidity(swapNewValue, overrides);
        setPendingValiditySwap(null);
        setValiditySwapPwdValue("");
        setValiditySwapPwdShow(false);
      } else {
        setValiditySwapPwdError("Senha incorreta.");
        setValiditySwapPwdValue("");
      }
    } catch {
      setValiditySwapPwdError("Erro de conexão.");
    }
    setValiditySwapPwdLoading(false);
  };

  const confirmValidityDirectEditPwd = async () => {
    if (!validityDirectEditPwd.trim()) return;
    setValidityDirectEditPwdLoading(true);
    setValidityDirectEditPwdError("");
    try {
      const res = await fetch("/api/auth/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: validityDirectEditPwd }),
      });
      if (res.ok) {
        setValidityDirectEditOpen(false);
        setValidityDirectEditPwd("");
        setValidityDirectEditPwdShow(false);
        setValidityDirectEditing(true);
        // Destrava apenas temporariamente para o usuário digitar o novo valor
        validityLockedRef.current = false;
        setValidityLockedByUser(false);
      } else {
        setValidityDirectEditPwdError("Senha incorreta.");
        setValidityDirectEditPwd("");
      }
    } catch {
      setValidityDirectEditPwdError("Erro de conexão.");
    }
    setValidityDirectEditPwdLoading(false);
  };

  const [validityLockedByUser, setValidityLockedByUser] = useState<boolean>(() => {
    if (readLs().validityLockedByUser) return true;
    // Also check DB synchronously so the lock survives a page refresh on any device
    try {
      if (initialKineticsOverridesJson) {
        const db = JSON.parse(initialKineticsOverridesJson) as KineticsOverridesDB;
        if (db?.validityLocked) return true;
      }
    } catch { /* ignore */ }
    return false;
  });
  // Ref síncrono — evita stale-closure quando o usuário digita e clica imediatamente.
  // O estado React pode não ter commitado ainda, mas o ref é sempre atual.
  const validityLockedRef = useRef<boolean>(
    readLs().validityLockedByUser ? true : (() => {
      try {
        if (initialKineticsOverridesJson) {
          const db = JSON.parse(initialKineticsOverridesJson) as KineticsOverridesDB;
          return !!db?.validityLocked;
        }
      } catch { /* ignore */ }
      return false;
    })(),
  );
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

    // Include t0/t3/t6 so localStorage-only edits (not yet saved to DB) survive HMR remount.
    type SavedPartial = Partial<KineticOverride>;
    let savedOverrides: Record<string, SavedPartial> = {};
    let savedManualFields: Record<string, string[]> = {};
    let savedCustomShelfLife = "";
    let savedCardValidity = "";
    let hasLocalData = false;
    let dbOverrides: KineticsOverridesDB | null = null;
    try {
      const stored = readLs();
      if (stored.overrides) { savedOverrides = stored.overrides; hasLocalData = true; }
      if (stored.manualFields) savedManualFields = stored.manualFields;
      if (stored.customShelfLife != null) savedCustomShelfLife = stored.customShelfLife;
      if (typeof stored.cardValidity === "string") savedCardValidity = stored.cardValidity;
    } catch { /* ignore */ }
    try {
      if (initialKineticsOverridesJson) {
        dbOverrides = JSON.parse(initialKineticsOverridesJson) as KineticsOverridesDB;
        if (dbOverrides?.customShelfLife) savedCustomShelfLife = dbOverrides.customShelfLife;
        // Restaura trava de validade e cardValidity do banco (cross-device)
        if (dbOverrides?.validityLocked) {
          validityLockedRef.current = true;
          setValidityLockedByUser(true);
        }
        if (dbOverrides?.cardValidity && !savedCardValidity) {
          savedCardValidity = dbOverrides.cardValidity;
        }
      }
    } catch { /* ignore */ }

    // When no user-set validity exists (neither in localStorage nor DB), fall back
    // to the kinetics-recommended value so overage can be calculated immediately.
    const kineticsFallback = (kinetics as any).recommendedValidityMonths != null
      ? String((kinetics as any).recommendedValidityMonths) : "";
    const effectiveCardValidity = savedCardValidity || kineticsFallback;

    const next: Record<string, KineticOverride> = {};
    const hydratedManualFields: Record<string, string[]> = {};
    for (const p of kinetics.parameters) {
      const base = buildKineticOverride(p);
      const saved = savedOverrides[p.parameter] ?? {};
      const dbParam = dbOverrides?.params?.[p.parameter];

      // ichThreshold: ALWAYS use the fresh API value — never let a stale DB/localStorage
      // value (e.g. saved when the default was 80%) override the current system default.
      const ichThreshold = base.ichThreshold;

      // T0/T3/T6: MERGE DB manual fields with localStorage manual fields so that:
      //   • Fields saved to DB survive cross-device / page-refresh scenarios.
      //   • Fields edited locally (not yet saved to DB) survive HMR remount.
      // Neither layer is given exclusive precedence — the union of both is used.
      const lsManualFields = savedManualFields[p.parameter] ?? [];
      const dbManualFields = dbParam?.manualFields ?? [];
      const effectiveManualFields = Array.from(new Set([...dbManualFields, ...lsManualFields]));
      const anyManualTxT = effectiveManualFields.some(f => ["t0", "t3", "t6"].includes(f));
      // Value priority for manually-edited fields: localStorage (unsaved edit) > DB > API base.
      // This ensures a fresh unsaved edit isn't overwritten by an older DB-saved value on remount.
      const t0 = effectiveManualFields.includes("t0")
        ? (saved.t0 || dbParam?.t0 || base.t0)
        : base.t0;
      const t3 = effectiveManualFields.includes("t3")
        ? (saved.t3 || dbParam?.t3 || base.t3)
        : base.t3;
      const t6 = effectiveManualFields.includes("t6")
        ? (saved.t6 || dbParam?.t6 || base.t6)
        : base.t6;

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
      // Track the merged manual-fields set so setManualFields below reflects both layers.
      if (effectiveManualFields.length > 0) hydratedManualFields[p.parameter] = effectiveManualFields;
    }
    setOverrides(next);
    // Hydrate manualFields React state from the merged DB+localStorage set so that:
    //   1. T-field highlights are correct in the UI after remount.
    //   2. saveOverridesToDb() writes the full merged manualFields metadata, not stale DB-only data.
    setManualFields(hydratedManualFields);
    setCustomShelfLife(savedCustomShelfLife);
    // Auto-fill only when user never manually locked the field.
    if (effectiveCardValidity && !validityLockedByUser) {
      setCardValidity(cv => cv || effectiveCardValidity);
    }
    // Restore dirty flag: if localStorage has unsaved overrides (i.e. changes not yet
    // committed to DB), mark as dirty so the save button remains visible after HMR remount.
    if (hasLocalData) setIsDirty(true);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kinetics, LS_KEY]);

  const persistOverrides = (
    next: Record<string, KineticOverride>,
    shelf = customShelfLife,
    cv = cardValidity,
    obs = kineticsObs,
    // Pass manualFields explicitly from the caller when the state update hasn't committed
    // yet (avoids stale-closure race in applyFieldChange).
    mf = manualFields,
  ) => {
    try {
      localStorage.setItem(LS_KEY, JSON.stringify({ overrides: next, customShelfLife: shelf, cardValidity: cv, kineticsObs: obs, selectedShelfBox: selectedShelfBox ?? undefined, validityLockedByUser, manualFields: mf }));
    } catch { /* ignore */ }
  };

  const applyShelfToValidade = (valStr: string, box?: "standard" | "overage" | "extrap_std" | "extrap_overage") => {
    // Se o usuário fixou a validade manualmente, apenas atualiza o indicador "Origem" — nunca muda o valor.
    if (validityLockedRef.current || validityLockedByUser) {
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
    // Compute the next manualFields eagerly (before setState commits) so persistOverrides
    // can write the correct value to localStorage in the same microtask — avoiding the
    // stale-closure race where setManualFields hasn't flushed yet.
    let nextManualFields = manualFields;
    if (field === "t0" || field === "t3" || field === "t6") {
      const existing = manualFields[param] ?? [];
      if (!existing.includes(field)) {
        nextManualFields = { ...manualFields, [param]: [...existing, field] };
      }
      setManualFields(nextManualFields);
    }
    setOverrides((prev) => {
      const ov = { ...prev[param], [field]: val };
      if (["t0", "t3", "t6", "ichThreshold"].includes(field)) {
        const computed = calcKineticOverride(ov.t0, ov.t3, ov.t6, ov.ichThreshold);
        Object.assign(ov, computed);
      }
      const next = { ...prev, [param]: ov };
      persistOverrides(next, customShelfLife, cardValidity, kineticsObs, nextManualFields);
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
    validityLockedRef.current = false;
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
    const isLocked = validityLockedRef.current || validityLockedByUser;
    const payload: KineticsOverridesDB = {
      savedAt: new Date().toISOString(),
      params: {},
      customShelfLife: customShelfLife || undefined,
      selectedShelfBox: selectedShelfBox ?? undefined,
      // Always preserve the validity lock so it survives Save
      validityLocked: isLocked || undefined,
      cardValidity: isLocked ? cardValidity : undefined,
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

  return (<>
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
                    if (validityLockedRef.current || validityLockedByUser) {
                      setPendingValiditySwap({
                        newValue: stdVal,
                        newBox: "standard",
                        apply: () => {
                          validityLockedRef.current = false;
                          setValidityLockedByUser(false);
                          const changing2 = selectedShelfBox !== "standard";
                          setSelectedShelfBox("standard");
                          if (changing2 && stdVal) applyShelfToValidade(stdVal, "standard");
                          else if (!changing2) applyShelfToValidade(cardValidity, "standard");
                        },
                      });
                      return;
                    }
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
                    if (validityLockedRef.current || validityLockedByUser) {
                      setPendingValiditySwap({
                        newValue: overageVal,
                        newBox: "overage",
                        apply: () => {
                          validityLockedRef.current = false;
                          setValidityLockedByUser(false);
                          const changing2 = selectedShelfBox !== "overage";
                          setSelectedShelfBox("overage");
                          if (changing2) applyShelfToValidade(overageVal, "overage");
                          else applyShelfToValidade(cardValidity, "overage");
                        },
                      });
                      return;
                    }
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
                  {limitingBaselineParam && (
                    <div className="mt-2 inline-flex items-center gap-1.5 bg-blue-100 border border-blue-300 rounded-md px-2.5 py-1">
                      <span className="text-blue-600 text-xs">⚠</span>
                      <span className="text-xs font-semibold text-blue-800">Item limitante:</span>
                      <span className="text-xs font-bold text-blue-900">{limitingBaselineParam}</span>
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
              <p className="text-xs text-green-700 font-medium uppercase tracking-wide mb-1 flex items-center gap-1 justify-end">
                Validade Praticada
                {validityLockedByUser && !validityDirectEditing && (
                  <Lock className="h-3 w-3 text-green-700 shrink-0" />
                )}
              </p>
              <div className="flex items-center gap-2 justify-end">
                {/* Campo travado: exibe o valor + botão cadeado para editar com senha */}
                {validityLockedByUser && !validityDirectEditing ? (
                  <div className="flex items-center gap-1">
                    <span className="w-20 text-2xl font-bold text-green-800 bg-green-100 border border-green-300 rounded px-2 py-0.5 text-right tabular-nums inline-block">
                      {cardValidity || "—"}
                    </span>
                    <button
                      type="button"
                      title="Alterar validade (requer senha)"
                      onClick={() => {
                        setValidityDirectEditOpen(true);
                        setValidityDirectEditPwd("");
                        setValidityDirectEditPwdError("");
                        setValidityDirectEditPwdShow(false);
                      }}
                      className="p-1 rounded hover:bg-green-200 text-green-700 transition-colors"
                    >
                      <Lock className="h-4 w-4" />
                    </button>
                  </div>
                ) : (
                  <input
                    autoFocus={validityDirectEditing}
                    value={cardValidity}
                    onChange={(e) => {
                      // Safety net: se o campo está travado e o usuário não desbloqueou via senha,
                      // bloqueia a edição e abre o diálogo de senha.
                      if ((validityLockedByUser || validityLockedRef.current) && !validityDirectEditing) {
                        setValidityDirectEditOpen(true);
                        setValidityDirectEditPwd("");
                        setValidityDirectEditPwdError("");
                        setValidityDirectEditPwdShow(false);
                        return;
                      }
                      // Enquanto digita: só atualiza o valor. O ref impede cliques nas caixinhas.
                      // O estado de trava (validityLockedByUser) só é aplicado no onBlur.
                      const val = e.target.value;
                      validityLockedRef.current = true; // bloqueia caixinhas durante digitação
                      setCardValidity(val);
                      setIsDirty(true);
                    }}
                    onBlur={(e) => {
                      const val = e.target.value;
                      if (!val.trim()) { setValidityDirectEditing(false); return; }
                      // Ao sair do campo: trava o estado e persiste
                      validityLockedRef.current = true;
                      setValidityLockedByUser(true);
                      setValidityDirectEditing(false);
                      const nextOvs: Record<string, KineticOverride> = {};
                      setOverrides(prev => {
                        for (const [key, ov] of Object.entries(prev)) {
                          nextOvs[key] = { ...ov, validadePraticada: val };
                        }
                        return nextOvs;
                      });
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
                      debouncedSaveKineticsValidity(val, nextOvs);
                    }}
                    className="w-20 text-2xl font-bold text-green-800 bg-green-100 border border-green-300 rounded px-2 py-0.5 focus:outline-none focus:ring-2 focus:ring-green-500 text-right"
                    placeholder="—"
                  />
                )}
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
                      if (validityLockedRef.current || validityLockedByUser) {
                        setPendingValiditySwap({
                          newValue: extrapVal,
                          newBox: "extrap_std",
                          apply: () => {
                            validityLockedRef.current = false;
                            setValidityLockedByUser(false);
                            const changing2 = selectedShelfBox !== "extrap_std";
                            setSelectedShelfBox("extrap_std");
                            if (changing2) applyShelfToValidade(extrapVal, "extrap_std");
                            else applyShelfToValidade(cardValidity, "extrap_std");
                          },
                        });
                        return;
                      }
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
                      if (validityLockedRef.current || validityLockedByUser) {
                        setPendingValiditySwap({
                          newValue: extrapOvVal,
                          newBox: "extrap_overage",
                          apply: () => {
                            validityLockedRef.current = false;
                            setValidityLockedByUser(false);
                            const changing2 = selectedShelfBox !== "extrap_overage";
                            setSelectedShelfBox("extrap_overage");
                            if (changing2) applyShelfToValidade(extrapOvVal, "extrap_overage");
                            else applyShelfToValidade(cardValidity, "extrap_overage");
                          },
                        });
                        return;
                      }
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
                    {limitingBaselineParam && (
                      <div className="mt-2 inline-flex items-center gap-1.5 bg-amber-100 border border-amber-300 rounded-md px-2.5 py-1">
                        <span className="text-amber-600 text-xs">⚠</span>
                        <span className="text-xs font-semibold text-amber-800">Item limitante:</span>
                        <span className="text-xs font-bold text-amber-900">{limitingBaselineParam}</span>
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
                    autoComplete="off"
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

    {/* Modal de senha — Edição direta da Validade Praticada */}
    {validityDirectEditOpen && (
      <div
        className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
        onClick={() => { setValidityDirectEditOpen(false); setValidityDirectEditPwd(""); setValidityDirectEditPwdError(""); }}
      >
        <div className="bg-white rounded-lg shadow-xl w-96 p-5 space-y-4" onClick={e => e.stopPropagation()}>
          <div className="flex items-center gap-2">
            <Lock className="h-5 w-5 text-green-700 shrink-0" />
            <p className="font-semibold text-sm">Alterar Validade Praticada</p>
          </div>
          <div className="rounded-md border border-green-200 bg-green-50 px-3 py-2 text-xs text-green-800">
            <p>Valor atual: <span className="font-bold">{cardValidity || "—"} meses</span></p>
          </div>
          <p className="text-xs text-muted-foreground">
            A Validade Praticada está protegida. Digite a senha mestra para liberar a edição direta.
          </p>
          <div className="relative">
            <input
              type={validityDirectEditPwdShow ? "text" : "password"}
              value={validityDirectEditPwd}
              onChange={e => { setValidityDirectEditPwd(e.target.value); setValidityDirectEditPwdError(""); }}
              onKeyDown={e => {
                if (e.key === "Enter") confirmValidityDirectEditPwd();
                if (e.key === "Escape") { setValidityDirectEditOpen(false); setValidityDirectEditPwd(""); setValidityDirectEditPwdError(""); }
              }}
              placeholder="Senha mestra"
              autoFocus
              autoComplete="off"
              className="w-full border border-border rounded px-3 py-1.5 text-sm pr-9 focus:outline-none focus:ring-1 focus:ring-primary"
            />
            <button type="button" onClick={() => setValidityDirectEditPwdShow(s => !s)} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground">
              {validityDirectEditPwdShow ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
          {validityDirectEditPwdError && <p className="text-xs text-destructive font-medium -mt-2">{validityDirectEditPwdError}</p>}
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => { setValidityDirectEditOpen(false); setValidityDirectEditPwd(""); setValidityDirectEditPwdError(""); }}
              className="text-xs px-3 py-1.5 rounded border border-border hover:bg-muted"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={confirmValidityDirectEditPwd}
              disabled={validityDirectEditPwdLoading || !validityDirectEditPwd.trim()}
              className="text-xs px-3 py-1.5 rounded bg-green-700 text-white hover:bg-green-800 disabled:opacity-50"
            >
              {validityDirectEditPwdLoading ? "Verificando…" : "Liberar edição"}
            </button>
          </div>
        </div>
      </div>
    )}

    {/* Modal de senha — Validade Praticada digitada manualmente está protegida */}
    {!!pendingValiditySwap && (
      <div
        className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
        onClick={() => { setPendingValiditySwap(null); setValiditySwapPwdValue(""); setValiditySwapPwdError(""); }}
      >
        <div className="bg-white rounded-lg shadow-xl w-96 p-5 space-y-4" onClick={e => e.stopPropagation()}>
          <div className="flex items-center gap-2">
            <Lock className="h-5 w-5 text-amber-600 shrink-0" />
            <p className="font-semibold text-sm">Alterar Validade Praticada</p>
          </div>
          <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800 space-y-1">
            <p>Valor atual (digitado manualmente): <span className="font-bold">{cardValidity} meses</span></p>
            <p>Novo valor (calculado): <span className="font-bold">{pendingValiditySwap.newValue} meses</span></p>
          </div>
          <p className="text-xs text-muted-foreground">
            A Validade Praticada foi definida manualmente e está protegida. Digite a senha mestra para substituí-la pelo valor calculado.
          </p>
          <div className="relative">
            <input
              type={validitySwapPwdShow ? "text" : "password"}
              value={validitySwapPwdValue}
              onChange={e => { setValiditySwapPwdValue(e.target.value); setValiditySwapPwdError(""); }}
              onKeyDown={e => {
                if (e.key === "Enter") confirmValiditySwapPwd();
                if (e.key === "Escape") { setPendingValiditySwap(null); setValiditySwapPwdValue(""); setValiditySwapPwdError(""); }
              }}
              placeholder="Senha mestra"
              autoFocus
              className="w-full border border-border rounded px-3 py-1.5 text-sm pr-9 focus:outline-none focus:ring-1 focus:ring-primary"
            />
            <button type="button" onClick={() => setValiditySwapPwdShow(s => !s)} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground">
              {validitySwapPwdShow ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
          {validitySwapPwdError && <p className="text-xs text-destructive font-medium -mt-2">{validitySwapPwdError}</p>}
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => { setPendingValiditySwap(null); setValiditySwapPwdValue(""); setValiditySwapPwdError(""); }}
              className="text-xs px-3 py-1.5 rounded border border-border hover:bg-muted"
            >
              Cancelar — manter {cardValidity} meses
            </button>
            <button
              type="button"
              onClick={confirmValiditySwapPwd}
              disabled={validitySwapPwdLoading || !validitySwapPwdValue.trim()}
              className="text-xs px-3 py-1.5 rounded bg-primary text-white hover:bg-primary/80 disabled:opacity-50"
            >
              {validitySwapPwdLoading ? "Verificando…" : `Confirmar → ${pendingValiditySwap.newValue} meses`}
            </button>
          </div>
        </div>
      </div>
    )}
  </>);
}

type MethodologyDialogState =
  | { mode: "closed" }
  | { mode: "create" }
  | { mode: "edit"; id: number; shortName: string; citation: string; category: string; subject: string; parameter: string; criteria: string };


export { KineticsTab };
