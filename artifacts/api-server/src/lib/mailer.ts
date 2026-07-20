import nodemailer from "nodemailer";
import { logger } from "./logger.js";

function getTransport() {
  const user = process.env.GMAIL_USER;
  const pass = process.env.GMAIL_APP_PASSWORD;
  if (!user || !pass) return null;
  return nodemailer.createTransport({
    service: "gmail",
    auth: { user, pass },
  });
}

export interface ClientAccessEmailPayload {
  toEmail: string;
  toName: string;
  username: string;
  password: string;
  productName: string;
  certNumber: string | null;
  accessExpiresAt: Date | null;
  appUrl: string;
  canViewCertificate: boolean;
  canViewReport: boolean;
  /** True when the client has access to standalone CoA documents (not protocol certificate) */
  canViewCoa?: boolean;
}

export async function sendClientAccessEmail(payload: ClientAccessEmailPayload): Promise<{ ok: boolean; error?: string }> {
  const transport = getTransport();
  if (!transport) {
    logger.warn("GMAIL não configurado — e-mail de acesso ignorado.");
    return { ok: false, error: "E-mail não configurado no servidor." };
  }

  const fromUser = process.env.GMAIL_USER!;

  const expiryText = payload.accessExpiresAt
    ? `<strong>${payload.accessExpiresAt.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" })}</strong>`
    : "<strong>permanente</strong>";

  const docList = [
    payload.canViewCertificate ? "✅ Certificado de Análise" : null,
    payload.canViewReport ? "✅ Relatório ANVISA" : null,
    payload.canViewCoa ? "✅ Certificado de Análise (CoA)" : null,
  ].filter(Boolean).join("<br>");

  const html = `
<!DOCTYPE html>
<html lang="pt-BR">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#f4f6f9;font-family:Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f6f9;padding:32px 0;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:8px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.08);">

        <!-- Header -->
        <tr>
          <td style="background:#1e3a5f;padding:28px 36px;text-align:center;">
            <p style="margin:0;color:#a8c4e0;font-size:11px;letter-spacing:2px;text-transform:uppercase;">Alphafitus Laboratório Nutracêutico</p>
            <h1 style="margin:8px 0 0;color:#ffffff;font-size:20px;font-weight:700;">Laudo Disponível para Consulta</h1>
          </td>
        </tr>

        <!-- Body -->
        <tr>
          <td style="padding:32px 36px;">
            <p style="margin:0 0 16px;color:#374151;font-size:15px;">Olá, <strong>${payload.toName}</strong>,</p>
            <p style="margin:0 0 24px;color:#374151;font-size:14px;line-height:1.6;">
              O resultado do seu protocolo de estabilidade está disponível no Portal do Cliente da Alphafitus.
              Acesse com as credenciais abaixo:
            </p>

            <!-- Product box -->
            <table width="100%" cellpadding="0" cellspacing="0" style="background:#f0f4f8;border-radius:6px;margin-bottom:24px;">
              <tr><td style="padding:16px 20px;">
                <p style="margin:0 0 4px;color:#6b7280;font-size:11px;text-transform:uppercase;letter-spacing:1px;">Produto</p>
                <p style="margin:0;color:#111827;font-size:16px;font-weight:700;">${payload.productName}</p>
                ${payload.certNumber ? `<p style="margin:4px 0 0;color:#6b7280;font-size:12px;font-family:monospace;">Certificado nº ${payload.certNumber}</p>` : ""}
              </td></tr>
            </table>

            <!-- Credentials -->
            <table width="100%" cellpadding="0" cellspacing="0" style="border:2px solid #1e3a5f;border-radius:6px;margin-bottom:24px;">
              <tr><td style="background:#1e3a5f;padding:10px 20px;">
                <p style="margin:0;color:#ffffff;font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:1px;">🔐 Credenciais de Acesso</p>
              </td></tr>
              <tr><td style="padding:16px 20px;">
                <table width="100%" cellpadding="0" cellspacing="0">
                  <tr>
                    <td width="50%" style="padding:6px 0;">
                      <p style="margin:0;color:#6b7280;font-size:11px;">Usuário</p>
                      <p style="margin:2px 0 0;color:#111827;font-size:15px;font-weight:700;font-family:monospace;">${payload.username}</p>
                    </td>
                    <td width="50%" style="padding:6px 0;">
                      <p style="margin:0;color:#6b7280;font-size:11px;">Senha</p>
                      <p style="margin:2px 0 0;color:#111827;font-size:15px;font-weight:700;font-family:monospace;">${payload.password}</p>
                    </td>
                  </tr>
                </table>
              </td></tr>
            </table>

            <!-- Access info -->
            <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:24px;">
              <tr>
                <td width="50%" style="padding-right:8px;">
                  <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:6px;padding:12px 16px;">
                    <p style="margin:0 0 4px;color:#6b7280;font-size:11px;text-transform:uppercase;">Documentos disponíveis</p>
                    <p style="margin:0;color:#166534;font-size:13px;line-height:1.8;">${docList || "Nenhum documento liberado"}</p>
                  </div>
                </td>
                <td width="50%" style="padding-left:8px;">
                  <div style="background:#fffbeb;border:1px solid #fde68a;border-radius:6px;padding:12px 16px;">
                    <p style="margin:0 0 4px;color:#6b7280;font-size:11px;text-transform:uppercase;">Acesso válido até</p>
                    <p style="margin:0;color:#92400e;font-size:13px;">${expiryText}</p>
                  </div>
                </td>
              </tr>
            </table>

            <!-- CTA Button -->
            <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:28px;">
              <tr><td align="center">
                <a href="${payload.appUrl}" style="display:inline-block;background:#1e3a5f;color:#ffffff;text-decoration:none;font-size:15px;font-weight:700;padding:14px 36px;border-radius:6px;">
                  Acessar Portal do Cliente →
                </a>
              </td></tr>
            </table>

            <p style="margin:0;color:#9ca3af;font-size:12px;line-height:1.6;border-top:1px solid #e5e7eb;padding-top:20px;">
              Este e-mail foi gerado automaticamente. Guarde suas credenciais em local seguro.<br>
              Em caso de dúvidas, entre em contato com a Alphafitus.
            </p>
          </td>
        </tr>

        <!-- Footer -->
        <tr>
          <td style="background:#f9fafb;padding:16px 36px;text-align:center;border-top:1px solid #e5e7eb;">
            <p style="margin:0;color:#9ca3af;font-size:11px;">© Alphafitus Laboratório Nutracêutico · Sistema de Gestão de Estabilidade</p>
          </td>
        </tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`;

  try {
    await transport.sendMail({
      from: `"Alphafitus Lab" <${fromUser}>`,
      to: `"${payload.toName}" <${payload.toEmail}>`,
      subject: `🔬 Laudo disponível — ${payload.productName}`,
      html,
    });
    logger.info({ to: payload.toEmail, product: payload.productName }, "E-mail de acesso enviado ao cliente");
    return { ok: true };
  } catch (err) {
    logger.error({ err, to: payload.toEmail }, "Falha ao enviar e-mail de acesso");
    return { ok: false, error: (err as Error).message };
  }
}

export interface ClientCoaEmailPayload {
  toEmail: string;
  toName: string;
  username: string;
  password: string;
  productName: string;
  lotNumber: string;
  accessExpiresAt: Date | null;
  appUrl: string;
}

export async function sendClientCoaAccessEmail(payload: ClientCoaEmailPayload): Promise<{ ok: boolean; error?: string }> {
  const transport = getTransport();
  if (!transport) {
    logger.warn("GMAIL não configurado — e-mail de acesso CoA ignorado.");
    return { ok: false, error: "E-mail não configurado no servidor." };
  }

  const fromUser = process.env.GMAIL_USER!;
  const expiryText = payload.accessExpiresAt
    ? `<strong>${payload.accessExpiresAt.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" })}</strong>`
    : "<strong>permanente</strong>";

  const html = `
<!DOCTYPE html>
<html lang="pt-BR">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#f4f6f9;font-family:Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f6f9;padding:32px 0;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:8px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.08);">
        <tr>
          <td style="background:#1e3a5f;padding:28px 36px;text-align:center;">
            <p style="margin:0;color:#a8c4e0;font-size:11px;letter-spacing:2px;text-transform:uppercase;">Alphafitus Laboratório Nutracêutico</p>
            <h1 style="margin:8px 0 0;color:#ffffff;font-size:20px;font-weight:700;">Certificado de Análise Disponível</h1>
          </td>
        </tr>
        <tr>
          <td style="padding:32px 36px;">
            <p style="margin:0 0 16px;color:#374151;font-size:15px;">Olá, <strong>${payload.toName}</strong>,</p>
            <p style="margin:0 0 24px;color:#374151;font-size:14px;line-height:1.6;">
              Seu Certificado de Análise (CoA) está disponível no Portal do Cliente da Alphafitus.
            </p>
            <table width="100%" cellpadding="0" cellspacing="0" style="background:#f0f4f8;border-radius:6px;margin-bottom:24px;">
              <tr><td style="padding:16px 20px;">
                <p style="margin:0 0 4px;color:#6b7280;font-size:11px;text-transform:uppercase;letter-spacing:1px;">Produto / Lote</p>
                <p style="margin:0;color:#111827;font-size:16px;font-weight:700;">${payload.productName}</p>
                ${payload.lotNumber ? `<p style="margin:4px 0 0;color:#6b7280;font-size:12px;font-family:monospace;">Lote: ${payload.lotNumber}</p>` : ""}
              </td></tr>
            </table>
            <table width="100%" cellpadding="0" cellspacing="0" style="border:2px solid #1e3a5f;border-radius:6px;margin-bottom:24px;">
              <tr><td style="background:#1e3a5f;padding:10px 20px;">
                <p style="margin:0;color:#ffffff;font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:1px;">🔐 Credenciais de Acesso</p>
              </td></tr>
              <tr><td style="padding:16px 20px;">
                <table width="100%" cellpadding="0" cellspacing="0">
                  <tr>
                    <td width="50%" style="padding:6px 0;">
                      <p style="margin:0;color:#6b7280;font-size:11px;">Usuário</p>
                      <p style="margin:2px 0 0;color:#111827;font-size:15px;font-weight:700;font-family:monospace;">${payload.username}</p>
                    </td>
                    <td width="50%" style="padding:6px 0;">
                      <p style="margin:0;color:#6b7280;font-size:11px;">Senha</p>
                      <p style="margin:2px 0 0;color:#111827;font-size:15px;font-weight:700;font-family:monospace;">${payload.password}</p>
                    </td>
                  </tr>
                </table>
              </td></tr>
            </table>
            <div style="background:#fffbeb;border:1px solid #fde68a;border-radius:6px;padding:12px 16px;margin-bottom:24px;">
              <p style="margin:0 0 4px;color:#6b7280;font-size:11px;text-transform:uppercase;">Acesso válido até</p>
              <p style="margin:0;color:#92400e;font-size:13px;">${expiryText}</p>
            </div>
            <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:28px;">
              <tr><td align="center">
                <a href="${payload.appUrl}" style="display:inline-block;background:#1e3a5f;color:#ffffff;text-decoration:none;font-size:15px;font-weight:700;padding:14px 36px;border-radius:6px;">
                  Acessar Portal do Cliente →
                </a>
              </td></tr>
            </table>
            <p style="margin:0;color:#9ca3af;font-size:12px;line-height:1.6;border-top:1px solid #e5e7eb;padding-top:20px;">
              Este e-mail foi gerado automaticamente. Guarde suas credenciais em local seguro.<br>
              Em caso de dúvidas, entre em contato com a Alphafitus.
            </p>
          </td>
        </tr>
        <tr>
          <td style="background:#f9fafb;padding:16px 36px;text-align:center;border-top:1px solid #e5e7eb;">
            <p style="margin:0;color:#9ca3af;font-size:11px;">© Alphafitus Laboratório Nutracêutico · Sistema de Gestão de Estabilidade</p>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;

  try {
    await transport.sendMail({
      from: `"Alphafitus Lab" <${fromUser}>`,
      to: `"${payload.toName}" <${payload.toEmail}>`,
      subject: `📋 CoA disponível — ${payload.productName}${payload.lotNumber ? ` (Lote ${payload.lotNumber})` : ""}`,
      html,
    });
    logger.info({ to: payload.toEmail, product: payload.productName }, "E-mail CoA enviado ao cliente");
    return { ok: true };
  } catch (err) {
    logger.error({ err, to: payload.toEmail }, "Falha ao enviar e-mail CoA");
    return { ok: false, error: (err as Error).message };
  }
}
