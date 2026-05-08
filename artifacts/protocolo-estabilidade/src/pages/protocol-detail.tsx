import { useParams, Link, useLocation } from "wouter";
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
import { ArrowLeft, Plus, Pencil, Trash2, FileText, CheckCircle2, XCircle, Loader2, FlaskConical, BarChart3, Award, Lock, Unlock, BookOpen, History } from "lucide-react";
import { AuditTrail } from "@/components/audit-trail";
import { useToast } from "@/hooks/use-toast";

const STATUS_LABELS: Record<string, string> = {
  rascunho: "Rascunho",
  em_andamento: "Em Andamento",
  concluido: "Concluido",
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
  { parameter: "Perda por dessecacao", category: "fisico_quimica", criterion: "≤ 5%" },
  { parameter: "Cor", category: "fisico_quimica", criterion: "Branco" },
  { parameter: "Odor", category: "fisico_quimica", criterion: "Caracteristico" },
  { parameter: "Aparencia", category: "fisico_quimica", criterion: "Homogenea" },
  { parameter: "Cinzas totais", category: "fisico_quimica", criterion: "≤ 50%" },
  { parameter: "Dissolucao", category: "fisico_quimica", criterion: "Q ≥ 80% em 30 min" },
  { parameter: "Massa media", category: "fisico_quimica", criterion: "± 7,5%" },
  { parameter: "Kcal", category: "fisico_quimica", criterion: "≤ 4 kcal declara 0" },
  { parameter: "Sodio", category: "fisico_quimica", criterion: "≤ 5 mg declara 0" },
  { parameter: "Coliformes totais", category: "microbiologica", criterion: "≤ 10 UFC/g" },
  { parameter: "Salmonella spp.", category: "microbiologica", criterion: "Ausente em 25 g" },
  { parameter: "Estafilococos coagulase+", category: "microbiologica", criterion: "≤ 10 UFC/g" },
  { parameter: "Bolores e leveduras", category: "microbiologica", criterion: "≤ 100 UFC/g" },
  { parameter: "Escherichia coli", category: "microbiologica", criterion: "Ausente" },
  { parameter: "Enterobacteriaceae", category: "microbiologica", criterion: "Ausente" },
  { parameter: "Calcio", category: "teor_ativo", criterion: "98,50% - 100,50%" },
  { parameter: "Vitamina D", category: "teor_ativo", criterion: "97,00% - 103,00%" },
  { parameter: "Torque de tampa", category: "embalagem", criterion: "2 unidades a cada 100" },
  { parameter: "Selagem por inducao", category: "embalagem", criterion: "2 unidades a cada 100" },
  { parameter: "Integridade selagem", category: "embalagem", criterion: "2 unidades a cada 100" },
];

const PERIODS = [0, 3, 6];

const lotSchema = z.object({
  lotNumber: z.string().min(1, "Numero do lote obrigatorio"),
  manufacturingDate: z.string().min(1, "Data obrigatoria"),
  quantity: z.coerce.number().min(1),
  notes: z.string().optional(),
});

const finalizeSchema = z.object({
  finalStatus: z.enum(["aprovado", "reprovado", "aprovado_com_ressalva"]),
  conclusion: z.string().min(1, "Conclusao obrigatoria"),
  validityMonths: z.coerce.number().optional(),
  issueDate: z.string().optional(),
  ressalva: z.string().optional(),
}).superRefine((data, ctx) => {
  if (data.finalStatus === "aprovado_com_ressalva" && (!data.ressalva || data.ressalva.trim().length < 10)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Obrigatorio descrever a ressalva (minimo 10 caracteres) para aprovar com ressalva.",
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

function EditableInfoField({ label, value, onChange, placeholder }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <div className="border-b border-border pb-2">
      <dt className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1">{label}</dt>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full text-sm font-medium bg-transparent border-0 border-b border-dashed border-primary/40 focus:outline-none focus:border-primary py-0.5 placeholder:text-muted-foreground/40"
      />
    </div>
  );
}

function ProtocolInfoTab({ protocol }: { protocol: GetProtocolQueryResult }) {
  const ENV_KEY = `cert_env_${protocol.id}`;

  const [tempAmostragem, setTempAmostragemRaw] = useState(() => {
    try { return JSON.parse(localStorage.getItem(ENV_KEY) ?? "{}").tempAmostragem ?? "22,8°C"; } catch { return "22,8°C"; }
  });
  const [umidAmostragem, setUmidAmostragemRaw] = useState(() => {
    try { return JSON.parse(localStorage.getItem(ENV_KEY) ?? "{}").umidAmostragem ?? "60% UR"; } catch { return "60% UR"; }
  });
  const [tempRecebimento, setTempRecebimentoRaw] = useState(() => {
    try { return JSON.parse(localStorage.getItem(ENV_KEY) ?? "{}").tempRecebimento ?? "22,8°C"; } catch { return "22,8°C"; }
  });

  const saveEnv = (patch: Partial<{ tempAmostragem: string; umidAmostragem: string; tempRecebimento: string }>) => {
    try {
      const current = JSON.parse(localStorage.getItem(ENV_KEY) ?? "{}");
      localStorage.setItem(ENV_KEY, JSON.stringify({ ...current, ...patch }));
    } catch { /* ignore */ }
  };
  const setTempAmostragem = (v: string) => { setTempAmostragemRaw(v); saveEnv({ tempAmostragem: v }); };
  const setUmidAmostragem = (v: string) => { setUmidAmostragemRaw(v); saveEnv({ umidAmostragem: v }); };
  const setTempRecebimento = (v: string) => { setTempRecebimentoRaw(v); saveEnv({ tempRecebimento: v }); };

  const fieldsTop = [
    { label: "Numero do Certificado", value: protocol.certNumber },
    { label: "Empresa", value: protocol.companyName },
    { label: "CNPJ", value: protocol.cnpj },
    { label: "IE", value: protocol.ie },
    { label: "Endereco", value: protocol.address },
    { label: "CEP", value: protocol.cep },
    { label: "Produto", value: protocol.productName },
    { label: "Tipo de Produto", value: protocol.productType },
    { label: "Embalagem", value: protocol.packagingType },
    { label: "Ingredientes Ativos", value: protocol.activeIngredients },
    { label: "Excipientes", value: protocol.excipients },
    { label: "Composicao Capsula", value: protocol.capsuleComposition },
  ];

  const fieldsBottom = [
    { label: "Data Inicio", value: protocol.studyStartDate },
    { label: "Data Final", value: protocol.studyEndDate },
    { label: "Temperatura de Estudo", value: protocol.storageTemp },
    { label: "Umidade de Estudo", value: protocol.storageHumidity },
    { label: "Periodo (meses)", value: protocol.studyPeriodMonths?.toString() },
    { label: "Intervalos de Teste", value: protocol.testIntervals },
    { label: "Elaboracao", value: protocol.elaboratedBy },
    { label: "Aprovacao", value: protocol.approvedBy },
    { label: "Emitido por", value: protocol.issuedBy },
    { label: "Analista Senior", value: protocol.seniorAnalyst },
  ];

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-x-8 gap-y-3">
        {fieldsTop.map(({ label, value }) => <InfoField key={label} label={label} value={value} />)}
      </div>

      <div className="rounded-md border border-amber-200 bg-amber-50/60 p-4 space-y-4">
        <p className="text-xs font-semibold uppercase tracking-wide text-amber-800">Condições Ambientais e de Recebimento</p>
        <div className="grid grid-cols-2 gap-x-8 gap-y-3">
          <EditableInfoField
            label="Condições ambientais durante amostragem — Temperatura"
            value={tempAmostragem}
            onChange={setTempAmostragem}
            placeholder="ex: 22,8°C"
          />
          <EditableInfoField
            label="Condições ambientais durante amostragem — Umidade"
            value={umidAmostragem}
            onChange={setUmidAmostragem}
            placeholder="ex: 60% UR"
          />
          <EditableInfoField
            label="Condições de recebimento da amostra — Temperatura"
            value={tempRecebimento}
            onChange={setTempRecebimento}
            placeholder="ex: 22,8°C"
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-x-8 gap-y-3">
        {fieldsBottom.map(({ label, value }) => <InfoField key={label} label={label} value={value} />)}
      </div>
    </div>
  );
}

function LotsTab({ protocolId }: { protocolId: number }) {
  const { data: lots = [], isLoading } = useListLots(protocolId, {
    query: { queryKey: getListLotsQueryKey(protocolId) },
  });
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [editLot, setEditLot] = useState<typeof lots[number] | null>(null);

  const form = useForm<z.infer<typeof lotSchema>>({
    resolver: zodResolver(lotSchema),
    defaultValues: { lotNumber: "", manufacturingDate: "", quantity: 20, notes: "" },
  });

  const createLot = useCreateLot({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListLotsQueryKey(protocolId) });
        queryClient.invalidateQueries({ queryKey: getGetProtocolQueryKey(protocolId) });
        toast({ title: "Lote adicionado" });
        setOpen(false);
        form.reset();
      },
    },
  });

  const updateLot = useUpdateLot({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListLotsQueryKey(protocolId) });
        toast({ title: "Lote atualizado" });
        setOpen(false);
        setEditLot(null);
        form.reset();
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
    form.reset({ lotNumber: lot.lotNumber, manufacturingDate: lot.manufacturingDate, quantity: lot.quantity, notes: lot.notes ?? "" });
    setOpen(true);
  };

  const openNew = () => {
    setEditLot(null);
    form.reset({ lotNumber: "", manufacturingDate: "", quantity: 20, notes: "" });
    setOpen(true);
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <p className="text-sm text-muted-foreground">Lotes piloto incluidos neste estudo</p>
        <Button size="sm" onClick={openNew} data-testid="button-add-lot">
          <Plus className="h-4 w-4 mr-1" /> Adicionar Lote
        </Button>
      </div>

      {isLoading ? (
        <div className="text-center py-8 text-muted-foreground">Carregando...</div>
      ) : lots.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground border rounded-md">
          Nenhum lote cadastrado. Adicione um lote para comecar.
        </div>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Numero do Lote</TableHead>
              <TableHead>Data de Fabricacao</TableHead>
              <TableHead>Quantidade</TableHead>
              <TableHead>Notas</TableHead>
              <TableHead className="w-20"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {lots.map((lot) => (
              <TableRow key={lot.id} data-testid={`row-lot-${lot.id}`}>
                <TableCell className="font-mono font-medium">{lot.lotNumber}</TableCell>
                <TableCell>{lot.manufacturingDate}</TableCell>
                <TableCell>{lot.quantity} unidades</TableCell>
                <TableCell className="text-muted-foreground text-sm">{lot.notes ?? "—"}</TableCell>
                <TableCell>
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
                          <AlertDialogDescription>Isso tambem removera todos os resultados associados a este lote.</AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancelar</AlertDialogCancel>
                          <AlertDialogAction onClick={() => deleteLot.mutate({ id: protocolId, lotId: lot.id })}>Remover</AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </div>
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

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editLot ? "Editar Lote" : "Adicionar Lote"}</DialogTitle>
          </DialogHeader>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              <FormField control={form.control} name="lotNumber" render={({ field }) => (
                <FormItem>
                  <FormLabel>Numero do Lote</FormLabel>
                  <FormControl><Input data-testid="input-lotNumber" placeholder="LP-20241210-639" {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              <div className="grid grid-cols-2 gap-4">
                <FormField control={form.control} name="manufacturingDate" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Data de Fabricacao</FormLabel>
                    <FormControl><Input type="date" data-testid="input-manufacturingDate" {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={form.control} name="quantity" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Quantidade</FormLabel>
                    <FormControl><Input type="number" data-testid="input-quantity" {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
              </div>
              <FormField control={form.control} name="notes" render={({ field }) => (
                <FormItem>
                  <FormLabel>Notas</FormLabel>
                  <FormControl><Input data-testid="input-notes" {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              <div className="flex justify-end gap-2">
                <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
                <Button type="submit" disabled={createLot.isPending || updateLot.isPending}>
                  {(createLot.isPending || updateLot.isPending) && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                  {editLot ? "Salvar" : "Adicionar"}
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
  lotId, period, param, result, protocolId, lots,
}: {
  lotId: number;
  period: number;
  param: { parameter: string; category: string; criterion: string };
  result: { result: string; status: string; observation?: string | null } | undefined;
  protocolId: number;
  lots: { id: number; lotNumber: string }[];
}) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(result?.result ?? "");
  const [status, setStatus] = useState<"conforme" | "nao_conforme" | "na" | "aprovado_com_ressalva">(
    (result?.status as "conforme" | "nao_conforme" | "na" | "aprovado_com_ressalva") ?? "conforme"
  );
  const [observation, setObservation] = useState(result?.observation ?? "");
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const upsertResult = useUpsertResult({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListResultsQueryKey(protocolId) });
        queryClient.invalidateQueries({ queryKey: getGetKineticsQueryKey(protocolId) });
        setEditing(false);
      },
      onError: () => {
        toast({ title: "Erro ao salvar", variant: "destructive" });
        setEditing(false);
      },
    },
  });

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
        analysisDate: new Date().toISOString().split("T")[0],
        category: param.category as "fisico_quimica" | "microbiologica" | "teor_ativo" | "embalagem",
        parameter: param.parameter,
        criterion: param.criterion,
        result: value,
        numericResult: parseFloat(value.replace(",", ".")) || undefined,
        status,
        observation: observation.trim() || undefined,
      },
    });
  };

  const open = () => {
    setValue(result?.result ?? "");
    setStatus((result?.status as "conforme" | "nao_conforme" | "na" | "aprovado_com_ressalva") ?? "conforme");
    setObservation(result?.observation ?? "");
    setEditing(true);
  };

  const statusColors: Record<string, string> = {
    conforme: "text-green-700 bg-green-50 border-green-200",
    nao_conforme: "text-red-700 bg-red-50 border-red-200",
    na: "text-slate-500 bg-slate-50 border-slate-200",
    aprovado_com_ressalva: "text-amber-700 bg-amber-50 border-amber-200",
  };

  const statusBtnColors: Record<string, string> = {
    conforme: "bg-green-100 text-green-700 border-green-300 font-bold",
    nao_conforme: "bg-red-100 text-red-700 border-red-300 font-bold",
    na: "bg-slate-100 text-slate-500 border-slate-300 font-bold",
    aprovado_com_ressalva: "bg-amber-100 text-amber-700 border-amber-300 font-bold",
  };

  if (editing) {
    return (
      <div className="flex flex-col gap-1 p-0.5 min-w-28" data-inline-cell onClick={(e) => e.stopPropagation()}>
        <input
          autoFocus
          value={value}
          onChange={(e) => setValue(e.target.value)}
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
              if (next) { setEditing(false); setTimeout(() => next.focus(), 30); }
            }
          }}
          className="w-full border border-primary rounded px-1.5 py-0.5 text-xs font-mono text-center focus:outline-none focus:ring-1 focus:ring-primary"
          placeholder="valor"
          data-testid="input-inline-result"
        />
        <div className="flex gap-0.5 justify-center flex-wrap">
          {(["conforme", "nao_conforme", "na", "aprovado_com_ressalva"] as const).map((s) => (
            <button
              key={s}
              onClick={() => setStatus(s)}
              className={`text-[9px] px-1 py-0.5 rounded border transition-all ${status === s ? statusBtnColors[s] : "bg-white text-muted-foreground border-border"}`}
            >
              {s === "conforme" ? "C" : s === "nao_conforme" ? "NC" : s === "na" ? "N/A" : "AR"}
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
            onClick={save}
            disabled={upsertResult.isPending}
            className="text-[9px] px-2 py-0.5 rounded bg-primary text-white hover:bg-primary/80 disabled:opacity-50"
          >
            {upsertResult.isPending ? "..." : "OK"}
          </button>
          <button
            onClick={() => setEditing(false)}
            className="text-[9px] px-2 py-0.5 rounded bg-muted text-muted-foreground hover:bg-muted/80"
          >
            ✕
          </button>
        </div>
        {value.trim() && (
          <button
            onClick={() => {
              for (const lot of lots) {
                for (const p of [0, 3, 6]) {
                  upsertResult.mutate({
                    id: protocolId,
                    data: {
                      lotId: lot.id,
                      period: p,
                      analysisDate: new Date().toISOString().split("T")[0],
                      category: param.category as "fisico_quimica" | "microbiologica" | "teor_ativo" | "embalagem",
                      parameter: param.parameter,
                      criterion: param.criterion,
                      result: value,
                      numericResult: parseFloat(value.replace(",", ".")) || undefined,
                      status,
                    },
                  });
                }
              }
              setEditing(false);
            }}
            className="text-[9px] px-1.5 py-0.5 rounded bg-blue-50 text-blue-700 hover:bg-blue-100 border border-blue-200 w-full mt-0.5"
            title="Preenche todos os lotes e períodos com este valor"
          >
            ↕ replicar todos
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
        onFocus={open}
        tabIndex={0}
        data-inline-cell
        className="cursor-pointer group flex items-center justify-center min-h-8 focus:outline-none focus:ring-2 focus:ring-primary/40 focus:ring-inset rounded w-full"
        title="Clique ou Tab para editar"
      >
        {result ? (
          <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-xs border font-medium group-hover:opacity-80 transition-opacity ${statusColors[result.status]}`}>
            {result.result}
          </span>
        ) : (
          <span className="text-muted-foreground/30 group-hover:text-muted-foreground/60 text-lg leading-none transition-colors">+</span>
        )}
      </div>
      <CellImages storageKey={imgKey} />
    </div>
  );
}

type EditableParam = { uid: string; parameter: string; category: string; criterion: string };

function ParamMethodSelector({
  paramName,
  selected,
  methodologies,
  onSelect,
}: {
  paramName: string;
  selected: string | null;
  methodologies: { id: number; shortName: string; citation: string; category?: string | null }[];
  onSelect: (shortName: string | null, citation: string | null) => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          className={`flex items-center gap-0.5 mt-0.5 text-[10px] rounded px-1 py-0 transition-colors ${
            selected
              ? "text-primary/80 hover:text-primary"
              : "text-muted-foreground/40 hover:text-muted-foreground"
          }`}
          title={selected ? `Metodologia: ${selected}` : "Selecionar metodologia"}
          onClick={(e) => e.stopPropagation()}
        >
          <BookOpen className="h-2.5 w-2.5 flex-shrink-0" />
          <span className="truncate max-w-[80px]">{selected ?? "método..."}</span>
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-80 p-2 z-50" side="right" align="start">
        <p className="text-xs font-semibold text-muted-foreground mb-2 px-1">
          Metodologia — <span className="font-normal italic">{paramName}</span>
        </p>
        {methodologies.length === 0 ? (
          <p className="text-xs text-muted-foreground italic px-1">
            Nenhuma metodologia cadastrada. Acesse a aba "Metodologia".
          </p>
        ) : (
          <div className="space-y-0.5 max-h-60 overflow-y-auto">
            {selected && (
              <button
                onClick={() => { onSelect(null, null); setOpen(false); }}
                className="w-full text-left text-[10px] px-2 py-1 rounded hover:bg-destructive/10 text-destructive"
              >
                × Remover seleção
              </button>
            )}
            {methodologies.map((m) => (
              <button
                key={m.id}
                onClick={() => { onSelect(m.shortName, m.citation); setOpen(false); }}
                className={`w-full text-left text-xs px-2 py-1.5 rounded hover:bg-muted transition-colors ${
                  selected === m.shortName ? "bg-primary/10 text-primary font-semibold" : ""
                }`}
              >
                <div className="font-medium text-[11px]">{m.shortName}</div>
                <div className="text-[9px] text-muted-foreground truncate leading-tight">{m.citation}</div>
              </button>
            ))}
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}

function ResultsTab({ protocolId, initialCustomParamsJson }: { protocolId: number; initialCustomParamsJson?: string | null }) {
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
    try {
      const raw = localStorage.getItem(`param_methods_${protocolId}`);
      return raw ? JSON.parse(raw) : {};
    } catch { return {}; }
  });

  const setParamMethod = (paramName: string, shortName: string | null, citation: string | null = null) => {
    setParamMethods((prev) => {
      const next = { ...prev };
      if (shortName === null) {
        delete next[paramName];
      } else {
        next[paramName] = shortName;
      }
      try {
        localStorage.setItem(`param_methods_${protocolId}`, JSON.stringify(next));
        // Also persist full citation so the certificate can use it in the Método column
        const citRaw = localStorage.getItem(`param_methods_citations_${protocolId}`);
        const citMap: Record<string, string> = citRaw ? JSON.parse(citRaw) : {};
        if (citation === null) {
          delete citMap[paramName];
        } else {
          citMap[paramName] = citation;
        }
        localStorage.setItem(`param_methods_citations_${protocolId}`, JSON.stringify(citMap));
      } catch { /* ignore */ }
      return next;
    });
  };

  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const updateProtocol = useUpdateProtocol();
  const queryClient = useQueryClient();

  // Refs and hooks for parameter rename → propagate to DB results
  const focusedOriginalName = useRef<string | null>(null);
  const renameUpsert = useUpsertResult({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListResultsQueryKey(protocolId) });
        queryClient.invalidateQueries({ queryKey: getGetKineticsQueryKey(protocolId) });
      },
    },
  });
  const renameDelete = useDeleteResult({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListResultsQueryKey(protocolId) });
        queryClient.invalidateQueries({ queryKey: getGetKineticsQueryKey(protocolId) });
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

  const saveParams = useCallback((params: EditableParam[]) => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      updateProtocol.mutate({ id: protocolId, data: { customParamsJson: JSON.stringify(params) } });
    }, 800);
  }, [protocolId, updateProtocol]);

  const updateParam = (uid: string, field: "parameter" | "criterion", val: string) => {
    setEditableParams((prev) => {
      const next = prev.map((p) => (p.uid === uid ? { ...p, [field]: val } : p));
      saveParams(next);
      return next;
    });
  };

  const addParam = (category: string) => {
    const uid = `${category}_${Date.now()}`;
    setEditableParams((prev) => {
      const next = [...prev, { uid, parameter: "", criterion: "", category }];
      saveParams(next);
      return next;
    });
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
      <div className="flex items-start justify-between gap-4">
        <p className="text-xs text-muted-foreground">
          Clique em qualquer célula para digitar o resultado. Use{" "}
          <kbd className="px-1 py-0.5 rounded bg-muted border text-xs">C</kbd> = Conforme ·{" "}
          <kbd className="px-1 py-0.5 rounded bg-muted border text-xs">NC</kbd> = Não Conforme ·{" "}
          <kbd className="px-1 py-0.5 rounded bg-muted border text-xs">N/A</kbd> = Não aplicável ·{" "}
          <kbd className="px-1 py-0.5 rounded bg-amber-100 border border-amber-300 text-amber-700 text-xs">AR</kbd> = Aprovado com Ressalva.
          Confirme com Enter ou OK.
        </p>
        <p className="text-xs text-primary/70 whitespace-nowrap shrink-0">Parâmetros e critérios são editáveis. Clique para alterar.</p>
      </div>

      {categories.map(({ label, key }) => {
        const catParams = editableParams.filter((p) => p.category === key);
        return (
          <div key={key}>
            <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground mb-2">{label}</h3>
            <div className="rounded-md border overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/40">
                    <TableHead className="w-44 text-xs">Parametro</TableHead>
                    <TableHead className="w-36 text-xs">Criterio</TableHead>
                    <TableHead className="w-6 text-xs"></TableHead>
                    {lots.map((lot) =>
                      PERIODS.map((period) => (
                        <TableHead key={`${lot.id}-${period}`} className="text-xs text-center min-w-28">
                          <div className="font-medium">{lot.lotNumber}</div>
                          <div className="text-muted-foreground font-normal">T{period}</div>
                        </TableHead>
                      ))
                    )}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {catParams.map((param) => {
                    const rowHasNonConforming = results.some(
                      (r) => r.parameter === param.parameter && r.status === "nao_conforme",
                    );
                    return (
                    <TableRow
                      key={param.uid}
                      data-testid={`row-param-${param.parameter}`}
                      className={rowHasNonConforming ? "bg-red-50 hover:bg-red-100" : ""}
                    >
                      <TableCell className="py-1 pr-1">
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
                          className="w-full text-xs font-medium bg-transparent border-b border-dashed border-transparent hover:border-muted-foreground/30 focus:border-primary focus:outline-none py-0.5 placeholder:text-muted-foreground/40"
                          placeholder="Nome do parâmetro"
                        />
                        <ParamMethodSelector
                          paramName={param.parameter}
                          selected={paramMethods[param.parameter] ?? null}
                          methodologies={methodologies}
                          onSelect={(s, c) => setParamMethod(param.parameter, s, c)}
                        />
                      </TableCell>
                      <TableCell className="py-1 pr-1">
                        <input
                          value={param.criterion}
                          onChange={(e) => updateParam(param.uid, "criterion", e.target.value)}
                          className="w-full text-xs text-muted-foreground bg-transparent border-b border-dashed border-transparent hover:border-muted-foreground/30 focus:border-primary focus:outline-none py-0.5 placeholder:text-muted-foreground/40"
                          placeholder="Critério de aceitação"
                        />
                      </TableCell>
                      <TableCell className="py-1 px-1 text-center">
                        <button
                          onClick={() => removeParam(param.uid)}
                          className="text-muted-foreground/20 hover:text-destructive text-base leading-none transition-colors"
                          title="Remover parâmetro"
                        >
                          ×
                        </button>
                      </TableCell>
                      {lots.map((lot) =>
                        PERIODS.map((period) => {
                          const cellResult = getResult(lot.id, period, param.parameter);
                          const isNC = cellResult?.status === "nao_conforme";
                          return (
                            <TableCell
                              key={`${lot.id}-${period}`}
                              className={`py-1 text-center align-middle ${isNC ? "bg-red-200 border-x border-red-400" : ""}`}
                            >
                              <InlineCell
                                lotId={lot.id}
                                period={period}
                                param={param}
                                result={cellResult}
                                protocolId={protocolId}
                                lots={lots}
                              />
                            </TableCell>
                          );
                        })
                      )}
                    </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
            <div className="flex justify-end mt-1 pr-1">
              <button
                onClick={() => addParam(key)}
                className="text-xs text-muted-foreground/60 hover:text-primary flex items-center gap-1 py-1 px-2 rounded hover:bg-muted transition-colors"
              >
                <Plus className="h-3 w-3" /> Adicionar parâmetro
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

  const [overrides, setOverrides] = useState<Record<string, KineticOverride>>({});
  const [cardValidity, setCardValidity] = useState("");
  const [kineticsObs, setKineticsObs] = useState(initialKineticsNotes ?? "");
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
      const raw = localStorage.getItem(LS_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed.overrides) savedOverrides = parsed.overrides;
        if (parsed.customShelfLife != null) savedCustomShelfLife = parsed.customShelfLife;
      }
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
  }, [kinetics, LS_KEY]);

  const persistOverrides = (next: Record<string, KineticOverride>, shelf = customShelfLife) => {
    try {
      localStorage.setItem(LS_KEY, JSON.stringify({ overrides: next, customShelfLife: shelf }));
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
    try { localStorage.removeItem(LS_KEY); } catch { /* ignore */ }
  };

  if (isLoading) return <div className="text-center py-8 text-muted-foreground">Calculando...</div>;
  if (!kinetics || kinetics.parameters.length === 0) return (
    <div className="text-center py-12 text-muted-foreground space-y-2">
      <p className="font-medium">Nenhum parâmetro de Teor do Ativo encontrado.</p>
      <p className="text-sm">Insira resultados numéricos na aba <strong>Resultados</strong> para os parâmetros da categoria <strong>Teor do Ativo</strong> (ex: Creatina, Cálcio, Vitamina D, etc.).</p>
    </div>
  );

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
                    setCardValidity(e.target.value);
                    const num = parseInt(e.target.value, 10);
                    debouncedSave({ validityMonths: isNaN(num) ? null : num });
                  }}
                  className="w-20 text-2xl font-bold text-green-800 bg-green-100 border border-green-300 rounded px-2 py-0.5 focus:outline-none focus:ring-2 focus:ring-green-500 text-right"
                  placeholder="—"
                />
                <span className="text-lg font-semibold text-green-700">meses</span>
              </div>
              <p className="text-xs text-green-700 mt-1">valor adotado no produto</p>
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
            setKineticsObs(e.target.value);
            debouncedSave({ kineticsNotes: e.target.value });
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
  | { mode: "edit"; id: number; shortName: string; citation: string; category: string };

function MethodologiaTab() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { data: methodologies = [], isLoading } = useListMethodologies();

  const [dialog, setDialog] = useState<MethodologyDialogState>({ mode: "closed" });
  const isOpen = dialog.mode !== "closed";
  const isEditing = dialog.mode === "edit";

  const [shortName, setShortName] = useState("");
  const [citation, setCitation] = useState("");
  const [category, setCategory] = useState("");

  const openCreate = () => {
    setShortName(""); setCitation(""); setCategory("");
    setDialog({ mode: "create" });
  };

  const openEdit = (m: { id: number; shortName: string; citation: string; category?: string | null }) => {
    setShortName(m.shortName);
    setCitation(m.citation);
    setCategory(m.category ?? "");
    setDialog({ mode: "edit", id: m.id, shortName: m.shortName, citation: m.citation, category: m.category ?? "" });
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
    const data = { shortName: shortName.trim(), citation: citation.trim(), category: category.trim() || null };
    if (isEditing && dialog.mode === "edit") {
      updateMutation.mutate({ id: dialog.id, data });
    } else {
      createMutation.mutate({ data });
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-semibold">Biblioteca de Metodologias</h3>
          <p className="text-sm text-muted-foreground">
            Referências bibliográficas usadas nos ensaios (ex: Farmacopeia Brasileira, AOAC, ISO).
          </p>
        </div>
        <Button size="sm" onClick={openCreate}>
          <Plus className="h-4 w-4 mr-1" /> Nova Referência
        </Button>
      </div>

      {/* Create / Edit dialog */}
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
          {methodologies.map((m) => (
            <div
              key={m.id}
              className="flex items-start gap-3 rounded-lg border bg-muted/30 px-4 py-3"
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-medium text-sm">{m.shortName}</span>
                  {m.category && (
                    <Badge variant="outline" className="text-xs">{m.category}</Badge>
                  )}
                </div>
                <p className="text-xs text-muted-foreground mt-0.5 break-words">{m.citation}</p>
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
          ))}
        </div>
      )}
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
  onNeedsUnlock,
}: {
  protocolId: number;
  status: string;
  currentFinalStatus?: string | null;
  currentConclusion?: string | null;
  currentValidityMonths?: number | null;
  currentIssueDate?: string | null;
  onNeedsUnlock?: () => void;
}) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);

  const isAlreadyFinalized = status === "aprovado" || status === "reprovado" || status === "aprovado_com_ressalva";

  const form = useForm<z.infer<typeof finalizeSchema>>({
    resolver: zodResolver(finalizeSchema),
    defaultValues: {
      finalStatus: (currentFinalStatus as "aprovado" | "reprovado" | "aprovado_com_ressalva") ?? "aprovado",
      conclusion: currentConclusion ?? "Produto de acordo com os padroes legais vigentes.",
      validityMonths: currentValidityMonths ?? 24,
      issueDate: currentIssueDate ?? new Date().toISOString().split("T")[0],
      ressalva: "",
    },
  });

  const finalStatusWatch = form.watch("finalStatus");

  // When the dialog opens, re-sync form values from current protocol data
  const handleOpenChange = (next: boolean) => {
    if (next) {
      form.reset({
        finalStatus: (currentFinalStatus as "aprovado" | "reprovado" | "aprovado_com_ressalva") ?? "aprovado",
        conclusion: currentConclusion ?? "Produto de acordo com os padroes legais vigentes.",
        validityMonths: currentValidityMonths ?? 24,
        issueDate: currentIssueDate ?? new Date().toISOString().split("T")[0],
        ressalva: "",
      });
    }
    setOpen(next);
  };

  const finalize = useFinalizeProtocol({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getGetProtocolQueryKey(protocolId) });
        queryClient.invalidateQueries({ queryKey: getGetCertificateQueryKey(protocolId) });
        queryClient.invalidateQueries({ queryKey: getGetProtocolStatsQueryKey() });
        toast({ title: isAlreadyFinalized ? "Avaliação corrigida com sucesso" : "Protocolo finalizado com sucesso" });
        setOpen(false);
      },
      onError: () => toast({ title: "Erro ao salvar avaliação", variant: "destructive" }),
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
            {isAlreadyFinalized ? "Corrigir Avaliação Final do Protocolo" : "Avaliacao Final do Protocolo"}
          </DialogTitle>
          {isAlreadyFinalized && (
            <p className="text-xs text-muted-foreground pt-1">
              Você pode alterar o status, conclusão, validade e data de emissão. Os resultados de análise devem ser corrigidos na aba Resultados.
            </p>
          )}
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit((v) => finalize.mutate({ id: protocolId, data: v }))} className="space-y-4">
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
            <FormField control={form.control} name="conclusion" render={({ field }) => (
              <FormItem>
                <FormLabel>Conclusao</FormLabel>
                <FormControl><Textarea rows={3} data-testid="input-conclusion" {...field} /></FormControl>
                <FormMessage />
              </FormItem>
            )} />
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
                  <FormLabel>Data de Emissao</FormLabel>
                  <FormControl><Input type="date" data-testid="input-issueDate" {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
            </div>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
              <Button type="submit" disabled={finalize.isPending}>
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
  const { unlocked, unlock, lock } = useUnlock();
  const [unlockDialogOpen, setUnlockDialogOpen] = useState(false);
  const [pendingAction, setPendingAction] = useState<(() => void) | null>(null);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [deletePasswordOpen, setDeletePasswordOpen] = useState(false);

  const { data: protocol, isLoading } = useGetProtocol(numId, {
    query: { enabled: !!id, queryKey: getGetProtocolQueryKey(numId) },
  });

  const isFinalized = !!(protocol?.finalStatus === "aprovado" || protocol?.finalStatus === "reprovado" || protocol?.finalStatus === "aprovado_com_ressalva");
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
        queryClient.invalidateQueries({ queryKey: getListProtocolsQueryKey() });
        queryClient.invalidateQueries({ queryKey: getGetProtocolStatsQueryKey() });
        toast({ title: "Protocolo removido" });
        setLocation("/");
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
        <p>Protocolo nao encontrado.</p>
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
          <FinalizeSection
            protocolId={numId}
            status={protocol.status}
            currentFinalStatus={protocol.finalStatus}
            currentConclusion={protocol.conclusion}
            currentValidityMonths={protocol.validityMonths}
            currentIssueDate={protocol.issueDate}
            onNeedsUnlock={needsPassword ? () => { setPendingAction(null); setUnlockDialogOpen(true); } : undefined}
          />
          <Link href={`/protocols/${id}/certificate`}>
            <Button variant="outline" size="sm" data-testid="button-view-certificate">
              <Award className="h-4 w-4 mr-1" /> Certificado
            </Button>
          </Link>
          {/* Edit — guarded */}
          <Button
            variant="outline"
            size="sm"
            data-testid="button-edit-protocol"
            onClick={() => guardedAction(() => setLocation(`/protocols/${id}/edit`))}
          >
            {needsPassword ? <Lock className="h-4 w-4 mr-1 text-amber-500" /> : <Pencil className="h-4 w-4 mr-1" />}
            Editar
          </Button>
          {/* Delete — always requires password */}
          <Button
            variant="outline"
            size="sm"
            data-testid="button-delete-protocol"
            onClick={() => setDeletePasswordOpen(true)}
          >
            <Trash2 className="h-4 w-4 text-destructive" />
          </Button>
          {/* Step 1: password dialog for delete */}
          <UnlockDialog
            open={deletePasswordOpen}
            onOpenChange={setDeletePasswordOpen}
            onUnlock={unlock}
            title="Confirmação de senha"
            description="A remoção de um protocolo é irreversível. Digite a senha mestra para confirmar."
            submitLabel="Confirmar"
            onSuccess={() => { setDeletePasswordOpen(false); setDeleteConfirmOpen(true); }}
          />
          {/* Step 2: final confirmation */}
          <AlertDialog open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen}>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Remover protocolo?</AlertDialogTitle>
                <AlertDialogDescription>Esta ação é irreversível e removerá todos os lotes e resultados associados.</AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancelar</AlertDialogCancel>
                <AlertDialogAction
                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                  onClick={() => { deleteProtocol.mutate({ id: numId }); setDeleteConfirmOpen(false); }}
                >
                  Remover permanentemente
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </div>

      {protocol.finalStatus && (() => {
        const fs = protocol.finalStatus;
        const isAprovado = fs === "aprovado";
        const isRessalva = fs === "aprovado_com_ressalva";
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
        return (
          <Card className={cardClass}>
            <CardContent className="pt-4 pb-4">
              <div className="flex items-center gap-3">
                {icon}
                <div>
                  <p className={`font-semibold text-sm ${textClass}`}>
                    STATUS: {label}
                    {protocol.validityMonths ? ` — Validade: ${protocol.validityMonths} meses` : ""}
                  </p>
                  {protocol.conclusion && <p className="text-xs text-muted-foreground mt-0.5">{protocol.conclusion}</p>}
                </div>
              </div>
            </CardContent>
          </Card>
        );
      })()}

      <Tabs defaultValue="info" className="space-y-4">
        <TabsList>
          <TabsTrigger value="info" data-testid="tab-info">Informacoes</TabsTrigger>
          <TabsTrigger value="lots" data-testid="tab-lots">Lotes</TabsTrigger>
          <TabsTrigger value="results" data-testid="tab-results">Resultados</TabsTrigger>
          <TabsTrigger value="kinetics" data-testid="tab-kinetics">Cinetica</TabsTrigger>
          <TabsTrigger value="metodologia" data-testid="tab-metodologia">Metodologia</TabsTrigger>
          <TabsTrigger value="historico" data-testid="tab-historico"><History className="h-3.5 w-3.5 mr-1" />Histórico</TabsTrigger>
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
              <ResultsTab protocolId={numId} initialCustomParamsJson={protocol.customParamsJson} />
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
              <MethodologiaTab />
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
      </Tabs>
    </div>
  );
}
