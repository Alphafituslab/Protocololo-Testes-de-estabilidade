import { useParams, Link } from "wouter";
import { useGetCertificate, getGetCertificateQueryKey } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Printer, CheckCircle2, XCircle } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";

export default function CertificatePage() {
  const { id } = useParams<{ id: string }>();
  const { data: cert, isLoading } = useGetCertificate(Number(id), {
    query: { enabled: !!id, queryKey: getGetCertificateQueryKey(Number(id)) },
  });

  if (isLoading) {
    return (
      <div className="max-w-4xl mx-auto space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }

  if (!cert) {
    return (
      <div className="text-center py-16 text-muted-foreground">
        <p>Certificado nao encontrado.</p>
        <Link href={`/protocols/${id}`}>
          <Button variant="link" className="mt-2">Voltar ao Protocolo</Button>
        </Link>
      </div>
    );
  }

  const isApproved = cert.finalStatus === "aprovado";
  const isRepproved = cert.finalStatus === "reprovado";

  return (
    <div className="max-w-4xl mx-auto space-y-4">
      <div className="flex items-center justify-between print:hidden">
        <Link href={`/protocols/${id}`}>
          <Button variant="ghost" size="sm" data-testid="button-back">
            <ArrowLeft className="h-4 w-4 mr-2" /> Voltar ao Protocolo
          </Button>
        </Link>
        <Button onClick={() => window.print()} data-testid="button-print">
          <Printer className="h-4 w-4 mr-2" /> Imprimir / Salvar PDF
        </Button>
      </div>

      <div
        id="certificate-document"
        className="bg-white text-gray-900 border border-gray-300 shadow-lg rounded-sm p-10 font-sans text-sm leading-relaxed"
        data-testid="certificate-document"
      >
        <div className="flex items-start justify-between border-b-2 border-gray-800 pb-4 mb-6">
          <div>
            <p className="text-xs font-bold uppercase tracking-widest text-gray-500 mb-1">Alphafitus Laboratorio Nutraceutico</p>
            <h1 className="text-2xl font-bold uppercase tracking-wide">Suplemento Alimentar</h1>
            <p className="text-base font-semibold text-gray-600 mt-0.5">{cert.productName}</p>
          </div>
          <div className="text-right text-sm space-y-1 min-w-48">
            <div>
              <span className="text-gray-500 text-xs block">Numero</span>
              <span className="font-bold tracking-wide">{cert.certNumber}</span>
            </div>
            <div>
              <span className="text-gray-500 text-xs block">Data de Emissao</span>
              <span className="font-medium">{cert.issueDate}</span>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-6 mb-6 text-sm">
          <div className="space-y-2">
            <h2 className="text-xs font-bold uppercase tracking-widest text-gray-500 border-b pb-1">Dados do Produto</h2>
            <dl className="space-y-1">
              <div className="flex gap-2"><dt className="text-gray-500 min-w-20">Empresa:</dt><dd className="font-medium">{cert.companyName}</dd></div>
              <div className="flex gap-2"><dt className="text-gray-500 min-w-20">CNPJ:</dt><dd className="font-medium">{cert.cnpj}</dd></div>
              {cert.address && <div className="flex gap-2"><dt className="text-gray-500 min-w-20">Endereco:</dt><dd>{cert.address}</dd></div>}
              {cert.email && <div className="flex gap-2"><dt className="text-gray-500 min-w-20">Email:</dt><dd>{cert.email}</dd></div>}
            </dl>
          </div>
          <div className="space-y-2">
            <h2 className="text-xs font-bold uppercase tracking-widest text-gray-500 border-b pb-1">Identificacao</h2>
            <dl className="space-y-1">
              <div className="flex gap-2"><dt className="text-gray-500 min-w-20">Produto:</dt><dd className="font-medium">{cert.productName}</dd></div>
              {cert.presentation && <div className="flex gap-2"><dt className="text-gray-500 min-w-20">Apresentacao:</dt><dd>{cert.presentation}</dd></div>}
              {cert.validityMonths && <div className="flex gap-2"><dt className="text-gray-500 min-w-20">Validade:</dt><dd className="font-semibold">{cert.validityMonths} meses</dd></div>}
              {cert.lotNumbers.length > 0 && (
                <div className="flex gap-2">
                  <dt className="text-gray-500 min-w-20">N° do Lote:</dt>
                  <dd>{cert.lotNumbers.join(", ")}</dd>
                </div>
              )}
            </dl>
          </div>
        </div>

        <div className="mb-6">
          <h2 className="text-xs font-bold uppercase tracking-widest text-gray-500 border-b pb-1 mb-3">Resultados de Analise</h2>
          <table className="w-full text-xs border-collapse">
            <thead>
              <tr className="bg-gray-100">
                <th className="border border-gray-300 px-3 py-2 text-left font-semibold uppercase tracking-wide">Analise</th>
                <th className="border border-gray-300 px-3 py-2 text-left font-semibold uppercase tracking-wide">Metodo</th>
                <th className="border border-gray-300 px-3 py-2 text-left font-semibold uppercase tracking-wide">Especificacoes</th>
                <th className="border border-gray-300 px-3 py-2 text-center font-semibold uppercase tracking-wide">Resultado</th>
                <th className="border border-gray-300 px-3 py-2 text-center font-semibold uppercase tracking-wide">Status</th>
              </tr>
            </thead>
            <tbody>
              {cert.analyses.map((analysis, i) => (
                <tr key={i} className={i % 2 === 0 ? "" : "bg-gray-50"} data-testid={`row-analysis-${i}`}>
                  <td className="border border-gray-300 px-3 py-2 font-medium">{analysis.parameter}</td>
                  <td className="border border-gray-300 px-3 py-2 text-gray-600 max-w-xs">{analysis.method}</td>
                  <td className="border border-gray-300 px-3 py-2 font-mono">{analysis.specification}</td>
                  <td className="border border-gray-300 px-3 py-2 text-center font-mono font-medium">{analysis.result}</td>
                  <td className="border border-gray-300 px-3 py-2 text-center">
                    <span className={`font-semibold ${analysis.status === "Conforme" ? "text-green-700" : analysis.status === "Nao Conforme" ? "text-red-700" : "text-gray-500"}`}>
                      {analysis.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {cert.notes && (
          <div className="mb-6 text-xs text-gray-600 italic border-l-2 border-gray-300 pl-3">
            {cert.notes}
          </div>
        )}

        <div className="mb-6 border border-gray-200 rounded p-3 bg-gray-50">
          <p className="text-xs text-gray-500 mb-1">Informacoes Adicionais</p>
          <p className="text-xs">Este documento deve ser reproduzido integralmente. A reproducao parcial somente e permitida mediante autorizacao formal e escrita do laboratorio.</p>
          <p className="text-xs mt-1">Os resultados apresentados referem-se exclusivamente as amostras recebidas e foram obtidos e reportados de acordo com as condicoes analiticas estabelecidas e metodologias aplicaveis.</p>
          <p className="text-xs mt-1"><strong>NA</strong> = Nao se aplica &nbsp;&nbsp;<strong>ND</strong> = Nao detectado &nbsp;&nbsp;<strong>LQ</strong> = Limite de quantificacao</p>
        </div>

        {cert.conclusion && (
          <div className="mb-6 font-semibold text-center text-sm uppercase tracking-wide border-t border-b border-gray-300 py-3">
            CONCLUSAO: {cert.conclusion}
          </div>
        )}

        <div className="mb-6 flex items-center gap-6">
          <div className="flex items-center gap-3">
            <div className={`w-5 h-5 border-2 flex items-center justify-center ${isApproved ? "border-gray-800 bg-gray-800" : "border-gray-400"}`}>
              {isApproved && <span className="text-white text-xs font-bold">X</span>}
            </div>
            <span className="font-medium">APROVADO</span>
          </div>
          <div className="flex items-center gap-3">
            <div className={`w-5 h-5 border-2 flex items-center justify-center ${isRepproved ? "border-gray-800 bg-gray-800" : "border-gray-400"}`}>
              {isRepproved && <span className="text-white text-xs font-bold">X</span>}
            </div>
            <span className="font-medium">REPROVADO</span>
          </div>
          {cert.issueDate && (
            <span className="ml-auto text-gray-500 text-xs">DATA: {cert.issueDate}</span>
          )}
        </div>

        <div className="grid grid-cols-2 gap-8 pt-4 border-t border-gray-300">
          {cert.issuedBy && (
            <div>
              <p className="font-semibold text-sm">{cert.issuedBy}</p>
              <p className="text-xs text-gray-500">Responsavel Tecnico</p>
              {cert.seniorAnalystEmail && <p className="text-xs text-gray-500">{cert.seniorAnalystEmail}</p>}
              <div className="mt-8 border-t border-gray-400 w-64">
                <p className="text-xs text-gray-400 mt-1">Assinatura</p>
              </div>
            </div>
          )}
          {cert.seniorAnalyst && (
            <div>
              <p className="font-semibold text-sm">{cert.seniorAnalyst}</p>
              <p className="text-xs text-gray-500">Analista Senior / Representante Legal</p>
              <div className="mt-8 border-t border-gray-400 w-64">
                <p className="text-xs text-gray-400 mt-1">Assinatura</p>
              </div>
            </div>
          )}
        </div>
      </div>

      <style>{`
        @media print {
          body * { visibility: hidden; }
          #certificate-document, #certificate-document * { visibility: visible; }
          #certificate-document { position: absolute; left: 0; top: 0; width: 100%; box-shadow: none; border: none; }
        }
      `}</style>
    </div>
  );
}
