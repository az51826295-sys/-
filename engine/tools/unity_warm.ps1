# 따뜻한 유니티 — 에디터를 켜 둔 채 새 버전을 스스로 검사한다(E2, 09-07). 죽으면 다시 켠다.
# 실행: powershell -ExecutionPolicy Bypass -File engine/tools/unity_warm.ps1   /  멈춤: data/unity_watch.stop
$root = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$vars = @{}; Get-Content (Join-Path $root ".env.local") | ForEach-Object { if ($_ -match '^\s*([A-Z0-9_]+)=(.*)$') { $vars[$matches[1]] = $matches[2].Trim() } }
$key = $vars["ROOKERY_KEY"]
if (-not $key) { $c = Invoke-RestMethod -Uri ($vars["NEXT_PUBLIC_SUPABASE_URL"] + "/rest/v1/companies?select=unity_key&limit=1") -Headers @{ apikey = $vars["SUPABASE_SECRET_KEY"]; Authorization = "Bearer " + $vars["SUPABASE_SECRET_KEY"] } -UserAgent "rookery-unity-warm"; $key = $c[0].unity_key }
$env:ROOKERY_KEY = $key
$dataDir = Join-Path $root "data"; New-Item -ItemType Directory -Force $dataDir | Out-Null
$stopFile = Join-Path $dataDir "unity_watch.stop"
while ($true) {
  if (Test-Path $stopFile) { Remove-Item $stopFile; Write-Host "멈춤 파일. 끝."; break }
  $log = Join-Path $dataDir ("unity_warm_{0}.log" -f (Get-Date -Format "MMdd_HHmm"))
  Write-Host ("{0} 유니티 켬(감시 모드) — 로그 {1}" -f (Get-Date -Format "HH:mm"), $log)
  $p = Start-Process -FilePath "C:\Program Files\Unity\Hub\Editor\6000.5.10f1\Editor\Unity.exe" -ArgumentList @("-batchmode", "-projectPath", "C:\Users\az518\RookeryFarm", "-executeMethod", "Rookery.RookeryHeadless.Watch", "-logFile", $log) -PassThru -Wait
  Write-Host ("{0} 유니티가 나갔다 (exit {1}) — 30초 뒤 다시" -f (Get-Date -Format "HH:mm"), $p.ExitCode)
  Start-Sleep -Seconds 30
}
