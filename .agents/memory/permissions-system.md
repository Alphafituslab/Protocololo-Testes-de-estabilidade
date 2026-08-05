---
name: Sistema de Permissões Granulares
description: Arquitetura do sistema de permissões com 29 permissões ativas, guards no frontend e backend
---

## Regra

Admin bypassa TODOS os checks (role === "admin" vem primeiro). Não-admin precisa ter a permissão específica no array `permissions` do usuário.

Post-signature lock: após qualquer assinatura existir num protocolo, APENAS admin pode deletar protocolo, lotes, resultados e assinaturas.

**Why:** Princípio de menor privilégio + integridade do certificado após assinatura.

## 29 Permissões (constante PERM em permissions.ts)

```
protocols:view, protocols:create, protocols:edit, protocols:delete, protocols:finalize
protocols:duplicate, protocols:export
lots:manage, lots:edit_number
results:enter, results:edit, results:delete
signatures:sign, signatures:delete
kinetics:view, kinetics:edit
methodology:view, methodology:edit
certificate:view, certificate:edit
report:view
anvisa:manage
documents:manage, references:manage
audit:view, versions:view
catalog:manage, attachments:manage, settings:manage, user:manage
```

## Arquivos-chave

- `artifacts/api-server/src/lib/permissions.ts` — PERM constantes, `hasPermission()`, `requirePermission()` middleware, `isProtocolSigned()`, `defaultPermissionsForRole()`
- `lib/db/src/schema/users.ts` — coluna `permissions text[].notNull().default('{}'::text[])`
- `artifacts/api-server/src/lib/session.ts` — `AuthUser.permissions: string[]`
- `artifacts/protocolo-estabilidade/src/contexts/auth-context.tsx` — `hasPermission(perm)` no contexto

## Onde estão os guards ativos

### Frontend (protocolo-estabilidade)
- `protocol-detail.tsx`: tabs condicionais (kinetics:view, methodology:view, audit:view, documents:manage, references:manage, versions:view, anvisa:manage); botões Certificado (certificate:view) e Relatório (report:view); lot number field em edição (lots:edit_number); toolbar finalize/edit/delete (protocols:finalize/edit/delete)
- `certificate.tsx`: botão Editar e Salvar Bloquear (certificate:edit); assinatura (signatures:sign/delete)
- `protocol-report.tsx`: page-level guard (report:view)
- `ProtocolInfoTab`: protocols:edit (botão "Editar Informações")
- `LotsTab`: lots:manage (botões editar/deletar lote); lots:edit_number (campo número do lote em edição)

### Backend (api-server)
- `audit-logs.ts`: GET /audit-logs → audit:view
- `attachments.ts`: POST/PATCH/DELETE → documents:manage
- `snapshots.ts`: todos os endpoints → versions:view
- `anvisa.ts`: POST/PUT/DELETE/sign → anvisa:manage
- `bibliographic-references.ts`: POST/PUT/DELETE → catalog:manage

## Default templates por role (atualizados)

- `admin`: todas (implícito)
- `responsavel_tecnico`: view, create, edit, finalize, duplicate, export, lots:manage, lots:edit_number, results:enter/edit/delete, signatures:sign, kinetics:view/edit, methodology:view/edit, certificate:view/edit, report:view, anvisa:manage, documents:manage, references:manage, audit:view, versions:view, catalog:manage, attachments:manage
- `controle_qualidade`: view, create, edit, lots:manage, results:enter/edit, signatures:sign, kinetics:view, methodology:view, certificate:view, report:view, audit:view, documents:manage, attachments:manage
- `tecnico_lab`: view, results:enter, signatures:sign, audit:view, attachments:manage, documents:manage
- `analyst`: view, results:enter, signatures:sign

## ⚠️ Atenção para usuários existentes no DB

`defaultPermissionsForRole()` só afeta novos usuários criados após a atualização. Usuários existentes no banco continuam com o array antigo (sem as 16 novas permissões). O admin precisa atualizar manualmente via tela de usuários ou via SQL UPDATE para adicionar as novas permissões a usuários existentes.

**Why:** Permissões são armazenadas como array no DB; não há auto-sync com defaultPermissionsForRole.

## Como estender

Para adicionar nova permissão:
1. Adicionar a `PERM` em `permissions.ts`
2. Adicionar a `PERM_LABELS` em `permissions.ts`
3. Adicionar ao grupo correto em `PERMISSION_GROUPS` em `users.tsx`
4. Adicionar ao `defaultPermissionsForRole()` onde aplicável
5. Adicionar `requirePermission(PERM.NOVA)` na rota de backend
6. Adicionar guard com `hasPermission("nova:perm")` no frontend
