import twilio from "twilio";
import { logger } from "./logger.js";

const WHATSAPP_DEST = "whatsapp:+5548998678983";

function getClient() {
  const sid = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  const from = process.env.TWILIO_WHATSAPP_FROM;
  if (!sid || !token || !from) return null;
  return { client: twilio(sid, token), from };
}

export type DeletedProtocolInfo = {
  id: number;
  productName: string;
  certNumber: string;
  companyName: string;
  cnpj: string;
  status: string;
  finalStatus?: string | null;
  conclusion?: string | null;
  validityMonths?: number | null;
  issueDate?: string | null;
  deletedByName: string;
  deletedByUsername: string;
  deletedAt: Date;
};

export async function notifyProtocolDeleted(info: DeletedProtocolInfo): Promise<void> {
  const cfg = getClient();
  if (!cfg) {
    logger.warn("Twilio não configurado — notificação WhatsApp ignorada. Configure TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN e TWILIO_WHATSAPP_FROM.");
    return;
  }

  const statusLabel: Record<string, string> = {
    rascunho: "Rascunho",
    em_andamento: "Em Andamento",
    concluido: "Concluído",
    aprovado: "✅ Aprovado",
    reprovado: "❌ Reprovado",
    aprovado_com_ressalva: "⚠️ Aprovado com Ressalva",
  };

  const dataHora = info.deletedAt.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" });

  const body = [
    `🚨 *ALERTA — PROTOCOLO EXCLUÍDO*`,
    ``,
    `📋 *Dados do Protocolo*`,
    `• Produto: ${info.productName}`,
    `• Nº Certificado: ${info.certNumber}`,
    `• Empresa: ${info.companyName}`,
    `• CNPJ: ${info.cnpj}`,
    `• Status: ${statusLabel[info.status] ?? info.status}`,
    info.finalStatus ? `• Resultado Final: ${statusLabel[info.finalStatus] ?? info.finalStatus}` : null,
    info.conclusion ? `• Conclusão: ${info.conclusion}` : null,
    info.validityMonths ? `• Validade: ${info.validityMonths} meses` : null,
    info.issueDate ? `• Data de Emissão: ${info.issueDate}` : null,
    `• ID interno: #${info.id}`,
    ``,
    `👤 *Excluído por*`,
    `• Usuário: ${info.deletedByName} (${info.deletedByUsername})`,
    `• Data/Hora: ${dataHora}`,
    ``,
    `⚠️ Esta ação é irreversível. Verifique o histórico de auditoria do sistema para mais detalhes.`,
  ].filter(Boolean).join("\n");

  try {
    await cfg.client.messages.create({
      from: cfg.from,
      to: WHATSAPP_DEST,
      body,
    });
    logger.info({ protocolId: info.id }, "Notificação WhatsApp de exclusão enviada");
  } catch (err) {
    logger.error({ err, protocolId: info.id }, "Falha ao enviar notificação WhatsApp");
  }
}
