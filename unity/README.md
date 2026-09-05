# 유니티에서 로키 것 가져오기

1. `unity/Editor/RookeryImporter.cs` 를 유니티 프로젝트의 `Assets/Editor/` 에 복사
2. 메뉴 **Window → Rookery → 가져오기**
3. 주소와 회사 열쇠를 넣고 **로키에서 가져오기**

**열쇠**는 회사마다 하나, 읽기 전용입니다. 로키 설정 메뉴에서 보입니다(예정).

## 무엇이 오나

`/ask` 대화로 **돌아온 것 전부**가 판정과 함께 옵니다 — 떨어진 것도(폴더 이름에
`_FAIL`). 고르는 것은 유니티 앞의 사람입니다. 파일마다 `.rookery.json` 이 같이
저장됩니다(어느 산출물에서 왔고 무엇으로 판정됐는지).

- Vox 의 메시: `Assets/Rookery/<제목>/model.glb`, `model.fbx`, `thumbnail.png`
- Dev 의 C#: `Assets/Rookery/Scripts/<제목>/*.cs` (이미 있으면 덮어쓰지 않음)

## 넣을 때 (배운 것, `engine/docs/gamedev-lessons-v0.md`)

- **캐릭터는 FBX** — Rig → Humanoid. GLB 는 리타깃 설정이 없습니다.
- GLB 는 `com.unity.cloud.gltfast` 패키지가 있어야 열립니다.
- 100배 크면 임포트 Scale Factor 0.01. 분홍 재질은 URP/Lit 으로, 하얀 모델은 재질 다시 추출.
- 콜라이더는 따로 붙이십시오. 피벗은 바닥 중앙으로 청해 둡니다.

## 창 없이 (자동화·시험)

    set ROOKERY_KEY=rk_...
    Unity -batchmode -quit -projectPath <프로젝트> -executeMethod Rookery.RookeryHeadless.Import

같은 코드가 창 없이 돈다. 09-05 16:43 에 6000.5.10f1 배치모드로 파일 6개(마네킹·보물상자
GLB/FBX/썸네일)가 `Assets/Rookery/<제목>_FAIL/` 에 떨어지는 것을 확인했다.

## 화면 사진

짓고 재기가 돌 때 시험지가 게임 화면을 한 장 찍어 대화에 붙인다(960×540).
그래픽 장치가 있어야 찍힌다 — 창 버튼은 문제없고, 헤드리스로 돌릴 때는
`-nographics` 를 **빼고** `-batchmode` 만 준다. 없으면 사진 없이 판정만 간다.
