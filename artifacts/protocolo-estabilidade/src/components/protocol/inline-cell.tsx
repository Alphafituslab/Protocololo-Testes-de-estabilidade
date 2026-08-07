import { useState, useRef, useEffect, useCallback, useMemo, Fragment } from "react";
import {
  useUpsertResult,
  upsertResult as upsertResultDirect,
  useDeleteResult,
  getListResultsQueryKey,
  getGetKineticsQueryKey,
  getGetProtocolQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Lock, Eye, EyeOff } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

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
  editUnlocked, onUnlock, onSaved, otherPeriods,
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
  /** Outros períodos do mesmo lote+parâmetro — usado para auto-preencher */
  otherPeriods?: Array<{ period: number; result: { result: string; status: string } | undefined; date?: string }>;
}) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(result?.result ?? "");
  const [status, setStatus] = useState<"conforme" | "nao_conforme" | "na" | "aprovado_com_ressalva" | "nd" | "lq">(
    (result?.status as "conforme" | "nao_conforme" | "na" | "aprovado_com_ressalva" | "nd" | "lq") ?? "conforme"
  );
  const [observation, setObservation] = useState(result?.observation ?? "");
  const [isBulking, setIsBulking] = useState(false);
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
  const fillPeriodsUpsert = useUpsertResult();

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
              setIsBulking(true);
              try {
                // Replica para TODOS os lotes em TODOS os períodos (T0, T3, T6)
                // Usa a função direta (não o hook de mutation) para evitar
                // cancelamento de chamadas sequenciais pelo React Query.
                const allPeriods = [
                  { period, date: periodDate },
                  ...(otherPeriods ?? []).map(op => ({ period: op.period, date: op.date })),
                ];
                const numericResult = (() => { const n = parseFloat(value.replace(",", ".")); return isNaN(n) ? undefined : n; })();
                for (const { period: p, date: d } of allPeriods) {
                  for (const lot of lots) {
                    try {
                      await upsertResultDirect(protocolId, {
                        lotId: lot.id,
                        period: p,
                        analysisDate: d ?? new Date().toISOString().split("T")[0],
                        category: param.category as "fisico_quimica" | "microbiologica" | "teor_ativo" | "embalagem",
                        parameter: param.parameter,
                        criterion: param.criterion,
                        result: value,
                        numericResult,
                        status,
                      });
                    } catch {
                      // continua para o próximo — falhas individuais logadas no servidor
                    }
                  }
                }
                queryClient.invalidateQueries({ queryKey: getListResultsQueryKey(protocolId) });
                queryClient.invalidateQueries({ queryKey: getGetKineticsQueryKey(protocolId) });
                queryClient.invalidateQueries({ queryKey: getGetProtocolQueryKey(protocolId) });
                setEditing(false);
                onSaved();
              } finally {
                setIsBulking(false);
              }
            }}
            disabled={isBulking}
            className="text-[9px] px-1.5 py-0.5 rounded bg-blue-50 text-blue-700 hover:bg-blue-100 border border-blue-200 w-full mt-0.5 disabled:opacity-50"
            title="Replica este valor para todos os lotes em todos os períodos (T0, T3 e T6)"
          >
            {isBulking ? "Salvando..." : "↕ replicar todos (T0 + T3 + T6)"}
          </button>
        )}
        {/* ── Auto-preencher outros períodos ──────────────────────── */}
        {value.trim() && otherPeriods && otherPeriods.some(op => !op.result) && (
          <button
            type="button"
            onClick={async () => {
              const emptyOtherPeriods = otherPeriods.filter(op => !op.result);
              for (const op of emptyOtherPeriods) {
                try {
                  await fillPeriodsUpsert.mutateAsync({
                    id: protocolId,
                    data: {
                      lotId,
                      period: op.period,
                      analysisDate: op.date ?? new Date().toISOString().split("T")[0],
                      category: param.category as "fisico_quimica" | "microbiologica" | "teor_ativo" | "embalagem",
                      parameter: param.parameter,
                      criterion: param.criterion,
                      result: value,
                      numericResult: (() => { const n = parseFloat(value.replace(",", ".")); return isNaN(n) ? undefined : n; })(),
                      status,
                    },
                  });
                } catch {
                  // continua — falhas individuais logadas no servidor
                }
              }
              queryClient.invalidateQueries({ queryKey: getListResultsQueryKey(protocolId) });
              queryClient.invalidateQueries({ queryKey: getGetKineticsQueryKey(protocolId) });
              queryClient.invalidateQueries({ queryKey: getGetProtocolQueryKey(protocolId) });
              setEditing(false);
              onSaved();
            }}
            disabled={fillPeriodsUpsert.isPending}
            className="text-[9px] px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border border-emerald-200 w-full mt-0.5 disabled:opacity-50"
            title={`Auto-preenche os períodos vazios (${otherPeriods.filter(op => !op.result).map(op => `T${op.period}m`).join(', ')}) com o mesmo valor e status.`}
          >
            {fillPeriodsUpsert.isPending
              ? "Preenchendo..."
              : `↔ auto-preencher ${otherPeriods.filter(op => !op.result).map(op => `T${op.period}m`).join(" + ")}`}
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


export { CellImages, InlineCell };
