---
name: Portal do Cliente — arquitetura
description: Como o role "cliente" funciona, onde ficam as tabelas de controle de acesso, e regras de roteamento.
---

## Regra geral

Usuários com `role = "cliente"` têm acesso **apenas** ao Portal do Cliente (`/client-portal`). Eles não veem o sidebar, não acessam `/protocols`, `/users`, etc. — o `ProtectedRoute` os redireciona automaticamente.

## Tabelas DB relevantes

- `users.accessExpiresAt` — timestamp nullable. `null` = acesso permanente. Se a data passou, o login é bloqueado com HTTP 403 na rota `/api/auth/login`.
- `client_protocol_access` — liga `clientUserId` a `protocolId`. Cada linha = um protocolo que aquele cliente pode ver.
- `login_log` — registra toda tentativa de login (sucesso e falha), com IP e user-agent.

## Rotas de API

- `GET /api/my/protocols` — cliente busca seus próprios protocolos (filtra por `client_protocol_access`).
- `GET /api/protocols` — quando role=cliente, filtra automaticamente pelo mesmo mecanismo.
- `GET /api/protocols/:id` — quando role=cliente, verifica `client_protocol_access` antes de retornar (403 se não tiver acesso).
- `GET /api/clients/:userId/protocols` (admin) — lista protocolos atribuídos a um cliente.
- `POST /api/clients/:userId/protocols` (admin) — atribui protocolo ao cliente.
- `DELETE /api/clients/:userId/protocols/:accessId` (admin) — remove acesso.
- `GET /api/clients/:userId/login-history` (admin) — últimos 100 logins do cliente.

## Roteamento frontend

- `ProtectedClientRoute` — só aceita role=cliente; redireciona outros para `/`.
- `ProtectedRoute` — redireciona role=cliente para `/client-portal`.
- `login.tsx` — após login, se `role === "cliente"`, faz `window.location.replace("/client-portal")`.
- `auth-context.tsx` — `login()` retorna `Promise<AuthUser>` para permitir o redirect condicional.

## Como estender

- Para adicionar novos conteúdos ao portal (ex: relatórios PDF), basta verificar `client_protocol_access` no backend e adicionar botões em `client-portal.tsx`.
- Para adicionar prazo por protocolo (ao invés de por usuário), criar coluna `expiresAt` em `client_protocol_access`.

**Why:** Clientes externos não devem ver dados internos nem ter permissões de sistema. O isolamento via role garante que mesmo bugs de autorização no backend retornam 403 para clientes sem acesso explícito.
