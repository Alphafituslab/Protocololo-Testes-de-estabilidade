import { useState, useRef, useEffect, useCallback, useMemo, Fragment } from "react";
import {
  useUpdateProtocol,
  useFinalizeProtocol,
  useListSignatures,
  getGetProtocolQueryKey,
  getGetCertificateQueryKey,
  getListSignaturesQueryKey,
  getGetProtocolStatsQueryKey,
  getListProtocolsQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { CheckCircle2, XCircle, Loader2, Lock, ShieldAlert, ShieldCheck, RotateCcw, Eye, EyeOff, Save, Pencil, Award } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/use-auth";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { finalizeSchema, STATUS_COLORS } from "./shared";

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


export { FinalizeSection };
