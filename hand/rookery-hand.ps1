<#
  로키 손 (rookery-hand) v1 — 이 기계를 재고, 로키의 판단대로 환경을 차린다 (160회차 2026-09-17).
  사장님: "로키가 노트북이나 폰의 사양을 판단하고 환경을 조성할 수 있어야 돼" · "godot·유니티·언리얼을 설치할 수 있어야 해, 노트북을 조종해서"
  그리고: "에이아이는 모든 우회방법을 알아, 보안 때문에 안 되는 거지. 우린 딱히 보안 없잖아." → 단추 없이, 판단대로 바로 깐다.

  하는 것:
    -Print          이 기계를 재서 화면에 보여 준다 (아무것도 안 바꾼다)
    -Post           재서 로키에 보낸다
    -Setup [-Job …] 재서 보내고, 로키에 "이 기계에 뭘 깔까" 를 묻고, 판단대로 깐다(지금은 Godot). 깐 뒤 다시 재서 보낸다.
    -Register       로그인할 때마다 -Post 가 저절로 돌게 등록한다 (사용자 권한 작업, 관리자 필요 없음)

  선(보안이 아니라 물리와 원칙):
    · 사용자 폴더(%USERPROFILE%\Tools) 밖에 안 쓴다. 승격(UAC)을 안 요구한다 — 뒤에서 못 누르는 창이다.
    · 계정 로그인이 필요한 것(Unreal 의 Epic 런처)은 사장님이 한 번 로그인해 두면 그 뒤를 한다.
#>
param(
  [switch]$Print, [switch]$Post, [switch]$Setup, [switch]$Register,
  [string]$Job = "",
  [string]$Do = "",
  [int]$MaxSteps = 40,
  [switch]$Watch,
  [int]$WatchMinutes = 120,
  [string]$Key = $env:ROOKERY_KEY,
  [string]$Site = "https://rookery-web-production.up.railway.app"
)
# 160회차: SilentlyContinue 는 Write-Error 까지 삼켜 첫 -Setup 이 11초 만에 말없이 죽었다. 오류는 Write-Output 으로 낸다.
$ErrorActionPreference = "SilentlyContinue"
# 160회차: TLS 를 1.2 로 강제했더니 "기본 연결이 닫혔습니다(송신 오류)" — v0 엔 없던 줄이고 시스템 기본(1.3 포함)이 맞다. 강제하지 않는다.
# v0 첫 판: 매개변수 이름을 $args 로 지었더니 인자가 안 넘어가 `node --version` 이 REPL 로 돌아 영원히 섰다.
function Ver($cmd, $a) { try { $o = & $cmd $a 2>$null | Select-Object -First 1; if ($o) { "$o".Trim() } else { $null } } catch { $null } }
$Tools = Join-Path $env:USERPROFILE "Tools"

# 160회차: Windows TLS 스택(Schannel)이 Railway 엣지와 핸드셰이크를 못 한다(SEC_E_INVALID_TOKEN) — PS 5.1·윈도 curl 둘 다.
# Node(OpenSSL)는 된다. 먼저 PS 로 보내 보고, 막히면 Node 가 있을 때 hand/http.js 로 보낸다. 둘 다 안 되면 그때 사람에게.
function Invoke-Rookery($method, $url, $bodyJson) {
  try {
    if ($method -eq "POST") {
      return Invoke-RestMethod -Uri $url -Method Post -ContentType "application/json; charset=utf-8" -Body ([Text.Encoding]::UTF8.GetBytes($bodyJson)) -Headers @{ "x-rookery-key" = $Key } -UserAgent "rookery-hand/1" -TimeoutSec 300 -ErrorAction Stop
    } else {
      return Invoke-RestMethod -Uri $url -Headers @{ "x-rookery-key" = $Key } -UserAgent "rookery-hand/1" -TimeoutSec 300 -ErrorAction Stop
    }
  } catch {
    $why = $_.Exception.Message
    $node = Get-Command node -ErrorAction SilentlyContinue
    $js = Join-Path $PSScriptRoot "http.js"
    if (-not $node -or -not (Test-Path $js)) { Write-Output "오류: 로키에 못 닿았다 - $why (Node 우회로도 없음)"; return $null }
    Write-Output "PS 전송 실패($($why.Substring(0, [math]::Min(60, $why.Length)))) - Node 로 우회"
    $bodyFile = $null
    if ($bodyJson) { $bodyFile = Join-Path $env:TEMP "rookery-hand-body.json"; [IO.File]::WriteAllText($bodyFile, $bodyJson, (New-Object Text.UTF8Encoding $false)) }
    $args2 = @($js, $method, $url, $Key); if ($bodyFile) { $args2 += $bodyFile }
    $out = & $node.Source @args2 2>&1
    $code = $LASTEXITCODE
    if ($bodyFile) { Remove-Item $bodyFile -Force -ErrorAction SilentlyContinue }
    if ($code -ne 0) { Write-Output "오류: Node 우회도 실패 - $out"; return $null }
    try { return ($out -join "") | ConvertFrom-Json } catch { Write-Output "오류: 응답이 JSON 이 아니다 - $out"; return $null }
  }
}

function Measure-Machine {
  $os  = Get-CimInstance Win32_OperatingSystem
  $cpu = Get-CimInstance Win32_Processor | Select-Object -First 1
  $gpu = Get-CimInstance Win32_VideoController | Where-Object { $_.Name } | ForEach-Object { @{ name = $_.Name; vramMB = [int]($_.AdapterRAM / 1MB); width = $_.CurrentHorizontalResolution; height = $_.CurrentVerticalResolution } }
  $disk = Get-CimInstance Win32_LogicalDisk -Filter "DeviceID='C:'"
  $battery = Get-CimInstance Win32_Battery
  $chassis = (Get-CimInstance Win32_SystemEnclosure).ChassisTypes
  $laptop = ($null -ne $battery) -or (@($chassis | Where-Object { $_ -in 8,9,10,14,30,31,32 }).Count -gt 0)

  # v0 둘째 판: 없는 경로에 -Recurse 를 주니 PS 5.1 이 현재 폴더를 통째로 뒤져 100초 넘게 섰다. 있는 자리만, 재귀 없이.
  $unityDirs = @("$env:USERPROFILE\UnityEditors", "C:\Program Files\Unity\Hub\Editor") | Where-Object { Test-Path $_ }
  $unity = @($unityDirs | ForEach-Object { Get-ChildItem $_ -Directory | ForEach-Object { $_.Name } })
  $unityHub = (Test-Path "$env:LOCALAPPDATA\Programs\Unity Hub\Unity Hub.exe") -or (Test-Path "C:\Program Files\Unity Hub\Unity Hub.exe")
  # Godot: 손이 까는 자리(~\Tools\Godot\<판>\*.exe)와 흔한 자리
  $godot = @()
  if (Test-Path "$Tools\Godot") { $godot += @(Get-ChildItem "$Tools\Godot" -Directory | ForEach-Object { $d = $_; Get-ChildItem $d.FullName -Filter "*.exe" | ForEach-Object { $_.Name } }) }
  foreach ($d in @("$env:USERPROFILE\Godot", "$env:LOCALAPPDATA\Programs\Godot")) { if (Test-Path $d) { $godot += @(Get-ChildItem $d -Filter "*.exe" | ForEach-Object { $_.Name }) } }
  $godotOnPath = Ver "godot" "--version"
  $unreal = @(if (Test-Path "C:\Program Files\Epic Games") { Get-ChildItem "C:\Program Files\Epic Games" -Directory -Filter "UE_*" | ForEach-Object { $_.Name } })
  $epic = Test-Path "C:\Program Files (x86)\Epic Games\Launcher\Portal\Binaries\Win64\EpicGamesLauncher.exe"

  return [ordered]@{
    at        = (Get-Date).ToUniversalTime().ToString("o")
    host      = $env:COMPUTERNAME
    user      = $env:USERNAME
    kind      = $(if ($laptop) { "laptop" } else { "desktop" })
    os        = @{ name = $os.Caption; version = $os.Version; arch = $env:PROCESSOR_ARCHITECTURE }
    cpu       = @{ name = $cpu.Name; cores = $cpu.NumberOfCores; threads = $cpu.NumberOfLogicalProcessors }
    ramGB     = [math]::Round($os.TotalVisibleMemorySize / 1MB, 1)
    ramFreeGB = [math]::Round($os.FreePhysicalMemory / 1MB, 1)
    gpu       = @($gpu)
    diskFreeGB = [math]::Round($disk.FreeSpace / 1GB, 1)
    diskGB    = [math]::Round($disk.Size / 1GB, 1)
    engines   = @{ unity = @($unity); unityHub = [bool]$unityHub; godot = @($godot); godotOnPath = $godotOnPath; unreal = @($unreal); epicLauncher = [bool]$epic }
    tools     = @{ node = (Ver "node" "--version"); python = (Ver "python" "--version"); git = (Ver "git" "--version"); ffmpeg = $(if (Ver "ffmpeg" "-version") { "있음" } else { $null }); dotnet = (Ver "dotnet" "--version") }
    admin     = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
    hand      = "v1"
  }
}

function Send-Spec($spec) {
  if (-not $Key) { Write-Output "오류: 회사 열쇠가 없다(-Key 또는 ROOKERY_KEY)"; exit 1 }
  $json = $spec | ConvertTo-Json -Depth 5 -Compress
  $r = Invoke-Rookery "POST" "$Site/api/hand/spec" $json
  if (-not $r -or -not $r.ok) { Write-Output "오류: 로키가 사양을 안 받았다"; exit 1 }
  Write-Output "보냄: $($r.host) -> $($r.path)"
}

# Godot: 공식 zip 하나. 설치기가 없어서 관리자가 필요 없다. 사용자 폴더 ~\Tools\Godot\<판>\ 에 푼다.
function Install-Godot($version) {
  $dir = Join-Path $Tools "Godot\$version"
  $exe = "Godot_v$version-stable_win64.exe"
  if (Test-Path (Join-Path $dir $exe)) { Write-Output "이미 있음: $dir\$exe"; return (Join-Path $dir $exe) }
  New-Item -ItemType Directory -Force -Path $dir | Out-Null
  $zip = Join-Path $env:TEMP "$exe.zip"
  $url = "https://github.com/godotengine/godot/releases/download/$version-stable/$exe.zip"
  Write-Output "내려받기: $url"
  try { Invoke-WebRequest -Uri $url -OutFile $zip -UseBasicParsing -TimeoutSec 600 } catch { Write-Output "오류: 못 내려받음: $($_.Exception.Message)"; return $null }
  Write-Output ("풀기: " + [math]::Round((Get-Item $zip).Length / 1MB, 1) + "MB -> $dir")
  Expand-Archive -Path $zip -DestinationPath $dir -Force
  Remove-Item $zip -Force
  $path = Join-Path $dir $exe
  if (-not (Test-Path $path)) { Write-Output "오류: 풀었는데 $exe 가 없다"; return $null }
  # 돌아가는지 — 판 번호를 찍고 끝나는지 본다(창 안 띄움).
  $v = & $path --version 2>$null | Select-Object -First 1
  Write-Output "확인: $exe --version -> $v"
  return $path
}


# ───────────────────────── 손 v2: 화면을 보고 대신한다 (162회차) ─────────────────────────
# 사장님 "실시간으로 화면 봐 가지고 대신해 주는 기능" → "시작해".
# 걸음: 화면을 찍어(1280 폭으로 줄여) 로키 눈에 보낸다 → 눈이 다음 한 걸음을 정한다 → 손이 누르거나 친다 → 1.5초 → 다시.
# 난간(손 쪽): 걸음 상한($MaxSteps) · 사장님이 마우스를 잡으면 놓는다 · 눈이 '사람만 할 수 있다' 하면 멈춘다.
function Init-Hand2 {
  Add-Type -AssemblyName System.Drawing
  Add-Type -AssemblyName System.Windows.Forms
  if (-not ("RookeryHand.Native" -as [type])) {
    Add-Type -Namespace RookeryHand -Name Native -MemberDefinition @"
[DllImport("user32.dll")] public static extern bool SetCursorPos(int x, int y);
[DllImport("user32.dll")] public static extern void mouse_event(uint f, uint x, uint y, uint d, System.UIntPtr e);
[DllImport("user32.dll")] public static extern bool SetProcessDPIAware();
[DllImport("user32.dll")] public static extern bool GetCursorPos(out System.Drawing.Point p);
"@
  }
  [RookeryHand.Native]::SetProcessDPIAware() | Out-Null
}

function Grab-Screen {
  $b = [System.Windows.Forms.Screen]::PrimaryScreen.Bounds
  $bmp = New-Object System.Drawing.Bitmap $b.Width, $b.Height
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.CopyFromScreen($b.X, $b.Y, 0, 0, $bmp.Size); $g.Dispose()
  # 눈에는 1280 폭으로 줄여 보낸다(토큰 절약). 좌표는 되돌릴 때 곱한다.
  $scale = 1280 / $b.Width
  $w = 1280; $h = [int]($b.Height * $scale)
  $small = New-Object System.Drawing.Bitmap $w, $h
  $g2 = [System.Drawing.Graphics]::FromImage($small); $g2.InterpolationMode = "HighQualityBicubic"
  $g2.DrawImage($bmp, 0, 0, $w, $h); $g2.Dispose(); $bmp.Dispose()
  $ms = New-Object System.IO.MemoryStream
  $small.Save($ms, [System.Drawing.Imaging.ImageFormat]::Png); $small.Dispose()
  return @{ png = [Convert]::ToBase64String($ms.ToArray()); width = $w; height = $h; scale = $scale; screenW = $b.Width; screenH = $b.Height }
}

function Get-Cursor { $p = New-Object System.Drawing.Point; [RookeryHand.Native]::GetCursorPos([ref]$p) | Out-Null; return $p }

function Do-Click($x, $y, $double) {
  [RookeryHand.Native]::SetCursorPos([int]$x, [int]$y) | Out-Null
  Start-Sleep -Milliseconds 120
  $n = $(if ($double) { 2 } else { 1 })
  for ($i = 0; $i -lt $n; $i++) {
    [RookeryHand.Native]::mouse_event(0x0002, 0, 0, 0, [UIntPtr]::Zero); Start-Sleep -Milliseconds 60
    [RookeryHand.Native]::mouse_event(0x0004, 0, 0, 0, [UIntPtr]::Zero); Start-Sleep -Milliseconds 90
  }
}

# SendKeys 는 + ^ % ~ ( ) { } 를 특별하게 읽는다 — 글자로 치려면 중괄호로 싼다.
function Do-Type($text) {
  $ascii = ($text.ToCharArray() | Where-Object { [int]$_ -gt 127 }).Count -eq 0
  if ($ascii) {
    $esc = ($text.ToCharArray() | ForEach-Object { if ("+^%~(){}[]".Contains([string]$_)) { "{" + $_ + "}" } else { [string]$_ } }) -join ""
    [System.Windows.Forms.SendKeys]::SendWait($esc)
  } else {
    # 한글 같은 글은 SendKeys 가 못 친다 — 클립보드에 넣고 붙여 넣는다(STA 필요: -STA 로 띄운다).
    [System.Windows.Forms.Clipboard]::SetText($text)
    Start-Sleep -Milliseconds 80
    [System.Windows.Forms.SendKeys]::SendWait("^v")
  }
}

function Do-Key($name) {
  $k = $name.ToLower().Trim()
  $map = @{ enter = "{ENTER}"; esc = "{ESC}"; escape = "{ESC}"; tab = "{TAB}"; space = " "; backspace = "{BACKSPACE}"; delete = "{DELETE}"; up = "{UP}"; down = "{DOWN}"; left = "{LEFT}"; right = "{RIGHT}"; home = "{HOME}"; end = "{END}"; win = "^{ESC}"; f5 = "{F5}" }
  if ($map.ContainsKey($k)) { [System.Windows.Forms.SendKeys]::SendWait($map[$k]); return }
  # ctrl+s · alt+f4 · shift+tab 같은 조합
  $parts = $k -split "\+"
  $mods = ""; $last = $parts[-1]
  foreach ($m in $parts[0..($parts.Count - 2)]) { switch ($m) { "ctrl" { $mods += "^" } "alt" { $mods += "%" } "shift" { $mods += "+" } } }
  $key = $(if ($map.ContainsKey($last)) { $map[$last] } elseif ($last.Length -eq 1) { $last } else { "{" + $last.ToUpper() + "}" })
  [System.Windows.Forms.SendKeys]::SendWait($mods + $key)
}

if ($Do) {
  if (-not $Key) { Write-Output "오류: 회사 열쇠가 없다(-Key 또는 ROOKERY_KEY)"; exit 1 }
  Init-Hand2
  $log = Join-Path $env:TEMP "rookery-hand-do.log"
  Add-Content -Path $log -Value ("`n=== " + (Get-Date).ToString("s") + " 목표: " + $Do)
  Write-Output "목표: $Do (걸음 상한 $MaxSteps)"
  $history = @()
  $lastCursor = $null
  $stuck = 0
  for ($i = 1; $i -le $MaxSteps; $i++) {
    # 사장님이 마우스를 잡았나 — 우리가 놓은 자리에서 40px 넘게 움직였으면 사람이다. 손을 놓는다.
    if ($lastCursor) { $c = Get-Cursor; if ([math]::Abs($c.X - $lastCursor.X) -gt 40 -or [math]::Abs($c.Y - $lastCursor.Y) -gt 40) { Write-Output "멈춤: 사장님이 마우스를 잡았다"; break } }
    $shot = Grab-Screen
    $body = @{ goal = $Do; png = $shot.png; width = $shot.width; height = $shot.height; history = @($history) } | ConvertTo-Json -Depth 4 -Compress
    $r = Invoke-Rookery "POST" "$Site/api/hand/step" $body
    if (-not $r -or -not $r.ok) { Write-Output "오류: 눈이 답하지 않았다"; break }
    $st = $r.step
    $line = "[$i] $($r.line)"
    Write-Output $line; Add-Content -Path $log -Value $line
    $history += "$($st.see) → $($st.say) [$($st.action.kind)]"
    if ($st.done) { Write-Output "끝: 목표가 화면에 이뤄졌다 ($i 걸음)"; break }
    if ($st.needsHuman) { Write-Output "멈춤: 사람만 할 수 있는 것이 앞에 있다 — $($st.see)"; break }
    switch ($st.action.kind) {
      "click"  { Do-Click ($st.action.x / $shot.scale) ($st.action.y / $shot.scale) $false }
      "double" { Do-Click ($st.action.x / $shot.scale) ($st.action.y / $shot.scale) $true }
      "type"   { Do-Type $st.action.text }
      "key"    { Do-Key $st.action.text }
      "wait"   { $stuck++ }
    }
    if ($st.action.kind -ne "wait") { $stuck = 0 }
    if ($stuck -ge 5) { Write-Output "멈춤: 다섯 걸음째 기다리기만 한다 — 길을 못 찾는다"; break }
    Start-Sleep -Milliseconds 1500
    $lastCursor = Get-Cursor
  }
  Write-Output "기록: $log"
  exit 0
}

# ───────────────────────── 같이 보기 (163회차): 3초마다 화면 한 장을 로키에 보낸다 ─────────────────────────
# 사장님 "로키가 같이 보는 거, 같이 화면에 띄우는 거 해줄 수 있어?" — 미리보기에 이 화면이 뜨고, 로키가 답할 때 이 화면을 본다.
# 아무것도 누르지 않는다(보기만). 1024 폭 JPEG(품질 60) ≈ 100~200KB. 마지막 한 장만 저장되고 덮어써진다(영상 저장 아님).
function Grab-Jpeg {
  $b = [System.Windows.Forms.Screen]::PrimaryScreen.Bounds
  $bmp = New-Object System.Drawing.Bitmap $b.Width, $b.Height
  $g = [System.Drawing.Graphics]::FromImage($bmp); $g.CopyFromScreen($b.X, $b.Y, 0, 0, $bmp.Size); $g.Dispose()
  $w = 1024; $h = [int]($b.Height * (1024 / $b.Width))
  $small = New-Object System.Drawing.Bitmap $w, $h
  $g2 = [System.Drawing.Graphics]::FromImage($small); $g2.InterpolationMode = "HighQualityBicubic"; $g2.DrawImage($bmp, 0, 0, $w, $h); $g2.Dispose(); $bmp.Dispose()
  $codec = [System.Drawing.Imaging.ImageCodecInfo]::GetImageEncoders() | Where-Object { $_.MimeType -eq "image/jpeg" } | Select-Object -First 1
  $ep = New-Object System.Drawing.Imaging.EncoderParameters 1
  $ep.Param[0] = New-Object System.Drawing.Imaging.EncoderParameter ([System.Drawing.Imaging.Encoder]::Quality), 60L
  $ms = New-Object System.IO.MemoryStream
  $small.Save($ms, $codec, $ep); $small.Dispose()
  return [Convert]::ToBase64String($ms.ToArray())
}

if ($Watch) {
  if (-not $Key) { Write-Output "오류: 회사 열쇠가 없다(-Key 또는 ROOKERY_KEY)"; exit 1 }
  Init-Hand2
  $until = (Get-Date).AddMinutes($WatchMinutes)
  Write-Output "같이 보기 시작: $env:COMPUTERNAME 화면을 3초마다 로키에 보낸다 ($WatchMinutes 분 뒤 스스로 멈춤, Ctrl+C 로 언제든)"
  $n = 0; $fail = 0
  while ((Get-Date) -lt $until) {
    $jpg = Grab-Jpeg
    $body = @{ host = $env:COMPUTERNAME; jpg = $jpg } | ConvertTo-Json -Compress
    $r = Invoke-Rookery "POST" "$Site/api/hand/screen" $body
    if ($r -and $r.ok) { $n++; $fail = 0; if ($n % 20 -eq 1) { Write-Output ("보내는 중… " + $n + "장 " + (Get-Date).ToString("HH:mm:ss")) } }
    else { $fail++; if ($fail -ge 5) { Write-Output "멈춤: 다섯 번 연속 못 보냈다"; break } }
    Start-Sleep -Milliseconds 3000
  }
  Write-Output "같이 보기 끝: $n 장"
  exit 0
}

if ($Register) {
  $me = $MyInvocation.MyCommand.Path
  $cmd = "powershell.exe -NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File `"$me`" -Post -Key $Key"
  # 사용자 권한 작업이라 관리자가 필요 없다. 로그인할 때 + 하루 두 번.
  schtasks /Create /F /SC ONLOGON /TN "RookeryHand" /TR $cmd /RL LIMITED | Out-Null
  schtasks /Create /F /SC HOURLY /MO 12 /TN "RookeryHandRefresh" /TR $cmd /RL LIMITED | Out-Null
  Write-Output "등록됨: RookeryHand(로그인 시) · RookeryHandRefresh(12시간마다)"
  exit 0
}

$spec = Measure-Machine
if ($Print -or (-not $Post -and -not $Setup)) { $spec | ConvertTo-Json -Depth 5 }
if ($Post -or $Setup) { Send-Spec $spec }

if ($Setup) {
  $q = "$Site/api/hand/plan?host=$([uri]::EscapeDataString($spec.host))"
  if ($Job) { $q += "&job=$([uri]::EscapeDataString($Job))" }
  Write-Output "로키에 묻는 중: 이 기계에 뭘 깔까 …"
  $plan = Invoke-Rookery "GET" $q $null
  if (-not $plan -or -not $plan.ok) { Write-Output "오류: 판단을 못 받았다"; exit 1 }
  Write-Output ("판단(" + $plan.model + "):")
  $plan.lines | ForEach-Object { Write-Output "  $_" }
  $done = @()
  foreach ($a in @($plan.actions)) {
    switch ($a.engine) {
      "godot"  { $p = Install-Godot $a.version; if ($p) { $done += "godot $($a.version)" } }
      default  { Write-Output "아직 못 까는 것: $($a.engine) $($a.version) — 다음 판" }
    }
  }
  if ($done.Count -gt 0) {
    Write-Output ("깔았다: " + ($done -join ", ") + " — 다시 재서 보낸다")
    Send-Spec (Measure-Machine)
  } else { Write-Output "깐 것 없음" }
}
