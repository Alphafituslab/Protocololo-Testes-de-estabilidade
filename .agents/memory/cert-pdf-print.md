---
name: Certificado PDF — CSS paged media
description: Regras críticas para impressão do certificado — layout, margens A4, armadilhas do Chrome print.
---

## Regra de ouro: display:block no #certificate-document

`display:block` é o ÚNICO valor correto para `#certificate-document` em print. Nunca usar `display:table`.

```css
#certificate-document {
  display: block !important;
  width: 100% !important;
  padding: 0 !important;
  margin: 0 !important;
  box-shadow: none !important;
  border: none !important;
}
```

## Por que display:table falha (3 tentativas, 3 falhas)

Tentativa 1 — `display:table; width:100%`: colapsou para ~0px. Os containers `main.overflow-hidden` e `div.overflow-auto.p-6` do layout fazem `width:100%` de uma tabela resolver contra width≈0 no Chrome print.

Tentativa 2 — `display:table; width:160mm`: a largura ficou correta (160mm), mas o corpo da tabela (anonymous table-row-groups) ficou em branco. Só o `table-header-group` renderizava.

Tentativa 3 — `display:table; width:160mm` + `height:auto; min-height:0` nos containers pai: o colapso de altura dos containers fez o corpo da tabela desaparecer completamente (só o table-header-group mostrava porque é especial no modelo de tabela).

`display:block` NÃO sofre nenhum destes problemas — blocos preenchem a largura disponível via block formatting context, independente de containers pai com overflow.

## @page: padrão correto — NUNCA usar !important

```css
@page {
  size: A4 portrait;
  margin: 15mm 25mm 10mm 25mm;
}
```

- **`!important` em `@page {}` é CSS INVÁLIDO** — Chrome descarta silenciosamente a regra INTEIRA, incluindo `size: A4`. O PDF sai com tamanho/margens aleatórios.
- 15mm topo / 10mm base / 25mm laterais → conteúdo útil = 160mm wide (A4 210mm − 2×25mm).

## Cabeçalho mini (cert-print-running-header)

Atualmente `display: none` em print (oculto). O `display:table-header-group` foi abandonado.
Se necessário voltar a cabeçalho repetido em todas as páginas, precisa de uma abordagem alternativa (NÃO display:table).

## Cabeçalho da 1ª página

`cert-doc-firstpage-header` com `display: flex !important` mostra o cabeçalho grande (logo + título + número) na primeira página normalmente.

**Why:** `display:table` foi a causa de TODOS os problemas de impressão desta sessão. O sistema de layout do app (flex com overflow:hidden/auto) é incompatível com `display:table; width:100%` no Chrome's paged media engine.
