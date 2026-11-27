# Copia objetos atuais do R2 de produção para Preview, sem excluir mídia.
param([Parameter(Mandatory=$true)][string]$Manifest,
      [Parameter(Mandatory=$true)][string]$PastaTemporaria,
      [switch]$ConfirmarCopiaPreview)

$ErrorActionPreference = 'Stop'
if (-not $ConfirmarCopiaPreview) { throw 'Execute somente com -ConfirmarCopiaPreview.' }
if (-not (Test-Path -LiteralPath $Manifest -PathType Leaf)) { throw 'Manifesto CSV não encontrado' }

function Get-ImageMime([string]$Path) {
    $reader = [IO.BinaryReader]::new([IO.File]::OpenRead($Path))
    try {
        $header = $reader.ReadBytes(12)
        if ($header.Length -ge 3 -and $header[0] -eq 255 -and $header[1] -eq 216 -and $header[2] -eq 255) {
            return 'image/jpeg'
        }
        if ($header.Length -eq 12 -and
            [Text.Encoding]::ASCII.GetString($header, 0, 4) -ceq 'RIFF' -and
            [Text.Encoding]::ASCII.GetString($header, 8, 4) -ceq 'WEBP') {
            return 'image/webp'
        }
    } finally {
        $reader.Dispose()
    }
    throw 'Conteúdo R2 sem assinatura JPEG ou WebP.'
}

$sourceBucket = 'yolanda-imoveis-prod'
$targetBucket = 'yolanda-imoveis-dev'
$items = @(Import-Csv -LiteralPath $Manifest)
if ((Get-Content -LiteralPath $Manifest -TotalCount 1) -cne 'object_key,content_type,size_bytes,variant') {
    throw 'Formato de manifesto R2 inválido.'
}
$keys = [Collections.Generic.HashSet[string]]::new([StringComparer]::Ordinal)
$files = [Collections.Generic.List[string]]::new()
$validated = [Collections.Generic.List[object]]::new()
New-Item -ItemType Directory -Force -Path $PastaTemporaria | Out-Null
try {
    foreach ($item in $items) {
        $key = [string]$item.object_key
        $variant = [string]$item.variant
        $mime = [string]$item.content_type
        if ($key -cnotmatch '^properties/[1-9][0-9]*/[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}(-thumb)?\.(webp|jpg)\z' -or
            $variant -cnotin @('principal', 'miniatura') -or
            (($variant -ceq 'miniatura') -ne ($key -cmatch '-thumb\.(webp|jpg)$')) -or
            -not $keys.Add($key)) {
            throw 'Chave, variante ou duplicidade inválida no manifesto R2.'
        }
        $expectedMime = if ($key.EndsWith('.webp')) { 'image/webp' } else { 'image/jpeg' }
        if ($mime -cne $expectedMime) { throw 'MIME incompatível com a chave R2.' }
        $limit = if ($variant -ceq 'miniatura') { 2097152 } else { 6291456 }
        $expectedSize = 0L
        $hasSize = -not [string]::IsNullOrEmpty($item.size_bytes)
        if (($variant -ceq 'principal' -and -not $hasSize) -or
            ($hasSize -and (-not [long]::TryParse($item.size_bytes, [ref]$expectedSize) -or
                            $expectedSize -le 0 -or $expectedSize -gt $limit))) {
            throw 'Tamanho inválido no manifesto R2.'
        }
        $local = Join-Path $PastaTemporaria ('r2-' + [guid]::NewGuid().ToString('N') + '.bin')
        $files.Add($local)
        & npx wrangler r2 object get ("$sourceBucket/$key") --remote --file $local
        if ($LASTEXITCODE -ne 0) { throw 'Objeto de origem ausente ou download inválido.' }
        $actualSize = (Get-Item -LiteralPath $local).Length
        if ($actualSize -le 0 -or $actualSize -gt $limit -or ($hasSize -and $actualSize -ne $expectedSize)) {
            throw 'Tamanho do objeto R2 de origem incompatível.'
        }
        if ((Get-ImageMime $local) -cne $mime) { throw 'Conteúdo do objeto R2 incompatível com o MIME.' }
        $validated.Add([pscustomobject]@{
            Key = $key; Mime = $mime; File = $local
            Hash = (Get-FileHash -LiteralPath $local -Algorithm SHA256).Hash
        })
    }

    foreach ($item in $validated) {
        $key = $item.Key
        & npx wrangler r2 object put ("$targetBucket/$key") --remote --file $item.File --content-type $item.Mime
        if ($LASTEXITCODE -ne 0) { throw 'Falha no upload para Preview.' }
        $check = Join-Path $PastaTemporaria ('r2-check-' + [guid]::NewGuid().ToString('N') + '.bin')
        $files.Add($check)
        & npx wrangler r2 object get ("$targetBucket/$key") --remote --file $check
        if ($LASTEXITCODE -ne 0 -or (Get-FileHash -LiteralPath $check -Algorithm SHA256).Hash -ne $item.Hash) {
            throw 'Falha na verificação SHA-256 em Preview. Não aplique o SQL D1.'
        }
    }
} finally {
    foreach ($file in $files) {
        if (Test-Path -LiteralPath $file -PathType Leaf) { Remove-Item -LiteralPath $file -Force }
    }
}
Write-Host "Objetos copiados e verificados em Preview: $($validated.Count) / $($items.Count)"
