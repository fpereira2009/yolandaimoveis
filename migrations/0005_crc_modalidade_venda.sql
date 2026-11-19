-- 0005: Permite modalidade 'Venda' na tabela clients e torna profile opcional (legado)
PRAGMA foreign_keys = OFF;

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

DROP TABLE clients;
ALTER TABLE clients_new RENAME TO clients;

CREATE UNIQUE INDEX uq_clients_phone ON clients (phone) WHERE deleted_at IS NULL;

PRAGMA foreign_keys = ON;