/**
 * 게임 제작 시행착오 — 직원들이 일하기 전에 읽는 것.
 *
 * 2026-09-05 사장님: "나는 게임 개발해 본 적이 없다. GPT·검색으로 시행착오를
 * 학습해서 엔진을 강화하자." 읽은 것은 `engine/docs/gamedev-lessons-v0.md` 에
 * 출처와 함께 있고, 여기는 그것을 **프롬프트에 실을 모양**으로 옮긴 것이다.
 * 번호(A1, B3…)가 문서와 같다.
 *
 * ## 왜 회사 지식(organization_knowledge)이 아니라 코드인가
 * 회사 지식은 회사마다 대화에서 배운 것이고, 표에서 새것부터 여덟 개까지만
 * 실린다 — 08-30 에 컴파일러 잔소리가 회사가 정한 것을 밀어낸 자리다. 이것은
 * 회사와 상관없는 **이 제품의 기술 지식**이라 코드에 둔다. 판마다 확인된 것은
 * `verified` 를 올린다 — 남의 글은 그 사람의 경험이지 우리 것이 아니다.
 */

export type LessonRole = "mesh_assets" | "unity_code" | "blueprint";

export type Lesson = {
  id: string;
  role: LessonRole;
  text: string;
  /** 우리 판에서 실제로 밟아 확인했는가. 아니면 읽은 것이다. */
  verified: boolean;
};

export const GAMEDEV_LESSONS: Lesson[] = [
  // ── A. Meshy → 유니티 반입 (Vox) ──
  { id: "A1", role: "mesh_assets", verified: false,
    text: "캐릭터(리깅·애니메이션이 필요한 것)는 FBX 를 유니티에 넣는다. Humanoid 리그와 리타깃은 FBX 임포터에만 있고 GLB(glTFast)에는 없다. 소품은 GLB 도 된다." },
  { id: "A2", role: "mesh_assets", verified: false,
    text: "Meshy 출력은 cm 단위일 수 있다. 유니티에서 크기가 100배면 임포트 설정 Scale Factor 0.01 — 씬 인스턴스를 늘리지 않는다. 우리 호출은 auto_size 로 m 단위를 청한다; 실제 높이는 판정표 S1 에 있다." },
  { id: "A3", role: "mesh_assets", verified: false,
    text: "GLB 를 유니티가 열려면 패키지 com.unity.cloud.gltfast 가 있어야 한다. 없으면 파일이 프로젝트에 들어가도 아무것도 안 뜬다." },
  { id: "A4", role: "mesh_assets", verified: false,
    text: "분홍 재질은 렌더 파이프라인에 없는 셰이더다. URP 면 Universal Render Pipeline/Lit 으로 바꾼다." },
  { id: "A5", role: "mesh_assets", verified: false,
    text: "하얀 모델은 텍스처가 재질에 안 붙은 것이다. 임포트 설정에서 Materials → Extract 를 다시 한다." },
  { id: "A7", role: "mesh_assets", verified: false,
    text: "리깅된 캐릭터는 Rig → Humanoid 로 두고, Animation 탭에 클립이 보이는지 확인한 뒤 Animator 에 연결한다." },
  { id: "A8", role: "mesh_assets", verified: true,
    text: "피벗은 바닥 중앙이어야 (0,0,0) 에 놓았을 때 땅에 선다. 우리 Meshy 호출이 origin_at: bottom 이다." },
  { id: "A9", role: "mesh_assets", verified: false,
    text: "메시에는 콜라이더가 따로 없다. 씬에 놓을 때 Box 또는 Mesh Collider 를 붙여야 바닥을 뚫지 않는다." },

  { id: "E1", role: "mesh_assets", verified: true,
    text: "닫힘(watertight)은 3D 프린팅 기준이지 게임 기준이 아니다. 열린 메시도 게임에서는 문제없다 — 규격 v1 부터 정보만 남긴다." },
  { id: "E2", role: "mesh_assets", verified: true,
    text: "Meshy 리깅은 휴머노이드만 된다(5 크레딧). 본 24개가 Hips·Spine·LeftUpLeg 같은 믹사모식 이름으로 와서 유니티 Humanoid 에 자동 매핑된다. 걷기·달리기 FBX 가 같이 온다. 비인간형은 사람이 Blender 에서 리깅한다." },
  { id: "E7", role: "mesh_assets", verified: true,
    text: "리깅된 출력은 단위가 100배 다를 수 있다 — 같은 모델이 메시 출력 1.7 m, 리깅 출력 0.017 m 로 잡혔다. 유니티에서 rigged.fbx 의 Scale Factor 를 반드시 확인한다(100 또는 0.01)." },

  { id: "F1", role: "mesh_assets", verified: false,
    text: "폴리 예산은 PC 20~50k 삼각형, 텍스처 2K 가 표준이다. 히어로 자산만 4K. 텍스처가 메시보다 메모리를 더 먹으니 메시를 깎기 전에 텍스처를 줄인다." },
  { id: "F3", role: "mesh_assets", verified: false,
    text: "유니티 임포트에서 Normals 는 Import(Calculate 아님), Read/Write 는 끈다. 모델이 안 보이면 Transform 크기 0·뒤집힌 법선·재질 없음 셋 중 하나다." },

  // ── B. 유니티 코드 (Dev) ──
  { id: "B1", role: "unity_code", verified: false,
    text: "물리(Rigidbody 속도·힘)는 FixedUpdate 에서, 입력 읽기는 Update 에서. Update 에서 Rigidbody 를 밀면 프레임마다 다르게 움직인다." },
  { id: "B2", role: "unity_code", verified: false,
    text: "FindObjectOfType·GetComponent 를 매 프레임 부르지 않는다. Start 에서 한 번 찾아 필드에 둔다." },
  { id: "B3", role: "unity_code", verified: false,
    text: "한 클래스가 다 하지 않는다. 이동·체력·입력·카메라는 각각 컴포넌트다. 이름에 And 가 필요하면 둘로 나눈다." },
  { id: "B4", role: "unity_code", verified: false,
    text: "새 물체의 Transform 은 Reset 부터. 루트는 위치 0·회전 0·크기 1 로 두고 조정은 자식에서." },
  { id: "B5", role: "unity_code", verified: false,
    text: "폴더는 Assets/Scenes·Scripts·Prefabs·Art·Audio. 두 번 이상 놓는 물체는 프리팹으로." },
  { id: "B6", role: "unity_code", verified: true,
    text: "행동 하나를 더하면 바로 돌려 본다. 컴파일 통과는 작동이 아니다 — 08-29~09-03 에 '컴파일만 통과하고 안 움직이는' 게임을 여러 번 냈다." },
  { id: "B7", role: "unity_code", verified: true,
    text: "새 입력 시스템 전용 프로젝트(activeInputHandler: 1)에서 Input.GetAxis 는 조용히 0 이다. UnityEngine.InputSystem 의 Keyboard.current 또는 InputAction 을 쓴다." },
  { id: "B8", role: "unity_code", verified: true,
    text: "Unity 6 에는 Arial.ttf 가 없다. UI 글꼴은 LegacyRuntime.ttf." },

  { id: "E4", role: "unity_code", verified: false,
    text: "3인칭 조작·카메라는 처음부터 짜지 않는다. 유니티 Starter Assets – ThirdPerson(URP)이 표준형이고 Input System·Cinemachine 이 같이 깔린다. 그 위에 얹는다." },

  { id: "F4", role: "unity_code", verified: false,
    text: "Starter Assets 에 우리 캐릭터를 끼울 때: FBX Rig → Humanoid, Avatar 'Create From This Model', 플레이어 프리팹의 SkinnedMeshRenderer 와 본을 바꾸고 Animator 에 새 Avatar 를 지정한다. 본 이름이 표준(Hips·Spine·LeftUpLeg…)이어야 한다." },
  { id: "F5", role: "unity_code", verified: false,
    text: "PC 텍스처 압축은 RGB DXT1, RGBA BC7. 바닥·벽처럼 반복되는 텍스처는 밉맵을 켜고 Trilinear." },
  { id: "F6", role: "unity_code", verified: false,
    text: "Unity 6 URP 프로젝트의 기본 패키지: render-pipelines.universal, inputsystem, cinemachine(3.x), cloud.gltfast(6.x). 버전은 레지스트리에 물어서 고른다." },

  // ── C. 범위·설계 (설계도) ──
  { id: "C1", role: "blueprint", verified: true,
    text: "첫 조각은 한 화면·한 조작·한 목표. 만들기→시험→다듬기→내보내기를 한 번 끝까지 돌리는 것이 목표다." },
  { id: "C2", role: "blueprint", verified: true,
    text: "합격 기준을 코드보다 먼저 쓴다. '빠르다' 가 아니라 '50개에서도 부드럽다' 처럼 사람이 눌러 볼 수 있는 문장으로." },
  { id: "E5", role: "blueprint", verified: true,
    text: "규격은 문턱 숫자보다 '무엇을 재는가' 부터 틀릴 수 있다. 자가 엉뚱한 것을 재면 좋은 것이 떨어진다 — 닫힘 규칙이 그랬다." },
  { id: "C3", role: "blueprint", verified: false,
    text: "자산 목록에는 담당과 형식을 적는다: 캐릭터는 FBX·Humanoid·A-pose(Vox), 소품은 GLB(Vox), 코드·씬은 C#(Dev), 효과음은 나중에." },
];

/** 프롬프트에 붙일 글. 확인된 것과 읽은 것을 갈라 적는다 — 섞으면 둘 다 값을 잃는다. */
export function renderGamedevLessons(role: LessonRole): string {
  const mine = GAMEDEV_LESSONS.filter((l) => l.role === role);
  if (mine.length === 0) return "";
  const line = (l: Lesson) => `- [${l.id}] ${l.text}`;
  const verified = mine.filter((l) => l.verified);
  const read = mine.filter((l) => !l.verified);
  return (
    "\n\n## 게임 제작에서 배운 것\n" +
    (verified.length ? "우리 판에서 확인된 것:\n" + verified.map(line).join("\n") + "\n" : "") +
    (read.length ? "읽어서 아는 것(아직 우리 판에서 안 밟음 — 맞다고 단정하지 말고, 어긋나면 결과에 적어라):\n" + read.map(line).join("\n") + "\n" : "")
  );
}
