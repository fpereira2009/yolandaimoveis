-- Imóveis no banco (código automático YTI-0001, YTI-0002...) + integração lead <-> cliente

CREATE TABLE properties (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  code         TEXT GENERATED ALWAYS AS ('YTI-' || printf('%04d', id)) VIRTUAL,
  title        TEXT    NOT NULL CHECK (length(title) BETWEEN 3 AND 150),
  purpose      TEXT    NOT NULL CHECK (purpose IN ('Comprar', 'Alugar')),
  type         TEXT    NOT NULL DEFAULT 'Casa' CHECK (length(type) BETWEEN 1 AND 40),
  neighborhood TEXT    NOT NULL CHECK (length(neighborhood) BETWEEN 1 AND 80),
  city         TEXT    NOT NULL DEFAULT 'Resende - RJ' CHECK (length(city) BETWEEN 1 AND 80),
  price        INTEGER NOT NULL DEFAULT 0 CHECK (price BETWEEN 0 AND 1000000000),
  area_m2      INTEGER NOT NULL DEFAULT 0 CHECK (area_m2 BETWEEN 0 AND 10000000),
  bedrooms     INTEGER NOT NULL DEFAULT 0 CHECK (bedrooms BETWEEN 0 AND 99),
  bathrooms    INTEGER NOT NULL DEFAULT 0 CHECK (bathrooms BETWEEN 0 AND 99),
  parking      INTEGER NOT NULL DEFAULT 0 CHECK (parking BETWEEN 0 AND 99),
  photo_url    TEXT    NOT NULL DEFAULT '' CHECK (length(photo_url) <= 500),
  badge        TEXT    NOT NULL DEFAULT '' CHECK (length(badge) <= 40),
  status       TEXT    NOT NULL DEFAULT 'Disponível' CHECK (status IN ('Disponível','Reservado','Vendido','Alugado','Inativo')),
  description  TEXT    NOT NULL DEFAULT '' CHECK (length(description) <= 2000),
  created_at   TEXT    NOT NULL,
  updated_at   TEXT    NOT NULL,
  deleted_at   TEXT
);
CREATE UNIQUE INDEX uq_properties_code ON properties (code);
CREATE INDEX idx_properties_public ON properties (status) WHERE deleted_at IS NULL;

-- lead e cliente passam a ser a mesma pessoa vista de dois ângulos
ALTER TABLE leads   ADD COLUMN client_id INTEGER REFERENCES clients(id);
ALTER TABLE leads   ADD COLUMN source TEXT NOT NULL DEFAULT 'Painel' CHECK (source IN ('Painel', 'Site', 'CRC'));
ALTER TABLE clients ADD COLUMN source TEXT NOT NULL DEFAULT 'Painel' CHECK (source IN ('Painel', 'Site', 'Lead'));
CREATE INDEX idx_leads_client ON leads (client_id);
