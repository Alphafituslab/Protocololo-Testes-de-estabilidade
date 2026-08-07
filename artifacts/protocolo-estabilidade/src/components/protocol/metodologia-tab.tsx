import { useState, useRef, useEffect, useCallback, useMemo, Fragment } from "react";

type MethodologyDialogState =
  | { mode: "closed" }
  | { mode: "create" }
  | { mode: "edit"; id: number; shortName: string; citation: string; category: string; subject: string; parameter: string; criteria: string };
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

function MethodologiaTab({
  protocolId,
  initialCustomParamsJson,
  protocolStatus,
}: {
  protocolId: number;
  initialCustomParamsJson?: string | null;
  protocolStatus?: string | null;
}) {
  const isCriterionLocked = false; // critério sempre editável — aprovação não bloqueia
  const [criterionConfirmPending, setCriterionConfirmPending] = useState<{
    applyFn: (replace: boolean) => void;
    currentCriterion: string; newCriterion: string;
    paramName: string; methodName: string;
  } | null>(null);
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { data: methodologies = [], isLoading } = useListMethodologies();
  const { data: ativoRefsLib = [] } = useListAtivoReferences({ query: { queryKey: getListAtivoReferencesQueryKey(), staleTime: 0 } });
  const { data: allProtocols = [] } = useListProtocols();
  const updateProtocol = useUpdateProtocol();
  // pendingDelete: metodologia a remover + lista de protocolos que a usam
  const [pendingDelete, setPendingDelete] = useState<{
    id: number; shortName: string; usedBy: string[];
  } | null>(null);
  const [deleteMethPwd, setDeleteMethPwd] = useState("");
  const [deleteMethPwdError, setDeleteMethPwdError] = useState("");
  const [deleteMethPwdLoading, setDeleteMethPwdLoading] = useState(false);
  const [deleteMethPwdShow, setDeleteMethPwdShow] = useState(false);

  const confirmDeleteMethodology = async () => {
    if (!pendingDelete || !deleteMethPwd.trim()) return;
    setDeleteMethPwdLoading(true);
    setDeleteMethPwdError("");
    try {
      const res = await fetch("/api/auth/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: deleteMethPwd }),
      });
      if (res.ok) {
        deleteMutation.mutate({ id: pendingDelete.id });
        setPendingDelete(null);
        setDeleteMethPwd("");
        setDeleteMethPwdError("");
        setDeleteMethPwdShow(false);
      } else {
        setDeleteMethPwdError("Senha incorreta.");
        setDeleteMethPwd("");
      }
    } catch {
      setDeleteMethPwdError("Erro de conexão.");
    }
    setDeleteMethPwdLoading(false);
  };
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

  // ── Save-now: ref sempre atualizado + listener para o evento do botão Salvar ──
  const saveNowMetodRef = useRef({ editableParams });
  useEffect(() => { saveNowMetodRef.current = { editableParams }; }, [editableParams]);
  useEffect(() => {
    const onSaveNow = () => {
      const { editableParams } = saveNowMetodRef.current;
      const customParamsJson = JSON.stringify(editableParams);
      updateProtocol.mutate({ id: protocolId, data: { customParamsJson } });
      queryClient.setQueryData(
        getGetProtocolQueryKey(protocolId),
        (old: Record<string, unknown> | undefined) => old ? { ...old, customParamsJson } : old,
      );
    };
    window.addEventListener('protocol:save-now', onSaveNow);
    return () => window.removeEventListener('protocol:save-now', onSaveNow);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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

  // ── Dialog edição inline de metodologia do parâmetro ─────────────
  const [editParamMethod, setEditParamMethod] = useState<{
    uid: string; paramName: string; shortName: string; citation: string; criterion?: string; libraryId?: number;
  } | null>(null);
  const [returnToParam, setReturnToParam] = useState<{ uid: string; paramName: string; methodId: number } | null>(null);
  const [propagateSignedDialog, setPropagateSignedDialog] = useState<{
    methodologyId: number;
    shortName: string;
    oldShortName: string;   // shortName antes do rename — signed protocols ainda têm este valor
    criteria: string | null;
    skippedSigned: Array<{ id: number; productName: string }>;
  } | null>(null);
  const [editParamShort, setEditParamShort] = useState("");
  const [editParamCitation, setEditParamCitation] = useState("");
  const [editParamCategory, setEditParamCategory] = useState("");
  const [editParamSubject, setEditParamSubject] = useState("");
  const [editParamCriteria, setEditParamCriteria] = useState("");
  const [editParamAskLibrary, setEditParamAskLibrary] = useState(false);
  const [editParamCopied, setEditParamCopied] = useState(false);
  // Flags para quando a metodologia ainda NÃO está na Biblioteca
  const [editParamAddToLib, setEditParamAddToLib] = useState(true);
  const [editParamUpdateProtocols, setEditParamUpdateProtocols] = useState(true);

  const openEditParamMethod = (uid: string, paramName: string, shortName: string, citation: string, criterion?: string) => {
    const libEntry = methodologies.find(m => m.shortName === shortName);
    setEditParamMethod({ uid, paramName, shortName, citation, criterion, libraryId: libEntry?.id });
    setEditParamShort(shortName);
    setEditParamCitation(citation);
    setEditParamCategory(libEntry?.category ?? "");
    setEditParamSubject(libEntry?.subject ?? shortName);
    setEditParamCriteria(criterion ?? libEntry?.criteria ?? "");
    setEditParamAskLibrary(false);
    setEditParamCopied(false);
    setEditParamAddToLib(true);
    setEditParamUpdateProtocols(true);
  };

  const closeEditParamMethod = () => { setEditParamMethod(null); setEditParamAskLibrary(false); setEditParamAddToLib(true); setEditParamUpdateProtocols(true); };

  const saveEditParamMethod = () => {
    if (!editParamMethod || !editParamShort.trim()) return;
    // Guarda contexto de retorno antes de fechar
    const returnCtxBase = { uid: editParamMethod.uid, paramName: editParamMethod.paramName };
    const _newCriterion = editParamCriteria.trim();
    const _methodOldShort = editParamMethod.shortName; // shortName ANTES da edição

    // 1. Atualiza o protocolo atual (methodology ref; criterion preservado pelo false)
    setParamMethodInTab(editParamMethod.uid, editParamMethod.paramName, editParamShort.trim(), editParamCitation.trim(), false);

    // 2. Atualiza o critério localmente — param específico + outros do mesmo ativo no protocolo
    if (_newCriterion) {
      setEditableParams(prev => prev.map(p => {
        if (p.uid === editParamMethod.uid) return { ...p, criterion: _newCriterion };
        if (p.methodologyShort === _methodOldShort) return { ...p, criterion: _newCriterion };
        return p;
      }));
    }

    // 3. Replica para a Biblioteca — não propaga assinados (pede confirmação se houver)
    const libData = {
      shortName: editParamShort.trim(),
      citation: editParamCitation.trim(),
      category: editParamCategory || null,
      subject: editParamSubject.trim() || null,
      parameter: editParamMethod.paramName || null,
      criteria: _newCriterion || null,
    };
    if (editParamMethod.libraryId) {
      const _oldShortForParam = editParamMethod.shortName;
      updateMutation.mutate({ id: editParamMethod.libraryId, data: { ...libData, propagateSignedProtocols: false } as any }, {
        onSuccess: (data: any) => {
          setReturnToParam({ ...returnCtxBase, methodId: editParamMethod.libraryId! });
          if (data.skippedSigned?.length > 0) {
            setPropagateSignedDialog({
              methodologyId: data.id,
              shortName: data.shortName,
              oldShortName: _oldShortForParam,
              criteria: data.criteria ?? null,
              skippedSigned: data.skippedSigned,
            });
          }
        },
      });
    } else if (editParamAddToLib) {
      // Cria na Biblioteca e, se solicitado, propaga para outros protocolos
      createMutation.mutate({ data: libData }, {
        onSuccess: async (data: any) => {
          setReturnToParam({ ...returnCtxBase, methodId: data.id });
          if (editParamUpdateProtocols) {
            try {
              const _tokLib = localStorage.getItem("alphafitus_token");
              const res = await fetch(`/api/methodologies/${data.id}`, {
                method: "PUT",
                headers: {
                  "Content-Type": "application/json",
                  ...(_tokLib ? { Authorization: `Bearer ${_tokLib}` } : {}),
                },
                body: JSON.stringify({ ...libData, propagateSignedProtocols: false }),
                credentials: "include",
              });
              if (res.ok) {
                const updateData = await res.json();
                invalidate();
                if (updateData.skippedSigned?.length > 0) {
                  setPropagateSignedDialog({
                    methodologyId: updateData.id,
                    shortName: updateData.shortName,
                    oldShortName: libData.shortName,
                    criteria: updateData.criteria ?? null,
                    skippedSigned: updateData.skippedSigned,
                  });
                }
              }
            } catch { /* propagação é best-effort */ }
          }
        },
      });
    }
    // Se editParamAddToLib=false: mudança local já salva pelo setParamMethodInTab acima
    closeEditParamMethod();
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
  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: getListMethodologiesQueryKey() });
    queryClient.invalidateQueries({ queryKey: getListProtocolsQueryKey() });
  };

  // ── Highlight da entrada salva/atualizada ─────────────────────────
  const [highlightedMethodId, setHighlightedMethodId] = useState<number | null>(null);
  const scrollAndHighlight = (id: number) => {
    setHighlightedMethodId(id);
    // Aguarda a lista re-renderizar após invalidação, depois rola até o card
    setTimeout(() => {
      document.getElementById(`method-card-${id}`)
        ?.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 450);
    // Apaga o destaque após 3,5s
    setTimeout(() => setHighlightedMethodId(null), 3500);
  };

  const createMutation = useCreateMethodology({
    mutation: {
      onSuccess: (data: any) => { invalidate(); closeDialog(); toast({ title: "Metodologia criada" }); scrollAndHighlight(data.id); },
      onError: () => toast({ title: "Erro ao criar", variant: "destructive" }),
    },
  });

  const updateMutation = useUpdateMethodology({
    mutation: {
      onSuccess: (data: any) => { invalidate(); closeDialog(); toast({ title: "Metodologia atualizada" }); scrollAndHighlight(data.id); },
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
      const _oldShort = dialog.shortName;
      updateMutation.mutate({ id: dialog.id, data: { ...data, propagateSignedProtocols: false } as any }, {
        onSuccess: (resData: any) => {
          // Atualiza critério localmente para todos os params deste protocolo que usam esta metodologia
          if (resData.criteria) {
            setEditableParams(prev => prev.map(p =>
              p.methodologyShort === _oldShort ? { ...p, criterion: resData.criteria } : p
            ));
          }
          // Abre dialog para protocolos assinados que foram pulados
          if (resData.skippedSigned?.length > 0) {
            setPropagateSignedDialog({
              methodologyId: resData.id,
              shortName: resData.shortName,
              oldShortName: _oldShort,
              criteria: resData.criteria ?? null,
              skippedSigned: resData.skippedSigned,
            });
          }
        },
      });
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

  // Agrupa por categoria para exibição na biblioteca; sem categoria vai ao final
  const _catKey = (m: { category?: string | null }) => m.category?.trim() || "";
  const _libGroupMap = new Map<string, typeof filteredMethodologies>();
  for (const m of filteredMethodologies) {
    const k = _catKey(m);
    if (!_libGroupMap.has(k)) _libGroupMap.set(k, []);
    _libGroupMap.get(k)!.push(m);
  }
  const _libGroups = [..._libGroupMap.keys()]
    .sort((a, b) => {
      if (!a && b) return 1;   // sem categoria vai ao final
      if (a && !b) return -1;
      return a.localeCompare(b, "pt-BR", { sensitivity: "base" });
    })
    .map(cat => ({ category: cat, items: _libGroupMap.get(cat)! }));

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
                          id={`param-row-${p.uid}`}
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
                                  {/* Editar texto da metodologia diretamente */}
                                  <button
                                    type="button"
                                    title="Editar texto da metodologia"
                                    className="flex items-center justify-center h-5 w-5 rounded text-muted-foreground/40 hover:text-primary hover:bg-primary/10 transition-colors"
                                    onClick={() => openEditParamMethod(p.uid, p.parameter, p.methodologyShort!, p.methodologyCitation ?? "", p.criterion ?? "")}
                                  >
                                    <PenLine className="h-3 w-3" />
                                  </button>
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
      <div id="biblioteca-referencias-metodologicas" className="border-t pt-5">
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
                <select
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring/50"
                >
                  <option value="">— Selecione —</option>
                  <option value="Teor do Ativo">Teor do Ativo</option>
                  <option value="Microbiologica">Microbiologica</option>
                  <option value="Fisico-Quimica">Fisico-Quimica</option>
                </select>
              </div>
              <div className="space-y-1">
                <label className="text-sm font-medium">Critério / Especificação (opcional)</label>
                <Input
                  placeholder='ex: 5,0 – 7,0, ≤ 5%, ≥ 80%'
                  value={criteriaField}
                  onChange={(e) => setCriteriaField(e.target.value)}
                />
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

        {/* Dialog — propagar critério para protocolos assinados */}
        <AlertDialog open={!!propagateSignedDialog} onOpenChange={(o) => { if (!o) setPropagateSignedDialog(null); }}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle className="flex items-center gap-2">
                ⚠️ Protocolos assinados não atualizados
              </AlertDialogTitle>
              <AlertDialogDescription asChild>
                <div className="space-y-3 text-sm">
                  <p>
                    <span className="font-semibold">{propagateSignedDialog?.skippedSigned.length}</span> protocolo(s) já assinado(s) não foram atualizados automaticamente:
                  </p>
                  <ul className="rounded-md border bg-muted/40 px-3 py-2 space-y-1 max-h-40 overflow-y-auto">
                    {propagateSignedDialog?.skippedSigned.map(p => (
                      <li key={p.id} className="text-xs font-medium text-foreground">• {p.productName}</li>
                    ))}
                  </ul>
                  {propagateSignedDialog?.criteria && (
                    <p className="text-xs text-muted-foreground">
                      Novo critério: <span className="font-medium text-foreground">{propagateSignedDialog.criteria}</span>
                    </p>
                  )}
                  <p>Deseja aplicar o novo critério nesses protocolos também?</p>
                </div>
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel onClick={() => setPropagateSignedDialog(null)}>Não, ignorar</AlertDialogCancel>
              <AlertDialogAction
                onClick={async () => {
                  if (!propagateSignedDialog) return;
                  try {
                    const _tok = localStorage.getItem("alphafitus_token");
                    const res = await fetch(`/api/methodologies/${propagateSignedDialog.methodologyId}/propagate-to-signed`, {
                      method: "POST",
                      headers: {
                        "Content-Type": "application/json",
                        ...(_tok ? { Authorization: `Bearer ${_tok}` } : {}),
                      },
                      body: JSON.stringify({
                        protocolIds: propagateSignedDialog.skippedSigned.map(p => p.id),
                        oldShortName: propagateSignedDialog.oldShortName,
                      }),
                    });
                    if (!res.ok) {
                      let errMsg = "Falha na propagação";
                      try { const j = await res.json(); errMsg = j.error ?? errMsg; } catch { /* ignore */ }
                      throw new Error(errMsg);
                    }
                    queryClient.invalidateQueries({ queryKey: getListProtocolsQueryKey() });
                    // Se o protocolo atual está na lista, atualiza editableParams
                    const isCurrentProtocol = propagateSignedDialog.skippedSigned.some(p => p.id === protocolId);
                    if (isCurrentProtocol && propagateSignedDialog.criteria) {
                      const _c = propagateSignedDialog.criteria;
                      const _s = propagateSignedDialog.oldShortName;
                      setEditableParams(prev => prev.map(p =>
                        p.methodologyShort === _s ? { ...p, criterion: _c } : p
                      ));
                    }
                    toast({ title: `${propagateSignedDialog.skippedSigned.length} protocolo(s) assinado(s) atualizado(s)` });
                  } catch (err) {
                    const _errMsg = err instanceof Error ? err.message : "Erro desconhecido";
                    toast({ title: "Erro ao atualizar protocolos assinados", description: _errMsg, variant: "destructive" });
                  }
                  setPropagateSignedDialog(null);
                }}
              >
                Sim, atualizar assinados
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
          <div className="space-y-6">
            {_libGroups.map(({ category, items }) => (
              <div key={category || "__sem_categoria__"}>
                {/* Cabeçalho de grupo */}
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground whitespace-nowrap">
                    {category || "Sem categoria"}
                  </span>
                  <div className="flex-1 h-px bg-border/60" />
                  <span className="text-[10px] text-muted-foreground/50">{items.length}</span>
                </div>
                <div className="space-y-2">
                {items.map((m) => {
              const docUrl = docUrls[String(m.id)];
              const isEditingDoc = editingDocId === m.id;
              return (
                <Fragment key={m.id}>
                <div
                  id={`method-card-${m.id}`}
                  className={`flex items-start gap-3 rounded-lg border px-4 py-3 transition-all duration-700 ${
                    highlightedMethodId === m.id
                      ? "bg-primary/10 border-primary ring-2 ring-primary/40 shadow-md"
                      : "bg-muted/30"
                  }`}
                >
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
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 text-destructive hover:text-destructive"
                      title="Remover referência"
                      onClick={() => {
                        // Verifica em quais protocolos esta metodologia está em uso
                        const usedBy = allProtocols
                          .filter(p => {
                            try {
                              const pm = JSON.parse((p as { paramMethodsJson?: string | null }).paramMethodsJson ?? "{}") as Record<string, string>;
                              return Object.values(pm).some(v => v === m.shortName);
                            } catch { return false; }
                          })
                          .map(p => (p as { productName?: string; product_name?: string }).productName ?? (p as { product_name?: string }).product_name ?? `Protocolo #${p.id}`);
                        setPendingDelete({ id: m.id, shortName: m.shortName, usedBy });
                      }}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
                {/* Botão de retorno — abaixo do card destacado */}
                {returnToParam && returnToParam.methodId === m.id && (
                  <button
                    type="button"
                    onClick={() => {
                      const el = document.getElementById(`param-row-${returnToParam.uid}`);
                      if (el) {
                        el.scrollIntoView({ behavior: "smooth", block: "center" });
                        el.classList.add("bg-blue-50", "ring-2", "ring-blue-300");
                        setTimeout(() => el.classList.remove("bg-blue-50", "ring-2", "ring-blue-300"), 2000);
                      }
                      setReturnToParam(null);
                    }}
                    className="w-full flex items-center justify-center gap-1.5 text-xs font-semibold text-primary bg-primary/5 border border-primary/20 rounded-b-lg px-3 py-2 hover:bg-primary/15 transition-colors -mt-px"
                  >
                    ↑ Voltar ao parâmetro {returnToParam.paramName}
                  </button>
                )}
                </Fragment>
              );
            })}
                </div>
              </div>
            ))}
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
                    autoComplete="off"
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

      {/* ── Modal — confirmar remoção de referência da biblioteca ── */}
      {pendingDelete && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
          onClick={() => { setPendingDelete(null); setDeleteMethPwd(""); setDeleteMethPwdError(""); }}
        >
          <div className="bg-white rounded-xl shadow-2xl w-[440px] mx-4 p-5 space-y-4" onClick={e => e.stopPropagation()}>
            <div className="flex items-center gap-2">
              <Trash2 className="h-4 w-4 text-destructive shrink-0" />
              <p className="font-semibold text-sm">Excluir metodologia da biblioteca</p>
            </div>
            <div className="rounded-lg bg-muted/50 border px-3 py-2">
              <p className="text-sm font-medium">{pendingDelete.shortName}</p>
            </div>
            {pendingDelete.usedBy.length > 0 ? (
              <div className="space-y-2">
                <p className="text-xs text-amber-700 font-medium flex items-center gap-1">
                  <span className="inline-block w-2 h-2 rounded-full bg-amber-500 shrink-0" />
                  Esta referência está em uso {pendingDelete.usedBy.length === 1 ? "no protocolo:" : `em ${pendingDelete.usedBy.length} protocolos:`}
                </p>
                <ul className="max-h-32 overflow-y-auto space-y-0.5 pl-3 border-l-2 border-amber-300">
                  {pendingDelete.usedBy.map((name, i) => (
                    <li key={i} className="text-xs text-foreground leading-snug">{name}</li>
                  ))}
                </ul>
                <p className="text-xs text-muted-foreground">
                  A referência será removida da biblioteca. Os parâmetros nos protocolos acima manterão o nome da metodologia, mas perderão o vínculo com a entrada centralizada.
                </p>
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">Esta referência não está em uso em nenhum protocolo.</p>
            )}

            {/* Campo de senha mestra — obrigatório para confirmar exclusão */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-foreground">Senha mestra para confirmar exclusão</label>
              <div className="relative">
                <input
                  type={deleteMethPwdShow ? "text" : "password"}
                  autoFocus
                  autoComplete="off"
                  value={deleteMethPwd}
                  onChange={e => { setDeleteMethPwd(e.target.value); setDeleteMethPwdError(""); }}
                  onKeyDown={e => {
                    if (e.key === "Enter") confirmDeleteMethodology();
                    if (e.key === "Escape") { setPendingDelete(null); setDeleteMethPwd(""); setDeleteMethPwdError(""); }
                  }}
                  placeholder="Digite a senha mestra"
                  className="w-full border border-border rounded px-3 py-1.5 text-sm pr-9 focus:outline-none focus:ring-1 focus:ring-primary"
                />
                <button
                  type="button"
                  onClick={() => setDeleteMethPwdShow(s => !s)}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground"
                >
                  {deleteMethPwdShow ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
              {deleteMethPwdError && (
                <p className="text-xs text-destructive font-medium">{deleteMethPwdError}</p>
              )}
            </div>

            <div className="flex justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={() => { setPendingDelete(null); setDeleteMethPwd(""); setDeleteMethPwdError(""); }}
                className="text-sm px-4 py-1.5 rounded border border-border hover:bg-muted transition-colors"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={confirmDeleteMethodology}
                disabled={deleteMethPwdLoading || !deleteMethPwd.trim()}
                className="text-sm px-4 py-1.5 rounded bg-destructive text-white hover:bg-destructive/80 transition-colors disabled:opacity-50"
              >
                {deleteMethPwdLoading ? "Verificando…" : "Excluir metodologia"}
              </button>
            </div>
          </div>
        </div>
      )}

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

      {/* ── Dialog: editar metodologia inline (completo) ─────────────── */}
      {editParamMethod && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={closeEditParamMethod}>
          <div className="bg-white rounded-xl shadow-2xl w-[520px] mx-4 p-6 space-y-4" onClick={e => e.stopPropagation()}>
            {/* Cabeçalho */}
            <div className="flex items-center justify-between">
              <p className="font-semibold text-base">Editar Referência</p>
              <button type="button" onClick={closeEditParamMethod} className="text-muted-foreground hover:text-foreground">
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Parâmetro */}
            <p className="text-xs text-muted-foreground -mt-1">
              Parâmetro: <span className="font-medium text-foreground">{editParamMethod.paramName}</span>
            </p>

            {/* Nome curto */}
            <div className="space-y-1">
              <label className="text-sm font-medium">Nome curto *</label>
              <input
                autoFocus
                type="text"
                value={editParamShort}
                onChange={e => setEditParamShort(e.target.value)}
                className="w-full rounded-md border border-input px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring/50"
                placeholder="ex: FB 7ª ed., AOAC 934.01, IAL 4ª ed."
              />
            </div>

            {/* Citação completa */}
            <div className="space-y-1">
              <div className="flex items-center justify-between">
                <label className="text-sm font-medium">Citação completa *</label>
                <button
                  type="button"
                  onClick={() => { navigator.clipboard.writeText(editParamCitation).then(() => { setEditParamCopied(true); setTimeout(() => setEditParamCopied(false), 2000); }); }}
                  className={`text-xs flex items-center gap-1 px-2 py-0.5 rounded transition-colors ${editParamCopied ? "text-emerald-600 bg-emerald-50" : "text-primary hover:bg-primary/10"}`}
                >
                  {editParamCopied ? "✓ Copiado!" : "Copiar texto"}
                </button>
              </div>
              <textarea
                value={editParamCitation}
                onChange={e => setEditParamCitation(e.target.value)}
                rows={3}
                className="w-full rounded-md border border-input px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring/50 resize-y"
                placeholder="Citação completa da referência metodológica…"
              />
            </div>

            {/* Substância / Tema */}
            <div className="space-y-1">
              <label className="text-sm font-medium">Substância / Tema</label>
              <input
                type="text"
                value={editParamSubject}
                onChange={e => setEditParamSubject(e.target.value)}
                className="w-full rounded-md border border-input px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring/50"
                placeholder="ex: Vitamina D, Cálcio, pH, Microbiológico"
              />
              <p className="text-[11px] text-muted-foreground">Facilita a busca — identifica o ativo ou tema principal da referência.</p>
            </div>

            {/* Categoria */}
            <div className="space-y-1">
              <label className="text-sm font-medium">Categoria (opcional)</label>
              <select
                value={editParamCategory}
                onChange={e => setEditParamCategory(e.target.value)}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring/50"
              >
                <option value="">— Selecione —</option>
                <option value="Teor do Ativo">Teor do Ativo</option>
                <option value="Microbiologica">Microbiologica</option>
                <option value="Fisico-Quimica">Fisico-Quimica</option>
              </select>
            </div>

            {/* Critério */}
            <div className="space-y-1">
              <label className="text-sm font-medium">Critério / Especificação (opcional)</label>
              <input
                type="text"
                value={editParamCriteria}
                onChange={e => setEditParamCriteria(e.target.value)}
                className="w-full rounded-md border border-input px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring/50"
                placeholder="ex: 5,0 – 7,0, ≤ 5%, ≥ 80%"
              />
            </div>

            {/* Banner / nota de sincronização */}
            {editParamMethod && !editParamMethod.libraryId ? (
              <div className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2.5 space-y-2.5">
                <p className="text-xs font-medium text-amber-800 flex items-center gap-1.5">
                  <span>⚠️</span>
                  Esta metodologia ainda não está na Biblioteca de Referências Metodológicas.
                </p>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={editParamAddToLib}
                    onChange={e => setEditParamAddToLib(e.target.checked)}
                    className="h-4 w-4 rounded border-amber-400 accent-amber-600"
                  />
                  <span className="text-xs text-amber-900">Adicionar à Biblioteca de Referências</span>
                </label>
                {editParamAddToLib && (
                  <label className="flex items-center gap-2 cursor-pointer pl-6">
                    <input
                      type="checkbox"
                      checked={editParamUpdateProtocols}
                      onChange={e => setEditParamUpdateProtocols(e.target.checked)}
                      className="h-4 w-4 rounded border-amber-400 accent-amber-600"
                    />
                    <span className="text-xs text-amber-900">Atualizar outros protocolos que já usam esta metodologia</span>
                  </label>
                )}
              </div>
            ) : (
              <p className="text-[11px] text-muted-foreground flex items-center gap-1">
                <BookOpen className="h-3 w-3 flex-shrink-0" />
                As alterações serão salvas automaticamente na Biblioteca de Referências Metodológicas.
              </p>
            )}

            {/* Rodapé */}
            <div className="flex justify-end gap-2 pt-1">
              <button type="button" onClick={closeEditParamMethod} className="text-sm px-4 py-2 rounded border border-border hover:bg-muted transition-colors">
                Cancelar
              </button>
              <button
                type="button"
                onClick={saveEditParamMethod}
                disabled={!editParamShort.trim()}
                className="text-sm px-4 py-2 rounded bg-primary text-white hover:bg-primary/80 disabled:opacity-50 transition-colors"
              >
                Salvar alterações
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}


export { MethodologiaTab };
