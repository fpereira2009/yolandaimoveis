# Copia SOMENTE os objetos referenciados no D1 Production para o bucket Preview.
# Leitura: yolanda-imoveis-prod. Escrita: yolanda-imoveis-dev. Sem delete de qualquer objeto.
# Rodar manualmente DEPOIS de gerar r2_prod_manifest.csv e ANTES da sincronização D1.
param([Parameter(Mandatory=$true)][string]$Manifest,
      [Parameter(Mandatory=$true)][string]$PastaTemporaria,
      [switch]$ConfirmarCopiaPreview)
$ErrorActionPreference = 'Stop'
if (-not $ConfirmarCopiaPreview) { throw 'Execute somente com -ConfirmarCopiaPreview. Nunca modifica Production.' }
if (-not (Test-Path -LiteralPath $Manifest -PathType Leaf)) { throw 'Manifesto CSV não encontrado' }
New-Item -ItemType Directory -Force -Path $PastaTemporaria | Out-Null
$items = @(Import-Csv -LiteralPath $Manifest)
$copiados=0
foreach ($item in $items) {
  $key = [string]$item.object_key
  $mime = [string]$item.content_type
  if (-not $key.StartsWith('properties/') -or $key.Contains('..') -or $key.Contains('\') -or $key -match '[\x00-\x1F]') { throw 'Chave R2 inválida. Interrompendo.' }
  if ($mime -notin @('image/jpeg', 'image/webp')) { throw 'MIME inesperado. Interrompendo.' }
  $local = Join-Path $PastaTemporaria ('r2-seo-' + [guid]::NewGuid().ToString('N') + '.bin')
  try {
    & npx wrangler r2 object get ("yolanda-imoveis-prod/" + $key) --remote --file $local
    if ($LASTEXITCODE -ne 0) { throw 'Falha ao baixar imagem de Production. A cópia foi interrompida.' }
    $actual=(Get-Item -LiteralPath $local).Length
    if ($actual -ne [long]$item.size_bytes) { throw 'Tamanho de objeto incompatível com D1; interrompendo.' }
    & npx wrangler r2 object put ("yolanda-imoveis-dev/" + $key) --remote --file $local --content-type $mime
    if ($LASTEXITCODE -ne 0) { throw 'Falha no upload para Preview.' }
    $copiados++
  } finally {
    if (Test-Path -LiteralPath $local) { Remove-Item -LiteralPath $local -Force }
  }
}
Write-Host "Objetos copiados com sucesso para Preview: $copiados / $($items.Count)"
Write-Host 'Nenhum objeto foi removido do bucket Preview. Confira a vitrine antes de limpar órfãos.'
