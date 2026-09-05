# artgen — 로컬 이미지 생성·학습 (데스크톱 RTX 3060 12GB)

Rookery와 무관한 개인용 도구 폴더. GitHub 동기화 저장소를 배포
경로로만 빌려 쓴다.

## 1단계: 생성 환경 (지금)

데스크톱에서:

```powershell
git pull
powershell -ExecutionPolicy Bypass -File tools\artgen\setup_comfyui.ps1
```

- 설치 위치 `C:\artgen` (약 25GB — 다른 드라이브를 쓰려면
  `-Root D:\artgen`)
- 끝나면 `C:\artgen\run_comfyui.ps1` 실행 → 브라우저
  `http://127.0.0.1:8188`
- 모델 2개가 들어감:
  - **Illustrious-XL-v0.1** — 애니·일러스트 계열 (LoRA 학습 베이스로도
    현재 표준)
  - **sd_xl_base_1.0** — 실사·범용

다운로드가 끊기면 스크립트를 다시 실행 — 이어받기 된다.

## 2단계: LoRA 학습 (데이터셋이 준비되면)

내 그림체/캐릭터를 가르치는 단계. 필요한 것:

- 이미지 20~100장 (한 스타일 또는 한 캐릭터로 통일)
- 도구: **OneTrainer** (쉬움) 또는 **kohya_ss** (표준)
- 3060 12GB에서 SDXL LoRA 학습 시 필수 옵션: gradient
  checkpointing, 8bit optimizer, latent 캐싱 (전부 체크박스)
- 소요: 20~30장 기준 1~3시간

데이터셋이 모이면 학습 스크립트도 같은 방식으로 이 폴더에 추가
예정.

## 주의

- 학습·생성 중에는 VRAM을 거의 전부 사용 — Rookery soak 등 다른
  GPU/장시간 작업과 동시 실행 금지.
- 모델 파일(~GB 단위)은 git에 넣지 않는다. 이 폴더에는 스크립트만.
