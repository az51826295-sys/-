import type { Supabase } from "@/lib/execution/shared";
import { listVersions } from "@/lib/chat/versions";
import { loadSpecs } from "@/lib/hand/spec";
import { latestFrame } from "@/lib/hand/screen";

/**
 * 로키가 **자기가 뭘 만들고 있는지 아는가** (136회차 09-16).
 *
 * 사장님이 실제로 쓰다가 잡은 것: *"자기가 뭐 만들고 있는지에 대한 자각 없음. v2 끝났는데 안 보여줌."*
 *
 * 그 판의 기록은 이랬다 — 업무 `3908cf71` **completed**, 결과물 `e960620b` **있음**,
 * 대화에 붙은 시각 **02:20·02:23**, 오른쪽 미리보기 패널에 **v1·v2 가 그려져 있었다.**
 * 그런데 "v2 보여줘" 에 로키는 이렇게 답했다:
 *
 * > "지금 보여드릴 수 있는 게 없습니다. … 결과물이 이 대화에 붙은 적이 없고, 'v2' 라는 이름의 산출물도
 * >  제 쪽에 없습니다. 제가 모르는 것을 아는 척하지 않겠습니다."
 *
 * **전부 틀렸다.** 그리고 더 나쁜 것은 **정직한 말투로 틀렸다는 것**이다 — "아는 척하지 않겠습니다" 는
 * 사람에게 믿으라는 신호인데, 그 문장이 거짓을 싣고 나갔다. 모르는 것을 모른다고 하는 것은 옳지만,
 * **아는 것을 모른다고 하는 것은 그냥 고장**이다.
 *
 * 원인은 단순했다: 답을 쓰는 프롬프트에 **대화 글과 검색 결과만** 들어갔다. 업무도 결과물도 안 들어갔다.
 * 그러니 "v2" 를 맞춰 볼 대상이 아예 없었고, 모델은 없는 것을 근거로 없다고 단언했다.
 *
 * 여기서 만드는 것은 **사실 몇 줄**이다. 판정도 요약도 아니다 — 무엇이 돌고 있고 무엇이 나왔는지.
 */

export type WorkState = { text: string; hasAny: boolean };

const AGO = (iso: string) => {
  const m = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (m < 1) return "방금";
  if (m < 60) return `${m}분 전`;
  const h = Math.round(m / 60);
  return h < 24 ? `${h}시간 전` : `${Math.round(h / 24)}일 전`;
};

const RUNNING = new Set(["queued", "working", "in_progress", "submitted"]);

/**
 * 이 회사가 **지금 뭘 하고 있고 뭘 냈는지**를 몇 줄로. 모델 프롬프트에 그대로 붙인다.
 * 없으면 `hasAny: false` — 그때는 프롬프트를 더럽히지 않게 아무것도 안 붙인다.
 */
/** 본문을 실을 때 자르는 길이. 코드가 든 판은 수만 자라 통째로 실으면 대화 창을 밀어낸다. */
const BODY_CLIP = 6000;

export async function workStateText(
  db: Supabase,
  companyId: string | null,
  conversationId?: string | null,
  /** 이번에 사람이 친 말. 'v2' 처럼 판을 가리키면 **그 판의 본문**까지 싣는다. */
  askedText?: string,
): Promise<WorkState> {
  if (!companyId) return { text: "", hasAny: false };

  const { data: asg } = await db
    .from("assignments")
    .select("id, title, status, created_at, company_employees!assignments_company_employee_id_fkey(employees(name))")
    .eq("company_id", companyId)
    .order("created_at", { ascending: false })
    .limit(8);
  type A = { id: string; title: string; status: string; created_at: string; company_employees: { employees: { name: string } | null } | null };
  const A = (asg ?? []) as unknown as A[];

  const { data: del } = await db
    .from("deliverables")
    .select("id, assignment_id, title, version, deliverable_type, created_at")
    .in("assignment_id", A.map((a) => a.id))
    .order("created_at", { ascending: false })
    .limit(20);
  type D = { id: string; assignment_id: string; title: string; version: number; deliverable_type: string; created_at: string };
  const D = (del ?? []) as unknown as D[];

  // 사람이 판정한 것(승인/수정 요청). 있으면 "이미 승인함" 을 알아야 또 내밀지 않는다.
  const { data: rev } = D.length
    ? await db.from("deliverable_reviews").select("deliverable_id, decision").in("deliverable_id", D.map((d) => d.id))
    : { data: [] };
  const decided = new Map(((rev ?? []) as { deliverable_id: string; decision: string }[]).map((r) => [r.deliverable_id, r.decision]));

  const lines: string[] = [];

  // 141회차: **스스로 채택한 규칙**. 사장님이 "스스로 진화하냐" 고 물었을 때 로키가 "못 한다" 고 답했는데,
  // 그 순간에도 이 규칙들이 일 프롬프트 안에 있었다. 성격 글에 적어 두는 것만으로는 부족하다 —
  // 몇 개가 언제 채택됐는지는 **사실**이라 DB 에서 읽어 대 준다.
  const { data: adopted } = await db
    .from("organization_knowledge")
    .select("title, created_at")
    .eq("company_id", companyId).eq("status", "active")
    .not("learning_candidate_id", "is", null)
    .order("created_at", { ascending: false }).limit(5);
  const K = (adopted ?? []) as { title: string; created_at: string }[];
  if (K.length) {
    lines.push(`스스로 배워서 채택한 규칙 ${K.length}개 (고리가 뽑아 **떼어 둔 자료로 검증**하고 채택한 것. 지금 일 프롬프트에 들어가 있다):`);
    for (const r of K) lines.push(`- ${r.title} (${AGO(r.created_at)} 채택)`);
  }

  // 162회차: **로키 손** — 사장님 노트북에 붙은 것. 09-17 에 사장님이 "실시간으로 화면 볼 수 있어?" 라 물었더니
  // 로키가 "네, 브라우저에서 열면 실시간으로 반영됩니다" 라고 **지어내고**, 다음 답에선 반대로 말했다. 136회차와 같은 병 —
  // 사실이 프롬프트에 없었다. 손이 잰 기계와 손이 할 수 있는 것·없는 것을 사실로 댄다.
  try {
    const machines = await loadSpecs(db, companyId);
    lines.push("", "로키 손 (사장님 기계에 붙은 작은 프로그램) — 사실:");
    if (machines.length) {
      for (const m of machines.slice(0, 3)) {
        const eng = [m.engines.unity.length ? `Unity ${m.engines.unity.join("·")}` : "", m.engines.godot.length ? "Godot 있음" : "", m.engines.unreal.length ? "Unreal 있음" : ""].filter(Boolean).join(", ") || "엔진 없음";
        lines.push(`- 잰 기계: ${m.host} (${m.kind === "laptop" ? "노트북" : "데스크톱"}, 램 ${m.ramGB}GB, ${eng}) — 마지막으로 잰 때 ${AGO(m.at)}`);
      }
      lines.push("- 손이 **할 수 있는 것**: 그 기계의 사양을 재고, 판단대로 엔진(지금은 Godot)을 사용자 폴더에 깐다. 사장님이 시키면 화면을 보고 대신 누르는 것(손 v2)도 있다 — **단, 손 v2 는 사장님이 그 기계에서 직접 돌려야 시작되고 저절로 돌지 않는다.**");
    } else {
      lines.push("- 아직 잰 기계가 없다 — 손을 붙이려면 사장님이 그 기계에서 손 스크립트를 한 번 돌려야 한다.");
    }
    // 164회차: 같이 보기(163)를 붙이고도 로키에게 안 알렸다 — 138 의 교훈("새 능력은 로키 자신에게도 알린다")을 내가 또 빠뜨렸다.
    const watching = latestFrame(companyId);
    lines.push(watching
      ? `- **같이 보기가 켜져 있다**: ${watching.host} 의 화면이 ${Math.round(watching.ageMs / 1000)}초 전에 왔다. 미리보기 맨 위에 그 화면이 떠 있고, 이 대화에 그 한 장이 그림으로 같이 온다. 보이는 것만 말한다.`
      : "- **같이 보기는 지금 꺼져 있다**(20초 안에 온 화면이 없다). 켜는 법: 사장님이 그 기계에서 손을 `-Watch` 로 돌린다 — 3초마다 화면 한 장이 오고(마지막 한 장만 둔다, 녹화 아님) 미리보기 맨 위에 뜬다. 로키가 저절로 켤 수는 없다.");
    lines.push("- **기기(기종)는 손 없이도 안다**: 브라우저가 접속할 때 화면 크기·터치·GPU·운영체제를 알려 준다(위 '지금 말하는 기기' 줄). 모델명만 모른다 — 모델명을 물으면 그건 모른다고 하고 나머지로 답한다. 폰을 실시간으로 원격조종하는 것은 웹 구조에서 못 한다(만들어져 있지 않다).");
    lines.push("- 같이 보기가 꺼져 있고 손이 돌고 있지 않으면 **로키는 사장님 화면을 볼 수 없다.** 오른쪽 미리보기의 나머지는 로키가 만든 결과물의 화면이지 사장님 화면이 아니다. 없는 걸 있다고 하지 마라.");
    lines.push("- 유니티: 프로젝트(스크립트·씬 빌더)는 로키가 만들어 준다. 유니티 에디터를 로키가 열어 보는 건 손 v2 가 돌 때만 가능하다.");
  } catch { /* 손 사실을 못 읽으면 빈 채로 — 지어내지 않는다 */ }

  const running = A.filter((a) => RUNNING.has(a.status));
  if (running.length) {
    lines.push("지금 도는 일:");
    for (const a of running) {
      const who = a.company_employees?.employees?.name ?? "담당자";
      lines.push(`- ${who}: "${a.title}" (${a.status}, ${AGO(a.created_at)} 맡김)`);
    }
  }

  // **번호는 화면과 같아야 한다.** `deliverables.version` 은 한 업무 안의 판 번호라 거의 늘 1 이고,
  // 사장님이 보는 오른쪽 패널의 v1·v2 는 **이 대화에 붙은 순서**다(`listVersions`). 여기서 다른 번호를
  // 대면 "v2 보여줘" 가 더 엉킨다 — 그래서 패널과 **같은 자리**에서 번호를 가져온다.
  const numbered = conversationId ? await listVersions(db, conversationId) : [];
  const nOf = new Map(numbered.map((v) => [v.deliverableId, v.n]));
  const curId = numbered.find((v) => v.current)?.deliverableId ?? null;

  if (numbered.length) {
    lines.push("이 대화에 붙은 판 (오른쪽 미리보기의 번호와 같다):");
    for (const v of [...numbered].reverse().slice(0, 8)) {
      const d = D.find((x) => x.id === v.deliverableId);
      const dec = decided.get(v.deliverableId);
      const mark = dec === "approved" ? " · 사장님 승인함" : dec ? ` · ${dec}` : " · 아직 판정 없음";
      const now = v.deliverableId === curId ? " · **지금 미리보기에 떠 있는 판**" : "";
      lines.push(`- **v${v.n}** "${d?.title ?? "(제목 없음)"}"${d ? ` (${d.deliverable_type}, ${AGO(d.created_at)})` : ""}${mark}${now}`);
    }
  }

  // 136회차 2차: **본문까지 싣는다.** 제목만 주니 로키가 "전체 본문이 필요하면 잘린 부분을 이 대화에 붙여
  // 주세요" 라고 했다 — DB 에 있는 자기 결과물을 사장님더러 붙여 달라고 한 것이다. 자각이 반쪽이었다.
  // 싣는 것은 **지금 판**과, 사람이 이번 말에서 번호로 가리킨 판.
  const wanted = new Set<string>();
  if (curId) wanted.add(curId);
  for (const m of (askedText ?? "").matchAll(/v\s?(\d{1,2})/gi)) {
    const hit = numbered.find((v) => v.n === Number(m[1]));
    if (hit) wanted.add(hit.deliverableId);
  }
  if (wanted.size) {
    const { data: bodies } = await db
      .from("deliverables").select("id, content_markdown").in("id", [...wanted]);
    for (const b of (bodies ?? []) as { id: string; content_markdown: string | null }[]) {
      const n = nOf.get(b.id);
      const body = (b.content_markdown ?? "").trim();
      if (!body) continue;
      const clipped = body.length > BODY_CLIP ? body.slice(0, BODY_CLIP) + "\n\n…(본문이 길어 여기까지만 실었다)" : body;
      lines.push("", `### v${n} 본문 (실제 내용이다 — 이걸로 답해라. 사람에게 붙여 달라고 하지 마라)`, clipped);
    }
  }

  const unlisted = D.filter((d) => !nOf.has(d.id));
  if (unlisted.length) {
    lines.push("이 회사의 다른 결과물 (이 대화에는 안 붙음):");
    for (const d of unlisted.slice(0, 5)) lines.push(`- "${d.title}" (${d.deliverable_type}, ${AGO(d.created_at)})`);
  }

  if (!lines.length) return { text: "", hasAny: false };

  return {
    hasAny: true,
    text: [
      "## 지금 이 회사의 일 (사실이다 — 여기 있는 것은 **실제로 있다**)",
      ...lines,
      "",
      "**'v1'·'v2' 같은 말은 위 목록의 버전 번호다.** 사람이 그 번호로 물으면 위에서 찾아 답한다.",
      "위에 있는 것을 **없다고 말하지 마라.** 모르는 것을 모른다고 하는 것은 옳지만, **아는 것을 모른다고 하는 것은 고장이다.**",
      "본문이 위에 실려 있으면 **그것으로 답한다.** 사람에게 '붙여 주세요' 라고 하지 마라 — 우리 것이고 우리가 읽을 수 있다.",
      "본문이 안 실린 판은 **있다는 사실만** 안다. 그때만 '오른쪽 미리보기에서 v1 을 열어 보세요' 라고 한다.",
    ].join("\n"),
  };
}
