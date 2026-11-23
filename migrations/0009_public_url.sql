-- Guarda os termos da primeira publicação para manter o endereço estável.
ALTER TABLE properties ADD COLUMN public_url_terms TEXT;
UPDATE properties SET public_url_terms = type || '-' || CASE WHEN bedrooms > 0 THEN bedrooms || CASE WHEN bedrooms = 1 THEN '-quarto-' ELSE '-quartos-' END ELSE '' END || neighborhood || '-' || city || '-RJ'
WHERE deleted_at IS NULL AND status IN ('Disponível','Reservado');
CREATE TRIGGER freeze_public_url_insert AFTER INSERT ON properties
WHEN NEW.public_url_terms IS NULL AND NEW.deleted_at IS NULL AND NEW.status IN ('Disponível','Reservado')
BEGIN
  UPDATE properties SET public_url_terms = NEW.type || '-' || CASE WHEN NEW.bedrooms > 0 THEN NEW.bedrooms || CASE WHEN NEW.bedrooms = 1 THEN '-quarto-' ELSE '-quartos-' END ELSE '' END || NEW.neighborhood || '-' || NEW.city || '-RJ' WHERE id = NEW.id;
END;
CREATE TRIGGER freeze_public_url_update AFTER UPDATE OF status, deleted_at ON properties
WHEN NEW.public_url_terms IS NULL AND NEW.deleted_at IS NULL AND NEW.status IN ('Disponível','Reservado')
BEGIN
  UPDATE properties SET public_url_terms = NEW.type || '-' || CASE WHEN NEW.bedrooms > 0 THEN NEW.bedrooms || CASE WHEN NEW.bedrooms = 1 THEN '-quarto-' ELSE '-quartos-' END ELSE '' END || NEW.neighborhood || '-' || NEW.city || '-RJ' WHERE id = NEW.id;
END;
