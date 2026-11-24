# Ajuste visual híbrido da 4.6.0 — modal 4.5.5 + URL SSR

## Objetivo
O detalhe exibido ao clicar em **Ver Detalhes** na vitrine volta a utilizar o mesmo modal HTML e JavaScript da 4.5.5. A URL continua apontando para `/imoveis/<slug>` no `href`, permitindo rastreamento, cópia e abertura direta pelo Google e por terceiros.

## Arquivos
- `public/js/vitrine-app.js`: apenas marca o link e intercepta o clique normal para chamar `openPropertyModal(code)` existente, com correção mínima para o botão Fechar reconhecer a URL amigável no histórico. Sem mudar o HTML do modal, cards, textos, cores ou comportamento de WhatsApp.
- `tests/seo-4.6.0-integration.test.mjs`: ajusta o teste de integridade byte a byte **somente** para `vitrine-app.js`, pois essa pequena mudança é intencional, e adiciona verificações da integração. Os outros arquivos da 4.5.5 continuam protegidos por comparação exata.

## Comportamentos
- Clique normal em **Ver Detalhes**: mesmo modal de produção 4.5.5, com pushState apontando para a URL amigável.
- Ctrl/Cmd + clique, clique do meio e abertura sem JavaScript: página SSR completa da 4.6.0.
- Compartilhar: URL amigável no link, preservando fluxo de WhatsApp.
- Recarregar `/imoveis/<slug>`: SSR. Não haverá modal sobre a vitrine no carregamento direto; o corpo da página individual tem o cartão compacto da versão 4.5.5 (ajuste visual anterior).
- O catálogo local com dados fictícios pode ter capas vazias, porque as fotos não estão no R2 local. Isso não é uma alteração de layout.

## Aplicação
1. Estar na branch `exp/urls-amigaveis-imoveis` e ter o pacote 4.6.0 com `0010` corrigida.
2. Substituir os dois arquivos preservando as pastas, **sem** substituir `public/index.html`.
3. `git diff --check` e `npm test`.
4. Com o Wrangler local rodando, forçar atualização com Ctrl+Shift+R na vitrine e clicar em **Ver Detalhes**.
5. Confirmar que o modal fica sobre a vitrine, que o botão fechar volta e que o endereço muda para `/imoveis/<slug>`.
6. Abrir essa mesma URL em nova aba e validar a página SSR, canonical e Open Graph.

**Somente testes locais; nenhuma atualização remota aplicada.**
