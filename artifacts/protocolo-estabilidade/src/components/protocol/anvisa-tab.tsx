import { useState, useRef, useEffect, useCallback, useMemo, Fragment } from "react";
import {
  useListSignatures,
  getListSignaturesQueryKey,
  useListBibliographicReferences,
  useCreateBibliographicReference,
  useUpdateBibliographicReference,
  getListBibliographicReferencesQueryKey,
  useListProtocolBibliographicReferences,
  useAddProtocolBibliographicReference,
  useRemoveProtocolBibliographicReference,
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
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Separator } from "@/components/ui/separator";
import { Plus, Pencil, Trash2, Search, BookOpen, Download, X, ExternalLink, CheckCircle2, Loader2, Building2, Bell, Eye, EyeOff, ShieldCheck, FileText, Upload, PenLine, ChevronDown, ChevronRight, Save, Database } from "lucide-react";
import { AuditBadge } from "@/components/audit-badge";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/use-auth";
import { fmtDate } from "@/lib/utils";

type AnvisaNotification = {
  id: number;
  protocolId: number;
  companyName: string;
  companyCnpj: string | null;
  brandName: string | null;
  notifiedAt: string;
  confirmed: boolean;
  expedienteNumber: string | null;
  processNumber: string | null;
  transactionNumber: string | null;
  protocolNumber: string | null;
  attachmentObjectPath: string | null;
  attachmentFileName: string | null;
  attachmentFileType: string | null;
  rotuloObjectPath: string | null;
  rotuloFileName: string | null;
  rotuloFileType: string | null;
  padronizacaoObjectPath: string | null;
  padronizacaoFileName: string | null;
  padronizacaoFileType: string | null;
  docTextJson: string | null;
  notes: string | null;
  createdByName: string | null;
  createdAt: string;
  signedByName: string | null;
  signedByRole: string | null;
  signedAt: string | null;
};

type AnvisaProtocolInfo = {
  companyName: string;
  cnpj: string;
  productName: string;
  productType: string | null;
  activeIngredients: string | null;
  approvedBy: string | null;
  certNumber: string;
};


// ── Default doc text values ───────────────────────────────────────────────────
const DEFAULT_DOC_TEXT = {
  assunto: "Documento com a descrição das alterações realizadas",
  descricaoAlteracao: "A presente alteração refere-se à inclusão de nova empresa responsável pela comercialização do produto, previamente notificado junto à ANVISA.\n\nNão houve qualquer modificação em:\nFormulação qualitativa e quantitativa, Composição, Processo produtivo, Especificações técnicas, Métodos analíticos.\n\nO produto permanece tecnicamente idêntico ao originalmente notificado, sendo a alteração restrita exclusivamente à inclusão de empresa comercializadora adicional.",
  validacao: "Os estudos previamente realizados para o produto original permanecem válidos e aplicáveis, incluindo:\nEstudos de estabilidade, Ensaios de qualidade, Avaliações de segurança, Avaliações de desempenho.\n\nConsiderando que não houve alteração na formulação ou no processo produtivo, não há impacto nos resultados analíticos previamente obtidos, mantendo-se os critérios de aceitação estabelecidos.",
  justificativa: "A inclusão da empresa comercializadora visa ampliar a distribuição e alcance do produto no mercado, mantendo-se integralmente suas características técnicas e regulatórias.\n\nA presente alteração possui caráter exclusivamente administrativo/comercial, não impactando a qualidade, segurança ou eficácia do produto.",
};

function parseDocText(json: string | null) {
  try { return { ...DEFAULT_DOC_TEXT, ...(json ? JSON.parse(json) : {}) }; }
  catch { return { ...DEFAULT_DOC_TEXT }; }
}

function escHtml(s: string) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
          .replace(/\n\n/g, "</p><p>").replace(/\n/g, "<br/>");
}

function buildAnvisaDocHtml(
  n: AnvisaNotification,
  p: AnvisaProtocolInfo,
  imgs: { protocolo: string | null; rotulo: string | null; padronizacao: string | null },
  logoSrc?: string
) {
  const today = new Date().toLocaleDateString("pt-BR");
  const dt = parseDocText(n.docTextJson);

  const imgBlock = (src: string | null, label: string, mime: string | null, divId: string) => {
    if (!src) return "";
    if (mime && mime.startsWith("image/")) {
      return `<div style="margin:20px 0;page-break-inside:avoid">
  <p style="font-weight:bold;font-size:10pt;margin-bottom:8px;color:#1e3a5f;border-left:3px solid #1e3a5f;padding-left:8px">${label}</p>
  <img src="${src}" style="max-width:100%;border:1px solid #d1d5db;border-radius:4px;display:block;box-shadow:0 1px 4px rgba(0,0,0,.08)"/>
</div>`;
    }
    if (mime === "application/pdf") {
      return `<div style="margin:20px 0">
  <p style="font-weight:bold;font-size:10pt;margin-bottom:8px;color:#1e3a5f;border-left:3px solid #1e3a5f;padding-left:8px">${label}</p>
  <div id="${divId}" style="border:1px solid #d1d5db;border-radius:4px;background:#f9fafb;min-height:80px;padding:12px;text-align:center">
    <p style="color:#9ca3af;font-size:9pt">⏳ Renderizando páginas do PDF…</p>
  </div>
</div>`;
    }
    return `<p style="color:#9ca3af;font-size:9pt;font-style:italic;margin:8px 0">[${label}: Word/formato não pré-visualizável — abra o arquivo original]</p>`;
  };

  // Build PDF data for JS rendering (only PDFs need canvas rendering)
  const pdfEntries: string[] = [];
  if (imgs.protocolo && n.attachmentFileType === "application/pdf") pdfEntries.push(`"pdf-protocolo":"${imgs.protocolo}"`);
  if (imgs.rotulo && n.rotuloFileType === "application/pdf") pdfEntries.push(`"pdf-rotulo":"${imgs.rotulo}"`);
  if (imgs.padronizacao && n.padronizacaoFileType === "application/pdf") pdfEntries.push(`"pdf-padronizacao":"${imgs.padronizacao}"`);
  const pdfRenderScript = pdfEntries.length > 0 ? `<script>
(async function(){
  const P={${pdfEntries.join(",")}};
  const s=document.createElement('script');
  s.src='https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js';
  document.head.appendChild(s);
  await new Promise(r=>{s.onload=r;s.onerror=r});
  const lib=window['pdfjs-dist/build/pdf'];
  lib.GlobalWorkerOptions.workerSrc='https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
  for(const[id,url]of Object.entries(P)){
    const el=document.getElementById(id);
    if(!el)continue;
    el.innerHTML='';
    try{
      const pdfDoc=await lib.getDocument({data:atob(url.split(',')[1])}).promise;
      for(let pn=1;pn<=pdfDoc.numPages;pn++){
        const page=await pdfDoc.getPage(pn);
        const vp=page.getViewport({scale:1.5});
        const cv=document.createElement('canvas');
        cv.width=vp.width;cv.height=vp.height;
        cv.style.cssText='max-width:100%;width:100%;display:block;margin-bottom:3px;border-radius:2px';
        await page.render({canvasContext:cv.getContext('2d'),viewport:vp}).promise;
        el.appendChild(cv);
        if(pn<pdfDoc.numPages){const hr=document.createElement('div');hr.style.cssText='height:1px;background:#e5e7eb;margin:6px 0';el.appendChild(hr);}
      }
    }catch(e){el.innerHTML='<p style="color:#ef4444;font-size:9pt;padding:8px">Erro ao renderizar PDF — verifique se o arquivo não está protegido por senha.</p>';}
  }
})();
</script>` : "";

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8"/>
<title>Documento ANVISA — ${escHtml(n.companyName)}</title>
<link href="https://fonts.googleapis.com/css2?family=Dancing+Script:wght@600&display=swap" rel="stylesheet"/>
<style>
  *{box-sizing:border-box;margin:0;padding:0}
  body{font-family:Arial,sans-serif;font-size:11pt;color:#000;padding:2.5cm 3cm;line-height:1.6}
  h1{font-size:13pt;font-weight:bold;text-align:center;margin-bottom:24px;text-transform:uppercase;letter-spacing:.5px}
  .section{margin-bottom:20px}
  .section-title{font-size:11pt;font-weight:bold;margin-bottom:8px;border-bottom:1.5px solid #1e3a5f;padding-bottom:2px;color:#1e3a5f}
  p{margin-bottom:6px}
  .field-row{display:flex;gap:8px;margin-bottom:4px}
  .field-label{font-weight:bold;min-width:170px;flex-shrink:0}
  .sig-area{margin-top:40px;display:flex;justify-content:flex-end}
  .sig-box{text-align:center;min-width:240px}
  .sig-line{border-top:1.5px solid #1e3a5f;padding-top:8px}
  .sig-cursiva{font-family:'Dancing Script',cursive;font-size:20pt;font-weight:600;color:#111827;line-height:1.3}
  .sig-verified{color:#16a34a;font-size:8pt;margin:2px 0 8px}
  @media print{body{padding:1.5cm 2cm}button{display:none!important}}
</style>
</head>
<body>
<div style="display:flex;align-items:center;justify-content:space-between;border-bottom:2.5px solid #1e3a5f;padding-bottom:12px;margin-bottom:20px">
  ${logoSrc ? `<img src="${logoSrc}" alt="Alphafitus" style="height:80px;width:auto;object-fit:contain"/>` : `<div style="font-weight:900;font-size:13pt;color:#1e3a5f;letter-spacing:.5px">ALPHAFITUS</div>`}
  <div style="text-align:right;font-size:9.5pt;line-height:1.8;color:#374151">
    ${n.expedienteNumber ? `<div><strong>EXPEDIENTE Nº ${escHtml(n.expedienteNumber)}</strong></div>` : ""}
    ${n.processNumber ? `<div>Nº do Processo: ${escHtml(n.processNumber)}</div>` : ""}
    ${n.transactionNumber ? `<div>Nº de Transação: ${escHtml(n.transactionNumber)}</div>` : ""}
    ${n.protocolNumber ? `<div>Nº de Protocolo: ${escHtml(n.protocolNumber)}</div>` : ""}
    <div style="font-size:8.5pt;color:#9ca3af">Data: ${today}</div>
  </div>
</div>

${(p.certNumber || p.productName) ? `
<div style="background:#f0f4f8;border:1.5px solid #1e3a5f;border-radius:4px;padding:10px 16px;margin-bottom:20px;font-size:10pt">
  <div style="color:#888;font-size:9pt;margin-bottom:2px;text-transform:uppercase;letter-spacing:.5px">Referência do Protocolo</div>
  <div style="font-weight:bold;color:#1e3a5f;font-size:11pt">${escHtml((p.productType ? p.productType + " — " : "") + p.productName)}</div>
  ${p.certNumber ? `<div style="font-family:monospace;color:#1e3a5f;font-size:10.5pt;margin-top:3px">${escHtml(p.certNumber)}</div>` : ""}
</div>` : ""}

<h1>Documento com a Descrição das Alterações Realizadas</h1>

<div class="section">
  <p class="section-title">1. Assunto</p>
  <p>${escHtml(dt.assunto)}</p>
</div>

<div class="section">
  <p class="section-title">2. Identificação do Produto Original</p>
  <div class="field-row"><span class="field-label">Designação do Produto (Outros):</span><span>${escHtml(p.productType ?? "Suplemento Alimentar em Cápsula")}</span></div>
  <div class="field-row"><span class="field-label">Nome do Produto:</span><span>${escHtml(p.productName)}</span></div>
  ${p.activeIngredients ? `<div class="field-row"><span class="field-label">Ativos:</span><span>${escHtml(p.activeIngredients)}</span></div>` : ""}
</div>

<div class="section">
  <p class="section-title">3. Descrição da Alteração</p>
  <p>${escHtml(dt.descricaoAlteracao)}</p>
</div>

<div class="section">
  <p class="section-title">4. Identificação da Empresa Responsável pela Comercialização (Nova Inclusão)</p>
  <div class="field-row"><span class="field-label">Razão Social:</span><span>${escHtml(n.companyName)}</span></div>
  ${n.companyCnpj ? `<div class="field-row"><span class="field-label">CNPJ:</span><span>${escHtml(n.companyCnpj)}</span></div>` : ""}
</div>

<div class="section">
  <p class="section-title">5. Identificação Comercial do Produto</p>
  <div class="field-row"><span class="field-label">Marca / Produto:</span><span>${escHtml(n.brandName ?? n.companyName)}</span></div>
  <div class="field-row"><span class="field-label">Nome do Produto:</span><span>${escHtml(p.productName)}</span></div>
</div>

<div class="section">
  <p class="section-title">6. Validação Analítica e Estudos</p>
  <p>${escHtml(dt.validacao)}</p>
</div>

<div class="section">
  <p class="section-title">7. Justificativa Técnica</p>
  <p>${escHtml(dt.justificativa)}</p>
</div>

${(imgs.protocolo || imgs.rotulo || imgs.padronizacao) ? `
<div class="section">
  <p class="section-title">Anexos</p>
  ${imgBlock(imgs.protocolo, "Protocolo ANVISA", n.attachmentFileType, "pdf-protocolo")}
  ${imgBlock(imgs.rotulo, "Rótulo", n.rotuloFileType, "pdf-rotulo")}
  ${imgBlock(imgs.padronizacao, "Padronização", n.padronizacaoFileType, "pdf-padronizacao")}
</div>` : ""}

<div class="section">
  <p class="section-title">8. Assinatura e Liberação</p>
  <div class="sig-area">
    <div class="sig-box">
      ${n.signedByName ? `
      <p class="sig-cursiva">${escHtml(n.signedByName)}</p>
      <p class="sig-verified">✓ Assinado digitalmente — ${n.signedAt ? new Date(n.signedAt).toLocaleString("pt-BR",{day:"2-digit",month:"2-digit",year:"numeric",hour:"2-digit",minute:"2-digit"}) : today}</p>
      ` : `<div style="height:55px"></div>`}
      <div class="sig-line">
        <p><strong>${escHtml(n.signedByName ?? p.approvedBy ?? "Responsável Técnico")}</strong></p>
        <p>${escHtml(n.signedByRole ?? "Representante Legal")}</p>
        <p style="font-size:9pt;color:#6b7280;margin-top:4px">${escHtml(p.companyName)}</p>
      </div>
    </div>
  </div>
</div>

<div style="text-align:center;margin-top:36px">
  <button onclick="window.print()" style="padding:10px 28px;background:#1e3a5f;color:#fff;border:none;border-radius:4px;font-size:11pt;cursor:pointer">🖨️ Imprimir / Salvar como PDF</button>
</div>
${pdfRenderScript}
</body>
</html>`;
}

function AnvisaTab({ protocolId, protocolInfo }: { protocolId: number; protocolInfo: AnvisaProtocolInfo }) {
  const { token, user: currentUser, isAdmin } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [uploadingField, setUploadingField] = useState<"protocolo" | "rotulo" | "padronizacao" | null>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [generatingDocId, setGeneratingDocId] = useState<number | null>(null);
  const [sigDialogOpen, setSigDialogOpen] = useState(false);
  const [sigTargetId, setSigTargetId] = useState<number | null>(null);
  const [sigRole, setSigRole] = useState("Responsável Técnico");
  const [signing, setSigning] = useState(false);
  const [unsigningId, setUnsigningId] = useState<number | null>(null);
  // ── Banco de Empresas ────────────────────────────────────────────────────
  const [companyMgr, setCompanyMgr] = useState(false);
  const [editCompanyId, setEditCompanyId] = useState<number | null>(null);
  const [editCompanyName, setEditCompanyName] = useState("");
  const [editCompanyCnpj, setEditCompanyCnpj] = useState("");
  const [savingCompany, setSavingCompany] = useState(false);
  const [deletingCompanyId, setDeletingCompanyId] = useState<number | null>(null);
  // ── Banco de Números ANVISA ──────────────────────────────────────────────
  const [numberMgr, setNumberMgr] = useState(false);
  const [editNumberId, setEditNumberId] = useState<number | null>(null);
  const [editNumber, setEditNumber] = useState({ label: "", exp: "", proc: "", trans: "", prot: "" });
  const [savingNumber, setSavingNumber] = useState(false);
  const [deletingNumberId, setDeletingNumberId] = useState<number | null>(null);

  const protocoloInputRef = useRef<HTMLInputElement>(null);
  const rotuloInputRef = useRef<HTMLInputElement>(null);
  const padronizacaoInputRef = useRef<HTMLInputElement>(null);

  const emptyForm = {
    companyName: "", companyCnpj: "", brandName: "",
    notifiedAt: "", notes: "", confirmed: false,
    expedienteNumber: "", processNumber: "", transactionNumber: "", protocolNumber: "",
    attachmentObjectPath: null as string | null, attachmentFileName: null as string | null, attachmentFileType: null as string | null,
    rotuloObjectPath: null as string | null, rotuloFileName: null as string | null, rotuloFileType: null as string | null,
    padronizacaoObjectPath: null as string | null, padronizacaoFileName: null as string | null, padronizacaoFileType: null as string | null,
    docAssunto: DEFAULT_DOC_TEXT.assunto,
    docDescricao: DEFAULT_DOC_TEXT.descricaoAlteracao,
    docValidacao: DEFAULT_DOC_TEXT.validacao,
    docJustificativa: DEFAULT_DOC_TEXT.justificativa,
  };
  const [form, setForm] = useState(emptyForm);

  const { data: notifications = [], isLoading } = useQuery<AnvisaNotification[]>({
    queryKey: ["anvisa-notifications", protocolId],
    queryFn: async () => {
      const res = await fetch(`/api/protocols/${protocolId}/anvisa`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok) throw new Error("Erro ao carregar notificações ANVISA");
      return res.json();
    },
  });

  type CompanyRecord = { id: number; name: string; cnpj: string | null };
  type NumberRecord = { id: number; label: string | null; expedienteNumber: string | null; processNumber: string | null; transactionNumber: string | null; protocolNumber: string | null };

  const { data: savedCompanies = [] } = useQuery<CompanyRecord[]>({
    queryKey: ["companies"],
    queryFn: async () => {
      const res = await fetch("/api/companies", { headers: token ? { Authorization: `Bearer ${token}` } : {} });
      if (!res.ok) throw new Error();
      return res.json();
    },
  });

  const { data: savedNumbers = [] } = useQuery<NumberRecord[]>({
    queryKey: ["anvisa-number-bank", protocolId],
    queryFn: async () => {
      const res = await fetch(`/api/anvisa-number-bank?protocolId=${protocolId}`, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
      if (!res.ok) throw new Error();
      return res.json();
    },
  });

  function resetForm() { setForm(emptyForm); setShowForm(false); setEditingId(null); }

  function startEdit(n: AnvisaNotification) {
    const dt = parseDocText(n.docTextJson);
    const toLocal = (iso: string) => {
      try { return new Date(iso).toISOString().slice(0, 16); } catch { return ""; }
    };
    setForm({
      companyName: n.companyName,
      companyCnpj: n.companyCnpj ?? "",
      brandName: n.brandName ?? "",
      notifiedAt: toLocal(n.notifiedAt),
      notes: n.notes ?? "",
      confirmed: n.confirmed,
      expedienteNumber: n.expedienteNumber ?? "",
      processNumber: n.processNumber ?? "",
      transactionNumber: n.transactionNumber ?? "",
      protocolNumber: n.protocolNumber ?? "",
      attachmentObjectPath: n.attachmentObjectPath,
      attachmentFileName: n.attachmentFileName,
      attachmentFileType: n.attachmentFileType,
      rotuloObjectPath: n.rotuloObjectPath,
      rotuloFileName: n.rotuloFileName,
      rotuloFileType: n.rotuloFileType,
      padronizacaoObjectPath: n.padronizacaoObjectPath,
      padronizacaoFileName: n.padronizacaoFileName,
      padronizacaoFileType: n.padronizacaoFileType,
      docAssunto: dt.assunto,
      docDescricao: dt.descricaoAlteracao,
      docValidacao: dt.validacao,
      docJustificativa: dt.justificativa,
    });
    setEditingId(n.id);
    setShowForm(true);
  }

  async function fetchAsDataUrl(objectPath: string): Promise<string | null> {
    try {
      const hdrs: Record<string, string> = {};
      if (token) hdrs["Authorization"] = `Bearer ${token}`;
      const res = await fetch(`/api/storage/objects/${objectPath}`, { headers: hdrs });
      if (!res.ok) return null;
      const blob = await res.blob();
      return new Promise(resolve => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = () => resolve(null);
        reader.readAsDataURL(blob);
      });
    } catch { return null; }
  }

  async function handleGenerateDoc(n: AnvisaNotification) {
    const win = window.open("", "_blank");
    if (!win) { toast({ title: "Popup bloqueado — libere popups para este site", variant: "destructive" }); return; }
    win.document.write(`<!DOCTYPE html><html><head><meta charset="UTF-8"/><title>Carregando…</title></head><body style="font-family:Arial;display:flex;align-items:center;justify-content:center;height:100vh;font-size:14pt;color:#555">⏳ Carregando anexos e gerando documento…</body></html>`);
    setGeneratingDocId(n.id);
    try {
      const logoSrc = window.location.origin + "/logo-alphafitus.png";
      const [protocolo, rotulo, padronizacao] = await Promise.all([
        n.attachmentObjectPath ? fetchAsDataUrl(n.attachmentObjectPath) : Promise.resolve(null),
        n.rotuloObjectPath ? fetchAsDataUrl(n.rotuloObjectPath) : Promise.resolve(null),
        n.padronizacaoObjectPath ? fetchAsDataUrl(n.padronizacaoObjectPath) : Promise.resolve(null),
      ]);
      const html = buildAnvisaDocHtml(n, protocolInfo, { protocolo, rotulo, padronizacao }, logoSrc);
      win.document.open();
      win.document.write(html);
      win.document.close();
    } catch {
      win.close();
      toast({ title: "Erro ao gerar documento", variant: "destructive" });
    } finally {
      setGeneratingDocId(null);
    }
  }

  async function uploadFile(file: File, field: "protocolo" | "rotulo" | "padronizacao") {
    const allowed = ["application/pdf", "application/msword", "application/vnd.openxmlformats-officedocument.wordprocessingml.document", "image/png", "image/jpeg", "image/webp"];
    if (!allowed.includes(file.type)) {
      toast({ title: "Tipo não suportado", description: "Aceito: PDF, Word, imagens", variant: "destructive" }); return;
    }
    if (file.size > 20 * 1024 * 1024) {
      toast({ title: "Arquivo muito grande (máx 20 MB)", variant: "destructive" }); return;
    }
    setUploadingField(field);
    try {
      const urlRes = await fetch("/api/storage/uploads/request-url", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({ name: file.name, size: file.size, contentType: file.type }),
      });
      if (!urlRes.ok) throw new Error("Erro ao obter URL de upload");
      const { uploadURL, objectPath } = await urlRes.json() as { uploadURL: string; objectPath: string };
      const putRes = await fetch(uploadURL, { method: "PUT", body: file, headers: { "Content-Type": file.type } });
      if (!putRes.ok) throw new Error("Erro ao enviar arquivo");

      if (field === "protocolo") setForm(f => ({ ...f, attachmentObjectPath: objectPath, attachmentFileName: file.name, attachmentFileType: file.type }));
      if (field === "rotulo")    setForm(f => ({ ...f, rotuloObjectPath: objectPath, rotuloFileName: file.name, rotuloFileType: file.type }));
      if (field === "padronizacao") setForm(f => ({ ...f, padronizacaoObjectPath: objectPath, padronizacaoFileName: file.name, padronizacaoFileType: file.type }));

      const labels = { protocolo: "Protocolo ANVISA", rotulo: "Rótulo", padronizacao: "Padronização" };
      toast({ title: `${labels[field]} anexado com sucesso` });
    } catch (err) {
      toast({ title: err instanceof Error ? err.message : "Erro no upload", variant: "destructive" });
    } finally {
      setUploadingField(null);
    }
  }

  function makeFileHandler(field: "protocolo" | "rotulo" | "padronizacao") {
    return (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      e.target.value = "";
      if (file) uploadFile(file, field);
    };
  }

  async function handleSave() {
    if (!form.companyName.trim()) { toast({ title: "Informe o nome da empresa", variant: "destructive" }); return; }
    if (!form.notifiedAt) { toast({ title: "Informe a data/hora da notificação", variant: "destructive" }); return; }
    if (form.confirmed && !form.attachmentObjectPath) {
      toast({ title: "Anexe o protocolo gerado pela ANVISA antes de confirmar", variant: "destructive" }); return;
    }
    setSaving(true);
    const docTextJson = JSON.stringify({
      assunto: form.docAssunto,
      descricaoAlteracao: form.docDescricao,
      validacao: form.docValidacao,
      justificativa: form.docJustificativa,
    });
    const payload = {
      companyName: form.companyName.trim(),
      companyCnpj: form.companyCnpj.trim() || null,
      brandName: form.brandName.trim() || null,
      notifiedAt: form.notifiedAt,
      confirmed: form.confirmed,
      notes: form.notes.trim() || null,
      expedienteNumber: form.expedienteNumber.trim() || null,
      processNumber: form.processNumber.trim() || null,
      transactionNumber: form.transactionNumber.trim() || null,
      protocolNumber: form.protocolNumber.trim() || null,
      attachmentObjectPath: form.attachmentObjectPath, attachmentFileName: form.attachmentFileName, attachmentFileType: form.attachmentFileType,
      rotuloObjectPath: form.rotuloObjectPath, rotuloFileName: form.rotuloFileName, rotuloFileType: form.rotuloFileType,
      padronizacaoObjectPath: form.padronizacaoObjectPath, padronizacaoFileName: form.padronizacaoFileName, padronizacaoFileType: form.padronizacaoFileType,
      docTextJson,
    };
    try {
      const url = editingId !== null
        ? `/api/protocols/${protocolId}/anvisa/${editingId}`
        : `/api/protocols/${protocolId}/anvisa`;
      const method = editingId !== null ? "PUT" : "POST";
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error("Erro ao salvar");
      const saved: AnvisaNotification = await res.json();
      queryClient.invalidateQueries({ queryKey: ["anvisa-notifications", protocolId] });
      toast({ title: editingId !== null ? "Notificação atualizada" : "Notificação ANVISA registrada" });
      const wasNew = editingId === null;
      resetForm();
      if (wasNew) {
        setSigTargetId(saved.id);
        setSigRole("Responsável Técnico");
        setSigDialogOpen(true);
      }
    } catch {
      toast({ title: "Erro ao salvar notificação", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  }

  async function handleSign() {
    if (!sigTargetId) return;
    setSigning(true);
    try {
      const res = await fetch(`/api/protocols/${protocolId}/anvisa/${sigTargetId}/sign`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({ role: sigRole }),
      });
      if (!res.ok) throw new Error();
      queryClient.invalidateQueries({ queryKey: ["anvisa-notifications", protocolId] });
      toast({ title: "Notificação assinada com sucesso" });
      setSigDialogOpen(false);
      setSigTargetId(null);
    } catch {
      toast({ title: "Erro ao registrar assinatura", variant: "destructive" });
    } finally {
      setSigning(false);
    }
  }

  async function handleSaveCompanyToBank() {
    if (!form.companyName.trim()) { toast({ title: "Preencha a Razão Social antes de salvar", variant: "destructive" }); return; }
    setSavingCompany(true);
    try {
      await fetch("/api/companies", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({ name: form.companyName.trim(), cnpj: form.companyCnpj.trim() || null }),
      });
      queryClient.invalidateQueries({ queryKey: ["companies"] });
      toast({ title: "Empresa salva no banco" });
    } catch { toast({ title: "Erro ao salvar empresa", variant: "destructive" }); }
    finally { setSavingCompany(false); }
  }

  async function handleUpdateCompany() {
    if (!editCompanyId || !editCompanyName.trim()) return;
    setSavingCompany(true);
    try {
      await fetch(`/api/companies/${editCompanyId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({ name: editCompanyName.trim(), cnpj: editCompanyCnpj.trim() || null }),
      });
      queryClient.invalidateQueries({ queryKey: ["companies"] });
      setEditCompanyId(null);
      toast({ title: "Empresa atualizada" });
    } catch { toast({ title: "Erro ao atualizar empresa", variant: "destructive" }); }
    finally { setSavingCompany(false); }
  }

  async function handleDeleteCompany(id: number) {
    setDeletingCompanyId(id);
    try {
      await fetch(`/api/companies/${id}`, { method: "DELETE", headers: token ? { Authorization: `Bearer ${token}` } : {} });
      queryClient.invalidateQueries({ queryKey: ["companies"] });
      toast({ title: "Empresa removida" });
    } catch { toast({ title: "Erro ao remover empresa", variant: "destructive" }); }
    finally { setDeletingCompanyId(null); }
  }

  async function handleSaveNumbersToBank() {
    setSavingNumber(true);
    try {
      await fetch("/api/anvisa-number-bank", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({
          protocolId,
          label: form.expedienteNumber.trim() || form.processNumber.trim() || null,
          expedienteNumber: form.expedienteNumber.trim() || null,
          processNumber: form.processNumber.trim() || null,
          transactionNumber: form.transactionNumber.trim() || null,
          protocolNumber: form.protocolNumber.trim() || null,
        }),
      });
      queryClient.invalidateQueries({ queryKey: ["anvisa-number-bank", protocolId] });
      toast({ title: "Números salvos no banco" });
    } catch { toast({ title: "Erro ao salvar números", variant: "destructive" }); }
    finally { setSavingNumber(false); }
  }

  async function handleUpdateNumber() {
    if (!editNumberId) return;
    setSavingNumber(true);
    try {
      await fetch(`/api/anvisa-number-bank/${editNumberId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({ label: editNumber.label || null, expedienteNumber: editNumber.exp || null, processNumber: editNumber.proc || null, transactionNumber: editNumber.trans || null, protocolNumber: editNumber.prot || null }),
      });
      queryClient.invalidateQueries({ queryKey: ["anvisa-number-bank", protocolId] });
      setEditNumberId(null);
      setEditNumber({ label: "", exp: "", proc: "", trans: "", prot: "" });
      toast({ title: "Números atualizados" });
    } catch { toast({ title: "Erro ao atualizar", variant: "destructive" }); }
    finally { setSavingNumber(false); }
  }

  async function handleDeleteNumber(id: number) {
    setDeletingNumberId(id);
    try {
      await fetch(`/api/anvisa-number-bank/${id}`, { method: "DELETE", headers: token ? { Authorization: `Bearer ${token}` } : {} });
      queryClient.invalidateQueries({ queryKey: ["anvisa-number-bank", protocolId] });
      toast({ title: "Registro removido" });
    } catch { toast({ title: "Erro ao remover registro", variant: "destructive" }); }
    finally { setDeletingNumberId(null); }
  }

  async function handleUnsign(notifId: number) {
    setUnsigningId(notifId);
    try {
      await fetch(`/api/protocols/${protocolId}/anvisa/${notifId}/sign`, {
        method: "DELETE",
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      queryClient.invalidateQueries({ queryKey: ["anvisa-notifications", protocolId] });
      toast({ title: "Assinatura removida" });
    } catch {
      toast({ title: "Erro ao remover assinatura", variant: "destructive" });
    } finally {
      setUnsigningId(null);
    }
  }

  async function handleDelete(id: number) {
    setDeletingId(id);
    try {
      await fetch(`/api/protocols/${protocolId}/anvisa/${id}`, { method: "DELETE", headers: token ? { Authorization: `Bearer ${token}` } : {} });
      queryClient.invalidateQueries({ queryKey: ["anvisa-notifications", protocolId] });
      toast({ title: "Registro removido" });
    } catch { toast({ title: "Erro ao remover", variant: "destructive" }); }
    finally { setDeletingId(null); }
  }

  async function handleDownload(objectPath: string, fileName: string) {
    try {
      const res = await fetch(`/api/storage/objects/${objectPath}`, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
      if (!res.ok) throw new Error();
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a"); a.href = url; a.download = fileName; a.click();
      setTimeout(() => URL.revokeObjectURL(url), 5000);
    } catch { toast({ title: "Erro ao baixar arquivo", variant: "destructive" }); }
  }

  function fmtDateTime(iso: string) {
    try { return new Date(iso).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" }); } catch { return iso; }
  }

  const canSave = form.companyName.trim() && form.notifiedAt && (!form.confirmed || !!form.attachmentObjectPath);
  const uploading = uploadingField !== null;

  // ── Reusable inline attachment row ──
  function AttachRow({ label, required, fileName, onClear, onPick, field }: {
    label: string; required?: boolean;
    fileName: string | null;
    onClear: () => void; onPick: () => void;
    field: "protocolo" | "rotulo" | "padronizacao";
  }) {
    const busy = uploadingField === field;
    return (
      <div className="flex items-center gap-2">
        <span className="text-xs text-slate-600 w-32 shrink-0">{label}{required ? " *" : " (opcional)"}</span>
        {fileName ? (
          <div className="flex flex-1 items-center gap-2 text-xs bg-white rounded px-2 py-1.5 border border-green-300 min-w-0">
            <FileText className="h-3.5 w-3.5 text-green-600 shrink-0" />
            <span className="text-green-700 font-medium truncate">{fileName}</span>
            <button className="ml-auto text-slate-400 hover:text-red-500" onClick={onClear}><X className="h-3.5 w-3.5" /></button>
          </div>
        ) : (
          <Button size="sm" variant="outline" disabled={busy || uploading} onClick={onPick} className="h-7 text-xs">
            {busy ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <Upload className="h-3 w-3 mr-1" />}
            {busy ? "Enviando…" : "Anexar"}
          </Button>
        )}
      </div>
    );
  }

  return (
    <>
    {/* ── Signature Dialog ─────────────────────────────────────────────────── */}
    {sigDialogOpen && (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => { if (!signing) setSigDialogOpen(false); }}>
        <div className="bg-white rounded-xl shadow-2xl w-[420px] max-w-[95vw] max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
          <div className="flex items-center justify-between px-6 pt-5 pb-4 border-b border-gray-100">
            <h3 className="font-bold text-base flex items-center gap-2 text-gray-900">
              <PenLine className="h-4 w-4 text-primary" /> Assinar Digitalmente
            </h3>
            <button type="button" onClick={() => setSigDialogOpen(false)} disabled={signing}
              className="text-gray-400 hover:text-gray-700 rounded-full hover:bg-gray-100 w-7 h-7 flex items-center justify-center transition-colors">
              <span className="text-xl leading-none">×</span>
            </button>
          </div>
          <div className="px-6 py-4 space-y-4">
            <p className="text-xs text-gray-500">Confirme para registrar sua assinatura eletrônica nesta notificação ANVISA.</p>
            {/* User card */}
            <div className="border border-gray-200 rounded-lg p-3 flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-primary flex items-center justify-center text-white font-bold text-sm flex-shrink-0">
                {(currentUser?.displayName ?? "?").split(" ").filter(Boolean).slice(0,2).map(n => n[0]?.toUpperCase()).join("")}
              </div>
              <div className="min-w-0">
                <p className="font-semibold text-sm text-gray-900 truncate">{currentUser?.displayName}</p>
                <p className="text-xs text-gray-400 capitalize">{currentUser?.role === "admin" ? "Admin" : "Analista"}</p>
                <p className="text-[10px] text-emerald-600 flex items-center gap-1 mt-0.5"><ShieldCheck className="h-3 w-3" /> Usuário verificado</p>
              </div>
            </div>
            {/* Preview */}
            <div className="border border-gray-200 rounded-lg p-3 bg-gray-50/50">
              <p className="text-[9px] font-semibold uppercase tracking-widest text-gray-400 mb-1 text-center">Prévia da assinatura</p>
              <p style={{ fontFamily: "'Dancing Script', cursive", fontSize: "1.4rem", lineHeight: 1.4, color: "#111827", fontWeight: 600, textAlign: "center" }}>
                {currentUser?.displayName}
              </p>
            </div>
            {/* Role */}
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1.5">Cargo / Função nesta assinatura</label>
              <select value={sigRole} onChange={e => setSigRole(e.target.value)}
                className="w-full border border-input rounded-lg px-3 py-2 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary">
                {["Responsável Técnico", "Representante Legal", "Elaborador", "Aprovador", "Revisor", "Gestor de Qualidade"].map(r => (
                  <option key={r} value={r}>{r}</option>
                ))}
              </select>
            </div>
            <div className="flex gap-2 pt-1">
              <button type="button" onClick={() => setSigDialogOpen(false)} disabled={signing}
                className="flex-1 text-sm px-4 py-2.5 rounded-lg border border-gray-300 text-gray-600 hover:bg-gray-50 font-medium transition-colors">
                Pular por agora
              </button>
              <button type="button" onClick={handleSign} disabled={signing}
                className="flex-1 text-sm px-4 py-2.5 rounded-lg bg-primary text-white hover:bg-primary/90 font-semibold transition-colors flex items-center justify-center gap-2">
                {signing ? <><Loader2 className="h-4 w-4 animate-spin" /> Assinando…</> : <><PenLine className="h-4 w-4" /> Confirmar Assinatura</>}
              </button>
            </div>
          </div>
        </div>
      </div>
    )}

    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <ShieldCheck className="h-5 w-5 text-primary" />
            <CardTitle className="text-base">Notificações ANVISA</CardTitle>
            <Badge variant="secondary" className="text-xs">Uso interno — não aparece no certificado</Badge>
          </div>
          {!showForm && (
            <Button size="sm" onClick={() => setShowForm(true)}>
              <Plus className="h-3.5 w-3.5 mr-1" /> Registrar Notificação
            </Button>
          )}
        </div>
        <p className="text-xs text-muted-foreground mt-1">
          Controle das empresas notificadas na ANVISA. Exclusivamente para uso interno — não consta no certificado de análise.
        </p>
      </CardHeader>
      <CardContent className="space-y-4">

        {/* ── Banco de Dados de Empresas ── */}
        <div className="rounded-lg border border-gray-200 bg-gray-50 overflow-hidden">
          <button type="button" onClick={() => setCompanyMgr(v => !v)}
            className="w-full flex items-center justify-between px-4 py-2.5 text-xs font-semibold text-gray-700 hover:bg-gray-100 transition-colors">
            <span className="flex items-center gap-2">
              <Building2 className="h-3.5 w-3.5 text-gray-500" />
              Banco de Empresas
              <span className="text-[10px] text-gray-400 font-normal">(banco global)</span>
            </span>
            {companyMgr ? <ChevronDown className="h-3.5 w-3.5 text-gray-400" /> : <ChevronRight className="h-3.5 w-3.5 text-gray-400" />}
          </button>
          {companyMgr && (
            <div className="border-t border-gray-200 p-3 space-y-3">
              {/* Add new company */}
              <div className="flex flex-col sm:flex-row gap-2">
                <Input placeholder="Razão Social" value={editCompanyId ? editCompanyName : editCompanyName}
                  onChange={e => setEditCompanyName(e.target.value)} className="h-8 text-xs flex-1" />
                <Input placeholder="CNPJ (opcional)" value={editCompanyCnpj}
                  onChange={e => setEditCompanyCnpj(e.target.value)} className="h-8 text-xs w-44" />
                <button type="button"
                  onClick={editCompanyId ? handleUpdateCompany : async () => {
                    if (!editCompanyName.trim()) return;
                    setSavingCompany(true);
                    try {
                      await fetch("/api/companies", {
                        method: "POST",
                        headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
                        body: JSON.stringify({ name: editCompanyName.trim(), cnpj: editCompanyCnpj.trim() || null }),
                      });
                      queryClient.invalidateQueries({ queryKey: ["companies"] });
                      setEditCompanyName(""); setEditCompanyCnpj(""); setEditCompanyId(null);
                      toast({ title: "Empresa adicionada" });
                    } catch { toast({ title: "Erro ao adicionar", variant: "destructive" }); }
                    finally { setSavingCompany(false); }
                  }}
                  disabled={savingCompany || !editCompanyName.trim()}
                  className="h-8 flex items-center gap-1.5 px-3 rounded border border-gray-300 bg-white text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 whitespace-nowrap">
                  {savingCompany ? <Loader2 className="h-3 w-3 animate-spin" /> : <Save className="h-3 w-3" />}
                  {editCompanyId ? "Atualizar" : "Adicionar"}
                </button>
                {editCompanyId && (
                  <button type="button" onClick={() => { setEditCompanyId(null); setEditCompanyName(""); setEditCompanyCnpj(""); }}
                    className="h-8 flex items-center gap-1 px-2 rounded border border-gray-200 text-xs text-gray-500 hover:bg-gray-100">
                    <X className="h-3 w-3" /> Cancelar
                  </button>
                )}
              </div>
              {/* List */}
              {savedCompanies.length === 0 && <p className="text-xs text-gray-400 text-center py-2">Nenhuma empresa salva ainda</p>}
              {savedCompanies.map(c => (
                <div key={c.id} className="flex items-center justify-between bg-white rounded border border-gray-200 px-3 py-2">
                  <div className="min-w-0">
                    <p className="text-xs font-medium text-gray-800 truncate">{c.name}</p>
                    {c.cnpj && <p className="text-[10px] text-gray-400">{c.cnpj}</p>}
                  </div>
                  <div className="flex gap-1 ml-2 shrink-0">
                    <button type="button" onClick={() => { setEditCompanyId(c.id); setEditCompanyName(c.name); setEditCompanyCnpj(c.cnpj ?? ""); }}
                      className="p-1 rounded hover:bg-gray-100 text-gray-400 hover:text-gray-700 transition-colors" title="Editar">
                      <Pencil className="h-3 w-3" />
                    </button>
                    <button type="button" onClick={() => handleDeleteCompany(c.id)} disabled={deletingCompanyId === c.id}
                      className="p-1 rounded hover:bg-red-50 text-gray-400 hover:text-red-500 transition-colors" title="Remover">
                      {deletingCompanyId === c.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <Trash2 className="h-3 w-3" />}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* ── Banco de Números ANVISA ── */}
        <div className="rounded-lg border border-gray-200 bg-gray-50 overflow-hidden">
          <button type="button" onClick={() => setNumberMgr(v => !v)}
            className="w-full flex items-center justify-between px-4 py-2.5 text-xs font-semibold text-gray-700 hover:bg-gray-100 transition-colors">
            <span className="flex items-center gap-2">
              <Database className="h-3.5 w-3.5 text-gray-500" />
              Números ANVISA deste protocolo
              {savedNumbers.length > 0 && <span className="bg-blue-100 text-blue-700 rounded-full px-1.5 py-0.5 text-[10px] font-bold">{savedNumbers.length}</span>}
            </span>
            {numberMgr ? <ChevronDown className="h-3.5 w-3.5 text-gray-400" /> : <ChevronRight className="h-3.5 w-3.5 text-gray-400" />}
          </button>
          {numberMgr && (
            <div className="border-t border-gray-200 p-3 space-y-3">
              {/* Add/edit form */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <Input placeholder="Rótulo / Descrição (opcional)" value={editNumber.label}
                  onChange={e => setEditNumber(n => ({ ...n, label: e.target.value }))} className="h-8 text-xs sm:col-span-2" />
                <Input placeholder="Nº Expediente" value={editNumber.exp}
                  onChange={e => setEditNumber(n => ({ ...n, exp: e.target.value }))} className="h-8 text-xs" />
                <Input placeholder="Nº Processo" value={editNumber.proc}
                  onChange={e => setEditNumber(n => ({ ...n, proc: e.target.value }))} className="h-8 text-xs" />
                <Input placeholder="Nº Transação" value={editNumber.trans}
                  onChange={e => setEditNumber(n => ({ ...n, trans: e.target.value }))} className="h-8 text-xs" />
                <Input placeholder="Nº Protocolo" value={editNumber.prot}
                  onChange={e => setEditNumber(n => ({ ...n, prot: e.target.value }))} className="h-8 text-xs" />
              </div>
              <div className="flex gap-2">
                <button type="button"
                  onClick={editNumberId ? handleUpdateNumber : async () => {
                    if (!editNumber.exp && !editNumber.proc && !editNumber.trans && !editNumber.prot) return;
                    setSavingNumber(true);
                    try {
                      await fetch("/api/anvisa-number-bank", {
                        method: "POST",
                        headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
                        body: JSON.stringify({ protocolId, label: editNumber.label || null, expedienteNumber: editNumber.exp || null, processNumber: editNumber.proc || null, transactionNumber: editNumber.trans || null, protocolNumber: editNumber.prot || null }),
                      });
                      queryClient.invalidateQueries({ queryKey: ["anvisa-number-bank", protocolId] });
                      setEditNumber({ label: "", exp: "", proc: "", trans: "", prot: "" }); setEditNumberId(null);
                      toast({ title: "Números salvos" });
                    } catch { toast({ title: "Erro ao salvar", variant: "destructive" }); }
                    finally { setSavingNumber(false); }
                  }}
                  disabled={savingNumber || (!editNumber.exp && !editNumber.proc && !editNumber.trans && !editNumber.prot)}
                  className="flex items-center gap-1.5 px-3 h-8 rounded border border-gray-300 bg-white text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50">
                  {savingNumber ? <Loader2 className="h-3 w-3 animate-spin" /> : <Save className="h-3 w-3" />}
                  {editNumberId ? "Atualizar" : "Adicionar"}
                </button>
                {editNumberId && (
                  <button type="button" onClick={() => { setEditNumberId(null); setEditNumber({ label: "", exp: "", proc: "", trans: "", prot: "" }); }}
                    className="flex items-center gap-1 px-2 h-8 rounded border border-gray-200 text-xs text-gray-500 hover:bg-gray-100">
                    <X className="h-3 w-3" /> Cancelar
                  </button>
                )}
              </div>
              {/* List */}
              {savedNumbers.length === 0 && <p className="text-xs text-gray-400 text-center py-2">Nenhum registro salvo ainda</p>}
              {savedNumbers.map(n => (
                <div key={n.id} className="bg-white rounded border border-gray-200 px-3 py-2 flex items-start justify-between gap-2">
                  <div className="min-w-0 text-xs space-y-0.5">
                    {n.label && <p className="font-semibold text-gray-800 truncate">{n.label}</p>}
                    {n.expedienteNumber && <p className="text-gray-500"><span className="text-gray-400">Exp:</span> {n.expedienteNumber}</p>}
                    {n.processNumber && <p className="text-gray-500"><span className="text-gray-400">Proc:</span> {n.processNumber}</p>}
                    {n.transactionNumber && <p className="text-gray-500"><span className="text-gray-400">Trans:</span> {n.transactionNumber}</p>}
                    {n.protocolNumber && <p className="text-gray-500"><span className="text-gray-400">Prot:</span> {n.protocolNumber}</p>}
                  </div>
                  <div className="flex gap-1 shrink-0">
                    <button type="button" onClick={() => { setEditNumberId(n.id); setEditNumber({ label: n.label ?? "", exp: n.expedienteNumber ?? "", proc: n.processNumber ?? "", trans: n.transactionNumber ?? "", prot: n.protocolNumber ?? "" }); }}
                      className="p-1 rounded hover:bg-gray-100 text-gray-400 hover:text-gray-700" title="Editar">
                      <Pencil className="h-3 w-3" />
                    </button>
                    <button type="button" onClick={() => handleDeleteNumber(n.id)} disabled={deletingNumberId === n.id}
                      className="p-1 rounded hover:bg-red-50 text-gray-400 hover:text-red-500" title="Remover">
                      {deletingNumberId === n.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <Trash2 className="h-3 w-3" />}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* ── Formulário ── */}
        {showForm && (
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 space-y-4">
            <p className="text-sm font-semibold text-amber-800 flex items-center gap-1.5">
              <Bell className="h-4 w-4" /> {editingId !== null ? "Editar Notificação ANVISA" : "Nova Notificação ANVISA"}
            </p>

            {/* Empresa */}
            <div className="space-y-3">
              {/* Dropdown carregar empresa salva */}
              {savedCompanies.length > 0 && (
                <div className="flex items-center gap-2 p-2 rounded-lg bg-white border border-amber-200">
                  <Building2 className="h-3.5 w-3.5 text-amber-600 shrink-0" />
                  <select
                    className="flex-1 border-0 bg-transparent text-xs focus:outline-none focus:ring-0 text-gray-700"
                    defaultValue=""
                    onChange={e => {
                      const c = savedCompanies.find(x => x.id === Number(e.target.value));
                      if (c) setForm(f => ({ ...f, companyName: c.name, companyCnpj: c.cnpj ?? "" }));
                      e.target.value = "";
                    }}
                  >
                    <option value="">↓ Selecionar empresa salva…</option>
                    {savedCompanies.map(c => (
                      <option key={c.id} value={c.id}>{c.name}{c.cnpj ? ` — ${c.cnpj}` : ""}</option>
                    ))}
                  </select>
                </div>
              )}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-xs font-medium">Razão Social da Empresa *</label>
                  <Input placeholder="Ex: Blumed Distribuidora de Medicamentos Ltda" value={form.companyName}
                    onChange={e => setForm(f => ({ ...f, companyName: e.target.value }))} />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-medium">CNPJ da Empresa (opcional)</label>
                  <Input placeholder="Ex: 17.911.303/0001-69" value={form.companyCnpj}
                    onChange={e => setForm(f => ({ ...f, companyCnpj: e.target.value }))} />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-medium">Nome Comercial / Marca (opcional)</label>
                  <Input placeholder="Ex: Blumed-NAC-Acetilcisteína 600mg 30 Cápsulas" value={form.brandName}
                    onChange={e => setForm(f => ({ ...f, brandName: e.target.value }))} />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-medium">Data e Hora da Notificação *</label>
                  <Input type="datetime-local" value={form.notifiedAt}
                    onChange={e => setForm(f => ({ ...f, notifiedAt: e.target.value }))} />
                </div>
              </div>
              {/* Salvar empresa no banco */}
              {form.companyName.trim() && (
                <button type="button" onClick={handleSaveCompanyToBank} disabled={savingCompany}
                  className="flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded border border-amber-300 bg-white text-amber-700 hover:bg-amber-50 transition-colors font-medium">
                  {savingCompany ? <Loader2 className="h-3 w-3 animate-spin" /> : <Save className="h-3 w-3" />}
                  Salvar empresa no banco de dados
                </button>
              )}
            </div>

            {/* Números do processo ANVISA */}
            <div className="rounded-md border border-blue-200 bg-blue-50 p-3 space-y-2">
              <div className="flex items-center justify-between">
                <p className="text-xs font-semibold text-blue-800 flex items-center gap-1.5">
                  <ShieldCheck className="h-3.5 w-3.5" /> Números do Processo ANVISA (opcionais)
                </p>
              </div>
              {/* Dropdown carregar números salvos */}
              {savedNumbers.length > 0 && (
                <div className="flex items-center gap-2 p-2 rounded bg-white border border-blue-200">
                  <Database className="h-3.5 w-3.5 text-blue-500 shrink-0" />
                  <select
                    className="flex-1 border-0 bg-transparent text-xs focus:outline-none focus:ring-0 text-gray-700"
                    defaultValue=""
                    onChange={e => {
                      const n = savedNumbers.find(x => x.id === Number(e.target.value));
                      if (n) setForm(f => ({
                        ...f,
                        expedienteNumber: n.expedienteNumber ?? "",
                        processNumber: n.processNumber ?? "",
                        transactionNumber: n.transactionNumber ?? "",
                        protocolNumber: n.protocolNumber ?? "",
                      }));
                      e.target.value = "";
                    }}
                  >
                    <option value="">↓ Carregar números salvos…</option>
                    {savedNumbers.map(n => (
                      <option key={n.id} value={n.id}>
                        {n.label ?? n.expedienteNumber ?? `ID ${n.id}`}
                        {n.expedienteNumber && n.label !== n.expedienteNumber ? ` (Exp: ${n.expedienteNumber})` : ""}
                      </option>
                    ))}
                  </select>
                </div>
              )}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <div className="space-y-1">
                  <label className="text-xs font-medium text-blue-700">Nº do Expediente</label>
                  <Input placeholder="Ex: 0671387260" value={form.expedienteNumber}
                    onChange={e => setForm(f => ({ ...f, expedienteNumber: e.target.value }))} className="h-8 text-xs" />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-medium text-blue-700">Nº do Processo</label>
                  <Input placeholder="Ex: 25351119711202645" value={form.processNumber}
                    onChange={e => setForm(f => ({ ...f, processNumber: e.target.value }))} className="h-8 text-xs" />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-medium text-blue-700">Nº de Transação</label>
                  <Input placeholder="Ex: 8941182026" value={form.transactionNumber}
                    onChange={e => setForm(f => ({ ...f, transactionNumber: e.target.value }))} className="h-8 text-xs" />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-medium text-blue-700">Nº de Protocolo</label>
                  <Input placeholder="Ex: 20260000000600557" value={form.protocolNumber}
                    onChange={e => setForm(f => ({ ...f, protocolNumber: e.target.value }))} className="h-8 text-xs" />
                </div>
              </div>
              {/* Salvar números no banco */}
              {(form.expedienteNumber || form.processNumber || form.transactionNumber || form.protocolNumber) && (
                <button type="button" onClick={handleSaveNumbersToBank} disabled={savingNumber}
                  className="flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded border border-blue-300 bg-white text-blue-700 hover:bg-blue-50 transition-colors font-medium">
                  {savingNumber ? <Loader2 className="h-3 w-3 animate-spin" /> : <Save className="h-3 w-3" />}
                  Salvar estes números no banco de dados
                </button>
              )}
            </div>

            <div className="space-y-1">
              <label className="text-xs font-medium">Anotações (opcional)</label>
              <Textarea placeholder="Observações sobre a notificação..." rows={2} value={form.notes}
                onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} />
            </div>

            {/* ── Textos do documento (editáveis) ── */}
            <div className="rounded-md border border-indigo-200 bg-indigo-50 p-3 space-y-3">
              <p className="text-xs font-semibold text-indigo-800 flex items-center gap-1.5">
                📄 Textos do Documento — edite conforme necessário
              </p>
              <div className="space-y-1">
                <label className="text-xs font-medium text-indigo-700">Seção 1 — Assunto</label>
                <Textarea rows={2} value={form.docAssunto}
                  onChange={e => setForm(f => ({ ...f, docAssunto: e.target.value }))}
                  className="text-xs bg-white" />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium text-indigo-700">Seção 3 — Descrição da Alteração</label>
                <Textarea rows={5} value={form.docDescricao}
                  onChange={e => setForm(f => ({ ...f, docDescricao: e.target.value }))}
                  className="text-xs bg-white" />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium text-indigo-700">Seção 6 — Validação Analítica e Estudos</label>
                <Textarea rows={4} value={form.docValidacao}
                  onChange={e => setForm(f => ({ ...f, docValidacao: e.target.value }))}
                  className="text-xs bg-white" />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium text-indigo-700">Seção 7 — Justificativa Técnica</label>
                <Textarea rows={4} value={form.docJustificativa}
                  onChange={e => setForm(f => ({ ...f, docJustificativa: e.target.value }))}
                  className="text-xs bg-white" />
              </div>
              <p className="text-xs text-indigo-600">
                ℹ️ As seções 2 (Produto), 4 (Empresa), 5 (Identificação Comercial) e 8 (Assinatura) são preenchidas automaticamente com os dados do protocolo e da notificação.
              </p>
            </div>

            {/* Confirmação + Protocolo ANVISA (obrigatório quando confirmado) */}
            <div className="rounded-md border border-amber-300 bg-amber-100 p-3 space-y-3">
              <label className="flex items-start gap-2.5 cursor-pointer select-none">
                <input type="checkbox" className="mt-0.5 h-4 w-4 rounded border-amber-400 accent-amber-600"
                  checked={form.confirmed} onChange={e => setForm(f => ({ ...f, confirmed: e.target.checked }))} />
                <span className="text-sm font-semibold text-amber-900">
                  ✅ Confirmo que a notificação já foi realizada na ANVISA
                </span>
              </label>

              {form.confirmed && (
                <p className="text-xs text-amber-700 font-medium pl-6">
                  Para confirmar é obrigatório anexar o protocolo de petição gerado pela ANVISA.
                </p>
              )}

              <div className="pl-6">
                <AttachRow
                  label="Protocolo ANVISA" required={form.confirmed} field="protocolo"
                  fileName={form.attachmentFileName}
                  onClear={() => setForm(f => ({ ...f, attachmentObjectPath: null, attachmentFileName: null, attachmentFileType: null }))}
                  onPick={() => protocoloInputRef.current?.click()}
                />
              </div>
              <input ref={protocoloInputRef} type="file" accept=".pdf,.doc,.docx,image/*" className="hidden" onChange={makeFileHandler("protocolo")} />
            </div>

            {/* Rótulo e Padronização — sempre visíveis, opcionais */}
            <div className="rounded-md border border-slate-200 bg-slate-50 p-3 space-y-2">
              <p className="text-xs font-medium text-slate-600 mb-1">Documentos adicionais (opcionais)</p>
              <AttachRow
                label="Rótulo" field="rotulo"
                fileName={form.rotuloFileName}
                onClear={() => setForm(f => ({ ...f, rotuloObjectPath: null, rotuloFileName: null, rotuloFileType: null }))}
                onPick={() => rotuloInputRef.current?.click()}
              />
              <AttachRow
                label="Padronização" field="padronizacao"
                fileName={form.padronizacaoFileName}
                onClear={() => setForm(f => ({ ...f, padronizacaoObjectPath: null, padronizacaoFileName: null, padronizacaoFileType: null }))}
                onPick={() => padronizacaoInputRef.current?.click()}
              />
              <input ref={rotuloInputRef}       type="file" accept=".pdf,.doc,.docx,image/*" className="hidden" onChange={makeFileHandler("rotulo")} />
              <input ref={padronizacaoInputRef} type="file" accept=".pdf,.doc,.docx,image/*" className="hidden" onChange={makeFileHandler("padronizacao")} />
            </div>

            <div className="flex justify-end gap-2">
              <Button size="sm" variant="outline" onClick={resetForm}>Cancelar</Button>
              <Button size="sm" disabled={!canSave || saving} onClick={handleSave}>
                {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : <Plus className="h-3.5 w-3.5 mr-1" />}
                {editingId !== null ? "Salvar Alterações" : "Salvar Notificação"}
              </Button>
            </div>
          </div>
        )}

        {/* ── Lista ── */}
        {isLoading ? (
          <div className="flex items-center justify-center py-8 text-muted-foreground text-sm">
            <Loader2 className="h-4 w-4 animate-spin mr-2" /> Carregando…
          </div>
        ) : notifications.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-10 text-muted-foreground">
            <ShieldCheck className="h-8 w-8 mb-2 opacity-30" />
            <p className="text-sm">Nenhuma notificação ANVISA registrada ainda.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {notifications.map(n => (
              <div key={n.id} className={`rounded-lg border p-4 ${n.confirmed ? "border-green-200 bg-green-50" : "border-slate-200 bg-slate-50"}`}>
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0 space-y-1.5">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold text-sm">{n.companyName}</span>
                      {n.confirmed
                        ? <Badge className="bg-green-100 text-green-800 border-green-300 text-xs"><CheckCircle2 className="h-3 w-3 mr-1" /> Confirmada</Badge>
                        : <Badge variant="outline" className="text-xs text-amber-700 border-amber-300 bg-amber-50">Pendente confirmação</Badge>}
                    </div>
                    <div className="text-xs text-muted-foreground flex items-center gap-3 flex-wrap">
                      {n.companyCnpj && <span>CNPJ: <strong>{n.companyCnpj}</strong></span>}
                      {n.brandName && <span>Marca: {n.brandName}</span>}
                    </div>
                    <div className="text-xs text-muted-foreground flex items-center gap-3 flex-wrap">
                      <span>📅 Notificado em: <strong>{fmtDateTime(n.notifiedAt)}</strong></span>
                      {n.createdByName && <span>Registrado por: {n.createdByName}</span>}
                    </div>
                    {(n.expedienteNumber || n.processNumber || n.transactionNumber || n.protocolNumber) && (
                      <div className="text-xs text-blue-700 bg-blue-50 rounded px-2 py-1 border border-blue-200 space-y-0.5">
                        {n.expedienteNumber && <div><strong>Expediente:</strong> {n.expedienteNumber}</div>}
                        {n.processNumber && <div><strong>Processo:</strong> {n.processNumber}</div>}
                        {n.transactionNumber && <div><strong>Transação:</strong> {n.transactionNumber}</div>}
                        {n.protocolNumber && <div><strong>Protocolo ANVISA:</strong> {n.protocolNumber}</div>}
                      </div>
                    )}
                    {n.notes && <p className="text-xs text-slate-600 bg-white rounded px-2 py-1 border border-slate-200">{n.notes}</p>}

                    {/* ── Assinatura eletrônica ── */}
                    {n.signedByName ? (
                      <div className="flex items-center gap-2 bg-green-50 border border-green-200 rounded px-2.5 py-1.5">
                        <ShieldCheck className="h-3.5 w-3.5 text-green-600 shrink-0" />
                        <div className="min-w-0 flex-1">
                          <div className="flex items-baseline gap-2 flex-wrap">
                            <span style={{ fontFamily: "'Dancing Script', cursive", fontSize: "0.95rem", fontWeight: 600, color: "#111827" }}>
                              {n.signedByName}
                            </span>
                            {n.signedAt && (
                              <span className="text-[10px] text-green-600">
                                — {new Date(n.signedAt).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" })}
                              </span>
                            )}
                          </div>
                          {n.signedByRole && (
                            <p className="text-xs text-gray-600 font-medium mt-0.5">{n.signedByRole}</p>
                          )}
                          {(n as any).signedRegistration && (
                            <p className="text-xs text-gray-400 mt-0.5">{(n as any).signedRegistration}</p>
                          )}
                        </div>
                        {isAdmin && (
                          <button
                            className="text-green-400 hover:text-red-500 transition-colors ml-auto"
                            title="Remover assinatura"
                            onClick={() => handleUnsign(n.id)}
                            disabled={unsigningId === n.id}
                          >
                            {unsigningId === n.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3 w-3" />}
                          </button>
                        )}
                      </div>
                    ) : (
                      <button
                        className="flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded border border-primary/30 bg-primary/5 text-primary hover:bg-primary/15 transition-colors font-medium"
                        onClick={() => { setSigTargetId(n.id); setSigRole("Responsável Técnico"); setSigDialogOpen(true); }}
                        title="Assinar esta notificação digitalmente"
                      >
                        <PenLine className="h-3 w-3" /> Assinar digitalmente
                      </button>
                    )}

                    {/* Anexos */}
                    {(n.attachmentFileName || n.rotuloFileName || n.padronizacaoFileName) && (
                      <div className="flex flex-wrap gap-3 mt-1">
                        {n.attachmentFileName && n.attachmentObjectPath && (
                          <button className="flex items-center gap-1 text-xs text-blue-700 hover:text-blue-900 hover:underline"
                            onClick={() => handleDownload(n.attachmentObjectPath!, n.attachmentFileName!)}>
                            <FileText className="h-3.5 w-3.5 shrink-0" />
                            <span>Protocolo ANVISA</span>
                            <Download className="h-3 w-3" />
                          </button>
                        )}
                        {n.rotuloFileName && n.rotuloObjectPath && (
                          <button className="flex items-center gap-1 text-xs text-violet-700 hover:text-violet-900 hover:underline"
                            onClick={() => handleDownload(n.rotuloObjectPath!, n.rotuloFileName!)}>
                            <FileText className="h-3.5 w-3.5 shrink-0" />
                            <span>Rótulo</span>
                            <Download className="h-3 w-3" />
                          </button>
                        )}
                        {n.padronizacaoFileName && n.padronizacaoObjectPath && (
                          <button className="flex items-center gap-1 text-xs text-teal-700 hover:text-teal-900 hover:underline"
                            onClick={() => handleDownload(n.padronizacaoObjectPath!, n.padronizacaoFileName!)}>
                            <FileText className="h-3.5 w-3.5 shrink-0" />
                            <span>Padronização</span>
                            <Download className="h-3 w-3" />
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                  <div className="flex items-center gap-1 shrink-0 flex-wrap justify-end">
                    <Button
                      size="sm" variant="outline"
                      className="h-7 text-xs gap-1 border-amber-300 text-amber-700 hover:bg-amber-50"
                      onClick={() => { startEdit(n); }}
                      title="Editar esta notificação"
                    >
                      ✏️ Editar
                    </Button>
                    <Button
                      size="sm" variant="outline"
                      className="h-7 text-xs gap-1 border-primary/30 text-primary hover:bg-primary/10"
                      onClick={() => handleGenerateDoc(n)}
                      disabled={generatingDocId === n.id}
                      title="Gerar documento ANVISA para imprimir/PDF"
                    >
                      {generatingDocId === n.id
                        ? <Loader2 className="h-3 w-3 animate-spin" />
                        : <FileText className="h-3 w-3" />}
                      {generatingDocId === n.id ? "Gerando…" : "Gerar Doc"}
                    </Button>
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button size="icon" variant="ghost" className="h-7 w-7 text-slate-400 hover:text-red-500">
                          {deletingId === n.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Remover notificação?</AlertDialogTitle>
                          <AlertDialogDescription>
                            Isso removerá o registro de notificação ANVISA de <strong>{n.companyName}</strong>. Esta ação não pode ser desfeita.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancelar</AlertDialogCancel>
                          <AlertDialogAction onClick={() => handleDelete(n.id)} className="bg-red-600 hover:bg-red-700">Remover</AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
    </>
  );
}

export { AnvisaTab };
