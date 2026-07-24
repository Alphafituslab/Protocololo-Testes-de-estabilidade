---
name: Bibliographic References Recovery
description: Estado e estrutura das referências bibliográficas — o que existe, como foram recuperadas e como o backup funciona agora.
---

# Referências Bibliográficas

## Estado atual (24 jul 2026)
38 referências no banco de produção:
- **ativo** (11): monografias USP-NF por ativo (CoQ10, Vit E, Creatina, Phe, Vit C, NAC, Fibras, Curcumina, Colágeno II, Mg, Inositol)
- **norma** (8): ICH Q1A(R2), USP-NF geral, CompactDry consolidado, POPs Alphafitus consolidado, AOAC SMPR 2018.004, AOAC SMPR Appendix F, JP 18ª ed., USP Choline
- **regulamentacao** (8): RDCs ANVISA + INs (IDs 1-7, 11) — auto_include=true para 7 delas
- **analitica** (5): IAL 4ª ed., FB 6ª ed., FB 7ª ed. (métodos gerais), FCC 13ª ed., AOAC 984.27
- **degradacao** (3): ICH Q1B, ICH Q1C, RDC 318/2019 (estresse)
- **geral** (2): ABNT NBR 6023, RDC 57/2021 (BPF)
- **livro** (1): AOAC OMA 21st ed.
- **artigo** (7 — não listados): artigos de autores Akbari, Amanolahi, EFSA, Nojiri, Oketch-Rabah, Silva, Walter

## Tipos de referência
Tipos novos (com badge colorido no UI): geral 🟢, ativo 🔵, analitica 🟣, regulatoria 🟠, embalagem 🟡, degradacao 🔴
Tipos legados (exibidos sem badge colorido): artigo, livro, site, regulamentacao, norma, outro

## Como as referências foram recuperadas
- Os backups automáticos NUNCA incluíam bibliographic_references antes do v2.2
- 38 citações únicas foram extraídas de param_methods_citations_json nos protocolos
- Referências reconstruídas manualmente e inseridas via SQL direto na produção
- Referências do screenshot (formato antigo) também foram incluídas: AOAC SMPR, JP 18ª, CompactDry consolidado, POPs consolidado

## Backup v2.2
- Inclui bibliographic_references E protocol_references
- Ordem de restore: protocols → lots → results → anvisa → bibliographic_refs → protocol_refs
- **IMPORTANTE**: publicar o app para que o código v2.2 entre em vigor na produção

## Por que o banco de dados perdeu as referências antes
- bibliographic_references nunca foi incluída no payload de backup
- Quando o banco foi trocado pelo neondb gerenciado pelo Replit, as referências desapareceram
- A v2.2 garante que nunca mais aconteça
