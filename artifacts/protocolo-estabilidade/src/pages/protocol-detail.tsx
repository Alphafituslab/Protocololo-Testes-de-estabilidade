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

function ProtocolInfoTab({ protocol }: { protocol: GetProtocolQueryResult }) {
  const fields = [
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
    { label: "Data Inicio", value: protocol.studyStartDate },
    { label: "Data Final", value: protocol.studyEndDate },
    { label: "Temperatura", value: protocol.storageTemp },
    { label: "Umidade", value: protocol.storageHumidity },
    { label: "Periodo (meses)", value: protocol.studyPeriodMonths?.toString() },
    { label: "Intervalos de Teste", value: protocol.testIntervals },
    { label: "Elaboracao", value: protocol.elaboratedBy },
    { label: "Aprovacao", value: protocol.approvedBy },
    { label: "Emitido por", value: protocol.issuedBy },
    { label: "Analista Senior", value: protocol.seniorAnalyst },
  ];

  return (
    <div className="grid grid-cols-2 gap-x-8 gap-y-3">
      {fields.map(({ label, value }) =>
        value ? (
          <div key={label} className="border-b border-border pb-2">
            <dt className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{label}</dt>
            <dd className="mt-0.5 text-sm font-medium">{value}</dd>
          </div>
        ) : null
      )}
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

function ResultsTab({ protocolId }: { protocolId: number }) {
  const { data: lots = [] } = useListLots(protocolId, { query: { queryKey: getListLotsQueryKey(protocolId) } });
  const { data: results = [], isLoading } = useListResults(protocolId, { query: { queryKey: getListResultsQueryKey(protocolId) } });
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [editCell, setEditCell] = useState<{ lotId: number; period: number; parameter: string; category: string; criterion: string } | null>(null);
  const [editValue, setEditValue] = useState("");
  const [editStatus, setEditStatus] = useState("conforme");
  const [editObs, setEditObs] = useState("");
  const [saving, setSaving] = useState(false);

  const upsertResult = useUpsertResult({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListResultsQueryKey(protocolId) });
        queryClient.invalidateQueries({ queryKey: getGetKineticsQueryKey(protocolId) });
        setEditCell(null);
        setSaving(false);
      },
      onError: () => {
        toast({ title: "Erro ao salvar resultado", variant: "destructive" });
        setSaving(false);
      },
    },
  });

  const getResult = (lotId: number, period: number, parameter: string) =>
    results.find((r) => r.lotId === lotId && r.period === period && r.parameter === parameter);

  const openEdit = (lotId: number, period: number, param: { parameter: string; category: string; criterion: string }) => {
    const existing = getResult(lotId, period, param.parameter);
    setEditCell({ lotId, period, ...param });
    setEditValue(existing?.result ?? "");
    setEditStatus(existing?.status ?? "conforme");
    setEditObs(existing?.observation ?? "");
  };

  const saveResult = () => {
    if (!editCell) return;
    setSaving(true);
    const lot = lots.find((l) => l.id === editCell.lotId);
    upsertResult.mutate({
      id: protocolId,
      data: {
        lotId: editCell.lotId,
        period: editCell.period,
        analysisDate: new Date().toISOString().split("T")[0],
        category: editCell.category as "fisico_quimica" | "microbiologica" | "teor_ativo" | "embalagem",
        parameter: editCell.parameter,
        criterion: editCell.criterion,
        result: editValue,
        numericResult: parseFloat(editValue) || undefined,
        status: editStatus as "conforme" | "nao_conforme" | "na",
        observation: editObs || undefined,
      },
    });
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
      {editCell && (
        <Card className="border-primary/40 bg-primary/5">
          <CardContent className="pt-4">
            <div className="flex items-start justify-between gap-4">
              <div className="flex-1">
                <p className="text-sm font-semibold mb-1">{editCell.parameter} — Lote {lots.find(l => l.id === editCell.lotId)?.lotNumber} — T{editCell.period}</p>
                <p className="text-xs text-muted-foreground mb-3">Criterio: {editCell.criterion}</p>
                <div className="flex gap-3 items-start flex-wrap">
                  <div>
                    <label className="text-xs font-medium block mb-1">Resultado</label>
                    <Input
                      value={editValue}
                      onChange={(e) => setEditValue(e.target.value)}
                      className="w-40"
                      placeholder="ex: 9,21"
                      data-testid="input-result-value"
                      autoFocus
                    />
                  </div>
                  <div>
                    <label className="text-xs font-medium block mb-1">Status</label>
                    <Select value={editStatus} onValueChange={setEditStatus}>
                      <SelectTrigger className="w-36" data-testid="select-result-status">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="conforme">Conforme</SelectItem>
                        <SelectItem value="nao_conforme">Nao Conforme</SelectItem>
                        <SelectItem value="na">N/A</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="flex-1 min-w-32">
                    <label className="text-xs font-medium block mb-1">Observacao</label>
                    <Input value={editObs} onChange={(e) => setEditObs(e.target.value)} placeholder="Opcional" data-testid="input-result-obs" />
                  </div>
                </div>
              </div>
              <div className="flex gap-2 mt-6">
                <Button size="sm" onClick={saveResult} disabled={saving} data-testid="button-save-result">
                  {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Salvar"}
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setEditCell(null)}>Cancelar</Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

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
                        <TableHead key={`${lot.id}-${period}`} className="text-xs text-center min-w-24">
                          <div className="font-medium">{lot.lotNumber.split("-").slice(-1)[0]}</div>
                          <div className="text-muted-foreground font-normal">T{period}</div>
                        </TableHead>
                      ))
                    )}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {params.map((param) => (
                    <TableRow key={param.parameter} data-testid={`row-param-${param.parameter}`}>
                      <TableCell className="text-xs font-medium py-2">{param.parameter}</TableCell>
                      <TableCell className="text-xs text-muted-foreground py-2">{param.criterion}</TableCell>
                      {lots.map((lot) =>
                        PERIODS.map((period) => {
                          const result = getResult(lot.id, period, param.parameter);
                          const isActive = editCell?.lotId === lot.id && editCell?.period === period && editCell?.parameter === param.parameter;
                          return (
                            <TableCell
                              key={`${lot.id}-${period}`}
                              className={`text-xs text-center py-1 cursor-pointer transition-colors hover:bg-muted/60 ${isActive ? "ring-2 ring-primary ring-inset" : ""}`}
                              onClick={() => openEdit(lot.id, period, param)}
                              data-testid={`cell-${param.parameter}-${lot.id}-${period}`}
                            >
                              {result ? (
                                <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-xs border font-medium ${RESULT_STATUS_COLORS[result.status]}`}>
                                  {result.result}
                                </span>
                              ) : (
                                <span className="text-muted-foreground/40">—</span>
                              )}
                            </TableCell>
                          );
                        })
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

function KineticsTab({ protocolId }: { protocolId: number }) {
  const { data: kinetics, isLoading } = useGetKinetics(protocolId, {
    query: { queryKey: getGetKineticsQueryKey(protocolId) },
  });

  if (isLoading) return <div className="text-center py-8 text-muted-foreground">Calculando...</div>;
  if (!kinetics) return <div className="text-center py-8 text-muted-foreground">Sem dados de cinetica.</div>;

  return (
    <div className="space-y-6">
      {kinetics.estimatedShelfLifeMonths != null && (
        <Card className="border-green-200 bg-green-50">
          <CardContent className="pt-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-green-700 font-medium uppercase tracking-wide">Vida Util Projetada</p>
                <p className="text-3xl font-bold text-green-800 mt-1">{Math.floor(kinetics.estimatedShelfLifeMonths)} meses</p>
                <p className="text-xs text-green-700 mt-1">Parametro limitante: {kinetics.limitingParameter}</p>
              </div>
              {kinetics.recommendedValidityMonths != null && (
                <div className="text-right">
                  <p className="text-xs text-green-700 font-medium uppercase tracking-wide">Validade Recomendada</p>
                  <p className="text-2xl font-bold text-green-800 mt-1">{kinetics.recommendedValidityMonths} meses</p>
                  <p className="text-xs text-green-700 mt-1">com margem conservadora</p>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/40">
              <TableHead>Parametro</TableHead>
              <TableHead className="text-right">T0 (%)</TableHead>
              <TableHead className="text-right">T3 (%)</TableHead>
              <TableHead className="text-right">T6 (%)</TableHead>
              <TableHead className="text-right">k (meses⁻¹)</TableHead>
              <TableHead className="text-right">Vida Util Est.</TableHead>
              <TableHead className="text-right">Limite min.</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {kinetics.parameters.map((p) => (
              <TableRow key={p.parameter}>
                <TableCell className="font-medium">{p.parameter}</TableCell>
                <TableCell className="text-right font-mono">{p.t0 != null ? p.t0.toFixed(2) : "—"}</TableCell>
                <TableCell className="text-right font-mono">{p.t3 != null ? p.t3.toFixed(2) : "—"}</TableCell>
                <TableCell className="text-right font-mono">{p.t6 != null ? p.t6.toFixed(2) : "—"}</TableCell>
                <TableCell className="text-right font-mono text-sm">{p.k != null ? p.k.toFixed(6) : "—"}</TableCell>
                <TableCell className="text-right">
                  {p.estimatedShelfLifeMonths != null ? (
                    <span className={`font-semibold ${p.parameter === kinetics.limitingParameter ? "text-amber-600" : "text-green-700"}`}>
                      {Math.floor(p.estimatedShelfLifeMonths)} meses
                    </span>
                  ) : "—"}
                </TableCell>
                <TableCell className="text-right text-muted-foreground">{p.minThresholdPercent}%</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <div className="rounded-md bg-muted/30 border p-4 text-sm text-muted-foreground space-y-2">
        <p className="font-medium text-foreground text-xs uppercase tracking-wide">Modelo Cinetico Aplicado</p>
        <p>C<sub>t</sub> = C<sub>0</sub> · e<sup>−kt</sup> &nbsp;|&nbsp; k = −ln(C₆/C₃) / (6−3)</p>
        <p>Vida util = −ln(C_min / C₀) / k &nbsp;(com C_min = 80% do teor inicial)</p>
        <p>Conforme ICH Q1A(R2) e Farmacopeia Brasileira 7ª ed.</p>
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
