# Yolanda CRM 4.6.0 | Atualização do sincronizador Production → Preview

Esta correção substitui **somente** `tools/gerar_sync_preview.py` e acrescenta `tools/test_gerar_sync_preview_ativos.py`. Não substitua migrations, `index.html`, Functions ou código do CRM.

## Situação verificada em Production

- 9 imóveis no D1: 4 ativos, 5 excluídos logicamente.
- 8 clientes no D1: 1 ativo, 7 excluídos logicamente.
- 9 leads no D1: 1 ativo (ID 9), 8 excluídos logicamente.
- Lead ativo ID 9: vinculado ao cliente ativo, sem imóvel associado.
- Imóveis ativos IDs 6, 7, 8 e 9: 10, 6, 10 e 9 fotografias, respectivamente, total de 35.

## Como usar (PowerShell, na raiz do projeto)

1. Extraia este ZIP sobre a pasta do projeto, preservando a estrutura `tools/`.
2. Confirme os dois backups e o caminho `$backupDir`; certifique-se de que `preview_schema_460.sql` é um backup criado após as migrations 0009 e 0010.
3. Execute:

```powershell
py tools/test_gerar_sync_preview_ativos.py

py tools/gerar_sync_preview.py `
  --production-export "$backupDir\production.sql" `
  --preview-export "$backupDir\preview_schema_460.sql" `
  --out-dir "$backupDir\gerado_4_ativos" `
  --permitir-um-cliente `
  --esperar-imoveis-ativos 4 `
  --esperar-leads-ativos 1 `
  --esperar-fotos 35

Get-Content "$backupDir\gerado_4_ativos\manifesto_sem_dados_pessoais.json"
```

Saídas geradas **localmente**, sem alterar Cloudflare:

- `SOMENTE_PREVIEW_SUBSTITUIR_DADOS.sql`: contém dados pessoais e não pode ser commitado nem compartilhado.
- `manifesto_sem_dados_pessoais.json`: contém apenas contagens.
- `r2_prod_manifest.csv`: contém as chaves dos arquivos de imagens selecionadas dos imóveis ativos.
- `r2_preview_antigo_manifest.csv`: referencia os objetos antigos, sem eliminá-los.

## O que é preservado

- IDs originais dos registros selecionados, inclusive ID 9 do lead e IDs 6 a 9 dos imóveis.
- Cliente ativo com seu ID original e vínculo preservado com o lead 9.
- Eventos apenas do lead ativo.
- Imagens apenas dos imóveis ativos.
- Estrutura, migrations e os registros do banco Production, sem modificações.

## Proteções

- O script não acessa a rede e não executa nenhuma escrita em Cloudflare.
- Requer autorização expressa `--permitir-um-cliente` e contagens esperadas de imóveis, leads e fotos.
- Interrompe se um lead ativo apontar para cliente ou imóvel omitido.
- Simula a substituição no backup do Preview em SQLite e valida integridade FK antes de entregar o SQL.
- Não executa limpeza de objetos R2, nem altera a estrutura de Preview.

## Não execute ainda a substituição remota

Primeiro confira o manifesto e copie as 35 fotografias via `tools/copiar_r2_prod_para_preview.ps1` (somente leitura no bucket Production; escrita no R2 Preview). Depois faça outra exportação do Preview antes de aplicar o SQL. A execução `wrangler d1 execute ... --remote --file ...` pode não ser uma transação única; em caso de erro parcial, restaure usando o backup. Valide o ambiente Preview protegido pelo Cloudflare Access.
