---
name: Orval codegen recovery
description: Como recuperar os arquivos gerados quando o orval falha após limpar o output
---

## O problema

`orval --config ./orval.config.ts` falha com:
> "Failed to resolve input: Please provide a valid string value or pass a loader to process the input"

quando o orval.config.ts usa `InputTransformerFn` (transformer no override de input). O orval v8.5.3 limpa o output folder (`clean: true`) ANTES de tentar gerar, então todos os src/generated/* são apagados mesmo que a geração falhe.

**Why:** Bug ou incompatibilidade de versão do orval com o transformer no input override. tsx não está disponível no ambiente, então não dá pra rodar orval com tsx explicitamente.

## Estratégia de recuperação

### 1. Restaurar do git
```bash
git show <ultimo-commit>:lib/api-client-react/src/generated/api.ts > lib/api-client-react/src/generated/api.ts
git show <ultimo-commit>:lib/api-client-react/src/generated/api.schemas.ts > lib/api-client-react/src/generated/api.schemas.ts
# Para api-zod (tipos individuais):
git log --oneline -- "lib/api-zod/src/generated/types/X.ts"  # achar commit
git show <hash>:lib/api-zod/src/generated/types/X.ts > lib/api-zod/src/generated/types/X.ts
```

### 2. Recriar types simples do dist
Para types que são só interfaces (sem const objects):
```js
const d = fs.readFileSync('lib/api-zod/dist/generated/types/X.d.ts', 'utf8');
d.replace(/export declare interface/g, 'export interface').replace(/export declare type/g, 'export type')
```

### 3. Para const enums (protocolStatus, analysisResultCategory, etc.)
**OBRIGATÓRIO** restaurar do git — o script de recriar do d.ts gera `export const X: {...}` sem initializer, que é inválido.

### 4. Sempre usar o commit MAIS RECENTE
Usar um commit antigo para api.schemas.ts pode resultar em tipos desatualizados (ex: KineticParameter missing kLongTerm).

### 5. Aplicar o patch manualmente
Após restaurar, aplicar as alterações novas diretamente nos arquivos restaurados com edit tool.

**How to apply:** Sempre que o codegen falhar e apagar os arquivos: restaurar do git mais recente → patch manual → typecheck:libs → typecheck frontend.
