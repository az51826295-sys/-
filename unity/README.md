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
