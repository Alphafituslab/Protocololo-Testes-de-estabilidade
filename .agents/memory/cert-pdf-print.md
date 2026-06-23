---
name: Certificado PDF — CSS paged media
description: Regras críticas para impressão do certificado — cabeçalho/rodapé em todas as páginas, margens, largura da tabela.
---

## Regra principal

`position: fixed` em Chrome print renderiza **SOMENTE na página 1**. Nunca usar para repetir cabeçalho/rodapé em páginas 2+.

## Mecanismo correto: display:table-header-group / table-footer-group

```css
#certificate-document { display: table !important; table-layout: auto; }
.cert-print-running-header { display: table-header-group !important; }
.cert-print-footer         { display: table-footer-group !important; }
```

O browser repete automaticamente o header-group no topo e o footer-group no rodapé de cada página impressa.

**Requisito JSX**: o `cert-print-running-header` precisa ter um único filho wrapper (`.cert-print-running-header-inner`) — sem ele, dois filhos diretos viram duas linhas de tabela separadas em vez de uma linha com layout flex.

## BUG CRÍTICO: largura da tabela colapsada pelos containers de layout

`display:table; width:100%` resolve `100%` contra o bloco contêiner. Em Chrome print, os containers de layout do app (`main.overflow-hidden`, `div.overflow-auto.p-6`) reportam largura próxima a zero ao motor de impressão. Resultado: texto empilhado verticalmente por caractere.

**Solução**: usar largura física explícita + zerar overflow dos containers pai:

```css
@media print {
  #root, #root > div, #root main, #root main > div {
    overflow: visible !important;
    width: 100% !important;
    max-width: 100% !important;
    padding: 0 !important;
    margin: 0 !important;
  }
  #certificate-document {
    /* 160mm = A4 (210mm) - 2×25mm margens @page */
    width: 160mm !important;
    min-width: 160mm !important;
    max-width: 160mm !important;
  }
}
```

`display:block` NÃO é afetado por este bug — blocos preenchem a largura disponível de forma diferente (block formatting context). Só `display:table` é afetado.

## @page: padrão correto

```css
@page { margin: 0 25mm !important; }
```

- `margin-top/bottom: 0` → suprime URL/data nativos do browser
- `margin-left/right: 25mm` → margens laterais do documento

❌ NUNCA usar `@page { margin: 0 }` puro — elimina margens laterais.

## CSS counters

`counter(page)` funciona em table-footer-group (página atual).
`counter(pages)` pode não funcionar fora de @page margin boxes — testar por protocolo.

**Why:** Cada bug descoberto aqui custou múltiplas tentativas. Os dois problemas independentes (margin laterais e largura da tabela) ocorrem simultaneamente e precisam ser corrigidos juntos.
