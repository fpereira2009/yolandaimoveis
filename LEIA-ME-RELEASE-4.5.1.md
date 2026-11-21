# Yolanda CRM — Release 4.5.1

**Data:** 21/11/2026  
**Base:** pacote completo 4.4.0 com as nove melhorias funcionais.  
**Situação:** alteração implementada e validada localmente; publicação remota não executada.

## Objetivo da versão

Restaurar os rótulos de texto dos botões WhatsApp que foram removidos para o formato **somente ícone**, sem desfazer as correções e funcionalidades já incluídas na versão anterior.

| Local | Texto restaurado | Regra de comportamento mantida |
|---|---|---|
| Cabeçalho da vitrine (desktop) | WhatsApp | Link direto para WhatsApp da corretora |
| Apresentação da corretora | Falar diretamente no WhatsApp | Link direto |
| Formulário de captação de proprietários | Enviar pelo WhatsApp | Cadastro e abertura do WhatsApp |
| Botão flutuante (desktop) | Falar com Iêda | Conversa direta |
| Card do imóvel | Tenho Interesse | `stopPropagation` e `preventDefault`, abre WhatsApp com código, título e URL específica |
| Modal de detalhes do imóvel | Enviar e chamar no WhatsApp | Registra interesse e vínculo do imóvel ao lead, abre WhatsApp |
| Cartão de Cliente no CRC | WhatsApp | Link da conversa e atalho `tel:` no mobile |
| Cartão de Lead no funil | WhatsApp | Link da conversa e atalho `tel:` no mobile |
| Detalhe do Lead | Chamar no WhatsApp | Link da conversa e atalho `tel:` no mobile |

Os rótulos que originalmente eram ocultos em telas pequenas no cabeçalho e no botão flutuante **continuam ocultos no mobile**, preservando o desenho responsivo original. As ações móveis de chamada criadas na 4.4.0 permanecem disponíveis.

## Metadados de versão

- `package.json`, `package-lock.json`: `4.5.1`.
- `public/index.html`, `public/app/index.html`: cache busting de scripts `?v=4.5.1`.
- API de diagnóstico e metadados de disputa: `4.5.1` (sem alterar formato ou lógica da resposta).
- `CHANGELOG.md`: adicionada seção `4.5.1`, conforme Keep a Changelog.
- Política de Privacidade e Termos continuam com sua última revisão identificada como 4.4.0, por não haver atualização do conteúdo legal nesta entrega.

## Restrições preservadas

- `wrangler.toml` e bindings D1/R2 Preview/Production sem alterações.
- Nenhuma migration nova e nenhuma modificação no schema SQLite.
- `functions/_shared/access-auth.js` mantém o `fetch()` de JWKS com `redirect: 'manual'`, sem bypass.
- Nenhuma mudança nas rotas, IDs HTML existentes, cores institucionais ou textos institucionais.
- Não altera a regra de vínculo do formulário público com o imóvel nem deep linking.

## Publicação e verificação manual recomendada

1. Aplicar os arquivos modificados na branch `dev` ou usar o pacote completo como referência de código.
2. Gerar o deployment Preview no Cloudflare Pages.
3. Verificar as nove áreas de contato listadas acima em desktop e mobile. Conferir que o texto não causa overflow e que o botão de ligação ainda aparece no celular.
4. Clicar em **Tenho Interesse** no card: deve abrir WhatsApp **sem** abrir o detalhe, com código e link específico do anúncio. Em seguida clicar em **Ver Detalhes** para testar o modal.
5. No modal, enviar um lead de teste e confirmar vínculo ao imóvel no CRC.
6. Conferir `/app/` autenticado, D1/R2 separados e a ausência de erros de console antes de considerar promoção para Production.

**Não foi realizado deploy remoto** e não há garantia de performance abaixo de um segundo sem validação no ambiente Cloudflare.
