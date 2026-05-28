---
name: Sistema de Permissões Granulares
description: Arquitetura do sistema de permissões de 13 permissões com lock pós-assinatura
---

## Regra

Admin bypassa TODOS os checks (role === "admin" vem primeiro). Não-admin precisa ter a permissão específica no array `permissions` do usuário.

Post-signature lock: após qualquer assinatura existir num protocolo, APENAS admin pode deletar protocolo, lotes, resultados e assinaturas.

**Why:** Princípio de menor privilégio + integridade do certificado após assinatura.

## 13 Permissões (constante PERM em permissions.ts)

```
protocols:view, protocols:create, protocols:edit, protocols:delete, protocols:finalize
lots:manage
results:enter, results:delete
signatures:sign, signatures:delete
catalog:manage, attachments:manage, settings:manage
```

## Arquivos-chave

- `artifacts/api-server/src/lib/permissions.ts` — PERM constantes, `hasPermission()`, `requirePermission()` middleware, `isProtocolSigned()`, `defaultPermissionsForRole()`
- `lib/db/src/schema/users.ts` — coluna `permissions text[].notNull().default('{}'::text[])`
- `artifacts/api-server/src/lib/session.ts` — `AuthUser.permissions: string[]`
- `artifacts/protocolo-estabilidade/src/contexts/auth-context.tsx` — `hasPermission(perm)` no contexto

## Default templates por role

- `admin`: todas (implícito)
- `responsavel_tecnico`: view, create, edit, finalize, lots:manage, results:enter, results:delete, signatures:sign, catalog:manage, attachments:manage
- `controle_qualidade`: view, create, edit, lots:manage, results:enter, signatures:sign, attachments:manage
- `tecnico_lab`: view, results:enter, signatures:sign, attachments:manage
- `analyst`: view, results:enter, signatures:sign

## Como estender

Para adicionar nova permissão:
1. Adicionar a `PERM` em `permissions.ts`
2. Adicionar a `PERM_LABELS` em `permissions.ts`
3. Adicionar ao grupo correto em `PERMISSION_GROUPS` em `users.tsx`
4. Adicionar ao `defaultPermissionsForRole()` onde aplicável
5. Adicionar `requirePermission(PERM.NOVA)` na rota de backend
6. Adicionar guard com `hasPermission("nova:perm")` no frontend

## Guards no frontend

Todos via `const { hasPermission } = useAuth()`. Implementados em:
- `protocol-detail.tsx`: lots:manage, protocols:edit, protocols:delete, protocols:finalize
- `certificate.tsx`: signatures:sign, signatures:delete
- `ProtocolInfoTab`: protocols:edit (botão "Editar Informações")
