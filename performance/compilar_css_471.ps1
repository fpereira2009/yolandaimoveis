# Executar a partir da raiz do repositório. Não modifica o index.html.
$ErrorActionPreference = 'Stop'
if (-not (Test-Path '.\performance\tailwind.config.cjs')) { throw 'Execute na raiz do projeto' }
if (-not (Test-Path '.\node_modules\.bin\tailwindcss.cmd')) {
  Write-Host 'Instalando Tailwind CSS 3.4.17 como dependência de desenvolvimento...'
  npm install --save-dev --save-exact tailwindcss@3.4.17
  if ($LASTEXITCODE -ne 0) { throw 'Falha ao instalar o Tailwind' }
}
New-Item -ItemType Directory -Force -Path '.\public\css' | Out-Null
& '.\node_modules\.bin\tailwindcss.cmd' `
   -i '.\performance\tailwind-input.css' `
   -c '.\performance\tailwind.config.cjs' `
   -o '.\public\css\tailwind.min.css' `
   --minify
if ($LASTEXITCODE -ne 0) { throw 'Falha no build CSS' }
if ((Get-Item '.\public\css\tailwind.min.css').Length -lt 10000) { throw 'CSS muito pequeno: revisão necessária' }
Write-Host 'CSS compilado. Verifique com: py tools/aplicar_performance_471.py --check'
