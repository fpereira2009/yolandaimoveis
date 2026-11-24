-- Yolanda 4.7.0: duas versões WebP. Não toca nos registros antigos.
-- Aplicar SOMENTE ao D1 Preview, antes de publicar código de mídia.
ALTER TABLE property_images ADD COLUMN thumb_key TEXT;
ALTER TABLE property_images ADD COLUMN width INTEGER;
ALTER TABLE property_images ADD COLUMN height INTEGER;
ALTER TABLE property_images ADD COLUMN thumb_width INTEGER;
ALTER TABLE property_images ADD COLUMN thumb_height INTEGER;
CREATE UNIQUE INDEX IF NOT EXISTS uq_property_images_thumb_key ON property_images(thumb_key) WHERE thumb_key IS NOT NULL;

-- Alias para manter URL antiga acessível depois do UPDATE condicional do D1.
-- GET continua exigindo que o imóvel esteja publicado ou que o operador esteja autenticado.
CREATE TABLE image_url_aliases (
  old_key TEXT PRIMARY KEY,
  image_id INTEGER NOT NULL REFERENCES property_images(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_image_url_aliases_image ON image_url_aliases(image_id);
