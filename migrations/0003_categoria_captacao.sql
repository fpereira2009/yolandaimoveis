-- 3.1.0: categoria do lead (Interessado = comprador/locatário; Captação = proprietário)
ALTER TABLE leads ADD COLUMN category TEXT NOT NULL DEFAULT 'Interessado' CHECK (category IN ('Interessado', 'Captação'));

-- leads antigos de proprietários passam para "Captação"
UPDATE leads SET category = 'Captação'
 WHERE id IN (SELECT lead_id FROM lead_events WHERE kind = 'criado' AND text LIKE 'Contato pelo site (anunciar imóvel%')
    OR (source = 'CRC' AND client_id IN (SELECT id FROM clients WHERE profile = 'Proprietário'));

CREATE INDEX IF NOT EXISTS idx_leads_category ON leads (category) WHERE deleted_at IS NULL;
