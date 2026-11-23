-- Yolanda CRM 4.6.0 | Seed LOCAL para SEO/SSR
-- Compativel com a base 4.5.5 + migrations 0009 e 0010 corrigida.
-- SOMENTE D1 LOCAL. Nunca executar em Production ou Preview remoto.
-- IDs 9001 a 9003 reservados para testes, para evitar colisao com anuncios reais.
-- Idempotente: reaplicar nao duplica os mesmos registros.
-- Codigos e slugs sao gerados automaticamente pelo D1; nao inserir nesses campos.

-- CASA | URL: /imoveis/casa-3-quartos-manejo-resende-rj-yti-9001
INSERT INTO properties
(id, title, purpose, type, neighborhood, city, price, area_m2,
 bedrooms, bathrooms, parking, status, description, created_at, updated_at)
SELECT
 9001, 'Casa de teste com 3 quartos no Manejo', 'Comprar', 'Casa',
 'Manejo', 'Resende - RJ', 380000, 120,
 3, 2, 2, 'Disponível',
 'ANUNCIO FICTICIO DE TESTE. Casa no bairro Manejo em Resende, com 3 quartos, 2 banheiros, 2 vagas e 120 m2 de area.',
 datetime('now'), datetime('now')
WHERE NOT EXISTS (SELECT 1 FROM properties WHERE id = 9001);

-- TERRENO | URL: /imoveis/terreno-450m2-manejo-resende-rj-yti-9002
INSERT INTO properties
(id, title, purpose, type, neighborhood, city, price, area_m2,
 bedrooms, bathrooms, parking, status, description, created_at, updated_at)
SELECT
 9002, 'Terreno de teste com 450 m2 no Manejo', 'Comprar', 'Terreno',
 'Manejo', 'Resende - RJ', 240000, 450,
 0, 0, 0, 'Disponível',
 'ANUNCIO FICTICIO DE TESTE. Terreno no bairro Manejo em Resende, com area de 450 m2.',
 datetime('now'), datetime('now')
WHERE NOT EXISTS (SELECT 1 FROM properties WHERE id = 9002);

-- COMERCIAL | URL: /imoveis/comercial-120m2-centro-resende-rj-yti-9003
INSERT INTO properties
(id, title, purpose, type, neighborhood, city, price, area_m2,
 bedrooms, bathrooms, parking, status, description, created_at, updated_at)
SELECT
 9003, 'Sala comercial de teste com 120 m2 no Centro', 'Alugar', 'Comercial',
 'Centro', 'Resende - RJ', 3500, 120,
 0, 1, 0, 'Disponível',
 'ANUNCIO FICTICIO DE TESTE. Sala comercial no Centro de Resende, com area de 120 m2 e 1 banheiro.',
 datetime('now'), datetime('now')
WHERE NOT EXISTS (SELECT 1 FROM properties WHERE id = 9003);
