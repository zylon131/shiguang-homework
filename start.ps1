param([switch]$Dev)
$ErrorActionPreference = 'Stop'
Set-Location -LiteralPath $PSScriptRoot
$appNode = $null
$systemNode = (Get-Command node -ErrorAction SilentlyContinue).Source
$runtimeCandidates = @($systemNode, "$env:USERPROFILE\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe")
foreach ($candidate in $runtimeCandidates) {
    if ($candidate -and (Test-Path -LiteralPath $candidate)) {
        $version = & $candidate --version
        if ([int]($version.TrimStart('v').Split('.')[0]) -ge 24) { $appNode = $candidate; break }
    }
}
if (-not $appNode) { throw 'Please install Node.js 24 LTS or newer, then run this script again.' }
$env:PATH = (Split-Path -Parent $appNode) + ';' + $env:PATH
$npmCommand = (Get-Command npm.cmd -ErrorAction Stop).Source
$npmCli = Join-Path (Split-Path -Parent $npmCommand) 'node_modules\npm\bin\npm-cli.js'
if (-not (Test-Path -LiteralPath 'node_modules')) {
    & $appNode $npmCli ci
    if ($LASTEXITCODE -ne 0) { throw 'Dependency installation failed.' }
}
if ($Dev) {
    & $appNode $npmCli run dev
} else {
    & $appNode $npmCli run build
    if ($LASTEXITCODE -ne 0) { throw 'Build failed.' }
    Write-Host 'Open http://localhost:8787 . Keep this terminal running. Ctrl+C stops the service.'
    & $appNode 'server/index.js'
}
