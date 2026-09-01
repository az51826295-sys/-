# 아무것도 없는 윈도우 기계에 로키가 일할 환경을 만든다.
#
# 목표는 "사람 손 0회" 가 아니다. **사람 손이 정확히 몇 번이고 그게 무엇인지
# 적혀 있는 것**이다. 0회라고 말해 놓고 중간에 로그인 창이 뜨면, 무인으로 두고
# 나간 사람은 아침에 아무것도 안 된 것을 본다.
#
#   powershell -ExecutionPolicy Bypass -File tools\bootstrap.ps1            # 세기만 한다
#   powershell -ExecutionPolicy Bypass -File tools\bootstrap.ps1 -Install   # 할 수 있는 것을 한다
#
# 파워셸로 쓴 이유: 새 윈도우에는 파이썬이 없다. 파이썬을 깔 스크립트가
# 파이썬으로 되어 있으면 첫 줄에서 막힌다.

param(
    [switch]$Install,
    [string]$UnityVersion = "6000.0.82f1",
    [string]$GenProject = "$env:USERPROFILE\RookeryGen"
)

$ErrorActionPreference = "Continue"
$Hub = "C:\Program Files\Unity Hub\Unity Hub.exe"

# 에디터 설치는 **관리자 권한이 필요하다.** 아니면 Hub 가 UAC 창을 띄우고, 창 없이
# 돌린 경우 아무도 못 눌러서 시간이 지나 죽는다 — 실제로 그렇게 한 판을 잃었다.
# 그때 출력을 `Out-Null` 로 버리고 있어서 **이유도 안 남았다.**
$IsAdmin = ([Security.Principal.WindowsPrincipal] `
    [Security.Principal.WindowsIdentity]::GetCurrent() `
).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)

# 사람 손이 필요한 것을 모은다. 마지막에 번호를 붙여 한 번에 보여 준다 —
# 중간중간 흘리면 스크롤에 묻히고, 묻히면 안 한 채로 무인 운영에 들어간다.
$HumanHands = New-Object System.Collections.ArrayList
# 로키가 -Install 로 할 수 있는 것. 사람 손과 섞으면 숫자가 거짓말이 된다.
$RookeryHands = New-Object System.Collections.ArrayList

function Step($name, $ok, $detail) {
    if ($ok) { $mark = "  [됨]  " } else { $mark = "  [없음]" }
    Write-Host "$mark $name  $detail"
}

function Need($what, $why) {
    [void]$HumanHands.Add(@{ what = $what; why = $why })
}

function Mine($what, $why) {
    [void]$RookeryHands.Add(@{ what = $what; why = $why })
}

function Have($cmd) { return [bool](Get-Command $cmd -ErrorAction SilentlyContinue) }

function WingetInstall($id, $label) {
    if (-not $Install) { return $false }
    Write-Host "  ... $label 설치 중"
    winget install --id $id -e --accept-package-agreements --accept-source-agreements --silent | Out-Null
    return $?
}

Write-Host ""
Write-Host "로키 환경 점검 - $(Get-Date -Format 'yyyy-MM-dd HH:mm')"
if ($Install) { Write-Host "설치 모드" } else { Write-Host "세는 모드 (고치려면 -Install)" }
Write-Host ""

# ── 1. 깔개 ────────────────────────────────────────────────
$hasWinget = Have "winget"
Step "winget" $hasWinget $(if ($hasWinget) { (winget --version) } else { "윈도우 11 에는 보통 있습니다" })
if (-not $hasWinget) {
    # 여기가 없으면 아래가 전부 사람 손이 된다. 그래서 먼저 본다.
    Need "winget(앱 설치 관리자) 설치" "이것이 없으면 아래 설치를 하나씩 손으로 해야 합니다"
}

$hasGit = Have "git"
Step "git" $hasGit $(if ($hasGit) { (git --version) } else { "" })
if (-not $hasGit -and $hasWinget) { if (WingetInstall "Git.Git" "git") { $hasGit = $true } }
if (-not $hasGit) { Mine "git 설치" "winget 으로 깝니다" }

$hasPython = Have "python"
Step "python" $hasPython $(if ($hasPython) { (python --version) } else { "" })
if (-not $hasPython -and $hasWinget) { if (WingetInstall "Python.Python.3.12" "python") { $hasPython = $true } }
if (-not $hasPython) { Mine "python 설치" "winget 으로 깝니다" }

# ── 2. 유니티 ──────────────────────────────────────────────
$hasHub = Test-Path $Hub
Step "Unity Hub" $hasHub $Hub
if (-not $hasHub -and $hasWinget) {
    if (WingetInstall "Unity.UnityHub" "Unity Hub") { $hasHub = Test-Path $Hub }
}
if (-not $hasHub) { Mine "Unity Hub 설치" "winget 으로 깝니다" }

$editorRoot = "C:\Program Files\Unity\Hub\Editor"
$hasEditor = $false
if (Test-Path $editorRoot) {
    $hasEditor = [bool](Get-ChildItem $editorRoot -Directory -EA SilentlyContinue |
        Where-Object { $_.Name -like "6000.0.*" })
}
Step "Unity $UnityVersion" $hasEditor $(if ($hasEditor) { "" } else { "유니티 AI 는 6000.0 을 겨냥합니다" })
if (-not $hasEditor -and $hasHub -and $Install) {
    # 에디터 설치는 자동으로 된다. Hub 에 headless CLI 가 있다.
    Write-Host "  ... Unity $UnityVersion 설치 중 (몇 GB 입니다. 오래 걸립니다)"
    # 출력을 버리지 않는다. 버렸다가 "왜 안 됐는지" 를 통째로 잃었다.
    $log = & $Hub -- --headless install --version $UnityVersion 2>&1 | Out-String
    $why = ($log -split "`n") | Where-Object { $_ -match "failed|Error given|Failed" }
    if ($why) { $why | Select-Object -Last 3 | ForEach-Object { Write-Host "      $_" } }
    if (Test-Path $editorRoot) {
        $hasEditor = [bool](Get-ChildItem $editorRoot -Directory -EA SilentlyContinue |
            Where-Object { $_.Name -like "6000.0.*" })
    }
}
if (-not $hasEditor) {
    if ($IsAdmin) {
        Mine "Unity $UnityVersion 설치" "Hub 의 headless CLI 로 깝니다. 몇 GB 라 오래 걸립니다"
    } else {
        # 관리자가 아니면 이건 로키가 못 한다. 자동으로 되는 척하면 숫자가 거짓말이 된다.
        Need "관리자 권한으로 이 스크립트를 다시 실행" "에디터 설치가 UAC 승격을 요구합니다. 관리자로 돌리면 로키가 깝니다"
    }
}

# ── 3. 사람만 할 수 있는 것 ────────────────────────────────
#
# 아래 셋은 스크립트로 못 넘긴다. 비밀번호를 대신 치지 않고, 결제를 대신 하지
# 않는다. **그래서 자동화의 정직한 끝이 여기다.**
# 라이선스는 **에디터와 상관없이** 본다. 처음에 `if ($hasEditor)` 안에 넣었더니,
# 에디터가 없는 동안에는 검사 자체를 안 하고 "없음" 이라고 답했다 — 로그인은
# 되어 있었다. 라이선스는 Hub 가 계정에 붙이는 것이라 에디터보다 먼저 생긴다.
#
# 자리도 틀렸었다. 유니티 6 은 여기 둔다. 옛 자리(`Unity_lic.ulf`)만 보고
# **못 본 것을 없는 것으로 읽었다** — 이 도구가 하지 말라고 만든 바로 그 짓이다.
$licPaths = @(
    "$env:LOCALAPPDATA\Unity\licenses\UnityEntitlementLicense.xml",
    "$env:APPDATA\Unity\Unity_lic.ulf",
    "$env:PROGRAMDATA\Unity\Unity_lic.ulf"
)
$licensed = $false
foreach ($lp in $licPaths) { if (Test-Path $lp) { $licensed = $true } }
Step "유니티 라이선스" $licensed $(if ($licensed) { "" } else { "Hub 에서 로그인해야 켜집니다" })
if (-not $licensed) { Need "Unity Hub 에서 로그인 + 라이선스 활성화" "비밀번호는 사람이 칩니다" }

Need "Unity AI Points 가 있는 요금제" "생성기가 포인트를 씁니다. 결제는 사람이 합니다"

# 새 기계는 이 코드를 어디서 받는가. 원격이 없으면 받을 데가 없다 —
# 부트스트랩이 아무리 잘 돌아도 그 앞이 막혀 있으면 소용없다.
$repo = Split-Path $PSScriptRoot -Parent
$remote = (git -C $repo remote get-url origin 2>$null)
$hasRemote = -not [string]::IsNullOrWhiteSpace($remote)
Step "저장소 원격" $hasRemote $remote
if (-not $hasRemote) { Need "이 저장소를 받을 곳 만들기" "원격이 없어 새 기계가 코드를 받을 데가 없습니다" }

$envFile = Join-Path (Split-Path $PSScriptRoot -Parent) ".env.local"
$hasEnv = Test-Path $envFile
Step "열쇠 파일 (.env.local)" $hasEnv $envFile
if (-not $hasEnv) { Need "열쇠 심기 (.env.local)" "OPENAI / SUPABASE / ROOKERY 열쇠. 사람이 붙여넣습니다" }

# ── 4. 여기부터는 우리 것 ──────────────────────────────────
$setup = Join-Path $PSScriptRoot "unity_ai_setup.py"
if ($hasPython -and $hasEditor -and (Test-Path $setup)) {
    if ($Install) {
        Write-Host ""
        Write-Host "생성 전용 프로젝트를 짓습니다: $GenProject"
        python $setup --at $GenProject
    } else {
        Write-Host "  [준비] 생성 프로젝트 만들기 - python tools\unity_ai_setup.py --at `"$GenProject`""
    }
}

# ── 마지막: 사람 손을 센다 ─────────────────────────────────
Write-Host ""
if ($HumanHands.Count -eq 0) {
    Write-Host "사람 손 0회. 이 기계는 준비됐습니다."
    exit 0
}
if ($RookeryHands.Count -gt 0) {
    Write-Host "로키가 -Install 로 하는 것 $($RookeryHands.Count)가지:"
    foreach ($h in $RookeryHands) { Write-Host "  - $($h.what) ($($h.why))" }
    Write-Host ""
}
if ($HumanHands.Count -eq 0) {
    Write-Host "사람 손 0회. -Install 로 나머지를 채우면 됩니다."
    exit 0
}
Write-Host "사람 손 $($HumanHands.Count)회 남았습니다:"
$n = 1
foreach ($h in $HumanHands) {
    Write-Host "  $n. $($h.what)"
    Write-Host "     - $($h.why)"
    $n++
}
Write-Host ""
Write-Host "이 목록이 비어야 로키가 혼자 돕니다. 숫자를 줄이는 것이 목표입니다."
exit 1
