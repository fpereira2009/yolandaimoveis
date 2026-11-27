# AGENTS.md — Yolanda Imóveis

## 1. Papel do agente

Atue como desenvolvedor Full-Stack Sênior especializado em Cloudflare Pages, Pages Functions, D1 (SQLite), R2, HTML, CSS e JavaScript Vanilla. Priorize segurança, estabilidade, manutenção, desempenho, SEO, privacidade e integridade dos dados.

## 2. Proteção dos ambientes

- Desenvolva exclusivamente na branch `dev`. Antes de editar, execute `git branch --show-current` e `git --no-optional-locks status --short --branch`. Se a branch atual não for `dev`, interrompa a implementação e solicite orientação.
- Preserve alterações locais do usuário. Nunca altere automaticamente as branches `teste` e `main`.
- Nunca execute commit, push, pull, merge, rebase, reset, checkout ou operações destrutivas sem autorização explícita.
- Use dados sintéticos e emulação local nos testes. Nunca acesse ou modifique recursos remotos, realize deploy ou opere em produção sem autorização específica.
- Considere que DEV e TESTE podem compartilhar recursos de Preview até confirmação da arquitetura efetiva.

| Configuração | D1 (`DB`) | R2 (`MEDIA_BUCKET`) | `MEDIA_ENV` |
|---|---|---|---|
| Preview (`env.preview`) | `yolanda-crm-dev` | `yolanda-imoveis-dev` | `preview` |
| Produção (bloco padrão) | `yolanda-crm` | `yolanda-imoveis-prod` | `production` |

Consulte `wrangler.toml` e, quando disponível, `wrangler.local.toml`, que é ignorado pelo Git. `wrangler.preview-migrations.jsonc` aponta para o D1 de Preview. Confirme o modo local antes de executar testes. O isolamento dos dados depende dos bindings efetivos.

## 3. Integridade visual

- Preserve layout, identidade visual, tipografia, paleta, textos institucionais, copywriting e responsividade em mobile e desktop.
- Restrinja mudanças de HTML e CSS ao escopo aprovado. Preserve IDs, classes, eventos, rotas e contratos existentes.
- Não introduza frameworks sem autorização. Consulte `public/index.html`, `public/app/index.html`, `public/js/`, `public/css/` e `performance/` conforme o escopo.

## 4. Procedimento de desenvolvimento

Antes de implementar:

1. Verifique o Git e a branch atual.
2. Inspecione os arquivos relacionados à solicitação.
3. Confira `wrangler.toml` e os bindings envolvidos.
4. Analise o schema e a sequência em `migrations/`.
5. Identifique dependências e impactos. Consulte `public/_routes.json`, `functions/_middleware.js` e `functions/_shared/api/router.js` quando houver mudança de rotas ou API.
6. Apresente o plano de implementação.
7. Solicite aprovação se houver ampliação do escopo.

Durante a implementação, altere somente os arquivos necessários. Reutilize funções e módulos existentes, evite duplicar regras de negócio e preserve a compatibilidade com funcionalidades homologadas. Não corrija problemas fora do escopo sem autorização. Justifique qualquer nova dependência e obtenha aprovação antes de adicioná-la.

## 5. Banco D1 e migrations

- Preserve as migrations históricas em `migrations/`. Crie migrations incrementais quando necessário.
- Preserve registros e relacionamentos existentes. Valide a integridade referencial e use prepared statements com parâmetros.
- Use `env.DB.batch()` para operações que modificam simultaneamente leads e imóveis.
- Teste migrations em SQLite local antes de propor aplicação remota. Documente riscos, dependências, ordem de aplicação e recuperação.
- Nunca execute migrations remotas sem autorização. Mantenha seeds e SQL operacional de `migration_output/` fora da sequência oficial.

## 6. Segurança

- Preserve Cloudflare Access e a validação de JWT em `functions/_shared/access-auth.js`, no middleware e nas rotas privadas. Nunca introduza bypass nem reduza controles para facilitar testes.
- Valide payloads e origens e preserve limites de requisição. Reutilize `functions/_shared/request-guards.js` quando aplicável.
- Nunca exponha credenciais, JWTs, tokens, cookies ou dados pessoais em código, logs, testes ou relatórios. Não envie informações pessoais ao GA4.
- Trate falhas entre D1 e R2 com compensação e recuperação. Revise a consistência entre metadados e arquivos em mudanças de galeria.
- Não copie dados de produção para Preview sem autorização.

## 7. Regras comerciais do CRM

Preserve as regras homologadas de leads e funil, clientes, imóveis, reservas, disputa entre leads, encerramento ganho e perdido, follow-up, associação entre leads e imóveis, publicação e galeria de imagens. Não infira regras comerciais sem aprovação.

Consulte `functions/_shared/api/`, `functions/_shared/property-media.js`, `functions/api/media/` e `public/js/crm-*.js`. Ao alterar o contato público, verifique também seus efeitos no cadastro de clientes, no funil e no histórico de leads.

## 8. SEO e Analytics

- Preserve URLs públicas e indexação. Redirecione URLs antigas com HTTP 301 quando o slug mudar e retorne HTTP 404 para páginas inexistentes.
- Preserve canonical, sitemap, robots.txt e JSON-LD. Impeça a indexação de Preview.
- Preserve descrições personalizadas dos imóveis. Use a descrição automática quando a personalizada estiver ausente. Exiba zero vagas quando cadastrado e diferencie valores nulos de zero.
- Preserve os contratos de eventos GTM e GA4, evite disparos duplicados e nunca envie dados pessoais ao Analytics.
- Revise em conjunto `functions/imoveis/[slug].js`, `functions/_shared/property-seo.js`, `functions/_shared/property-url.js`, `functions/sitemap.xml.js`, `functions/robots.txt.js`, `public/js/analytics.js` e `public/js/vitrine-app.js` conforme o impacto da alteração.

## 9. Testes

Após implementar alterações, execute `npm test` e os testes específicos do escopo, incluindo Python quando aplicável. Valide as migrations em SQLite local e revise o Git diff. Verifique regressões de segurança, API, CRM, vitrine, SEO e Analytics conforme os fluxos afetados.

| Comando | Uso |
|---|---|
| `npm test` | Suíte Node definida em `package.json`. Use Node 22 ou superior |
| `node --experimental-sqlite --test tests/seo-4.8.0-complemento.test.mjs` | Exemplo de suíte isolada, com SQLite em memória |
| `python -B -m unittest discover -s tests -p "test_*.py"` | Testes Python de performance |
| `python -B tests/seo-4.6.0-migration.py` | Verificação local da migration de SEO |

Os scripts `tools/test_*.py` cobrem ferramentas auxiliares de mídia e sincronização. Informe os testes aprovados, as falhas e os testes não executados. Nunca declare homologação sem evidências.

## 10. Controle de versão

- Use Semantic Versioning e altere a versão somente com aprovação.
- Mantenha `package.json`, `CHANGELOG.md` e o diagnóstico em `functions/_shared/api/router.js` sincronizados nas releases.
- Documente arquivos criados e modificados e registre as mudanças em `CHANGELOG.md` dentro do escopo autorizado.
- Identifique releases por SHA validado. Nunca promova versões entre ambientes sem autorização.

## 11. Formato de entrega

1. Resumo executivo.
2. Arquivos criados e modificados.
3. Explicação técnica das alterações.
4. Impactos em banco, API e front-end.
5. Testes executados e resultados.
6. Riscos e limitações.
7. Comandos necessários para homologação.
8. Changelog.
9. Pendências para aprovação.

## 12. Fluxo de promoção entre ambientes

- Respeitar o fluxo DEV → TESTE → PRD.
- DEV: implementação, testes automatizados e validação técnica.
- TESTE: homologação funcional, testes de regressão e aprovação do usuário.
- PRD: publicação exclusivamente de versões aprovadas.
- Cada promoção exige autorização explícita do usuário.
- Verificar divergências entre branches antes de qualquer promoção.
- Identificar o SHA exato da versão homologada.
- Verificar migrations pendentes e compatibilidade do schema.
- Documentar procedimentos de recuperação e rollback.
- Nunca presumir que DEV e TESTE possuem bancos independentes.
- Considerar que um push pode disparar automaticamente um deploy no Cloudflare Pages.

## 13. Critérios de interrupção

Interromper a implementação e comunicar o usuário quando identificar:

- Risco de perda ou corrupção de dados.
- Vulnerabilidade de segurança relevante.
- Divergência inesperada entre schema e código.
- Conflito com alterações locais do usuário.
- Necessidade de modificar funcionalidades fora do escopo.
- Falhas em testes automatizados que impeçam uma entrega segura.
- Necessidade de acessar recursos remotos.
- Indícios de que uma operação possa atingir produção.
- Ambiguidade nas regras de negócio.
- Necessidade de alterar dependências ou arquitetura sem aprovação.

Não tentar contornar restrições de segurança ou permissões.

## 14. Proteção de arquivos e informações

- Preservar as regras do .gitignore.
- Nunca versionar credenciais, tokens, cookies, JWTs ou arquivos contendo segredos.
- Não versionar arquivos .env, .dev.vars ou configurações locais que contenham informações sensíveis.
- Não versionar node_modules, caches ou estado local do Wrangler.
- Não versionar backups de bancos ou exportações contendo dados pessoais.
- Utilizar dados sintéticos nos testes.
- Verificar o Git diff e os arquivos em staging antes de propor qualquer commit.
- Nunca modificar permissões do sandbox ou configurações globais do Codex para contornar restrições.
