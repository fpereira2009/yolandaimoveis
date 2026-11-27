# Yolanda Imóveis

Site institucional + CRM de imóveis da **Yolanda Transações Imobiliárias**.

Versão atual: **4.8.0**  
Branch de desenvolvimento: `dev`

---

## O que é este projeto

Sistema completo de:

- **Vitrine pública** de imóveis (listagem, ficha com SEO, contato, WhatsApp)
- **CRM interno** (leads, clientes CRC, imóveis, funil, follow-up, galeria de fotos)
- Autenticação via **Cloudflare Access**
- Banco **Cloudflare D1** (SQLite)
- Mídia (fotos) no **Cloudflare R2**
- Deploy em **Cloudflare Pages + Pages Functions**

---

## Stack

| Camada              | Tecnologia                          |
|---------------------|-------------------------------------|
| Front-end           | HTML, CSS, JavaScript Vanilla, Tailwind CSS |
| Backend             | Cloudflare Pages Functions          |
| Banco de dados      | Cloudflare D1 (SQLite)              |
| Armazenamento       | Cloudflare R2                       |
| Autenticação        | Cloudflare Access (JWT)             |
| Deploy              | Cloudflare Pages                    |
| Testes              | Node.js (`node --test`) + Python    |

---


## Estrutura principal
├── public/                 # Front-end estático (vitrine + app CRM)
│   ├── app/                # Interface do CRM
│   ├── js/                 # Scripts da vitrine e do CRM
│   └── css/
├── functions/              # Pages Functions
│   ├── _shared/            # Código compartilhado (auth, API, SEO, mídia…)
│   ├── api/                # Rotas da API
│   └── imoveis/            # Rotas de ficha de imóvel (SEO)
├── migrations/             # Migrations do D1 (em ordem)
├── tests/                  # Testes automatizados
├── performance/            # Diagnósticos e build de CSS
├── AGENTS.md               # Regras para agentes de IA e desenvolvedores
└── CHANGELOG.md            # Histórico de versões

---

## Ambientes

| Ambiente   | Branch  | D1                    | R2                      | Observação                          |
|------------|---------|-----------------------|-------------------------|-------------------------------------|
| Desenvolvimento | `dev`   | `yolanda-crm-dev`     | `yolanda-imoveis-dev`   | Uso diário de desenvolvimento       |
| Homologação     | `teste` | `yolanda-crm-dev`*    | `yolanda-imoveis-dev`*  | *pode compartilhar recursos de Preview |
| Produção        | `main`  | `yolanda-crm`         | `yolanda-imoveis-prod`  | Nunca alterar sem autorização       |

> **Importante:** nunca faça push direto em `main` ou `teste` sem aprovação. Todo desenvolvimento acontece em `dev`.

---

## Como rodar localmente

### Pré-requisitos

- Node.js 22+
- Wrangler (`npm i -g wrangler` ou via `npx`)
- Conta Cloudflare com acesso ao projeto
- Variáveis de ambiente configuradas (Access, D1, R2)

### Instalação

```bash
git clone https://github.com/fpereira2009/yolandaimoveis.git
cd yolandaimoveis
git switch dev
npm install
