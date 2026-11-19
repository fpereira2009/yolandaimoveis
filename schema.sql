PRAGMA defer_foreign_keys=TRUE;
CREATE TABLE IF NOT EXISTS "d1_migrations"(
		id         INTEGER PRIMARY KEY AUTOINCREMENT,
		name       TEXT UNIQUE,
		applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL
);
CREATE TABLE leads (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,   -- código público: LD-(100+id)
  name         TEXT    NOT NULL CHECK (length(name) BETWEEN 2 AND 120),
  phone        TEXT    NOT NULL CHECK (phone GLOB '55[0-9][0-9]*' AND length(phone) IN (12, 13)),
  modality     TEXT    NOT NULL CHECK (modality IN ('Compra', 'Aluguel')),
  stage        TEXT    NOT NULL CHECK (stage IN ('Novo Lead','Qualificação','Visita Agendada',
                                                  'Proposta Enviada','Documentação/Crédito','Fechado')),
  temp         TEXT    NOT NULL CHECK (temp IN ('Quente', 'Morno', 'Frio')),
  property     TEXT    NOT NULL DEFAULT '' CHECK (length(property) <= 200),
  value        INTEGER NOT NULL DEFAULT 0 CHECK (value BETWEEN 0 AND 1000000000),  -- em reais
  followup_at  TEXT    CHECK (followup_at IS NULL OR followup_at GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
  created_at   TEXT    NOT NULL,   -- ISO 8601 UTC
  updated_at   TEXT    NOT NULL,
  closed_at    TEXT,               -- preenchido ao entrar em "Fechado"
  deleted_at   TEXT                -- exclusão lógica (permite desfazer)
, client_id INTEGER REFERENCES clients(id), source TEXT NOT NULL DEFAULT 'Painel' CHECK (source IN ('Painel', 'Site', 'CRC')), category TEXT NOT NULL DEFAULT 'Interessado' CHECK (category IN ('Interessado', 'Captação')));
CREATE TABLE lead_events (        -- histórico com data real (base para métricas de conversão)
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  lead_id    INTEGER NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  kind       TEXT    NOT NULL CHECK (kind IN ('criado','nota','etapa','modalidade','temperatura','followup')),
  text       TEXT    NOT NULL CHECK (length(text) BETWEEN 1 AND 1000),
  created_at TEXT    NOT NULL
);
CREATE TABLE clients (            -- CRC
  id               INTEGER PRIMARY KEY AUTOINCREMENT,   -- código público: CRC-NN
  name             TEXT NOT NULL CHECK (length(name) BETWEEN 2 AND 120),
  phone            TEXT NOT NULL CHECK (phone GLOB '55[0-9][0-9]*' AND length(phone) IN (12, 13)),
  modality         TEXT NOT NULL CHECK (modality IN ('Compra', 'Aluguel')),
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
  deleted_at       TEXT
, source TEXT NOT NULL DEFAULT 'Painel' CHECK (source IN ('Painel', 'Site', 'Lead')));
CREATE TABLE properties (   id           INTEGER PRIMARY KEY AUTOINCREMENT,   code         TEXT GENERATED ALWAYS AS ('YTI-' || printf('%04d', id)) VIRTUAL,   title        TEXT    NOT NULL CHECK (length(title) BETWEEN 3 AND 150),   purpose      TEXT    NOT NULL CHECK (purpose IN ('Comprar', 'Alugar')),   type         TEXT    NOT NULL DEFAULT 'Casa' CHECK (length(type) BETWEEN 1 AND 40),   neighborhood TEXT    NOT NULL CHECK (length(neighborhood) BETWEEN 1 AND 80),   city         TEXT    NOT NULL DEFAULT 'Resende - RJ' CHECK (length(city) BETWEEN 1 AND 80),   price        INTEGER NOT NULL DEFAULT 0 CHECK (price BETWEEN 0 AND 1000000000),   area_m2      INTEGER NOT NULL DEFAULT 0 CHECK (area_m2 BETWEEN 0 AND 10000000),   bedrooms     INTEGER NOT NULL DEFAULT 0 CHECK (bedrooms BETWEEN 0 AND 99),   bathrooms    INTEGER NOT NULL DEFAULT 0 CHECK (bathrooms BETWEEN 0 AND 99),   parking      INTEGER NOT NULL DEFAULT 0 CHECK (parking BETWEEN 0 AND 99),   photo_url    TEXT    NOT NULL DEFAULT '' CHECK (length(photo_url) <= 500),   badge        TEXT    NOT NULL DEFAULT '' CHECK (length(badge) <= 40),   status       TEXT    NOT NULL DEFAULT 'Disponível' CHECK (status IN ('Disponível','Reservado','Vendido','Alugado','Inativo')),   description  TEXT    NOT NULL DEFAULT '' CHECK (length(description) <= 2000),   created_at   TEXT    NOT NULL,   updated_at   TEXT    NOT NULL,   deleted_at   TEXT );
DELETE FROM sqlite_sequence;
CREATE INDEX idx_leads_active ON leads (stage, followup_at) WHERE deleted_at IS NULL;
CREATE INDEX idx_leads_phone  ON leads (phone);
CREATE INDEX idx_events_lead ON lead_events (lead_id, created_at);
CREATE UNIQUE INDEX uq_clients_phone ON clients (phone) WHERE deleted_at IS NULL;
CREATE UNIQUE INDEX uq_properties_code ON properties (code);
CREATE INDEX idx_properties_public ON properties (status) WHERE deleted_at IS NULL;
CREATE INDEX idx_leads_client ON leads (client_id);
CREATE INDEX idx_leads_category ON leads (category) WHERE deleted_at IS NULL;
