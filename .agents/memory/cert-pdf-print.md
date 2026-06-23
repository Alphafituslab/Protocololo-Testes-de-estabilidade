---
name: Certificado PDF — CSS paged media
description: Regras críticas para impressão do certificado — cabeçalho/rodapé em todas as páginas, margens, contadores.
---

## Regra principal

`position: fixed` em Chrome print renderiza **SOMENTE na página 1**. Nunca usar para repetir cabeçalho/rodapé em páginas 2+.

## Mecanismo correto: display:table-header-group / table-footer-group

```css
#certificate-document { display: table !important; table-layout: fixed; }
.cert-print-running-header { display: table-header-group !important; }
.cert-print-footer         { display: table-footer-group !important; }
```

O browser repete automaticamente o header-group no topo e o footer-group no rodapé de cada página impressa.

**Requisito JSX**: o `cert-print-running-header` precisa ter um único filho wrapper (`.cert-print-running-header-inner`) — sem ele, dois filhos diretos viram duas linhas de tabela separadas em vez de uma linha com layout flex.

## @page: padrão correto

```css
@page { margin: 0 25mm !important; }
```

- `margin-top: 0` e `margin-bottom: 0` → suprime URL/data nativos do browser (sem espaço nos margin boxes)
- `margin-left/right: 25mm` → mantém as margens laterais do documento (conteúdo NÃO vai até a borda do papel)

❌ NUNCA usar `@page { margin: 0 }` puro — elimina margens laterais, conteúdo vai até a borda.

## CSS counters

`counter(page)` funciona em table-footer-group (página atual).
`counter(pages)` pode não funcionar fora de @page margin boxes — testar por protocolo.

**Why:** `display:table` com margin:0 completo foi o padrão que causou "TUDO ERRADO" — conteúdo edge-to-edge e layout quebrado tanto na pré-visualização quanto no PDF.
