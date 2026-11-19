-- 0004: Permite modalidade 'Venda' na tabela leads (usada quando category = 'Captação')
PRAGMA foreign_keys = OFF;

CREATE TABLE leads_new (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  name         TEXT    NOT NULL CHECK (length(name) BETWEEN 2 AND 120),
  phone        TEXT    NOT NULL CHECK (phone GLOB '55[0-9][0-9]*' AND length(phone) IN (12, 13)),
  modality     TEXT    NOT NULL CHECK (modality IN ('Compra', 'Venda', 'Aluguel')),
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

INSERT INTO leads_new (
  id, name, phone, modality, stage, temp, property, value,
  followup_at, created_at, updated_at, closed_at, deleted_at,
  client_id, source, category
)
SELECT
  id, name, phone, modality, stage, temp, property, value,
  followup_at, created_at, updated_at, closed_at, deleted_at,
  client_id, source, category
FROM leads;

DROP TABLE leads;
ALTER TABLE leads_new RENAME TO leads;

CREATE INDEX idx_leads_active   ON leads (stage, followup_at) WHERE deleted_at IS NULL;
CREATE INDEX idx_leads_phone    ON leads (phone);
CREATE INDEX idx_leads_client   ON leads (client_id);
CREATE INDEX idx_leads_category ON leads (category) WHERE deleted_at IS NULL;

PRAGMA foreign_keys = ON;