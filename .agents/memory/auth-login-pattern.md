---
name: Auth login pattern
description: Regras do fluxo de login — o que NÃO fazer e o padrão que funciona
---

## Regra

`login()` em auth-context.tsx deve escrever no localStorage, chamar `setToken`/`setUser` e `setAuthTokenGetter`.

`handleLogin` em login.tsx deve usar `window.location.replace(dest || "/")` — nunca `navigate()`.

Armazenamento: **localStorage** (não sessionStorage). sessionStorage é por aba e pode ser bloqueado por configurações de privacidade do browser — causa redirecionamento de volta ao /login após login bem-sucedido.

**Why:** sessionStorage em certos contextos de browser (configurações de privacidade, algumas extensões, redirecionamentos entre origens) não persiste após `window.location.replace`. Isso faz com que após o reload, o AuthProvider leia storage vazio, veja `user === null` e redirecione para /login, dando a impressão que o login não funcionou mesmo com a API retornando 200.

## Banco de produção separado

O banco de desenvolvimento (usado por executeSql sem environment) é DIFERENTE do banco de produção. Para resetar senha ou criar usuário em produção, usar a API do app publicado via curl com $MASTER_PASSWORD:

```bash
# Reset senha em produção
curl -s -X POST "https://protocol-analysis--claytombs1.replit.app/api/auth/reset-password" \
  -H "Content-Type: application/json" \
  -d "{\"masterPassword\": \"$MASTER_PASSWORD\", \"username\": \"admin\", \"newPassword\": \"NovaSenha\"}"

# Criar usuário em produção (precisa de token de admin)
TOKEN=$(curl -s -X POST "https://protocol-analysis--claytombs1.replit.app/api/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"username":"clayton","password":"240682cla@"}' | grep -o '"token":"[^"]*"' | cut -d'"' -f4)
curl -s -X POST "https://protocol-analysis--claytombs1.replit.app/api/users" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"username":"...","displayName":"...","password":"...","role":"analyst"}'
```

## Usuários cadastrados (produção)

- `admin` — role admin (senha: ver MASTER_PASSWORD reset se necessário)
- `clayton` / `240682cla@` — role admin
- `carol` / `123456` — role analyst
- `teste.usuario` — displayName "carol", role responsavel_tecnico
