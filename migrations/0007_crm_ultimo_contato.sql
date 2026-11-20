-- 0007 (somente preview/yolanda-crm-dev): referência de último contato real do CRC.
-- Agendar follow-up NÃO muda a data de último contato.
-- Não altera o histórico de fechamento nem infere Ganho/Perdido de leads legados.
ALTER TABLE clients ADD COLUMN last_contact_at TEXT;

-- Backfill não destrutivo: usa o melhor registro histórico disponível.
-- Em cadastros legados, updated_at pode representar uma edição, por isso
-- a precisão histórica é aproximada; novos contatos serão gravados explicitamente.
UPDATE clients SET last_contact_at = MAX(
  COALESCE(updated_at, created_at),
  COALESCE((SELECT MAX(e.created_at)
            FROM lead_events e JOIN leads l ON l.id = e.lead_id
            WHERE l.client_id = clients.id AND e.kind IN ('criado','nota')), created_at)
);
