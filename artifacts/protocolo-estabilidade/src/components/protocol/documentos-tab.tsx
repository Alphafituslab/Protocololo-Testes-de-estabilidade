import { useState, useRef, useEffect, useCallback, useMemo, Fragment } from "react";
import {
  useGetProtocol,
  useListAttachments,
  useCreateAttachment,
  useUpdateAttachment,
  useDeleteAttachment,
  getListAttachmentsQueryKey,
  type BibliographicReference,
  type BibliographicReferenceInput,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Plus, Pencil, Trash2, Upload, Download, File, ExternalLink, Paperclip, Loader2, Eye, FileText, X } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/use-auth";
import { fmtDate } from "@/lib/utils";

function DocumentosTab({ protocolId }: { protocolId: number }) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<{ current: number; total: number; pct: number } | null>(null);
  const [description, setDescription] = useState("");
  const [printing, setPrinting] = useState(false);

  // inline edit state
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editFileName, setEditFileName] = useState("");
  const [editDescription, setEditDescription] = useState("");

  const { data: protocol } = useGetProtocol(protocolId);
  const { data: attachments = [], isLoading } = useListAttachments(protocolId);

  const createAttachment = useCreateAttachment({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListAttachmentsQueryKey(protocolId) });
      },
      onError: () => toast({ title: "Erro ao registrar documento", variant: "destructive" }),
    },
  });

  const updateAttachment = useUpdateAttachment({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListAttachmentsQueryKey(protocolId) });
        setEditingId(null);
        toast({ title: "Documento atualizado" });
      },
      onError: () => toast({ title: "Erro ao atualizar documento", variant: "destructive" }),
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

  const allowed = [
    "application/pdf",
    "application/msword",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "image/png", "image/jpeg", "image/webp",
  ];

  async function uploadSingleFile(file: File, token: string | null): Promise<void> {
    if (!allowed.includes(file.type)) {
      toast({ title: `"${file.name}" — tipo não suportado`, description: "Aceito: PDF, Word, imagens", variant: "destructive" });
      return;
    }
    const MAX_MB = 20;
    if (file.size > MAX_MB * 1024 * 1024) {
      toast({ title: `"${file.name}" é muito grande (máx ${MAX_MB} MB)`, variant: "destructive" });
      return;
    }
    const urlRes = await fetch("/api/storage/uploads/request-url", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: JSON.stringify({ name: file.name, size: file.size, contentType: file.type }),
    });
    if (!urlRes.ok) throw new Error(`Erro ao obter URL para "${file.name}"`);
    const { uploadURL, objectPath } = await urlRes.json() as { uploadURL: string; objectPath: string };

    const putRes = await fetch(uploadURL, { method: "PUT", body: file, headers: { "Content-Type": file.type } });
    if (!putRes.ok) throw new Error(`Erro ao enviar "${file.name}"`);

    await createAttachment.mutateAsync({
      id: protocolId,
      data: { fileName: file.name, fileType: file.type, fileSizeBytes: file.size, objectPath, description: description || undefined },
    });
  }

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    e.target.value = "";
    if (files.length === 0) return;

    setUploading(true);
    const token = localStorage.getItem("alphafitus_token");
    let done = 0;
    const total = files.length;
    setUploadProgress({ current: 0, total, pct: 0 });

    const errors: string[] = [];
    for (const file of files) {
      try {
        await uploadSingleFile(file, token);
      } catch (err) {
        errors.push(err instanceof Error ? err.message : `Erro: ${file.name}`);
      }
      done++;
      setUploadProgress({ current: done, total, pct: Math.round((done / total) * 100) });
    }

    queryClient.invalidateQueries({ queryKey: getListAttachmentsQueryKey(protocolId) });
    setDescription("");

    if (errors.length === 0) {
      toast({ title: total === 1 ? "Documento anexado com sucesso" : `${total} documentos anexados com sucesso` });
    } else if (errors.length < total) {
      toast({ title: `${total - errors.length} de ${total} enviados`, description: errors[0], variant: "destructive" });
    } else {
      toast({ title: "Falha no upload", description: errors[0], variant: "destructive" });
    }

    setUploading(false);
    setUploadProgress(null);
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
            placeholder="Descrição p/ novos anexos (opcional)"
            value={description}
            onChange={e => setDescription(e.target.value)}
            className="h-8 text-sm w-56"
            disabled={uploading}
          />
          <Button size="sm" onClick={() => fileInputRef.current?.click()} disabled={uploading}>
            {uploading ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : <Upload className="h-3.5 w-3.5 mr-1" />}
            {uploading && uploadProgress
              ? `${uploadProgress.current}/${uploadProgress.total} (${uploadProgress.pct}%)`
              : "Anexar arquivos"}
          </Button>
          <input ref={fileInputRef} type="file" className="hidden" multiple accept=".pdf,.doc,.docx,.png,.jpg,.jpeg,.webp" onChange={handleFileChange} />
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="flex items-center justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
        ) : attachments.length === 0 ? (
          <div className="text-center py-10 text-muted-foreground text-sm">
            <Paperclip className="h-8 w-8 mx-auto mb-2 opacity-30" />
            <p>Nenhum documento anexado.</p>
            <p className="text-xs mt-1">Selecione um ou mais arquivos (PDF, Word, imagens) para anexar de uma vez.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {attachments.map(att => (
              <div key={att.id} className="rounded-lg border bg-muted/30 hover:bg-muted/50 transition-colors">
                {/* ── view row ── */}
                {editingId !== att.id && (
                  <div className="flex items-center gap-3 p-3">
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
                      {/* edit button */}
                      <Button
                        variant="ghost" size="sm" className="h-7 w-7 p-0"
                        title="Editar nome / descrição"
                        onClick={() => { setEditingId(att.id); setEditFileName(att.fileName); setEditDescription(att.description ?? ""); }}
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      {/* download */}
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
                      {/* delete */}
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
                )}
                {/* ── inline edit row ── */}
                {editingId === att.id && (
                  <div className="flex flex-col gap-2 p-3">
                    <div className="flex items-center gap-2">
                      <div className="flex-shrink-0">{fileIcon(att.fileType)}</div>
                      <div className="flex-1 flex gap-2">
                        <div className="flex-1">
                          <p className="text-[10px] text-muted-foreground mb-0.5">Nome do arquivo</p>
                          <Input
                            value={editFileName}
                            onChange={e => setEditFileName(e.target.value)}
                            className="h-7 text-sm"
                            autoFocus
                            onKeyDown={e => {
                              if (e.key === "Enter") updateAttachment.mutate({ id: protocolId, attachmentId: att.id, data: { fileName: editFileName.trim() || att.fileName, description: editDescription || undefined } });
                              if (e.key === "Escape") setEditingId(null);
                            }}
                          />
                        </div>
                        <div className="flex-1">
                          <p className="text-[10px] text-muted-foreground mb-0.5">Descrição (opcional)</p>
                          <Input
                            value={editDescription}
                            onChange={e => setEditDescription(e.target.value)}
                            placeholder="ex: Laudo de análise"
                            className="h-7 text-sm"
                            onKeyDown={e => {
                              if (e.key === "Enter") updateAttachment.mutate({ id: protocolId, attachmentId: att.id, data: { fileName: editFileName.trim() || att.fileName, description: editDescription || undefined } });
                              if (e.key === "Escape") setEditingId(null);
                            }}
                          />
                        </div>
                      </div>
                      <div className="flex gap-1 flex-shrink-0 self-end">
                        <Button size="sm" className="h-7 px-3 text-xs" disabled={updateAttachment.isPending}
                          onClick={() => updateAttachment.mutate({ id: protocolId, attachmentId: att.id, data: { fileName: editFileName.trim() || att.fileName, description: editDescription || undefined } })}>
                          {updateAttachment.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : "Salvar"}
                        </Button>
                        <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={() => setEditingId(null)}>
                          <X className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

const TIPO_LABELS_REF: Record<string, string> = {
  geral: "Geral",
  ativo: "Referência do Ativo",
  analitica: "Metodologia Analítica",
  regulatoria: "Regulatória",
  embalagem: "Embalagem",
  degradacao: "Degradação",
  artigo: "Artigo", livro: "Livro", site: "Site/URL",
  regulamentacao: "Regulamentação", norma: "Norma Técnica", outro: "Outro",
};

const TIPO_COLORS_REF: Record<string, { bg: string; text: string; dot: string }> = {
  geral:       { bg: "bg-green-100",  text: "text-green-800",  dot: "🟢" },
  ativo:       { bg: "bg-blue-100",   text: "text-blue-800",   dot: "🔵" },
  analitica:   { bg: "bg-purple-100", text: "text-purple-800", dot: "🟣" },
  regulatoria: { bg: "bg-orange-100", text: "text-orange-800", dot: "🟠" },
  embalagem:   { bg: "bg-yellow-100", text: "text-yellow-800", dot: "🟡" },
  degradacao:  { bg: "bg-red-100",    text: "text-red-800",    dot: "🔴" },
};

const TIPO_ORDER_REF = ["geral", "ativo", "analitica", "regulatoria", "embalagem", "degradacao"] as const;
const TIPO_LEGACY = ["artigo", "livro", "site", "regulamentacao", "norma", "outro"];

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

const EMPTY_NEW_REF: BibliographicReferenceInput = {
  titulo: "", autores: "", ano: undefined, fonte: "",
  tipoReferencia: "geral", ativoRelacionado: "", descricao: "", doi: "",
  volume: "", numero: "", paginas: "", color: "",
};

const REF_COLOR_SWATCHES_PD = [
  { value: "",         label: "Padrão",  tw: "bg-gray-300",   ring: "ring-gray-400" },
  { value: "vermelho", label: "Vermelho",tw: "bg-red-500",    ring: "ring-red-400" },
  { value: "laranja",  label: "Laranja", tw: "bg-orange-500", ring: "ring-orange-400" },
  { value: "amarelo",  label: "Amarelo", tw: "bg-yellow-400", ring: "ring-yellow-400" },
  { value: "verde",    label: "Verde",   tw: "bg-green-500",  ring: "ring-green-400" },
  { value: "ciano",    label: "Ciano",   tw: "bg-teal-500",   ring: "ring-teal-400" },
  { value: "azul",     label: "Azul",    tw: "bg-blue-500",   ring: "ring-blue-400" },
  { value: "violeta",  label: "Violeta", tw: "bg-violet-500", ring: "ring-violet-400" },
  { value: "rosa",     label: "Rosa",    tw: "bg-pink-500",   ring: "ring-pink-400" },
  { value: "cinza",    label: "Cinza",   tw: "bg-slate-500",  ring: "ring-slate-400" },
];

const COLOR_BLOCK_PD: Record<string, { border: string; bg: string; dot: string; label: string }> = {
  vermelho: { border: "border-l-red-400",    bg: "bg-red-50",    dot: "bg-red-400",    label: "Vermelho" },
  laranja:  { border: "border-l-orange-400", bg: "bg-orange-50", dot: "bg-orange-400", label: "Laranja" },
  amarelo:  { border: "border-l-yellow-400", bg: "bg-yellow-50", dot: "bg-yellow-400", label: "Amarelo" },
  verde:    { border: "border-l-green-400",  bg: "bg-green-50",  dot: "bg-green-400",  label: "Verde" },
  ciano:    { border: "border-l-teal-400",   bg: "bg-teal-50",   dot: "bg-teal-400",   label: "Ciano" },
  azul:     { border: "border-l-blue-400",   bg: "bg-blue-50",   dot: "bg-blue-400",   label: "Azul" },
  violeta:  { border: "border-l-violet-400", bg: "bg-violet-50", dot: "bg-violet-400", label: "Violeta" },
  rosa:     { border: "border-l-pink-400",   bg: "bg-pink-50",   dot: "bg-pink-400",   label: "Rosa" },
  cinza:    { border: "border-l-slate-400",  bg: "bg-slate-50",  dot: "bg-slate-400",  label: "Cinza" },
};

function RefSelectRow({ ref, selectedIds, toggleSelect }: {
  ref: BibliographicReference;
  selectedIds: Set<number>;
  toggleSelect: (id: number) => void;
}) {
  return (
    <label
      className={`flex items-start gap-3 w-full p-3 rounded-lg cursor-pointer transition-colors ${selectedIds.has(ref.id) ? "bg-primary/8 border border-primary/30" : "hover:bg-muted/60"}`}
    >
      <input
        type="checkbox"
        className="mt-0.5 h-4 w-4 accent-primary flex-shrink-0"
        checked={selectedIds.has(ref.id)}
        onChange={() => toggleSelect(ref.id)}
      />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium leading-snug">{ref.titulo}</p>
        {ref.autores && <p className="text-xs text-muted-foreground">{ref.autores}</p>}
        {ref.ano && <p className="text-xs text-muted-foreground">{ref.ano}</p>}
        {ref.autoInclude && (
          <span className="text-xs px-1.5 py-0.5 rounded bg-green-100 text-green-700 font-medium">auto-incluída</span>
        )}
      </div>
    </label>
  );
}


export { DocumentosTab };
