import { useParams, Link, useLocation } from "wouter";
import { fmtDate } from "@/lib/utils";
import { useState, useRef, useEffect, useCallback } from "react";
import { useUnlock } from "@/hooks/use-unlock";
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
  useDeleteAttachment,
  getListAttachmentsQueryKey,
  useListSignatures,
  getListSignaturesQueryKey,
  useListBibliographicReferences,
  useListProtocolBibliographicReferences,
  useAddProtocolBibliographicReference,
  useRemoveProtocolBibliographicReference,
  getListProtocolBibliographicReferencesQueryKey,
  type BibliographicReference,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
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
import { ArrowLeft, Plus, Pencil, Trash2, FileText, CheckCircle2, XCircle, Loader2, FlaskConical, BarChart3, Award, Lock, Unlock, BookOpen, History, Paperclip, ExternalLink, Upload, Download, X, File } from "lucide-react";
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
  { parameter: "Coliformes totais", category: "microbiologica", criterion: "≤ 10 UFC/g" },
  { parameter: "Salmonella spp.", category: "microbiologica", criterion: "Ausente em 25 g" },
  { parameter: "Estafilococos coagulase+", category: "microbiologica", criterion: "≤ 10 UFC/g" },
  { parameter: "Bolores e leveduras", category: "microbiologica", criterion: "≤ 100 UFC/g" },
  { parameter: "Escherichia coli", category: "microbiologica", criterion: "Ausente" },
  { parameter: "Enterobacteriaceae", category: "microbiologica", criterion: "Ausente" },
  { parameter: "Cálcio", category: "teor_ativo", criterion: "98,50% - 100,50%" },
  { parameter: "Vitamina D", category: "teor_ativo", criterion: "97,00% - 103,00%" },
  { parameter: "Torque de tampa", category: "embalagem", criterion: "2 unidades a cada 100" },
  { parameter: "Selagem por indução", category: "embalagem", criterion: "2 unidades a cada 100" },
  { parameter: "Integridade selagem", category: "embalagem", criterion: "2 unidades a cada 100" },
];

const PERIODS = [0, 3, 6];

const lotSchema = z.object({
  lotNumber: z.string().min(1, "Número do lote obrigatório"),
  manufacturingDate: z.string().min(1, "Data obrigatória"),
  expiryDate: z.string().optional(),
  quantity: z.coerce.number().min(1),
  notes: z.string().optional(),
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

  // Environmental conditions — now persisted in the database.
  // We clean up the old localStorage key on mount so stale values are gone.
  const [samplingTemp, setSamplingTempRaw] = useState(protocol.samplingTemp ?? "22,8°C");
  const [samplingHumidity, setSamplingHumidityRaw] = useState(protocol.samplingHumidity ?? "60% UR");
  const [receptionTemp, setReceptionTempRaw] = useState(protocol.receptionTemp ?? "22,8°C");
  const [receptionHumidity, setReceptionHumidityRaw] = useState(protocol.receptionHumidity ?? "60% UR");

  useEffect(() => {
    try { localStorage.removeItem(`cert_env_${protocol.id}`); } catch { /* ignore */ }
  }, [protocol.id]);

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
            onChange={setSamplingTempRaw}
            onBlur={() => saveField("samplingTemp", samplingTemp)}
            placeholder="ex: 22,8°C"
          />
          <EditableInfoField
            label="Condições ambientais durante amostragem — Umidade"
            value={samplingHumidity}
            onChange={setSamplingHumidityRaw}
            onBlur={() => saveField("samplingHumidity", samplingHumidity)}
            placeholder="ex: 60% UR"
          />
          <EditableInfoField
            label="Condições de recebimento da amostra — Temperatura"
            value={receptionTemp}
            onChange={setReceptionTempRaw}
            onBlur={() => saveField("receptionTemp", receptionTemp)}
            placeholder="ex: 22,8°C"
          />
          <EditableInfoField
            label="Condições de recebimento da amostra — Umidade"
            value={receptionHumidity}
            onChange={setReceptionHumidityRaw}
            onBlur={() => saveField("receptionHumidity", receptionHumidity)}
            placeholder="ex: 60% UR"
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-x-8 gap-y-3">
        {fieldsBottom.map(f => <InfoFieldEL key={f.labelKey} {...f} lbl={lbl} setLabel={setLabel} />)}
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
    defaultValues: { lotNumber: "", manufacturingDate: "", expiryDate: "", quantity: 20, notes: "" },
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
          form.reset({ lotNumber: "", manufacturingDate: "", expiryDate: "", quantity: 20, notes: "" });
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
        }, 0);
      },
    },
  });

  const deleteLot = useDeleteLot({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListLotsQueryKey(protocolId) });
        queryClient.invalidateQueries({ queryKey: getListResultsQueryKey(protocolId) });
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
    form.reset({ lotNumber: lot.lotNumber, manufacturingDate: lot.manufacturingDate, expiryDate: lot.expiryDate ?? "", quantity: lot.quantity, notes: lot.notes ?? "" });
    setOpen(true);
  };

  const openNew = () => {
    setEditLot(null);
    setLastAdded(null);
    form.reset({ lotNumber: "", manufacturingDate: "", expiryDate: "", quantity: 20, notes: "" });
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
          // Invalidate both queries only when the dialog closes — never while it
          // is open. Invalidating with a mounted Dialog portal can trigger a
          // LotsTab re-render that causes the error boundary to reset open=false.
          queryClient.invalidateQueries({ queryKey: getGetProtocolQueryKey(protocolId) });
          queryClient.invalidateQueries({ queryKey: getListLotsQueryKey(protocolId) });
          setLastAdded(null);
        }
      }}>
        <DialogContent
          className="max-w-lg"
          onInteractOutside={e => { if (!editLot) e.preventDefault(); }}
          onEscapeKeyDown={e => { if (!editLot) e.preventDefault(); }}
        >
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
            <div className="rounded-md border bg-muted/30 px-3 py-2 space-y-1 max-h-36 overflow-y-auto">
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

          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
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
              <div className="flex justify-between gap-2">
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
}: {
  lotId: number;
  period: number;
  param: { parameter: string; category: string; criterion: string };
  result: { result: string; status: string; observation?: string | null } | undefined;
  protocolId: number;
  lots: { id: number; lotNumber: string }[];
  periodDate?: string;
}) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(result?.result ?? "");
  const [status, setStatus] = useState<"conforme" | "nao_conforme" | "na" | "aprovado_com_ressalva" | "nd" | "lq">(
    (result?.status as "conforme" | "nao_conforme" | "na" | "aprovado_com_ressalva" | "nd" | "lq") ?? "conforme"
  );
  const [observation, setObservation] = useState(result?.observation ?? "");
  const queryClient = useQueryClient();

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
        <div className="flex gap-0.5 justify-center">
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
            onClick={() => setEditing(false)}
            className="text-[9px] px-2 py-0.5 rounded bg-muted text-muted-foreground hover:bg-muted/80"
          >
            ✕
          </button>
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
      <div
        onClick={open}
        onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); open(); } }}
        tabIndex={0}
        data-inline-cell
        className="cursor-pointer group flex items-center justify-center min-h-8 focus:outline-none focus:ring-2 focus:ring-primary/40 focus:ring-inset rounded w-full"
        title="Clique ou Enter para editar"
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

function ParamMethodSelector({
  paramName,
  selected,
  methodologies,
  catalogEntries = [],
  onSelect,
  compact = false,
}: {
  paramName: string;
  selected: string | null;
  methodologies: { id: number; shortName: string; citation: string; category?: string | null }[];
  catalogEntries?: { shortName: string; citation: string }[];
  onSelect: (shortName: string | null, citation: string | null) => void;
  /** Quando true, renderiza apenas um ícone de edição (para uso ao lado de texto visível). */
  compact?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const hasCatalog = catalogEntries.length > 0;
  return (
    <Popover open={open} onOpenChange={setOpen}>
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
            className={`flex items-center gap-0.5 mt-0.5 text-[10px] rounded px-1 py-0 transition-colors ${
              selected
                ? "text-primary/80 hover:text-primary"
                : "text-muted-foreground/40 hover:text-muted-foreground"
            }`}
            title={selected ? `Metodologia: ${selected}` : "Selecionar metodologia"}
            onClick={(e) => e.stopPropagation()}
          >
            <BookOpen className="h-2.5 w-2.5 flex-shrink-0" />
            <span className="truncate max-w-[120px]">{selected ?? "método..."}</span>
            {hasCatalog && !selected && (
              <span className="ml-0.5 text-[8px] bg-primary/15 text-primary rounded px-0.5 font-semibold leading-tight">
                {catalogEntries.length}
              </span>
            )}
          </button>
        )}
      </PopoverTrigger>
      <PopoverContent className="w-80 p-2 z-50" side="right" align="start">
        <p className="text-xs font-semibold text-muted-foreground mb-2 px-1">
          Metodologia — <span className="font-normal italic">{paramName || "parâmetro"}</span>
        </p>

        {/* Entradas do catálogo para este parâmetro */}
        {hasCatalog && (
          <>
            <p className="text-[9px] uppercase tracking-widest text-primary/60 font-bold px-1 mb-1">
              Cadastradas para este parâmetro
            </p>
            <div className="space-y-0.5 mb-2">
              {catalogEntries.map((m, i) => (
                <button
                  type="button"
                  key={i}
                  onClick={() => { onSelect(m.shortName, m.citation); setOpen(false); }}
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
            <div className="border-t my-1.5" />
            <p className="text-[9px] uppercase tracking-widest text-muted-foreground/50 font-bold px-1 mb-1">
              Biblioteca geral
            </p>
          </>
        )}

        {/* Todas as metodologias cadastradas */}
        {methodologies.length === 0 ? (
          <p className="text-xs text-muted-foreground italic px-1">
            Nenhuma metodologia cadastrada. Acesse a aba "Metodologia".
          </p>
        ) : (
          <div className="space-y-0.5 max-h-48 overflow-y-auto">
            {methodologies.map((m) => (
              <button
                type="button"
                key={m.id}
                onClick={() => { onSelect(m.shortName, m.citation); setOpen(false); }}
                className={`w-full text-left text-xs px-2 py-1.5 rounded hover:bg-muted transition-colors ${
                  selected === m.shortName && !hasCatalog ? "bg-primary/10 text-primary font-semibold" : ""
                }`}
              >
                <div className="font-medium text-[11px]">{m.shortName}</div>
                <div className="text-[9px] text-muted-foreground truncate leading-tight">{m.citation}</div>
              </button>
            ))}
          </div>
        )}

        {selected && (
          <div className="border-t mt-1.5 pt-1">
            <button
              type="button"
              onClick={() => { onSelect(null, null); setOpen(false); }}
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
const CATEGORY_PRESETS: Record<string, { parameter: string; criterion: string }[]> = {
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

function ResultsTab({ protocolId, initialCustomParamsJson, initialPeriodDatesJson, initialParamMethodsJson, initialParamMethodsCitationsJson, protocolFinalStatus }: { protocolId: number; initialCustomParamsJson?: string | null; initialPeriodDatesJson?: string | null; initialParamMethodsJson?: string | null; initialParamMethodsCitationsJson?: string | null; protocolFinalStatus?: string | null }) {
  const protocolIsAR = protocolFinalStatus === "aprovado_com_ressalva";
  const { data: lots = [] } = useListLots(protocolId, { query: { queryKey: getListLotsQueryKey(protocolId) } });
  const { data: results = [], isLoading } = useListResults(protocolId, { query: { queryKey: getListResultsQueryKey(protocolId) } });
  const { data: methodologies = [] } = useListMethodologies();

  const defaultParams = ANALYSIS_PARAMETERS.map((p, i) => ({ ...p, uid: `${p.category}_${i}` }));
  const [editableParams, setEditableParams] = useState<EditableParam[]>(() => {
    if (initialCustomParamsJson) {
      try { return JSON.parse(initialCustomParamsJson) as EditableParam[]; } catch { /* fall through */ }
    }
    return defaultParams;
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
      const next = prev.filter((p) => p.uid !== uid);
      const newJson = JSON.stringify(next);
      // Immediate save — no debounce.
      updateProtocol.mutate({ id: protocolId, data: { customParamsJson: newJson } });
      // Optimistically patch the protocol query cache so that if the component
      // remounts (e.g. tab switch) before the API response arrives, it
      // re-initialises from the correct data and does NOT restore the deleted item.
      queryClient.setQueryData(
        getGetProtocolQueryKey(protocolId),
        (old: Record<string, unknown> | undefined) =>
          old ? { ...old, customParamsJson: newJson } : old,
      );
      return next;
    });
  };

  const getResult = (lotId: number, period: number, parameter: string) =>
    results.find((r) => r.lotId === lotId && r.period === period && r.parameter === parameter);

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

      {categories.map(({ label, key }) => {
        const catParams = editableParams.filter((p) => p.category === key);
        return (
          <div key={key}>
            <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground mb-2">{label}</h3>
            <div className="rounded-md border overflow-x-auto">
              <Table style={{ minWidth: 680 }}>
                <TableHeader>
                  <TableRow className="bg-muted">
                    <TableHead className="w-36 text-xs sticky left-0 z-20 bg-muted border-r border-border/60">Parâmetro</TableHead>
                    <TableHead className="w-40 text-xs sticky left-36 z-20 bg-muted border-r border-border/60">Critérios de Aceitação</TableHead>
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
                              className={`py-1 pr-1 sticky left-0 z-10 border-r border-border/60 align-top ${stickyBg}`}
                            >
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
                                  // Lookup reverso: se o parâmetro está em branco e a
                                  // metodologia aponta para exatamente 1 composto, preenche
                                  if (!param.parameter.trim() && s) {
                                    const matches = getParamsForMethodology(s);
                                    if (matches.length === 1) {
                                      updateParam(param.uid, "parameter", matches[0].paramName);
                                      if (!param.criterion?.trim()) updateParam(param.uid, "criterion", matches[0].criterion);
                                    }
                                  }
                                  setParamMethod(param.parameter || (s ? (getParamsForMethodology(s)[0]?.paramName ?? "") : ""), s, c);
                                }}
                              />
                            </TableCell>
                            <TableCell
                              rowSpan={lots.length}
                              className={`py-1 pr-1 sticky left-36 z-10 border-r border-border/60 align-top ${stickyBg}`}
                            >
                              <input
                                value={param.criterion}
                                onChange={(e) => updateParam(param.uid, "criterion", e.target.value)}
                                autoComplete="new-password"
                                autoCorrect="off"
                                autoCapitalize="off"
                                spellCheck={false}
                                data-form-type="other"
                                data-lpignore="true"
                                className="w-full text-xs text-muted-foreground bg-transparent border-b border-dashed border-transparent hover:border-muted-foreground/30 focus:border-primary focus:outline-none py-0.5 placeholder:text-muted-foreground/40"
                                placeholder="Critério de aceitação"
                              />
                            </TableCell>
                            <TableCell
                              rowSpan={lots.length}
                              className={`py-1 px-1 text-center sticky left-[19rem] z-10 border-r border-border/40 align-top ${stickyBg}`}
                            >
                              <button
                                type="button"
                                onClick={() => removeParam(param.uid)}
                                className="text-muted-foreground/20 hover:text-destructive text-base leading-none transition-colors"
                                title="Remover parâmetro"
                              >
                                ×
                              </button>
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
    </div>
  );
}

type KineticOverride = {
  t0: string; t3: string; t6: string;
  deltaLn: string; k: string;
  ichThreshold: string;   // ICH Q1A(R2) minimum content % — used in t_val formula (default: 80)
  specMin: string;        // Specification/criterion range min — informational only, NOT used in calc
  specMax: string;        // Specification/criterion range max — informational only
  shelfLife: string; validadePraticada: string;
};

function parseCriterionRange(criterion: string | null | undefined): { min: string; max: string } {
  if (!criterion) return { min: "", max: "" };
  const normalized = criterion.replace(/,/g, ".").replace(/[–—]/g, "-").replace(/%/g, "").trim();
  const match = normalized.match(/(\d+\.?\d*)\s*-\s*(\d+\.?\d*)/);
  if (!match) return { min: "", max: "" };
  return { min: match[1], max: match[2] };
}

/**
 * Compute kinetic values from raw inputs.
 *
 * ICH Q1A(R2) formula:
 *   Δln = −ln(T6 / T3)
 *   k   = Δln / 3   (months⁻¹)
 *   t_val = −ln(ichThreshold / C0) / k
 *
 * ichThreshold is the ICH minimum content threshold (default 80 %).
 * It is SEPARATE from the specification/criterion range (specMin/specMax)
 * which is purely informational and must NOT be used here.
 */
function calcKineticOverride(
  t0s: string, t3s: string, t6s: string, ichThresholds: string,
): Partial<KineticOverride> {
  const t0 = parseFloat(t0s.replace(",", "."));
  const t3 = parseFloat(t3s.replace(",", "."));
  const t6 = parseFloat(t6s.replace(",", "."));
  const ichThreshold = parseFloat(ichThresholds.replace(",", "."));

  if (isNaN(t3) || isNaN(t6) || t3 <= 0 || t6 <= 0) return {};

  // Δln = −ln(T6/T3)
  const deltaLn = -Math.log(t6 / t3);
  // k = Δln / 3
  const k = deltaLn / 3;

  if (k <= 0 || isNaN(k)) return { deltaLn: deltaLn.toFixed(6), k: "" };

  const c0 = isNaN(t0) || t0 <= 0 ? t6 : t0;

  // t_val = −ln(ichThreshold / C0) / k
  // Uses 80 (ICH Q1A) as minimum content threshold, NOT the spec range min
  const lnNum = isNaN(ichThreshold) || ichThreshold <= 0 ? NaN : -Math.log(ichThreshold / c0);
  const shelfLife = !isNaN(lnNum) && lnNum > 0 ? (lnNum / k).toFixed(1) : "";

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
  value, onChange, width = "w-20", placeholder = "—",
}: { value: string; onChange: (v: string) => void; width?: string; placeholder?: string }) {
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
      className={`${width} border border-border rounded px-1.5 py-0.5 text-xs font-mono text-right focus:outline-none focus:ring-1 focus:ring-primary bg-white`}
      placeholder={placeholder}
    />
  );
}

type KineticApiParam = {
  t0?: number | null; t3?: number | null; t6?: number | null;
  deltaLn?: number | null; k?: number | null;
  estimatedShelfLifeMonths?: number | null;
  minThresholdPercent: number;
  criterion?: string | null;
};

function buildKineticOverride(p: KineticApiParam): KineticOverride {
  const t0 = p.t0 != null ? p.t0.toFixed(2) : "";
  const t3 = p.t3 != null ? p.t3.toFixed(2) : "";
  const t6 = p.t6 != null ? p.t6.toFixed(2) : "";
  const { min: specMin, max: specMax } = parseCriterionRange(p.criterion);
  return {
    t0, t3, t6,
    deltaLn: p.deltaLn != null ? p.deltaLn.toFixed(6) : "",
    k: p.k != null ? p.k.toFixed(6) : "",
    ichThreshold: p.minThresholdPercent.toString(),
    specMin,
    specMax,
    shelfLife: p.estimatedShelfLifeMonths != null ? p.estimatedShelfLifeMonths.toFixed(1) : "",
    validadePraticada: "",
  };
}

function KineticsTab({ protocolId, productName, initialKineticsNotes, initialValidityMonths }: {
  protocolId: number;
  productName: string;
  initialKineticsNotes?: string | null;
  initialValidityMonths?: number | null;
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
  const [kineticsObs, setKineticsObs] = useState<string>(() => {
    const ls = readLs();
    if (typeof ls.kineticsObs === "string") return ls.kineticsObs;
    return initialKineticsNotes ?? "";
  });
  const [customShelfLife, setCustomShelfLife] = useState<string>("");

  // Re-runs every time the kinetics API data changes (i.e. after a result upsert
  // invalidates the query). T0/T3/T6 always come fresh from the API; user-edited
  // computed fields are preserved from localStorage.
  useEffect(() => {
    if (!kinetics) return;

    type SavedPartial = Partial<Omit<KineticOverride, "t0" | "t3" | "t6">>;
    let savedOverrides: Record<string, SavedPartial> = {};
    let savedCustomShelfLife = "";
    try {
      const stored = readLs();
      if (stored.overrides) savedOverrides = stored.overrides;
      if (stored.customShelfLife != null) savedCustomShelfLife = stored.customShelfLife;
    } catch { /* ignore */ }

    const next: Record<string, KineticOverride> = {};
    for (const p of kinetics.parameters) {
      const base = buildKineticOverride(p);
      const saved = savedOverrides[p.parameter] ?? {};
      // User-editable preferences preserved from localStorage
      const ichThreshold = saved.ichThreshold ?? base.ichThreshold;
      // Always recompute derived fields (deltaLn, k, shelfLife) from fresh
      // API values (t0/t3/t6), applying the user's saved ichThreshold.
      // This ensures the table reacts immediately when results are updated,
      // without stale computed values from a previous localStorage snapshot.
      const recomputed = calcKineticOverride(base.t0, base.t3, base.t6, ichThreshold);
      next[p.parameter] = {
        t0: base.t0, t3: base.t3, t6: base.t6,
        deltaLn: recomputed.deltaLn ?? base.deltaLn,
        k: recomputed.k ?? base.k,
        shelfLife: recomputed.shelfLife ?? base.shelfLife,
        validadePraticada: saved.validadePraticada ?? base.validadePraticada,
        ichThreshold,
        specMin: saved.specMin ?? base.specMin,
        specMax: saved.specMax ?? base.specMax,
      };
    }
    setOverrides(next);
    setCustomShelfLife(savedCustomShelfLife);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kinetics, LS_KEY]);

  const persistOverrides = (
    next: Record<string, KineticOverride>,
    shelf = customShelfLife,
    cv = cardValidity,
    obs = kineticsObs,
  ) => {
    try {
      localStorage.setItem(LS_KEY, JSON.stringify({ overrides: next, customShelfLife: shelf, cardValidity: cv, kineticsObs: obs }));
    } catch { /* ignore */ }
  };

  const setField = (param: string, field: keyof KineticOverride, val: string) => {
    setOverrides((prev) => {
      const ov = { ...prev[param], [field]: val };
      // Recalculate Δln, k and t_val whenever inputs change.
      // ichThreshold (ICH 80 % limit) drives the t_val calculation.
      // specMin/specMax are informational only and do NOT trigger recalculation.
      if (["t0", "t3", "t6", "ichThreshold"].includes(field)) {
        const computed = calcKineticOverride(ov.t0, ov.t3, ov.t6, ov.ichThreshold);
        Object.assign(ov, computed);
      }
      const next = { ...prev, [param]: ov };
      persistOverrides(next);
      return next;
    });
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
    setKineticsObs(initialKineticsNotes ?? "");
    try { localStorage.removeItem(LS_KEY); } catch { /* ignore */ }
  };

  if (isLoading) return <div className="text-center py-8 text-muted-foreground">Calculando...</div>;
  if (!kinetics || kinetics.parameters.length === 0) return (
    <div className="text-center py-12 text-muted-foreground space-y-2">
      <p className="font-medium">Nenhum parâmetro de Teor do Ativo encontrado.</p>
      <p className="text-sm">Insira resultados numéricos na aba <strong>Resultados</strong> para os parâmetros da categoria <strong>Teor do Ativo</strong> (ex: Creatina, Cálcio, Vitamina D, etc.).</p>
    </div>
  );

  const missingPeriods = kinetics.parameters.filter((p) => p.t3 == null || p.t6 == null);
  const missingMsg = missingPeriods.length > 0 ? (
    <div className="rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 space-y-1">
      <p className="font-semibold">⚠ Dados insuficientes para calcular a cinética completa</p>
      <p>Os parâmetros abaixo precisam de resultados numéricos em <strong>T3m</strong> e/ou <strong>T6m</strong> na aba <strong>Resultados</strong>:</p>
      <ul className="list-disc ml-5 space-y-0.5">
        {missingPeriods.map((p) => (
          <li key={p.parameter}>
            <strong>{(p as { parameter: string }).parameter}</strong>
            {" — "}
            {p.t3 == null && p.t6 == null ? "faltam T3 e T6" : p.t3 == null ? "falta T3" : "falta T6"}
          </li>
        ))}
      </ul>
      <p className="text-xs text-amber-700">Os valores podem ser inseridos manualmente na tabela abaixo apenas para simulação. Para persistir os resultados, use a aba Resultados.</p>
    </div>
  ) : null;

  const shelfLives = Object.values(overrides)
    .map((o) => parseFloat(o.shelfLife))
    .filter((v) => !isNaN(v) && v > 0);
  const minShelfLife = shelfLives.length > 0 ? Math.min(...shelfLives) : null;
  const limitingParam = Object.entries(overrides).find(([, o]) => parseFloat(o.shelfLife) === minShelfLife)?.[0] ?? null;

  return (
    <div className="space-y-6">
      {/* Product header */}
      <div className="flex items-center justify-between gap-4 pb-3 border-b border-border">
        <div>
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Produto</p>
          <p className="text-lg font-bold text-foreground">{productName}</p>
          <p className="text-xs text-muted-foreground mt-0.5">
            {kinetics.parameters.length} parâmetro(s) de Teor do Ativo analisados via cinética de 1ª ordem (ICH Q1A)
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={resetToCalculated}>
          Restaurar valores calculados
        </Button>
      </div>
      <p className="text-xs text-muted-foreground -mt-2">Todos os valores são editáveis diretamente nas células — os cálculos são atualizados automaticamente.</p>

      {missingMsg}

      {/* Summary card */}
      <Card className="border-green-200 bg-green-50">
        <CardContent className="pt-4">
          <div className="flex items-center justify-between gap-8">
            {/* LEFT — Vida Útil Estimada (editable override) */}
            <div className="flex-1">
              <p className="text-xs text-green-700 font-medium uppercase tracking-wide mb-1">
                Vida Útil Estimada (t<sub>validade</sub>)
              </p>
              <div className="flex items-center gap-2">
                <input
                  value={customShelfLife !== "" ? customShelfLife : (minShelfLife != null ? String(Math.floor(minShelfLife)) : "")}
                  onChange={(e) => {
                    const val = e.target.value;
                    setCustomShelfLife(val);
                    persistOverrides(overrides, val);
                  }}
                  className="w-24 text-3xl font-bold text-green-800 bg-green-100 border border-green-300 rounded px-2 py-0.5 focus:outline-none focus:ring-2 focus:ring-green-500 text-right tabular-nums"
                  placeholder={minShelfLife != null ? String(Math.floor(minShelfLife)) : "—"}
                />
                <span className="text-xl font-semibold text-green-700">meses</span>
              </div>
              {limitingParam && (
                <div className="mt-2 inline-flex items-center gap-1.5 bg-amber-100 border border-amber-300 rounded-md px-2.5 py-1">
                  <span className="text-amber-600 text-xs">⚠</span>
                  <span className="text-xs font-semibold text-amber-800">Item mais degradado:</span>
                  <span className="text-xs font-bold text-amber-900">{limitingParam}</span>
                </div>
              )}
              <p className="text-xs text-green-600 mt-1.5 opacity-60">
                {customShelfLife !== ""
                  ? "Valor editado manualmente — clique em \"Restaurar\" para usar o calculado"
                  : "Menor validade calculada entre os parâmetros de Teor do Ativo"}
              </p>
            </div>

            {/* RIGHT — Validade Praticada */}
            <div className="flex-1 text-right">
              <p className="text-xs text-green-700 font-medium uppercase tracking-wide mb-1">Validade Praticada</p>
              <div className="flex items-center gap-2 justify-end">
                <input
                  value={cardValidity}
                  onChange={(e) => {
                    const val = e.target.value;
                    setCardValidity(val);
                    try {
                      const stored = readLs();
                      localStorage.setItem(LS_KEY, JSON.stringify({ ...stored, cardValidity: val }));
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
                <span>✓</span> Este valor é exibido no Certificado de Análise e no Relatório ANVISA
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

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
            </TableRow>
          </TableHeader>
          <TableBody>
            {kinetics.parameters.map((p) => {
              const ov = overrides[p.parameter];
              if (!ov) return null;
              const shelfNum = parseFloat(ov.shelfLife);
              const isLimiting = p.parameter === limitingParam;
              return (
                <TableRow key={p.parameter} className={isLimiting ? "bg-amber-50/40" : ""}>
                  <TableCell className="font-medium text-sm">{p.parameter}</TableCell>
                  <TableCell className="text-right py-2">
                    <EditableNum value={ov.t0} onChange={(v) => setField(p.parameter, "t0", v)} width="w-20" placeholder="T0" />
                  </TableCell>
                  <TableCell className="text-right py-2">
                    <EditableNum value={ov.t3} onChange={(v) => setField(p.parameter, "t3", v)} width="w-20" placeholder="T3" />
                  </TableCell>
                  <TableCell className="text-right py-2">
                    <EditableNum value={ov.t6} onChange={(v) => setField(p.parameter, "t6", v)} width="w-20" placeholder="T6" />
                  </TableCell>
                  {/* Vida Útil Calculada — computed via ICH Q1A(R2); Δln/k/limiar run silently */}
                  <TableCell className="text-right py-2 bg-amber-50/30">
                    <div className="flex items-center justify-end gap-2">
                      <span className={`text-sm font-bold tabular-nums ${isLimiting ? "text-amber-700" : "text-green-700"}`}>
                        {!isNaN(shelfNum) && shelfNum > 0 ? `${shelfNum} m` : "—"}
                      </span>
                    </div>
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
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

      {/* Step-by-step formula breakdown */}
      <div className="rounded-md bg-slate-50 border border-slate-200 p-5 text-sm text-slate-700 space-y-4">
        <p className="font-semibold text-slate-800 text-sm">Passo a Passo do Cálculo — conforme planilha Excel</p>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="space-y-3">
            <p className="text-xs font-semibold text-slate-600 uppercase tracking-wide">1. Modelo cinético de 1ª ordem</p>
            <div className="font-mono bg-white border border-slate-200 rounded px-4 py-3 text-sm text-center">
              C<sub>t</sub> = C<sub>0</sub> · e<sup>−k·t</sup>
            </div>
            <p className="text-xs text-slate-500">Modelo ICH Q1A(R2) — degradação de primeira ordem</p>
          </div>

          <div className="space-y-3">
            <p className="text-xs font-semibold text-slate-600 uppercase tracking-wide">2. Constante de degradação k</p>
            <div className="font-mono bg-white border border-slate-200 rounded px-4 py-3 text-sm text-center">
              k = −ln(Média<sub>T6</sub> / Média<sub>T3</sub>) / 3
            </div>
            <p className="text-xs text-slate-500">Calculado a partir do intervalo T3→T6 (meses)</p>
          </div>

          <div className="space-y-3">
            <p className="text-xs font-semibold text-slate-600 uppercase tracking-wide">3. Tempo de validade — método ICH (80%)</p>
            <div className="font-mono bg-white border border-slate-200 rounded px-4 py-3 text-sm text-center">
              t<sub>validade</sub> = −ln(80 / Média<sub>T0</sub>) / k
            </div>
            <p className="text-xs text-slate-500">Estimativa até atingir 80% do valor declarado</p>
          </div>

          <div className="space-y-3">
            <p className="text-xs font-semibold text-slate-600 uppercase tracking-wide">4. Tempo observado — extrapolação T6</p>
            <div className="font-mono bg-white border border-slate-200 rounded px-4 py-3 text-sm text-center">
              t<sub>obs</sub> = −ln(Média<sub>T6</sub> / Média<sub>T0</sub>) / k
            </div>
            <p className="text-xs text-slate-500">Extrapolação da taxa T3→T6 a partir de T0</p>
          </div>
        </div>
      </div>

      <div className="rounded-md border border-slate-200 bg-white p-4 space-y-2">
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Observações</p>
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
          placeholder="Descreva observações sobre os dados cinéticos: desvios encontrados, condições especiais de armazenamento, lotes atípicos, interferências analíticas ou qualquer informação relevante para o laudo."
          rows={5}
          className="w-full text-sm border border-input rounded-md px-3 py-2 focus:outline-none focus:ring-1 focus:ring-primary resize-y placeholder:text-muted-foreground/40"
        />
      </div>
    </div>
  );
}

type MethodologyDialogState =
  | { mode: "closed" }
  | { mode: "create" }
  | { mode: "edit"; id: number; shortName: string; citation: string; category: string; parameter: string; criteria: string };

function MethodologiaTab({
  protocolId,
  initialCustomParamsJson,
}: {
  protocolId: number;
  initialCustomParamsJson?: string | null;
}) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { data: methodologies = [], isLoading } = useListMethodologies();
  const updateProtocol = useUpdateProtocol();
  const isMountedRef = useRef(false);

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

  const setParamMethodInTab = (uid: string, paramName: string, shortName: string | null, citation: string | null) => {
    // 1. Lookup na biblioteca: se a metodologia tem parâmetro/critério cadastrados, usa esses
    const libEntry = shortName ? methodologies.find(m => m.shortName === shortName) : undefined;
    const libParam = libEntry?.parameter ?? null;
    const libCriteria = libEntry?.criteria ?? null;

    // 2. Lookup reverso no catálogo local: se ainda não preencheu nome, tenta catálogo
    const reverseMatches = shortName && !paramName.trim() && !libParam ? getParamsForMethodology(shortName) : [];
    const catalogFill = reverseMatches.length === 1 ? reverseMatches[0] : null;

    setEditableParams(prev => prev.map(p => {
      if (p.uid !== uid) return p;
      const newParameter = !p.parameter.trim()
        ? (libParam ?? catalogFill?.paramName ?? p.parameter)
        : p.parameter;
      const newCriterion = !p.criterion.trim()
        ? (libCriteria ?? catalogFill?.criterion ?? p.criterion)
        : p.criterion;
      return {
        ...p,
        parameter: newParameter,
        criterion: newCriterion,
        methodologyShort: shortName ?? undefined,
        methodologyCitation: citation ?? undefined,
      };
    }));

    const finalName = libParam ?? catalogFill?.paramName ?? paramName;
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
      const next = prev.filter(p => p.uid !== uid);
      updateProtocol.mutate({ id: protocolId, data: { customParamsJson: JSON.stringify(next) } });
      queryClient.setQueryData(
        getGetProtocolQueryKey(protocolId),
        (old: Record<string, unknown> | undefined) => old ? { ...old, customParamsJson: JSON.stringify(next) } : old,
      );
      return next;
    });
  };

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
  const [parameterField, setParameterField] = useState("");
  const [criteriaField, setCriteriaField] = useState("");

  const openCreate = () => { setShortName(""); setCitation(""); setCategory(""); setParameterField(""); setCriteriaField(""); setDialog({ mode: "create" }); };

  const openEdit = (m: { id: number; shortName: string; citation: string; category?: string | null; parameter?: string | null; criteria?: string | null }) => {
    setShortName(m.shortName);
    setCitation(m.citation);
    setCategory(m.category ?? "");
    setParameterField(m.parameter ?? "");
    setCriteriaField(m.criteria ?? "");
    setDialog({ mode: "edit", id: m.id, shortName: m.shortName, citation: m.citation, category: m.category ?? "", parameter: m.parameter ?? "", criteria: m.criteria ?? "" });
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

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!shortName.trim() || !citation.trim()) return;
    const data = {
      shortName: shortName.trim(),
      citation: citation.trim(),
      category: category.trim() || null,
      parameter: parameterField.trim() || null,
      criteria: criteriaField.trim() || null,
    };
    if (isEditing && dialog.mode === "edit") {
      updateMutation.mutate({ id: dialog.id, data });
    } else {
      createMutation.mutate({ data });
    }
  };

  return (
    <div className="space-y-6">

      {/* ═══════════════════════════════════════════════════════════════
          SEÇÃO 1 — PARÂMETROS CADASTRADOS
      ═══════════════════════════════════════════════════════════════ */}
      <div>
        <div className="flex items-start justify-between mb-3 gap-2">
          <div>
            <h3 className="font-semibold">Parâmetros Cadastrados</h3>
            <p className="text-sm text-muted-foreground">
              Todos os parâmetros de análise do protocolo. Clique em qualquer campo para editar o nome ou o critério.
            </p>
          </div>
        </div>

        <div className="space-y-3">
          {paramCategories.map(({ label, key }) => {
            const catParams = editableParams.filter(p => p.category === key);
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
                  const available = getPresetsForCategory(key).filter(
                    preset => !catParams.some(c => c.parameter === preset.parameter)
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
                        <th className="w-8"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {catParams.map((p) => (
                        <tr key={p.uid} className="border-b last:border-0 hover:bg-muted/20 transition-colors group">
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
                            <input
                              value={p.criterion}
                              onChange={e => updateParam(p.uid, "criterion", e.target.value)}
                              className="w-full bg-transparent focus:outline-none border-b border-transparent focus:border-primary text-xs text-muted-foreground font-mono transition-colors placeholder:text-muted-foreground/40"
                              placeholder="Critério de aceitação"
                            />
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
                                <ParamMethodSelector
                                  paramName={p.parameter}
                                  selected={p.methodologyShort ?? null}
                                  methodologies={methodologies}
                                  catalogEntries={getCatalogEntries(p.parameter)}
                                  onSelect={(s, c) => setParamMethodInTab(p.uid, p.parameter, s, c)}
                                  compact
                                />
                              </div>
                            ) : (
                              <ParamMethodSelector
                                paramName={p.parameter}
                                selected={null}
                                methodologies={methodologies}
                                catalogEntries={getCatalogEntries(p.parameter)}
                                onSelect={(s, c) => setParamMethodInTab(p.uid, p.parameter, s, c)}
                              />
                            )}
                          </td>
                          <td className="px-2 py-1.5 text-center">
                            <button
                              type="button"
                              onClick={() => removeParam(p.uid)}
                              className="text-muted-foreground/30 hover:text-destructive transition-colors opacity-0 group-hover:opacity-100"
                              title="Remover parâmetro"
                            >
                              <Trash2 className="h-3 w-3" />
                            </button>
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

        {isLoading ? (
          <div className="flex items-center gap-2 text-muted-foreground text-sm">
            <Loader2 className="h-4 w-4 animate-spin" /> Carregando...
          </div>
        ) : methodologies.length === 0 ? (
          <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
            Nenhuma referência cadastrada. Clique em "Nova Referência" para começar.
          </div>
        ) : (
          <div className="space-y-2">
            {methodologies.map((m) => {
              const docUrl = docUrls[String(m.id)];
              const isEditingDoc = editingDocId === m.id;
              return (
                <div key={m.id} className="flex items-start gap-3 rounded-lg border bg-muted/30 px-4 py-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium text-sm">{m.shortName}</span>
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
                initialCustomParamsJson={protocol.customParamsJson}
                initialPeriodDatesJson={protocol.periodDatesJson}
                initialParamMethodsJson={protocol.paramMethodsJson}
                initialParamMethodsCitationsJson={protocol.paramMethodsCitationsJson}
                protocolFinalStatus={protocol.finalStatus}
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
              />
            </CardContent>
          </Card>
        </TabsContent>
        <TabsContent value="metodologia">
          <Card>
            <CardContent className="pt-6">
              <MethodologiaTab protocolId={numId} initialCustomParamsJson={protocol.customParamsJson} />
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
      </Tabs>
    </div>
  );
}

function DocumentosTab({ protocolId }: { protocolId: number }) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [description, setDescription] = useState("");
  const [printing, setPrinting] = useState(false);

  const { data: protocol } = useGetProtocol(protocolId);
  const { data: attachments = [], isLoading } = useListAttachments(protocolId);

  const createAttachment = useCreateAttachment({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListAttachmentsQueryKey(protocolId) });
        setDescription("");
        toast({ title: "Documento anexado com sucesso" });
      },
      onError: () => toast({ title: "Erro ao registrar documento", variant: "destructive" }),
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

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = "";

    const allowed = [
      "application/pdf",
      "application/msword",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "image/png", "image/jpeg", "image/webp",
    ];
    if (!allowed.includes(file.type)) {
      toast({ title: "Tipo de arquivo não suportado", description: "Aceito: PDF, Word, imagens", variant: "destructive" });
      return;
    }
    const MAX_MB = 20;
    if (file.size > MAX_MB * 1024 * 1024) {
      toast({ title: `Arquivo muito grande (máx ${MAX_MB} MB)`, variant: "destructive" });
      return;
    }

    setUploading(true);
    setUploadProgress(10);
    try {
      const token = localStorage.getItem("alphafitus_token");
      const urlRes = await fetch("/api/storage/uploads/request-url", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ name: file.name, size: file.size, contentType: file.type }),
      });
      if (!urlRes.ok) throw new Error("Erro ao obter URL de upload");
      const { uploadURL, objectPath } = await urlRes.json() as { uploadURL: string; objectPath: string };

      setUploadProgress(40);
      const putRes = await fetch(uploadURL, {
        method: "PUT",
        body: file,
        headers: { "Content-Type": file.type },
      });
      if (!putRes.ok) throw new Error("Erro ao enviar arquivo");

      setUploadProgress(80);
      await createAttachment.mutateAsync({
        id: protocolId,
        data: {
          fileName: file.name,
          fileType: file.type,
          fileSizeBytes: file.size,
          objectPath,
          description: description || undefined,
        },
      });
      setUploadProgress(100);
    } catch (err) {
      toast({ title: "Falha no upload", description: err instanceof Error ? err.message : "Erro desconhecido", variant: "destructive" });
    } finally {
      setUploading(false);
      setUploadProgress(0);
    }
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
            placeholder="Descrição (opcional)"
            value={description}
            onChange={e => setDescription(e.target.value)}
            className="h-8 text-sm w-48"
            disabled={uploading}
          />
          <Button size="sm" onClick={() => fileInputRef.current?.click()} disabled={uploading}>
            {uploading ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : <Upload className="h-3.5 w-3.5 mr-1" />}
            {uploading ? `${uploadProgress}%` : "Anexar arquivo"}
          </Button>
          <input ref={fileInputRef} type="file" className="hidden" accept=".pdf,.doc,.docx,.png,.jpg,.jpeg,.webp" onChange={handleFileChange} />
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="flex items-center justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
        ) : attachments.length === 0 ? (
          <div className="text-center py-10 text-muted-foreground text-sm">
            <Paperclip className="h-8 w-8 mx-auto mb-2 opacity-30" />
            <p>Nenhum documento anexado.</p>
            <p className="text-xs mt-1">Anexe PDFs, arquivos Word ou imagens para apresentar em auditorias.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {attachments.map(att => (
              <div key={att.id} className="flex items-center gap-3 p-3 rounded-lg border bg-muted/30 hover:bg-muted/50 transition-colors">
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
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

const TIPO_LABELS_REF: Record<string, string> = {
  artigo: "Artigo", livro: "Livro", site: "Site/URL",
  regulamentacao: "Regulamentação", norma: "Norma Técnica", outro: "Outro",
};

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

function ReferencesTab({ protocolId }: { protocolId: number }) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [selectorOpen, setSelectorOpen] = useState(false);
  const [search, setSearch] = useState("");

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

  const linkedIds = new Set(protocolRefs.map(r => r.id));
  const available = allRefs.filter(r =>
    !linkedIds.has(r.id) &&
    (search === "" || r.titulo.toLowerCase().includes(search.toLowerCase()) || (r.autores ?? "").toLowerCase().includes(search.toLowerCase()))
  );

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <BookOpen className="h-4 w-4 text-primary" />
            <CardTitle className="text-base">Referências Bibliográficas</CardTitle>
            <span className="text-xs text-muted-foreground">(ABNT NBR 6023)</span>
          </div>
          <Button size="sm" variant="outline" onClick={() => { setSearch(""); setSelectorOpen(true); }}>
            <Plus className="h-3.5 w-3.5 mr-1" /> Adicionar Referência
          </Button>
        </div>
        <p className="text-xs text-muted-foreground mt-1">
          Selecione referências do banco de cadastros para associar a este protocolo.
          Para cadastrar novas referências, acesse <strong>Cadastros</strong> no menu lateral.
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
            <p className="text-xs mt-1">Clique em "Adicionar Referência" para selecionar do banco.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {protocolRefs.map((ref, idx) => (
              <div key={ref.id} className="flex items-start gap-3 p-3 rounded-lg border bg-muted/20 hover:bg-muted/40 transition-colors group">
                <span className="text-sm font-bold text-muted-foreground w-6 mt-0.5 flex-shrink-0">{idx + 1}.</span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap mb-1">
                    <span className="text-xs px-1.5 py-0.5 rounded bg-primary/10 text-primary font-medium">
                      {TIPO_LABELS_REF[ref.tipoReferencia] ?? ref.tipoReferencia}
                    </span>
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
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-7 w-7 p-0 text-destructive hover:text-destructive hover:bg-destructive/10 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0 mt-0.5"
                  title="Remover do protocolo"
                  onClick={() => removeRef.mutate({ id: protocolId, refId: ref.id })}
                >
                  <X className="h-3.5 w-3.5" />
                </Button>
              </div>
            ))}
          </div>
        )}
      </CardContent>

      {/* Selector dialog */}
      {selectorOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={() => setSelectorOpen(false)}>
          <div className="bg-background rounded-xl shadow-2xl w-full max-w-lg max-h-[80vh] flex flex-col mx-4" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between p-4 border-b">
              <h3 className="font-semibold text-base">Selecionar Referência</h3>
              <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => setSelectorOpen(false)}>
                <X className="h-3.5 w-3.5" />
              </Button>
            </div>
            <div className="p-3 border-b">
              <Input
                autoFocus
                placeholder="Buscar por título ou autor..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="h-8 text-sm"
              />
            </div>
            <div className="flex-1 overflow-y-auto p-2 space-y-1">
              {available.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-6">
                  {allRefs.length === 0
                    ? "Nenhuma referência cadastrada. Acesse Cadastros para adicionar."
                    : "Todas as referências já foram associadas ou nenhuma corresponde à busca."}
                </p>
              ) : (
                available.map(ref => (
                  <button
                    key={ref.id}
                    className="w-full text-left p-3 rounded-lg hover:bg-muted/60 transition-colors group"
                    onClick={() => {
                      addRef.mutate({ id: protocolId, data: { referenceId: ref.id } });
                      setSelectorOpen(false);
                    }}
                  >
                    <div className="flex items-center gap-2 mb-0.5">
                      <span className="text-xs px-1.5 py-0.5 rounded bg-primary/10 text-primary font-medium">
                        {TIPO_LABELS_REF[ref.tipoReferencia] ?? ref.tipoReferencia}
                      </span>
                      {ref.ano && <span className="text-xs text-muted-foreground">{ref.ano}</span>}
                    </div>
                    <p className="text-sm font-medium leading-snug">{ref.titulo}</p>
                    {ref.autores && <p className="text-xs text-muted-foreground">{ref.autores}</p>}
                  </button>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </Card>
  );
}
