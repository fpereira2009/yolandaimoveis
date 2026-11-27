# Teste offline do auxiliar R2. Execute como arquivo, sem dot-sourcing.
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$operational = Join-Path $PSScriptRoot 'copiar_r2_prod_para_preview.ps1'
$expectedHash = '7A19B17BDE55ECC81FDB7A85437EE1B44460F5C52B43BF11BD5C622FCD19A39F'
$sourceBucket = 'yolanda-imoveis-prod'
$targetBucket = 'yolanda-imoveis-dev'
$temp = Join-Path ([IO.Path]::GetTempPath()) ('yolanda-r2-offline-' + [guid]::NewGuid().ToString('N'))
$manifest = Join-Path $temp 'manifest.csv'
$header = 'object_key,content_type,size_bytes,variant'
$main = 'properties/1/11111111-1111-4111-8111-111111111111.jpg'
$thumb = 'properties/1/11111111-1111-4111-8111-111111111111-thumb.webp'
# O auxiliar verifica assinaturas, sem decodificar uma imagem completa.
$jpeg = [byte[]]@(255,216,255,224,1,2,3)
$webp = [Text.Encoding]::ASCII.GetBytes('RIFF1234WEBPsynthetic')
$mainRow = "$main,image/jpeg,$($jpeg.Length),principal"
$thumbRow = "$thumb,image/webp,,miniatura"
$state = @{ Source = @{}; Target = @{}; Calls = [Collections.Generic.List[string]]::new(); Failure = '' }
$previousExit = Get-Variable -Name LASTEXITCODE -Scope Global -ErrorAction SilentlyContinue
$previousExitValue = if ($previousExit) { $previousExit.Value } else { $null }

function Invoke-YolandaOfflineWrangler {
    if ($args.Count -lt 8 -or $args[0] -cne 'wrangler' -or $args[1] -cne 'r2' -or
        $args[2] -cne 'object' -or $args[5] -cne '--remote' -or $args[6] -cne '--file') {
        throw 'Mock offline: interface proibida.'
    }
    $verb = [string]$args[3]
    $bucket, $key = ([string]$args[4]).Split('/', 2)
    if ($verb -cnotin @('get', 'put') -or
        ($verb -ceq 'get' -and ($args.Count -ne 8 -or $bucket -cnotin @($sourceBucket, $targetBucket))) -or
        ($verb -ceq 'put' -and ($args.Count -ne 10 -or $bucket -cne $targetBucket -or $args[8] -cne '--content-type'))) {
        throw 'Mock offline: operação ou bucket proibido.'
    }
    if ($key -cnotin @($main, $thumb)) { throw 'Mock offline: chave fora da fixture.' }

    $file = [IO.Path]::GetFullPath([string]$args[7])
    if ([IO.Path]::GetDirectoryName($file) -cne $temp -or
        [IO.Path]::GetFileName($file) -cnotmatch '^r2-(check-)?[0-9a-f]{32}\.bin\z') {
        throw 'Mock offline: arquivo fora da pasta isolada.'
    }
    $state.Calls.Add("$verb $bucket/$key")
    $global:LASTEXITCODE = 0
    if ($verb -ceq 'put') {
        $mime = if ($key -ceq $main) { 'image/jpeg' } else { 'image/webp' }
        if ($args[9] -cne $mime) { throw 'Mock offline: MIME inesperado no upload.' }
        if ($state.Failure -ceq 'upload') { $global:LASTEXITCODE = 20; return }
        $state.Target[$key] = [IO.File]::ReadAllBytes($file)
        if ($state.Failure -ceq 'hash') { $state.Target[$key][0] = 0 }
        return
    }
    $objects = if ($bucket -ceq $sourceBucket) { $state.Source } else { $state.Target }
    if (-not $objects.ContainsKey($key) -or ($bucket -ceq $targetBucket -and $state.Failure -ceq 'readback')) {
        $global:LASTEXITCODE = 19
        return
    }
    [IO.File]::WriteAllBytes($file, $objects[$key])
}

function Assert-MockInstalled {
    $command = Get-Alias -Name npx -ErrorAction Stop
    $implementation = Get-Command Invoke-YolandaOfflineWrangler -CommandType Function -ErrorAction Stop
    if ($command.Definition -cne $implementation.Name -or
        -not ($command.Options -band [Management.Automation.ScopedItemOptions]::Constant) -or
        $command.ResolvedCommand.ScriptBlock -ne $implementation.ScriptBlock) {
        throw 'Mock offline indisponível. Operação abortada.'
    }
}

function Reset-Case([string[]]$Rows) {
    $state.Source = @{}
    $state.Source[$main] = $jpeg
    $state.Source[$thumb] = $webp
    $state.Target = @{}
    $state.Calls.Clear()
    $state.Failure = ''
    [IO.File]::WriteAllLines($manifest, @($header) + $Rows)
}

function Assert-Fails([string]$Expected, [scriptblock]$Action) {
    try { & $Action }
    catch {
        if ($_.Exception.Message -notlike "*$Expected*") { throw }
        return
    }
    throw "O cenário deveria falhar com: $Expected"
}

function Invoke-Copy([switch]$Confirm) {
    Assert-MockInstalled
    & $operational -Manifest $manifest -PastaTemporaria $temp -ConfirmarCopiaPreview:$Confirm
}

function Assert-Calls([string[]]$Expected) {
    if (($state.Calls -join '|') -cne ($Expected -join '|')) {
        throw "Chamadas simuladas divergentes: $($state.Calls -join ', ')"
    }
    if (@(Get-ChildItem -LiteralPath $temp -Filter '*.bin').Count -ne 0) {
        throw 'O auxiliar deixou arquivos temporários.'
    }
}

# Mantém o arquivo bloqueado para escrita/substituição no Windows durante o teste.
$locked = [IO.File]::Open($operational, [IO.FileMode]::Open, [IO.FileAccess]::Read, [IO.FileShare]::Read)
try {
    if ((Get-FileHash -InputStream $locked -Algorithm SHA256).Hash -cne $expectedHash) {
        throw 'Script operacional diferente da revisão auditada. Revise a segurança antes de atualizar o hash.'
    }
    Set-Alias -Name npx -Value Invoke-YolandaOfflineWrangler -Scope Local -Option Constant -ErrorAction Stop
    Assert-MockInstalled
    [IO.Directory]::CreateDirectory($temp) | Out-Null

    $getMain = "get $sourceBucket/$main"
    $getThumb = "get $sourceBucket/$thumb"
    $putMain = "put $targetBucket/$main"
    $putThumb = "put $targetBucket/$thumb"
    $readMain = "get $targetBucket/$main"
    $readThumb = "get $targetBucket/$thumb"

    Reset-Case @($mainRow, $thumbRow)
    Assert-Fails '-ConfirmarCopiaPreview' { Invoke-Copy }
    Assert-Calls @()

    Reset-Case @($mainRow)
    [IO.File]::WriteAllLines($manifest, @('key,mime', $mainRow))
    Assert-Fails 'Formato de manifesto' { Invoke-Copy -Confirm }
    Assert-Calls @()

    Reset-Case @($mainRow, $thumbRow)
    Invoke-Copy -Confirm
    Assert-Calls @($getMain, $getThumb, $putMain, $readMain, $putThumb, $readThumb)
    foreach ($key in @($main, $thumb)) {
        if ([Convert]::ToBase64String($state.Target[$key]) -cne [Convert]::ToBase64String($state.Source[$key])) {
            throw 'A cópia simulada não preservou os bytes.'
        }
    }

    foreach ($case in @(
        @{ Rows = @($mainRow, $mainRow); Error = 'duplicidade'; Calls = @($getMain) },
        @{ Rows = @('../fora.jpg,image/jpeg,7,principal'); Error = 'Chave, variante'; Calls = @() },
        @{ Rows = @("$thumb,image/webp,7,principal"); Error = 'Chave, variante'; Calls = @() },
        @{ Rows = @("$main,image/webp,7,principal"); Error = 'com a chave R2'; Calls = @() },
        @{ Rows = @("$main,image/jpeg,,principal"); Error = 'no manifesto R2'; Calls = @() },
        @{ Rows = @("$main,image/jpeg,1,principal"); Error = 'Tamanho do objeto'; Calls = @($getMain) }
    )) {
        Reset-Case $case.Rows
        Assert-Fails $case.Error { Invoke-Copy -Confirm }
        Assert-Calls $case.Calls
    }

    foreach ($case in @(
        @{ Bytes = $jpeg; Error = 'com o MIME' },
        @{ Bytes = [byte[]]@(0,1,2); Error = 'sem assinatura' },
        @{ Bytes = [byte[]]::new(2097153); Error = 'Tamanho do objeto' }
    )) {
        Reset-Case @($mainRow, $thumbRow)
        $state.Source[$thumb] = $case.Bytes
        Assert-Fails $case.Error { Invoke-Copy -Confirm }
        Assert-Calls @($getMain, $getThumb)
    }

    Reset-Case @($mainRow, $thumbRow)
    $state.Source.Remove($thumb)
    Assert-Fails 'Objeto de origem ausente' { Invoke-Copy -Confirm }
    Assert-Calls @($getMain, $getThumb)

    Reset-Case @($mainRow, $thumbRow)
    $state.Failure = 'upload'
    Assert-Fails 'Falha no upload' { Invoke-Copy -Confirm }
    Assert-Calls @($getMain, $getThumb, $putMain)

    foreach ($failure in @('hash', 'readback')) {
        Reset-Case @($mainRow, $thumbRow)
        $state.Failure = $failure
        Assert-Fails 'SHA-256' { Invoke-Copy -Confirm }
        Assert-Calls @($getMain, $getThumb, $putMain, $readMain)
    }

    Reset-Case @($mainRow)
    Assert-MockInstalled
    foreach ($bucket in @($sourceBucket, 'outro-bucket')) {
        Assert-Fails 'bucket proibido' {
            & npx wrangler r2 object put "$bucket/$main" --remote --file $manifest --content-type image/jpeg
        }
    }
    Assert-Fails 'bucket proibido' {
        & npx wrangler r2 object delete "$targetBucket/$main" --remote --file $manifest
    }
    Assert-Calls @()
    Write-Host 'PASSOU: manifesto, JPEG/WebP, miniaturas, preflight, SHA-256, falhas e isolamento R2.'
}
finally {
    $locked.Dispose()
    if (Test-Path -LiteralPath $manifest -PathType Leaf) { Remove-Item -LiteralPath $manifest -Force }
    if (Test-Path -LiteralPath $temp -PathType Container) { [IO.Directory]::Delete($temp) }
    if ($previousExit) { $global:LASTEXITCODE = $previousExitValue }
    else { Remove-Variable -Name LASTEXITCODE -Scope Global -ErrorAction SilentlyContinue }
}
