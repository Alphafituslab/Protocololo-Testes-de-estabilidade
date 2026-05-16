import { useParams, useLocation } from "wouter";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  useCreateProtocol,
  useGetProtocol,
  useUpdateProtocol,
  getGetProtocolQueryKey,
  getListProtocolsQueryKey,
  getGetProtocolStatsQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { ArrowLeft, Save, Loader2 } from "lucide-react";
import { Link } from "wouter";
import { useToast } from "@/hooks/use-toast";

const formSchema = z.object({
  certNumber: z.string().optional(),
  companyName: z.string().min(1, "Nome da empresa obrigatório"),
  cnpj: z.string().min(1, "CNPJ obrigatório"),
  ie: z.string().optional(),
  address: z.string().optional(),
  cep: z.string().optional(),
  productName: z.string().min(1, "Nome do produto obrigatório"),
  productType: z.string().optional(),
  packagingType: z.string().optional(),
  activeIngredients: z.string().optional(),
  excipients: z.string().optional(),
  capsuleComposition: z.string().optional(),
  studyStartDate: z.string().optional(),
  studyEndDate: z.string().optional(),
  studyObjective: z.string().optional(),
  storageTemp: z.string().optional(),
  storageHumidity: z.string().optional(),
  studyPeriodMonths: z.coerce.number().optional(),
  testIntervals: z.string().optional(),
  elaboratedBy: z.string().optional(),
  approvedBy: z.string().optional(),
  issuedBy: z.string().optional(),
  seniorAnalyst: z.string().optional(),
  seniorAnalystEmail: z.string().optional(),
  issuedByEmail: z.string().optional(),
});

type FormValues = z.infer<typeof formSchema>;

export default function ProtocolForm() {
  const { id } = useParams<{ id?: string }>();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const isEdit = !!id;

  const { data: existing } = useGetProtocol(Number(id), {
    query: { enabled: isEdit, queryKey: getGetProtocolQueryKey(Number(id)) },
  });

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    values: existing
      ? {
          certNumber: existing.certNumber ?? "",
          companyName: existing.companyName ?? "",
          cnpj: existing.cnpj ?? "",
          ie: existing.ie ?? "",
          address: existing.address ?? "",
          cep: existing.cep ?? "",
          productName: existing.productName ?? "",
          productType: existing.productType ?? "",
          packagingType: existing.packagingType ?? "",
          activeIngredients: existing.activeIngredients ?? "",
          excipients: existing.excipients ?? "",
          capsuleComposition: existing.capsuleComposition ?? "",
          studyStartDate: existing.studyStartDate ?? "",
          studyEndDate: existing.studyEndDate ?? "",
          studyObjective: existing.studyObjective ?? "",
          storageTemp: existing.storageTemp ?? "",
          storageHumidity: existing.storageHumidity ?? "",
          studyPeriodMonths: existing.studyPeriodMonths ?? undefined,
          testIntervals: existing.testIntervals ?? "",
          elaboratedBy: existing.elaboratedBy ?? "",
          approvedBy: existing.approvedBy ?? "",
          issuedBy: existing.issuedBy ?? "",
          seniorAnalyst: existing.seniorAnalyst ?? "",
          seniorAnalystEmail: existing.seniorAnalystEmail ?? "",
          issuedByEmail: existing.issuedByEmail ?? "",
        }
      : {
          certNumber: "",
          companyName: "ALPHAFITUS LABORATÓRIO NUTRACÊUTICO LTDA",
          cnpj: "01.481.057/0001-12",
          ie: "253385210",
          address: "Agenor Martinho Lima 41",
          cep: "88823290",
          productName: "",
          productType: "Suplemento Alimentar em Cápsula",
          packagingType: "",
          activeIngredients: "",
          excipients: "",
          capsuleComposition: "",
          studyStartDate: "",
          studyEndDate: "",
          studyObjective: "O presente estudo tem como objetivo avaliar a estabilidade físico-química e microbiológica do suplemento alimentar em cápsulas de Calcio + vitamina D, quando submetido a condições aceleradas de armazenamento (40°C ± 2°C / 75% ± 5% UR), assegurando que o produto mantenha suas características de qualidade, segurança, eficácia e o teor do ativo ao longo do período de estudo.",
          storageTemp: "40°C ± 2°C",
          storageHumidity: "75% UR ± 5% UR",
          studyPeriodMonths: 6,
          testIntervals: "0, 3, 6 meses",
          elaboratedBy: "Clayton Borges da Silva — Representante Legal CRF: 18580",
          approvedBy: "Clayton Borges da Silva — Representante Legal CRF: 18580",
          issuedBy: "Caroline Batista Pacheco — Responsável Técnica CRF: 7698",
          seniorAnalyst: "Clayton Borges da Silva — Representante Legal CRF: 18580",
          seniorAnalystEmail: "claytonborges@alphafitus.com",
          issuedByEmail: "carolinepacheco@alphafitus.com.br",
        },
  });

  const createProtocol = useCreateProtocol({
    mutation: {
      onSuccess: (data) => {
        queryClient.invalidateQueries({ queryKey: getListProtocolsQueryKey() });
        queryClient.invalidateQueries({ queryKey: getGetProtocolStatsQueryKey() });
        toast({ title: "Protocolo criado com sucesso" });
        setLocation(`/protocols/${data.id}`);
      },
      onError: () => toast({ title: "Erro ao criar protocolo", variant: "destructive" }),
    },
  });

  const updateProtocol = useUpdateProtocol({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getGetProtocolQueryKey(Number(id)) });
        queryClient.invalidateQueries({ queryKey: getListProtocolsQueryKey() });
        toast({ title: "Protocolo atualizado com sucesso" });
        setLocation(`/protocols/${id}`);
      },
      onError: () => toast({ title: "Erro ao atualizar protocolo", variant: "destructive" }),
    },
  });

  const onSubmit = (values: FormValues) => {
    if (isEdit) {
      updateProtocol.mutate({ id: Number(id), data: values });
    } else {
      createProtocol.mutate({ data: values });
    }
  };

  const isPending = createProtocol.isPending || updateProtocol.isPending;

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="flex items-center gap-4">
        <Link href={isEdit ? `/protocols/${id}` : "/"}>
          <Button variant="ghost" size="sm" data-testid="button-back">
            <ArrowLeft className="h-4 w-4 mr-2" /> Voltar
          </Button>
        </Link>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">
            {isEdit ? "Editar Protocolo" : "Novo Protocolo"}
          </h1>
          <p className="text-sm text-muted-foreground">
            {isEdit ? "Atualize as informações do protocolo de estabilidade" : "Preencha os dados do novo protocolo de estabilidade"}
          </p>
        </div>
      </div>

      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">1. Identificação da Empresa</CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-2 gap-4">
              <FormField control={form.control} name="companyName" render={({ field }) => (
                <FormItem className="col-span-2">
                  <FormLabel>Nome da Empresa</FormLabel>
                  <FormControl><Input data-testid="input-companyName" {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={form.control} name="cnpj" render={({ field }) => (
                <FormItem>
                  <FormLabel>CNPJ</FormLabel>
                  <FormControl><Input data-testid="input-cnpj" {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={form.control} name="ie" render={({ field }) => (
                <FormItem>
                  <FormLabel>IE</FormLabel>
                  <FormControl><Input data-testid="input-ie" {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={form.control} name="address" render={({ field }) => (
                <FormItem className="col-span-2">
                  <FormLabel>Endereço</FormLabel>
                  <FormControl><Input data-testid="input-address" {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={form.control} name="cep" render={({ field }) => (
                <FormItem>
                  <FormLabel>CEP</FormLabel>
                  <FormControl><Input data-testid="input-cep" {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">2. Identificação do Produto</CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-2 gap-4">
              <FormField control={form.control} name="certNumber" render={({ field }) => (
                <FormItem>
                  <FormLabel>Número do Certificado</FormLabel>
                  <FormControl><Input data-testid="input-certNumber" placeholder="ex: CERT-AF-20241210/035" {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={form.control} name="productName" render={({ field }) => (
                <FormItem>
                  <FormLabel>Nome do Produto</FormLabel>
                  <FormControl><Input data-testid="input-productName" {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={form.control} name="productType" render={({ field }) => (
                <FormItem>
                  <FormLabel>Tipo de Produto</FormLabel>
                  <FormControl><Input data-testid="input-productType" {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={form.control} name="packagingType" render={({ field }) => (
                <FormItem>
                  <FormLabel>Tipo de Pote</FormLabel>
                  <FormControl><Input data-testid="input-packagingType" {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={form.control} name="activeIngredients" render={({ field }) => (
                <FormItem className="col-span-2">
                  <FormLabel>Ingredientes Ativos</FormLabel>
                  <FormControl><Input data-testid="input-activeIngredients" {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={form.control} name="excipients" render={({ field }) => (
                <FormItem className="col-span-2">
                  <FormLabel>Excipientes</FormLabel>
                  <FormControl><Input data-testid="input-excipients" {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={form.control} name="capsuleComposition" render={({ field }) => (
                <FormItem className="col-span-2">
                  <FormLabel data-field="capsule-composition">{"Composi\u00e7\u00e3o da C\u00e1psula"}</FormLabel>
                  <FormControl><Input data-testid="input-capsuleComposition" {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">3. Plano de Estudo de Estabilidade</CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-2 gap-4">
              <FormField control={form.control} name="studyStartDate" render={({ field }) => (
                <FormItem>
                  <FormLabel>Data de Início</FormLabel>
                  <FormControl><Input type="date" data-testid="input-studyStartDate" {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={form.control} name="studyEndDate" render={({ field }) => (
                <FormItem>
                  <FormLabel>Data Final</FormLabel>
                  <FormControl><Input type="date" data-testid="input-studyEndDate" {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={form.control} name="storageTemp" render={({ field }) => (
                <FormItem>
                  <FormLabel>Temperatura de Armazenamento</FormLabel>
                  <FormControl><Input data-testid="input-storageTemp" {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={form.control} name="storageHumidity" render={({ field }) => (
                <FormItem>
                  <FormLabel>Umidade Relativa</FormLabel>
                  <FormControl><Input data-testid="input-storageHumidity" {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={form.control} name="studyPeriodMonths" render={({ field }) => (
                <FormItem>
                  <FormLabel>Período do Estudo (meses)</FormLabel>
                  <FormControl><Input type="number" data-testid="input-studyPeriodMonths" {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={form.control} name="testIntervals" render={({ field }) => (
                <FormItem>
                  <FormLabel>Intervalos de Teste</FormLabel>
                  <FormControl><Input data-testid="input-testIntervals" {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={form.control} name="studyObjective" render={({ field }) => (
                <FormItem className="col-span-2">
                  <FormLabel>OBJETIVO DO ESTUDO</FormLabel>
                  <FormControl>
                    <Textarea data-testid="input-studyObjective" rows={3} {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">4. Responsáveis</CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-2 gap-4">
              <FormField control={form.control} name="elaboratedBy" render={({ field }) => (
                <FormItem>
                  <FormLabel>Elaboração</FormLabel>
                  <FormControl><Input data-testid="input-elaboratedBy" {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={form.control} name="approvedBy" render={({ field }) => (
                <FormItem>
                  <FormLabel>Aprovação</FormLabel>
                  <FormControl><Input data-testid="input-approvedBy" {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={form.control} name="issuedBy" render={({ field }) => (
                <FormItem>
                  <FormLabel>Laudo emitido por</FormLabel>
                  <FormControl><Input data-testid="input-issuedBy" {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={form.control} name="seniorAnalyst" render={({ field }) => (
                <FormItem>
                  <FormLabel>Analista Sênior</FormLabel>
                  <FormControl><Input data-testid="input-seniorAnalyst" {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={form.control} name="issuedByEmail" render={({ field }) => (
                <FormItem>
                  <FormLabel>Email — Responsável Técnico</FormLabel>
                  <FormControl><Input type="email" data-testid="input-issuedByEmail" {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={form.control} name="seniorAnalystEmail" render={({ field }) => (
                <FormItem>
                  <FormLabel>Email — Analista Sênior</FormLabel>
                  <FormControl><Input type="email" data-testid="input-seniorAnalystEmail" {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
            </CardContent>
          </Card>

          <div className="flex justify-end gap-3">
            <Link href={isEdit ? `/protocols/${id}` : "/"}>
              <Button type="button" variant="outline" data-testid="button-cancel">Cancelar</Button>
            </Link>
            <Button type="submit" disabled={isPending} data-testid="button-submit">
              {isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
              {isEdit ? "Salvar Alterações" : "Criar Protocolo"}
            </Button>
          </div>
        </form>
      </Form>
    </div>
  );
}
