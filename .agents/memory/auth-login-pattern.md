---
name: Auth login pattern
description: Regras do fluxo de login — o que NÃO fazer e o padrão que funciona
---

## Regra

`login()` em auth-context.tsx deve APENAS escrever no localStorage e chamar `setAuthTokenGetter`. Não chamar `setToken`/`setUser` nem `flushSync`.

`handleLogin` em login.tsx deve usar `window.location.replace(dest || "/")` — nunca `navigate()`.

`LoginPage` deve usar `window.location.replace("/")` no useEffect de redirecionamento inicial (não `navigate`).

Armazenamento: **localStorage** (não sessionStorage). sessionStorage é por aba — abre nova aba e precisa logar de novo, confunde o usuário.

**Why:** flushSync forçava re-render síncrono na LoginPage que extensões de browser (Google Translate, etc.) interceptavam com erro de DOM (insertBefore). Isso disparava o AppErrorBoundary que chamava window.location.reload() enquanto a URL ainda era "/login", devolvendo o usuário à tela de login. sessionStorage causava sessão perdida ao trocar de aba ou ao HMR do Vite invalidar auth-context.

## Banco de produção separado

O banco de desenvolvimento (usado por executeSql sem environment) é DIFERENTE do banco de produção. Para resetar senha ou criar usuário em produção, usar a API do app publicado via curl com $MASTER_PASSWORD:

```bash
# Reset senha em produção
curl -s -X POST "https://protocol-analysis--claytombs1.replit.app/api/auth/reset-password" \
  -H "Content-Type: application/json" \
  -d "{\"masterPassword\": \"$MASTER_PASSWORD\", \"username\": \"admin\", \"newPassword\": \"NovaSenha\"}"

# Criar usuário em produção (precisa de token de admin)
TOKEN=$(curl -s -X POST ".../api/auth/login" -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"..."}' | grep -o '"token":"[^"]*"' | cut -d'"' -f4)
curl -s -X POST ".../api/users" -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"username":"...","displayName":"...","password":"...","role":"admin"}'
```

## Usuários cadastrados

- `admin` / `Alphafitus2025` (dev e prod)
- `clayton` / `Clayton2025` (dev e prod, role admin)
