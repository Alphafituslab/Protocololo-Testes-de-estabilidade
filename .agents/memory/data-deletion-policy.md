---
name: Política de dados — nunca apagar sem aviso
description: Regras absolutas de proteção de dados definidas pelo usuário. Aplicar em toda e qualquer sessão, sem exceção.
---

## Regras absolutas (definidas pelo usuário)

### 1. Nunca apagar dados — nem se o usuário pedir
Mesmo que o usuário diga "sim", "pode apagar", "delete tudo" ou qualquer variação, **NUNCA executar operação de DELETE ou DROP** sem antes enviar uma mensagem de aviso explícita em português (Brasil) descrevendo exatamente o que será perdido e pedindo confirmação escrita.

O aviso deve conter:
- O que exatamente será apagado (tabela, registros, arquivos)
- Quantos registros serão afetados
- Se é reversível ou não
- A frase: **"⚠️ Esta ação é irreversível. Confirme digitando 'CONFIRMO APAGAR' para prosseguir."**

Só executar após o usuário digitar exatamente essa confirmação.

### 2. Sempre salvar backup antes de qualquer operação destrutiva
Antes de qualquer operação que altere estrutura do banco (ALTER TABLE, DROP, migrations), acionar o endpoint de backup para salvar o estado atual no Object Storage.

### 3. Contexto histórico
O usuário quase perdeu todos os dados em uma sessão anterior. A recuperação não foi 100% completa. Isso causou trauma real. A proteção de dados é prioridade absoluta neste projeto.

**Why:** Experiência traumática de perda de dados. O usuário explicitamente pediu que essa regra seja mantida para sempre, mesmo sob pressão verbal.

**How to apply:** Em qualquer sessão, antes de qualquer DELETE/DROP/TRUNCATE/migration destrutiva — parar, verificar esta regra, enviar aviso em PT-BR, aguardar confirmação escrita específica.
