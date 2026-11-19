# Changelog

## [3.2.1] — 2026-11-18
### Documentos legais (`public/privacidade.html` e `public/termos.html`)
Textos ajustados à arquitetura atual (sem alteração de código ou de banco).
- **Privacidade:** removidas as menções a Google Sheets/Workspace e a "PIN"; descrição dos dados coletados pelos dois
  formulários do site e dos campos registrados no CRC; explicação de como o envio funciona (registro no CRC e depois WhatsApp,
  com o comportamento quando o registro falha); provedores reais (Cloudflare Pages/D1/Access, WhatsApp, Google Fonts e login,
  hospedagem de imagens e CDNs de terceiros); transferência internacional; armazenamento local do navegador (cópia do catálogo,
  sem dados pessoais); retenção e exclusão lógica com eliminação definitiva sob solicitação; direitos do art. 18 completos e ANPD.
- **Termos:** nova seção "Formulários de Contato e Atendimento" (o envio não é proposta, reserva nem contrato); catálogo mantido
  em sistema próprio com códigos YTI-0000 e aviso sobre última versão salva; regras contra envio automatizado; regras da área
  restrita (Cloudflare Access, sigilo, exportação CSV). Agora com 9 seções.
- Data de atualização: 18 de novembro de 2026.

## [3.2.0] — 2026-11-18
### Painel restrito (CRC)
- **Follow-up editável na tela do lead**: campo de data no topo do detalhe (destaque em vermelho quando atrasado).
  Alterar a data salva na hora e registra no histórico.
- **Reagendamento automático**: ao registrar uma nota ou mudar a etapa, o próximo follow-up passa para o dia seguinte.
  Se a data for alterada à mão antes de salvar a nota ou a etapa, a data escolhida é mantida.
  Lead "Fechado" não tem follow-up; reabrir o lead volta a agendar para amanhã.
- Formulário de cadastro/edição do lead: o seletor ("Hoje", "Amanhã"…) virou um campo de data
  (novo lead já vem com amanhã; deixe vazio para não agendar).
### Site público
- Rodapé com links para **Política de Privacidade** (`/privacidade`) e **Termos de Serviço** (`/termos`).
  As páginas fazem parte do pacote (`public/privacidade.html` e `public/termos.html`), exatamente como enviadas.
### Banco e API
- `PATCH /api/leads/:id` e `POST /api/leads/:id/notes` aplicam a regra de follow-up (aceitam `followup_at` explícito).
- `wrangler.toml` já aponta para o banco `yolanda-crm` (`database_id` preenchido).
- Sem migração nova nesta versão.

## [3.1.0] — 2026-11-18
### Painel restrito (CRC)
- **Google Sheets & CSV** foi substituído pelo módulo **Exportar CSV**: baixa as bases `leads`, `clientes`,
  `imoveis` e `historico` (ou todas de uma vez). Arquivos gerados no servidor, com todas as colunas e os registros
  excluídos (coluna `excluido_em`), separador `;` e UTF-8 com BOM (abre direto no Excel em português).
- **Categoria do lead**: `Interessado` (comprador/locatário) ou `Captação` (proprietário que quer anunciar).
  Campo no cadastro/edição, selo "Captação" nos cards, filtro por categoria no funil com contadores.
  A comissão estimada do topo considera apenas leads Interessados.
### Site público
- **Formulário de interesse** corrigido: nome e WhatsApp agora são obrigatórios; o botão "Tenho Interesse" dos cards
  abre o formulário do imóvel. Ao enviar, o contato é cadastrado como cliente + lead (Interessado) no CRC e só então
  abre o WhatsApp.
- **Formulário de proprietários**: cadastra cliente (perfil Proprietário) + lead de **Captação** no CRC antes de abrir o WhatsApp.
- Se o telefone for inválido, o site mostra o motivo e não abre o WhatsApp. Se o CRC estiver fora do ar, o WhatsApp
  abre mesmo assim (o contato não se perde) e o site avisa que o cadastro não foi registrado.
### Banco e API
- Migração `0003_categoria_captacao.sql` (coluna `leads.category`; leads antigos de proprietários viram Captação).
- Novo `GET /api/export/{leads|clientes|imoveis|historico}` (restrito ao Access).
- Lead duplicado agora é avaliado por telefone + modalidade + categoria.
