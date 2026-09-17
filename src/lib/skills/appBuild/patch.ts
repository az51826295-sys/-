import { z } from "zod";
import type { AIProvider } from "@/lib/providers/types";

/**
 * **고치는 판은 조각만 낸다** (165회차 2026-09-17).
 *
 * 사장님(09-17 23:0x): *"게임 방향키가 안 좋다고 했는데 전체를 새롭게 다시 만들어 이상하게… 죽이고 싶어."*
 *
 * 기록을 열어 보니 진짜 고장은 **두 줄**이었다(오른쪽 벡터의 부호: `rightX = sin` → `-sin`, `rightY = -cos` → `cos`).
 * 그런데 그 판은 858줄짜리 파일을 그대로 두고 **911줄짜리 새 파일**(`fps_wasd_fix_validator.html`)을 냈고,
 * 그 앞 판(WASD 가 안 먹는다)은 834줄 중 사실상 전부(1,603줄 diff)를 새로 썼다.
 * 이유는 구조다: 고치는 판도 "**파일 전체를 낸다**" 였다. 모델에게 3만 자를 다시 쓰게 하면 3만 자가 다 바뀐다 —
 * 09-09 에 "손댈 파일 선언"으로 **파일 단위**는 막았지만, 파일이 하나뿐인 게임에선 그게 아무것도 못 막는다.
 *
 * 그래서 고치는 판의 출력은 파일이 아니라 **조각**이다: `find`(지난 파일에 **딱 한 번** 나오는 원문) → `replace`.
 * 붙이는 것은 코드가 한다. 안 맞는 조각은 한 번 되물어 고치고, 그래도 안 맞으면 옛 방식(전체)으로 물러나되 **그랬다고 적는다.**
 * 말로 "조금만 고쳐라" 고 부탁하지 않는다 — 73판 중 68판이 말을 어긴 회사다.
 */

export type SourceFile = { path: string; language: string; contents: string };

export const patchSchema = z.object({
  /** 지난 파일을 고치는 조각. `find` 는 그 파일에 **정확히 한 번** 나오는 원문 그대로(공백·들여쓰기 포함), 앞뒤 줄을 넉넉히. */
  edits: z.array(z.object({ path: z.string(), find: z.string(), replace: z.string(), why: z.string() })),
  /** 정말로 새 파일이 있어야 할 때만(주문이 새 화면·새 스크립트를 달라고 했을 때). 고장 하나 고치는 판이면 빈 배열. */
  newFiles: z.array(z.object({ path: z.string(), language: z.string(), contents: z.string() })),
  howToRun: z.string(),
  coverage: z.array(z.object({ criterionId: z.string(), met: z.boolean(), where: z.string() })),
});
export type Patch = z.infer<typeof patchSchema>;

export type EditFailure = { index: number; path: string; reason: "파일 없음" | "못 찾음" | "여러 번 나옴" | "빈 find"; hits: number; find: string };

const countOf = (hay: string, needle: string) => { let n = 0, i = 0; while ((i = hay.indexOf(needle, i)) !== -1) { n++; i += needle.length; } return n; };
const lf = (s: string) => s.replace(/\r\n/g, "\n");

/**
 * 조각을 지난 파일에 붙인다. 하나라도 안 맞으면 그 조각은 **안 붙이고** 실패로 돌려준다(어림으로 붙이지 않는다 —
 * 엉뚱한 자리를 고치는 것이 안 고치는 것보다 나쁘다). 줄바꿈(CRLF/LF) 차이만은 같은 것으로 친다.
 */
export function applyEdits(files: SourceFile[], edits: Patch["edits"]): { files: SourceFile[]; failures: EditFailure[]; changedLines: number; totalLines: number } {
  const out = files.map((f) => ({ ...f }));
  const failures: EditFailure[] = [];
  let changedLines = 0;
  edits.forEach((e, index) => {
    const f = out.find((x) => x.path === e.path);
    const fail = (reason: EditFailure["reason"], hits: number) => failures.push({ index, path: e.path, reason, hits, find: e.find.slice(0, 200) });
    if (!f) return fail("파일 없음", 0);
    if (!e.find.trim()) return fail("빈 find", 0);
    let body = f.contents, find = e.find, replace = e.replace;
    let hits = countOf(body, find);
    if (hits === 0 && (body.includes("\r\n") || find.includes("\r\n"))) { body = lf(body); find = lf(find); replace = lf(replace); hits = countOf(body, find); }
    if (hits === 0) return fail("못 찾음", 0);
    if (hits > 1) return fail("여러 번 나옴", hits);
    f.contents = body.replace(find, () => replace);
    changedLines += Math.max(find.split("\n").length, replace.split("\n").length);
  });
  const totalLines = files.reduce((n, f) => n + f.contents.split("\n").length, 0);
  return { files: out, failures, changedLines, totalLines };
}

export const PATCH_SYSTEM =
  "너는 이 회사의 개발자다. **이미 있는 앱을 고치는 판이다. 새로 만들지 마라.**\n\n" +
  "- 출력은 파일이 아니라 **조각**이다. `edits` 의 각 항목: `path`(지난 파일 경로 그대로) · `find`(그 파일에 **정확히 한 번** 나오는 원문을 글자 그대로 — 공백·들여쓰기까지. " +
  "한 번만 나오게 앞뒤 줄을 넉넉히 포함한다) · `replace`(그 자리에 들어갈 글) · `why`(한 줄).\n" +
  "- **사람이 말한 고장만 고친다.** 그 고장과 무관한 줄은 한 글자도 바꾸지 마라 — 이름 바꾸기·정리·주석 손질·스타일 통일·'겸사겸사' 개선 전부 금지. " +
  "사람은 지난 판에서 마음에 든 것이 그대로이길 바란다. 바뀌면 그것이 새 고장이다.\n" +
  "- 디버그 화면·로그 내보내기·검증 도구·시험 표 같은 **부탁받지 않은 기능을 더하지 마라.**\n" +
  "- `newFiles` 는 주문이 정말 새 파일을 요구할 때만. 고장을 고치는 판이면 빈 배열이다. **지난 파일을 새 이름으로 다시 내지 마라.**\n" +
  "- 먼저 코드에서 원인을 찾아라. 증상(예: '오른쪽을 눌렀는데 왼쪽으로 간다')에서 원인 줄(예: 오른쪽 벡터의 부호)까지 따라간 뒤 그 줄만 고친다.\n" +
  "- `howToRun` 은 지난 판과 같은 파일 이름 기준으로 적는다.\n" +
  "- **못 지킨 기준은 `met: false` 로 적는다.**";

export function patchInput(o: { title: string; ask: string; criteria: { id: string; when: string; then: string }[]; failedChecks: string[]; full: SourceFile[]; rest: SourceFile[] }): string {
  return (
    `무엇: ${o.title}\n\n## 사람이 한 말 (이것만 고친다)\n${o.ask}\n\n` +
    (o.failedChecks.length ? `## 유니티 시험에서 떨어진 줄\n${o.failedChecks.map((f) => `- ${f}`).join("\n")}\n\n` : "") +
    `## 기준\n${o.criteria.map((c) => `- [${c.id}] ${c.when} → ${c.then}`).join("\n")}\n\n` +
    "## 지난 판의 파일 — 이 위에서 조각으로 고친다\n" +
    o.full.map((f) => `--- ${f.path} (${f.language})\n${f.contents}`).join("\n\n") +
    (o.rest.length ? "\n\n## 손대지 않는 파일 (내용은 안 보인다 — 고칠 수 없다)\n" + o.rest.map((f) => `- ${f.path} (${Math.round(f.contents.length / 1024)} KB)`).join("\n") : "")
  );
}

/**
 * 조각을 받아 붙인다. 안 맞는 조각이 있으면 **한 번** 되묻는다(무엇이 왜 안 맞았는지 대 준다).
 * 그래도 남으면 `ok: false` — 부르는 쪽이 옛 방식으로 물러난다.
 */
export async function buildPatch(ai: AIProvider, o: Parameters<typeof patchInput>[0] & { unityRules?: string }): Promise<
  { ok: true; files: SourceFile[]; patch: Patch; changedLines: number; totalLines: number; asked: number } | { ok: false; failures: EditFailure[]; asked: number }
> {
  const all = [...o.full, ...o.rest];
  const input = patchInput(o);
  let extra = "";
  let last: EditFailure[] = [];
  for (let asked = 1; asked <= 2; asked++) {
    const { output } = await ai.generateStructuredOutput({
      systemInstructions: PATCH_SYSTEM + (o.unityRules ?? ""),
      input: input + extra,
      schema: patchSchema,
      schemaName: "app_patch",
      maxTokens: 32000,
      tier: "judgment",
    });
    const patch = output as Patch;
    // 지난 파일과 같은 경로를 newFiles 로 내면 그건 전체 다시 쓰기다 — 받지 않는다.
    const sneaky = patch.newFiles.filter((n) => all.some((f) => f.path === n.path));
    const r = applyEdits(all, patch.edits);
    const failures: EditFailure[] = [...r.failures, ...sneaky.map((n, i) => ({ index: -1 - i, path: n.path, reason: "여러 번 나옴" as const, hits: 0, find: "(지난 파일을 newFiles 로 통째로 다시 냈다 — edits 로 내라)" }))];
    if (failures.length === 0 && (patch.edits.length > 0 || patch.newFiles.length > 0)) {
      return { ok: true, files: [...r.files, ...patch.newFiles], patch, changedLines: r.changedLines, totalLines: r.totalLines, asked };
    }
    last = failures;
    extra =
      "\n\n## 방금 낸 조각이 안 붙었다 — 전부 다시 낸다\n" +
      (failures.length
        ? failures.map((f) => `- ${f.path}: ${f.reason}${f.hits > 1 ? `(${f.hits}번)` : ""} — find 앞머리: ${JSON.stringify(f.find.slice(0, 120))}`).join("\n")
        : "- 조각이 하나도 없었다. 고칠 자리를 찾아 edits 로 낸다.") +
      "\n`find` 는 위 파일에서 **글자 그대로 복사**한다(기억으로 쓰지 마라). 여러 번 나오면 앞뒤 줄을 더 포함해 한 번만 나오게 한다.";
  }
  return { ok: false, failures: last, asked: 2 };
}
