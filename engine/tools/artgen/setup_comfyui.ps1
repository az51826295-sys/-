# ComfyUI + SDXL 로컬 이미지 생성 환경 자동 설치 (RTX 3060 12GB 기준)
#
# 데스크톱에서 실행:
#   powershell -ExecutionPolicy Bypass -File tools\artgen\setup_comfyui.ps1
#
# 하는 일:
#   1. NVIDIA GPU 확인
#   2. ComfyUI 클론 + 전용 venv + PyTorch(CUDA) 설치
#   3. 모델 다운로드 (SDXL base + Illustrious XL, 총 ~13GB)
#   4. 실행 스크립트(run_comfyui.ps1) 생성
#
# 설치 위치 기본값: C:\artgen  (아래 $Root 바꾸면 다른 드라이브 가능)

param(
    [string]$Root = "C:\artgen"
)

$ErrorActionPreference = "Stop"

function Step($msg) { Write-Host "`n=== $msg ===" -ForegroundColor Cyan }

# --- 0. 사전 확인 -----------------------------------------------------

Step "GPU 확인"
$smi = Get-Command nvidia-smi -ErrorAction SilentlyContinue
if (-not $smi) {
    $fallback = "C:\Windows\System32\nvidia-smi.exe"
    if (Test-Path $fallback) { $smi = $fallback }
    else {
        Write-Host "nvidia-smi를 찾을 수 없음 - NVIDIA 드라이버가 설치된 데스크톱에서 실행하세요." -ForegroundColor Red
        exit 1
    }
}
& $smi --query-gpu=name,memory.total --format=csv,noheader

Step "Python / git 확인"
python --version
git --version

$free = [math]::Round((Get-PSDrive ($Root.Substring(0,1))).Free / 1GB, 1)
Write-Host "대상 드라이브 여유 공간: ${free}GB (필요: 약 25GB)"
if ($free -lt 25) {
    Write-Host "공간 부족 - `$Root를 여유 있는 드라이브로 바꿔 다시 실행하세요." -ForegroundColor Red
    exit 1
}

# --- 1. ComfyUI -------------------------------------------------------

Step "ComfyUI 클론"
New-Item -ItemType Directory -Force $Root | Out-Null
$comfy = Join-Path $Root "ComfyUI"
if (-not (Test-Path (Join-Path $comfy ".git"))) {
    git clone --depth 1 https://github.com/comfyanonymous/ComfyUI $comfy
} else {
    Write-Host "이미 클론됨 - 건너뜀"
}

Step "venv + PyTorch(CUDA) 설치 (수 분 소요)"
$venv = Join-Path $Root "venv"
if (-not (Test-Path $venv)) { python -m venv $venv }
$pip = Join-Path $venv "Scripts\pip.exe"
& $pip install --upgrade pip -q
& $pip install torch torchvision --index-url https://download.pytorch.org/whl/cu126
& $pip install -r (Join-Path $comfy "requirements.txt")

Step "CUDA 동작 확인"
$py = Join-Path $venv "Scripts\python.exe"
& $py -c "import torch; assert torch.cuda.is_available(), 'CUDA 불가'; print('CUDA OK:', torch.cuda.get_device_name(0))"

# --- 2. 모델 다운로드 -------------------------------------------------
# curl.exe(윈도우 기본 내장)로 이어받기(-C -) 지원 - 끊겨도 재실행하면 이어짐

$ckptDir = Join-Path $comfy "models\checkpoints"
New-Item -ItemType Directory -Force $ckptDir | Out-Null

$models = @(
    @{ name = "sd_xl_base_1.0.safetensors"; gb = 6.9
       url  = "https://huggingface.co/stabilityai/stable-diffusion-xl-base-1.0/resolve/main/sd_xl_base_1.0.safetensors" },
    @{ name = "Illustrious-XL-v0.1.safetensors"; gb = 6.6
       url  = "https://huggingface.co/OnomaAIResearch/Illustrious-xl-early-release-v0/resolve/main/Illustrious-XL-v0.1.safetensors" }
)
foreach ($m in $models) {
    $dest = Join-Path $ckptDir $m.name
    if ((Test-Path $dest) -and ((Get-Item $dest).Length / 1GB) -gt ($m.gb * 0.95)) {
        Write-Host "$($m.name) 이미 있음 - 건너뜀"
        continue
    }
    Step "다운로드: $($m.name) (~$($m.gb)GB)"
    curl.exe -L -C - -o $dest $m.url
}

# --- 3. 실행 스크립트 -------------------------------------------------

Step "실행 스크립트 생성"
$run = Join-Path $Root "run_comfyui.ps1"
@"
# ComfyUI 실행 - 브라우저에서 http://127.0.0.1:8188 접속
Set-Location "$comfy"
& "$py" main.py
"@ | Out-File -Encoding utf8 $run

Write-Host ""
Write-Host "설치 완료." -ForegroundColor Green
Write-Host "실행:  powershell -ExecutionPolicy Bypass -File $run"
Write-Host "접속:  http://127.0.0.1:8188"
Write-Host ""
Write-Host "첫 그림: 상단 워크플로 기본 예제에서 체크포인트를"
Write-Host "Illustrious-XL-v0.1(애니/일러스트) 또는 sd_xl_base_1.0(실사·범용)으로"
Write-Host "선택하고 프롬프트 입력 후 Queue."
