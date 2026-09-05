# 아무것도 없는 윈도우 기계에 로키가 일할 환경을 만든다.
#
# 목표는 "사람 손 0회" 가 아니다. **사람 손이 정확히 몇 번이고 그게 무엇인지
# 적혀 있는 것**이다. 0회라고 말해 놓고 중간에 로그인 창이 뜨면, 무인으로 두고
# 나간 사람은 아침에 아무것도 안 된 것을 본다.
#
# **관리자 권한은 이제 필요 없다.** (09-02)
#
# 에디터를 `Program Files` 가 아니라 사용자 폴더(`~\UnityEditors`)에 깐다.
# 거기는 사용자 것이라 승격을 물을 이유가 없고, 그래서 UAC 창이 아예 안 뜬다.
# 권한을 **더** 받는 것이 아니라 **덜** 받는 쪽이라 뚫는 것도 아니다.
#
# 이게 왜 중요한가: 승격 창은 로키가 대신 못 띄운다. 백그라운드 세션에서 띄운
# 요청은 사람 화면까지 안 가고 취소로 돌아온다 — 09-01~02 에 네 번 해서 네 번
# 다 그랬다. 사람이 화면 앞에 없으면 거기서 밤새 선다. 무인 운영이 목표인 이상
# **승격이 필요한 설계 자체가 결함**이었다.
#
#   powershell -ExecutionPolicy Bypass -File tools\bootstrap.ps1            # 세기만 한다
#   powershell -ExecutionPolicy Bypass -File tools\bootstrap.ps1 -Install   # 할 수 있는 것을 한다
#
# 파워셸로 쓴 이유: 새 윈도우에는 파이썬이 없다. 파이썬을 깔 스크립트가
# 파이썬으로 되어 있으면 첫 줄에서 막힌다.

param(
    [switch]$Install,
    [string]$UnityVersion = "6000.0.82f1"
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

# ── 유니티 에디터 ─────────────────────────────────────────
#
# **Program Files 에 안 깐다.**
#
# 거기에 깔려면 관리자 권한이 필요하고, 그 창은 사람이 눌러야 하고, 사람이
# 화면 앞에 없으면 거기서 멈춘다 — 09-02 에 네 번 해서 네 번 다 그랬다.
# 사용자 폴더는 사장님 것이라 그 창이 아예 안 뜬다. 권한을 **더** 받는 것이
# 아니라 **덜** 받는 쪽이라, 뚫는 것도 아니다.
#
# Hub 도 안 쓴다. Hub 의 설치 도우미는 이 기계에서 세 시간 동안 파이프를 못
# 열고 1.5초마다 같은 오류만 냈다. 설치본은 Unity 가 공개 API 로 알려 주는
# 바로 그 파일이고, Hub 가 하려던 일도 결국 그 파일을 실행하는 것이다.
$EditorHome  = "$env:USERPROFILE\UnityEditors"
$editorRoots = @($EditorHome, "C:\Program Files\Unity\Hub\Editor")

function FindEditor($ver) {
    foreach ($root in $editorRoots) {
        $exe = Join-Path $root "$ver\Editor\Unity.exe"
        if (Test-Path $exe) { return $exe }
    }
    return $null
}

# 설치본은 `/S`(조용히) 를 줘도 창을 **하나** 띄운다: "의존성 목록을 볼까요?"
# 아무도 안 누르면 거기서 선 채로 안 끝난다 — 실제로 54분을 그렇게 섰다.
# 그래서 **그 창만** 골라서 답한다. 읽어 보지 않은 창은 누르지 않는다.
$ClickerSrc = @"
using System;
using System.Text;
using System.Runtime.InteropServices;
using System.Collections.Generic;
public class SetupUI {
  [DllImport("user32.dll")] public static extern bool EnumChildWindows(IntPtr h, EnumProc cb, IntPtr p);
  [DllImport("user32.dll", CharSet=CharSet.Unicode)] public static extern int GetWindowTextW(IntPtr h, StringBuilder s, int n);
  [DllImport("user32.dll", CharSet=CharSet.Unicode)] public static extern IntPtr SendMessageW(IntPtr h, uint m, IntPtr w, IntPtr l);
  public delegate bool EnumProc(IntPtr h, IntPtr p);
  public static List<string> Texts = new List<string>();
  public static IntPtr NoButton = IntPtr.Zero;
  public static void Scan(IntPtr root) {
    Texts.Clear(); NoButton = IntPtr.Zero;
    EnumChildWindows(root, delegate(IntPtr h, IntPtr p) {
      var t = new StringBuilder(2048); GetWindowTextW(h, t, 2048);
      string s = t.ToString().Trim();
      if (s.Length > 0) { Texts.Add(s); if (s.Contains("(&N)")) NoButton = h; }
      return true;
    }, IntPtr.Zero);
  }
  public static void Click(IntPtr h) { SendMessageW(h, 0x00F5, IntPtr.Zero, IntPtr.Zero); }
}
"@

function InstallEditor($ver, $dest) {
    # 설치본 자리를 Unity 에게 물어본다. 링크를 코드에 박아 두면 판올림 때
    # 조용히 404 가 되고, 그때는 "설치 실패" 로만 보인다.
    $api = "https://services.api.unity.com/unity/editor/release/v1/releases?limit=1&version=$ver"
    try { $rel = Invoke-RestMethod -Uri $api -TimeoutSec 60 }
    catch { Write-Host "      릴리스 정보를 못 받았습니다: $($_.Exception.Message)"; return $null }
    # 아키텍처는 기계에서 읽는다. 박아 두면 ARM 노트북에서 x86 설치본을 받고,
    # 그건 깔리기는 해서 **왜 느린지 아무도 모르는 상태**가 된다.
    $arch = if ($env:PROCESSOR_ARCHITECTURE -eq "ARM64") { "ARM64" } else { "X86_64" }
    $dl = $rel.results[0].downloads |
        Where-Object { $_.platform -eq "WINDOWS" -and $_.architecture -eq $arch -and $_.type -eq "EXE" } |
        Select-Object -First 1
    if (-not $dl) { Write-Host "      $ver 의 윈도우($arch) 설치본이 목록에 없습니다."; return $null }

    # Hub 가 이미 받아 둔 것이 있으면 그걸 쓴다. 3.7GB 를 두 번 받지 않는다.
    $setup = Join-Path $env:TEMP "UnitySetup64-$ver.exe"
    $hubCopy = Join-Path $env:APPDATA "UnityHub\downloads\UnitySetup64-$ver.exe"
    if (Test-Path $hubCopy) { $setup = $hubCopy }
    elseif (-not (Test-Path $setup)) {
        $mb = [math]::Round($dl.downloadSize.value / 1MB)
        Write-Host "  ... 설치본 내려받는 중 ($mb MB)"
        $old = $ProgressPreference; $ProgressPreference = "SilentlyContinue"
        try { Invoke-WebRequest -Uri $dl.url -OutFile $setup -TimeoutSec 3600 -UseBasicParsing }
        catch { Write-Host "      못 받았습니다: $($_.Exception.Message)"; return $null }
        finally { $ProgressPreference = $old }
    }

    Add-Type -TypeDefinition $ClickerSrc -Language CSharp -ErrorAction SilentlyContinue
    Write-Host "  ... Unity $ver 설치 중 → $dest (10~20분)"
    # 지금 권한 그대로 돌린다. 목적지가 사용자 폴더라 승격이 필요 없다.
    $env:__COMPAT_LAYER = "RunAsInvoker"
    $proc = Start-Process -FilePath $setup -ArgumentList "/S /D=$dest" -PassThru
    $deadline = (Get-Date).AddMinutes(45)
    while ((Get-Date) -lt $deadline) {
        Start-Sleep -Seconds 10
        $p = Get-Process -Id $proc.Id -ErrorAction SilentlyContinue
        if (-not $p) { break }
        $p.Refresh()
        if ($p.MainWindowHandle -ne 0) {
            [SetupUI]::Scan([IntPtr]$p.MainWindowHandle)
            $joined = [SetupUI]::Texts -join " | "
            if ($joined -match "Would you like to view the list now") {
                if ([SetupUI]::NoButton -ne [IntPtr]::Zero) { [SetupUI]::Click([SetupUI]::NoButton) }
            } elseif ($joined -and $joined -notmatch "Cancel") {
                # 모르는 창은 안 누르고 **말한다.** 안 누르면 여기서 서지만,
                # 읽지도 않고 누르면 아무도 안 본 것에 동의하게 된다.
                Write-Host "      모르는 창이 떠 있습니다: $joined"
            }
        }
    }
    return (FindEditor $ver)
}

$editor = FindEditor $UnityVersion
Step "Unity $UnityVersion" ([bool]$editor) $(if ($editor) { $editor } else { "유니티 AI 는 6000.0 을 겨냥합니다" })
if (-not $editor -and $Install) {
    $editor = InstallEditor $UnityVersion (Join-Path $EditorHome $UnityVersion)
    if ($editor) { Write-Host "  [됨]   Unity $UnityVersion  $editor" }
}
$hasEditor = [bool]$editor
if (-not $hasEditor) {
    # 이제 관리자 권한이 필요 없다. 그래서 이건 사람 손이 아니라 로키 손이다.
    Mine "Unity $UnityVersion 설치" "Unity 가 알려 준 설치본을 받아서 사용자 폴더에 깝니다"
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

# 유니티 AI 요금제는 더 이상 세지 않는다 — 09-03 사장님이 유니티 AI 를 안 쓰기로
# 정했다. 메시·소리는 외부 API(Meshy/Tripo·ElevenLabs)로 가고, 그 열쇠는 위
# `.env.local` 한 칸에 같이 들어간다.

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
