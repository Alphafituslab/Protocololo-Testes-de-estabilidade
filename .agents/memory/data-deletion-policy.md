---
name: Política de dados — nunca apagar sem confirmação
description: Nenhum dado já registrado (protocolo, lote, resultado, campo) pode ser deletado sem aprovação explícita do usuário.
---

## Regra

**Nunca** remover, truncar, limpar ou sobrescrever dados já cadastrados no banco ou no localStorage sem pedir confirmação explícita ao usuário antes de executar.

Isso se aplica a:
- Registros nas tabelas `protocols`, `lots`, `analysis_results`
- Colunas ou campos adicionados ao schema
- Edições salvas no localStorage (certificado, metodologias, datas)
- Qualquer migração ou script que execute `DELETE`, `DROP`, `TRUNCATE`, ou `ALTER TABLE ... DROP COLUMN`

**Why:** O usuário deixou claro que informações já registradas são intocáveis. Perda de dados é inaceitável neste sistema de protocolos regulatórios.

## How to apply

- Antes de qualquer operação que possa apagar ou sobrescrever dados existentes, parar e perguntar ao usuário: "Isso pode afetar dados já cadastrados. Posso prosseguir?"
- Migrações de schema: somente `ADD COLUMN` é seguro sem confirmação; `DROP COLUMN`, `DROP TABLE`, `ALTER TYPE` precisam de aprovação.
- Refatorações de API: não remover campos de resposta que o frontend já usa para salvar dados.
- Limpeza de localStorage: nunca limpar chaves que guardam dados do usuário sem confirmar.
