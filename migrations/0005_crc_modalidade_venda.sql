-- 0005: Permite modalidade 'Venda' na tabela clients, torna profile opcional (legado)
-- e recria leads/lead_events para manter as Foreign Keys íntegras no Cloudflare D1
PRAGMA defer_foreign_keys = ON;

CREATE TABLE clients_new (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  name             TEXT    NOT NULL CHECK (length(name) BETWEEN 2 AND 120),
  phone            TEXT    NOT NULL CHECK (phone GLOB '55[0-9][0-9]*' AND length(phone) IN (12, 13)),
  modality         TEXT    NOT NULL CHECK (modality IN ('Compra', 'Venda', 'Aluguel')),
  profile          TEXT    NOT NULL DEFAULT 'Comprador',
  regions          TEXT    NOT NULL CHECK (length(regions) BETWEEN 1 AND 200),
  budget           TEXT    NOT NULL DEFAULT 'A definir' CHECK (length(budget) <= 120),
  preferences      TEXT    NOT NULL DEFAULT '' CHECK (length(preferences) <= 1000),
  next_action      TEXT    NOT NULL DEFAULT '' CHECK (length(next_action) <= 300),
  birthday_month   INTEGER NOT NULL DEFAULT 0 CHECK (birthday_month IN (0, 1)),
  pending_followup INTEGER NOT NULL DEFAULT 1 CHECK (pending_followup IN (0, 1)),
  last_interaction TEXT    NOT NULL DEFAULT '',
  created_at       TEXT    NOT NULL,
  updated_at       TEXT    NOT NULL,
  deleted_at       TEXT,
  source           TEXT    NOT NULL DEFAULT 'Painel' CHECK (source IN ('Painel', 'Site', 'Lead'))
);

INSERT INTO clients_new (
  id, name, phone, modality, profile, regions, budget, preferences,
  next_action, birthday_month, pending_followup, last_interaction,
  created_at, updated_at, deleted_at, source
)
SELECT
  id, name, phone,
  CASE WHEN profile = 'Proprietário' AND modality = 'Compra' THEN 'Venda' ELSE modality END,
  profile, regions, budget, preferences,
  next_action, birthday_month, pending_followup, last_interaction,
  created_at, updated_at, deleted_at, source
FROM clients;

CREATE TABLE leads_new (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  name        TEXT    NOT NULL CHECK (length(name) BETWEEN 2 AND 120),
  phone       TEXT    NOT NULL CHECK (phone GLOB '55[0-9][0-9]*' AND length(phone) IN (12, 13)),
  modality    TEXT    NOT NULL CHECK (modality IN ('Compra', 'Venda', 'Aluguel')),
  stage       TEXT    NOT NULL CHECK (stage IN ('Novo Lead','Qualificação','Visita Agendada','Proposta Enviada','Documentação/Crédito','Fechado')),
  temp        TEXT    NOT NULL CHECK (temp IN ('Quente', 'Morno', 'Frio')),
  property    TEXT    NOT NULL DEFAULT '' CHECK (length(property) <= 200),
  value       INTEGER NOT NULL DEFAULT 0 CHECK (value >= 0),
  followup_at TEXT    CHECK (followup_at IS NULL OR followup_at GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
  client_id   INTEGER REFERENCES clients_new(id) ON DELETE SET NULL,
  source      TEXT    NOT NULL DEFAULT 'Painel' CHECK (source IN ('Painel', 'Site', 'CRC')),
  category    TEXT    NOT NULL DEFAULT 'Interessado' CHECK (category IN ('Interessado', 'Captação')),
  created_at  TEXT    NOT NULL,
  updated_at  TEXT    NOT NULL,
  closed_at   TEXT,
  deleted_at  TEXT
);

INSERT INTO leads_new (
  id, name, phone, modality, stage, temp, property, value, followup_at,
  client_id, source, category, created_at, updated_at, closed_at, deleted_at
)
SELECT
  id, name, phone, modality, stage, temp, property, value, followup_at,
  CASE WHEN client_id IN (SELECT id FROM clients_new) THEN client_id ELSE NULL END,
  source, COALESCE(category, 'Interessado'), created_at, updated_at, closed_at, deleted_at
FROM leads;

CREATE TABLE lead_events_new (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  lead_id    INTEGER NOT NULL REFERENCES leads_new(id) ON DELETE CASCADE,
  kind       TEXT    NOT NULL CHECK (kind IN ('criado','etapa','modalidade','temperatura','followup','nota')),
  text       TEXT    NOT NULL CHECK (length(text) BETWEEN 1 AND 1000),
  created_at TEXT    NOT NULL
);

INSERT INTO lead_events_new (id, lead_id, kind, text, created_at)
SELECT id, lead_id, kind, text, created_at
FROM lead_events
WHERE lead_id IN (SELECT id FROM leads_new);

DROP TABLE lead_events;
DROP TABLE leads;
DROP TABLE clients;

ALTER TABLE clients_new RENAME TO clients;
ALTER TABLE leads_new RENAME TO leads;
ALTER TABLE lead_events_new RENAME TO lead_events;

CREATE UNIQUE INDEX uq_clients_phone ON clients (phone) WHERE deleted_at IS NULL;
CREATE INDEX idx_leads_stage ON leads (stage) WHERE deleted_at IS NULL;
CREATE INDEX idx_leads_followup ON leads (followup_at) WHERE deleted_at IS NULL AND stage != 'Fechado';
CREATE INDEX idx_leads_phone ON leads (phone) WHERE deleted_at IS NULL;
CREATE INDEX idx_lead_events_lead ON lead_events (lead_id, created_at DESC);