# 유니티 감시자 — 새 게임 판이 돌아오면 사람 손 없이 검사를 돌린다.
# 실행: powershell -ExecutionPolicy Bypass -File engine/tools/unity_watch.ps1
# 멈춤: 창을 닫거나 data/unity_watch.stop 파일을 만든다.
#
# 효율 회차(09-06 22:10): Dev 판 뒤 유니티 검사를 내가 손으로 걸어 판마다 몇 분씩 샜다.
# 1분마다 /api/unity/latest 를 묻고, 아직 검사 안 한 새 판이면 ImportBuildTest 를 돌린다.
# 한 번에 하나만(유니티는 프로젝트를 한 프로세스만 연다).

$ErrorActionPreference = "Continue"
$root = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$envFile = Join-Path $root ".env.local"
$vars = @{}
Get-Content $envFile | ForEach-Object { if ($_ -match '^\s*([A-Z0-9_]+)=(.*)$') { $vars[$matches[1]] = $matches[2].Trim() } }
$url = if ($vars["ROOKERY_URL"]) { $vars["ROOKERY_URL"] } else { "https://rookery-web-production.up.railway.app" }
$sb = $vars["NEXT_PUBLIC_SUPABASE_URL"]; $sk = $vars["SUPABASE_SECRET_KEY"]
# Supabase 는 브라우저 UA 로 온 비밀키 호출을 거절한다 — PowerShell 의 기본 UA 가 브라우저처럼 보인다(23:50).
$key = $vars["ROOKERY_KEY"]
if (-not $key) {
  $company = Invoke-RestMethod -Uri "$sb/rest/v1/companies?select=unity_key&limit=1" -Headers @{ apikey = $sk; Authorization = "Bearer $sk" } -UserAgent "rookery-unity-watch"
  $key = $company[0].unity_key
}
$unity = "C:\Program Files\Unity\Hub\Editor\6000.5.10f1\Editor\Unity.exe"
$project = "C:\Users\az518\RookeryFarm"
$dataDir = Join-Path $root "data"; New-Item -ItemType Directory -Force $dataDir | Out-Null
$stateFile = Join-Path $dataDir "unity_watch.last"
$stopFile = Join-Path $dataDir "unity_watch.stop"
$last = if (Test-Path $stateFile) { Get-Content $stateFile -Raw } else { "" }
$env:ROOKERY_KEY = $key
Write-Host ("{0} 감시 시작 — 마지막으로 검사한 판: {1}" -f (Get-Date -Format "HH:mm"), $last.Trim())

while ($true) {
  if (Test-Path $stopFile) { Remove-Item $stopFile; Write-Host "멈춤 파일을 봤다. 끝."; break }
  try {
    $latest = Invoke-RestMethod -Uri "$url/api/unity/latest" -Headers @{ "x-rookery-key" = $key } -UserAgent "rookery-unity-watch" -TimeoutSec 30
    if ($latest.id -and $latest.id -ne $last.Trim() -and -not $latest.checked) {
      $stamp = Get-Date -Format "HHmm"
      $log = Join-Path $dataDir ("unity_watch_{0}.log" -f $stamp)
      Write-Host ("{0} 새 판 {1} ({2}) — 검사 시작, 로그 {3}" -f (Get-Date -Format "HH:mm"), $latest.id.Substring(0,8), $latest.title, $log)
      $p = Start-Process -FilePath $unity -ArgumentList @("-batchmode", "-projectPath", $project, "-executeMethod", "Rookery.RookeryHeadless.ImportBuildTest", "-logFile", $log) -PassThru -Wait
      Write-Host ("{0} 끝 (exit {1})" -f (Get-Date -Format "HH:mm"), $p.ExitCode)
      $last = $latest.id; Set-Content -Path $stateFile -Value $last -Encoding ascii
    }
  } catch {
    Write-Host ("{0} 묻기 실패: {1}" -f (Get-Date -Format "HH:mm"), $_.Exception.Message)
  }
  Start-Sleep -Seconds 60
}
