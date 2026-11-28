# Sincronização do Preview — Yolanda Imóveis 4.8.0

O gerador `gerar_sync_preview.py` usa exports SQL locais e valida a substituição em um clone SQLite em memória. A origem deve corresponder à sequência contínua 0001–0009 ou 0001–0012. O destino deve corresponder à 0001–0012. O gerador exige um diretório de saída novo ou vazio. Preserve exports, manifestos e SQL fora do Git.

## Preparação e ordem das operações

1. Obtenha autorização específica para copiar dados e mídia e para escrever em Preview. Confirme o ID de `yolanda-crm-dev` e os bindings no ambiente autorizado. DEV e TESTE compartilham o D1 de Preview conforme o registro da 0012, portanto a reposição afeta ambos. Coordene uma janela sem escritas e registre o ponto de recuperação D1 e a correspondência dos objetos R2 atuais.
2. Confirme que o export de origem contém exatamente um cliente ativo e ao menos um lead e um imóvel ativos. Forneça ao gerador `--permitir-um-cliente` e as contagens explícitas em `--esperar-imoveis-ativos`, `--esperar-leads-ativos` e `--esperar-fotos`. O gerador publica o SQL por último, depois de validar o clone e os manifestos.
3. Confira o resumo de contagens e os dois manifestos. No passo autorizado de cópia, use `copiar_r2_prod_para_preview.ps1` com `r2_prod_manifest.csv` e `-ConfirmarCopiaPreview`. O auxiliar baixa e valida todos os objetos antes do primeiro upload, escreve apenas em `yolanda-imoveis-dev` e relê cada cópia para conferir SHA-256. Trate qualquer falha como impedimento para aplicar o SQL.
4. Após verificar a cópia, confira novamente o destino. Aplique o SQL somente no D1 `yolanda-crm-dev` e apenas sob autorização. Os avisos no SQL identificam o destino pretendido. O próprio SQL não comprova a identidade da base em que será executado.
5. Confira contagens, pares de ID e slug, índice de slugs, histórico de migrations, integridade referencial, galeria e miniaturas. Libere escritas após a validação.

## Manifesto R2 e aliases

O CSV usa `object_key,content_type,size_bytes,variant`, com uma linha por objeto. `variant` vale `principal` ou `miniatura`. `size_bytes` é obrigatório no principal. O campo da miniatura fica vazio porque o D1 não registra seu tamanho em bytes. A cópia valida sua assinatura JPEG/WebP, seu limite de tamanho e o SHA-256 dos bytes no destino contra os bytes baixados da origem. Uma foto pode representar dois objetos. As contagens de registros e objetos aparecem separadamente no resumo.

`image_url_aliases` é reconhecida e verificada junto às FKs, mas seus registros não são copiados. O clone confirma a remoção em cascata dos aliases antigos de Preview quando as imagens são repostas, inclusive quando um ID é reutilizado. Os manifestos incluem somente objetos atuais e não incluem a chave antiga do alias. URLs legadas podem retornar HTTP 404 em Preview após o refresh, mesmo se os objetos antigos continuarem no bucket.

## Recuperação

- Uma falha durante a cópia pode deixar objetos gravados em Preview. Mantenha o D1 sem aplicar, compare o inventário com as cópias verificadas, restaure objetos substituídos se necessário e revise a retomada antes de executar de novo. O auxiliar não exclui objetos dos buckets.
- Uma falha durante a aplicação do SQL exige manter a janela de manutenção, interromper novas tentativas e comparar contagens, FKs, slugs e histórico com a evidência anterior. Se o estado divergir, submeta a recuperação do D1 de Preview e a reconciliação dos objetos R2 a aprovação específica.
- D1 e R2 podem ficar em estados diferentes após uma interrupção. O teste no clone valida o resultado local do SQL e não comprova atomicidade remota. Restaure e valide ambos os lados antes de liberar DEV e TESTE.
