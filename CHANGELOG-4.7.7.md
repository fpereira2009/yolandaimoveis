# Yolanda CRM 4.7.7 (proposta) | Upload de fotos iPhone

## Added
- Seleção de imagens HEIC/HEIF, além de JPEG, PNG e WebP, quando decodificáveis pelo navegador.
- Mensagem de erro para HEIC não suportado no navegador.

## Changed
- Geração local de JPEG 80%, lado maior até 1600 px, sem ampliação.
- Miniatura JPEG 80%, lado maior até 480 px.
- Endpoint multipart aceita JPEG ou WebP, com principal e miniatura no mesmo MIME.

## Fixed
- Remoção da dependência de WebP na conversão local de imagens.
- Persistência de extensão e Content-Type corretos em R2, sem migração D1.
- Compatibilidade de leitura de arquivos legados WebP preservada.

## Ambiente
- Aplicar inicialmente somente na branch dev e homologar com D1 yolanda-crm-dev e R2 yolanda-imoveis-dev.
- Nenhuma migration ou comando Wrangler necessário.
