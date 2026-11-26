# 4.7.8 — Analytics e Conversões (DEV)
Base: dev 296adb6ce3862bceed60e0076afb18b5d77b76e0.

## Instalação
Copie os arquivos public/, functions/ e tests/ deste pacote para a raiz do repositório, mantendo os caminhos. Não substitua as pastas inteiras. Confira `git branch --show-current` (dev) e `git status` antes. Execute `node tests/analytics-4.7.8.test.mjs`. Revise `git diff`, adicione somente os arquivos deste pacote e faça commit/push para dev. Não faça merge para teste/main antes da homologação.

## GTM — configuração necessária (não incluída no código)
No GTM-PT6FQG5R, crie/ajuste acionadores Evento personalizado com nomes exatos: property_view, whatsapp_click, lead_whatsapp, owner_lead, property_share, property_search, property_filter, lead_error. phone_click está previsto no módulo, mas não há link tel: identificado na vitrine atual. Use um acionador por evento, sem manter acionadores de clique concorrentes para whatsapp_click. Mantenha o evento automático click separado; ele pode incluir links de saída e não representa conversão. Revise medição otimizada, especialmente URLs de saída e interações de formulário, para impedir dados pessoais no GA4. Não envie Click URL, texto de mensagem, nome, telefone ou busca livre. Crie variáveis de camada de dados v2 para property_code, property_name, property_type, property_city, property_neighborhood, property_price, property_purpose, contact_origin e associe às tags de evento conforme aplicável. Valores nulos limpam o contexto de imóvel anterior. Não marque whatsapp_click como conversão de lead. lead_whatsapp e owner_lead indicam atendimento registrado (HTTP 201), inclusive contato repetido em lead existente; não são contagem de leads únicos. property_share indica intenção de compartilhar, não confirmação de envio. property_search registra alteração confirmada do campo, sem texto livre. Não altere o GTM publicado até testar em Visualizar.

## Isolamento GA4
Não implementado no pacote: crie propriedade de homologação e fluxo Web. No GTM, use tabela de consulta Page Hostname: dev.yolanda-site.pages.dev e teste.yolanda-site.pages.dev → novo ID; yolandaimoveis.com.br e www.yolandaimoveis.com.br → G-Q8ZJSFV11B. Sem destino padrão para hosts desconhecidos; restrinja acionadores de todas as tags aos hosts permitidos. Use a variável tanto na tag Google quanto nas tags de eventos. Recrie dimensões e eventos principais na propriedade de homologação. Valide destinos no Tag Assistant antes de publicar. Dados históricos não são separados retroativamente.

## Homologação DEV
- Abrir vitrine e página SEO diretamente: um property_view por abertura de imóvel, page_view normal.
- Clicar em cada um dos seis links institucionais: um whatsapp_click, origem correta, sem código de imóvel residual.
- Card, cabeçalho e lateral SEO: um whatsapp_click com código do imóvel.
- Formulário interesse: HTTP 201 → lead_whatsapp e whatsapp_click; conferir CRM. HTTP 400/429/503 e rede indisponível → sem lead_whatsapp; lead_error; preservar comportamento original de abertura do WhatsApp. Honeypot HTTP 200 não conta conversão.
- Proprietário: HTTP 201 → owner_lead e whatsapp_click. Repetição pode atualizar lead existente.
- Compartilhar card/modal/SEO: property_share, não whatsapp_click. Filtros e busca confirmada: eventos correspondentes sem texto livre.
- Verificar DebugView, duplicidade, ausência de dados pessoais, Chrome desktop, Android, Safari iPhone. Confirmar coleta fora do modo debug.

## Testes locais
Sintaxe JS e teste analytics-4.7.8 aprovados. Testes antigos SEO e WhatsApp falham também na base intacta: expectativa de HTTP 404 vs 503 em produção simulada e ausência de CHANGELOG.md, respectivamente. Não foi feita homologação em navegador, Cloudflare, GTM ou GA4. Nenhum deploy executado.
