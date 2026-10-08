param([Parameter(ValueFromRemainingArguments=$true)][string[]]$CommandArgs)
$ErrorActionPreference = 'Stop'
$taskRoot = Split-Path -Parent $PSScriptRoot
$taskPortable = Join-Path $taskRoot '.tools\msvc'
if (Test-Path -LiteralPath $taskPortable) {
    $taskVc = Get-ChildItem -LiteralPath (Join-Path $taskPortable 'VC\Tools\MSVC') -Directory | Sort-Object Name -Descending | Select-Object -First 1
    $taskSdk = Get-ChildItem -LiteralPath (Join-Path $taskPortable 'Windows Kits\10\Lib') -Directory | Sort-Object Name -Descending | Select-Object -First 1
    $taskSdkRoot = Join-Path $taskPortable 'Windows Kits\10'
    $env:PATH = "$($taskVc.FullName)\bin\Hostx64\x64;$taskSdkRoot\bin\$($taskSdk.Name)\x64;$env:PATH"
    $env:INCLUDE = "$($taskVc.FullName)\include;$taskSdkRoot\Include\$($taskSdk.Name)\ucrt;$taskSdkRoot\Include\$($taskSdk.Name)\shared;$taskSdkRoot\Include\$($taskSdk.Name)\um;$taskSdkRoot\Include\$($taskSdk.Name)\winrt"
    $env:LIB = "$($taskVc.FullName)\lib\x64;$taskSdkRoot\Lib\$($taskSdk.Name)\ucrt\x64;$taskSdkRoot\Lib\$($taskSdk.Name)\um\x64"
    $env:VCToolsInstallDir = "$($taskVc.FullName)\"
    $env:WindowsSdkDir = "$taskSdkRoot\"
    $env:WindowsSDKVersion = "$($taskSdk.Name)\"
    $env:VSCMD_ARG_TGT_ARCH = 'x64'
    $env:CC = 'cl.exe'
}
Set-Location -LiteralPath $taskRoot
if ($CommandArgs.Count -gt 0) {
    $taskProgram = $CommandArgs[0]
    $taskArgs = if ($CommandArgs.Count -gt 1) {$CommandArgs[1..($CommandArgs.Count-1)]} else {@()}
    & $taskProgram @taskArgs
    exit $LASTEXITCODE
}
