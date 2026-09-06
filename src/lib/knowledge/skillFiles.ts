import { readFile } from "node:fs/promises";
import path from "node:path";
import { createServiceClient } from "@/lib/supabase/service";
import { BUCKET } from "@/lib/deliverables/files";

/**
 * 기술을 파일로 — 계획 4 (2026-09-07).
 *
 * 직원의 "방법"(유니티 규칙, 배운 것)이 코드 문자열에 박혀 있어서 한 줄 배우는 데 배포 5분이
 * 들었다(09-06 규칙 다섯 개 = 배포 다섯 번). 이제 `src/skills/*.md` 가 씨앗이고, 저장소 버킷의
 * `_skills/<이름>.md` 가 있으면 그것이 이긴다. 배우는 것 = 파일 한 줄 고쳐 올리기
 * (`npx tsx engine/tools/skill_push.mts <이름>`). 웹·워커가 60초 안에 새 것을 읽는다.
 *
 * 나중에 "하네스 자동 진화"(로그를 보고 기계가 파일을 고침)가 붙을 자리도 여기다.
 */
const CACHE_MS = 60_000;
const cache = new Map<string, { at: number; text: string; from: "storage" | "repo" }>();

export async function readSkill(name: string): Promise<string> {
  const hit = cache.get(name);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.text;

  let text: string | null = null;
  let from: "storage" | "repo" = "repo";
  try {
    const { data } = await createServiceClient().storage.from(BUCKET).download(`_skills/${name}.md`);
    if (data) { text = await data.text(); from = "storage"; }
  } catch { /* 없으면 저장소 파일로 */ }
  if (text === null) {
    text = await readFile(path.join(process.cwd(), "src", "skills", `${name}.md`), "utf8");
  }
  text = stripComments(text);
  cache.set(name, { at: Date.now(), text, from });
  if (!hit || hit.from !== from) console.log(`[skills] ${name}: ${from === "storage" ? "저장소 판" : "저장소에 없어 씨앗 판"} (${text.length}자)`);
  return text;
}

/** 파일 안내문(<!-- -->)은 모델에게 안 보낸다. */
function stripComments(md: string): string {
  return md.replace(/<!--[\s\S]*?-->\s*/g, "").trim();
}

export type LessonRole = "mesh_assets" | "unity_code" | "blueprint";

/** 프롬프트에 붙일 "배운 것". 확인된 것과 읽은 것을 갈라 적는다 — 섞으면 둘 다 값을 잃는다. */
export async function renderGamedevLessons(role: LessonRole): Promise<string> {
  const md = await readSkill(`lessons-${role}`);
  const body = md.replace(/^# .*\n/, "").trim();
  if (!body) return "";
  return (
    "\n\n## 게임 제작에서 배운 것\n" +
    body
      .replace(/^## 확인된 것\s*$/m, "우리 판에서 확인된 것:")
      .replace(/^## 읽은 것\s*$/m, "읽어서 아는 것(아직 우리 판에서 안 밟음 — 맞다고 단정하지 말고, 어긋나면 결과에 적어라):") +
    "\n"
  );
}

/** Dev 의 유니티 규칙. */
export async function unityRules(): Promise<string> {
  const md = await readSkill("unity-rules");
  return "\n\n" + md.replace(/^# .*\n/, "").trim() + "\n";
}
