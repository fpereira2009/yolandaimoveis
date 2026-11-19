-- 0006: inteligência de leads — imóvel associado (portfólio interno ou externo) + fechamento com resultado.
-- Incremental: não altera as migrations anteriores e não recria tabelas (somente ADD COLUMN + índice).
--
-- Colunas novas em leads:
--   property_id           -> imóvel do portfólio interno (properties.id). NULL = sem imóvel interno.
--   external_property     -> 1 = imóvel de outra imobiliária (parceria); nesse caso property_id fica NULL.
--   external_property_ref -> nome da imobiliária / código / link do anúncio externo.
--   close_result          -> 'Ganho' (convertido) ou 'Perdido' (não convertido); preenchido só pela rotina de fechamento.
--   close_note            -> observação obrigatória do resultado (detalhes do negócio ou motivo da perda).
-- A data/hora do fechamento continua em closed_at (já existente desde a 0001).
-- Leads já fechados antes desta migration ficam com close_result/close_note NULL (resultado desconhecido).

ALTER TABLE leads ADD COLUMN property_id INTEGER REFERENCES properties(id);
ALTER TABLE leads ADD COLUMN external_property INTEGER NOT NULL DEFAULT 0 CHECK (external_property IN (0, 1));
ALTER TABLE leads ADD COLUMN external_property_ref TEXT NOT NULL DEFAULT '' CHECK (length(external_property_ref) <= 300);
ALTER TABLE leads ADD COLUMN close_result TEXT CHECK (close_result IS NULL OR close_result IN ('Ganho', 'Perdido'));
ALTER TABLE leads ADD COLUMN close_note TEXT CHECK (close_note IS NULL OR length(close_note) <= 1000);

-- acelera "quem está segurando este imóvel?" (regras de reserva/liberação)
CREATE INDEX IF NOT EXISTS idx_leads_property ON leads (property_id) WHERE deleted_at IS NULL AND property_id IS NOT NULL;
