---
name: Sistema de backup automático — padrão ativado + cópia em nuvem
description: Como o backup diário funciona, por que está ativado por padrão e por que há cópia em Object Storage separada do banco.
---

O backup diário (protocolos/lotes/resultados) já existia como ferramenta manual (toggle off por padrão, só salvava localmente em `backups/`). Foi estendido para:

1. Ficar **ativado por padrão** (seed automático de `backup.enabled=true` na primeira subida do servidor, via `ensureBackupDefaults()` em `backup-scheduler.ts`), rodando o primeiro backup imediatamente se nunca houve um.
2. Cada backup gerado localmente é **também enviado ao Object Storage** (fora do banco/servidor), com a mesma rotação (últimos 60).
3. Existe restauração com 1 clique direto da nuvem (`/api/backup/cloud-restore/:filename`).

**Why:** usuário pediu garantia de recuperação rápida em caso de invasão/ataque — se o servidor/banco for comprometido, backups guardados só localmente também seriam perdidos. A cópia em nuvem separada resolve isso.

**How to apply:** ao alterar o schema das tabelas incluídas no backup (`protocols`, `lots`, `analysis_results`), lembrar de manter `backup-restore.ts` (runRestore) e o payload de `runBackup()` em sincronia — ambos assumem o mesmo formato `{version, exportedAt, tables:{protocols,lots,analysis_results}}`.
