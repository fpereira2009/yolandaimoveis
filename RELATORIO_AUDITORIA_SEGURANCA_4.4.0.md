# Yolanda CRM 4.4.0 — Auditoria AppSec e decisão arquitetural

**Escopo inspecionado:** pacote 4.3.8 unificado, Cloudflare Pages Functions, D1 (`migrations/0001` a `0008`), R2, front-end vanilla, arquivos de configuração e testes. **Data:** 2026-11-21. **Tipo:** auditoria estática do código e testes locais de integração/segurança. **Não houve análise dinâmica remota, varredura de dependências on-line nem teste de penetração no domínio publicado.**

## 1. Veredito arquitetural

**Decisão: manter os contratos REST existentes e a API de mídia R2 separada, modularizando a implementação interna.**

- **Manter todos os uploads dentro do roteador comercial** criaria risco de regressão em leads e imóveis e misturaria limites de bytes, leitura binária e processamento de JSON. Rejeitado.
- **Criar novas rotas públicas para cada operação CRUD** exigiria mudar todos os consumidores e o roteamento Cloudflare, sem benefício funcional imediato. Adiado.
- **Manter `/api/media/...` dedicado e modularizar `/api/[[route]]`** evita alterar os URLs existentes, permite revisar autenticação em um único ponto e organiza a manutenção por entidade. Adotado.

As rotas continuam funcionando como na 4.3.8: `/api/public/properties`, `/api/public/contact`, `/api/leads`, `/api/clients`, `/api/properties`, `/api/export/...` e `/api/media/...`. A cópia codificada `%5B%5Broute%5D%5D.js` utiliza o mesmo roteador.

## 2. Achados corrigidos

| Severidade | Diagnóstico antes da 4.4.0 | Correção aplicada | Evidência |
|---|---|---|---|
| **Crítica** | `DEV_BYPASS=1` dispensava autenticação nas APIs, inclusive em Preview remoto | Removido o bypass do fluxo de autenticação e da API de mídia; sempre exige JWT assinado | `functions/_shared/access-auth.js`, `tests/security-4.4.0.test.mjs` |
| **Alta** | Middleware `/app/` só aceitava domínio `crc.` ou bypass | Preview por alias recebe acesso após JWT Access válido; vitrine Production continua sem `/app/` | `functions/_middleware.js` |
| **Alta** | Verificadores JWT duplicados, JWKS em cache global sem separação por equipe | Validador único com cache por domínio e validação RS256, `iss`, `aud`, `exp`, `nbf`, `iat` e e-mail | `functions/_shared/access-auth.js` |
| **Alta** | Fotos de imóvel retirado do catálogo podiam ser lidas pela URL R2 proxy conhecida | Consulta a `property_images` e `properties`; leitura de não publicados exige autenticação; respostas privadas sem cache | `functions/api/media/[[path]].js` |
| **Alta** | Possibilidade de contornar a proteção de leitura usando `MEDIA_PUBLIC_BASE_URL` para entrega direta | URLs geradas sempre usam Pages Functions; configurar bucket privado e desabilitar `r2.dev` público é obrigação operacional | `functions/_shared/property-media.js` |
| **Média** | Chamadas JSON sem limite e checagem de origem incompleta | Leitura limitada, JSON objeto e checagem de `Origin`/`Sec-Fetch-Site` em mutações | `functions/_shared/request-guards.js` |
| **Média** | Upload R2 aceitava cabeçalhos WebP mínimos sem consistência dos tamanhos | Inspeção RIFF, assinatura e tipos VP8 permitidos; JPEG exige início e fim característicos | `functions/api/media/[[path]].js` |
| **Média** | IDs em URL aceitavam textos com dígitos fora do padrão | Prefixos explícitos por entidade, `Number.isSafeInteger`, erro 404 | `functions/_shared/api/common.js` |
| **Baixa** | SQL com interpolação de nome de tabela em exclusão lógica | `softDelete` só aceita tabela `clients`; demais SQL dinâmicos usam colunas selecionadas de listas internas de campos | `functions/_shared/api/leads.js` |
| **Baixa** | Binário PE/WinMD não referenciado publicado em `/app/` | Arquivo removido dos assets | `public/app/Microsoft.Services.Store.winmd` (removido) |
| **Baixa** | Política de navegador incompleta | Cabeçalhos CSP reduzida e Permissions-Policy | `public/_headers` |

**Sobre SQLi:** valores que chegam aos comandos SQL usam `prepare(...).bind(...)`. As interpolacões de identificadores existentes (`UPDATE ... SET`, lista de colunas, ordenações constantes e tabela de exclusão) provêm de nomes fixos, enumerados no servidor. Não foram encontradas concatenações diretas de valores brutos do usuário em expressões SQL.

**Sobre XSS:** as interpolações de texto nas telas usam escapes HTML; descrições são armazenadas como Markdown e renderizadas com escaping, sem HTML arbitrário. A arquitetura ainda usa HTML gerado por template strings e handlers `onclick` inline, portanto há risco residual: é necessária evolução futura para montagem DOM sem strings e CSP com `script-src` restritiva.

**Sobre IDOR/autorização:** a aplicação atual é **single-tenant**, sem papéis/permissões individuais no D1. O JWT do Cloudflare Access verifica identidade e a política Access decide quem entra, mas **qualquer membro autorizado pode acessar todos os leads e imóveis do CRM**. Para restringir registros por corretor, seria necessária uma mudança funcional de modelo de autorização, além de migration e UI. Não seria seguro declarar esse requisito resolvido apenas com JWT. As consultas usam IDs válidos e as mutações requerem autenticação.

## 3. Módulos criados / reorganizados

| Módulo | Responsabilidade |
|---|---|
| `functions/_shared/access-auth.js` | JWT/JWKS Cloudflare Access, sem bypass |
| `functions/_shared/request-guards.js` | Validação de origem e limite/parse de JSON |
| `functions/_shared/api/common.js` | Constantes, validação, códigos, datas e erros HTTP |
| `functions/_shared/api/serialization.js` | Serialização de leads, clientes e imóveis, consultas base |
| `functions/_shared/api/leads.js` | Regras de etapas, disputa, associações, eventos e fechamento |
| `functions/_shared/api/clients.js` | Cadastro/edição do CRC |
| `functions/_shared/api/properties.js` | CRUD de imóveis, estado e limpeza D1/R2 |
| `functions/_shared/api/public.js` | Catálogo público e contatos originados da vitrine |
| `functions/_shared/api/csv.js` | Exportação CSV e neutralização de fórmulas |
| `functions/_shared/api/router.js` | Despacho HTTP e tratamento de exceções |
| `public/js/crm-*.js` | Core, navegação, funil, detalhes, ações, clientes, imóveis, card social e exportação |
| `public/js/vitrine-app.js` | Script da vitrine retirado do HTML, preservando escopo/handlers |
| `tests/helpers/*.mjs` | Carregamento dos módulos e emissão local de JWT assinado |

O HTML institucional, classes, paleta, textos comerciais, IDs e nomes de funções acionadas por atributos DOM foram preservados. Os scripts do CRC continuam **clássicos e ordenados**, em vez de ES modules, para manter o escopo global dos `onclick` preexistentes.

## 4. Riscos residuais e ações externas obrigatórias

1. **Preview Access:** nas últimas capturas, o Preview tinha `DEV_BYPASS` e não exibia `ACCESS_TEAM_DOMAIN`/`ACCESS_AUD`. Na 4.4.0 o bypass é ignorado. Configure os dois secrets de Preview para a **aplicação Cloudflare Access dos previews**, antes do push; confirme o AUD correspondente (pode diferir do CRC de produção). Depois remova o `DEV_BYPASS` no painel.
2. **R2 privado:** mantenha `yolanda-imoveis-dev` e `yolanda-imoveis-prod` privados. Caso `r2.dev` ou domínio público direto esteja ligado, **desative esse acesso no Cloudflare**: a proteção na Pages Function não protege endpoints públicos independentes do bucket.
3. **Autenticação e papéis:** revisar políticas Access sem `Everyone`, `Bypass` e `Login Methods` como condição `Include` permissiva. RBAC/perfil por corretor ainda não existe (risco residual).
4. **CSP / dependências de terceiros:** Tailwind e Lucide estão carregados via CDN e há handlers inline; não foi possível aplicar `script-src` estrita sem risco de regressão visual. Planejar build local, pin/SRI ou auto-hospedagem e política CSP rígida em release específica.
5. **Cloudflare WAF/rate limit:** `/api/public/contact` possui contador global de 40 contatos/hora, não limite individual por IP. Recomenda-se Rate Limiting no painel, CAPTCHA/Turnstile e métricas de abuso. Não mudado para preservar contrato.
6. **R2-D1:** não há transação distribuída. A limpeza utiliza compensação/retry, mas quedas extremas podem exigir reconciliação periódica de objetos/linhas órfãs.
7. **Decodificação de imagens:** magic bytes, MIME e tamanho são validados; não há decodificação integral de cada imagem no Worker. Para proteção contra arquivos de imagem malformados avançados, avaliar Cloudflare Images/transformação server-side dedicada.
8. **Dependências:** a revisão de bibliotecas (`npm audit`/SCA) e pentest do deployment dependem de rede e ambiente real. Não foram executados. O `package-lock.json` foi preservado quanto às versões de dependência.

## 5. Testes executados localmente

- 175 verificações de CRM, D1, funil, clientes, imóveis e eventos.
- 117 verificações de disputa, reserva, fechamento e integridade.
- 165 verificações de R2, upload, fotos privadas, CRUD e segurança dos bytes.
- 84 verificações de paridade Preview/Production com D1 e R2 isolados.
- 31 verificações negativas de JWT, CSRF, JSON, middleware e configurações.
- Suíte adicional da vitrine sem imagem, com carrossel e estados de erro.

**Total enumerado: 572 verificações locais, além da suíte da vitrine.** Os testes usam bancos SQLite locais e buckets R2 simulados. **Não houve deploy nem validação remota da autenticação real.** A saída de teste de falha simulada no R2 é intencional e não indica falha da suíte.

## 6. Isolamento e compatibilidade

`wrangler.toml` **idêntico ao original**, inclusive `database_id` e nome do bucket por ambiente. Todas as migrations `0001`–`0008` **sem alterações**; nenhuma migration nova. Mesmas regras de negócio de disputa no Preview e Production. Nenhuma credencial foi incluída nos artefatos. Contratos JSON, nomes das rotas, IDs e handlers JavaScript preservados.

## 7. Referências

- Cloudflare Access: <https://developers.cloudflare.com/cloudflare-one/access-controls/applications/http-apps/authorization-cookie/validating-json/>
- Cloudflare Pages Functions Access: <https://developers.cloudflare.com/pages/functions/plugins/cloudflare-access/>
- Cloudflare R2 Workers: <https://developers.cloudflare.com/r2/api/workers/workers-api-reference/>
- Cloudflare R2 limites: <https://developers.cloudflare.com/r2/platform/limits/>
