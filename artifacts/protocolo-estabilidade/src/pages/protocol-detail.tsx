import { useParams, Link, useLocation } from "wouter";
import { useState } from "react";
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
  getGetProtocolQueryKey,
  getListLotsQueryKey,
  getListResultsQueryKey,
  getGetKineticsQueryKey,
  getGetCertificateQueryKey,
  getListProtocolsQueryKey,
  getGetProtocolStatsQueryKey,
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
import { ArrowLeft, Plus, Pencil, Trash2, FileText, CheckCircle2, XCircle, Loader2, FlaskConical, BarChart3, Award } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

const STATUS_LABELS: Record<string, string> = {
  rascunho: "Rascunho",
  em_andamento: "Em Andamento",
  concluido: "Concluido",
  aprovado: "Aprovado",
  reprovado: "Reprovado",
};

const STATUS_COLORS: Record<string, string> = {
  rascunho: "bg-slate-100 text-slate-700 border-slate-200",
  em_andamento: "bg-blue-100 text-blue-700 border-blue-200",
  concluido: "bg-purple-100 text-purple-700 border-purple-200",
  aprovado: "bg-green-100 text-green-700 border-green-200",
  reprovado: "bg-red-100 text-red-700 border-red-200",
};

const RESULT_STATUS_COLORS: Record<string, string> = {
  conforme: "text-green-700 bg-green-50 border-green-200",
  nao_conforme: "text-red-700 bg-red-50 border-red-200",
  na: "text-slate-500 bg-slate-50 border-slate-200",
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
  finalStatus: z.enum(["aprovado", "reprovado"]),
  conclusion: z.string().min(1, "Conclusao obrigatoria"),
  validityMonths: z.coerce.number().optional(),
  issueDate: z.string().optional(),
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
  const [tempAmostragem, setTempAmostragem] = useState("22,8°C");
  const [umidAmostragem, setUmidAmostragem] = useState("60% UR");
  const [tempRecebimento, setTempRecebimento] = useState("22,8°C");

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
  const [status, setStatus] = useState<"conforme" | "nao_conforme" | "na">(
    (result?.status as "conforme" | "nao_conforme" | "na") ?? "conforme"
  );
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
      },
    });
  };

  const open = () => {
    setValue(result?.result ?? "");
    setStatus((result?.status as "conforme" | "nao_conforme" | "na") ?? "conforme");
    setEditing(true);
  };

  const statusColors: Record<string, string> = {
    conforme: "text-green-700 bg-green-50 border-green-200",
    nao_conforme: "text-red-700 bg-red-50 border-red-200",
    na: "text-slate-500 bg-slate-50 border-slate-200",
  };

  const statusBtnColors: Record<string, string> = {
    conforme: "bg-green-100 text-green-700 border-green-300 font-bold",
    nao_conforme: "bg-red-100 text-red-700 border-red-300 font-bold",
    na: "bg-slate-100 text-slate-500 border-slate-300 font-bold",
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
        <div className="flex gap-0.5 justify-center">
          {(["conforme", "nao_conforme", "na"] as const).map((s) => (
            <button
              key={s}
              onClick={() => setStatus(s)}
              className={`text-[9px] px-1 py-0.5 rounded border transition-all ${status === s ? statusBtnColors[s] : "bg-white text-muted-foreground border-border"}`}
            >
              {s === "conforme" ? "C" : s === "nao_conforme" ? "NC" : "N/A"}
            </button>
          ))}
        </div>
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
      </div>
    );
  }

  return (
    <div
      onClick={open}
      onFocus={open}
      tabIndex={0}
      data-inline-cell
      className="cursor-pointer group flex items-center justify-center min-h-8 focus:outline-none focus:ring-2 focus:ring-primary/40 focus:ring-inset rounded"
      data-testid={`cell-${param.parameter}-${lotId}-${period}`}
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
  );
}

function ResultsTab({ protocolId }: { protocolId: number }) {
  const { data: lots = [] } = useListLots(protocolId, { query: { queryKey: getListLotsQueryKey(protocolId) } });
  const { data: results = [], isLoading } = useListResults(protocolId, { query: { queryKey: getListResultsQueryKey(protocolId) } });

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
      <p className="text-xs text-muted-foreground">Clique em qualquer célula para digitar o resultado. Use <kbd className="px-1 py-0.5 rounded bg-muted border text-xs">C</kbd> = Conforme · <kbd className="px-1 py-0.5 rounded bg-muted border text-xs">NC</kbd> = Não Conforme · <kbd className="px-1 py-0.5 rounded bg-muted border text-xs">N/A</kbd> = Não aplicável. Confirme com Enter ou OK.</p>

      {categories.map(({ label, key }) => {
        const params = ANALYSIS_PARAMETERS.filter((p) => p.category === key);
        return (
          <div key={key}>
            <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground mb-2">{label}</h3>
            <div className="rounded-md border overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/40">
                    <TableHead className="w-48 text-xs">Parametro</TableHead>
                    <TableHead className="w-40 text-xs">Criterio</TableHead>
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
                  {params.map((param) => (
                    <TableRow key={param.parameter} data-testid={`row-param-${param.parameter}`}>
                      <TableCell className="text-xs font-medium py-1">{param.parameter}</TableCell>
                      <TableCell className="text-xs text-muted-foreground py-1">{param.criterion}</TableCell>
                      {lots.map((lot) =>
                        PERIODS.map((period) => (
                          <TableCell key={`${lot.id}-${period}`} className="py-1 text-center align-middle">
                            <InlineCell
                              lotId={lot.id}
                              period={period}
                              param={param}
                              result={getResult(lot.id, period, param.parameter)}
                              protocolId={protocolId}
                              lots={lots}
                            />
                          </TableCell>
                        ))
                      )}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>
        );
      })}
    </div>
  );
}

type KineticOverride = {
  t0: string; t3: string; t6: string; media: string; k: string;
  thresholdMin: string; thresholdMax: string;
  shelfLife: string; validadePraticada: string;
};

function calcShelfLife(t0s: string, t3s: string, t6s: string, ks: string, thresholds: string): string {
  const t0 = parseFloat(t0s.replace(",", "."));
  const t3 = parseFloat(t3s.replace(",", "."));
  const t6 = parseFloat(t6s.replace(",", "."));
  const threshold = parseFloat(thresholds.replace(",", "."));
  let k = parseFloat(ks.replace(",", "."));

  if (!isNaN(t3) && !isNaN(t6) && t3 > 0 && t6 > 0 && isNaN(k)) {
    k = -Math.log(t6 / t3) / 3;
  }
  if (isNaN(k) || k <= 0) return "";

  const c0 = isNaN(t0) ? t6 : t0;
  const tValidity = -Math.log(threshold / c0) / k;
  if (tValidity <= 0 || isNaN(tValidity)) return "";
  return tValidity.toFixed(1);
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

function KineticsTab({ protocolId }: { protocolId: number }) {
  const { data: kinetics, isLoading } = useGetKinetics(protocolId, {
    query: { queryKey: getGetKineticsQueryKey(protocolId) },
  });

  const [overrides, setOverrides] = useState<Record<string, KineticOverride>>({});
  const [initialized, setInitialized] = useState(false);
  const [cardShelfLife, setCardShelfLife] = useState("");
  const [cardValidity, setCardValidity] = useState("");

  if (!initialized && kinetics) {
    const init: Record<string, KineticOverride> = {};
    for (const p of kinetics.parameters) {
      const t0 = p.t0 != null ? p.t0.toFixed(2) : "";
      const t3 = p.t3 != null ? p.t3.toFixed(2) : "";
      const t6 = p.t6 != null ? p.t6.toFixed(2) : "";
      init[p.parameter] = {
        t0, t3, t6,
        media: calcMedia(t0, t3, t6),
        k: p.k != null ? p.k.toFixed(6) : "",
        thresholdMin: p.minThresholdPercent.toString(),
        thresholdMax: "",
        shelfLife: p.estimatedShelfLifeMonths != null ? p.estimatedShelfLifeMonths.toFixed(1) : "",
        validadePraticada: "",
      };
    }
    setOverrides(init);
    setCardShelfLife(kinetics.estimatedShelfLifeMonths != null ? String(Math.floor(kinetics.estimatedShelfLifeMonths)) : "");
    setCardValidity(kinetics.recommendedValidityMonths != null ? String(kinetics.recommendedValidityMonths) : "");
    setInitialized(true);
  }

  const setField = (param: string, field: keyof KineticOverride, val: string) => {
    setOverrides((prev) => {
      const updated = { ...prev, [param]: { ...prev[param], [field]: val } };
      const ov = updated[param];
      if (field === "t0" || field === "t3" || field === "t6") {
        updated[param] = { ...updated[param], media: calcMedia(ov.t0, ov.t3, ov.t6) };
      }
      if (field !== "shelfLife" && field !== "validadePraticada" && field !== "media" && field !== "thresholdMax") {
        const computed = calcShelfLife(ov.t0, ov.t3, ov.t6, ov.k, ov.thresholdMin);
        if (computed) updated[param] = { ...updated[param], shelfLife: computed };
      }
      return updated;
    });
  };

  const resetToCalculated = () => {
    if (!kinetics) return;
    const reset: Record<string, KineticOverride> = {};
    for (const p of kinetics.parameters) {
      const t0 = p.t0 != null ? p.t0.toFixed(2) : "";
      const t3 = p.t3 != null ? p.t3.toFixed(2) : "";
      const t6 = p.t6 != null ? p.t6.toFixed(2) : "";
      reset[p.parameter] = {
        t0, t3, t6,
        media: calcMedia(t0, t3, t6),
        k: p.k != null ? p.k.toFixed(6) : "",
        thresholdMin: p.minThresholdPercent.toString(),
        thresholdMax: "",
        shelfLife: p.estimatedShelfLifeMonths != null ? p.estimatedShelfLifeMonths.toFixed(1) : "",
        validadePraticada: "",
      };
    }
    setOverrides(reset);
    setCardShelfLife(kinetics.estimatedShelfLifeMonths != null ? String(Math.floor(kinetics.estimatedShelfLifeMonths)) : "");
    setCardValidity(kinetics.recommendedValidityMonths != null ? String(kinetics.recommendedValidityMonths) : "");
  };

  if (isLoading) return <div className="text-center py-8 text-muted-foreground">Calculando...</div>;
  if (!kinetics) return <div className="text-center py-8 text-muted-foreground">Sem dados de cinetica. Insira resultados numericos na aba Resultados para Calcio e Vitamina D.</div>;

  const shelfLives = Object.values(overrides)
    .map((o) => parseFloat(o.shelfLife))
    .filter((v) => !isNaN(v) && v > 0);
  const minShelfLife = shelfLives.length > 0 ? Math.min(...shelfLives) : null;
  const limitingParam = Object.entries(overrides).find(([, o]) => parseFloat(o.shelfLife) === minShelfLife)?.[0] ?? null;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <p className="text-xs text-muted-foreground">Todos os valores são editáveis. Altere diretamente nas células — a vida útil é recalculada automaticamente.</p>
        <Button variant="outline" size="sm" onClick={resetToCalculated}>
          Restaurar valores calculados
        </Button>
      </div>

      <Card className="border-green-200 bg-green-50">
        <CardContent className="pt-4">
          <div className="flex items-center justify-between gap-8">
            <div className="flex-1">
              <p className="text-xs text-green-700 font-medium uppercase tracking-wide mb-1">Vida Útil Projetada</p>
              <div className="flex items-center gap-2">
                <input
                  value={cardShelfLife}
                  onChange={(e) => setCardShelfLife(e.target.value)}
                  className="w-24 text-3xl font-bold text-green-800 bg-green-100 border border-green-300 rounded px-2 py-0.5 focus:outline-none focus:ring-2 focus:ring-green-500"
                  placeholder="—"
                />
                <span className="text-xl font-semibold text-green-700">meses</span>
              </div>
              {limitingParam && <p className="text-xs text-green-700 mt-1">Parâmetro limitante: {limitingParam}</p>}
              {minShelfLife != null && (
                <p className="text-xs text-green-600 mt-1 opacity-70">Calculado: {Math.floor(minShelfLife)} meses</p>
              )}
            </div>
            <div className="flex-1 text-right">
              <p className="text-xs text-green-700 font-medium uppercase tracking-wide mb-1">Validade Recomendada</p>
              <div className="flex items-center gap-2 justify-end">
                <input
                  value={cardValidity}
                  onChange={(e) => setCardValidity(e.target.value)}
                  className="w-20 text-2xl font-bold text-green-800 bg-green-100 border border-green-300 rounded px-2 py-0.5 focus:outline-none focus:ring-2 focus:ring-green-500 text-right"
                  placeholder="—"
                />
                <span className="text-lg font-semibold text-green-700">meses</span>
              </div>
              <p className="text-xs text-green-700 mt-1">com margem conservadora</p>
              {minShelfLife != null && (
                <p className="text-xs text-green-600 mt-1 opacity-70">Calculado: {Math.floor(minShelfLife * 0.67)} meses</p>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="rounded-md border overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/40">
              <TableHead className="text-xs">Parâmetro</TableHead>
              <TableHead className="text-right text-xs">T0 (%)</TableHead>
              <TableHead className="text-right text-xs">T3 (%)</TableHead>
              <TableHead className="text-right text-xs">T6 (%)</TableHead>
              <TableHead className="text-right text-xs bg-blue-50/60">Média triplicata (%)</TableHead>
              <TableHead className="text-right text-xs">k (meses⁻¹)</TableHead>
              <TableHead className="text-right text-xs">T validade aprox. (meses)</TableHead>
              <TableHead className="text-right text-xs">Validade praticada (meses)</TableHead>
              <TableHead className="text-right text-xs">Range aceitável (%) mín – máx</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {kinetics.parameters.map((p) => {
              const ov = overrides[p.parameter];
              if (!ov) return null;
              const shelfNum = parseFloat(ov.shelfLife);
              const isLimiting = p.parameter === limitingParam;
              return (
                <TableRow key={p.parameter}>
                  <TableCell className="font-medium text-sm">{p.parameter}</TableCell>
                  <TableCell className="text-right py-2">
                    <EditableNum value={ov.t0} onChange={(v) => setField(p.parameter, "t0", v)} />
                  </TableCell>
                  <TableCell className="text-right py-2">
                    <EditableNum value={ov.t3} onChange={(v) => setField(p.parameter, "t3", v)} />
                  </TableCell>
                  <TableCell className="text-right py-2">
                    <EditableNum value={ov.t6} onChange={(v) => setField(p.parameter, "t6", v)} />
                  </TableCell>
                  <TableCell className="text-right py-2 bg-blue-50/40">
                    <EditableNum value={ov.media} onChange={(v) => setField(p.parameter, "media", v)} />
                  </TableCell>
                  <TableCell className="text-right py-2">
                    <EditableNum value={ov.k} onChange={(v) => setField(p.parameter, "k", v)} width="w-28" />
                  </TableCell>
                  <TableCell className="text-right py-2">
                    <div className="flex items-center justify-end gap-1">
                      <EditableNum value={ov.shelfLife} onChange={(v) => setField(p.parameter, "shelfLife", v)} width="w-20" />
                      {!isNaN(shelfNum) && shelfNum > 0 && (
                        <span className={`text-xs font-semibold ml-1 ${isLimiting ? "text-amber-600" : "text-green-700"}`}>
                          ≈ {Math.floor(shelfNum)} m
                        </span>
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="text-right py-2">
                    <EditableNum value={ov.validadePraticada} onChange={(v) => setField(p.parameter, "validadePraticada", v)} placeholder="ex: 24" />
                  </TableCell>
                  <TableCell className="text-right py-2">
                    <div className="flex items-center justify-end gap-1">
                      <EditableNum value={ov.thresholdMin} onChange={(v) => setField(p.parameter, "thresholdMin", v)} width="w-14" placeholder="mín" />
                      <span className="text-muted-foreground text-xs">–</span>
                      <EditableNum value={ov.thresholdMax} onChange={(v) => setField(p.parameter, "thresholdMax", v)} width="w-14" placeholder="máx" />
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

      <div className="rounded-md bg-slate-50 border border-slate-200 p-5 text-sm text-slate-700 space-y-4">
        <p className="font-semibold text-slate-800 text-sm">Fundamentação do Modelo Cinético</p>
        <p className="leading-relaxed">
          Para a estimativa do tempo de validade do produto, foi empregado o modelo cinético de degradação de primeira ordem, amplamente descrito na literatura para substâncias bioativas submetidas à avaliação de estabilidade sob condições de estresse controlado, como temperatura e umidade.
          A modelagem foi conduzida a partir da equação geral de primeira ordem:
        </p>
        <div className="font-mono bg-white border border-slate-200 rounded px-4 py-3 inline-block text-sm">
          C<sub>t</sub> = C<sub>0</sub> · e<sup>−kt</sup>
        </div>
        <div className="text-xs text-slate-600 space-y-1 pl-2 border-l-2 border-slate-300">
          <p>C<sub>t</sub> = concentração do ativo no tempo <em>t</em></p>
          <p>C<sub>0</sub> = concentração inicial do ativo</p>
          <p><em>k</em> = constante de velocidade de degradação</p>
          <p><em>t</em> = tempo de armazenamento</p>
        </div>
        <p className="leading-relaxed">
          A constante de degradação (<em>k</em>) é dependente da temperatura e pode ser descrita matematicamente pela equação de Arrhenius:
        </p>
        <div className="font-mono bg-white border border-slate-200 rounded px-4 py-3 inline-block text-sm">
          k = A · e<sup>−E<sub>a</sub>/RT</sup>
        </div>
        <div className="text-xs text-slate-600 space-y-1 pl-2 border-l-2 border-slate-300">
          <p>A = fator pré-exponencial</p>
          <p>E<sub>a</sub> = energia de ativação</p>
          <p>R = constante universal dos gases</p>
          <p>T = temperatura absoluta (Kelvin)</p>
        </div>
      </div>
    </div>
  );
}

function FinalizeSection({ protocolId, status }: { protocolId: number; status: string }) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);

  const form = useForm<z.infer<typeof finalizeSchema>>({
    resolver: zodResolver(finalizeSchema),
    defaultValues: {
      finalStatus: "aprovado",
      conclusion: "Produto de acordo com os padroes legais vigentes.",
      validityMonths: 24,
      issueDate: new Date().toISOString().split("T")[0],
    },
  });

  const finalize = useFinalizeProtocol({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getGetProtocolQueryKey(protocolId) });
        queryClient.invalidateQueries({ queryKey: getGetCertificateQueryKey(protocolId) });
        queryClient.invalidateQueries({ queryKey: getGetProtocolStatsQueryKey() });
        toast({ title: "Protocolo finalizado com sucesso" });
        setOpen(false);
      },
      onError: () => toast({ title: "Erro ao finalizar protocolo", variant: "destructive" }),
    },
  });

  if (status === "aprovado" || status === "reprovado") return null;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="default" data-testid="button-finalize">
          <Award className="h-4 w-4 mr-2" /> Finalizar Protocolo
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Avaliacao Final do Protocolo</DialogTitle>
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
                    <SelectItem value="aprovado">Aprovado</SelectItem>
                    <SelectItem value="reprovado">Reprovado</SelectItem>
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
                Confirmar Avaliacao
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

  const { data: protocol, isLoading } = useGetProtocol(numId, {
    query: { enabled: !!id, queryKey: getGetProtocolQueryKey(numId) },
  });

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
            </div>
            <p className="text-sm text-muted-foreground mt-0.5">
              {protocol.certNumber} &bull; {protocol.companyName}
            </p>
          </div>
        </div>
        <div className="flex gap-2 flex-wrap justify-end">
          <FinalizeSection protocolId={numId} status={protocol.status} />
          <Link href={`/protocols/${id}/certificate`}>
            <Button variant="outline" size="sm" data-testid="button-view-certificate">
              <Award className="h-4 w-4 mr-1" /> Certificado
            </Button>
          </Link>
          <Link href={`/protocols/${id}/edit`}>
            <Button variant="outline" size="sm" data-testid="button-edit-protocol">
              <Pencil className="h-4 w-4 mr-1" /> Editar
            </Button>
          </Link>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="outline" size="sm" data-testid="button-delete-protocol">
                <Trash2 className="h-4 w-4 text-destructive" />
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Remover protocolo?</AlertDialogTitle>
                <AlertDialogDescription>Esta acao e irreversivel e removera todos os lotes e resultados associados.</AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancelar</AlertDialogCancel>
                <AlertDialogAction onClick={() => deleteProtocol.mutate({ id: numId })}>Remover</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </div>

      {protocol.finalStatus && (
        <Card className={protocol.finalStatus === "aprovado" ? "border-green-200 bg-green-50" : "border-red-200 bg-red-50"}>
          <CardContent className="pt-4 pb-4">
            <div className="flex items-center gap-3">
              {protocol.finalStatus === "aprovado" ? (
                <CheckCircle2 className="h-5 w-5 text-green-600 flex-shrink-0" />
              ) : (
                <XCircle className="h-5 w-5 text-red-600 flex-shrink-0" />
              )}
              <div>
                <p className={`font-semibold text-sm ${protocol.finalStatus === "aprovado" ? "text-green-800" : "text-red-800"}`}>
                  STATUS: {protocol.finalStatus.toUpperCase()}
                  {protocol.validityMonths ? ` — Validade: ${protocol.validityMonths} meses` : ""}
                </p>
                {protocol.conclusion && <p className="text-xs text-muted-foreground mt-0.5">{protocol.conclusion}</p>}
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      <Tabs defaultValue="info" className="space-y-4">
        <TabsList>
          <TabsTrigger value="info" data-testid="tab-info">Informacoes</TabsTrigger>
          <TabsTrigger value="lots" data-testid="tab-lots">Lotes</TabsTrigger>
          <TabsTrigger value="results" data-testid="tab-results">Resultados</TabsTrigger>
          <TabsTrigger value="kinetics" data-testid="tab-kinetics">Cinetica</TabsTrigger>
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
              <ResultsTab protocolId={numId} />
            </CardContent>
          </Card>
        </TabsContent>
        <TabsContent value="kinetics">
          <Card>
            <CardContent className="pt-6">
              <KineticsTab protocolId={numId} />
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
