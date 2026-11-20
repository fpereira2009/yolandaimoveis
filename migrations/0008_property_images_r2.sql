-- 4.2.3 (preview): galeria de imagens armazenadas no R2.
-- Migrations anteriores e URLs legadas de properties.photo_url permanecem intactas.
CREATE TABLE property_images (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  property_id  INTEGER NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  object_key   TEXT NOT NULL UNIQUE CHECK (length(object_key) BETWEEN 12 AND 260),
  content_type TEXT NOT NULL CHECK (content_type IN ('image/webp', 'image/jpeg')),
  size_bytes   INTEGER NOT NULL CHECK (size_bytes BETWEEN 1 AND 6291456),
  position     INTEGER NOT NULL DEFAULT 0 CHECK (position >= 0),
  is_cover     INTEGER NOT NULL DEFAULT 0 CHECK (is_cover IN (0, 1)),
  created_at   TEXT NOT NULL
);
CREATE INDEX idx_property_images_gallery ON property_images (property_id, position, id);
CREATE UNIQUE INDEX uq_property_images_cover ON property_images (property_id) WHERE is_cover = 1;
CREATE TRIGGER trg_property_images_max10 BEFORE INSERT ON property_images
WHEN (SELECT COUNT(*) FROM property_images WHERE property_id = NEW.property_id) >= 10
BEGIN
  SELECT RAISE(ABORT, 'Limite de 10 fotos por imóvel.');
END;
