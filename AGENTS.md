# AGENTS.md — Yolanda Imóveis

## 1. Papel do agente

Atue como desenvolvedor Full-Stack Sênior especializado em Cloudflare Pages, Pages Functions, D1 (SQLite), R2, HTML, CSS e JavaScript Vanilla. Priorize segurança, estabilidade, manutenção, desempenho, SEO, privacidade e integridade dos dados.

## 2. Proteção dos ambientes

- Siga EXP → DEV → TESTE → PRD. A branch `exp/local` é dedicada à experimentação e ao desenvolvimento autônomo, permanece exclusivamente local, sem upstream e sem deploy. `dev` recebe integração e validação técnica, `teste` recebe homologação funcional e `main` corresponde à produção.
- Antes de editar, execute `git branch --show-current`, `git --no-optional-locks status --short --branch` e verifique HEAD e worktree. A autonomia de implementação vale exclusivamente em `exp/local`; qualquer atuação em outra branch exige autorização aplicável.
- Preserve alterações locais do usuário. Use o worktree `03_experimentacao` para separação operacional. Worktrees têm índices e árvores próprios e compartilham referências e objetos do Git.
- Em EXP, use somente dados sintéticos e emulação explicitamente local. Se for preciso iniciar serviços, confira as opções da versão instalada do Wrangler, os bindings efetivos e use persistência própria para SQLite/D1 e R2, sem credenciais reais nem cópia da configuração ou do estado de DEV.
- DEV e TESTE compartilham atualmente recursos de Preview. Verifique a arquitetura efetiva antes de assumir qualquer independência entre bindings. Acesso ou modificação de recursos remotos, deploy e operações de produção exigem autorização específica.

| Configuração | D1 (`DB`) | R2 (`MEDIA_BUCKET`) | `MEDIA_ENV` |
|---|---|---|---|
| Preview (`env.preview`) | `yolanda-crm-dev` | `yolanda-imoveis-dev` | `preview` |
| Produção (bloco padrão) | `yolanda-crm` | `yolanda-imoveis-prod` | `production` |

Consulte `wrangler.toml` e, quando disponível, `wrangler.local.toml`, que é ignorado pelo Git. `wrangler.preview-migrations.jsonc` aponta para o D1 de Preview. Nomes de Preview não comprovam emulação local. Se os testes locais existentes forem suficientes, dispense a inicialização de serviços.

## 3. Integridade visual

- Preserve layout, identidade visual, tipografia, paleta, textos institucionais, copywriting e responsividade em mobile e desktop.
- Restrinja mudanças de HTML e CSS ao escopo aprovado. Preserve IDs, classes, eventos, rotas e contratos existentes.
- Não introduza frameworks sem autorização. Consulte `public/index.html`, `public/app/index.html`, `public/js/`, `public/css/` e `performance/` conforme o escopo.

## 4. Procedimento de desenvolvimento

Em EXP, após aprovação do escopo, siga este ciclo:

1. Inspecione o Git, os arquivos relevantes, `wrangler.toml`, bindings, schema e sequência em `migrations/` conforme o impacto.
2. Planeje a implementação e identifique dependências. Consulte `public/_routes.json`, `functions/_middleware.js` e `functions/_shared/api/router.js` para mudanças de rotas ou API.
3. Implemente, criando ou editando somente os arquivos necessários. Reutilize lógica existente e preserve a compatibilidade com funcionalidades homologadas.
4. Execute os testes.
5. Audite o resultado e as regressões dos fluxos afetados.
6. Corrija autonomamente falhas técnicas dentro do escopo, inclusive por refatoração quando necessária.
7. Revalide e repita a implementação, os testes e a auditoria enquanto houver correções fundamentadas e seguras.
8. Revise o diff, atualize documentação e changelog quando aplicável e revise o staging por caminhos explícitos.
9. Faça o commit local em `exp/local`.
10. Entregue o relatório consolidado.

Esse ciclo dispensa aprovações intermediárias de negócio dentro do escopo aprovado. Ampliação do escopo, mudança de regras de negócio, schema, arquitetura, dependências, segurança ou permissões e operações remotas exigem autorização aplicável. Justifique novas dependências antes de solicitar sua inclusão.

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

- Use Semantic Versioning e altere a versão somente com aprovação. A versão piloto é 4.8.0. Alpha, Beta e Release Candidate são convenções possíveis para versões futuras. A promoção pode manter a mesma versão e deve priorizar o mesmo conteúdo validado.
- Mantenha `package.json`, `CHANGELOG.md` e o diagnóstico em `functions/_shared/api/router.js` sincronizados nas releases.
- Documente arquivos criados e modificados e registre as mudanças em `CHANGELOG.md` dentro do escopo autorizado.
- A autorização de escopo em EXP inclui staging por caminhos explícitos e commits locais em `exp/local`, após revisar integralmente o diff staged. Commits fora de EXP e operações como checkout, reset, rebase e operações destrutivas exigem autorização explícita.
- Identifique releases e promoções por SHA validado.

## 11. Formato de entrega

Entregue um relatório consolidado ao final de cada atividade com:

1. Objetivo e resumo executivo.
2. Alterações e arquivos criados ou modificados, com os SHAs dos commits.
3. Impactos técnicos e funcionais em banco, API e front-end.
4. Testes executados, resultados e verificações pendentes.
5. Riscos residuais, limitações e comandos necessários para homologação.
6. Changelog, parecer GO/NO-GO e próxima aprovação necessária.

## 12. Fluxo de promoção entre ambientes

- Exija autorização consolidada e explícita para cada transição EXP → DEV, DEV → TESTE e TESTE → PRD. Preserve `dev`, `teste` e `main` até a aprovação aplicável.
- Informe SHA de origem, branch de destino, divergências, arquivos e funcionalidades afetados, testes, evidências de homologação aplicáveis, compatibilidade do schema, migrations necessárias, riscos residuais, recuperação e rollback e operações Git e Cloudflare previstas.
- Em DEV, integre e valide tecnicamente o conteúdo aprovado. Em TESTE, realize homologação funcional e regressão com aprovação do usuário. Em PRD, publique somente a versão homologada e aprovada.
- Merge, cherry-pick, push, pull, deploy e migrations remotas exigem autorização aplicável. Considere que um push pode disparar automaticamente um deploy no Cloudflare Pages. Confira os bindings antes de qualquer operação autorizada.

## 13. Critérios de interrupção

Interrompa e comunique o usuário diante de:

- Branch, HEAD ou worktree inesperado, conflito com alterações locais ou divergência inesperada durante transferência.
- Risco de perda ou corrupção de dados, divergência inesperada entre schema e código ou impossibilidade de confirmar isolamento local.
- Vulnerabilidade relevante que não possa ser corrigida com segurança dentro do escopo aprovado.
- Necessidade de ampliar o escopo, decidir regra de negócio ambígua ou alterar schema, dependências, arquitetura, segurança ou permissões.
- Necessidade de acesso remoto ou indícios de que uma operação possa atingir produção.
- Falha impeditiva que não possa ser resolvida com segurança dentro do escopo.

Corrija e revalide falhas recuperáveis dentro do escopo. Evite ciclos indefinidos e mudanças especulativas. Nunca contorne restrições de segurança ou permissões.

## 14. Proteção de arquivos e informações

- Preservar as regras do .gitignore.
- Nunca versionar credenciais, tokens, cookies, JWTs ou arquivos contendo segredos.
- Não versionar arquivos .env, .dev.vars ou configurações locais que contenham informações sensíveis.
- Não versionar node_modules, caches ou estado local do Wrangler.
- Não versionar backups de bancos ou exportações contendo dados pessoais.
- Utilizar dados sintéticos nos testes.
- Verificar o Git diff e os arquivos em staging antes de qualquer commit.
- Nunca modificar permissões do sandbox ou configurações globais do Codex para contornar restrições.
