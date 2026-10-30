# Dot (dugeun-dot) in-app billing: flip the last switch, BILLING_OPEN=1 on dot-web.
#
#   powershell -ExecutionPolicy Bypass -File engine\tools\billing_open.ps1
#
# ASCII ONLY. 2026-10-30: the first version used Korean variable names and Windows
# PowerShell 5.1 read the file as ANSI, turning $후보 into $?꾨낫 -> ParserError.
#
# 2026-10-30 again: in the user's terminal `& 'C:\...\npm\railway.cmd'` said
# "is not recognized" even though the file is on disk, and the npx fallback printed
# nothing. So this version REPORTS what it can see before trying, and tries three
# ways, printing the exit code of each. Without that we were guessing.

Set-Location -LiteralPath 'C:\Users\az518\Desktop\ai-workforce'

Write-Host "=== what this shell can see ==="
Write-Host ("APPDATA      : " + $env:APPDATA)
$cmdPath = Join-Path $env:APPDATA 'npm\railway.cmd'
Write-Host ("railway.cmd  : " + (Test-Path -LiteralPath $cmdPath))
Write-Host ("railway cfg  : " + (Test-Path -LiteralPath (Join-Path $env:HOME '.railway\config.json')) + " / " + (Test-Path -LiteralPath (Join-Path $env:APPDATA 'railway\config.json')))
Write-Host ("node         : " + (Get-Command node -ErrorAction SilentlyContinue).Source)
Write-Host ""

function Try-Way($label, $block) {
  Write-Host "--- $label ---"
  try { & $block; Write-Host ("exit=" + $LASTEXITCODE) }
  catch { Write-Host ("threw: " + $_.Exception.Message) }
  Write-Host ""
}

Try-Way "1) cmd /c with full path" {
  cmd /c "`"$env:APPDATA\npm\railway.cmd`" variables --set BILLING_OPEN=1 --service dot-web"
}

Try-Way "2) node runs the CLI entry directly" {
  $entry = Join-Path $env:APPDATA 'npm\node_modules\@railway\cli\bin\railway.js'
  if (Test-Path -LiteralPath $entry) { & node $entry variables --set BILLING_OPEN=1 --service dot-web }
  else { Write-Host "no entry at $entry" }
}

Try-Way "3) npx" {
  & npx --yes @railway/cli variables --set BILLING_OPEN=1 --service dot-web
}

Write-Host "DONE. Paste everything above back to Claude."
