-- 3.2.0: suporte à modalidade "Venda" (alinhado à categoria "Captação")
PRAGMA defer_foreign_keys = ON;

CREATE TABLE leads_new (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  name         TEXT    NOT NULL CHECK (length(name) BETWEEN 2 AND 120),
  phone        TEXT    NOT NULL CHECK (phone GLOB '55[0-9][0-9]*' AND length(phone) IN (12, 13)),
  modality     TEXT    NOT NULL CHECK (modality IN ('Compra', 'Aluguel', 'Venda')),
  stage        TEXT    NOT NULL CHECK (stage IN ('Novo Lead','Qualificação','Visita Agendada',
                                                  'Proposta Enviada','Documentação/Crédito','Fechado')),
  temp         TEXT    NOT NULL CHECK (temp IN ('Quente', 'Morno', 'Frio')),
  property     TEXT    NOT NULL DEFAULT '' CHECK (length(property) <= 200),
  value        INTEGER NOT NULL DEFAULT 0 CHECK (value BETWEEN 0 AND 1000000000),
  followup_at  TEXT    CHECK (followup_at IS NULL OR followup_at GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
  created_at   TEXT    NOT NULL,
  updated_at   TEXT    NOT NULL,
  closed_at    TEXT,
  deleted_at   TEXT,
  client_id    INTEGER REFERENCES clients(id),
  source       TEXT    NOT NULL DEFAULT 'Painel' CHECK (source IN ('Painel', 'Site', 'CRC')),
  category     TEXT    NOT NULL DEFAULT 'Interessado' CHECK (category IN ('Interessado', 'Captação'))
);

INSERT INTO leads_new (id, name, phone, modality, stage, temp, property, value, followup_at, created_at, updated_at, closed_at, deleted_at, client_id, source, category)
SELECT id, name, phone,
       CASE WHEN category = 'Captação' AND modality = 'Compra' THEN 'Venda' ELSE modality END,
       stage, temp, property, value, followup_at, created_at, updated_at, closed_at, deleted_at, client_id, source, category
  FROM leads;

DROP TABLE leads;
ALTER TABLE leads_new RENAME TO leads;

CREATE INDEX idx_leads_active   ON leads (stage, followup_at) WHERE deleted_at IS NULL;
CREATE INDEX idx_leads_phone    ON leads (phone);
CREATE INDEX idx_leads_client   ON leads (client_id);
CREATE INDEX idx_leads_category ON leads (category) WHERE deleted_at IS NULL;

CREATE TABLE clients_new (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  name             TEXT NOT NULL CHECK (length(name) BETWEEN 2 AND 120),
  phone            TEXT NOT NULL CHECK (phone GLOB '55[0-9][0-9]*' AND length(phone) IN (12, 13)),
  modality         TEXT NOT NULL CHECK (modality IN ('Compra', 'Aluguel', 'Venda')),
  profile          TEXT NOT NULL CHECK (profile IN ('Comprador','Proprietário','Investidor','Locatário')),
  regions          TEXT NOT NULL CHECK (length(regions) BETWEEN 1 AND 200),
  budget           TEXT NOT NULL DEFAULT 'A definir' CHECK (length(budget) <= 120),
  preferences      TEXT NOT NULL DEFAULT '' CHECK (length(preferences) <= 1000),
  next_action      TEXT NOT NULL DEFAULT '' CHECK (length(next_action) <= 300),
  birthday_month   INTEGER NOT NULL DEFAULT 0 CHECK (birthday_month IN (0, 1)),
  pending_followup INTEGER NOT NULL DEFAULT 1 CHECK (pending_followup IN (0, 1)),
  last_interaction TEXT NOT NULL DEFAULT '',
  created_at       TEXT NOT NULL,
  updated_at       TEXT NOT NULL,
  deleted_at       TEXT,
  source           TEXT NOT NULL DEFAULT 'Painel' CHECK (source IN ('Painel', 'Site', 'Lead'))
);

INSERT INTO clients_new (id, name, phone, modality, profile, regions, budget, preferences, next_action, birthday_month, pending_followup, last_interaction, created_at, updated_at, deleted_at, source)
SELECT id, name, phone,
       CASE WHEN profile = 'Proprietário' AND modality = 'Compra' THEN 'Venda' ELSE modality END,
       profile, regions, budget, preferences, next_action, birthday_month, pending_followup, last_interaction, created_at, updated_at, deleted_at, source
  FROM clients;

DROP TABLE clients;
ALTER TABLE clients_new RENAME TO clients;

CREATE UNIQUE INDEX uq_clients_phone ON clients (phone) WHERE deleted_at IS NULL;